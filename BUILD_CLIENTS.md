# AICQ — Build Instructions for All Platforms

This document describes how to build AICQ client applications for every supported platform.

## Project Structure

```
aicq/
├── aicq-web/         # React web client (Vite + TypeScript)
├── aicq-app/         # Electron desktop wrapper
├── aicq-mobile/      # Capacitor mobile projects
│   ├── android/      # Android project (Gradle)
│   └── ios/          # iOS project (Xcode)
├── scripts/
│   ├── build-all.sh       # Build everything
│   ├── build-android.sh   # Build Android APK only
│   └── build-desktop.sh   # Build desktop app (Linux/Win/Mac)
├── dist-electron/    # Electron build output
└── download/         # Final build artifacts
```

## Prerequisites

| Tool | Version | Required For |
|------|---------|-------------|
| Node.js | >= 18 | All platforms |
| npm | >= 9 | All platforms |
| Java JDK | 17+ | Android |
| Android SDK | API 34 | Android |
| Xcode | 15+ | iOS (macOS only) |
| CocoaPods | >= 1.14 | iOS (macOS only) |
| Electron Builder | 25+ | Desktop |

---

## 1. Build Web Client

The web client is the shared UI for all platforms.

```bash
cd aicq-web
npm install
npm run build
# Output: aicq-web/dist/
```

---

## 2. Build Desktop (Electron)

### Linux (AppImage)

```bash
# Build for current platform
./scripts/build-desktop.sh linux

# Or manually:
cd aicq-app
npm install
npx electron-builder --linux --appimage
```

**Output:** `dist-electron/AICQ-1.0.0.AppImage`

### Windows (NSIS Installer + ZIP)

```bash
# Build for current platform
./scripts/build-desktop.sh win

# Or manually:
cd aicq-app
npm install
npx electron-builder --win --x64
```

**Output:** `dist-electron/AICQ-Setup-1.0.0.exe` + `AICQ-1.0.0-windows-x64.zip`

### macOS (DMG)

```bash
# Must be run on macOS
./scripts/build-desktop.sh mac

# Or manually:
cd aicq-app
npm install
npx electron-builder --mac --dmg
```

**Output:** `dist-electron/AICQ-1.0.0.dmg`

> **Note:** macOS builds require a Mac. You cannot cross-compile for macOS from Linux or Windows.

---

## 3. Build Android APK

### Setup Android SDK

```bash
# Set environment variables (add to ~/.bashrc)
export ANDROID_HOME=/home/z/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0:$JAVA_HOME/bin:$PATH"
```

### Install required SDK components

```bash
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"
```

### Build Debug APK

```bash
# Using the build script
./scripts/build-android.sh

# Or manually:
cd aicq-web && npm run build
cd ../aicq-mobile && npx cap sync android
cd android && ./gradlew assembleDebug
```

**Output:** `aicq-mobile/android/app/build/outputs/apk/debug/app-debug.apk`

### Build Release APK (Signed)

