#!/usr/bin/env bash
# =============================================================================
# AICQ — One-Click Release Script
# Builds all platforms, creates git tag, publishes GitHub Release with artifacts.
#
# Usage:
#   ./scripts/release.sh                    # Full build + publish
#   ./scripts/release.sh --skip-build       # Skip build, only publish
#   ./scripts/release.sh --dry-run          # Preview mode, no upload
#   ./scripts/release.sh --version 1.1.0    # Override version
#
# Environment:
#   GITHUB_TOKEN  - GitHub personal access token
#   ANDROID_HOME  - Android SDK path
#   JAVA_HOME     - Java JDK path
# =============================================================================
set -euo pipefail

# ---- Configuration -----------------------------------------------------------
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${PROJECT_ROOT}/download"
GITHUB_REPO="ctz168/aicq"
GITHUB_TOKEN="${GITHUB_TOKEN:-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}"

# Read version from package.json
VERSION="${1:-}"
SKIP_BUILD=false
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=true ;;
        --dry-run)    DRY_RUN=true ;;
        --version=*)  VERSION="${arg#*=}" ;;
        *)            VERSION="$arg" ;;
    esac
done

if [ -z "$VERSION" ]; then
    VERSION=$(node -p "require('${PROJECT_ROOT}/package.json').version" 2>/dev/null || echo "1.0.0")
fi

TAG="v${VERSION}"

# Android SDK & Java
export ANDROID_HOME="${ANDROID_HOME:-/home/z/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/34.0.0:${JAVA_HOME}/bin:${PATH}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[RELEASE]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" && exit 1; }
step() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ---- Print config -----------------------------------------------------------
step "AICQ Release ${TAG}"
echo "  Version      : ${VERSION}"
echo "  Tag          : ${TAG}"
echo "  Skip Build   : ${SKIP_BUILD}"
echo "  Dry Run      : ${DRY_RUN}"
echo "  GitHub Repo  : ${GITHUB_REPO}"
echo "  Output Dir   : ${DOWNLOAD_DIR}"
echo "  ANDROID_HOME : ${ANDROID_HOME}"
echo "  JAVA_HOME    : ${JAVA_HOME}"
echo ""

if $DRY_RUN; then
    warn "=== DRY RUN MODE — No files will be uploaded ==="
fi

# ---- Step 1: Build ----------------------------------------------------------
if ! $SKIP_BUILD; then
    step "Step 1/4: Building all platforms"

    # 1a. Build Web
    log "Building web client..."
    cd "${PROJECT_ROOT}/aicq-web"
    npm install --silent 2>/dev/null
    npm run build
    log "Web build complete"

    # 1b. Build Linux Desktop
    log "Building Linux AppImage..."
    cd "${PROJECT_ROOT}/aicq-app"
    if [ -d "node_modules" ]; then
        npx electron-builder --linux 2>&1 | tail -5 || warn "Linux build had issues"
    else
        warn "Electron deps not installed, skipping desktop build"
    fi

    # 1c. Build Android APK
    log "Building Android APK..."
    cd "${PROJECT_ROOT}/aicq-mobile"
    if [ -d "android" ] && [ -x "android/gradlew" ]; then
        npx cap sync android 2>/dev/null || warn "Capacitor sync warnings"
        cd android
        chmod +x ./gradlew
        ./gradlew assembleDebug --no-daemon 2>&1 | tail -5 || warn "Android build had issues"
        cd "${PROJECT_ROOT}/aicq-mobile"
    else
        warn "Android project not found, skipping"
    fi

    log "Build step complete"
else
    step "Step 1/4: Build skipped (--skip-build)"
fi

# ---- Step 2: Collect artifacts ----------------------------------------------
step "Step 2/4: Collecting artifacts"
mkdir -p "${DOWNLOAD_DIR}"
ARTIFACTS=()

# Web client
WEB_DIST="${PROJECT_ROOT}/aicq-web/dist"
if [ -d "$WEB_DIST" ]; then
    zip -r "${DOWNLOAD_DIR}/AICQ-${VERSION}-web.zip" "$WEB_DIST" -x "*.git*"
    ARTIFACTS+=("${DOWNLOAD_DIR}/AICQ-${VERSION}-web.zip")
    log "Web client packaged"
fi

