#!/bin/sh
set -eu
cd /app
node dist/migrate.js
exec node dist/server.js
