# Dual-track with DomA Browser (Track B)

This extension repo is **Track A** (Chrome Web Store / Edge / channel CRX).

Desktop Chromium product lives in sibling repo:

`../doma-browser` (product name: **DomA Browser**)

## Rules

1. Keep `npm run build:desktop`, `build:store`, `build:store:new`, `build:channel` working — browser sync consumes `dist/desktop/pro` only.
2. Do not move MCP bridge out of `mcp-bridge/` without updating `doma-browser/scripts/smoke-mcp.sh` and install scripts. CLI lives in `cli-runner/` + `doma-cli/` (CDN: `install-doma-cli-runner.sh`, `doma_cli_runner.py`, `doma.py`, `doma_cli_bridge_daemon.py` — independent of MCP CDN objects).
3. Browser releases must record extension `version` + `build` from `manifest.json` alongside `CHROMIUM_TAG`.
4. Store-only hotfixes do not require a DomA Browser rebuild.
5. Full collaboration doc: `../doma-browser/docs/dual-track.md`.

## Sync into browser

```bash
cd ../doma-browser
./scripts/sync-doma-extension.sh
```
