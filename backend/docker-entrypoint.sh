#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -r /run/secrets/postgres_password ]; then
  password=$(cat /run/secrets/postgres_password)
  case "$password" in
    ''|*[!0-9a-f]*) echo 'Invalid local database secret. Run the local setup script.' >&2; exit 1 ;;
  esac
  export DATABASE_URL="postgresql://plantcare:$password@postgres:5432/plantcare"
fi

if [ -z "${CSRF_SECRET:-}" ] && [ -r /run/secrets/csrf_secret ]; then
  export CSRF_SECRET="$(cat /run/secrets/csrf_secret)"
fi

exec "$@"
