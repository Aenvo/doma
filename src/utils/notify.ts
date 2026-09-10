export async function showConfirmModal(prompt:string, confirmFun:()=>void) {
  const result = await window.confirm(prompt);
  if (result) {
      // 用户点击了确定按钮
      console.log('用户点击了确定按钮');
      confirmFun();
  } else {
      // 用户点击了取消按钮
      console.log('用户点击了取消按钮');
  }
}
