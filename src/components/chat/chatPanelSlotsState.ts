import { computed, ref } from 'vue';
import { STUserManager } from '@/services/STUserManager';
import { STUserBean } from '@/services/database/user/STUserBean';
import type { UserInfo } from '@/types/UserInfoEntity';

/** ChatPanelSlots 多 position 实例共享状态（仅 pro 插槽使用） */
export const showDownloader = ref(false);
export const showAccountPanel = ref(false);
export const showLoginWelcomeModal = ref(false);
export const showFirstChatPrompt = ref(false);
/** 登录欢迎已关，但 header 引导未结束 — 引导完成后再弹首次对话 */
export const pendingFirstChatPromptAfterWelcome = ref(false);
export const downloadNum = ref(0);
export const inviteCodeCopied = ref(false);

export const userInfo = ref<UserInfo>({
  uuid: STUserManager.get().user?.uuid || '',
  nick: STUserManager.get().user?.nick || '',
  mail: STUserManager.get().user?.mail || '',
  headImage: STUserManager.get().user?.headImage || '',
  proType: STUserManager.get().user?.proType || '',
  proExpireTime: STUserManager.get().user?.proExpireTime || '',
  inviteCode: STUserManager.get().user?.inviteCode || '',
});

export const isLogin = computed(() => {
  return (
    !!userInfo.value &&
    Object.keys(userInfo.value).length > 0 &&
    !!userInfo.value.uuid &&
    userInfo.value.uuid != STUserBean.GUEST_ID
  );
});

export function syncChatUserInfo() {
  userInfo.value = {
    uuid: STUserManager.get().user?.uuid || '',
    nick: STUserManager.get().user?.nick || '',
    mail: STUserManager.get().user?.mail || '',
    headImage: STUserManager.get().user?.headImage || '',
    proType: STUserManager.get().user?.proType || '',
    proExpireTime: STUserManager.get().user?.proExpireTime || '',
    inviteCode: STUserManager.get().user?.inviteCode || '',
  };
}

export function closeChatPanelSlotsLocalPanels() {
  showDownloader.value = false;
  showAccountPanel.value = false;
}

export function isChatPanelSlotsLocalPanelOpen() {
  return showDownloader.value || showAccountPanel.value;
}