# Linux AppImage
APPIMAGE=$(find "${PROJECT_ROOT}/dist-electron" -name "AICQ-*.AppImage" 2>/dev/null | head -1)
if [ -n "$APPIMAGE" ] && [ -f "$APPIMAGE" ]; then
    cp "$APPIMAGE" "${DOWNLOAD_DIR}/AICQ-${VERSION}-linux.AppImage"
    ARTIFACTS+=("${DOWNLOAD_DIR}/AICQ-${VERSION}-linux.AppImage")
    log "Linux AppImage: $(du -h "$APPIMAGE" | cut -f1)"
fi

# Windows ZIP
if [ -d "${PROJECT_ROOT}/dist-electron/win-unpacked" ]; then
    cd "${PROJECT_ROOT}/dist-electron/win-unpacked"
    zip -rq "${DOWNLOAD_DIR}/AICQ-${VERSION}-windows-x64.zip" . -x "*.git*"
    cd "${PROJECT_ROOT}"
    ARTIFACTS+=("${DOWNLOAD_DIR}/AICQ-${VERSION}-windows-x64.zip")
    log "Windows ZIP created"
fi
# Fallback: use pre-built zip
WIN_ZIP="${PROJECT_ROOT}/dist-electron/AICQ-${VERSION}-windows-x64.zip"
if [ ! -f "${DOWNLOAD_DIR}/AICQ-${VERSION}-windows-x64.zip" ] && [ -f "$WIN_ZIP" ]; then
    cp "$WIN_ZIP" "${DOWNLOAD_DIR}/AICQ-${VERSION}-windows-x64.zip"
    ARTIFACTS+=("${DOWNLOAD_DIR}/AICQ-${VERSION}-windows-x64.zip")
    log "Windows ZIP copied from dist-electron"
fi

# Android APK
APK=$(find "${PROJECT_ROOT}/aicq-mobile/android/app/build/outputs/apk" -name "*.apk" 2>/dev/null | head -1)
if [ -n "$APK" ] && [ -f "$APK" ]; then
    cp "$APK" "${DOWNLOAD_DIR}/AICQ-${VERSION}-android.apk"
    ARTIFACTS+=("${DOWNLOAD_DIR}/AICQ-${VERSION}-android.apk")
    log "Android APK: $(du -h "$APK" | cut -f1)"
fi

log "Collected ${#ARTIFACTS[@]} artifact(s)"

# ---- Step 3: Generate checksums ---------------------------------------------
step "Step 3/4: Generating checksums"
CHECKSUM_FILE="${DOWNLOAD_DIR}/SHA256SUMS-${VERSION}.txt"
> "$CHECKSUM_FILE"
for ARTIFACT in "${ARTIFACTS[@]}"; do
    if [ -f "$ARTIFACT" ]; then
        SHA=$(sha256sum "$ARTIFACT" | awk '{print $1}')
        echo "${SHA}  $(basename "$ARTIFACT")" >> "$CHECKSUM_FILE"
    fi
done
if [ -s "$CHECKSUM_FILE" ]; then
    ARTIFACTS+=("$CHECKSUM_FILE")
    log "Checksums written to ${CHECKSUM_FILE}"
    cat "$CHECKSUM_FILE"
fi

# ---- Step 4: Publish to GitHub ---------------------------------------------
step "Step 4/4: Publishing to GitHub"

if $DRY_RUN; then
    warn "DRY RUN: Would create release ${TAG} with ${#ARTIFACTS[@]} artifacts"
    for a in "${ARTIFACTS[@]}"; do echo "  - $(basename "$a")"; done
    echo ""
    log "Dry run complete. No changes made."
    exit 0
fi

# Create tag
cd "${PROJECT_ROOT}"
git tag -a "${TAG}" -m "Release ${TAG}" 2>/dev/null || warn "Tag ${TAG} already exists"
git push origin "${TAG}" 2>/dev/null || warn "Tag push failed (may already exist)"

# Create GitHub Release via API
log "Creating GitHub Release ${TAG}..."
RELEASE_PAYLOAD=$(cat <<EOF
{
    "tag_name": "${TAG}",
    "name": "AICQ ${TAG}",
    "body": "## AICQ ${TAG}\n\n### Downloads\n\n| Platform | File | Size |\n|----------|------|------|\n",
    "draft": false,
    "prerelease": false
}
EOF
)

