#!/usr/bin/env node
/**
 * Pack DomA desktop build into CRX3 for own-channel distribution (Immersive-style).
 *
 * Requires the SAME keys/doma-channel.pem used for the NEW Chrome Web Store listing.
 * Signs with PEM (ID from CRX signature). Injects update_url only — never manifest.key
 * (CWS rejects key on upload; upload this CRX for a new Immersive-style listing).
 *
 *   npm run build:channel
 */

import {
  mkdirSync,
  existsSync,
  readFileSync,
  copyFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  injectDistManifest,
  extensionIdFromPem,
  KEY_PATH,
  CWS_UPDATE_URL,
} from "./channel-key-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const extDir = join(root, "dist/desktop/pro");
const distDir = join(root, "dist");

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const bin of candidates) {
    try {
      if (bin.includes("/") && !existsSync(bin)) continue;
      execFileSync(bin, ["--version"], { stdio: "ignore" });
      return bin;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Google Chrome / Chromium not found. Set CHROME_PATH or install Chrome.",
  );
}

function main() {
  mkdirSync(join(root, "keys"), { recursive: true });
  mkdirSync(distDir, { recursive: true });

  if (!existsSync(join(extDir, "manifest.json"))) {
    throw new Error(`Missing ${extDir}. Run: npm run build:desktop`);
  }

  const chrome = findChrome();
  const keyExisted = existsSync(KEY_PATH);

  // Immersive-style: PEM + update_url. --sideload omits update_url for local Edge/Chrome try.
  const sideload = process.argv.includes("--sideload");
  const injected = injectDistManifest({
    withKey: false,
    withUpdateUrl: !sideload,
  });
  const ver = String(injected.version || "0.0.0");
  const build = String(injected.build || "");
  const extensionId = keyExisted ? extensionIdFromPem() : "(will be known after first key create)";

  const crxName = sideload ? `DomA-${ver}-sideload.crx` : `DomA-${ver}-channel.crx`;
  const crxPath = join(distDir, crxName);
  // Stable CDN name (no version in filename) so download links stay fixed across releases.
  const zipBundlePath = join(
    distDir,
    sideload ? `DomA-${ver}-sideload.zip` : `DomA-channel.zip`,
  );

  const chromeOutCrx = join(root, "dist/desktop/pro.crx");
  const chromeOutPem = join(root, "dist/desktop/pro.pem");
  rmSync(chromeOutCrx, { force: true });
  rmSync(chromeOutPem, { force: true });
  rmSync(crxPath, { force: true });

  console.log("[pack:channel] chrome:", chrome);
  console.log("[pack:channel] extension:", extDir);
  console.log("[pack:channel] version:", ver, "build:", build || "(none)");
  console.log("[pack:channel] extensionId:", extensionId);
  console.log(
    "[pack:channel] mode:",
    sideload ? "sideload (no update_url)" : "channel (Immersive-style)",
  );
  console.log("[pack:channel] update_url:", sideload ? "(none)" : CWS_UPDATE_URL);
  console.log("[pack:channel] key:", KEY_PATH, keyExisted ? "(reuse)" : "(will create)");

  const args = [`--pack-extension=${extDir}`];
  if (keyExisted) {
    args.push(`--pack-extension-key=${KEY_PATH}`);
  }

  try {
    execFileSync(chrome, args, { stdio: "inherit" });
  } catch (e) {
    throw new Error(`Chrome pack-extension failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!existsSync(chromeOutCrx)) {
    throw new Error(`Chrome did not produce ${chromeOutCrx}`);
  }

  if (!keyExisted) {
    if (!existsSync(chromeOutPem)) {
      throw new Error("Chrome did not produce a new .pem; cannot stabilize extension id");
    }
    renameSync(chromeOutPem, KEY_PATH);
    console.log(
      "[pack:channel] WARNING: new private key saved to keys/doma-channel.pem — BACK IT UP. Reuse for CWS + all future channel builds.",
    );
    console.log("[pack:channel] extensionId:", extensionIdFromPem());
  } else {
    rmSync(chromeOutPem, { force: true });
  }

  copyFileSync(chromeOutCrx, crxPath);
  rmSync(chromeOutCrx, { force: true });

  const staging = join(distDir, `.channel-stage-${ver}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  copyFileSync(crxPath, join(staging, crxName));
  rmSync(zipBundlePath, { force: true });
  execFileSync("zip", ["-r", "-q", zipBundlePath, crxName], { cwd: staging });
  rmSync(staging, { recursive: true, force: true });

  console.log("[pack:channel] ok");
  console.log("[pack:channel] crx:", crxPath, `(${readFileSync(crxPath).length} bytes)`);
  console.log("[pack:channel] zip:", zipBundlePath, `(${readFileSync(zipBundlePath).length} bytes)`);
  if (sideload) {
    console.log(
      "[pack:channel] Sideload CRX: try in Edge/Chrome developer mode. Not for Immersive-style enablement.",
    );
  } else {
    console.log(
      "[pack:channel] After the NEW CWS item (same extensionId) is published, this CRX should enable like Immersive Translate.",
    );
  }
}

try {
  main();
} catch (e) {
  console.error("[pack:channel] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
