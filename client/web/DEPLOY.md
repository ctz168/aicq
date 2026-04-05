# AICQ Web 客户端 — 部署指南

> **包名**: `@aicq/web`
> **仓库**: https://github.com/ctz168/aicq.git
> **许可**: 见项目 LICENSE
> **最后更新**: 2025-06

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

核心加密方案使用 Ed25519（签名）、X25519（密钥交换）、AES-256-GCM（消息加密），所有密码学操作通过本地依赖 `@aicq/crypto`（链接到 `../../shared/crypto`）在浏览器端完成。

### 1.2 项目目录结构

AICQ 采用 monorepo 结构，核心目录如下：

```
aicq/                          # 项目根目录
├── shared/crypto/             # @aicq/crypto 密码学库（构建前置依赖）
├── server/                    # 后端服务（HTTP API + WebSocket）
│   ├── src/                   # 服务端源码
│   ├── admin/                 # 管理后台面板（Next.js）
│   └── docker/                # Docker 相关配置
├── client/web/                # @aicq/web Web 客户端（本目录）
├── client/cli/                # CLI 客户端
├── client/mobile/             # 移动端（Capacitor）
├── client/desktop/            # 桌面端（Electron）
└── plugin/                    # OpenClaw 插件
```

### 1.3 服务器地址

| 环境 | HTTP API 基地址 | WebSocket 地址 |
|------|-----------------|----------------|
| **开发环境** | `http://localhost:61018/api/v1/` | `ws://localhost:61018/ws` |
| **生产环境** | `https://aicq.online/api/v1/` | `wss://aicq.online/ws` |

> **注意**：后端 HTTP API 和 WebSocket 服务共用端口 **61018**。

### 1.4 支持平台

AICQ Web 客户端采用"一次构建，多端部署"的架构策略：

| 平台 | 部署方式 | 说明 |
|------|---------|------|
| **Web 浏览器** | Nginx / CDN / Docker | 传统 SPA 部署，直接通过浏览器访问 |
| **Android** | Capacitor → APK | 打包为原生 Android 应用 |
| **iOS** | Capacitor → App Store | 打包为原生 iOS 应用 |
| **桌面 WebView** | Electron / Tauri | 嵌入桌面应用壳中运行 |

### 1.5 架构图

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
              │   端口: 61018            │
              │   REST API + WebSocket   │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │    数据库 / 存储层       │
              └─────────────────────────┘
```

### 1.6 核心特性

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
- **管理后台** — 服务器内置 Next.js 管理面板，位于 `server/admin/`

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

AICQ 是 monorepo 结构，Web 客户端依赖 `shared/crypto` 模块（通过 `file:` 协议链接）。**必须先构建密码学库**，否则 Web 客户端无法编译：

```bash
# 1. 构建密码学库（Web 客户端的前置依赖，必须先执行）
cd shared/crypto
npm install
npm run build

# 2. 返回项目根目录，安装全部依赖
cd ../..
npm run install:all

# 或者仅安装 Web 客户端依赖
cd client/web
npm install
```

> **重要**：`shared/crypto` 是多个模块的共享依赖（Web 客户端、CLI 客户端、插件等），构建顺序必须为：`shared/crypto` → 其他模块。

#### 4.1.3 验证依赖安装

```bash
# 确认 @aicq/crypto 已正确链接
ls -la client/web/node_modules/@aicq/crypto
# 应指向 ../../shared/crypto 目录

