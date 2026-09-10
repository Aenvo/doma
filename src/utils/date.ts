export function formatDate(date:Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始，需要加1
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatDateNoSymbol(date:Date){
  return formatDate(date).replace(/\s/g, '').replace(/-/g, "").replace(/:/g, "")
}

export function dateStirngToFormat(str:string){
  if(!str){
    return ""
  }
  let date = new Date(str);
  return formatDate(date)
}
