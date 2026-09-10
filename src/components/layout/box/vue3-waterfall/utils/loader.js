/*
 * @Author: Stay
 * @Date: 2024-03-14 15:00:00
 * @LastEditors: Turbo
 * @LastEditTime: 2024-03-14 15:00:00
 */

const fetchBolbUrl = (objectUrl) => {
  return new Promise((resolve, reject) => {
    // 使用 Fetch API 发送 GET 请求
    fetch(objectUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.blob(); // 将响应转换为 Blob 对象
      })
      .then(blob => {
        // 处理响应数据，比如展示图片等
        let imgUrl = URL.createObjectURL(blob); // 使用 Blob 创建一个新的 Object URL
        resolve(imgUrl);
      })
      .catch(error => {
        console.error('There has been a problem with your fetch operation:', error);
      });
  })
  
}

const platform = import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME;
/**
 * load images
 * @param {Array[String]} images - 图片链接数组
 */
export function loadImage(url, crossOrigin){
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      reject(new Error('Image load error'))
    }
    if (crossOrigin)
      image.crossOrigin = 'Anonymous' // 支持跨域图片

    image.src = url
  })
}