# 确认关键依赖已安装
cd client/web
npm ls react vite typescript
```

### 4.2 构建命令

```bash
cd client/web

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

    # API 反向代理（后端端口 61018）
    location /api/ {
        proxy_pass http://127.0.0.1:61018;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 代理（后端端口 61018）
    location /ws {
        proxy_pass http://127.0.0.1:61018;
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
cd client/web

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
# 先构建密码学依赖（必须先执行）
cd ../../shared/crypto && npm run build

# 返回 Web 客户端，构建 Web 应用
cd ../../client/web
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
cd client/web

# 安装 Capacitor 核心包（如果未安装）
npm install @capacitor/core @capacitor/cli --save-dev

# 安装 iOS 平台支持
npm install @capacitor/ios --save-dev

# 安装常用插件（可选）
npm install @capacitor/camera @capacitor/filesystem @capacitor/share @capacitor/splash-screen @capacitor/status-bar --save-dev
```

### 6.3 构建 Web 资源

```bash
# 先构建密码学依赖（必须先执行）
cd ../../shared/crypto && npm run build

# 返回 Web 客户端，构建 Web 应用
cd ../../client/web
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
VITE_API_BASE_URL=https://aicq.online/api/v1/
VITE_WS_URL=wss://aicq.online/ws
```

---

## 8. 一键脚本部署

项目提供了一键部署脚本 `client/web/deploy.sh`，可自动完成构建和部署到 Nginx。

### 8.1 脚本位置

```
aicq/
└── client/
    └── web/
        └── deploy.sh
```

### 8.2 使用方法

```bash
# 基本用法（使用默认配置）
bash client/web/deploy.sh

# 指定目标域名
bash client/web/deploy.sh --domain=chat.example.com

# 指定 API 地址
bash client/web/deploy.sh --api-url=https://aicq.online/api/v1/

# 指定部署路径
bash client/web/deploy.sh --deploy-dir=/var/www/aicq

# 完整参数示例
sudo bash client/web/deploy.sh \
  --domain=aicq.online \
  --api-url=https://aicq.online/api/v1/ \
  --deploy-dir=/var/www/aicq \
  --ssl-email=admin@example.com
```

### 8.3 脚本功能说明

该脚本执行以下操作：

1. **检查环境** — 验证 Node.js、npm、Git 是否已安装
2. **获取源码** — 克隆或拉取 GitHub 仓库
3. **构建密码学库** — `cd shared/crypto && npm install && npm run build`
4. **构建 Web 客户端** — `cd client/web && npm install && npm run build`
5. **部署文件** — 将 `dist/` 复制到目标目录
6. **配置 Nginx** — 自动生成站点配置（可选）
7. **配置 SSL** — Let's Encrypt 或自签名证书（可选）
8. **验证部署** — 检查目标目录文件是否完整

### 8.4 前置条件

- 目标服务器已安装 Nginx 并配置好站点
- SSH 密钥已配置（免密登录，如远程部署）
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
        target: 'http://localhost:61018',   // 代理到后端 API
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:61018',      // 代理 WebSocket
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

在开发模式下，Vite dev server 会自动将请求代理到后端（端口 61018）：

| 路径模式 | 代理目标 | 说明 |
|---------|---------|------|
| `/api/*` | `http://localhost:61018` | REST API 请求 |
| `/ws` | `ws://localhost:61018` | WebSocket 连接 |

这意味着开发时只需运行：

```bash
# 终端 1：启动后端
cd server && npm start

# 终端 2：启动前端开发服务器
cd client/web && npm run dev
```

浏览器访问 `http://localhost:5173`，所有 `/api` 和 `/ws` 请求会自动代理到后端。

### 9.3 构建输出结构

```bash
cd client/web
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

# API 服务器地址（默认值，留空则使用当前域名）
VITE_API_BASE_URL=
VITE_WS_URL=
```

#### `.env.development`（开发环境）

```env
# 开发环境 - 使用 Vite 代理，无需配置后端地址
VITE_API_BASE_URL=http://localhost:61018/api/v1/
VITE_WS_URL=ws://localhost:61018/ws
VITE_ENABLE_DEV_TOOLS=true
```

#### `.env.production`（生产环境）

```env
# 生产环境 - 指定实际的后端 API 地址
VITE_API_BASE_URL=https://aicq.online/api/v1/
VITE_WS_URL=wss://aicq.online/ws
VITE_ENABLE_DEV_TOOLS=false
```

#### `.env.staging`（预发布环境）

```env
# 预发布环境 - 使用测试服务器
VITE_API_BASE_URL=https://staging.aicq.online/api/v1/
VITE_WS_URL=wss://staging.aicq.online/ws
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
# 后端服务端口：61018（HTTP API + WebSocket）
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
    # 后端端口 61018，API 路径前缀 /api/v1/
    location /api/ {
        proxy_pass http://127.0.0.1:61018;
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
    # 后端端口 61018，WebSocket 路径 /ws
    location /ws {
        proxy_pass http://127.0.0.1:61018;
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
  "buildCommand": "cd client/web && npm install && npm run build",
  "outputDirectory": "client/web/dist",
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

### 12.2 Cloudflare Pages 部署

```bash
# 设置构建命令和输出目录
# 构建命令：cd client/web && npm install && npm run build
# 输出目录：client/web/dist
# SPA 路由重写：/* → /index.html
```

### 12.3 Netlify 部署

在项目根目录创建 `netlify.toml`：

```toml
[build]
  command = "cd client/web && npm install && npm run build"
  publish = "client/web/dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

---

## 13. Docker 部署

项目提供了 Docker 配置，位于 `server/docker/` 目录。

### 13.1 项目 Docker 文件

| 文件 | 路径 | 说明 |
|------|------|------|
| **Dockerfile** | `server/Dockerfile` | 后端服务镜像定义 |
| **docker-compose.yml** | `server/docker/docker-compose.yml` | 编排配置 |
| **nginx.conf** | `server/docker/nginx.conf` | 容器内 Nginx 配置 |
| **entrypoint.sh** | `server/docker/entrypoint.sh` | 启动脚本 |

### 13.2 端口映射

Docker 部署会暴露以下端口：

| 端口 | 用途 |
|------|------|
| **80** | HTTP（自动重定向到 HTTPS） |
| **443** | HTTPS（Web 客户端 + API 代理 + WebSocket 代理） |
| **61018** | 后端直连（HTTP API + WebSocket） |

### 13.3 使用 Docker Compose 启动

```bash
# 进入 Docker 配置目录
cd server/docker

# 启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f

# 停止所有服务
docker compose down
```

### 13.4 Docker 内 Nginx 配置说明

容器内的 Nginx 配置（`server/docker/nginx.conf`）已预设：

- **反向代理** `/api/` → 后端 `127.0.0.1:61018`
- **WebSocket** `/ws` → 后端 `127.0.0.1:61018`
- **健康检查** `/health` → 后端 `127.0.0.1:61018`
- **管理后台** `/` → Next.js 管理面板 `127.0.0.1:80`
- SSL 证书路径：`/etc/nginx/ssl/aicq.online.crt` 和 `aicq.online.key`

### 13.5 构建自定义镜像

```bash
# 从项目根目录构建
docker build -f server/Dockerfile -t aicq:latest .

# 运行容器
docker run -d \
  --name aicq \
  -p 80:80 \
  -p 443:443 \
  -p 61018:61018 \
  -e NODE_ENV=production \
  -e PORT=61018 \
  -e DOMAIN=aicq.online \
  -e JWT_SECRET=your-secure-secret-here \
  -v aicq-data:/app/data \
  aicq:latest
```

---

## 14. 功能清单

### 14.1 核心通信功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **端到端加密聊天** | ✅ | Ed25519/X25519/AES-256-GCM |
| **AI 流式输出** | ✅ | 实时 token 逐字显示 |
| **Markdown 渲染** | ✅ | GFM + Prism 语法高亮 |
| **WebSocket 实时通信** | ✅ | 长连接，即时消息推送 |
| **文件传输** | ✅ | 64KB 分块，断点续传 |
| **图片预览** | ✅ | 缩略图 + Lightbox |
| **视频播放** | ✅ | 自定义播放器 |
| **拖拽上传** | ✅ | 文件和图片 |

### 14.2 社交功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **好友管理** | ✅ | 添加/删除/黑名单 |
| **临时号码发现** | ✅ | 6 位数，限时有效 |
| **QR 码密钥交换** | ✅ | 扫码添加好友 |
| **群聊** | ✅ | 多人加密群组 |

### 14.3 管理后台功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **用户管理** | ✅ | 查看账户、封禁/解封 |
| **服务监控** | ✅ | 在线状态、连接数 |
| **系统配置** | ✅ | 参数调整 |
| **日志查看** | ✅ | 操作日志 |

---

## 15. 性能优化

### 15.1 构建优化

- **代码分割**：通过 Vite 的 `manualChunks` 将 React 等大型依赖拆分为独立 chunk
- **Tree-shaking**：Vite 默认启用，自动移除未使用的代码
- **资源预构建**：`optimizeDeps.include` 配置了 `@aicq/crypto`、`tweetnacl` 等，提前构建依赖

### 15.2 部署优化

- **长期缓存**：Vite 产物文件名包含内容哈希，可设置 `Cache-Control: immutable`
- **Gzip 压缩**：Nginx 启用 Gzip，显著减少传输体积
- **CDN 加速**：静态资源可通过 CDN 全球分发
- **HTTP/2**：Nginx 启用 HTTP/2，多路复用减少延迟

### 15.3 运行时优化

- **密码学库预构建**：`@aicq/crypto` 在 Vite dev 模式下预优化，避免热更新卡顿
- **虚拟列表**：聊天记录使用虚拟滚动，避免大量 DOM 节点
- **WebSocket 长连接**：复用连接，避免频繁握手
- **本地存储**：使用 `localStorage` 缓存用户数据和会话

---

## 16. 故障排查

### 16.1 构建失败

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `Cannot find module @aicq/crypto` | `shared/crypto` 未构建 | 先执行 `cd shared/crypto && npm install && npm run build` |
| TypeScript 编译错误 | 类型不匹配 | 运行 `npx tsc --noEmit` 查看具体错误 |
| Vite 构建超时 | 内存不足 | 增加 Node.js 内存：`NODE_OPTIONS=--max-old-space-size=4096 npm run build` |

### 16.2 运行时问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| WebSocket 连接失败 | 后端未启动或端口错误 | 确认后端运行在端口 **61018** |
| API 请求 404 | API 路径不正确 | 确认 API 前缀为 `/api/v1/` |
| CORS 错误 | 后端未允许前端域名 | 检查后端 CORS 配置 |
| 页面空白 | 路由回退未配置 | Nginx 需要配置 `try_files $uri $uri/ /index.html` |

### 16.3 部署验证清单

```bash
# 1. 检查后端服务
curl http://localhost:61018/health

# 2. 检查 API 响应
curl https://aicq.online/api/v1/health

# 3. 检查 WebSocket 连接
wscat -c wss://aicq.online/ws

# 4. 检查静态文件
curl -I https://aicq.online/index.html

# 5. 检查 Nginx 配置
sudo nginx -t
```

---

## 17. 升级更新

### 17.1 标准升级流程

```bash
# 1. 拉取最新代码
cd aicq
git pull origin main

# 2. 更新密码学库（如有变更）
cd shared/crypto
npm install
npm run build

# 3. 重新构建 Web 客户端
cd ../../client/web
npm install
npm run build

# 4. 部署更新
rm -rf /usr/share/nginx/aicq/*
cp -r dist/* /usr/share/nginx/aicq/
```

### 17.2 使用根目录快捷命令

```bash
cd aicq

# 一键构建所有模块（含密码学库）
npm run build

# 仅构建密码学库
npm run build:crypto

# 仅构建 Web 客户端（需先 build:crypto）
npm run build:web

# 清理所有构建产物
npm run clean
```

### 17.3 回滚

```bash
# 如果有备份
cp -r /usr/share/nginx/aicq.backup.20250601/* /usr/share/nginx/aicq/

# 或使用 Git 回退
git checkout <previous-tag>
cd shared/crypto && npm run build
cd ../../client/web && npm run build
```

---

## 18. 开发调试

### 18.1 本地开发环境启动

```bash
# 终端 1：构建并启动后端（端口 61018）
cd server
npm install
npm start
# 输出: [aicq-server] HTTP + WebSocket server running on port 61018

# 终端 2：启动前端开发服务器（端口 5173）
cd client/web
npm install
npm run dev
# 输出: Local: http://localhost:5173/
```

浏览器访问 `http://localhost:5173`，Vite 会自动将 `/api/*` 和 `/ws` 代理到后端 `localhost:61018`。

### 18.2 后端健康检查

```bash
curl http://localhost:61018/health
# 响应: {"status":"ok","domain":"aicq.online","uptime":...}
```

### 18.3 管理后台开发

```bash
# 启动管理后台开发服务器
cd server/admin
npm install
npm run dev
# Next.js 开发服务器默认端口 3000
```

### 18.4 常用开发命令

```bash
# 从项目根目录执行

# 安装所有模块依赖
npm run install:all

# 构建密码学库
npm run build:crypto

# 构建后端
npm run build:server

# 构建管理后台
npm run build:admin

# 构建插件
npm run build:plugin

# 启动后端开发服务器
npm run dev:server

# 启动前端开发服务器
npm run dev:web

# 启动管理后台开发服务器
npm run dev:admin

# 清理所有构建产物
npm run clean
```

### 18.5 WebSocket 调试工具

```bash
# 使用 wscat 连接 WebSocket
npm install -g wscat
wscat -c ws://localhost:61018/ws

# 使用浏览器开发者工具
# F12 → Network → WS 标签页，查看 WebSocket 帧数据
```
