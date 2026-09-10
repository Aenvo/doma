import { createApp } from "vue";
import "@/assets/css/common.less";
import "@/assets/css/variable.less";
import App from "./App.vue";import workspaceMsg from "@/config/locale/local.workspace";
import { i18n } from "@/config/locale/i18n";

const messages = {
  en: { ...workspaceMsg.en },
  zh: { ...workspaceMsg.zh },
};

const app = createApp(App);
app.use(i18n({ messages }));
app.mount("#app");

try {
  const lan = chrome?.i18n?.getUILanguage?.() || "";
  const locale = lan && lan.indexOf("zh") > -1 ? "zh" : "en";
  document.title =
    (messages as any)[locale]?.workspace?.pageTitle || "DomA Workspace";
} catch {
  document.title = "DomA Workspace";
}
