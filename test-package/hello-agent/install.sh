#!/bin/bash
# ─── Hello Agent - Test Package ───
echo "========================================="
echo "  Hello from Download Center!"
echo "  Package installed successfully."
echo "  Date: $(date)"
echo "  Host: $(hostname)"
echo "  User: $(whoami)"
echo "========================================="

# Create a marker file to prove it ran
MARKER_DIR="/opt/download-center-agent/installed/hello-agent"
mkdir -p "$MARKER_DIR"
echo "Installed at $(date)" > "$MARKER_DIR/installed.txt"
echo "✓ Marker written to $MARKER_DIR/installed.txt"
