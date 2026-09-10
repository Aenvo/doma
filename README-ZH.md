<p align="right">中文 | <a href="README.md">EN</a></p>

<div align="center">
 来自 <a href="https://staybrowser.com">Stay Browser</a> 的浏览器智能体。
</div>

<br>

<div align="center">
  <a href="https://www.domactions.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/images/lockup-dark.svg">
      <img alt="DomA" src=".github/images/lockup-light.svg" width="360">
    </picture>
  </a>
</div>

<br>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/images/slogan-dark.svg">
    <img alt="Conversation is action, your browser agent" src=".github/images/slogan-light.svg" width="650">
  </picture>
</div>

<br>

**DomA /ˈdoʊmə/** 是一款跑在浏览器里的开源 AI 网页自动化智能体，帮你完成浏览、填写、点击、收集等各类网页事务。装上 DomA，不必再专门下载一款「AI 浏览器」—— 任何支持扩展的浏览器，都能立刻变成你的 AI 浏览器。

> [!TIP]
> 除了开源版本，你也可以在Chrome/Edge的扩展商店找到DomA商业版本（**[DomA for Chrome](https://chromewebstore.google.com/detail/doma-conversation-is-acti/inincmccnblbnpbangllhnchlagnfbel?hl=en-US&utm_source=ext_sidebar)**, **[DomA for Edge](https://microsoftedge.microsoft.com/addons/detail/doma-%E5%AF%B9%E8%AF%9D%E5%8D%B3%E6%93%8D%E4%BD%9C%EF%BC%8C%E4%BD%A0%E7%9A%84%E6%B5%8F%E8%A7%88%E5%99%A8%E6%99%BA%E8%83%BD%E4%BD%93/didcnhnnpcmdphiolfnfhdnmhmbjflnb?hl=zh-CN)**），商业版本以此开源版本为核心底座，附加了视频下载、用户脚本管理、广告屏蔽等能力。

## 快速开始

**环境要求：** 从源码构建需 Node.js 20+；浏览器为 Chrome 或 Edge；并自备大模型 API Key（OpenAI 兼容等）。

### 下载安装包
从 [Releases](https://github.com/dom-actions/doma/releases) 下载最新安装包，解压后拖入扩展管理页（`chrome://extensions` / `edge://extensions`，开启开发者模式）。

### 编译源代码安装
```bash
git clone https://github.com/dom-actions/doma
cd doma && npm install
npm run build
```

将 `dist/desktop/open` 以「加载已解压的扩展程序」方式装入浏览器（需开启开发者模式）。

## 开发

```bash
npm run dev
```

开发者指南见 [CONTRIBUTING-ZH.md](./CONTRIBUTING-ZH.md)。


## 许可证

[PolyForm Shield License 1.0.0](./LICENSE)

> [!IMPORTANT]
> 你可以基于本仓库修改并自行安装使用，也可以在遵守许可证条款的前提下分发。但禁止将本软件（或其衍生作品）用于提供与 DomA 或其官方商业版构成竞争的产品或服务——无论是否收费。
