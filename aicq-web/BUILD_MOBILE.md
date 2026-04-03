# Capacitor Multi-Platform Build Guide

## Build Web UI
```bash
cd aicq-web
npm run build
```

## Install Capacitor
```bash
cd aicq-web
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npm install @capacitor/camera @capacitor/filesystem @capacitor/share
npx cap init "AICQ" "online.aicq.app" --web-dir dist
```

## Android (APK)
```bash
npx cap add android
npx cap sync android
npx cap open android
# Build APK in Android Studio: Build > Build APK
```

## iOS
```bash
npx cap add ios
npx cap sync ios
npx cap open ios
# Build in Xcode: Product > Archive
```

## WebView (Simple HTTP)
```bash
# Just serve the built web app:
cd aicq-web/dist
python3 -m http.server 8080
# Or use any static file server
```
