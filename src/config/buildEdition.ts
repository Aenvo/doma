export type BuildEdition = 'open' | 'pro';

/** 与 --stay-primary 一致；logo 青蓝见 --stay-logo */
export const EDITION_BRAND_PRIMARY: Record<BuildEdition, string> = {
  open: '#2F3134',
  pro: '#2F3134',
};

/** 跟 Vite `VITE_BUILD_EDITION`：只有 Open 代码时为 open；apply:pro 后打商业包为 pro */
export function getBuildEdition(): BuildEdition {
  return import.meta.env.VITE_BUILD_EDITION === 'pro' ? 'pro' : 'open';
}

export function isOpenEdition(): boolean {
  return getBuildEdition() === 'open';
}

export function isProEdition(): boolean {
  return getBuildEdition() === 'pro';
}

export function getEditionBrandPrimary(): string {
  return EDITION_BRAND_PRIMARY[getBuildEdition()];
}
