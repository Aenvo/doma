import CryptoJS from 'crypto-js';

/**
 * Open 本地可逆加密：密钥由调用方传入（如 TempData 的 dataKey），无全局硬编码 secret。
 * 算法与历史 TempData 兼容（DES/ECB/Pkcs7）。
 */
export function localEncrypt(plain: string, keyMaterial: string): string {
  try {
    const key = CryptoJS.enc.Utf8.parse(keyMaterial);
    return CryptoJS.DES.encrypt(plain, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return '';
  }
}

export function localDecrypt(cipher: string, keyMaterial: string): string {
  try {
    const key = CryptoJS.enc.Utf8.parse(keyMaterial);
    return CryptoJS.DES.decrypt(cipher, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  } catch {
    return '';
  }
}
