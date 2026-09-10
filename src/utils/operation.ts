export const getDecimals = (num: any) => {
  const str = num.toString();
  if (str.indexOf('.') === -1) {
    return 0;
  }
  return str.length - str.indexOf('.') - 1;
}
export const add = (a: any, b: any) => {
  const multiple = Math.pow(10, Math.max(getDecimals(a), getDecimals(b)));
  return (a * multiple + b * multiple) / multiple;
}
export const sub = (a: any, b: any) => {
  return add(a, -b);
}
export const mul = (a: any, b: any) => {
  const decimals = getDecimals(a) + getDecimals(b);
  const base = a.toString().replace('.', '') * b.toString().replace('.', '');
  return base / Math.pow(10, decimals);
}
export const div = (a: number, b: number) => {
  const decimals = Math.max(getDecimals(a), getDecimals(b));
  const base = Math.pow(10, decimals);
  return (a * base) / (b * base);
}
