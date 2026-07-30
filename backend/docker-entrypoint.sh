#!/bin/sh
set -eu

./node_modules/.bin/drizzle-kit migrate
exec node dist/index.js
