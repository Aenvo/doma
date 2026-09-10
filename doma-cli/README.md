# DomA CLI (`doma`)

Conversation client only. **Service lifecycle** is owned by [`doma-cli-runner`](../cli-runner/):

```bash
doma-cli-runner start -d   # helper :3848 + CLI bridge :3856/:3857
doma conv …
doma-cli-runner stop
```

Independent of MCP (`:3846` / `:3847`). Extension connects to both WS ports when the bridge toggle is on.

## Install

```bash
curl -fsSL https://res.stayfork.app/d/install-doma-cli-runner.sh | bash
```

## CDN upload（仅 CLI，与 MCP 无关）

| CDN object | Local path |
|------------|------------|
| `install-doma-cli-runner.sh` | `cli-runner/install-doma-cli-runner.sh` |
| `doma.py` | `doma-cli/doma.py` |
| `doma_cli_bridge_daemon.py` | `doma-cli/doma_cli_bridge_daemon.py` |
| `doma_cli_runner.py` | `cli-runner/doma_cli_runner.py` |

## Conversation

```bash
doma-cli-runner start -d
doma help
doma conv start -m "Open baidu.com, search DomA"
doma conv send <conversationId> -m "Click the first result"
doma conv result <conversationId> --watch
doma conv close <conversationId>
doma-cli-runner stop
```

## Ports

| | MCP | DomA CLI service (`doma-cli-runner`) |
|--|-----|--------------------------------------|
| Control HTTP | `:3846` | `:3856` |
| Extension WS | `:3847` | `:3857` |
| Helper | — | `:3848` |

## Local (repo)

```bash
export DOMA_DAEMON_SCRIPT="$(pwd)/doma-cli/doma_cli_bridge_daemon.py"
python3 cli-runner/doma_cli_runner.py start -d
python3 doma-cli/doma.py help
```
