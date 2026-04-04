#!/usr/bin/env bash
# =============================================================================
# AICQ — Build Desktop (Electron)
# Builds the Electron desktop wrapper for the current platform.
#
# Supported platforms: Linux (AppImage), Windows (NSIS+ZIP), macOS (DMG)
#
# Usage:
#   ./scripts/build-desktop.sh              # build for current platform
#   ./scripts/build-desktop.sh linux        # Linux AppImage
#   ./scripts/build-desktop.sh win          # Windows NSIS installer + ZIP
#   ./scripts/build-desktop.sh mac          # macOS DMG (must run on macOS)
#   ./scripts/build-desktop.sh all          # build all platforms
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${PROJECT_ROOT}/download"
DIST_DIR="${PROJECT_ROOT}/dist-electron"
PLATFORM="${1:-auto}"

# Auto-detect platform if not specified
if [ "${PLATFORM}" = "auto" ]; then
    case "$(uname -s)" in
        Linux*)     PLATFORM="linux" ;;
        Darwin*)    PLATFORM="mac" ;;
        MINGW*|MSYS*|CYGWIN*) PLATFORM="win" ;;
        *)          PLATFORM="linux" ;;
    esac
fi

echo "============================================="
echo "  AICQ Desktop Build"
echo "============================================="
echo "  Platform   : ${PLATFORM}"
echo "  OS         : $(uname -s)"
echo "  Node       : $(node --version 2>/dev/null || echo 'not found')"
echo "  Project    : ${PROJECT_ROOT}"
echo "============================================="

# ---- Step 1: Build web client (if needed) -----------------------------------
if [ ! -d "${PROJECT_ROOT}/client/web/dist" ] || [ -z "$(ls -A "${PROJECT_ROOT}/client/web/dist" 2>/dev/null)" ]; then
    echo "[BUILD] Web client not built — building now..."
    cd "${PROJECT_ROOT}/client/web"
    npm run build
else
    echo "[BUILD] Web client already built, skipping."
fi

# ---- Step 2: Install Electron deps (if needed) -----------------------------
cd "${PROJECT_ROOT}/client/desktop"
if [ ! -d "node_modules" ]; then
    echo "[BUILD] Installing Electron dependencies..."
    npm install
fi

# ---- Step 3: Build for specified platform(s) --------------------------------
mkdir -p "${DOWNLOAD_DIR}"

build_platform() {
    local plat="$1"
    echo ""
    echo "[BUILD] Building for ${plat}..."

    case "${plat}" in
        linux)
            npx electron-builder --linux --appimage 2>&1 | tail -20
            # Copy AppImage
            if ls "${DIST_DIR}"/AICQ-*.AppImage 1>/dev/null 2>&1; then
                cp "${DIST_DIR}"/AICQ-*.AppImage "${DOWNLOAD_DIR}/AICQ-1.0.0-linux.AppImage"
                echo "[OK] Linux AppImage -> ${DOWNLOAD_DIR}/AICQ-1.0.0-linux.AppImage"
            else
                echo "[WARN] No AppImage found in ${DIST_DIR}"
            fi
            ;;
        win)
            npx electron-builder --win --x64 2>&1 | tail -20
            # Copy NSIS installer if exists
            if ls "${DIST_DIR}"/AICQ-Setup-*.exe 1>/dev/null 2>&1; then
                cp "${DIST_DIR}"/AICQ-Setup-*.exe "${DOWNLOAD_DIR}/AICQ-1.0.0-windows-setup.exe"
                echo "[OK] Windows Setup -> ${DOWNLOAD_DIR}/AICQ-1.0.0-windows-setup.exe"
            fi
            # Always create ZIP from win-unpacked
            if [ -d "${DIST_DIR}/win-unpacked" ]; then
                cd "${DIST_DIR}/win-unpacked"
                rm -f "${DOWNLOAD_DIR}/AICQ-1.0.0-windows-x64.zip"
                zip -r "${DOWNLOAD_DIR}/AICQ-1.0.0-windows-x64.zip" . -x "*.git*"
                echo "[OK] Windows ZIP -> ${DOWNLOAD_DIR}/AICQ-1.0.0-windows-x64.zip"
            fi
            ;;
        mac)
            if [ "$(uname -s)" != "Darwin" ]; then
                echo "[WARN] macOS builds must be run on a Mac. Skipping."
                echo "  On macOS, run: cd client/desktop && npx electron-builder --mac --dmg"
                return 0
            fi
            npx electron-builder --mac --dmg 2>&1 | tail -20
            if ls "${DIST_DIR}"/AICQ-*.dmg 1>/dev/null 2>&1; then
                cp "${DIST_DIR}"/AICQ-*.dmg "${DOWNLOAD_DIR}/AICQ-1.0.0-mac.dmg"
                echo "[OK] macOS DMG -> ${DOWNLOAD_DIR}/AICQ-1.0.0-mac.dmg"
            fi
            ;;
        *)
            echo "[ERROR] Unknown platform: ${plat}"
            ;;
    esac
}

if [ "${PLATFORM}" = "all" ]; then
    build_platform linux
    build_platform win
    build_platform mac
else
    build_platform "${PLATFORM}"
fi

# ---- Summary ----------------------------------------------------------------
echo ""
echo "============================================="
echo "  BUILD COMPLETE"
echo "============================================="
echo ""
echo "Artifacts in ${DOWNLOAD_DIR}/:"
ls -lh "${DOWNLOAD_DIR}"/AICQ-1.0.0* 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}' || echo "  (none)"
echo ""
echo "============================================="
