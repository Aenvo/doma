#!/usr/bin/env node
/**
 * Zip dist/desktop/pro for Chrome Web Store upload.
 *
 * CWS rules (current):
 * - Rejects manifest "key"
 * - Rejects uploading .crx directly
 * - NEW item: put private key as root-level key.pem inside the zip (no manifest key)
 *   → store locks extension ID to that PEM (Immersive-style / scheme D)
 * - Later updates: zip without key.pem
 *
 *   npm run pack:store -- --claim-id   # first upload of a NEW item
 *   npm run pack:store                 # updates after ID is set
 *   npm run build:store
 *   npm run build:store:new
 */

import { existsSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { injectDistManifest, extensionIdFromPem, KEY_PATH } from "./channel-key-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const extDir = join(root, "dist/desktop/pro");
const distDir = join(root, "dist");
const claimId = process.argv.includes("--claim-id");

function main() {
  if (!existsSync(KEY_PATH)) {
    throw new Error(`Missing ${KEY_PATH}. Keep/reuse this PEM for store + channel.`);
  }
  if (!existsSync(join(extDir, "manifest.json"))) {
    throw new Error("Missing dist/desktop/pro. Run: npm run build:desktop");
  }

  // CWS forbids manifest.key; ID for new items comes from zip-root key.pem
  const injected = injectDistManifest({ withKey: false, withUpdateUrl: false });
  const ver = String(injected.version || "0.0.0");
  const out = join(distDir, `DomA-${ver}-chrome.zip`);
  const pemInZip = join(extDir, "key.pem");

  rmSync(out, { force: true });
  rmSync(pemInZip, { force: true });

  try {
    if (claimId) {
      copyFileSync(KEY_PATH, pemInZip);
    }

    execFileSync(
      "zip",
      ["-r", "-q", out, ".", "-x", "*.DS_Store", "-x", "**/.DS_Store"],
      { cwd: extDir },
    );
  } finally {
    rmSync(pemInZip, { force: true });
  }

  // Sanity: claim-id zip must contain key.pem; update zip must not
  const listing = execFileSync("unzip", ["-l", out], { encoding: "utf8" });
  const hasPem = /(?:^|\s)key\.pem\s*$/m.test(listing) || listing.includes("key.pem");
  if (claimId && !hasPem) {
    throw new Error("claim-id zip missing key.pem");
  }
  if (!claimId && hasPem) {
    throw new Error("update zip must not contain key.pem");
  }

  const size = readFileSync(out).length;
  console.log("[pack:store] ok");
  console.log("[pack:store] mode:", claimId ? "NEW item (includes key.pem)" : "update (no key.pem)");
  console.log("[pack:store] extensionId:", extensionIdFromPem());
  console.log("[pack:store] zip:", out, `(${size} bytes)`);
  if (claimId) {
    console.log("[pack:store] Upload this zip as a NEW Chrome Web Store item.");
  } else {
    console.log("[pack:store] For a brand-new item, run: npm run pack:store -- --claim-id");
  }
}

try {
  main();
} catch (e) {
  console.error("[pack:store] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
