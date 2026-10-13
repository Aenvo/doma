#!/usr/bin/env bash
# Local installer. With an extension ID, register only the Native Messaging manager.
# Without an ID, install the local companion for browsers without Native Messaging support.
set -euo pipefail

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${DOMA_MCP_HOME:-$HOME/.doma/mcp}"
MANAGER_DIR="${DOMA_MCP_MANAGER_HOME:-$HOME/.doma/manager}"
EXTENSION_ID="${1:-}"

# Git Bash / MSYS / MinGW / Cygwin on Windows (uname is e.g. MSYS_NT-10.0-26300)
is_windows() {
  case "$(uname -s 2>/dev/null)" in
    MSYS*|MINGW*|CYGWIN*|Windows_NT) return 0 ;;
  esac
  case "${OS:-}" in
    Windows_NT) return 0 ;;
  esac
  return 1
}

python_ok() {
  local bin="$1"
  shift
  "$bin" "$@" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null
}

# Sets PYTHON_BIN and PYTHON_PREFIX_ARGS (e.g. py -3)
PYTHON_BIN=""
PYTHON_PREFIX_ARGS=()

resolve_python() {
  PYTHON_BIN=""
  PYTHON_PREFIX_ARGS=()
  local cand
  for cand in python3 python; do
    if command -v "$cand" >/dev/null 2>&1 && python_ok "$cand"; then
      PYTHON_BIN="$(command -v "$cand")"
      return 0
    fi
  done
  # Windows launcher (python.org / Store)
  if command -v py >/dev/null 2>&1 && python_ok py -3; then
    PYTHON_BIN="$(command -v py)"
    PYTHON_PREFIX_ARGS=(-3)
    return 0
  fi
  # Git Bash PATH often omits python.org installs
  if is_windows; then
    local exe
    for exe in \
      "${LOCALAPPDATA:-}/Programs/Python/"*/python.exe \
      "/c/Windows/py.exe" \
      "/c/Windows/System32/py.exe"; do
      [[ -e "$exe" ]] || continue
      case "$exe" in
        */py.exe)
          if python_ok "$exe" -3; then
            PYTHON_BIN="$exe"
            PYTHON_PREFIX_ARGS=(-3)
            return 0
          fi
          ;;
        *)
          if python_ok "$exe"; then
            PYTHON_BIN="$exe"
            return 0
          fi
          ;;
      esac
    done
  fi
  return 1
}


if ! resolve_python; then
  echo '[DomA] Install Python 3.9 or later before running this installer.' >&2
  if is_windows; then
    echo '[DomA] Reopen Git Bash with python or py -3 on PATH, then retry.' >&2
  fi
  exit 1
fi
if [[ -n "$EXTENSION_ID" && ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo '[DomA] Pass a valid 32-character Chrome/Edge extension ID.' >&2
  exit 1
fi
if [[ -n "$EXTENSION_ID" && ( "$INSTALL_DIR" != "$HOME/.doma/mcp" || "$MANAGER_DIR" != "$HOME/.doma/manager" ) ]]; then
  echo '[DomA] GUI management requires the default ~/.doma directories.' >&2
  exit 1
fi

"$PYTHON_BIN" "${PYTHON_PREFIX_ARGS[@]}" - "$SOURCE_DIR" <<'PY'
import ast, hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
release = json.loads((root / 'doma_mcp_release.json').read_text(encoding='utf-8'))
names = {'bridge_auth.py', 'doma_mcp_stdio.py', 'doma_bridge_daemon.py'}
if set(release.get('sha256', {})) != names:
    raise SystemExit('[DomA] Invalid bundled release file list.')
for name in sorted(names):
    source = root / name
    if hashlib.sha256(source.read_bytes()).hexdigest() != release['sha256'][name]:
        raise SystemExit(f'[DomA] Bundled checksum mismatch: {name}')
    ast.parse(source.read_text(encoding='utf-8'), filename=name)
manager = root / 'doma_mcp_manager.py'
if hashlib.sha256(manager.read_bytes()).hexdigest() != release['managerSha256']:
    raise SystemExit('[DomA] Bundled manager checksum mismatch.')
ast.parse(manager.read_text(encoding='utf-8'), filename=manager.name)
PY

if [[ -n "$EXTENSION_ID" ]]; then
  mkdir -p "$MANAGER_DIR"
  if [[ -L "$MANAGER_DIR/doma_mcp_manager.py" ]]; then
    echo '[DomA] Refusing to replace a manager symbolic link.' >&2
    exit 1
  fi
  install -m 755 "$SOURCE_DIR/doma_mcp_manager.py" "$MANAGER_DIR/doma_mcp_manager.py"
  "$PYTHON_BIN" "${PYTHON_PREFIX_ARGS[@]}" "$MANAGER_DIR/doma_mcp_manager.py" --register "$EXTENSION_ID"
  echo '[DomA] Local MCP manager registered. Refresh the connector panel and follow the next step shown there.'
  exit 0
fi

mkdir -p "$INSTALL_DIR"
for name in bridge_auth.py doma_mcp_stdio.py doma_bridge_daemon.py; do
  if [[ -L "$INSTALL_DIR/$name" ]]; then
    echo "[DomA] Refusing to replace a symbolic link: $name" >&2
    exit 1
  fi
done
install -m 644 "$SOURCE_DIR/bridge_auth.py" "$INSTALL_DIR/bridge_auth.py"
install -m 755 "$SOURCE_DIR/doma_mcp_stdio.py" "$INSTALL_DIR/doma_mcp_stdio.py"
install -m 755 "$SOURCE_DIR/doma_bridge_daemon.py" "$INSTALL_DIR/doma_bridge_daemon.py"
echo '[DomA] Local MCP companion installed. Add its stdio script to your desktop agent configuration.'
