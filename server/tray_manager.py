"""
AICQ Server Tray Manager - Python Version
Cross-platform system tray manager with Chinese UI for service control

Adapted from ctz168/fund tray_manager.py for the AICQ Python server rewrite.

Features:
  - 运行状态: Dynamic service status indicator (green dot=running, red dot=stopped)
  - 开机启动: Toggle auto-start on boot via Windows Registry
  - 启动服务: Start the AICQ server service (server.py)
  - 停止服务: Stop the AICQ server service
  - 管理后台: Open admin dashboard in browser
  - 退出: Stop service and exit tray manager

Auto-start: Service starts automatically when tray manager launches.
"""

import os
import sys
import time
import socket
import psutil
import threading
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

# ============================================================
# Detect if running under pythonw (no console)
# ============================================================

IS_PYTHONW = (
    getattr(sys, 'frozen', False)  # pyinstaller bundle
    or sys.executable.endswith('pythonw.exe')
    or sys.executable.endswith('pythonw3.exe')
    or not sys.stdout  # no console attached
)

# ============================================================
# Dependency check
# ============================================================

try:
    import pystray
    from pystray import MenuItem as Item, Menu
    from PIL import Image, ImageDraw
except ImportError:
    _msg = "Error: Missing tray dependencies. Install with: pip install pystray Pillow psutil"
    print(_msg)
    # Under pythonw, print() goes nowhere - write to log file and show MessageBox
    try:
        _log_dir = Path(__file__).parent
        with open(_log_dir / "tray_manager.log", "a", encoding="utf-8") as _f:
            _f.write(f"[{datetime.now()}] [FATAL] {_msg}\n")
    except Exception:
        pass
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, _msg, "AICQ Server - 错误", 0x10)
    except Exception:
        pass
    sys.exit(1)

# ============================================================
# Configuration
# ============================================================

APP_DIR = Path(__file__).parent.absolute()
START_SCRIPT = APP_DIR / "server.py"
ICON_PATH = APP_DIR / "chat_icon.png"
LOG_FILE = APP_DIR / "tray_manager.log"
SERVICE_LOG = APP_DIR / "service.log"

# Registry key name for Windows auto-start
AUTOSTART_KEY = "AICQ-Server"


def _read_port_from_env() -> int:
    """Read PORT from environment, .env file, or Config; fallback to 61018.

    Resolution order:
      1. FUND_PORT env var (for consistency with fund project migration)
      2. PORT env var
      3. .env file (FUND_PORT or PORT)
      4. config.py Config.PORT
      5. Default 61018
    """
    # Check FUND_PORT first (migration compatibility)
    env_port = os.environ.get("FUND_PORT", "").strip()
    if env_port:
        try:
            return int(env_port)
        except ValueError:
            pass

    # Check PORT env var
    env_port = os.environ.get("PORT", "").strip()
    if env_port:
        try:
            return int(env_port)
        except ValueError:
            pass

    # Try .env file
    try:
        env_path = APP_DIR / ".env"
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("FUND_PORT="):
                        try:
                            return int(line.split("=", 1)[1].strip())
                        except ValueError:
                            pass
                    if line.startswith("PORT="):
                        try:
                            return int(line.split("=", 1)[1].strip())
                        except ValueError:
                            pass
    except Exception:
        pass

    # Try loading from config.py Config class
    try:
        # Import here to avoid circular imports or config errors blocking tray
        from config import Config  # type: ignore[import-untyped]
        return Config.PORT
    except Exception:
        pass

    return 61018


SERVICE_PORT = _read_port_from_env()


def _get_python_exe() -> str:
    """Get the python.exe path (never pythonw.exe, even if tray runs under pythonw).

    server.py needs a real console python to output logs and load properly.
    """
    exe = sys.executable
    # If running under pythonw, find the corresponding python.exe
    if exe.lower().endswith("pythonw.exe"):
        python_exe = exe[:-1]  # remove trailing 'w' -> python.exe
        if Path(python_exe).exists():
            return python_exe
        # Try common patterns in the same directory
        parent = Path(exe).parent
        for name in ("python.exe", "python3.exe"):
            candidate = parent / name
            if candidate.exists():
                return str(candidate)
    return exe


