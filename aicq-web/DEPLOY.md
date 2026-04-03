# AICQ Web 客户端 — 部署指南

> **包名**: `@aicq/web`  
> **仓库**: https://github.com/ctz168/aicq.git  
> **许可**: 见项目 LICENSE  
> **最后更新**: 2025-01

---

## 目录

1. [概述](#1-概述)
2. [系统要求](#2-系统要求)
3. [安装方式总览](#3-安装方式总览)
4. [方式一：Web 站点部署](#4-方式一web-站点部署)
5. [方式二：Android APK 打包](#5-方式二android-apk-打包)
6. [方式三：iOS App 打包](#6-方式三ios-app-打包)
7. [方式四：WebView 嵌入](#7-方式四webview-嵌入)
8. [一键脚本部署](#8-一键脚本部署)
9. [构建配置](#9-构建配置)
10. [环境变量](#10-环境变量)
11. [Nginx 完整配置](#11-nginx-完整配置)
12. [CDN / 静态托管部署](#12-cdn--静态托管部署)
13. [Docker 部署](#13-docker-部署)
14. [功能清单](#14-功能清单)
15. [性能优化](#15-性能优化)
16. [故障排查](#16-故障排查)
17. [升级更新](#17-升级更新)
18. [开发调试](#18-开发调试)

---

## 1. 概述

### 1.1 什么是 AICQ Web 客户端

AICQ Web 客户端 (`@aicq/web`) 是 AICQ 加密通信系统的**人机交互前端**，基于 React 18 + TypeScript + Vite 5 构建的**单页应用 (SPA)**。它为用户提供了一个现代化的浏览器聊天界面，支持与人类好友和 AI 智能体进行端到端加密通信。客户端在浏览器中完成所有密钥生成、加密、解密操作，服务器仅负责中继，**服务器无法读取消息内容**。

核心加密方案使用 Ed25519（签名）、X25519（密钥交换）、AES-256-GCM（消息加密），所有密码学操作通过本地依赖 `@aicq/crypto`（链接到 `../aicq-crypto`）在浏览器端完成。

### 1.2 支持平台

AICQ Web 客户端采用"一次构建，多端部署"的架构策略：

| 平台 | 部署方式 | 说明 |
|------|---------|------|
| **Web 浏览器** | Nginx / CDN / Docker | 传统 SPA 部署，直接通过浏览器访问 |
| **Android** | Capacitor → APK | 打包为原生 Android 应用 |
| **iOS** | Capacitor → App Store | 打包为原生 iOS 应用 |
| **桌面 WebView** | Electron / Tauri | 嵌入桌面应用壳中运行 |

### 1.3 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户设备（浏览器/手机）                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  AICQ Web Client (SPA)                    │  │
│  │                   React 18 + TypeScript                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │  │
│  │  │ Login    │ │ ChatList │ │  Chat    │ │  Settings  │ │  │
│  │  │ Screen   │ │ Screen   │ │  Screen  │ │  Screen    │ │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘ │  │
│  │       │            │            │              │         │  │
│  │  ┌────┴────────────┴────────────┴──────────────┴────┐   │  │
│  │  │              AICQContext (状态管理)                 │   │  │
│  │  └──────────────────────┬───────────────────────────┘   │  │
│  │                         │                                │  │
│  │  ┌──────────────────────┴───────────────────────────┐   │  │
│  │  │              WebClient (核心服务层)                  │   │  │
│  │  │  ┌────────────┐  ┌────────────┐  ┌─────────────┐ │   │  │
│  │  │  │ BrowserAPI │  │ BrowserWS  │  │ BrowserStore│ │   │  │
│  │  │  │ Client     │  │ Client     │  │ (localStor) │ │   │  │
│  │  │  └─────┬──────┘  └─────┬──────┘  └─────────────┘ │   │  │
│  │  └────────┼───────────────┼─────────────────────────┘   │  │
│  │           │               │                             │  │
│  │  ┌────────┴───────────────┴─────────────────────────┐   │  │
│  │  │           @aicq/crypto (密码学库)                   │   │  │
│  │  │   Ed25519 · X25519 · AES-256-GCM · NaCl           │   │  │
│  │  └───────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WSS
                           │
              ┌────────────┴────────────┐
              │   AICQ Server (后端)     │
              │   REST API + WebSocket   │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │    数据库 / 存储层       │
              └─────────────────────────┘
```

### 1.4 核心特性

- **端到端加密通信** — Ed25519/X25519/AES-256-GCM，密钥在浏览器本地生成，服务器无法解密
- **AI 流式输出** — 实时 token 逐字显示，支持光标闪烁动画，消息完成后切换为完整 Markdown 渲染
- **Markdown 富文本** — 支持 GFM（表格、任务列表、删除线）、Prism 语法高亮、代码一键复制
- **图片预览** — 缩略图展示 + Lightbox 全屏查看，支持缩放和拖拽
- **视频播放** — 自定义播放器控件，支持缩略图封面和时长显示
- **文件传输** — 64KB 分块传输，支持断点续传、实时速度/剩余时间显示、暂停/恢复/取消
- **拖拽上传** — 支持将文件/图片直接拖拽到聊天窗口上传
- **临时号码发现** — 6 位数字临时号码，10 分钟有效，无需交换 ID 即可添加好友
- **QR 码密钥导出/导入** — 通过 QR 码分享公钥指纹，快速建立加密连接
- **SPA 路由** — 登录 → 聊天列表 → 聊天 → 好友管理 → 临时号码 → 设置，无页面刷新

---

## 2. 系统要求

### 2.1 构建环境要求

在**构建机器**上需要安装以下软件：

| 依赖 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| **Node.js** | 18.0.0 | 20.x LTS | 运行构建脚本和 Vite |
| **npm** | 9.0.0 | 10.x | 随 Node.js 一起安装 |
| **Git** | 2.30 | 最新 | 克隆仓库 |
| **磁盘空间** | 2 GB | 5 GB | 包含 node_modules 和构建产物 |
| **内存** | 2 GB | 4 GB | TypeScript 编译需要较多内存 |

```bash
# 检查版本
node -v    # 应输出 v18.x 或更高
npm -v     # 应输出 9.x 或更高
git --version
```

### 2.2 部署服务器要求（Web 站点）

| 依赖 | 最低要求 | 推荐配置 | 说明 |
|------|---------|---------|------|
| **操作系统** | Ubuntu 20.04 / CentOS 7 | Ubuntu 22.04 LTS | Nginx 官方支持良好 |
| **Nginx** | 1.18 | 1.24+ | 静态文件服务 + 反向代理 |
| **磁盘空间** | 100 MB | 500 MB | 仅存放静态文件 |
| **内存** | 256 MB | 512 MB | Nginx 非常轻量 |
| **域名 + SSL** | 推荐 | 必须（生产环境） | Let's Encrypt 免费证书 |
| **网络带宽** | 10 Mbps | 100 Mbps+ | 取决于并发用户数 |

### 2.3 移动端构建要求

#### Android APK 构建

| 依赖 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| **操作系统** | Windows 10 / macOS / Linux | 任意 | Android Studio 跨平台 |
| **Android Studio** | 2022.1 (Flamingo) | 2023.x (Iguana) | 官方 IDE |
| **JDK** | 17 | 17 (Temurin) | Gradle 编译需要 |
| **Android SDK** | API 22+ | API 33+ | compileSdkVersion |
| **Gradle** | 8.0 | 8.4+ | 随 Android Studio 自带 |
| **磁盘空间** | 5 GB | 10 GB | SDK + 构建缓存 |

#### iOS App 构建

| 依赖 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| **操作系统** | macOS 12 Monterey | macOS 14 Sonoma | 必须使用 macOS |
| **Xcode** | 14.0 | 15.x | App Store 提交需最新版 |
| **CocoaPods** | 1.12+ | 最新 | Capacitor 依赖管理 |
| **Apple Developer** | 免费（本地测试） | 99 USD/年（App Store） | 上架必需 |
| **磁盘空间** | 10 GB | 20 GB | Xcode 非常庞大 |

---

## 3. 安装方式总览

下表汇总了四种部署方式的对比，帮助您选择最适合的方案：

| 部署方式 | 适用场景 | 复杂度 | 预计耗时 | 前置条件 | 最终产物 |
|---------|---------|--------|---------|---------|---------|
| **Web 站点 (Nginx)** | PC/手机浏览器访问 | ⭐⭐ 低 | 30 分钟 | Node.js + 服务器 + Nginx | `dist/` 静态文件 |
| **CDN 静态托管** | 快速上线、全球加速 | ⭐ 最低 | 10 分钟 | Node.js + CDN 账号 | `dist/` 静态文件 |
| **Docker 部署** | 容器化环境、CI/CD | ⭐⭐ 低 | 20 分钟 | Docker + Docker Compose | Docker 镜像 |
| **Android APK** | 安卓手机原生应用 | ⭐⭐⭐ 中 | 2 小时 | Android Studio + JDK 17 | `.apk` 安装包 |
| **iOS App** | iPhone/iPad 原生应用 | ⭐⭐⭐⭐ 高 | 3 小时 | macOS + Xcode + 开发者账号 | `.ipa` 安装包 |
| **WebView 嵌入** | 桌面应用或嵌入三方 | ⭐ 最低 | 5 分钟 | `dist/` 静态文件 | 嵌入式 WebView |

**推荐选择策略**：

- **快速验证 / 内部测试** → CDN 静态托管（Vercel / Netlify）
- **正式生产环境** → Nginx + HTTPS + CDN
- **需要手机 App** → Android APK（相对简单，无需 macOS）
- **全平台覆盖** → Web + Android + iOS 三端部署

---

## 4. 方式一：Web 站点部署

### 4.1 构建准备

#### 4.1.1 克隆仓库

```bash
git clone https://github.com/ctz168/aicq.git
cd aicq
```

#### 4.1.2 安装依赖

AICQ 是 monorepo 结构，Web 客户端依赖同级目录的 `aicq-crypto` 模块（通过 `file:` 协议链接），因此需要先构建密码学库：

```bash
# 1. 构建密码学库（Web 客户端的前置依赖）
cd aicq-crypto
npm install
npm run build

# 2. 返回 Web 客户端目录，安装依赖
cd ../aicq-web
npm install
```

#### 4.1.3 验证依赖安装

```bash
# 确认 @aicq/crypto 已正确链接
ls -la node_modules/@aicq/crypto
# 应指向 ../aicq-crypto 目录

# 确认关键依赖已安装
npm ls react vite typescript
```

### 4.2 构建命令

```bash
cd aicq-web

# 完整构建（TypeScript 类型检查 + Vite 生产构建）
npm run build
```

构建过程分为两个阶段：

1. **TypeScript 类型检查** (`tsc`) — 编译 `src/` 下所有 `.ts`/`.tsx` 文件，确保类型安全
2. **Vite 生产构建** (`vite build`) — 打包、压缩、生成 `dist/` 目录

#### 4.2.1 构建产物说明

```
dist/
├── index.html              # 入口 HTML（已注入 JS/CSS 引用）
├── assets/
│   ├── index-[hash].js     # 主 JS bundle
│   ├── index-[hash].css    # 主 CSS bundle
│   └── vendor-[hash].js    # 第三方库 bundle（如有代码分割）
└── vite.svg                # 静态资源
```

**产物特点**：

- JS/CSS 文件名包含内容哈希，天然支持长期缓存
- HTML 文件引用已更新为带哈希的文件名
- 默认不包含 source map（生产环境安全考虑）

#### 4.2.2 本地预览构建产物

```bash
# 启动本地预览服务器（默认端口 4173）
npm run preview
```

### 4.3 Nginx 配置

#### 4.3.1 安装 Nginx

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install nginx -y

# CentOS / RHEL
sudo yum install epel-release -y
sudo yum install nginx -y

# 启动并设置开机自启
sudo systemctl enable nginx
sudo systemctl start nginx

# 验证
sudo nginx -t
curl -I http://localhost
```

#### 4.3.2 部署静态文件

```bash
# 方式一：直接复制
sudo cp -r dist/* /usr/share/nginx/aicq/

# 方式二：rsync（推荐，支持增量同步）
rsync -avz --delete dist/ user@your-server:/usr/share/nginx/aicq/

# 方式三：scp
scp -r dist/* user@your-server:/usr/share/nginx/aicq/

# 设置权限
sudo chown -R nginx:nginx /usr/share/nginx/aicq/
sudo chmod -R 755 /usr/share/nginx/aicq/
```

#### 4.3.3 基本 Nginx 配置

创建 Nginx 配置文件：

```bash
sudo vim /etc/nginx/sites-available/aicq
```

```nginx
server {
    listen 80;
    server_name chat.example.com;    # 替换为您的域名

    root /usr/share/nginx/aicq;
    index index.html;

    # SPA 路由：所有未知路径回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 静态资源缓存（带哈希的文件长期缓存）
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;
}
```

#### 4.3.4 启用站点

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/aicq /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重新加载
sudo systemctl reload nginx
```

### 4.4 SSL/HTTPS 配置

#### 4.4.1 使用 Let's Encrypt（免费）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书并自动配置 Nginx
sudo certbot --nginx -d chat.example.com

# 测试自动续期
sudo certbot renew --dry-run
```

Certbot 会自动修改 Nginx 配置，添加 SSL 相关指令并设置 HTTP→HTTPS 重定向。

#### 4.4.2 手动 SSL 配置（已有证书）

如果使用已有的 SSL 证书（如阿里云、腾讯云免费证书）：

```bash
# 放置证书文件
sudo mkdir -p /etc/nginx/ssl/aicq
sudo cp your-cert.pem /etc/nginx/ssl/aicq/
sudo cp your-key.pem /etc/nginx/ssl/aicq/
```

在 Nginx 配置中添加（见[第 11 节完整配置](#11-nginx-完整配置)中的详细说明）。

### 4.5 CDN 部署选项

如果不需要 API 反向代理（API 服务在其他域名），可以将 `dist/` 直接部署到 CDN：

| CDN 服务 | 免费额度 | 全球节点 | 自定义域名 | 说明 |
|---------|---------|---------|-----------|------|
| **Cloudflare Pages** | 无限 | 300+ | ✅ | 推荐，零配置 HTTPS |
| **Vercel** | 100GB/月 | 全球 | ✅ | 适合前端项目 |
| **Netlify** | 100GB/月 | 全球 | ✅ | 操作简单 |
| **GitHub Pages** | 100GB/月 | 全球 | ✅ | 适合开源项目 |

详细配置见[第 12 节](#12-cdn--静态托管部署)。

### 4.6 Docker 部署（可选）

见[第 13 节](#13-docker-部署)。

---

## 5. 方式二：Android APK 打包

### 5.1 前置条件

在开始之前，确保已完成以下准备：

1. **安装 Android Studio**：从 [developer.android.com](https://developer.android.com/studio) 下载安装
2. **配置 JDK 17**：Android Studio 通常自带，也可手动安装 Temurin JDK 17
3. **安装 Android SDK**：通过 Android Studio → Settings → SDK Manager 安装以下组件：
   - Android SDK Platform 33 (Android 13)
   - Android SDK Build-Tools 34
   - Android SDK Command-line Tools
   - Android SDK Platform-Tools
4. **确认环境变量**：

```bash
# 检查 ANDROID_HOME
echo $ANDROID_HOME
# 通常为 ~/Android/Sdk 或 /usr/local/android-sdk

# 确认 SDK 工具可用
$ANDROID_HOME/platform-tools/adb version
```

### 5.2 安装 Capacitor 依赖

```bash
cd aicq-web

# 安装 Capacitor 核心包
npm install @capacitor/core @capacitor/cli --save-dev

# 安装 Android 平台支持
npm install @capacitor/android --save-dev

# 安装常用插件（可选，按需选择）
npm install @capacitor/camera @capacitor/filesystem @capacitor/share @capacitor/haptics --save-dev
npm install @capacitor/splash-screen @capacitor/status-bar --save-dev
```

### 5.3 初始化 Capacitor

如果项目还没有 `capacitor.config.json`，需要初始化：

```bash
npx cap init "AICQ" "online.aicq.app" --web-dir dist
```

> **注意**：本项目已包含 `capacitor.config.json`，配置如下：
> - `appId`: `online.aicq.app`
> - `appName`: `AICQ`
> - `webDir`: `dist`
> - `server.androidScheme`: `https`（使用 HTTPS scheme 以兼容安全 API）

### 5.4 构建 Web 资源

确保先构建 Web 产物：

```bash
# 先构建密码学依赖
cd ../aicq-crypto && npm run build && cd ../aicq-web

# 构建 Web 应用
npm run build
```

### 5.5 添加 Android 平台

```bash
npx cap add android
```

此命令会在项目中创建 `android/` 目录，包含完整的 Android 项目结构。

### 5.6 同步 Web 资源到 Android

每次修改 Web 代码后都需要同步：

```bash
npx cap sync android
```

该命令会：
1. 将 `dist/` 目录中的 Web 资源复制到 `android/app/src/main/assets/public/`
2. 更新 Capacitor 插件的 Android 依赖
3. 同步 Capacitor 配置文件

### 5.7 在 Android Studio 中构建

```bash
# 打开 Android Studio 项目
npx cap open android
```

在 Android Studio 中：

#### 5.7.1 构建 Debug APK（测试用）

1. 菜单栏 → **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. 产出路径：`android/app/build/outputs/apk/debug/app-debug.apk`

#### 5.7.2 构建 Release APK（发布用）

1. 菜单栏 → **Build** → **Generate Signed Bundle / APK**
2. 选择 **APK**（或 **Android App Bundle** 以支持 Play Store）
3. 创建或选择 **Keystore** 文件（`.jks`）
4. 填写 Key 信息：
   - Key Alias
   - Key Password
   - Store Password
5. 选择 **release** 构建变体
6. 产出路径：`android/app/build/outputs/apk/release/app-release.apk`

#### 5.7.3 签名配置（build.gradle）

在 `android/app/build.gradle` 中配置签名信息：

```groovy
android {
    ...
    signingConfigs {
        release {
            storeFile file("../../release.keystore")
            storePassword "your_store_password"
            keyAlias "your_key_alias"
            keyPassword "your_key_password"
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

### 5.8 安装与测试

```bash
# 通过 ADB 安装到连接的设备/模拟器
$ANDROID_HOME/platform-tools/adb install android/app/build/outputs/apk/debug/app-debug.apk

# 查看日志
$ANDROID_HOME/platform-tools/adb logcat | grep -i "capacitor\|aicq"

# 在 Chrome 中调试 WebView
# 打开 chrome://inspect，选择设备上的 WebView 进行调试
```

### 5.9 Google Play Store 提交（简要流程）

1. **注册 Google Play 开发者账号** — 一次性费用 25 USD
2. **创建应用** — 在 Play Console 中创建新应用
3. **准备商店资料** — 应用图标（512×512）、截图、描述、隐私政策
4. **生成 AAB** — 在 Android Studio 中 Build → Generate Signed Bundle → Android App Bundle
5. **上传 AAB** — 在 Play Console 中上传
6. **填写发布信息** — 内容分级、目标受众、定价
7. **提交审核** — 通常 1-3 个工作日

---

## 6. 方式三：iOS App 打包

### 6.1 前置条件

**注意：iOS 构建必须在 macOS 上进行。**

| 条件 | 要求 |
|------|------|
| **操作系统** | macOS 12 Monterey 或更高（推荐 macOS 14 Sonoma） |
| **Xcode** | 14.0 或更高（推荐 Xcode 15.x） |
| **CocoaPods** | 1.12+（`sudo gem install cocoapods` 或 `brew install cocoapods`） |
| **Apple ID** | 免费即可本地测试 |
| **Apple Developer Program** | 99 USD/年，上架 App Store 必需 |
| **Node.js** | 18+ |

### 6.2 安装 Capacitor iOS 依赖

```bash
cd aicq-web

# 安装 Capacitor 核心包（如果未安装）
npm install @capacitor/core @capacitor/cli --save-dev

# 安装 iOS 平台支持
npm install @capacitor/ios --save-dev

# 安装常用插件（可选）
npm install @capacitor/camera @capacitor/filesystem @capacitor/share @capacitor/splash-screen @capacitor/status-bar --save-dev
```

### 6.3 构建 Web 资源

```bash
# 先构建密码学依赖
cd ../aicq-crypto && npm run build && cd ../aicq-web

# 构建 Web 应用
npm run build
```

### 6.4 添加 iOS 平台

```bash
npx cap add ios
```

此命令创建 `ios/` 目录，包含 Xcode 项目。

### 6.5 同步 Web 资源到 iOS

```bash
npx cap sync ios
```

### 6.6 在 Xcode 中构建

```bash
# 打开 Xcode 项目
npx cap open ios
```

#### 6.6.1 配置签名

在 Xcode 中：

1. 选择左侧导航栏中的 **AICQ** 项目
2. 选择 **Signing & Capabilities** 标签
3. 勾选 **Automatically manage signing**
4. 选择您的 **Team**（Apple Developer 账号）
5. 确保 **Bundle Identifier** 唯一（当前为 `online.aicq.app`）

#### 6.6.2 选择目标设备

- **模拟器测试**：选择任意 iOS Simulator（如 iPhone 15）
- **真机测试**：连接 iPhone，选择您的设备作为运行目标

#### 6.6.3 构建并运行

1. 选择目标设备
2. 按 **Cmd + R** 运行（或点击 ▶ 按钮）
3. 首次运行需要信任开发者证书：**设置** → **通用** → **VPN与设备管理** → 信任您的开发者账号

### 6.7 归档与提交 App Store

#### 6.7.1 创建归档

1. Xcode 菜单栏 → **Product** → **Archive**
2. 等待构建完成，Archive Organizer 窗口会自动弹出
3. 选择刚创建的 Archive，点击 **Distribute App**

#### 6.7.2 提交审核

1. 选择 **App Store Connect** → **Upload**
2. 按照向导完成上传
3. 登录 [App Store Connect](https://appstoreconnect.apple.com)
4. 在「我的 App」中创建应用记录
5. 填写应用名称、描述、截图、定价等
6. 选择上传的构建版本
7. 提交审核（通常 1-5 个工作日）

---

## 7. 方式四：WebView 嵌入

AICQ Web 客户端是一个纯前端 SPA，不依赖任何服务端渲染，因此可以嵌入到任何 WebView 容器中运行。只需将 `dist/` 目录作为静态文件提供服务即可。

### 7.1 Electron 嵌入

```javascript
// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,       // 安全考虑
      contextIsolation: true,        // 安全考虑
    },
    title: 'AICQ',
  });

  // 加载本地 dist/index.html
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
```

```json
// package.json
{
  "name": "aicq-desktop",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  }
}
```

### 7.2 Tauri 嵌入

```toml
# src-tauri/tauri.conf.json
{
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "tauri": {
    "windows": [{
      "title": "AICQ",
      "width": 1200,
      "height": 800
    }]
  }
}
```

### 7.3 系统 WebView / 任意 HTTP 服务器

最简单的方式，直接用任何静态文件服务器托管 `dist/`：

```bash
# Python 内置服务器（快速测试）
cd dist && python3 -m http.server 8080

# 或使用 serve（Node.js）
npx serve dist -s -l 8080

# 或使用 http-server
npx http-server dist -p 8080 -s
```

### 7.4 配置 API 端点

当 WebView 中的 SPA 需要与后端通信时，需确保 API 地址可访问。有三种方案：

| 方案 | 说明 | 适用场景 |
|------|------|---------|
| **同域部署** | API 和静态文件在同一域名下 | 标准部署 |
| **CORS 配置** | 后端允许 WebView 来源的跨域请求 | Electron/Tauri |
| **环境变量** | 构建时指定 API 地址 | 不同环境不同后端 |

对于环境变量方案，创建 `.env.production`：

```env
VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://api.example.com/ws
```

---

## 8. 一键脚本部署

项目提供了一键部署脚本 `deploy/deploy-web.sh`，可自动完成构建和部署到 Nginx。

### 8.1 脚本位置

```
aicq/
└── deploy/
    └── deploy-web.sh
```

### 8.2 使用方法

```bash
# 基本用法（使用默认配置）
bash deploy/deploy-web.sh

# 指定目标服务器
bash deploy/deploy-web.sh --host user@your-server.com

# 指定部署路径
bash deploy/deploy-web.sh --dest /var/www/aicq

# 完整参数示例
bash deploy/deploy-web.sh \
  --host user@your-server.com \
  --dest /var/www/aicq \
  --ssh-key ~/.ssh/id_rsa \
  --backup
```

### 8.3 脚本功能说明

该脚本执行以下操作：

1. **检查环境** — 验证 Node.js、npm、Git 是否已安装
2. **构建密码学库** — `cd aicq-crypto && npm install && npm run build`
3. **构建 Web 客户端** — `cd aicq-web && npm install && npm run build`
4. **备份现有文件**（可选）— 将旧的 `dist/` 打包备份
5. **部署文件** — 通过 rsync 或 scp 将 `dist/` 上传到服务器
6. **验证部署** — 检查目标目录文件是否完整

### 8.4 前置条件

- 目标服务器已安装 Nginx 并配置好站点
- SSH 密钥已配置（免密登录）
- 服务器上有写入目标目录的权限

---

## 9. 构建配置

### 9.1 Vite 配置详解

项目使用 Vite 5 作为构建工具，配置文件为 `vite.config.ts`：

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',   // 代理到后端 API
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',      // 代理 WebSocket
        ws: true,
      },
    },
  },

  build: {
    commonjsOptions: {
      include: [/node_modules/],            // 确保 CommonJS 模块正确打包
    },
  },

  optimizeDeps: {
    include: [
      '@aicq/crypto',                       // 预构建密码学库（性能优化）
      'tweetnacl',                          // NaCl 加密库
      'tweetnacl-util',                     // NaCl 工具库
    ],
  },
});
```

### 9.2 开发服务器代理

在开发模式下，Vite dev server 会自动将请求代理到后端：

| 路径模式 | 代理目标 | 说明 |
|---------|---------|------|
| `/api/*` | `http://localhost:3000` | REST API 请求 |
| `/ws` | `ws://localhost:3000` | WebSocket 连接 |

这意味着开发时只需运行：

```bash
# 终端 1：启动后端
cd aicq-server && npm start

# 终端 2：启动前端开发服务器
cd aicq-web && npm run dev
```

浏览器访问 `http://localhost:5173`，所有 `/api` 和 `/ws` 请求会自动代理到后端。

### 9.3 构建输出结构

```bash
npm run build
```

Vite 默认输出到 `dist/` 目录：

```
dist/
├── index.html              # SPA 入口文件
└── assets/
    ├── index-[hash].js     # 所有 JS 代码（包含 React、业务逻辑、依赖）
    └── index-[hash].css    # 所有 CSS 样式
```

**Vite 默认行为**：

- CSS 和 JS 文件名包含内容哈希（如 `index-a1b2c3d4.js`）
- 代码已压缩（minify）并去除注释
- 不生成 source map（生产环境）
- HTML 中的引用已自动更新

### 9.4 自定义构建配置

如需修改构建行为，可在 `vite.config.ts` 中添加：

```typescript
build: {
  outDir: 'dist',             // 输出目录
  assetsDir: 'assets',        // 静态资源子目录
  sourcemap: false,           // 不生成 source map
  minify: 'esbuild',          // 压缩工具（esbuild / terser）
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor': ['react', 'react-dom'],  // 手动代码分割
        'crypto': ['tweetnacl', 'tweetnacl-util'],
      },
    },
  },
},
```

---

## 10. 环境变量

### 10.1 Vite 环境变量机制

Vite 使用 `.env` 文件管理环境变量，**只有以 `VITE_` 前缀开头的变量才会暴露给客户端代码**。

### 10.2 环境变量文件

| 文件名 | 加载时机 | 说明 |
|--------|---------|------|
| `.env` | 所有环境 | 默认配置（应提交到 Git） |
| `.env.local` | 所有环境 | 本地覆盖（不应提交到 Git） |
| `.env.development` | `npm run dev` | 开发环境配置 |
| `.env.production` | `npm run build` | 生产环境配置 |
| `.env.staging` | 自定义 | 预发布/测试环境 |

### 10.3 配置示例

#### `.env`（基础配置）

```env
# 应用标题
VITE_APP_TITLE=AICQ - 加密聊天

# API 服务器地址（默认值）
VITE_API_BASE_URL=
VITE_WS_URL=
```

#### `.env.development`（开发环境）

```env
# 开发环境 - 使用 Vite 代理，无需配置后端地址
VITE_API_BASE_URL=
VITE_WS_URL=
VITE_ENABLE_DEV_TOOLS=true
```

#### `.env.production`（生产环境）

```env
# 生产环境 - 指定实际的后端 API 地址
VITE_API_BASE_URL=https://api.example.com
VITE_WS_URL=wss://api.example.com/ws
VITE_ENABLE_DEV_TOOLS=false
```

#### `.env.staging`（预发布环境）

```env
# 预发布环境 - 使用测试服务器
VITE_API_BASE_URL=https://staging-api.example.com
VITE_WS_URL=wss://staging-api.example.com/ws
VITE_ENABLE_DEV_TOOLS=false
```

### 10.4 在代码中使用

```typescript
// 获取环境变量
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const wsUrl = import.meta.env.VITE_WS_URL || '';
const isDevTools = import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true';

// 在 WebClient 初始化时使用
const client = new WebClient({
  serverUrl: apiBaseUrl || window.location.origin,
  wsUrl: wsUrl || undefined,
});
```

### 10.5 TypeScript 类型声明

在 `src/vite-env.d.ts` 中添加类型声明（如果需要）：

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_ENABLE_DEV_TOOLS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

---

## 11. Nginx 完整配置

以下是一个**生产就绪**的完整 Nginx 配置，涵盖 HTTP→HTTPS 重定向、SSL 优化、SPA 路由、API 代理、WebSocket 代理、静态资源缓存、Gzip 压缩、安全头和访问限速。

```nginx
# ============================================================
# AICQ Web Client — 生产环境 Nginx 完整配置
# 文件路径：/etc/nginx/sites-available/aicq
# ============================================================

# ---------- HTTP → HTTPS 重定向 ----------
server {
    listen 80;
    listen [::]:80;
    server_name chat.example.com;

    # Let's Encrypt ACME 验证路径（如果使用 certbot）
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # 其他所有请求重定向到 HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# ---------- HTTPS 主配置 ----------
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name chat.example.com;

    # ---------- SSL 证书配置 ----------
    ssl_certificate     /etc/nginx/ssl/aicq/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/aicq/privkey.pem;

    # SSL 协议优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # SSL 会话缓存
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP Stapling（提升 SSL 握手速度）
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # ---------- 安全响应头 ----------
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: https:;" always;

    # ---------- 静态文件根目录 ----------
    root /usr/share/nginx/aicq;
    index index.html;

    # ---------- Gzip 压缩 ----------
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        image/svg+xml;

    # ---------- SPA 路由（关键！） ----------
    # React Router 使用 HTML5 History API，所有前端路由需要回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ---------- API 反向代理 ----------
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;

        # API 请求超时设置
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;

        # 缓冲设置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # ---------- WebSocket 代理 ----------
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket 升级头（关键！）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 长连接超时（24小时，保持聊天在线）
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # ---------- 静态资源缓存 ----------
    # Vite 产物的文件名包含内容哈希，可以设置长期缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # HTML 文件不缓存（确保用户获取最新版本）
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }

    # 图片、字体等静态资源
    location ~* \.(png|jpg|jpeg|gif|ico|svg|webp|avif|woff|woff2|ttf|eot|otf)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # ---------- 安全限制 ----------
    # 禁止访问隐藏文件（如 .git、.env）
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # 禁止访问敏感文件
    location ~* \.(log|md|json|lock)$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    # ---------- 请求体大小限制（文件上传） ----------
    client_max_body_size 100m;

    # ---------- 访问日志 ----------
    access_log /var/log/nginx/aicq_access.log;
    error_log  /var/log/nginx/aicq_error.log warn;
}
```

### 11.1 配置检查与部署

```bash
# 测试配置语法
sudo nginx -t

# 重新加载配置（不中断服务）
sudo systemctl reload nginx

# 或完全重启
sudo systemctl restart nginx
```

### 11.2 日志查看

```bash
# 查看访问日志
sudo tail -f /var/log/nginx/aicq_access.log

# 查看错误日志
sudo tail -f /var/log/nginx/aicq_error.log

# 按时间筛选
sudo awk '{print $4}' /var/log/nginx/aicq_access.log | sort | uniq -c | sort -rn | head -20
```

---

## 12. CDN / 静态托管部署

如果 API 服务部署在独立域名，可以将 AICQ Web 客户端部署到 CDN 或静态托管平台，实现全球加速和零运维。

> **重要前提**：API 服务必须配置 CORS（跨域资源共享），允许前端域名的请求。

### 12.1 Vercel 部署

在项目根目录创建 `vercel.json`：

```json
{
  "buildCommand": "cd aicq-web && npm install && npm run build",
  "outputDirectory": "aicq-web/dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ]
}
```

部署步骤：

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署（首次需要登录）
vercel

# 生产环境部署
vercel --prod
```

### 12.2 Netlify 部署

在 `aicq-web/public/` 目录下创建 `_redirects` 文件：

```
/*    /index.html   200
```

部署步骤：

1. 登录 [Netlify](https://app.netlify.com)
2. 点击 **Add new site** → **Import an existing project**
3. 连接 Git 仓库
4. 配置构建设置：
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Base directory**: `aicq-web`
5. 点击 **Deploy site**

或使用 CLI：

```bash
npm i -g netlify-cli
netlify deploy --dir=dist --prod
```

### 12.3 Cloudflare Pages

部署步骤：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. 选择仓库和分支
4. 配置构建设置：
   - **Build command**: `cd aicq-crypto && npm run build && cd ../aicq-web && npm install && npm run build`
   - **Build output directory**: `aicq-web/dist`
5. 点击 **Save and Deploy**

### 12.4 GitHub Pages

```bash
# 使用 gh-pages 包部署
cd aicq-web
npm install gh-pages --save-dev

# 在 package.json 中添加脚本
# "deploy:gh": "gh-pages -d dist"

# 构建
npm run build

# 部署
npx gh-pages -d dist
```

> **注意**：GitHub Pages 默认不支持 SPA 路由。需在 `index.html` 中添加 404 页面回退脚本，或使用 [spa-github-pages](https://github.com/rafrex/spa-github-pages) 方案。

### 12.5 阿里云 OSS / 腾讯云 COS

#### 阿里云 OSS

```bash
# 安装 ossutil
# https://help.aliyun.com/document_detail/120075.html

# 上传构建产物
ossutil cp -r dist/ oss://your-bucket-name/aicq/ --force

# 配置 OSS 静态网站托管
# 在 OSS 控制台 → 基础设置 → 静态页面 → 开启
# 默认首页：index.html
# 默认 404 页：index.html（SPA 路由回退）
```

#### 腾讯云 COS

```bash
# 安装 COSCMD
pip install coscmd

# 配置
coscmd config -a <SecretId> -s <SecretKey> -b <BucketName> -r <Region>

# 上传
coscmd upload -r dist/ /aicq/

# 在 COS 控制台开启静态网站托管
# 默认首页和错误页均设为 index.html
```

---

## 13. Docker 部署

### 13.1 Dockerfile

在 `aicq-web/` 目录下创建 `Dockerfile`：

```dockerfile
# ============================================================
# AICQ Web Client — 多阶段构建 Dockerfile
# ============================================================

# ---------- 阶段一：依赖安装 ----------
FROM node:20-alpine AS deps
WORKDIR /app

# 先复制 monorepo 的密码学库（本地 file: 依赖）
COPY aicq-crypto/package*.json ./aicq-crypto/
COPY aicq-web/package*.json ./aicq-web/

# 安装 Web 客户端依赖
WORKDIR /app/aicq-web
RUN npm install

# 安装密码学库依赖并构建
WORKDIR /app/aicq-crypto
RUN npm install && npm run build

# ---------- 阶段二：构建 ----------
FROM node:20-alpine AS builder
WORKDIR /app

# 复制依赖和源代码
COPY --from=deps /app/aicq-web/node_modules ./aicq-web/node_modules
COPY --from=deps /app/aicq-crypto/node_modules ./aicq-crypto/node_modules
COPY --from=deps /app/aicq-crypto/dist ./aicq-crypto/dist
COPY aicq-crypto/package*.json ./aicq-crypto/
COPY aicq-crypto/src ./aicq-crypto/src/
COPY aicq-crypto/tsconfig.json ./aicq-crypto/
COPY aicq-web/src ./aicq-web/src/
COPY aicq-web/index.html ./aicq-web/
COPY aicq-web/vite.config.ts ./aicq-web/
COPY aicq-web/tsconfig.json ./aicq-web/
COPY aicq-web/tsconfig.node.json ./aicq-web/ 2>/dev/null || true

# 构建密码学库链接和 Web 产物
WORKDIR /app/aicq-web
RUN npm run build

# ---------- 阶段三：生产镜像 ----------
FROM nginx:alpine AS production

# 复制构建产物到 Nginx
COPY --from=builder /app/aicq-web/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 13.2 Nginx 配置（Docker 内）

创建 `aicq-web/nginx.conf`（Docker 容器内使用）：

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # 静态资源缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

### 13.3 构建和运行 Docker 镜像

```bash
# 在 monorepo 根目录（aicq/）执行

# 构建镜像
docker build -f aicq-web/Dockerfile -t aicq-web:latest .

# 运行容器
docker run -d \
  --name aicq-web \
  -p 8080:80 \
  --restart unless-stopped \
  aicq-web:latest

# 查看日志
docker logs -f aicq-web

# 测试
curl -I http://localhost:8080
```

### 13.4 Docker Compose 集成

如果需要将 Web 客户端和后端服务一起编排：

```yaml
# docker-compose.yml
version: '3.8'

services:
  # AICQ 后端服务
  aicq-server:
    build:
      context: ./aicq-server
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped

  # AICQ Web 客户端
  aicq-web:
    build:
      context: .
      dockerfile: aicq-web/Dockerfile
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - aicq-server
    restart: unless-stopped
    volumes:
      - ./nginx-production.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro  # SSL 证书（如果需要）
```

```bash
# 启动所有服务
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

---

## 14. 功能清单

以下是 AICQ Web 客户端支持的所有功能：

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| 1 | **端到端加密聊天** | 使用 Ed25519 签名 + X25519 密钥交换 + AES-256-GCM 加密，密钥在浏览器本地生成和存储，服务器无法解密 | ✅ |
| 2 | **AI 流式输出** | 实时逐 token 显示 AI 回复，支持光标闪烁动画效果，流结束后自动切换为完整 Markdown 渲染 | ✅ |
| 3 | **Markdown 渲染** | 支持 GFM 扩展语法（表格、任务列表、删除线），使用 `react-markdown` + `remark-gfm` 渲染 | ✅ |
| 4 | **代码语法高亮** | 集成 `react-syntax-highlighter` + Prism，支持 100+ 编程语言的语法高亮 | ✅ |
| 5 | **代码一键复制** | 代码块右上角复制按钮，点击即可将代码复制到剪贴板，附带复制成功提示 | ✅ |
| 6 | **图片预览** | 缩略图展示 + 点击放大 Lightbox 全屏查看，支持鼠标滚轮缩放和拖拽移动 | ✅ |
| 7 | **视频播放** | 自定义视频播放器，支持缩略图封面、时长显示、播放/暂停/进度控制 | ✅ |
| 8 | **文件传输** | 64KB 分块传输，支持断点续传、实时传输速度和剩余时间显示、暂停/恢复/取消操作 | ✅ |
| 9 | **拖拽上传** | 将文件或图片直接拖拽到聊天窗口即可上传，支持同时拖拽多个文件 | ✅ |
| 10 | **临时号码发现** | 6 位数字临时号码（10 分钟有效），无需交换 ID 即可发现并添加好友 | ✅ |
| 11 | **QR 码密钥导出** | 将公钥指纹生成 QR 码，方便好友扫描建立加密连接 | ✅ |
| 12 | **QR 码密钥导入** | 扫描好友的 QR 码，自动获取公钥信息并发起握手 | ✅ |
| 13 | **好友在线状态** | 实时显示好友在线/离线状态，基于 WebSocket presence 机制 | ✅ |
| 14 | **正在输入提示** | 当对方正在输入时显示「正在输入...」提示 | ✅ |
| 15 | **消息状态** | 发送 → 已发送 → 已送达 → 已读，完整消息状态追踪 | ✅ |
| 16 | **未读消息计数** | 聊天列表显示每个对话的未读消息数 | ✅ |
| 17 | **SPA 路由** | 登录、聊天列表、聊天、好友管理、临时号码、设置，所有页面无刷新切换 | ✅ |
| 18 | **本地数据存储** | 使用 localStorage 存储密钥、好友列表、聊天记录等，无需后端存储 | ✅ |
| 19 | **WebSocket 自动重连** | 断线后自动指数退避重连（最大延迟 30 秒），心跳保活（30 秒间隔） | ✅ |
| 20 | **Toast 通知** | 使用 `react-hot-toast` 实现非阻塞式消息通知 | ✅ |
| 21 | **自定义 UI 组件** | 不依赖第三方 UI 框架，所有组件均为自定义实现，完全控制样式和行为 | ✅ |

---

## 15. 性能优化

### 15.1 代码分割

Vite 默认使用 Rollup 进行代码分割。对于大型应用，建议手动配置 chunk 分割策略：

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        // React 核心（约 40KB gzipped）
        'react-vendor': ['react', 'react-dom'],
        // 密码学库（约 20KB gzipped）
        'crypto': ['tweetnacl', 'tweetnacl-util'],
        // Markdown 渲染（约 50KB gzipped）
        'markdown': ['react-markdown', 'remark-gfm', 'react-syntax-highlighter'],
      },
    },
  },
},
```

### 15.2 路由级懒加载

对于 SPA 中不同的页面/屏幕，使用 React 懒加载实现按需加载：

```typescript
import { lazy, Suspense } from 'react';

const ChatScreen = lazy(() => import('./screens/ChatScreen'));
const FriendsScreen = lazy(() => import('./screens/FriendsScreen'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      {state.screen === 'chat' && <ChatScreen />}
      {state.screen === 'friends' && <FriendsScreen />}
    </Suspense>
  );
}
```

### 15.3 图片优化

| 优化项 | 方案 | 效果 |
|--------|------|------|
| **缩略图生成** | 客户端 Canvas 缩放至 320px | 减少 80%+ 图片加载时间 |
| **延迟加载** | `loading="lazy"` 属性 | 仅加载可视区域图片 |
| **WebP 格式** | 优先使用 WebP，回退 JPEG | 减少 30% 文件大小 |
| **压缩质量** | 缩略图 JPEG 质量 0.7 | 在清晰度和大小间平衡 |

```tsx
// 图片延迟加载
<img
  src={thumbnailUrl}
  loading="lazy"
  decoding="async"
  alt={fileName}
/>
```

### 15.4 Service Worker (PWA)

可添加 Service Worker 实现离线缓存和 PWA 支持：

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

plugins: [
  react(),
  VitePWA({
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /\/api\//,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            expiration: { maxEntries: 100, maxAgeSeconds: 300 },
          },
        },
      ],
    },
  }),
],
```

### 15.5 Gzip / Brotli 压缩

**Nginx 端（Gzip）**：见[第 11 节配置](#11-nginx-完整配置)中的 gzip 配置。

**Brotli（更高压缩率）**：

```bash
# 安装 Brotli 模块
sudo apt install nginx-module-brotli

# 在 Nginx 配置中启用
brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css application/json application/javascript text/xml;
brotli_min_length 1024;
```

**构建时预压缩**：

```bash
# 安装 vite-plugin-compression
npm install vite-plugin-compression --save-dev

# 在 vite.config.ts 中配置
import viteCompression from 'vite-plugin-compression';

plugins: [
  react(),
  viteCompression({ algorithm: 'gzip' }),
  viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
],
```

### 15.6 其他优化建议

- **DNS 预解析**：在 `index.html` 中添加 `<link rel="dns-prefetch" href="//api.example.com">`
- **预连接**：`<link rel="preconnect" href="https://api.example.com" crossorigin>`
- **HTTP/2 Server Push**：通过 Nginx 推送关键 CSS/JS 文件
- **资源提示**：`<link rel="modulepreload" href="/assets/index-xxx.js">`

---

## 16. 故障排查

### 16.1 构建失败

#### 问题：`npm run build` 报 TypeScript 类型错误

```
error TS2307: Cannot find module '@aicq/crypto'
```

**解决方案**：

```bash
# 1. 确认密码学库已构建
cd aicq-crypto
npm install
npm run build

# 2. 确认 Web 客户端的符号链接正确
cd ../aicq-web
ls -la node_modules/@aicq/crypto

# 3. 如果链接不存在，重新安装
rm -rf node_modules
npm install

# 4. 清理 TypeScript 缓存并重新构建
rm -rf node_modules/.vite
npm run build
```

#### 问题：Vite 构建报错 `Could not resolve dependency`

**解决方案**：

```bash
# 清理所有缓存
rm -rf node_modules/.vite
rm -rf node_modules
rm -rf dist

# 重新安装
npm install
npm run build
```

### 16.2 部署后白屏

#### 问题：浏览器打开后白屏，控制台报 404

**原因**：静态资源路径不正确（部署在子目录时常见）。

**解决方案**：

```typescript
// vite.config.ts 中配置 base
export default defineConfig({
  base: '/aicq/',   // 如果部署在 https://example.com/aicq/
  // base: '/',     // 如果部署在根路径
});
```

```nginx
# Nginx 确保正确配置 try_files
location / {
    try_files $uri $uri/ /index.html;
}
```

#### 问题：控制台报 `Uncaught SyntaxError` 或 CORS 错误

**解决方案**：

```bash
# 检查 Nginx MIME 类型配置
# 确保 nginx.conf 中包含：
include /etc/nginx/mime.types;

# 检查 CSP 安全头是否过于严格
# 适当放宽 Content-Security-Policy
```

### 16.3 WebSocket 无法连接

#### 问题：聊天功能正常但收不到实时消息

**排查步骤**：

```bash
# 1. 检查 WebSocket 代理配置
# 确认 Nginx 有 WebSocket 升级头：
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# 2. 检查后端 WebSocket 端口
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  http://localhost:3000/ws

# 3. 检查防火墙
sudo ufw allow 3000/tcp
sudo ufw allow 443/tcp

# 4. 检查浏览器控制台
# 打开 DevTools → Network → WS 标签，查看 WebSocket 连接状态
```

### 16.4 API 请求 404

#### 问题：所有 API 请求返回 404

**排查步骤**：

```bash
# 1. 确认后端服务正在运行
curl http://localhost:3000/api/v1/health

# 2. 检查 Nginx 代理配置
# 确认 proxy_pass 地址和端口正确
location /api/ {
    proxy_pass http://127.0.0.1:3000;  # 注意末尾不要带 /
}

# 3. 检查 Nginx 日志
sudo tail -f /var/log/nginx/aicq_error.log
```

### 16.5 移动端构建错误

#### 问题：`npx cap sync` 报错

**解决方案**：

```bash
# 1. 确认 Web 产物存在
ls dist/index.html

# 2. 确认 Capacitor 已正确安装
npm ls @capacitor/core @capacitor/cli

# 3. 清理并重新同步
rm -rf android ios
npx cap add android
npx cap sync android

# 4. iOS 特有：更新 CocoaPods
cd ios/App && pod install && cd ../..
```

#### 问题：Android Studio 编译失败

**解决方案**：

```bash
# 1. 更新 Gradle
cd android
./gradlew --version

# 2. 清理构建缓存
./gradlew clean

# 3. 在 Android Studio 中
# File → Invalidate Caches → Restart

# 4. 同步项目
# File → Sync Project with Gradle Files
```

---

## 17. 升级更新

### 17.1 标准更新流程

当有新版本发布时，按以下步骤更新 Web 客户端：

```bash
# 1. 进入项目目录
cd aicq

# 2. 拉取最新代码
git pull origin main

# 3. 更新密码学库（如果有变更）
cd aicq-crypto
npm install
npm run build

# 4. 更新 Web 客户端
cd ../aicq-web
npm install          # 安装新增/更新的依赖
npm run build        # 重新构建

# 5. 部署到服务器
rsync -avz --delete dist/ user@your-server:/usr/share/nginx/aicq/
```

### 17.2 零停机更新

为了实现零停机部署，可以采用以下策略：

**方案一：先部署后重载**

```bash
# 将新版本上传到临时目录
rsync -avz dist/ user@server:/usr/share/nginx/aicq-new/

# 在服务器上原子替换
ssh user@server "
  mv /usr/share/nginx/aicq /usr/share/nginx/aicq-old &&
  mv /usr/share/nginx/aicq-new /usr/share/nginx/aicq &&
  nginx -s reload
"
```

**方案二：双目录蓝绿部署**

```nginx
# 使用 Nginx upstream 切换
upstream aicq_backend {
    server unix:/var/run/aicq-blue.sock;
    # server unix:/var/run/aicq-green.sock;  # 切换时取消注释
}
```

### 17.3 版本回退

如果新版本有问题，可以快速回退：

```bash
# 方式一：从备份恢复
ssh user@server "
  mv /usr/share/nginx/aicq /usr/share/nginx/aicq-failed &&
  mv /usr/share/nginx/aicq-old /usr/share/nginx/aicq &&
  nginx -s reload
"

# 方式二：Git 回退
cd aicq
git log --oneline -5          # 查看历史版本
git checkout v1.0.0           # 回退到指定版本
npm run build                 # 重新构建
```

### 17.4 移动端更新

移动端 App 的更新需要重新打包并发布：

```bash
# Android 更新流程
npm run build
npx cap sync android
npx cap open android
# 在 Android Studio 中构建新版本 APK
# 上传到 Play Store 或分发渠道

# iOS 更新流程
npm run build
npx cap sync ios
npx cap open ios
# 在 Xcode 中 Archive 并提交到 App Store
```

---

## 18. 开发调试

### 18.1 开发环境搭建

```bash
# 1. 克隆仓库
git clone https://github.com/ctz168/aicq.git
cd aicq

# 2. 构建密码学依赖
cd aicq-crypto
npm install
npm run build

# 3. 启动前端开发服务器
cd ../aicq-web
npm install
npm run dev
```

### 18.2 开发服务器

```bash
npm run dev
```

Vite 开发服务器特性：

| 特性 | 说明 |
|------|------|
| **端口** | 默认 5173 |
| **HMR** | 修改代码后浏览器自动热更新（无需刷新） |
| **API 代理** | `/api/*` → `http://localhost:3000` |
| **WebSocket 代理** | `/ws` → `ws://localhost:3000` |
| **HTTPS** | `npm run dev -- --host`（局域网访问） |

### 18.3 代理配置

开发时 Vite 自动代理请求到后端。如果后端运行在不同端口，修改 `vite.config.ts`：

```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',  // 修改为实际后端地址
      changeOrigin: true,
    },
    '/ws': {
      target: 'ws://localhost:3000',     // 修改为实际 WebSocket 地址
      ws: true,
    },
  },
},
```

### 18.4 调试工具

#### React Developer Tools

```bash
# 安装 Chrome 扩展
# 搜索 "React Developer Tools" 并安装
```

使用方法：
1. 打开 Chrome DevTools（F12）
2. 切换到 **Components** 标签
3. 查看和修改 React 组件树、Props、State

#### 浏览器 DevTools

| 标签 | 用途 |
|------|------|
| **Network** | 查看 API 请求、WebSocket 消息、资源加载 |
| **Console** | 查看日志输出、错误信息 |
| **Application** | 查看 localStorage 数据（密钥、好友、聊天记录） |
| **Performance** | 性能分析、帧率监控 |

#### WebSocket 调试

1. Chrome DevTools → **Network** → **WS** 过滤
2. 点击 WebSocket 连接
3. 查看 Messages 列表（发送/接收的消息）
4. 验证消息格式和内容

#### 查看 localStorage 中的 AICQ 数据

```javascript
// 在 Console 中执行
const data = JSON.parse(localStorage.getItem('aicq_store'));
console.log('用户 ID:', data.userId);
console.log('好友数量:', Object.keys(data.friends).length);
console.log('临时号码:', data.tempNumbers);
```

### 18.5 TypeScript 严格检查

项目启用了 TypeScript 严格模式：

```json
{
  "compilerOptions": {
    "strict": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

开发时确保 IDE（VS Code 推荐）配置了 TypeScript 语言服务，可以获得实时的类型检查和智能提示。

### 18.6 ESLint / Prettier（推荐）

虽然项目当前未强制配置，但建议添加代码风格检查：

```bash
# 安装 ESLint + Prettier
npm install -D eslint prettier eslint-config-prettier @typescript-eslint/parser

# 初始化 ESLint
npx eslint --init
```

### 18.7 常用开发命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（端口 5173） |
| `npm run build` | TypeScript 检查 + 生产构建 |
| `npm run preview` | 预览构建产物（端口 4173） |
| `npx cap sync android` | 同步 Web 资源到 Android |
| `npx cap sync ios` | 同步 Web 资源到 iOS |
| `npx cap open android` | 在 Android Studio 中打开 |
| `npx cap open ios` | 在 Xcode 中打开 |

---

## 附录 A：相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 移动端构建指南 | [BUILD_MOBILE.md](./BUILD_MOBILE.md) | Capacitor Android/iOS 构建简要说明 |
| 项目主 README | [../README.md](../README.md) | 项目整体说明 |
| API 文档 | [../aicq-server/README.md](../aicq-server/README.md) | 后端 API 接口文档 |
| 密码学库说明 | [../aicq-crypto/README.md](../aicq-crypto/README.md) | 加密算法和 API |

## 附录 B：快速命令参考

```bash
# ===== Web 构建 =====
cd aicq-crypto && npm run build     # 构建密码学库
cd aicq-web && npm run build        # 构建 Web 客户端
npm run preview                     # 预览构建产物

# ===== 部署 =====
rsync -avz dist/ server:/path/      # 部署到服务器
sudo systemctl reload nginx         # 重载 Nginx

# ===== 移动端 =====
npx cap sync android                # 同步到 Android
npx cap sync ios                    # 同步到 iOS
npx cap open android                # 打开 Android Studio
npx cap open ios                    # 打开 Xcode

# ===== Docker =====
docker build -t aicq-web .          # 构建镜像
docker run -p 8080:80 aicq-web      # 运行容器

# ===== 调试 =====
npm run dev                         # 启动开发服务器
# Chrome: chrome://inspect          # 调试 WebView
# Console: localStorage.getItem('aicq_store')  # 查看本地数据
```

---

> **如有问题**，请在 [GitHub Issues](https://github.com/ctz168/aicq/issues) 提交问题报告。
