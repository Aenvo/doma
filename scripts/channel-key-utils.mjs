#!/usr/bin/env node
/**
 * DomA channel / new-CWS key helpers.
 * Private key: keys/doma-channel.pem
 *
 *   node scripts/channel-key-utils.mjs info
 *   node scripts/channel-key-utils.mjs inject-dist [--with-update-url]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
export const KEY_PATH = join(root, "keys/doma-channel.pem");
export const DIST_MANIFEST = join(root, "dist/desktop/pro/manifest.json");
export const CWS_UPDATE_URL = "https://clients2.google.com/service/update2/crx";

/** SPKI DER (SubjectPublicKeyInfo) from PEM private key */
export function publicKeyDerFromPem(pemPath = KEY_PATH) {
  if (!existsSync(pemPath)) {
    throw new Error(`Missing ${pemPath}. Run pack once or generate a PEM first.`);
  }
  return execFileSync(
    "openssl",
    ["rsa", "-in", pemPath, "-pubout", "-outform", "DER"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

/** manifest.json "key" field (base64 SPKI) */
export function manifestPublicKey(pemPath = KEY_PATH) {
  return publicKeyDerFromPem(pemPath).toString("base64");
}

/** Chrome extension id derived from public key (a-p encoding) */
export function extensionIdFromPem(pemPath = KEY_PATH) {
  const der = publicKeyDerFromPem(pemPath);
  const hash = createHash("sha256").update(der).digest().subarray(0, 16);
  let id = "";
  for (const byte of hash) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

/**
 * Patch dist manifest for packing.
 * - CWS rejects manifest `key` on upload; identity comes from CRX signature (PEM).
 * - Channel CRX: update_url only (no key). Local unpacked can still inject key via CLI.
 * Source manifest under src/ is left unchanged.
 */
export function injectDistManifest(options = {}) {
  const {
    withKey = false,
    withUpdateUrl = false,
    pemPath = KEY_PATH,
  } = options;
  if (!existsSync(DIST_MANIFEST)) {
    throw new Error(`Missing ${DIST_MANIFEST}. Run: npm run build:desktop`);
  }
  const manifest = JSON.parse(readFileSync(DIST_MANIFEST, "utf8"));
  const id = extensionIdFromPem(pemPath);
  if (withKey) {
    manifest.key = manifestPublicKey(pemPath);
  } else {
    delete manifest.key;
  }
  if (withUpdateUrl) {
    manifest.update_url = CWS_UPDATE_URL;
  } else {
    delete manifest.update_url;
  }
  writeFileSync(DIST_MANIFEST, `${JSON.stringify(manifest, null, 4)}\n`, "utf8");
  return {
    id,
    version: manifest.version,
    build: manifest.build,
    withKey: !!manifest.key,
    withUpdateUrl: !!manifest.update_url,
    manifestPath: DIST_MANIFEST,
  };
}

function printInfo() {
  mkdirSync(join(root, "keys"), { recursive: true });
  if (!existsSync(KEY_PATH)) {
    console.error(`[channel-key] missing ${KEY_PATH}`);
    process.exit(1);
  }
  const id = extensionIdFromPem();
  const key = manifestPublicKey();
  console.log("[channel-key] pem:", KEY_PATH);
  console.log("[channel-key] extensionId:", id);
  console.log("[channel-key] manifest.key length:", key.length);
  console.log("[channel-key] update_url (channel):", CWS_UPDATE_URL);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const cmd = process.argv[2] || "info";
  if (cmd === "info") {
    printInfo();
  } else if (cmd === "inject-dist") {
    const withUpdateUrl = process.argv.includes("--with-update-url");
    const withKey = process.argv.includes("--with-key");
    const r = injectDistManifest({ withKey, withUpdateUrl });
    console.log("[channel-key] patched dist manifest", r);
  } else {
    console.error("Usage: node scripts/channel-key-utils.mjs info|inject-dist [--with-update-url]");
    process.exit(1);
  }
}
