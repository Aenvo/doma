/** 为生成扩展创建 RSA 密钥并计算稳定 Chrome extensionId（manifest.key = SPKI base64） */

function bytesToBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

/** Chrome extension id：SHA-256(SPKI) 前 16 字节 → a-p 编码 */
export async function computeExtensionIdFromSpki(spkiDer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", spkiDer);
  const bytes = new Uint8Array(hash).subarray(0, 16);
  let id = "";
  for (const byte of bytes) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

export type GeneratedExtensionIdentity = {
  extensionId: string;
  /** manifest.json "key" 字段 */
  manifestKey: string;
};

/** 每扩展独立密钥；只把公钥写入用户包，私钥不落盘 */
export async function generateExtensionIdentity(): Promise<GeneratedExtensionIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const extensionId = await computeExtensionIdFromSpki(spki);
  return {
    extensionId,
    manifestKey: bytesToBase64(spki),
  };
}

export function injectManifestKey(manifestJson: string, manifestKey: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(manifestJson) as Record<string, unknown>;
  } catch {
    throw new Error("manifest.json is not valid JSON");
  }
  parsed.key = manifestKey;
  if (parsed.manifest_version == null) parsed.manifest_version = 3;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

/**
 * 若包内有 background.js 但 manifest 缺少 background.service_worker，自动补上。
 * 避免模型漏写导致 popup sendMessage 无人响应。
 */
export function ensureManifestServiceWorker(
  manifestJson: string,
  paths: Iterable<string>,
): string {
  const hasBgFile = [...paths].some(
    (p) => p === "background.js" || /(^|\/)background\.js$/i.test(p),
  );
  if (!hasBgFile) return manifestJson;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(manifestJson) as Record<string, unknown>;
  } catch {
    return manifestJson;
  }

  const bg = parsed.background;
  if (bg && typeof bg === "object" && !Array.isArray(bg)) {
    const sw = (bg as { service_worker?: unknown }).service_worker;
    if (typeof sw === "string" && sw.trim()) return manifestJson;
  }

  parsed.background = { service_worker: "background.js" };
  return `${JSON.stringify(parsed, null, 2)}\n`;
}
