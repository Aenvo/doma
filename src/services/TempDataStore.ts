import { Storage } from "@/store/Storage";
import { localDecrypt, localEncrypt } from "@/utils/localCrypto";

export type TempDataRecord = {
  key: string;
  desc: string;
  value: string; // 解密后的明文
};

const KEY_PREFIX = "data-";

function encryptValue(plain: string, key: string): string {
  return localEncrypt(plain, key);
}

function decryptValue(cipher: string, key: string): string {
  return localDecrypt(cipher, key);
}

function newKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${KEY_PREFIX}${crypto.randomUUID()}`
    : `${KEY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class TempDataStore {
  private storage = Storage.init();

  async save(desc: string, value: string, key?: string): Promise<string> {
    const k = key?.startsWith(KEY_PREFIX) ? key : newKey();
    await this.storage.set(k, {
      desc: (desc ?? "").trim(),
      value: encryptValue((value ?? "").trim(), k),
      updatedAt: Date.now(),
    });
    return k;
  }

  async get(key: string): Promise<TempDataRecord | null> {
    if (!key || typeof key !== "string") return null;
    const raw = await this.storage.get(key);
    if (!raw) return null;
    const desc = typeof raw?.desc === "string" ? raw.desc : "";
    const cipher = typeof raw?.value === "string" ? raw.value : "";
    const plain = cipher ? decryptValue(cipher, key) : "";
    return { key, desc, value: plain };
  }

  async remove(key: string): Promise<void> {
    await this.storage.remove(key);
  }

  async list(): Promise<TempDataRecord[]> {
    const all = await this.storage.getByPrefix(KEY_PREFIX);
    const out: TempDataRecord[] = [];
    for (const [key, v] of Object.entries(all)) {
      const desc = typeof (v as any)?.desc === "string" ? (v as any).desc : "";
      const cipher = typeof (v as any)?.value === "string" ? (v as any).value : "";
      const plain = cipher ? decryptValue(cipher, key) : "";
      out.push({ key, desc, value: plain });
    }
    return out;
  }
}
