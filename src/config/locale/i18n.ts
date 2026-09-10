import { createI18n, type UseI18nOptions } from "vue-i18n";
import { getContext } from '@/services/Context'
// import { language } from "@/utils/common";


const lan =  getContext().browser.i18n.getUILanguage();
const lang = lan && lan.indexOf('zh') > -1 ? 'zh' : 'en';
// console.log("i18n-lang----", i18nLang, ",UA.language----", language())
export const i18n = (config: UseI18nOptions) => {
  return createI18n({
    warnHtmlInMessage: false,
    fallbackLocale: 'zh',
    globalInjection: true,
    allowComposition: true,
    locale: lang,
    legacy: false, // false 表示你不希望使用 Vue 2 的 API，而是希望使用 Vue 3 的 Composition API, 默认是true
    flatJson: true, // 启用扁平化访问
    missingWarn: false, // 可选：禁用缺失翻译警告
    returnObjects: true,
    ...config,
  });
}