1. Generate a keystore:
   ```bash
   keytool -genkey -v -keystore aicq-release.keystore \
     -alias aicq -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Edit `aicq-mobile/android/app/build.gradle` to add signing config:
   ```gradle
   android {
       signingConfigs {
           release {
               storeFile file('../../aicq-release.keystore')
               storePassword 'YOUR_PASSWORD'
               keyAlias 'aicq'
               keyPassword 'YOUR_PASSWORD'
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               minifyEnabled true
               proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
           }
       }
   }
   ```

3. Build:
   ```bash
   ./scripts/build-android.sh release
   ```

---

## 4. Build iOS (Requires macOS + Xcode)

See [ios-build-instructions.md](./ios-build-instructions.md) for detailed iOS-specific instructions.

### Quick Summary

```bash
# On macOS only
cd aicq-web && npm run build
cd ../aicq-mobile && npx cap sync ios
cd ios/App && pod install
# Open in Xcode: npx cap open ios
# Then: Product > Archive in Xcode
```

---

## 5. Build Everything At Once

```bash
# Builds web, Android, desktop (Linux + Windows)
./scripts/build-all.sh
```

All artifacts are collected in `download/`:

| File | Description |
|------|-------------|
| `AICQ-latest-debug.apk` | Android debug APK |
| `AICQ-1.0.0-linux.AppImage` | Linux desktop app |
| `AICQ-1.0.0-windows-x64.zip` | Windows portable ZIP |
| `AICQ-1.0.0-windows-setup.exe` | Windows installer |
| `AICQ-android-project.zip` | Android project source archive |

---

## 6. CI/CD Integration

### GitHub Actions (Android Example)

```yaml
name: Build Android
on: [push, pull_request]

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Build
        run: |
          cd aicq-web && npm ci && npm run build
          cd ../aicq-mobile && npm ci && npx cap sync android
          cd android && ./gradlew assembleDebug

      - uses: actions/upload-artifact@v4
        with:
          name: android-apk
          path: aicq-mobile/android/app/build/outputs/apk/debug/*.apk
```

---

## Troubleshooting

### Android Gradle Build Fails

```bash
# Check Java version
java -version  # Must be 17+

# Clean and retry
cd aicq-mobile/android
./gradlew clean assembleDebug
```

### Electron Build Fails

```bash
# Clear Electron cache
rm -rf ~/.cache/electron
rm -rf ~/.cache/electron-builder

# Reinstall
cd aicq-app
rm -rf node_modules
npm install
```

### Capacitor Sync Issues

```bash
# Remove and re-add platform
cd aicq-mobile
rm -rf android
npx cap add android
npx cap sync android
```

---

## 7. One-Click Release (一键发布)

### Method A: Local Release Script (`scripts/release.sh`)

A fully automated release script that builds all platforms, creates a git tag, and publishes to GitHub Releases.

#### Prerequisites

```bash
# Required tools
- Node.js >= 18, npm >= 9
- Android SDK (API 34) + JDK 17+ (for Android builds)
- jq (for JSON parsing in release API calls)
- zip (for packaging)
```

#### Usage

```bash
# Full build + publish to GitHub Release
./scripts/release.sh

# Skip building, only publish existing artifacts in download/
./scripts/release.sh --skip-build

# Dry-run mode — preview everything without actually uploading
./scripts/release.sh --dry-run

# Combine flags
./scripts/release.sh --skip-build --dry-run
```

#### What It Does

1. **Build Phase** (unless `--skip-build`):
   - Builds web client (`aicq-web/dist/`)
   - Builds Electron desktop for Linux (AppImage) and Windows (NSIS + ZIP)
   - Builds Android APK (debug + release)
   - Syncs Capacitor Android assets

2. **Collect Phase**:
   - Gathers all artifacts into `download/` with versioned names
   - Generates SHA256 checksums

3. **Tag Phase**:
   - Creates annotated git tag (`v1.0.0`) based on `package.json` version
   - Pushes tag to origin

4. **Release Phase**:
   - Creates GitHub Release with auto-generated release notes
   - Uploads all artifacts via GitHub API
   - Attaches checksums file

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | Configured in script | GitHub PAT for release uploads |
| `ANDROID_HOME` | `/home/z/android-sdk` | Android SDK location |
| `JAVA_HOME` | `/usr/lib/jvm/java-21-openjdk-amd64` | JDK location |
| `AICQ_VERSION` | From `package.json` | Override version number |

#### Example Workflow

```bash
# 1. Update version in package.json
npm version patch  # 1.0.0 -> 1.0.1

# 2. Preview what would happen
./scripts/release.sh --dry-run

# 3. Do the actual release
./scripts/release.sh

# 4. Verify at GitHub
# https://github.com/ctz168/aicq/releases/tag/v1.0.1
```

---

### Method B: GitHub Actions CI/CD (`.github/workflows/build-release.yml`)

Automated CI/CD pipeline that triggers on **tag push** (`v*`).

#### How to Trigger

```bash
# Tag and push to trigger the workflow
git tag v1.0.1
git push origin v1.0.1
```

#### Pipeline Architecture

```
push tag v*
    │
    ├── build-web (ubuntu)        → web-dist artifact
    │
    ├── build-android (ubuntu)    → debug + release APKs
    │   └── needs: build-web
    │
    ├── build-linux (ubuntu)      → AppImage
    │   └── needs: build-web
    │
    ├── build-windows (ubuntu)    → NSIS exe + ZIP
    │   └── needs: build-web
    │
    ├── build-macos (macos-latest) → DMG
    │   └── needs: build-web
    │
    └── release (ubuntu)          → GitHub Release + upload all
        └── needs: all above
```

#### Secrets Configuration (Optional)

For **signed Android APK**, configure these repository secrets:

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

```bash
# Encode your keystore
base64 -w 0 aicq-release.keystore
# Copy output to GitHub repo Settings > Secrets > ANDROID_KEYSTORE_BASE64
```

#### Notes

- **macOS DMG** builds run on `macos-latest` runner (Apple Silicon)
- **Windows builds** run on `ubuntu-latest` with cross-compilation via electron-builder
- The release job runs with `if: always()` so partial builds still get released
- Artifacts are kept for 7 days in GitHub Actions cache
- SHA256 checksums are automatically generated and attached to the release

#### Example: Full Release via CI/CD

```bash
# 1. Bump version
npm version minor  # 1.0.0 -> 1.1.0

# 2. Commit and push
git add -A
git commit -m "chore: bump version to 1.1.0"
git push origin main

# 3. Create and push tag to trigger CI/CD
git tag v1.1.0
git push origin v1.1.0

# 4. Watch the build at:
#    https://github.com/ctz168/aicq/actions

# 5. Download release at:
#    https://github.com/ctz168/aicq/releases/tag/v1.1.0
```
