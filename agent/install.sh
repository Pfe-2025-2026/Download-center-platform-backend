#!/bin/bash
# ─────────────────────────────────────────────────────────
# Download Center Agent — Installer
# Run this on your Linux Mint / Debian laptop once.
# It registers with the server and saves config for the agent daemon.
# ─────────────────────────────────────────────────────────
set -e

# ── Ensure running as root ──
if [ "$EUID" -ne 0 ]; then
  echo "→ Re-launching with sudo (root required to install packages)..."
  exec sudo bash "$0" "$@"
fi

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

# ── Ensure running as root ──
if [ "$EUID" -ne 0 ]; then
  exec sudo bash "$0" "$@"
fi

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

install_deb() {
  local deb_path="$1"
  local dc_id="$2"
  log "   Installing .deb with dpkg: $deb_path"
  if dpkg -i "$deb_path" >> "$LOG_FILE" 2>&1; then
    # Fix any missing dependencies automatically
    apt-get install -f -y >> "$LOG_FILE" 2>&1 || true
    log "   ✓ .deb installed successfully"
    report_status "$dc_id" "success"
  else
    log "   ✗ dpkg install failed"
    report_status "$dc_id" "failed" "dpkg -i exited with error"
  fi
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

  local download_url="$SERVER_URL/api/agents/download/$pkg_id/$version?apiKey=$API_KEY"
  local headers_file="$dest_dir/headers.tmp"
  local tmp_file="$dest_dir/download.tmp"

  if ! curl -sf -D "$headers_file" -o "$tmp_file" "$download_url"; then
    log "   ✗ Download failed"
    report_status "$dc_id" "failed" "Download failed — file not available on server"
    return
  fi

  # Detect original filename from Content-Disposition header
  local orig_filename
  orig_filename=$(grep -i 'content-disposition' "$headers_file" \
    | sed -E 's/.*filename="?([^"\r]+)"?.*/\1/' | tr -d '\r' | tr -d '\n')
  [ -z "$orig_filename" ] && orig_filename="${pkg_name}-${version}"
  rm -f "$headers_file"

  local file_ext="${orig_filename##*.}"
  local file_path="$dest_dir/$orig_filename"
  mv "$tmp_file" "$file_path"

  log "   ✓ Downloaded: $orig_filename"

  # Report: installing
  report_status "$dc_id" "installing"
  log "   Installing (detected type: .$file_ext)..."

  case "$file_ext" in
    deb)
      install_deb "$file_path" "$dc_id"
      ;;
    sh)
      log "   Running shell script..."
      chmod +x "$file_path"
      if bash "$file_path" >> "$LOG_FILE" 2>&1; then
        log "   ✓ Script completed successfully"
        report_status "$dc_id" "success"
      else
        log "   ✗ Script failed"
        report_status "$dc_id" "failed" "install script exited with error"
      fi
      ;;
    zip)
      if unzip -o -q "$file_path" -d "$dest_dir" 2>/dev/null; then
        log "   ✓ Extracted zip to $dest_dir"
      else
        log "   ✗ Failed to extract zip"
        report_status "$dc_id" "failed" "Failed to extract zip archive"
        return
      fi
      # Priority: install.sh > .deb inside zip > success as-is
      if [ -f "$dest_dir/install.sh" ]; then
        log "   Found install.sh inside zip, running..."
        chmod +x "$dest_dir/install.sh"
        if bash "$dest_dir/install.sh" >> "$LOG_FILE" 2>&1; then
          log "   ✓ install.sh completed successfully"
          report_status "$dc_id" "success"
        else
          log "   ✗ install.sh failed"
          report_status "$dc_id" "failed" "install.sh exited with error"
        fi
      else
        local deb_file
        deb_file=$(find "$dest_dir" -maxdepth 2 -name '*.deb' | head -1)
        if [ -n "$deb_file" ]; then
          log "   Found .deb inside zip: $(basename "$deb_file")"
          install_deb "$deb_file" "$dc_id"
        else
          log "   ✓ Package deployed (files extracted, no installer found)"
          report_status "$dc_id" "success"
        fi
      fi
      ;;
    *)
      # Unknown extension — probe with dpkg to see if it's really a .deb
      if dpkg -I "$file_path" &>/dev/null; then
        log "   File probed as .deb package"
        install_deb "$file_path" "$dc_id"
      else
        log "   ✓ Package deployed (unknown format, files kept in $dest_dir)"
        report_status "$dc_id" "success"
      fi
      ;;
  esac

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
User=root
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
