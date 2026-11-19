#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
command -v openssl >/dev/null 2>&1 || { echo 'Cần cài OpenSSL để tạo khóa cấu hình.' >&2; exit 1; }
mkdir -p .secrets/production backups
chmod 700 .secrets/production backups
for name in postgres_password csrf_secret; do
  if [ ! -e ".secrets/production/$name" ]; then
    (set -C; openssl rand -hex 32 > ".secrets/production/$name")
  fi
done
# Docker file secrets keep source permissions. The private parent directory
# protects these files on the host while designated non-root containers can read them.
chmod 444 .secrets/production/postgres_password .secrets/production/csrf_secret
if [ ! -e .env.production ]; then
  (set -C; cat deploy/production.env.example > .env.production)
fi
printf '%s\n' 'Đã chuẩn bị cấu hình. Điền domain, R2 và bốn file r2_access_key, r2_secret_key, origin.crt, origin.key theo runbook. Không thay mật khẩu DB đã khởi tạo.'
