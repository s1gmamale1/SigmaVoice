#!/usr/bin/env bash
# SigmaVoice — one-line installer for macOS (Apple Silicon).
#
# Why this script exists:
#   SigmaVoice is not signed with an Apple Developer ID and is not notarised.
#   Drag-installing an un-notarised .app from a browser-downloaded DMG triggers
#   Gatekeeper's "Apple could not verify..." dialog.
#
#   `curl` does NOT register as a quarantine-aware download source on macOS, so
#   files it fetches are NOT tagged with `com.apple.quarantine` — and files
#   without that xattr skip Gatekeeper's first-launch check. Same trick Rust,
#   Homebrew, Docker and oh-my-zsh use for their `curl | bash` installers.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/s1gmamale1/SigmaVoice/main/scripts/install-macos.sh | bash
#
#   Or download first and inspect:
#   curl -fsSL https://raw.githubusercontent.com/s1gmamale1/SigmaVoice/main/scripts/install-macos.sh -o install-sigmavoice.sh
#   less install-sigmavoice.sh   # read it
#   bash install-sigmavoice.sh
#
#   Pin a specific version:
#   curl -fsSL .../install-macos.sh | bash -s v0.3.0
#
# After install, SigmaVoice runs in the menu-bar/tray. On first use macOS will
# ask for Microphone + Accessibility (paste) and — for push-to-talk — Input
# Monitoring, in System Settings → Privacy & Security.
#
# Exit codes:
#   0 ok · 1 generic · 2 wrong platform/arch · 3 GitHub API/network · 4 DMG download · 5 install/copy

set -euo pipefail

REPO="s1gmamale1/SigmaVoice"
APP_NAME="SigmaVoice"
INSTALL_DIR="/Applications"

# -- platform + arch gate -----------------------------------------------------

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "✗ This installer is macOS-only. Detected: $(uname -s)" >&2
  exit 2
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  echo "✗ Only Apple Silicon (arm64) is supported. Detected: $ARCH" >&2
  echo "  (macOS arm64 + Windows x64 are the supported targets; the Windows" >&2
  echo "   installer is tracked separately.)" >&2
  exit 2
fi

# -- pick release -------------------------------------------------------------

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "→ Resolving latest release from GitHub..."
  TAG="$(
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | grep '"tag_name"' \
      | head -1 \
      | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/'
  )" || {
    echo "✗ Failed to fetch latest release tag from GitHub API." >&2
    echo "  Possible cause: rate-limit (anonymous API quota is 60/hr/IP)." >&2
    echo "  Workaround: pass an explicit tag, e.g.:  curl ... | bash -s v0.3.0" >&2
    exit 3
  }
fi

if [[ -z "$TAG" ]]; then
  echo "✗ Could not determine a release tag." >&2
  exit 3
fi

# Strip a leading "v" to derive the version used in artefact filenames.
VERSION="${TAG#v}"
DMG_FILENAME="${APP_NAME}-${VERSION}-arm64.dmg"
DMG_URL="https://github.com/$REPO/releases/download/$TAG/$DMG_FILENAME"

echo "→ Target release: $TAG"
echo "→ DMG: $DMG_URL"

# -- download -----------------------------------------------------------------

WORK_DIR="$(mktemp -d -t sigmavoice-install)"
trap 'rm -rf "$WORK_DIR"' EXIT INT TERM

DMG_PATH="$WORK_DIR/$DMG_FILENAME"
echo "→ Downloading via curl (no quarantine attribute will be set)..."
if ! curl -fL --progress-bar "$DMG_URL" -o "$DMG_PATH"; then
  echo "✗ Download failed. URL may be wrong or the release may not have an arm64 DMG." >&2
  echo "  Browse https://github.com/$REPO/releases to confirm." >&2
  exit 4
fi

if [[ ! -s "$DMG_PATH" ]]; then
  echo "✗ Downloaded DMG is empty." >&2
  exit 4
fi
echo "→ Download complete ($(du -h "$DMG_PATH" | cut -f1))."

# Belt-and-braces: strip quarantine even though curl shouldn't set it.
xattr -d com.apple.quarantine "$DMG_PATH" 2>/dev/null || true

# -- quit any running instance ------------------------------------------------

if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  echo "→ A running $APP_NAME instance was found; asking it to quit..."
  osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    pgrep -x "$APP_NAME" >/dev/null 2>&1 || break
    sleep 1
  done
fi

# -- mount, copy, unmount -----------------------------------------------------

MOUNT_POINT="$WORK_DIR/mount"
mkdir -p "$MOUNT_POINT"
echo "→ Mounting DMG at $MOUNT_POINT..."
hdiutil attach -nobrowse -mountpoint "$MOUNT_POINT" -quiet "$DMG_PATH" >/dev/null

DETACH_GUARD() {
  hdiutil detach "$MOUNT_POINT" -quiet -force 2>/dev/null || true
}
trap 'DETACH_GUARD; rm -rf "$WORK_DIR"' EXIT INT TERM

if [[ ! -d "$MOUNT_POINT/$APP_NAME.app" ]]; then
  echo "✗ Mounted DMG does not contain $APP_NAME.app." >&2
  exit 4
fi

DEST="$INSTALL_DIR/$APP_NAME.app"
if [[ -e "$DEST" ]]; then
  echo "→ Replacing existing $DEST..."
  if ! rm -rf "$DEST" 2>/dev/null; then
    echo "→ /Applications is write-protected; falling back to sudo..."
    sudo rm -rf "$DEST" || { echo "✗ Could not remove existing $APP_NAME." >&2; exit 5; }
  fi
fi

echo "→ Copying $APP_NAME.app to $INSTALL_DIR..."
if ! cp -R "$MOUNT_POINT/$APP_NAME.app" "$INSTALL_DIR/" 2>/dev/null; then
  echo "→ /Applications is write-protected; falling back to sudo..."
  sudo cp -R "$MOUNT_POINT/$APP_NAME.app" "$INSTALL_DIR/" || {
    echo "✗ Copy failed." >&2
    exit 5
  }
fi

echo "→ Stripping any quarantine xattrs from the installed bundle..."
if ! xattr -cr "$DEST" 2>/dev/null; then
  sudo xattr -cr "$DEST" 2>/dev/null || true
fi

DETACH_GUARD

# -- launch -------------------------------------------------------------------

echo ""
echo "✓ $APP_NAME $TAG installed to $DEST"
echo "  Runs in the menu bar. First use prompts for Microphone + Accessibility"
echo "  (+ Input Monitoring for push-to-talk) in System Settings → Privacy & Security."
echo ""

if [[ -t 0 ]]; then
  read -r -p "Launch $APP_NAME now? [Y/n] " REPLY
  if [[ ! "$REPLY" =~ ^[Nn] ]]; then
    open "$DEST"
  else
    echo "Launch later with:  open $DEST"
  fi
else
  echo "Launch with:  open $DEST"
fi
