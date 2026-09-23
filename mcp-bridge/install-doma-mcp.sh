#!/usr/bin/env bash
# Local installer. With an extension ID, register only the Native Messaging manager.
# Without an ID, install the local companion for browsers without Native Messaging support.
set -euo pipefail

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${DOMA_MCP_HOME:-$HOME/.doma/mcp}"
MANAGER_DIR="${DOMA_MCP_MANAGER_HOME:-$HOME/.doma/manager}"
EXTENSION_ID="${1:-}"

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' ; then
  echo '[DomA] Install Python 3.9 or later before running this installer.' >&2
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

python3 - "$SOURCE_DIR" <<'PY'
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
  python3 "$MANAGER_DIR/doma_mcp_manager.py" --register "$EXTENSION_ID"
  echo '[DomA] Local MCP manager registered. Refresh the connector panel, then choose Install companion.'
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
