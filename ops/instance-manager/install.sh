#!/usr/bin/env bash
# Install / upgrade the RideFlow Instance Manager on this server.
#   sudo bash ops/instance-manager/install.sh
# Idempotent: re-run after `git pull` to pick up new manager code.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VENV=/opt/rideflow/manager-venv
ENVF=/etc/rideflow-manager.env
PORT="${RFM_PORT:-7000}"

dpkg -s python3-venv >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq python3-venv >/dev/null; }
mkdir -p /opt/rideflow/instances /opt/rideflow/manager-data /etc/caddy/sites

[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$HERE/requirements.txt"

if [ ! -f "$ENVF" ]; then
  PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  cat > "$ENVF" <<EOF
RFM_USER=admin
RFM_PASSWORD=$PW
RFM_SECRET=$(openssl rand -hex 32)
RFM_SOURCE_DIR=$(cd "$HERE/../.." && pwd)
RFM_BASE_DOMAIN=gobellme.com
RFM_PUBLIC_IP=$(curl -s -m 5 https://api.ipify.org || hostname -I | awk '{print $1}')
EOF
  chmod 600 "$ENVF"
  echo "Created $ENVF — login: admin / $PW"
fi

cat > /etc/systemd/system/rideflow-manager.service <<EOF
[Unit]
Description=RideFlow Instance Manager
After=network-online.target docker.service

[Service]
EnvironmentFile=$ENVF
WorkingDirectory=$HERE
ExecStart=$VENV/bin/uvicorn app:app --host 0.0.0.0 --port $PORT --proxy-headers
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now rideflow-manager >/dev/null
systemctl restart rideflow-manager
sleep 2
systemctl is-active rideflow-manager
echo "Manager listening on :$PORT"
