import { createApp } from 'vue'
import '@/assets/css/common.less'
import '@/assets/css/variable.less'
import App from './App.vue'
import popupMsg from '@/config/locale/local.popup'
import sidepanelMsg from '@/config/locale/local.sidepanel'
import { i18n } from '@/config/locale/i18n'

const messages = {
  en: { ...popupMsg.en, ...sidepanelMsg.en },
  zh: { ...popupMsg.zh, ...sidepanelMsg.zh },
}
import { bootstrapEdition } from '@/edition/editionBootstrap'
import store from '@/store'
import toast from '@/components/layout/box/toast/index.ts'

const toastAction = (options: any) => {
  if (options && typeof options == 'string') {
    toast({ title: options })
  } else {
    toast(options)
  }
}

const app = createApp(App)
app.config.errorHandler = (err, _instance, info) => {
  console.error('[DomA/popup] vue error', err, info)
}
app.provide('global', {
  store,
  toast: toastAction,
})

void bootstrapEdition()
  .catch((e) => {
    console.warn('[DomA/popup] bootstrapEdition error (continue mount)', e)
  })
  .finally(() => {
    app.use(i18n({ messages })).mount('#app')
  })
