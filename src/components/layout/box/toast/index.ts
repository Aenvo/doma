import { createVNode, render } from "vue";
import Toast from "./toast.vue";

// 准备一个DOM容器
const toastContainer = document.createElement("div");
// div.setAttribute("class", "toast-wrapper");
document.body.appendChild(toastContainer);

let timer = null as any;
interface ToastOptions {
  title?: string;
  duration?: number;
  mask?: boolean;
  fun?: () => void;
}
/**
 * title： show text in toast,
 * duration: show toast time, if duration = 0, show close icon to manual-lock toast
 * showOverlay: show overlay, if not set false;
 * fun: after hide toast to execute fun
 */
export default ({ 
  title = "Loading...", 
  duration = 3500, 
  mask = false, 
  fun = () => {} 
}: ToastOptions = {}) => {
  title = title || "Loading...";
  duration = typeof duration == 'undefined' ? 3500 : duration;
  mask = typeof mask == 'undefined'? false : mask;
  fun = typeof fun == 'undefined' ? ()=>{} : fun;
  render(null, toastContainer);
  // 创建虚拟dom  (组件对象， props)
  const vnode = createVNode(Toast, {title, duration, mask, onCallback: ()=>{ fun()}});
  render(vnode, toastContainer);
  if(duration>0){
    let durationDestroy = duration * 2;
    clearTimeout(timer);
    timer = setTimeout(() => {
      render(null, toastContainer);
    }, durationDestroy);
  }
};
