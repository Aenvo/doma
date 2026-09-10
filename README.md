<p align="right"><a href="README-ZH.md">中文</a> | EN</p>

<div align="center">
 A browser agent from <a href="https://staybrowser.com">Stay Browser</a>.
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

**DomA /ˈdoʊmə/** is an open-source AI web automation agent that runs in the browser. It helps you browse, fill forms, click, collect, and handle other web tasks. With DomA installed, you don't need a dedicated "AI browser" — any extension-capable browser becomes your AI browser.

> [!TIP]
> Besides this open-source edition, you can also find the commercial build in the Chrome / Edge stores (**[DomA for Chrome](https://chromewebstore.google.com/detail/doma-conversation-is-acti/inincmccnblbnpbangllhnchlagnfbel?hl=en-US&utm_source=ext_sidebar)**, **[DomA for Edge](https://microsoftedge.microsoft.com/addons/detail/doma-%E5%AF%B9%E8%AF%9D%E5%8D%B3%E6%93%8D%E4%BD%9C%EF%BC%8C%E4%BD%A0%E7%9A%84%E6%B5%8F%E8%A7%88%E5%99%A8%E6%99%BA%E8%83%BD%E4%BD%93/didcnhnnpcmdphiolfnfhdnmhmbjflnb?hl=zh-CN)**). The commercial edition is built on this open-source core, plus video download, userscripts manager, ad blocking, and more.

## Quick start

**Requirements:** Node.js 20+ (for building from source), Chrome or Edge, and your own LLM API key (OpenAI-compatible providers, etc.).

### Download a prebuilt package
Download the latest package from [Releases](https://github.com/dom-actions/doma/releases), unzip it, then drag the folder onto your browser extensions page (`chrome://extensions` / `edge://extensions`, Developer mode on).

### Build from source
```bash
git clone https://github.com/dom-actions/doma
cd doma && npm install
npm run build
```

Load `dist/desktop/open` as an unpacked extension (Developer mode on).

## Development
```bash
npm run dev
```

See the contributor guide in [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[PolyForm Shield License 1.0.0](./LICENSE)

> [!IMPORTANT]
> You may modify this repository and install it for your own use, and you may distribute it under the license terms. You may not use this software (or derivative works) to provide a product or service that competes with DomA or its official commercial edition — whether free or paid.
