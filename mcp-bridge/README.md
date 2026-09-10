# DomA MCP bridge (multi-agent)

## Architecture

```
Cursor / Claude / OpenClaw  ──stdio──►  doma_mcp_stdio.py  (many)
                                              │ HTTP :3846
                                              ▼
                                    doma_bridge_daemon.py  (one)
                                              │ WS :3847
                                              ▼
                                         DomA extension
```

## Install (end users)

```bash
curl -fsSL https://res.stayfork.app/d/install-doma-mcp.sh | bash
```

Installs into `~/.doma/mcp/` and prints MCP JSON to paste into Cursor / other agents.

Upload these three files to `https://res.stayfork.app/d/`:

- `install-doma-mcp.sh`
- `doma_mcp_stdio.py`
- `doma_bridge_daemon.py`

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

## Manual daemon (optional)

```bash
python3 mcp-bridge/doma_bridge_daemon.py
```

If already running, a second start exits quietly (control port busy).

## DomA CLI (separate track)

CLI is installed only via [`../cli-runner/`](../cli-runner/) / [`../doma-cli/`](../doma-cli/). It uses **`:3856` / `:3857`** and CDN object `doma_cli_bridge_daemon.py` — not this MCP package. The extension connects to both WS ports (`:3847` MCP + `:3857` CLI).