def log(message: str, level: str = "INFO"):
    """Log message to console and file.

    Under pythonw, stdout is None so we only write to the log file.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] [{level}] {message}"
    if not IS_PYTHONW:
        try:
            print(log_msg)
        except Exception:
            pass
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_msg + "\n")
    except Exception:
        pass


# ============================================================
# Chat Icon Generation
# ============================================================

def generate_chat_icon(save: bool = True) -> Image.Image:
    """Generate a chat bubble icon using Pillow.

    Creates a 64x64 chat bubble icon with:
      - Rounded rectangle body (blue #2196F3)
      - Small triangle tail at bottom-left
      - Three horizontal white dots (typing indicator)

    Parameters
    ----------
    save:
        If True, save the generated icon to chat_icon.png (only if it
        doesn't already exist).
    """
    size = 64
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # ── Chat bubble body (rounded rectangle) ──
    bubble_left = 6
    bubble_top = 4
    bubble_right = size - 6
    bubble_bottom = size - 14  # leave room for the tail

    draw.rounded_rectangle(
        [bubble_left, bubble_top, bubble_right, bubble_bottom],
        radius=10,
        fill='#2196F3',
    )

    # ── Tail / triangle at bottom-left ──
    tail_points = [
        (bubble_left + 8, bubble_bottom - 1),   # top of tail (on bubble edge)
        (bubble_left + 2, bubble_bottom + 12),   # bottom tip of tail
        (bubble_left + 18, bubble_bottom - 1),   # right side of tail (on bubble edge)
    ]
    draw.polygon(tail_points, fill='#2196F3')

    # ── Three white dots inside (typing indicator) ──
    dot_y = (bubble_top + bubble_bottom) // 2 + 2
    dot_radius = 3
    dot_spacing = 10
    center_x = (bubble_left + bubble_right) // 2

    for offset in (-dot_spacing, 0, dot_spacing):
        cx = center_x + offset
        draw.ellipse(
            [cx - dot_radius, dot_y - dot_radius, cx + dot_radius, dot_y + dot_radius],
            fill='#FFFFFF',
        )

    # ── Save to file if requested and doesn't exist ──
    if save and not ICON_PATH.exists():
        try:
            image.save(str(ICON_PATH), 'PNG')
            log(f"Chat icon saved to {ICON_PATH}")
        except Exception as e:
            log(f"Could not save chat icon: {e}", "WARN")

    return image


# ============================================================
# Icon Creation (with status dot overlay)
# ============================================================

def _load_base_icon(size: int = 64) -> Optional[Image.Image]:
    """Load the base chat icon from file or generate one.

    Returns None only if both load and generation fail.
    """
    # Try custom icon file first
    if ICON_PATH.exists():
        try:
            return Image.open(ICON_PATH).resize((size, size), Image.LANCZOS)
        except Exception:
            pass

    # Generate one programmatically
    try:
        return generate_chat_icon(save=True).resize((size, size), Image.LANCZOS)
    except Exception:
        pass

    return None


def _draw_fallback_icon(color: str = '#2196F3', size: int = 64) -> Image.Image:
    """Fallback: draw a simple rounded-rect icon with a status dot.

    Used when neither file loading nor chat icon generation works.
    """
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Background rounded rectangle (dark)
    draw.rounded_rectangle([2, 2, size - 3, size - 3], radius=10, fill='#263238')

    # Status dot in center
    margin = size // 4
    draw.ellipse([margin, margin, size - margin, size - margin], fill=color)

    # Small white highlight
    highlight_margin = size // 3
    draw.ellipse(
        [highlight_margin, highlight_margin - 2, highlight_margin + 8, highlight_margin + 6],
        fill='#FFFFFF80',
    )

    return image


def _draw_icon_image(status_color: str = '#4CAF50', size: int = 64) -> Image.Image:
    """Create a tray icon with a status dot overlay.

    Parameters
    ----------
    status_color:
        Color for the status indicator dot:
          - '#4CAF50' (green) = service running
          - '#F44336' (red)   = service stopped
    size:
        Icon size in pixels.
    """
    # Load or generate the base chat icon
    base = _load_base_icon(size)

    if base is None:
        # Ultimate fallback - simple icon with status color
        return _draw_fallback_icon(status_color, size)

    # Make a copy so we don't mutate the cached base
    image = base.copy()
    draw = ImageDraw.Draw(image)

    # ── Status dot overlay (bottom-right corner) ──
    dot_size = 14
    dot_margin = 2
    dot_left = size - dot_size - dot_margin
    dot_top = size - dot_size - dot_margin
    dot_right = size - dot_margin
    dot_bottom = size - dot_margin

    # White outline ring (gives contrast against any background)
    outline_pad = 2
    draw.ellipse(
        [dot_left - outline_pad, dot_top - outline_pad,
         dot_right + outline_pad, dot_bottom + outline_pad],
        fill='#FFFFFF',
    )

    # Colored status dot
    draw.ellipse([dot_left, dot_top, dot_right, dot_bottom], fill=status_color)

    return image


def create_running_icon() -> Image.Image:
    """Green dot overlay = service is running."""
    return _draw_icon_image('#4CAF50')


def create_stopped_icon() -> Image.Image:
    """Red dot overlay = service is stopped."""
    return _draw_icon_image('#F44336')


# ============================================================
# Service Management
# ============================================================

def _is_app_process(proc) -> bool:
    """Check if a process is our server.py server.

    Uses flexible matching: checks 'server.py' in cmdline and
    matches APP_DIR with both forward/back slash variants.
    """
    try:
        if not proc.info['name'] or 'python' not in proc.info['name'].lower():
            return False
        cmdline_list = proc.info['cmdline'] or []
        cmdline_str = ' '.join(cmdline_list)
        if 'server.py' not in cmdline_str:
            return False
        # Match APP_DIR with both slash directions (Windows can use either)
        app_dir_str = str(APP_DIR)
        app_dir_fwd = app_dir_str.replace('\\', '/')
        app_dir_bwd = app_dir_str.replace('/', '\\')
        return (app_dir_str in cmdline_str
                or app_dir_fwd in cmdline_str
                or app_dir_bwd in cmdline_str
                # Also match if the script basename is server.py and cwd matches
                or (len(cmdline_list) >= 2
                    and Path(cmdline_list[-1]).name == 'server.py'
                    and str(APP_DIR) in str(proc.cwd())))
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False


def get_server_state() -> str:
    """Check if the server process is running. Returns 'running' or 'stopped'."""
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cwd']):
            try:
                if _is_app_process(proc):
                    return "running"
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:
        log(f"Error checking server state: {e}", "ERROR")
    return "stopped"


def get_server_pid() -> Optional[int]:
    """Get the PID of the running server process, or None."""
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cwd']):
            try:
                if _is_app_process(proc):
                    return proc.pid
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception:
        pass
    return None


def kill_server_processes() -> int:
    """Kill all server processes related to this app. Returns count killed."""
    killed = 0
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cwd']):
        try:
            if _is_app_process(proc):
                proc.kill()
                killed += 1
                log(f"Killed process PID={proc.pid}")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    if killed:
        log(f"Killed {killed} server process(es)")
    return killed


def _check_port_listening() -> bool:
    """Check if the service port is being listened on via socket connect test."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            result = s.connect_ex(('127.0.0.1', SERVICE_PORT))
            return result == 0
    except Exception:
        return False


def start_server() -> bool:
    """Start the server in background. Returns True if started successfully."""
    current_state = get_server_state()
    if current_state == "running":
        log("Service is already running, skip start")
        return True

    python_exe = _get_python_exe()
    log(f"Starting AICQ service with: {python_exe} {START_SCRIPT}")

    try:
        # Open service log file for capturing server.py output
        log_fd = open(SERVICE_LOG, "w", encoding="utf-8")
        log_fd.write(f"--- AICQ service started at {datetime.now()} ---\n")
        log_fd.flush()

        # Build subprocess environment with UTF-8 mode
        # This prevents UnicodeEncodeError when server.py prints unicode chars
        # on Windows with GBK (or other non-UTF-8) system locale
        sub_env = os.environ.copy()
        sub_env["PYTHONIOENCODING"] = "utf-8"
        sub_env["PYTHONUTF8"] = "1"
        # Pass the port to the subprocess
        sub_env["PORT"] = str(SERVICE_PORT)

        # Windows-specific creation flags: new process group, no console window
        creation_flags = 0
        if os.name == 'nt':
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW

        proc = subprocess.Popen(
            [python_exe, str(START_SCRIPT)],
            cwd=str(APP_DIR),
            env=sub_env,
            creationflags=creation_flags,
            stdout=log_fd,
            stderr=subprocess.STDOUT,  # merge stderr into stdout
        )
        log(f"Service process spawned (PID={proc.pid})")

        # Wait and verify it actually started
        time.sleep(3)

        # Check if process is still alive
        if proc.poll() is not None:
            exit_code = proc.returncode
            log_fd.close()
            # Process exited immediately - read the log to see why
            error_msg = ""
            try:
                with open(SERVICE_LOG, "r", encoding="utf-8") as f:
                    error_msg = f.read()[-500:]
            except Exception:
                pass
            log(f"Service process exited immediately with code {exit_code}", "ERROR")
            log(f"Service log tail: {error_msg}", "ERROR")
            return False

        if get_server_state() == "running":
            log(f"Service started successfully (PID={proc.pid})")
            log_fd.close()
            return True
        else:
            # Process is alive but not detected by psutil yet - check port
            time.sleep(2)
            if _check_port_listening():
                log(f"Service started and listening on port {SERVICE_PORT} (PID={proc.pid})")
                log_fd.close()
                return True
            log("Service process alive but not yet detected as running", "WARN")
            log_fd.close()
            return True
    except Exception as e:
        log(f"Failed to start service: {e}", "ERROR")
        return False


def stop_server() -> bool:
    """Stop the server. Returns True if processes were killed."""
    log("Stopping AICQ service...")
    killed = kill_server_processes()
    if killed:
        time.sleep(1)
        return True
    else:
        log("No running service found to stop")
        return False


def restart_server() -> bool:
    """Restart the server."""
    log("Restarting AICQ service...")
    stop_server()
    time.sleep(1)
    return start_server()


def open_admin():
    """Open admin dashboard in default browser."""
    import webbrowser
    port = _read_port_from_env()
    url = f"http://localhost:{port}/admin"
    log(f"Opening admin panel: {url}")
    webbrowser.open(url)


# ============================================================
# Auto-start on Boot (Windows Registry)
# ============================================================

def check_autostart() -> bool:
    """Check if auto-start on boot is enabled.

    Only supported on Windows; returns False on other platforms.
    """
    if os.name != 'nt':
        return False
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
        try:
            winreg.QueryValueEx(key, AUTOSTART_KEY)
            winreg.CloseKey(key)
            return True
        except WindowsError:
            winreg.CloseKey(key)
            return False
    except Exception:
        return False


def toggle_autostart() -> bool:
    """Toggle auto-start on boot. Returns new state (True=enabled).

    Only supported on Windows; returns False on other platforms.
    """
    if os.name != 'nt':
        log("Auto-start only supported on Windows", "WARN")
        return False

    import winreg
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"

    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS)
        try:
            # Value exists -> disable
            winreg.QueryValueEx(key, AUTOSTART_KEY)
            winreg.DeleteValue(key, AUTOSTART_KEY)
            winreg.CloseKey(key)
            log("Auto-start on boot DISABLED")
            return False
        except WindowsError:
            # Value doesn't exist -> enable
            script_path = str(APP_DIR / "start.bat")
            winreg.SetValueEx(key, AUTOSTART_KEY, 0, winreg.REG_SZ, script_path)
            winreg.CloseKey(key)
            log("Auto-start on boot ENABLED")
            return True
    except Exception as e:
        log(f"Failed to toggle auto-start: {e}", "ERROR")
        return False


# ============================================================
# Tray Manager Class
# ============================================================

class TrayManager:
    """System tray manager for AICQ Server."""

    def __init__(self):
        self.icon: Optional[pystray.Icon] = None
        self.state: str = "stopped"  # "running" or "stopped"
        self.running: bool = True
        self._autostart_enabled: bool = check_autostart()

    # ------ Menu Construction ------

    def _status_text(self) -> str:
        """Dynamic status text for the context menu."""
        if self.state == "running":
            return "运行状态: ● 已运行"
        else:
            return "运行状态: ○ 已停止"

    def _autostart_text(self) -> str:
        """Dynamic auto-start toggle text for the context menu."""
        if self._autostart_enabled:
            return "开机启动: ✓ 已启用"
        else:
            return "开机启动:   未启用"

    def create_menu(self) -> Menu:
        """Create the context menu.

        Layout:
          AICQ 服务
          ─────────────
          运行状态: ● 已运行 / ○ 已停止     (read-only indicator)
          ─────────────
          开机启动: ✓ 已启用 /   未启用      (toggle, Windows only)
          ─────────────
          启动服务
          停止服务
          ─────────────
          管理后台                          (opens browser)
          ─────────────
          退出                              (stops service + exits)
        """
        menu = Menu(
            # ---- Header ----
            Item("AICQ 服务", lambda *args: None, enabled=False),

            Menu.SEPARATOR,

            # ---- Status (read-only indicator) ----
            # pystray text callable: use *args because different pystray versions
            # call text with 0, 1, or 2 arguments (icon, item, or none)
            Item(lambda *args: self._status_text(), lambda *args: None, enabled=False),

            Menu.SEPARATOR,

            # ---- Auto-start toggle (Windows only) ----
            Item(
                lambda *args: self._autostart_text(),
                self._on_toggle_autostart,
                visible=lambda *args: os.name == 'nt',
            ),

            Menu.SEPARATOR,

            # ---- Service control ----
            Item("启动服务", self._on_start),
            Item("停止服务", self._on_stop),

            Menu.SEPARATOR,

            # ---- Admin panel ----
            Item("管理后台", self._on_open_admin),

            Menu.SEPARATOR,

            # ---- Exit ----
            Item("退出", self._on_exit),
        )
        return menu

    # ------ Menu Handlers ------

    def _on_start(self, icon=None, item=None):
        """Handle '启动服务' click."""
        if self.state == "running":
            log("Service already running")
            return
        if start_server():
            self._update_status()
        else:
            log("Failed to start service", "ERROR")

    def _on_stop(self, icon=None, item=None):
        """Handle '停止服务' click."""
        if self.state == "stopped":
            log("Service already stopped")
            return
        if stop_server():
            self._update_status()

    def _on_open_admin(self, icon=None, item=None):
        """Handle '管理后台' click - opens browser to admin dashboard."""
        if self.state != "running":
            log("Service not running, starting before opening admin panel...")
            start_server()
            self._update_status()
            time.sleep(2)
        open_admin()

    def _on_toggle_autostart(self, icon=None, item=None):
        """Handle '开机启动' click - toggles Windows auto-start registry entry."""
        self._autostart_enabled = toggle_autostart()
        self._refresh_icon()

    def _on_exit(self, icon=None, item=None):
        """Handle '退出' click - stops service and exits tray manager."""
        log("Exiting: stopping service and tray manager...")
        stop_server()
        self.running = False
        if self.icon:
            self.icon.visible = False
            self.icon.stop()

    # ------ Status & Icon Updates ------

    def _update_status(self):
        """Poll service status and refresh icon/tooltip."""
        self.state = get_server_state()
        self._refresh_icon()

    def _refresh_icon(self):
        """Update icon, tooltip and menu text to match current state."""
        if not self.icon:
            return

        # Update tooltip with PID info when running
        if self.state == "running":
            pid = get_server_pid()
            pid_info = f" (PID: {pid})" if pid else ""
            self.icon.title = f"AICQ Server - 运行中{pid_info}"
            self.icon.icon = create_running_icon()
        else:
            self.icon.title = "AICQ Server - 已停止"
            self.icon.icon = create_stopped_icon()

        # Update auto-start state (may have changed externally)
        self._autostart_enabled = check_autostart()

        # Refresh menu to reflect new status text
        self.icon.menu = self.create_menu()

    # ------ Background Monitor ------

    def _status_monitor(self):
        """Background daemon thread: poll service status every 3 seconds."""
        while self.running:
            try:
                self._update_status()
            except Exception as e:
                log(f"Status monitor error: {e}", "ERROR")
            time.sleep(3)

    # ------ Main Run ------

    def run(self):
        """Run the tray manager (blocking - pystray event loop)."""
        log("=" * 50)
        log("AICQ Server Tray Manager starting...")
        log(f"App directory: {APP_DIR}")
        log(f"Service script: {START_SCRIPT}")
        log(f"Service port: {SERVICE_PORT}")
        log(f"Python executable: {_get_python_exe()}")
        log(f"Running under pythonw: {IS_PYTHONW}")

        # Create initial icon (stopped state)
        image = create_stopped_icon()
        menu = self.create_menu()

        self.icon = pystray.Icon(
            "aicq_server",
            image,
            "AICQ Server - 启动中...",
            menu,
        )

        # Auto-start the service
        log("Auto-starting AICQ service...")
        start_server()
        self._update_status()

        # Start background status monitor thread
        monitor_thread = threading.Thread(target=self._status_monitor, daemon=True)
        monitor_thread.start()

        # Run the tray icon loop (blocking)
        log("Tray icon is now active. Right-click for menu.")
        try:
            self.icon.run()
        except Exception as e:
            log(f"Tray icon error: {e}", "ERROR")


# ============================================================
# Entry Point
# ============================================================

def main():
    """Main entry point."""
    try:
        # Cross-platform notice
        if os.name != 'nt':
            log("Note: This tray manager is designed primarily for Windows.")
            log("Auto-start (registry) is Windows-only. Other features work on all platforms.")

        manager = TrayManager()
        manager.run()
    except KeyboardInterrupt:
        log("Interrupted by user")
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log(f"Fatal error: {e}\n{tb}", "ERROR")
        # Under pythonw on Windows, show a MessageBox so the user knows something went wrong
        if IS_PYTHONW and os.name == 'nt':
            try:
                import ctypes
                ctypes.windll.user32.MessageBoxW(
                    0,
                    f"AICQ服务托盘管理器崩溃:\n\n{e}\n\n详见 tray_manager.log",
                    "AICQ Server - 致命错误",
                    0x10,
                )
            except Exception:
                pass


if __name__ == "__main__":
    main()
