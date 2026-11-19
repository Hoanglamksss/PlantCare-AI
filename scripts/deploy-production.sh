#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
command -v flock >/dev/null 2>&1 || { echo 'Cần lệnh flock của util-linux để khóa lượt triển khai.' >&2; exit 1; }
mkdir -p .secrets/production
chmod 700 .secrets/production
exec 9>.secrets/production/deploy.lock
flock -n 9 || { echo 'Một lượt triển khai khác đang chạy.' >&2; exit 1; }
mode=${1:---build}
case "$mode" in --build|--pull) ;; *) echo 'Cách dùng: sh scripts/deploy-production.sh [--build|--pull]' >&2; exit 1 ;; esac
test -s .env.production || { echo 'Chạy prepare-production.sh và điền cấu hình trước.' >&2; exit 1; }
for name in postgres_password csrf_secret r2_access_key r2_secret_key origin.crt origin.key; do
  test -s ".secrets/production/$name" || { echo "Thiếu file .secrets/production/$name" >&2; exit 1; }
done
if grep -Eq 'example\.|ACCOUNT_ID' .env.production; then
  echo 'Hãy thay các giá trị mẫu trong .env.production.' >&2; exit 1
fi
test "$(grep -c '^APP_DOMAIN=' .env.production)" -eq 1 || { echo 'Cấu hình cần đúng một dòng APP_DOMAIN=hostname.' >&2; exit 1; }
domain=$(sed -n 's/^APP_DOMAIN=//p' .env.production)
test "${#domain}" -le 253 && printf '%s' "$domain" | grep -Eq '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' || { echo 'APP_DOMAIN phải là hostname, không kèm giao thức hoặc đường dẫn.' >&2; exit 1; }
export APP_DOMAIN="$domain"
# File-based Compose secrets retain host permissions. Keep the parent private
# and allow the designated Node/nginx users to read their mounted files.
chmod 444 .secrets/production/postgres_password .secrets/production/csrf_secret \
  .secrets/production/r2_access_key .secrets/production/r2_secret_key \
  .secrets/production/origin.crt .secrets/production/origin.key
compose() { docker compose --env-file .env.production -f compose.production.yaml "$@"; }
compose config -q
if [ "$mode" = --pull ]; then compose pull; else compose build; fi
compose run --rm --no-deps frontend nginx -t
compose up -d --wait --wait-timeout 120 postgres inference
mkdir -p backups
chmod 700 backups
backup_tmp=$(mktemp "backups/.plantcare-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.partial")
if ! compose exec -T postgres pg_dump -U plantcare -d plantcare -Fc > "$backup_tmp" || ! test -s "$backup_tmp"; then
  rm -f -- "$backup_tmp"
  echo 'Sao lưu thất bại. Chưa chạy migration.' >&2; exit 1
fi
mv -- "$backup_tmp" "${backup_tmp%.partial}.dump"
# Keep one completed migrate service, and start the app without replaying dependencies.
compose up --no-deps --force-recreate --exit-code-from migrate migrate
compose up -d --no-deps --wait --wait-timeout 120 backend frontend
compose ps
printf '%s\n' 'Đã chạy các dịch vụ và kiểm tra health local. Kiểm tra HTTPS qua Cloudflare và sao lưu ngoài VPS theo runbook trước khi bàn giao.'
