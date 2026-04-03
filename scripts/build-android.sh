#!/usr/bin/env bash
# =============================================================================
# AICQ — Build Android APK (standalone)
# Builds the Android debug APK and copies it to the download directory.
#
# Prerequisites:
#   - Android SDK at /home/z/android-sdk (or set ANDROID_HOME)
#   - JDK 17+ (or set JAVA_HOME)
#   - Web client already built: aicq-web/dist/ exists
#   - Capacitor platforms synced
#
# Usage:
#   ./scripts/build-android.sh              # debug build
#   ./scripts/build-android.sh release      # release build (needs signing config)
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${PROJECT_ROOT}/download"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BUILD_TYPE="${1:-debug}"

# ---- Android SDK & Java configuration ----------------------------------------
export ANDROID_HOME="${ANDROID_HOME:-/home/z/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/34.0.0:${JAVA_HOME}/bin:${PATH}"

# Validate environment
if [ ! -d "${ANDROID_HOME}/platforms/android-34" ]; then
    echo "[ERROR] Android Platform 34 not found at ${ANDROID_HOME}/platforms/android-34"
    echo "  Install with: sdkmanager 'platforms;android-34'"
    exit 1
fi

if [ ! -d "${JAVA_HOME}" ]; then
    echo "[ERROR] JAVA_HOME not found: ${JAVA_HOME}"
    exit 1
fi

echo "============================================="
echo "  AICQ Android Build"
echo "============================================="
echo "  Build type : ${BUILD_TYPE}"
echo "  ANDROID_HOME: ${ANDROID_HOME}"
echo "  JAVA_HOME  : ${JAVA_HOME}"
echo "  Java       : $(java -version 2>&1 | head -1)"
echo "  Timestamp  : ${TIMESTAMP}"
echo "============================================="

# ---- Step 1: Build web client (if needed) -----------------------------------
if [ ! -d "${PROJECT_ROOT}/aicq-web/dist" ] || [ -z "$(ls -A "${PROJECT_ROOT}/aicq-web/dist" 2>/dev/null)" ]; then
    echo "[BUILD] Web client not built — building now..."
    cd "${PROJECT_ROOT}/aicq-web"
    npm run build
else
    echo "[BUILD] Web client already built, skipping."
fi

# ---- Step 2: Sync to Capacitor Android --------------------------------------
echo "[BUILD] Syncing to Capacitor Android..."
cd "${PROJECT_ROOT}/aicq-mobile"
npx cap sync android

# ---- Step 3: Run Gradle build -----------------------------------------------
echo "[BUILD] Running Gradle ${BUILD_TYPE} build..."
cd "${PROJECT_ROOT}/aicq-mobile/android"
chmod +x ./gradlew

if [ "${BUILD_TYPE}" = "release" ]; then
    # Release build — requires signing configuration in app/build.gradle
    ./gradlew assembleRelease --no-daemon
    APK_GLOB="app/build/outputs/apk/release/*.apk"
else
    ./gradlew assembleDebug --no-daemon
    APK_GLOB="app/build/outputs/apk/debug/*.apk"
fi

# ---- Step 4: Copy APK to download -------------------------------------------
mkdir -p "${DOWNLOAD_DIR}"

for APK_PATH in ${PROJECT_ROOT}/aicq-mobile/android/${APK_GLOB}; do
    if [ -f "${APK_PATH}" ]; then
        APK_NAME="$(basename "${APK_PATH}")"
        cp "${APK_PATH}" "${DOWNLOAD_DIR}/AICQ-${TIMESTAMP}-${APK_NAME}"
        cp "${APK_PATH}" "${DOWNLOAD_DIR}/AICQ-latest-${APK_NAME}"
        APK_SIZE="$(du -h "${APK_PATH}" | cut -f1)"
        echo ""
        echo "============================================="
        echo "  BUILD SUCCESSFUL"
        echo "============================================="
        echo "  APK: ${APK_PATH}"
        echo "  Size: ${APK_SIZE}"
        echo "  Copied to: ${DOWNLOAD_DIR}/"
        echo "    -> AICQ-${TIMESTAMP}-${APK_NAME}"
        echo "    -> AICQ-latest-${APK_NAME}"
        echo "============================================="
    fi
done

# Verify output exists
if ! ls "${DOWNLOAD_DIR}"/AICQ-*debug*.apk 1>/dev/null 2>&1; then
    if ! ls "${DOWNLOAD_DIR}"/AICQ-*release*.apk 1>/dev/null 2>&1; then
        echo "[ERROR] No APK found in download directory. Build may have failed."
        exit 1
    fi
fi
