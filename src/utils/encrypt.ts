import { MD5 } from 'crypto-js';

/** 非密钥哈希（主题 id 等） */
export function md5Encrypt(str: string): string {
  if (!str) return '';
  return MD5(str).toString();
}
