#!/usr/bin/env bash
# =============================================================================
# AICQ — Build All Clients
# Builds web, Android APK, desktop (Linux/Windows), and prepares macOS config.
# Output artifacts are copied to /home/z/my-project/aicq/download/
# =============================================================================
set -euo pipefail

# ---- Configuration -----------------------------------------------------------
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${PROJECT_ROOT}/download"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# Android SDK & Java
export ANDROID_HOME="${ANDROID_HOME:-/home/z/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/34.0.0:${JAVA_HOME}/bin:${PATH}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[BUILD]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }
step() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  STEP: $*${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ---- Prepare output directory ------------------------------------------------
mkdir -p "${DOWNLOAD_DIR}"
log "Output directory: ${DOWNLOAD_DIR}"
log "Timestamp: ${TIMESTAMP}"

# ---- Step 1: Build Web Client -----------------------------------------------
step "Building web client"
cd "${PROJECT_ROOT}/aicq-web"
if command -v npm &>/dev/null; then
    npm run build
    log "Web build complete: aicq-web/dist/"
else
    err "npm not found — skipping web build"
fi

# ---- Step 2: Sync to Capacitor platforms ------------------------------------
step "Syncing web assets to Capacitor platforms"
cd "${PROJECT_ROOT}/aicq-mobile"
if [ -d "android" ]; then
    npx cap sync android 2>/dev/null || warn "Capacitor sync for Android had warnings (non-fatal)"
    log "Android platform synced"
fi
if [ -d "ios" ]; then
    npx cap sync ios 2>/dev/null || warn "Capacitor sync for iOS had warnings (non-fatal)"
    log "iOS platform synced"
fi

# ---- Step 3: Build Android APK ----------------------------------------------
step "Building Android APK (debug)"
cd "${PROJECT_ROOT}/aicq-mobile/android"
if [ -x "./gradlew" ]; then
    chmod +x ./gradlew
    ./gradlew assembleDebug --no-daemon 2>&1 | tail -20
    APK_PATH="${PROJECT_ROOT}/aicq-mobile/android/app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "${APK_PATH}" ]; then
        cp "${APK_PATH}" "${DOWNLOAD_DIR}/AICQ-${TIMESTAMP}-debug.apk"
        cp "${APK_PATH}" "${DOWNLOAD_DIR}/AICQ-latest-debug.apk"
        log "Android APK copied to download/"
    else
        warn "APK not found at expected path: ${APK_PATH}"
    fi
else
    warn "gradlew not found — skipping Android build"
fi

# ---- Step 4: Build Desktop (Electron) ---------------------------------------
step "Building Electron desktop app for current platform"
cd "${PROJECT_ROOT}/aicq-app"
if [ -f "package.json" ]; then
    # Install deps if needed
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    npx electron-builder --linux --win 2>&1 | tail -30 || warn "Desktop build had issues (non-fatal)"
    log "Desktop build attempted"
else
    warn "aicq-app/package.json not found — skipping desktop build"
fi

# ---- Step 5: Collect Linux AppImage -----------------------------------------
step "Collecting Linux AppImage"
APPIMAGE_PATH="${PROJECT_ROOT}/dist-electron/AICQ-1.0.0.AppImage"
if [ -f "${APPIMAGE_PATH}" ]; then
    cp "${APPIMAGE_PATH}" "${DOWNLOAD_DIR}/AICQ-1.0.0-linux.AppImage"
    log "Linux AppImage copied"
else
    warn "AppImage not found at ${APPIMAGE_PATH}"
fi

# ---- Step 6: Create Windows ZIP ---------------------------------------------
step "Creating Windows ZIP archive"
WIN_UNPACKED="${PROJECT_ROOT}/dist-electron/win-unpacked"
if [ -d "${WIN_UNPACKED}" ]; then
    cd "${WIN_UNPACKED}"
    zip -r "${DOWNLOAD_DIR}/AICQ-1.0.0-windows-x64.zip" . -x "*.git*" 2>/dev/null
    log "Windows ZIP created"
else
    # Try to copy pre-built zip
    WIN_ZIP="${PROJECT_ROOT}/dist-electron/AICQ-1.0.0-windows-x64.zip"
    if [ -f "${WIN_ZIP}" ]; then
        cp "${WIN_ZIP}" "${DOWNLOAD_DIR}/AICQ-1.0.0-windows-x64.zip"
        log "Windows ZIP copied from dist-electron"
    else
        warn "Windows build not found"
    fi
fi

# ---- Step 7: Prepare macOS DMG build config ---------------------------------
step "Preparing macOS DMG build instructions"
if [ "$(uname)" = "Darwin" ]; then
    cd "${PROJECT_ROOT}/aicq-app"
    npx electron-builder --mac --dmg 2>&1 | tail -20
    DMG_PATH="${PROJECT_ROOT}/dist-electron/AICQ-1.0.0.dmg"
    if [ -f "${DMG_PATH}" ]; then
        cp "${DMG_PATH}" "${DOWNLOAD_DIR}/AICQ-1.0.0-mac.dmg"
        log "macOS DMG built and copied"
    fi
else
    warn "Not running on macOS — DMG build skipped"
    warn "To build macOS DMG: run 'scripts/build-desktop.sh' on a Mac"
fi

# ---- Step 8: Archive Android project ----------------------------------------
step "Archiving Android project source"
cd "${PROJECT_ROOT}"
zip -r "${DOWNLOAD_DIR}/AICQ-android-project.zip" \
    aicq-mobile/android \
    -x "*.gradle/*" \
    -x "*build/*" \
    -x "*.git*" \
    -x "*node_modules*" \
    -x "*.class" \
    2>/dev/null
log "Android project archived"

# ---- Summary ----------------------------------------------------------------
step "Build Complete"
echo ""
log "All artifacts are in: ${DOWNLOAD_DIR}/"
echo ""
echo "Artifacts:"
ls -lh "${DOWNLOAD_DIR}"/AICQ* 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
echo ""
log "Done!"
