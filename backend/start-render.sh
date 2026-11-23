#!/bin/sh
set -eu
cd /app
node dist/migrate.js
export PLANTCARE_EMBED_INFERENCE=1
exec node dist/server.js
