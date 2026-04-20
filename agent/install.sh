#!/bin/bash
# ─────────────────────────────────────────────────────────
# Download Center Agent — Installer
# Run this on your Linux Mint / Debian laptop once.
# It registers with the server and saves config for the agent daemon.
# ─────────────────────────────────────────────────────────
set -e

# ── Configuration ──
# Change SERVER_URL to the IP of the PC running the backend.
# To find it: on the server PC, run `ipconfig` (Windows) or `hostname -I` (Linux)
# and use the local IP (e.g. 192.168.1.xxx)
SERVER_URL="${DOWNLOAD_CENTER_SERVER:-http://192.168.1.XXX:3000}"

INSTALL_DIR="/opt/download-center-agent"
CONFIG_FILE="$INSTALL_DIR/agent.conf"
AGENT_SCRIPT="$INSTALL_DIR/agent.sh"
PACKAGES_DIR="$INSTALL_DIR/packages"
LOG_FILE="$INSTALL_DIR/agent.log"

echo "╔══════════════════════════════════════════╗"
echo "║   Download Center Agent — Installer      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check if server URL was changed
if echo "$SERVER_URL" | grep -q "XXX"; then
  echo "⚠  You need to set the server IP first!"
  echo ""
  echo "   Option 1: Edit this script and change 192.168.1.XXX"
  echo "   Option 2: Run with: DOWNLOAD_CENTER_SERVER=http://192.168.1.100:3000 bash install.sh"
  echo ""
  read -p "Enter the server IP (e.g. 192.168.1.100): " SERVER_IP
  SERVER_URL="http://${SERVER_IP}:3000"
fi

echo "→ Server: $SERVER_URL"
echo ""

# ── Check dependencies ──
for cmd in curl jq unzip; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Installing $cmd..."
    sudo apt-get update -qq && sudo apt-get install -y -qq "$cmd"
  fi
done

# ── Gather system info ──
HOSTNAME=$(hostname)
IP=$(hostname -I | awk '{print $1}')
OS=$(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')
ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)

echo "→ Hostname: $HOSTNAME"
echo "→ IP:       $IP"
echo "→ OS:       $OS"
echo "→ Arch:     $ARCH"
echo ""

# ── Register with server ──
echo "Registering agent with server..."
RESPONSE=$(curl -sf -X POST "$SERVER_URL/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostname\": \"$HOSTNAME\",
    \"ip\": \"$IP\",
    \"os\": \"$OS\",
    \"architecture\": \"$ARCH\"
  }")

if [ $? -ne 0 ]; then
  echo "✗ Failed to connect to server at $SERVER_URL"
  echo "  Make sure the backend is running and the IP is correct."
  exit 1
fi

CLIENT_ID=$(echo "$RESPONSE" | jq -r '.clientId')
API_KEY=$(echo "$RESPONSE" | jq -r '.apiKey')

echo "✓ Registered! Client ID: $CLIENT_ID"
echo ""

# ── Create install directory ──
sudo mkdir -p "$INSTALL_DIR" "$PACKAGES_DIR"
sudo chown -R "$USER:$USER" "$INSTALL_DIR"

# ── Save config ──
cat > "$CONFIG_FILE" <<EOF
# Download Center Agent Configuration
SERVER_URL=$SERVER_URL
CLIENT_ID=$CLIENT_ID
API_KEY=$API_KEY
HOSTNAME=$HOSTNAME
PACKAGES_DIR=$PACKAGES_DIR
POLL_INTERVAL=30
EOF

echo "✓ Config saved to $CONFIG_FILE"

# ── Copy agent daemon script ──
cat > "$AGENT_SCRIPT" <<'AGENT_EOF'
#!/bin/bash
# ─────────────────────────────────────────────────────────
# Download Center Agent — Daemon
# Polls the server for deployment tasks, downloads & installs packages.
# ─────────────────────────────────────────────────────────

CONFIG_FILE="/opt/download-center-agent/agent.conf"
LOG_FILE="/opt/download-center-agent/agent.log"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Config not found. Run install.sh first."
  exit 1
fi

source "$CONFIG_FILE"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

