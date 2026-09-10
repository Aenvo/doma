export const PRO_FEATURE_UNAVAILABLE = {
  ok: false,
  error: 'pro_feature_unavailable',
  message: 'This feature is available in DomA Pro.',
} as const;

export function stubProToolResult(): typeof PRO_FEATURE_UNAVAILABLE {
  return { ...PRO_FEATURE_UNAVAILABLE };
}
