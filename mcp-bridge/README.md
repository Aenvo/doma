# DomA MCP bridge (multi-agent)

## Architecture

```
Codex / Cursor / Claude / OpenClaw  ──stdio──►  doma_mcp_stdio.py  (many)
                                              │ HTTP :3846
                                              ▼
                                    doma_bridge_daemon.py  (one)
                                              │ WS :3847
                                              ▼
                                         DomA extension
```

## Install and manage (end users)

The connector panel shows the extension version, installed MCP companion version,
running daemon version, and bridge state. **Start/Stop local MCP service** controls
the background Python daemon. **Allow extension to receive MCP tasks** controls
whether the open side panel connects to that service and accepts desktop-agent
tasks; both must be on for browser tasks. A separate, one-time native host install
enables the panel's update, start/stop, and companion-uninstall buttons. The
native host is registered for the current Chrome/Edge extension ID only.

Install Python 3.9+, open a terminal in this fork's `mcp-bridge/` directory,
and run the local command shown by the connector panel. On Windows the copied
PowerShell command opens a file picker for `install-doma-mcp.ps1` and then
passes the extension ID; on macOS/Linux the command is
`bash ./install-doma-mcp.sh <extension-id>`. This one-time step registers the
Native Messaging manager for the current Chrome/Edge extension ID. Return to
the panel, click **Refresh**, then **Install companion**. The browser extension
includes the three companion Python sources and sends them to the manager for
installation. No release CDN is used in this managed path.

Browsers without Native Messaging support can install the local companion
without GUI management from the same directory:

```bash
bash ./install-doma-mcp.sh
```

The companion is installed at `~/.doma/mcp/`; the manager is installed at
`~/.doma/manager/`. The panel shows Codex TOML and other-agent JSON using
absolute paths once the manager is connected. Keep the side panel open and
enable the MCP bridge when using desktop-agent tools.

An extension update does not automatically update the local Python companion.
After updating the extension, use **Update companion** if the panel reports a
version mismatch. The extension checks its bundled sources against its bundled
SHA-256 manifest; the manager checks them again before replacing any installed
file. The manager refuses a
downgrade and refuses to stop a daemon with active conversations. On a working
daemon it stops, replaces files, restarts, and restores the previous files if
the replacement fails. Desktop agents must restart to load new stdio tools.
If the panel reports an outdated manager, rerun the local one-time installer
from the updated fork. The first transition from an older daemon without
`/v1/admin/stop` requires manually stopping that old daemon before installing
the companion in the panel.

**Uninstall companion** stops the daemon and removes only the known MCP
companion files, local token, and daemon log. It leaves the native manager and
each desktop agent's MCP configuration in place so the user can reinstall;
remove each agent configuration separately (`codex mcp remove DomA` for Codex).
The panel disables uninstall while MCP client instances are connected and shows
how to remove their agent configuration and restart them. A single desktop app
can have multiple client instances; inactive heartbeats expire within 90 seconds.
Full manager removal is an OS-level uninstall/repair task and is not exposed by
the panel.

For each release, update `doma_mcp_release.json` hashes for the three companion
files and manager before building the extension. `npm run build` verifies those
hashes and the companion version before packaging. The extension bundles the
companion files and manifest; the local one-time installer must remain beside
the manager source and manifest in the fork's `mcp-bridge/` directory. The
initial script verifies the manager hash before registering it. Distribute the
fork or its local installer files together with the extension; an extension
package alone cannot register a Native Messaging host.

The stdio client and daemon share a per-user token in `~/.doma/mcp/bridge-auth-token`.
The file is created on first use and must remain private. Existing daemon processes
from older releases must be stopped before using the updated client. The control
HTTP endpoint accepts authenticated local clients only; browser pages cannot call it.
WebSocket connections are limited to browser extension origins.
This Origin check blocks ordinary web pages, but it does not authenticate the
extension: another extension or a local process can still connect. Pairing the
extension with the daemon would require a separate protocol change.

Requests larger than 32 MiB are rejected. Increase this limit in the bridge source
only if a documented attachment workflow requires larger payloads.

## Ports

| Port | Role |
|------|------|
| `3846` | Control HTTP (`/v1/health`, `/v1/conversations/...`, `/v1/agents/heartbeat`) |
| `3847` | Extension WebSocket (fixed) |

## Cursor / other agents

```json
{
  "mcpServers": {
    "DomA": {
      "command": "python3",
      "args": ["/absolute/path/to/.doma/mcp/doma_mcp_stdio.py"]
    }
  }
}
```

For Codex, allow enough time for DomA to create the conversation (the bridge can
wait up to 90 seconds before returning its ID):

```toml
[mcp_servers.DomA]
command = "python3"
args = ["/absolute/path/to/.doma/mcp/doma_mcp_stdio.py"]
tool_timeout_sec = 120
```

On Windows, use your installed Python command and an absolute Windows script path.

## Manual daemon (optional)

```bash
python3 mcp-bridge/doma_bridge_daemon.py
```

If already running, a second start exits quietly (control port busy).

## DomA CLI (separate track)

CLI is installed only via [`../cli-runner/`](../cli-runner/) / [`../doma-cli/`](../doma-cli/). It uses **`:3856` / `:3857`** and CDN object `doma_cli_bridge_daemon.py` — not this MCP package. The extension connects to both WS ports (`:3847` MCP + `:3857` CLI).
