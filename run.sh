#!/usr/bin/env bash
# ============================================================
#  AICQ AI聊天服务器 — 一键部署运行脚本（跨平台）
#  用法: bash run.sh
# ============================================================
set -e

# ---------- 配置 ----------
PORT="${AICQ_PORT:-61018}"
DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$DIR/.venv"

# ---------- 颜色 ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}[ OK ]${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
err()   { printf "${RED}[ERR]${NC}  %s\n" "$1"; }

# ---------- 检测 Python ----------
detect_python() {
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            ver=$($cmd -c 'import sys; print(".".join(map(str,sys.version_info[:3])))')
            major=$(echo "$ver" | cut -d. -f1)
            minor=$(echo "$ver" | cut -d. -f2)
            if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
                echo "$cmd"
                return 0
            fi
        fi
    done
    return 1
}

# ---------- 创建虚拟环境 & 安装依赖 ----------
setup_venv() {
    if [ -f "$VENV_DIR/bin/python" ]; then
        ok "虚拟环境已存在"
        return 0
    fi

    PY=$(detect_python)
    if [ -z "$PY" ]; then
        err "需要 Python >= 3.10，请先安装"
        exit 1
    fi
    ok "使用 $PY ($($PY --version 2>&1))"

    info "创建虚拟环境..."
    "$PY" -m venv "$VENV_DIR" 2>/dev/null || {
        warn "venv 不可用，尝试 --break-system-packages 安装"
        export PIP_BREAK_SYSTEM_PACKAGES=1
    }

    if [ -f "$VENV_DIR/bin/pip" ]; then
        PIP="$VENV_DIR/bin/pip"
    else
        PIP="$PY -m pip"
    fi

    info "安装依赖..."
    if [ -f "$DIR/requirements.txt" ]; then
        $PIP install -q -r "$DIR/requirements.txt" 2>/dev/null || \
        $PIP install -q --break-system-packages -r "$DIR/requirements.txt" 2>/dev/null || {
            err "依赖安装失败，请手动运行: pip install -r requirements.txt"
            exit 1
        }
    fi
    ok "依赖安装完成"
}

# ---------- 打开浏览器 ----------
open_browser() {
    url="http://localhost:${PORT}/admin"
    info "正在打开浏览器: $url"
    sleep 2
    case "$(uname -s)" in
        Darwin)  open "$url" 2>/dev/null     ;;
        Linux)   xdg-open "$url" 2>/dev/null || sensible-browser "$url" 2>/dev/null ;;
        MINGW*|MSYS*|CYGWIN*) start "$url" 2>/dev/null ;;
        *)       ;;
    esac
    ok "浏览器已打开 (如未自动打开请手动访问 $url)"
}

# ---------- 启动服务器 ----------
start_server() {
    PYTHON="$VENV_DIR/bin/python"
    [ ! -f "$PYTHON" ] && PYTHON=$(detect_python)

    cd "$DIR"

    # 设置端口
    export AICQ_PORT="$PORT"

    info "启动 AICQ AI聊天服务器 (端口: $PORT) ..."
    echo ""
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║   AICQ AI聊天服务器  —  运行中              ║"
    echo "  ╠══════════════════════════════════════════════╣"
    echo "  ║  管理后台: http://localhost:${PORT}/admin       ║"
    echo "  ║  API 文档: http://localhost:${PORT}/api/v1      ║"
    echo "  ║  健康检查: http://localhost:${PORT}/health      ║"
    echo "  ║  按 Ctrl+C 停止服务                          ║"
    echo "  ╚══════════════════════════════════════════════╝"
    echo ""

    exec $PYTHON server.py
}

# ---------- 主流程 ----------
main() {
    echo ""
    echo "══════════════════════════════════════════════"
    echo "  AICQ AI聊天服务器 — 一键部署"
    echo "══════════════════════════════════════════════"
    echo ""

    setup_venv
    open_browser &
    start_server
}

main
