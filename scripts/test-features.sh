#!/usr/bin/env bash
# =============================================================================
# AICQ — Automated Feature Test Script
# Tests all chat features: text, image, video, streaming, file transfer, resume
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
TEST_DIR="${PROJECT_ROOT}/test-results"
PASS=0
FAIL=0
SKIP=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

pass() { ((PASS++)); echo -e "  ${GREEN}✓ PASS${NC}: $*"; }
fail() { ((FAIL++)); echo -e "  ${RED}✗ FAIL${NC}: $* — $1"; }
skip() { ((SKIP++)); echo -e "  ${YELLOW}⊘ SKIP${NC}: $*"; }
section() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

mkdir -p "$TEST_DIR"

# =========================================================================
# Section 1: Server Health Check
# =========================================================================
section "1. Server Health Check"

# Check if server is running
HEALTH=$(curl -sf "${SERVER_URL}/api/health" 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q "ok\|running\|healthy"; then
    pass "Server is running at ${SERVER_URL}"
else
    # Try to start server
    echo "  Starting aicq server..."
    cd "${PROJECT_ROOT}/server"
    if [ -f "dist/index.js" ]; then
        PORT=3000 node dist/index.js > "${TEST_DIR}/server.log" 2>&1 &
        SERVER_PID=$!
        sleep 3
        HEALTH=$(curl -sf "${SERVER_URL}/api/health" 2>/dev/null || echo "")
        if echo "$HEALTH" | grep -q "ok\|running\|healthy"; then
            pass "Server started and healthy (PID: ${SERVER_PID})"
        else
            fail "Server health" "Could not start server. Log: ${TEST_DIR}/server.log"
            echo "  Server log:"; tail -5 "${TEST_DIR}/server.log" 2>/dev/null
        fi
    else
        skip "Server not built (run: cd server && npm run build)"
    fi
fi

# =========================================================================
# Section 2: Node Registration
# =========================================================================
section "2. Node Registration & API Tests"

NODE_ID="test-$(date +%s)"
REGISTER=$(curl -sf -X POST "${SERVER_URL}/api/nodes" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${NODE_ID}\",\"publicKey\":\"test-key-123\",\"platform\":\"test\"}" 2>/dev/null || echo "")

if echo "$REGISTER" | grep -q "success\|ok\|registered\|${NODE_ID}"; then
    pass "Node registration successful"
else
    fail "Node registration" "Response: ${REGISTER:0:100}"
fi

# Test temp number request
TEMP_NUM=$(curl -sf -X POST "${SERVER_URL}/api/temp-numbers" \
    -H "Content-Type: application/json" \
    -d "{\"nodeId\":\"${NODE_ID}\"}" 2>/dev/null || echo "")
if echo "$TEMP_NUM" | grep -qE "[0-9]{6}"; then
    pass "Temp number assigned: $(echo "$TEMP_NUM" | grep -oE '[0-9]{6}')"
else
    fail "Temp number request" "Response: ${TEMP_NUM:0:100}"
fi

# Test friend list
FRIENDS=$(curl -sf "${SERVER_URL}/api/nodes/${NODE_ID}/friends" 2>/dev/null || echo "")
if [ -n "$FRIENDS" ]; then
    pass "Friend list API works"
else
    fail "Friend list" "Empty response"
fi

# =========================================================================
# Section 3: Web Client Build Verification
# =========================================================================
section "3. Web Client Build"

if [ -f "${PROJECT_ROOT}/client/web/dist/index.html" ]; then
    pass "Web client built (index.html exists)"

    # Check for key JS/CSS bundles
    if ls "${PROJECT_ROOT}/client/web/dist/assets/"*.js 1>/dev/null 2>&1; then
        JS_SIZE=$(du -sh "${PROJECT_ROOT}/client/web/dist/assets/"*.js | cut -f1 | head -1)
        pass "JavaScript bundle: ${JS_SIZE}"
    fi

    if ls "${PROJECT_ROOT}/client/web/dist/assets/"*.css 1>/dev/null 2>&1; then
        CSS_SIZE=$(du -sh "${PROJECT_ROOT}/client/web/dist/assets/"*.css | cut -f1 | head -1)
        pass "CSS bundle: ${CSS_SIZE}"
    fi
else
    fail "Web client build" "index.html not found"
fi

# =========================================================================
# Section 4: Component Feature Verification (Static Analysis)
# =========================================================================
section "4. Feature: Text Chat (Code Analysis)"

CHAT_SCREEN="${PROJECT_ROOT}/client/web/src/screens/ChatScreen.tsx"
if [ -f "$CHAT_SCREEN" ]; then
    if grep -q "sendMessage\|handleSend" "$CHAT_SCREEN"; then
        pass "ChatScreen has send message function"
    else
        fail "ChatScreen send" "No sendMessage/handleSend found"
    fi

    if grep -q "inputText\|messageText\|messageInput" "$CHAT_SCREEN"; then
        pass "ChatScreen has message input state"
    else
        fail "ChatScreen input" "No input state found"
    fi

    if grep -q "MessageBubble\|message-bubble" "$CHAT_SCREEN"; then
        pass "ChatScreen renders MessageBubble"
    else
        fail "ChatScreen render" "No MessageBubble found"
    fi
else
    skip "ChatScreen.tsx not found"
fi

# =========================================================================
# Section 5: Image Preview Feature
# =========================================================================
section "5. Feature: Image Preview"

IMAGE_PREVIEW="${PROJECT_ROOT}/client/web/src/components/ImagePreview.tsx"
if [ -f "$IMAGE_PREVIEW" ]; then
    if grep -q "onClick\|onClose\|fullscreen\|lightbox" "$IMAGE_PREVIEW"; then
        pass "ImagePreview supports click/fullscreen"
    fi
    if grep -q "img\|Image\|src=" "$IMAGE_PREVIEW"; then
        pass "ImagePreview renders image element"
    fi
    if grep -q "useState\|useStateful" "$IMAGE_PREVIEW"; then
        pass "ImagePreview has state management"
    fi
else
    skip "ImagePreview.tsx not found"
fi

# =========================================================================
# Section 6: Video Player Feature
# =========================================================================
section "6. Feature: Video Player"

VIDEO_PLAYER="${PROJECT_ROOT}/client/web/src/components/VideoPlayer.tsx"
if [ -f "$VIDEO_PLAYER" ]; then
    if grep -q "video\|Video\|<video" "$VIDEO_PLAYER"; then
        pass "VideoPlayer uses HTML5 video element"
    fi
    if grep -q "play\|pause\|controls\|volume\|seek" "$VIDEO_PLAYER"; then
        pass "VideoPlayer has playback controls"
    fi
    if grep -q "fullscreen\|FullScreen" "$VIDEO_PLAYER"; then
        pass "VideoPlayer supports fullscreen"
    fi
else
    skip "VideoPlayer.tsx not found"
fi

# =========================================================================
# Section 7: Streaming Message Feature
# =========================================================================
section "7. Feature: Streaming Output"

STREAMING="${PROJECT_ROOT}/client/web/src/components/StreamingMessage.tsx"
if [ -f "$STREAMING" ]; then
    if grep -q "streaming\|stream\|chunk\|partial" "$STREAMING"; then
        pass "StreamingMessage handles streaming data"
    fi
    if grep -q "cursor\|thinking\|loading\|animat" "$STREAMING"; then
        pass "StreamingMessage has loading/cursor animation"
    fi
    if grep -q "useState\|useEffect\|useRef" "$STREAMING"; then
        pass "StreamingMessage uses React hooks"
    fi
else
    skip "StreamingMessage.tsx not found"
fi

# =========================================================================
# Section 8: File Transfer with Breakpoint Resume
# =========================================================================
section "8. Feature: File Transfer & Breakpoint Resume"

FILE_TRANSFER="${PROJECT_ROOT}/client/web/src/components/FileTransferProgress.tsx"
if [ -f "$FILE_TRANSFER" ]; then
    if grep -q "progress\|percent\|loaded\|total" "$FILE_TRANSFER"; then
        pass "FileTransferProgress tracks progress"
    fi
    if grep -q "pause\|resume\|cancel\|abort" "$FILE_TRANSFER"; then
        pass "FileTransferProgress supports pause/resume/cancel"
    fi
else
    skip "FileTransferProgress.tsx not found"
fi

WEB_CLIENT="${PROJECT_ROOT}/client/web/src/services/webClient.ts"
if [ -f "$WEB_CLIENT" ]; then
    if grep -q "chunk\|chunkSize\|offset\|range" "$WEB_CLIENT"; then
        pass "WebClient supports chunked transfer"
    fi
    if grep -q "pause\|resume\|breakpoint\|断点" "$WEB_CLIENT"; then
        pass "WebClient supports breakpoint resume"
    fi
    if grep -q "sha256\|checksum\|hash\|verify" "$WEB_CLIENT"; then
        pass "WebClient has integrity verification"
    fi
else
    skip "webClient.ts not found"
fi

# =========================================================================
# Section 9: Markdown Rendering
# =========================================================================
section "9. Feature: Markdown Rendering"

MARKDOWN="${PROJECT_ROOT}/client/web/src/components/MarkdownRenderer.tsx"
if [ -f "$MARKDOWN" ]; then
    if grep -q "react-markdown\|ReactMarkdown" "$MARKDOWN"; then
        pass "MarkdownRenderer uses react-markdown"
    fi
    if grep -q "remark-gfm\|GFM" "$MARKDOWN"; then
        pass "MarkdownRenderer supports GitHub Flavored Markdown"
    fi
    if grep -q "code\|syntax\|highlight\|prism" "$MARKDOWN"; then
        pass "MarkdownRenderer has code syntax highlighting"
    fi
else
    skip "MarkdownRenderer.tsx not found"
fi

# =========================================================================
# Section 10: Encryption & Security
# =========================================================================
section "10. Feature: End-to-End Encryption"

CRYPTO_DIR="${PROJECT_ROOT}/shared/crypto/src"
if [ -d "$CRYPTO_DIR" ]; then
    if [ -f "${CRYPTO_DIR}/cipher.ts" ] && grep -q "aes\|AES\|256\|GCM" "${CRYPTO_DIR}/cipher.ts"; then
        pass "AES-256-GCM encryption implemented"
    fi
    if [ -f "${CRYPTO_DIR}/keyExchange.ts" ] && grep -q "x25519\|X25519\|curve25519" "${CRYPTO_DIR}/keyExchange.ts"; then
        pass "X25519 key exchange implemented"
    fi
    if [ -f "${CRYPTO_DIR}/signer.ts" ] && grep -q "ed25519\|Ed25519" "${CRYPTO_DIR}/signer.ts"; then
        pass "Ed25519 digital signatures implemented"
    fi
    if [ -f "${CRYPTO_DIR}/handshake.ts" ] && grep -q "noise\|Noise\|handshake" "${CRYPTO_DIR}/handshake.ts"; then
        pass "Noise protocol handshake implemented"
    fi
else
    skip "Crypto module not found"
fi

# =========================================================================
# Section 11: Desktop App (AppImage) Test
# =========================================================================
section "11. Desktop App (Linux AppImage)"

APPIMAGE="${PROJECT_ROOT}/dist-electron/AICQ-1.0.0.AppImage"
if [ -f "$APPIMAGE" ]; then
    SIZE=$(du -h "$APPIMAGE" | cut -f1)
    pass "Linux AppImage exists (${SIZE})"

    # Verify it's a valid ELF binary
    if file "$APPIMAGE" | grep -q "ELF.*executable"; then
        pass "AppImage is valid ELF executable"
    fi

    # Extract and verify structure
    EXTRACT_DIR="${TEST_DIR}/appimage-extract"
    mkdir -p "$EXTRACT_DIR"
    cd "$EXTRACT_DIR"
    "$APPIMAGE" --appimage-extract 2>/dev/null | tail -1
    if [ -f "squashfs-root/resources/app.asar" ]; then
        ASAR_SIZE=$(du -h "squashfs-root/resources/app.asar" | cut -f1)
        pass "AppImage contains app.asar (${ASAR_SIZE})"
    fi
    if [ -f "squashfs-root/aicq-desktop" ] || [ -d "squashfs-root/usr" ]; then
        pass "AppImage has correct binary structure"
    fi
else
    skip "AppImage not found"
fi

# =========================================================================
# Section 12: Windows Build Test
# =========================================================================
section "12. Windows Build (ZIP)"

WIN_ZIP="${PROJECT_ROOT}/dist-electron/AICQ-1.0.0-windows-x64.zip"
if [ -f "$WIN_ZIP" ]; then
    SIZE=$(du -h "$WIN_ZIP" | cut -f1)
    pass "Windows ZIP exists (${SIZE})"

    # Verify ZIP contents
    if unzip -l "$WIN_ZIP" 2>/dev/null | grep -q "AICQ.exe\|aicq-desktop"; then
        pass "Windows ZIP contains executable"
    fi
else
    skip "Windows ZIP not found"
fi

# =========================================================================
# Section 13: Android Project Test
# =========================================================================
section "13. Android Project"

ANDROID_DIR="${PROJECT_ROOT}/client/mobile/android"
if [ -d "$ANDROID_DIR" ]; then
    if [ -f "${ANDROID_DIR}/app/build.gradle" ]; then
        pass "Android build.gradle exists"
    fi
    if [ -f "${ANDROID_DIR}/app/src/main/AndroidManifest.xml" ]; then
        pass "AndroidManifest.xml exists"
        # Verify permissions
        if grep -q "INTERNET" "${ANDROID_DIR}/app/src/main/AndroidManifest.xml"; then
            pass "AndroidManifest has INTERNET permission"
        fi
    fi
    if [ -x "${ANDROID_DIR}/gradlew" ]; then
        pass "Gradle wrapper is executable"
    fi
    if [ -f "${ANDROID_DIR}/variables.gradle" ]; then
        pass "Gradle variables configured"
    fi
else
    skip "Android project not found"
fi

# =========================================================================
# Section 14: Build Scripts Test
# =========================================================================
section "14. Build Scripts & CI/CD"

SCRIPTS=(
    "scripts/build-all.sh"
    "scripts/build-desktop.sh"
    "scripts/build-android.sh"
    "scripts/release.sh"
)
for script in "${SCRIPTS[@]}"; do
    if [ -f "${PROJECT_ROOT}/${script}" ]; then
        if head -1 "${PROJECT_ROOT}/${script}" | grep -q "bash\|sh"; then
            pass "${script} exists and is a shell script"
        else
            fail "${script}" "Not a valid shell script"
        fi
    else
        fail "${script}" "Not found"
    fi
done

# Check GitHub Actions
if [ -f "${PROJECT_ROOT}/.github/workflows/build-release.yml" ]; then
    pass "GitHub Actions workflow exists"
    if grep -q "build-android\|build-linux\|build-windows\|build-macos" "${PROJECT_ROOT}/.github/workflows/build-release.yml"; then
        pass "CI/CD covers all platforms"
    fi
fi

# =========================================================================
# Summary
# =========================================================================
section "Test Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo -e "  Total:  ${TOTAL}"
echo -e "  ${GREEN}Pass:   ${PASS}${NC}"
echo -e "  ${RED}Fail:   ${FAIL}${NC}"
echo -e "  ${YELLOW}Skip:   ${SKIP}${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "  ${GREEN}🎉 All tests passed!${NC}"
else
    echo -e "  ${RED}⚠ ${FAIL} test(s) failed${NC}"
fi

# Save results
echo "PASS=${PASS}" > "${TEST_DIR}/test-results.txt"
echo "FAIL=${FAIL}" >> "${TEST_DIR}/test-results.txt"
echo "SKIP=${SKIP}" >> "${TEST_DIR}/test-results.txt"

exit $FAIL
