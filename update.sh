#!/bin/sh
# Run by qc-bot-update.timer on the VM.
set -e
cd "$(dirname "$0")"
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
git merge -q --ff-only origin/main
# ponytail: if npm ci fails after the merge, later runs see no change and skip it; rerun by hand.
npm ci --omit=dev --silent
sudo systemctl restart qc-bot