report_status() {
  local dc_id="$1"
  local status="$2"
  local error_msg="${3:-}"

  curl -sf -X POST "$SERVER_URL/api/agents/report" \
    -H "Content-Type: application/json" \
    -d "{
      \"apiKey\": \"$API_KEY\",
      \"deploymentClientId\": \"$dc_id\",
      \"status\": \"$status\",
      \"errorMessage\": \"$error_msg\"
    }" >/dev/null 2>&1
}

process_task() {
  local task="$1"
  local dc_id=$(echo "$task" | jq -r '.deploymentClientId')
  local pkg_id=$(echo "$task" | jq -r '.packageId')
  local pkg_name=$(echo "$task" | jq -r '.packageName')
  local version=$(echo "$task" | jq -r '.version')

  log "📦 New task: $pkg_name v$version"

  # Report: downloading
  report_status "$dc_id" "downloading"
  log "   Downloading..."

  local dest_dir="$PACKAGES_DIR/$pkg_name/$version"
  mkdir -p "$dest_dir"

  # Download the package file
  local download_url="$SERVER_URL/api/agents/download/$pkg_id/$version?apiKey=$API_KEY"
  local file_path="$dest_dir/$pkg_name-$version.zip"

  if ! curl -sf -o "$file_path" "$download_url"; then
    log "   ✗ Download failed"
    report_status "$dc_id" "failed" "Download failed — file not available on server"
    return
  fi

  log "   ✓ Downloaded to $file_path"

  # Report: installing
  report_status "$dc_id" "installing"
  log "   Installing..."

  # Unzip the package
  if unzip -o -q "$file_path" -d "$dest_dir" 2>/dev/null; then
    log "   ✓ Extracted to $dest_dir"
  else
    log "   (Not a zip file, kept as-is)"
  fi

  # Check if there's an install.sh inside
  if [ -f "$dest_dir/install.sh" ]; then
    log "   Running install.sh..."
    chmod +x "$dest_dir/install.sh"
    if bash "$dest_dir/install.sh" >> "$LOG_FILE" 2>&1; then
      log "   ✓ install.sh completed successfully"
      report_status "$dc_id" "success"
    else
      log "   ✗ install.sh failed"
      report_status "$dc_id" "failed" "install.sh exited with error"
    fi
  else
    # No install script — just downloading was the goal
    log "   ✓ Package deployed (no install.sh found, files extracted)"
    report_status "$dc_id" "success"
  fi

  log "   Done: $pkg_name v$version"
}

# ── Main loop ──
log "Agent started. Polling every ${POLL_INTERVAL}s..."
log "Server: $SERVER_URL"

while true; do
  # Send heartbeat and check for tasks
  RESPONSE=$(curl -sf -X POST "$SERVER_URL/api/agents/heartbeat" \
    -H "Content-Type: application/json" \
    -d "{\"apiKey\": \"$API_KEY\"}" 2>/dev/null)

  if [ $? -ne 0 ]; then
    log "⚠ Could not reach server, retrying in ${POLL_INTERVAL}s..."
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Check for pending tasks
  TASK_COUNT=$(echo "$RESPONSE" | jq '.tasks | length')

  if [ "$TASK_COUNT" -gt 0 ]; then
    log "Found $TASK_COUNT pending task(s)"
    for i in $(seq 0 $((TASK_COUNT - 1))); do
      TASK=$(echo "$RESPONSE" | jq ".tasks[$i]")
      process_task "$TASK"
    done
  fi

  sleep "$POLL_INTERVAL"
done
AGENT_EOF

chmod +x "$AGENT_SCRIPT"
echo "✓ Agent daemon script created"

# ── Create systemd service (optional, for auto-start) ──
SERVICE_FILE="/etc/systemd/system/download-center-agent.service"
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Download Center Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
ExecStart=/bin/bash $AGENT_SCRIPT
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Systemd service created"
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Installation complete!                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "To start the agent NOW (one-time):"
echo "   bash $AGENT_SCRIPT"
echo ""
echo "To start as a service (auto-starts on boot):"
echo "   sudo systemctl enable --now download-center-agent"
echo ""
echo "To check agent logs:"
echo "   tail -f $LOG_FILE"
echo ""
echo "To see status in the CRM:"
echo "   → Open http://${SERVER_URL#http://}/  → Clients page"
echo ""
