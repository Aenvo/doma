
/**
 * 深度合并两个对象（类型安全）
 * @param origin 原始对象
 * @param target 目标对象（可以是部分属性）
 * @returns 合并后的新对象
 */
export function mergeObjects<T extends Record<string, any>>(
  origin: T,
  target: Partial<T>
): T {
  const result = { ...origin };

  for (const key in target) {
    if (target.hasOwnProperty(key)) {
      const originValue = origin[key];
      const targetValue = target[key];

      // 如果 target 和 origin 的当前属性都是对象，递归合并
      if (
        typeof originValue === "object" &&
        originValue !== null &&
        typeof targetValue === "object" &&
        targetValue !== null
      ) {
        result[key] = mergeObjects(originValue, targetValue);
      } else {
        // 否则直接覆盖
        result[key] = targetValue as any;
      }
    }
  }

  return result;
}
