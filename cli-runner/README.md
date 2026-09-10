# DomA CLI Runner + DomA CLI

```bash
curl -fsSL https://res.stayfork.app/d/install-doma-cli-runner.sh | bash
# new terminal:
doma-cli-runner start -d
doma help
```

One installer installs both:

| Command | Role |
|---------|------|
| `doma-cli-runner` | **Service lifecycle**: helper `:3848` + CLI bridge `:3856`/`:3857` |
| `doma` | Conversation client (`conv …`) against that bridge |

## Lifecycle

```bash
doma-cli-runner start -d
doma-cli-runner status
doma-cli-runner stop
```

`doma` does **not** start/stop the service.

## Conversation

```bash
doma conv start -m "..."
doma conv send <id> -m "..."
doma conv result <id> [--watch]
doma conv close <id>
```

## DomA tools (extension → runner helper `:3848`)

| Tool | Role |
|------|------|
| `browser_cli_shell` | Freeform shell line |
| `browser_cli_list` / `browser_cli_run` | Catalog CLIs |

## CDN upload（仅 CLI，与 MCP 无关）

| CDN object | Local path |
|------------|------------|
| `install-doma-cli-runner.sh` | `cli-runner/install-doma-cli-runner.sh` |
| `doma_cli_runner.py` | `cli-runner/doma_cli_runner.py` |
| `doma.py` | `doma-cli/doma.py` |
| `doma_cli_bridge_daemon.py` | `doma-cli/doma_cli_bridge_daemon.py` |

不要上传 / 覆盖 MCP 的 `doma_bridge_daemon.py`。
