# AICQ iOS Build Instructions

> **Important:** iOS builds can ONLY be performed on macOS with Xcode installed. There is no way to cross-compile an iOS app from Linux or Windows.

## Requirements

| Tool | Minimum Version | Install |
|------|----------------|---------|
| macOS | Sonoma 14+ | Apple hardware |
| Xcode | 15.0+ | Mac App Store or developer.apple.com |
| Command Line Tools | Latest | `xcode-select --install` |
| CocoaPods | 1.14+ | `sudo gem install cocoapods` |
| Node.js | 18+ | nvm, homebrew, or official installer |
| npm | 9+ | Ships with Node.js |

---

## Step-by-Step Instructions

### Step 1: Install Prerequisites

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Accept Xcode license
sudo xcodebuild -license accept

# Install CocoaPods
sudo gem install cocoapods

# Verify installations
xcodebuild -version
pod --version
node --version
npm --version
```

### Step 2: Clone and Install Dependencies

```bash
# Clone the repository (if not already cloned)
git clone <repository-url> aicq
cd aicq

# Install root dependencies
npm install

# Install web client dependencies and build
cd aicq-web
npm install
npm run build
cd ..
```

### Step 3: Sync Capacitor iOS Project

```bash
cd aicq-mobile

# Install Capacitor dependencies
npm install

# Sync web assets to iOS
npx cap sync ios
```

This copies the built web app (`aicq-web/dist/`) into the iOS project's web assets and updates native plugins.

### Step 4: Install CocoaPods Dependencies

```bash
cd ios/App
pod install
```

If you encounter pod version issues:

```bash
# Update pod repo
pod repo update

# Clean and reinstall
pod deintegrate
pod install
```

### Step 5: Configure Signing in Xcode

#### For Development (Free Apple ID)

1. Open the project in Xcode:
   ```bash
   cd ../..
   npx cap open ios
   ```

2. In Xcode, select the **App** target in the left sidebar.

3. Go to **Signing & Capabilities** tab.

4. Check **Automatically manage signing**.

5. Select your **Team** (use your personal Apple ID or add one via Xcode > Preferences > Accounts).

6. Set the **Bundle Identifier** to a unique value (e.g., `com.yourname.aicq`).

#### For App Store Distribution

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).

2. In Xcode, go to **Preferences > Accounts** and add your developer account.

3. Select the App target > **Signing & Capabilities**.

4. Uncheck **Automatically manage signing**.

5. Select your **Development Team**.

6. Choose a **Provisioning Profile** (create one in the Apple Developer Portal if needed).

### Step 6: Build & Run on Simulator

```bash
# From the aicq-mobile directory
npx cap run ios --target "iPhone 15 Pro"

# Or use Xcode:
# 1. npx cap open ios
# 2. Select a simulator from the device dropdown
# 3. Press Cmd+R or Product > Run
```

### Step 7: Build & Run on Physical Device

1. Connect your iPhone/iPad via USB.

2. Trust the computer on your device (Settings > This device).

3. In Xcode, select your device from the device dropdown.

4. Press Cmd+R or Product > Run.

> **Note:** On first run, you'll need to open **Settings > General > VPN & Device Management** on your iPhone and trust the developer certificate.

### Step 8: Archive for Distribution

```bash
# Open in Xcode
npx cap open ios
```

In Xcode:

1. Select **Any iOS Device (arm64)** from the device dropdown (NOT a simulator).

2. Go to **Product > Archive**.

3. Once the archive completes, the Organizer window appears.

4. Click **Distribute App**.

5. Choose your distribution method:
   - **App Store Connect** — for public App Store release
   - **Ad Hoc** — for testing on registered devices
   - **Enterprise** — for internal company distribution
   - **Development** — for development builds
   - **Custom** — for TestFlight beta testing

6. Follow the prompts to upload to App Store Connect or export the IPA.

---

## Configuration Files

### Bundle ID & App Name

Edit `aicq-mobile/capacitor.config.ts`:

```typescript
const config: CapacitorConfig = {
  appId: 'com.aicq.app',        // Change this for your team
  appName: 'AICQ',               // Display name
  webDir: '../aicq-web/dist',
};
```

### App Icon

Replace the icon files in:
```
aicq-mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/
```

You need to provide icons at these sizes:
- 20x20, 29x29, 40x40, 60x60 (2x and 3x)
- 76x76, 83.5x83.5 (iPad)
- 1024x1024 (App Store)

Use a tool like [AppIconGenerator](https://appicon.co/) to generate all sizes from a single 1024x1024 image.

### Splash Screen

Replace splash images in:
```
aicq-mobile/ios/App/App/Assets.xcassets/Splash.imageset/
```

### Info.plist Customizations

Edit `aicq-mobile/ios/App/App/Info.plist` to customize:
- `CFBundleDisplayName` — App name shown on home screen
- `CFBundleShortVersionString` — Version number (e.g., "1.0.0")
- `CFBundleVersion` — Build number (e.g., "1")
- `UISupportedInterfaceOrientations` — Allowed orientations
- `UIBackgroundModes` — Background capabilities (e.g., fetch, remote-notification)

---

## Common Issues & Fixes

### Pod install fails with "CocoaPods could not find compatible versions"

```bash
cd aicq-mobile/ios/App
pod repo update
pod install --repo-update
```

### "No profiles for 'com.aicq.app' were found"

1. Open Xcode > Preferences > Accounts.
2. Add your Apple ID (free is fine for development).
3. Select your Team in the target's Signing & Capabilities.

### "Swift Compiler Error" after pod install

```bash
# Clean the build folder
cd aicq-mobile/ios/App
rm -rf Pods/ Podfile.lock
pod install
# In Xcode: Product > Clean Build Folder (Cmd+Shift+K)
```

### Capacitor plugins not working after sync

```bash
# Full clean and resync
cd aicq-mobile
rm -rf ios
npx cap add ios
npx cap sync ios
cd ios/App && pod install
```

### White screen on launch

The web assets may not have been synced. Rebuild and sync:

```bash
cd aicq-web && npm run build
cd ../aicq-mobile && npx cap sync ios
```

---

## Build Automation (CI/CD)

### GitHub Actions (macOS Runner)

```yaml
name: Build iOS
on: [push, pull_request]

jobs:
  build-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd aicq-web && npm ci && npm run build
          cd ../aicq-mobile && npm ci && npx cap sync ios

      - name: Install CocoaPods
        run: |
          cd aicq-mobile/ios/App
          pod install

      - name: Build iOS
        run: |
          cd aicq-mobile/ios/App
          xcodebuild -workspace App.xcworkspace \
            -scheme App \
            -sdk iphoneos \
            -configuration Release \
            -derivedDataPath build \
            CODE_SIGNING_ALLOWED=NO \
            | xcpretty

      - uses: actions/upload-artifact@v4
        with:
          name: ios-build
          path: aicq-mobile/ios/App/build/Build/Products/Release-iphoneos/*.app
```

> **Note:** `CODE_SIGNING_ALLOWED=NO` builds an unsigned `.app` for CI testing. For distribution, you'll need to set up Apple signing certificates as GitHub Secrets.

---

## Testing on TestFlight

1. Archive the app in Xcode (Product > Archive).
2. In Organizer, click **Distribute App** > **App Store Connect** > **TestFlight**.
3. Follow the upload prompts.
4. Once processed, enable the build in App Store Connect > TestFlight.
5. Add internal or external testers.
