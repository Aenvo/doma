#!/usr/bin/env bash
# DomA MCP installer — installs stdio + daemon into ~/.doma/mcp
# Usage:
#   curl -fsSL https://res.stayfork.app/d/install-doma-mcp.sh | bash
set -euo pipefail

BASE_URL="${DOMA_MCP_BASE_URL:-https://res.stayfork.app/d}"
INSTALL_DIR="${DOMA_MCP_HOME:-$HOME/.doma/mcp}"
STDIO_URL="${BASE_URL}/doma_mcp_stdio.py"
DAEMON_URL="${BASE_URL}/doma_bridge_daemon.py"

echo "[DomA] install dir: $INSTALL_DIR"

have_python() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null
    return $?
  fi
  return 1
}

install_python_macos() {
  if command -v brew >/dev/null 2>&1; then
    echo "[DomA] installing Python via Homebrew…"
    brew install python3
    return 0
  fi
  echo "[DomA] Homebrew not found. Installing Homebrew (may prompt for password)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon brew path
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  brew install python3
}

install_python_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "[DomA] installing Python via apt (may prompt for sudo)…"
    sudo apt-get update -y
    sudo apt-get install -y python3
    return 0
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "[DomA] installing Python via dnf…"
    sudo dnf install -y python3
    return 0
  fi
  if command -v yum >/dev/null 2>&1; then
    echo "[DomA] installing Python via yum…"
    sudo yum install -y python3
    return 0
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "[DomA] installing Python via pacman…"
    sudo pacman -Sy --noconfirm python
    return 0
  fi
  echo "[DomA] ERROR: no supported package manager. Install Python 3.9+ manually." >&2
  exit 1
}

ensure_python() {
  if have_python; then
    echo "[DomA] Python OK: $(command -v python3) ($(python3 -V 2>&1))"
    return 0
  fi
  echo "[DomA] Python 3.9+ not found; installing…"
  case "$(uname -s)" in
    Darwin) install_python_macos ;;
    Linux) install_python_linux ;;
    *)
      echo "[DomA] ERROR: unsupported OS $(uname -s). Install Python 3.9+ manually." >&2
      exit 1
      ;;
  esac
  if ! have_python; then
    echo "[DomA] ERROR: Python still missing after install." >&2
    exit 1
  fi
  echo "[DomA] Python OK: $(command -v python3) ($(python3 -V 2>&1))"
}

download() {
  local url="$1"
  local out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$out" "$url"
  else
    echo "[DomA] ERROR: need curl or wget" >&2
    exit 1
  fi
}

ensure_python
mkdir -p "$INSTALL_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[DomA] downloading stdio…"
download "$STDIO_URL" "$TMP/doma_mcp_stdio.py"
echo "[DomA] downloading daemon…"
download "$DAEMON_URL" "$TMP/doma_bridge_daemon.py"

# basic sanity
python3 -m py_compile "$TMP/doma_mcp_stdio.py" "$TMP/doma_bridge_daemon.py"

install -m 755 "$TMP/doma_mcp_stdio.py" "$INSTALL_DIR/doma_mcp_stdio.py"
install -m 755 "$TMP/doma_bridge_daemon.py" "$INSTALL_DIR/doma_bridge_daemon.py"

STDIO_ABS="$(cd "$INSTALL_DIR" && pwd)/doma_mcp_stdio.py"
PY="$(command -v python3)"

echo ""
echo "[DomA] installed successfully."
echo "[DomA] Paste the following into your MCP client config (e.g. Cursor ~/.cursor/mcp.json):"
echo ""
# Machine-readable block for UIs that scrape between markers
echo "-----BEGIN DOMA_MCP_JSON-----"
python3 - <<PY
import json
print(json.dumps({
  "mcpServers": {
    "DomA": {
      "command": "${PY}",
      "args": ["${STDIO_ABS}"]
    }
  }
}, indent=2, ensure_ascii=False))
PY
echo "-----END DOMA_MCP_JSON-----"
echo ""