# Build release body with artifact info
RELEASE_BODY="## AICQ ${TAG}\n\n### Downloads\n\n| Platform | File |\n|----------|------|\n"
for ARTIFACT in "${ARTIFACTS[@]}"; do
    if [ -f "$ARTIFACT" ] && [[ ! "$ARTIFACT"" == *"SHA256SUMS"* ]]; then
        SIZE=$(du -h "$ARTIFACT" | cut -f1)
        RELEASE_BODY+="| $(basename "$ARTIFACT") | ${SIZE} |\n"
    fi
done
RELEASE_BODY+="\n### Features\n\n- End-to-end encrypted chat (Ed25519 + X25519 + AES-256-GCM)\n"
RELEASE_BODY+="- AI↔AI, Human↔Human, Human↔AI communication\n"
RELEASE_BODY+="- File transfer with breakpoint resume\n"
RELEASE_BODY+="- Streaming message support\n"
RELEASE_BODY+="- Image and video sharing\n"
RELEASE_BODY+="- Cross-platform: Linux, Windows, Android, iOS, macOS\n"

RELEASE_PAYLOAD=$(jq -n \
    --arg tag "$TAG" \
    --arg name "AICQ ${TAG}" \
    --arg body "$RELEASE_BODY" \
    '{tag_name: $tag, name: $name, body: $body, draft: false, prerelease: false}')

# Create release
RELEASE_RESPONSE=$(curl -s -X POST \
    "https://api.github.com/repos/${GITHUB_REPO}/releases" \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$RELEASE_PAYLOAD")

RELEASE_ID=$(echo "$RELEASE_RESPONSE" | jq -r '.id // empty')
UPLOAD_URL=$(echo "$RELEASE_RESPONSE" | jq -r '.upload_url // empty' | sed 's/{?name,label}//')

if [ -z "$RELEASE_ID" ] || [ "$RELEASE_ID" = "null" ]; then
    # Check if release already exists
    EXISTING=$(curl -s "https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${TAG}" \
        -H "Authorization: token ${GITHUB_TOKEN}")
    RELEASE_ID=$(echo "$EXISTING" | jq -r '.id // empty')
    UPLOAD_URL=$(echo "$EXISTING" | jq -r '.upload_url // empty' | sed 's/{?name,label}//')
    if [ -n "$RELEASE_ID" ] && [ "$RELEASE_ID" != "null" ]; then
        log "Release ${TAG} already exists (ID: ${RELEASE_ID}), uploading assets..."
    else
        err "Failed to create release. Response: $(echo "$RELEASE_RESPONSE" | head -5)"
    fi
else
    log "Release created: ID=${RELEASE_ID}"
fi

# Upload artifacts
if [ -n "$UPLOAD_URL" ]; then
    for ARTIFACT in "${ARTIFACTS[@]}"; do
        if [ -f "$ARTIFACT" ]; then
            FILENAME=$(basename "$ARTIFACT")
            log "Uploading ${FILENAME}..."
            UPLOAD_RESULT=$(curl -s -X POST \
                "${UPLOAD_URL}?name=${FILENAME}" \
                -H "Authorization: token ${GITHUB_TOKEN}" \
                -H "Content-Type: application/octet-stream" \
                --data-binary "@${ARTIFACT}")
            UPLOAD_STATE=$(echo "$UPLOAD_RESULT" | jq -r '.state // "unknown"')
            if [ "$UPLOAD_STATE" = "uploaded" ]; then
                log "  ✓ ${FILENAME} uploaded"
            else
                warn "  ✗ ${FILENAME} upload state: ${UPLOAD_STATE}"
            fi
        fi
    done
fi

# ---- Summary ----------------------------------------------------------------
step "Release Complete!"
echo ""
echo "  Tag:     ${TAG}"
echo "  Repo:    https://github.com/${GITHUB_REPO}"
echo "  Release: https://github.com/${GITHUB_REPO}/releases/tag/${TAG}"
echo ""
echo "  Artifacts:"
for a in "${ARTIFACTS[@]}"; do
    if [ -f "$a" ]; then
        echo "    ✓ $(basename "$a") ($(du -h "$a" | cut -f1))"
    fi
done
echo ""
log "Done!"
