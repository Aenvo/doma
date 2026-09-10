import { Store } from './Store';
import { type PopupMenu } from '@/types/MenuTypes';
// 定义状态类型
interface AppState {
  settings: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
  closeTipsApp: boolean;
  popupHeaderNavActivated: Record<string, any> | null;
  popupTabMenuActivated: PopupMenu;
}

// 创建 store 实例
export default Store.create<AppState>({
  state: {
    closeTipsApp: false,
    settings: {
      theme: 'light',
      notifications: true
    },
    popupHeaderNavActivated: {
      userscripts_tab: 'activated', 
      adblock_tab: 'webTag', 
      darkmode_tab: 'settings', 
      downloader_tab: 'files',
      home_tab: 'home_tab',
    },
    popupTabMenuActivated: {id: 1, name: 'home_tab'},
  },
  
  // 需要持久化的字段
  persist: ['popupHeaderNavActivated', 'popupTabMenuActivated', 'closeTipsApp'],
  
  mutations: {
    setTheme(state, payload: 'light' | 'dark') {
      state.settings.theme = payload;
    },
    setCloseTipsApp(state, payload: boolean) {
      state.closeTipsApp = payload;
    },
    setPopupHeaderNavActivated(state, payload: Record<string, any>) {
      state.popupHeaderNavActivated = payload;
    },
    setPopupTabMenuActivated(state, payload: PopupMenu) {
      state.popupTabMenuActivated = payload;
    },
  },
  
  actions: {
    // async fetchUser(context, payload: { userId: number }) {
    //   // 模拟 API 调用
    //   await new Promise(resolve => setTimeout(resolve, 1000));
    //   context.commit('setUser', {
    //     name: 'John Doe',
    //     age: 30
    //   });
    //   return 'User fetched';
    // },
    
    async toggleTheme(context) {
      const newTheme = context.state.settings.theme === 'light' ? 'dark' : 'light';
      context.commit('setTheme', newTheme);
    }
  },
  
  getters: {
    getPopupHeaderNavActivated(state) {
      return state.popupHeaderNavActivated;
    },
    getPopupTabMenuActivated(state) {
      return state.popupTabMenuActivated;
    },
    getCloseTipsApp(state) {
      return state.closeTipsApp;
    }
  }
});

// 使用示例
// store.commit('increment', 5);
// console.log(store.state.count); // 5

// store.dispatch('fetchUser', { userId: 1 }).then(result => {
//   console.log(result); // "User fetched"
//   console.log(store.state.user); // { name: "John Doe", age: 30 }
// });

// 获取 getters
// const { doubleCount, greeting, isDarkMode } = store.getters();
// console.log(doubleCount); // 10
// console.log(greeting); // "Hello, John Doe!"