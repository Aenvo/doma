#!/usr/bin/env bash
# DomA CLI Runner + DomA CLI installer
#   curl -fsSL https://res.stayfork.app/d/install-doma-cli-runner.sh | bash
#
# Installs into ~/.doma/cli-runner:
#   - doma_cli_runner.py            (reveal / exec / shell on :3848)
#   - doma.py                       (conv CLI)
#   - doma_cli_bridge_daemon.py     (CLI bridge :3856/:3857; not MCP)
# Launchers: ~/bin/doma-cli-runner, ~/bin/doma
# Appends ~/bin to PATH in shell profiles (same as rustup/cargo).
# CDN sources are all under cli-runner / doma-cli — not mcp-bridge.
set -euo pipefail

BASE_URL="${DOMA_CLI_RUNNER_BASE_URL:-https://res.stayfork.app/d}"
INSTALL_DIR="${DOMA_CLI_RUNNER_HOME:-$HOME/.doma/cli-runner}"
RUNNER_PY_URL="${BASE_URL}/doma_cli_runner.py"
DOMA_PY_URL="${BASE_URL}/doma.py"
DAEMON_PY_URL="${BASE_URL}/doma_cli_bridge_daemon.py"
# User-owned bin (always creatable without root). Prefer this over ~/.local/bin.
USER_BIN="${DOMA_CLI_RUNNER_USER_BIN:-$HOME/bin}"
LOCAL_BIN="${DOMA_CLI_RUNNER_BIN:-$HOME/.local/bin}"
PATH_MARK="# DomA CLI Runner"

have_python() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null
    return $?
  fi
  return 1
}

install_python_macos() {
  if command -v brew >/dev/null 2>&1; then
    brew install python3
    return 0
  fi
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  brew install python3
}

install_python_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y python3
    return 0
  fi
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y python3
    return 0
  fi
  if command -v yum >/dev/null 2>&1; then
    sudo yum install -y python3
    return 0
  fi
  if command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm python
    return 0
  fi
  echo "[DomA CLI Runner] ERROR: install Python 3.9+ manually." >&2
  exit 1
}

ensure_python() {
  if have_python; then
    return 0
  fi
  case "$(uname -s)" in
    Darwin) install_python_macos ;;
    Linux) install_python_linux ;;
    *)
      echo "[DomA CLI Runner] ERROR: unsupported OS $(uname -s)." >&2
      exit 1
      ;;
  esac
  if ! have_python; then
    echo "[DomA CLI Runner] ERROR: Python 3.9+ missing." >&2
    exit 1
  fi
}

download() {
  local url="$1"
  local out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$out" "$url"
  else
    echo "[DomA CLI Runner] ERROR: need curl or wget" >&2
    exit 1
  fi
}

_append_path_rc() {
  local target="$1"
  local line="$2"
  touch "$target"
  if grep -qF "export PATH=\"$USER_BIN:" "$target" 2>/dev/null; then
    return 0
  fi
  printf '\n%s\n' "$line" >> "$target"
}

# Same pattern as rustup / cargo: write PATH into shell profiles once.
ensure_user_path() {
  local dir="$1"
  local line="export PATH=\"$dir:\$PATH\"  $PATH_MARK"
  _append_path_rc "$HOME/.zshrc" "$line"
  _append_path_rc "$HOME/.zprofile" "$line"
  _append_path_rc "$HOME/.bash_profile" "$line"
  _append_path_rc "$HOME/.bashrc" "$line"
}

# Write a small bash launcher into INSTALL_DIR, then copy to dest_dir as $2.
install_launcher() {
  local dest_dir="$1"
  local launcher_name="$2"
  local py_abs="$3"
  local wrapper_extra="${4:-}"
  local wrapper="$INSTALL_DIR/$launcher_name"
  mkdir -p "$dest_dir"
  cat > "$wrapper" <<EOF
#!/usr/bin/env bash
${wrapper_extra}
exec "$PY" "$py_abs" "\$@"
EOF
  chmod 755 "$wrapper"
  install -m 755 "$wrapper" "$dest_dir/$launcher_name"
}

ensure_python
mkdir -p "$INSTALL_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

download "$RUNNER_PY_URL" "$TMP/doma_cli_runner.py"
download "$DOMA_PY_URL" "$TMP/doma.py"
download "$DAEMON_PY_URL" "$TMP/doma_cli_bridge_daemon.py"
python3 -m py_compile "$TMP/doma_cli_runner.py"
python3 -m py_compile "$TMP/doma.py"
python3 -m py_compile "$TMP/doma_cli_bridge_daemon.py"
install -m 755 "$TMP/doma_cli_runner.py" "$INSTALL_DIR/doma_cli_runner.py"
install -m 755 "$TMP/doma.py" "$INSTALL_DIR/doma.py"
install -m 755 "$TMP/doma_cli_bridge_daemon.py" "$INSTALL_DIR/doma_cli_bridge_daemon.py"

INSTALL_ABS="$(cd "$INSTALL_DIR" && pwd)"
RUNNER_PY_ABS="$INSTALL_ABS/doma_cli_runner.py"
DOMA_PY_ABS="$INSTALL_ABS/doma.py"
DAEMON_PY_ABS="$INSTALL_ABS/doma_cli_bridge_daemon.py"
PY="$(command -v python3)"

# 1) Always install into ~/bin (no root)
# Runner owns bridge lifecycle; point it at installed daemon script.
install_launcher "$USER_BIN" "doma-cli-runner" "$RUNNER_PY_ABS" "export DOMA_DAEMON_SCRIPT=\"$DAEMON_PY_ABS\""
install_launcher "$USER_BIN" "doma" "$DOMA_PY_ABS"
# 2) Also ~/.local/bin when writable (common XDG path)
if [[ -w "$LOCAL_BIN" ]] || mkdir -p "$LOCAL_BIN" 2>/dev/null && [[ -w "$LOCAL_BIN" ]]; then
  install_launcher "$LOCAL_BIN" "doma-cli-runner" "$RUNNER_PY_ABS" "export DOMA_DAEMON_SCRIPT=\"$DAEMON_PY_ABS\"" || true
  install_launcher "$LOCAL_BIN" "doma" "$DOMA_PY_ABS" || true
fi
# 3) Persist PATH in shell configs
ensure_user_path "$USER_BIN"

echo "[DomA CLI Runner] installed → $USER_BIN/doma-cli-runner"
echo "[DomA CLI]        installed → $USER_BIN/doma"
echo ""
echo "Commands:"
echo "  doma-cli-runner start -d   Start DomA CLI service (helper :3848 + bridge :3856/:3857)"
echo "  doma-cli-runner stop       Stop DomA CLI service"
echo "  doma-cli-runner status"
echo "  doma-cli-runner help"
echo ""
echo "  doma help"
echo "  doma conv start -m \"...\""
echo "  doma conv send <id> -m \"...\""
echo "  doma conv result <id> [--watch]"
echo "  doma conv close <id>"
echo ""
echo "Open a new terminal, then run the commands above."
echo "Same terminal right now:"
echo "  $USER_BIN/doma-cli-runner start -d"
echo "  $USER_BIN/doma help"
