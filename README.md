# QC Discord Bot

Announces new Quebec WCA competitions in the QC Discord. Behavior: [SPEC.md](SPEC.md).

```sh
npm install
npm test
node bot.js print FMCaMontreal2026   # preview, no Discord
node bot.js check 24 | systemd-cat -t qc-bot   # on the VM: repost last 24h, testing only
DISCORD_TOKEN=... ANNOUNCE_CHANNEL_ID=... npm start
```

## Discord setup
1. https://discord.com/developers/applications > New Application.
2. **Installation**: untick User Install, keep Guild Install. Install Link: None.
3. **Bot**: Reset Token, copy it (`DISCORD_TOKEN`, ~70 chars with two dots; not the OAuth2 Client Secret). Untick Public Bot. No privileged intents needed.
4. **OAuth2 > URL Generator**: scopes `bot`, `applications.commands`; permissions `Send Messages`, `Mention Everyone`. Nothing to save: open the Generated URL at the bottom and pick the server. Redirects and Public Client stay empty/off.
5. Discord settings > Advanced > Developer Mode, then right-click the announcement channel > Copy Channel ID (`ANNOUNCE_CHANNEL_ID`).

## GCP (e2-micro VM)
```sh
gcloud compute instances create qc-bot --machine-type e2-micro --zone us-east1-b \
  --image-family debian-12 --image-project debian-cloud \
  --boot-disk-type pd-standard --boot-disk-size 10GB
gcloud compute ssh qc-bot --zone us-east1-b
# on the VM
sudo apt-get install -y git curl && curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash - && sudo apt-get install -y nodejs
git clone https://github.com/AlexandreOndet/QC-Discord-Bot ~/qc-bot && cd ~/qc-bot && npm ci --omit=dev
printf 'DISCORD_TOKEN=...\nANNOUNCE_CHANNEL_ID=...\n' > .env && chmod 600 .env
sudo tee /etc/systemd/system/qc-bot.service <<EOF
[Service]
User=$USER
WorkingDirectory=$HOME/qc-bot
EnvironmentFile=$HOME/qc-bot/.env
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF
sudo tee /etc/systemd/system/qc-bot-update.service <<EOF
[Service]
Type=oneshot
User=$USER
ExecStart=$HOME/qc-bot/update.sh
EOF
sudo tee /etc/systemd/system/qc-bot-update.timer <<EOF
[Timer]
OnCalendar=*:0/5
[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now qc-bot qc-bot-update.timer && journalctl -u qc-bot -f
```
Pushes to `main` reach the VM within 5 minutes (`update.sh`; relies on passwordless sudo, the GCE default).
Free tier: one e2-micro in `us-east1`, `us-central1` or `us-west1`, up to 30 GB of `pd-standard` disk (the default disk type is billed). The external IPv4 address may be billed (about $3.65/month).
