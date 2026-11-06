#!/bin/sh
# Run by qc-bot-update.timer on the VM.
set -e
cd "$(dirname "$0")"
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
git merge -q --ff-only origin/main
npm ci --omit=dev --silent
sudo systemctl restart qc-bot
