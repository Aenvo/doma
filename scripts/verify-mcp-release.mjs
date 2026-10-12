import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bridgeDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mcp-bridge');
const release = JSON.parse(readFileSync(join(bridgeDir, 'doma_mcp_release.json'), 'utf8'));
const sources = ['bridge_auth.py', 'doma_mcp_stdio.py', 'doma_bridge_daemon.py'];

if (Object.keys(release.sha256).sort().join() !== [...sources].sort().join()) {
  throw new Error('MCP release file list does not match the bundled sources');
}

for (const name of [...sources, 'doma_mcp_manager.py']) {
  const content = readFileSync(join(bridgeDir, name));
  const actual = createHash('sha256').update(content).digest('hex');
  const expected = name === 'doma_mcp_manager.py' ? release.managerSha256 : release.sha256[name];
  if (actual !== expected) {
    throw new Error(`MCP release checksum mismatch: ${name}; update doma_mcp_release.json before building`);
  }
  if (name !== 'bridge_auth.py' && name !== 'doma_mcp_manager.py' &&
      !content.toString('utf8').includes(`SERVER_VERSION = "${release.version}"`)) {
    throw new Error(`MCP release version does not match ${name}`);
  }
}

console.log(`[mcp-release] verified v${release.version}`);
