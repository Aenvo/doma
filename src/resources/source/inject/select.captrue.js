(()=>{
  console.log("select.captrue.js");
  const context = {
    browser: chrome || browser || window.browser || window.chrome
  }

  const SELECT_STYLE_ID = "doma-select-styles";
  const SELECT_CLIP_ID = "doma-select-clip";

  /** 注入选区样式：在 .doma-select 根容器定义色值变量，子元素（border / actionBar 等）均可 var() 引用 */
  function ensureSelectStyles() {
    if (document.getElementById(SELECT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = SELECT_STYLE_ID;
    style.textContent = `
      .doma-select {
        --stay-primary: #2F3134;
        --stay-blue: #337BF6;
        --stay-background: #f8f8f6;
        --stay-backgroundSecondary: #ffffff;
        --stay-border:#e0e0e0;
      }
      @media (prefers-color-scheme: dark) {
        .doma-select {
          --stay-primary: #DCDCDC;
          --stay-blue: #337AF6;
          --stay-background: #131313;
          --stay-border: #37372F;
          --stay-backgroundSecondary: #1c1c1c;
        }
      }
      .doma-select-action-bar {
        position: fixed;
        z-index: 2147483647;
        display: none;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 5px;
        border-radius: 8px;
        pointer-events: auto;
        background: var(--stay-background);
        border: 1px solid var(--stay-primary);
      }
      .doma-select-action-bar__btn {
        border: none;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        line-height: 1.2;
        cursor: pointer;
        font-weight: 500;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        margin: 0;
      }
      .doma-select-action-bar__btn--cancel {
        background: var(--stay-border);
        color: var(--stay-primary);
      }
      // .doma-select-action-bar__btn--cancel:hover {
      //   box-shadow: 0px 0px 6px -2px rgba(0,0,0,0.3);
      // }
      @supports (color: color-mix(in lab, red, red)) {
        .doma-select-action-bar__btn--cancel:hover {
          background:color-mix(in oklab, var(--stay-border) 90%, transparent)
        }
      }
      .doma-select-action-bar__btn--confirm {
        background: var(--stay-primary);
        color: var(--stay-backgroundSecondary);
      }
      
      
      @supports (color: color-mix(in lab, red, red)) {
        .doma-select-action-bar__btn--confirm:hover {
          background:color-mix(in oklab, var(--stay-primary) 90%, transparent)
        }
      }

      .doma-select-action-bar__btn--iframe {
        background: var(--stay-blue);
        color: var(--stay-backgroundSecondary);
      }
      .doma-select-action-bar__btn--iframe:hover {
        background: var(--stay-backgroundSecondary-drop);
      }
      @supports (color: color-mix(in lab, red, red)) {
        .doma-select-action-bar__btn--iframe:hover {
          background:color-mix(in oklab, var(--stay-blue) 90%, transparent)
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Inspect 式精确选择：坐标命中即选中，不做语义抬升/归并
   * @class
   */
  class SelectCaptrue{
    CONFIG = {
      borderRadius: 6,
      borderWidth: 3,
      animationSpeed: 0.2,
      closeDuration: 360,
      minHighlightSize: 1, // 高亮最小可见尺寸（Inspect 可标 1px 元素）
      enterThreshold: 1,
    };
    state = {
      start: false,
      currentEl: null,
      currentRect: null,
      targetRect: null,
      paused: false, // 添加暂停move开关，主要在选中元素后暂停move
      currentSelector: "",
      currentIframeId: null,
      pendingSelection: null, // 待选中的元素解析后的参数，selector,text,type
    };
    
    // 记录是否已开始move
    ticking = false;
    lastEvent = null;
    // 灰层
    grayLayer = null;
    // 命中层（拦截鼠标，解决 iframe 点击无法冒泡到父文档的问题）
    hitLayer = null;
    border = null;
    // 选区根容器（CSS 变量定义在此，子元素可继承）
    root = null;
    // 选区工具条
    actionBar = null;
    // 取消按钮
    cancelBtn = null;
    // 确认按钮
    confirmBtn = null;
    
    // 动画帧id
    animationFrameId = null;
    closeTimer = null;
    topMostObserver = null;

    static instance;
    constructor(){
      this.onMove = this.onMove.bind(this);
      this.targetOnClick = this.targetOnClick.bind(this);
      this.onCancelSelect = this.onCancelSelect.bind(this);
      this.onConfirmSelect = this.onConfirmSelect.bind(this);
      this.onIframeClick = this.onIframeClick.bind(this);
      this.onViewportChanged = this.onViewportChanged.bind(this);
      this.onHitLayerWheel = this.onHitLayerWheel.bind(this);
      this.onKeydownChange = this.onKeydownChange.bind(this);
      this.initLayer();
    }
    static getInstance(){
      if(!SelectCaptrue.instance){
        SelectCaptrue.instance = new SelectCaptrue();
      }
      return SelectCaptrue.instance;
    }

    initLayer(){
      ensureSelectStyles();
      this.root = document.createElement("div");
      this.root.className = "doma-select";
      Object.assign(this.root.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        pointerEvents: "none",
      });
      /**********************
       * 蒙层
       **********************/
      this.grayLayer = document.createElement("div");
      Object.assign(this.grayLayer.style, {
        position: "fixed",
        inset: 0,
        backdropFilter: "grayscale(1)",
        WebkitBackdropFilter: "grayscale(1)",
        background: "rgba(0,0,0,0.6)",
        zIndex: 2147483647,
        pointerEvents: "none",
        willChange: "clip-path, opacity",
        opacity: "1",
        transform: "scale(1)",
        transformOrigin: "center center",
        transition: `opacity ${this.CONFIG.closeDuration}ms ease, transform ${this.CONFIG.closeDuration}ms cubic-bezier(0.22,0.7,0.1,1)`,
        clipPath: `url(#${SELECT_CLIP_ID})`,
      });

      this.clipSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.clipSvg.setAttribute("aria-hidden", "true");
      Object.assign(this.clipSvg.style, {
        position: "fixed",
        width: "0",
        height: "0",
        overflow: "hidden",
        pointerEvents: "none",
      });
      this.clipSvg.innerHTML = `
        <defs>
          <clipPath id="${SELECT_CLIP_ID}" clipPathUnits="userSpaceOnUse">
            <path id="doma-select-clip-path" clip-rule="evenodd" d="M 0 0 Z"/>
          </clipPath>
        </defs>
      `;
      this.clipPathEl = this.clipSvg.querySelector("#doma-select-clip-path");

      this.hitLayer = document.createElement("div");
      Object.assign(this.hitLayer.style, {
        position: "fixed",
        inset: 0,
        background: "transparent",
        zIndex: 2147483647,
        pointerEvents: "auto",
        cursor: "pointer"
      });
      

      /**********************
       * 边框（内绘：border + border-box，贴 viewport 边缘时不被裁切）
       **********************/
      this.border = document.createElement("div");
      Object.assign(this.border.style, {
        position: "fixed",
        zIndex: 2147483647,
        pointerEvents: "none",
        borderRadius: this.CONFIG.borderRadius + "px",
        boxSizing: "border-box",
        border: `${this.CONFIG.borderWidth}px solid var(--stay-primary)`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        background: "transparent",
        overflow: "hidden",
        opacity: "1",
        transform: "scale(1)",
        transformOrigin: "center center",
        transition: `opacity ${this.CONFIG.closeDuration}ms ease, transform ${this.CONFIG.closeDuration}ms cubic-bezier(0.22,0.7,0.1,1)`
      });

      /**********************
       * 选区工具条（样式见 ensureSelectStyles 注入的 CSS 变量）
       **********************/
      this.actionBar = document.createElement("div");
      this.actionBar.className = "doma-select-action-bar";

      this.cancelBtn = document.createElement("button");
      this.cancelBtn.type = "button";
      this.cancelBtn.className = "doma-select-action-bar__btn doma-select-action-bar__btn--cancel";
      this.cancelBtn.textContent = "取消";

      this.confirmBtn = document.createElement("button");
      this.confirmBtn.type = "button";
      this.confirmBtn.className = "doma-select-action-bar__btn doma-select-action-bar__btn--confirm";
      this.confirmBtn.textContent = "选择";

      this.iframeBtn = document.createElement("button");
      this.iframeBtn.type = "button";
      this.iframeBtn.className = "doma-select-action-bar__btn doma-select-action-bar__btn--iframe";
      this.iframeBtn.textContent = "内嵌网页";

      this.actionBar.appendChild(this.cancelBtn);
      this.actionBar.appendChild(this.confirmBtn);
      this.cancelBtn.addEventListener("click", this.onCancelSelect, true);
      this.confirmBtn.addEventListener("click", this.onConfirmSelect, true);
      this.iframeBtn.addEventListener("click", this.onIframeClick, true);

      this.root.appendChild(this.clipSvg);
      this.root.appendChild(this.grayLayer);
      this.root.appendChild(this.hitLayer);
      this.root.appendChild(this.border);
      this.root.appendChild(this.actionBar);

      /**********************
       * iframe fallback
       **********************/
      document.addEventListener("mouseover", (e) => {
        if(this.state.paused){
          return;
        }
        if (e.target.tagName === "IFRAME") {
          const rect = e.target.getBoundingClientRect();
          this.animateTo(rect);
        }
      });
    }

    loopAnimation(){
      function lerp(a, b, t) {
        return a + (b - a) * t;
      }
      if (this.state.targetRect && this.state.currentRect) {
        const c = this.state.currentRect;
        const t = this.state.targetRect;

        c.left = lerp(c.left, t.left, this.CONFIG.animationSpeed);
        c.top = lerp(c.top, t.top, this.CONFIG.animationSpeed);
        c.width = lerp(c.width, t.width, this.CONFIG.animationSpeed);
        c.height = lerp(c.height, t.height, this.CONFIG.animationSpeed);

        this.render(c);
      }
      if (this.state.start) {
        this.ensureOverlayOnTop();
      }
      this.animationFrameId = requestAnimationFrame(() => this.loopAnimation());
    }

    /** SVG evenodd 挖洞 path：外圈 viewport + 内圈圆角选区，保留 backdrop-filter 灰度 */
    buildClipPathD(x, y, w, h, r, vw, vh) {
      const outer = `M 0 0 H ${vw} V ${vh} H 0 Z`;
      if (w < 1 || h < 1) return outer;
      const rad = Math.max(0, Math.min(r, w / 2, h / 2));
      const x2 = x + w;
      const y2 = y + h;
      if (rad <= 0) {
        return `${outer} M ${x} ${y} H ${x2} V ${y2} H ${x} Z`;
      }
      const hole = [
        `M ${x + rad} ${y}`,
        `H ${x2 - rad}`,
        `A ${rad} ${rad} 0 0 1 ${x2} ${y + rad}`,
        `V ${y2 - rad}`,
        `A ${rad} ${rad} 0 0 1 ${x2 - rad} ${y2}`,
        `H ${x + rad}`,
        `A ${rad} ${rad} 0 0 1 ${x} ${y2 - rad}`,
        `V ${y + rad}`,
        `A ${rad} ${rad} 0 0 1 ${x + rad} ${y}`,
        "Z",
      ].join(" ");
      return `${outer} ${hole}`;
    }

    updateGrayLayerClip(x, y, w, h, vw, vh) {
      if (!this.clipPathEl) return;
      const bw = this.CONFIG.borderWidth;
      const rx = this.CONFIG.borderRadius;
      // 洞比 border 外框内缩 bw：border 带叠在 grayLayer 上，避免 clip 抗锯齿与页面白底之间的漏白缝
      let hx = x + bw;
      let hy = y + bw;
      let hw = w - 2 * bw;
      let hh = h - 2 * bw;
      let hr = Math.max(0, rx - bw);
      if (hw < 1 || hh < 1) {
        hx = x;
        hy = y;
        hw = w;
        hh = h;
        hr = rx;
      }
      const d = this.buildClipPathD(hx, hy, hw, hh, hr, vw, vh);
      this.clipPathEl.setAttribute("d", d);
    }

    /**********************
     * 渲染
     **********************/
    render(r) {
      if (!r || r.width <= 0 || r.height <= 0) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const x = Math.max(0, Math.min(r.left, vw));
      const y = Math.max(0, Math.min(r.top, vh));
      const w = Math.max(0, Math.min(r.width, vw - x));
      const h = Math.max(0, Math.min(r.height, vh - y));
      if (w < 1 || h < 1) return;

      const rx = this.CONFIG.borderRadius;
      this.updateGrayLayerClip(x, y, w, h, vw, vh);

      Object.assign(this.border.style, {
        left: x + "px",
        top: y + "px",
        width: w + "px",
        height: h + "px",
        borderRadius: rx + "px",
      });
    }
    /**********************
     * 动画
     **********************/
    animateTo(rect) {
      if (!this.state.currentRect) this.state.currentRect = { ...rect };
      this.state.targetRect = rect;
    }

    /**
     * 元素在视口内、且被 overflow 祖先裁剪后的可见矩形。
     * 解决 carousel 轨道（width:999999px + 父级 overflow:hidden）导致蒙层挖洞超大、性能崩溃。
     */
    getVisibleClientRect(el) {
      if (!el || !(el instanceof Element)) return null;
      const base = el.getBoundingClientRect();
      let left = base.left;
      let top = base.top;
      let right = base.right;
      let bottom = base.bottom;

      left = Math.max(left, 0);
      top = Math.max(top, 0);
      right = Math.min(right, window.innerWidth);
      bottom = Math.min(bottom, window.innerHeight);

      let cur = el.parentElement;
      let depth = 0;
      while (cur && cur !== document.documentElement && depth < 24) {
        const style = getComputedStyle(cur);
        const clips =
          /hidden|clip|auto|scroll|overlay/.test(style.overflow)
          || /hidden|clip|auto|scroll|overlay/.test(style.overflowX)
          || /hidden|clip|auto|scroll|overlay/.test(style.overflowY);
        if (clips) {
          const pr = cur.getBoundingClientRect();
          left = Math.max(left, pr.left);
          top = Math.max(top, pr.top);
          right = Math.min(right, pr.right);
          bottom = Math.min(bottom, pr.bottom);
        }
        cur = cur.parentElement;
        depth++;
      }

      const width = right - left;
      const height = bottom - top;
      if (width < this.CONFIG.minHighlightSize || height < this.CONFIG.minHighlightSize) return null;
      return { left, top, width, height, right, bottom };
    }

    /** 相对路径 / 协议相对 // → 绝对 URL（基于当前页 baseURI） */
    resolveAbsoluteUrl(raw) {
      const url = (raw || "").trim();
      if (!url) return "";
      if (/^(data:|blob:|javascript:)/i.test(url)) return url;
      try {
        return new URL(url, document.baseURI || window.location.href).href;
      } catch {
        return url;
      }
    }

    getImageUrl(img) {
      if (!img) return "";
      const raw =
        img.currentSrc
        || img.getAttribute("src")
        || img.getAttribute("data-src")
        || img.getAttribute("data-original")
        || img.getAttribute("data-lazy-src")
        || img.src
        || "";
      return this.resolveAbsoluteUrl(raw);
    }

    getImageUrlList(node) {
      return this.getVisibleImages(node).map((img) => this.getImageUrl(img));
    }

    /** 可见 img（排除隐藏/占位；node 本身为 img 时也计入） */
    getVisibleImages(node) {
      if (!node || !(node instanceof Element)) return [];
      const imgs =
        node.tagName === "IMG"
          ? [node, ...node.querySelectorAll("img")]
          : [...node.querySelectorAll("img")];
      return imgs.filter((img) => {
        const style = getComputedStyle(img);
        if (style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = img.getBoundingClientRect();
        return rect.width >= 1 && rect.height >= 1;
      });
    }

    /**********************
     * 事件
     **********************/
    onMove(e) {
      if (!this.state.start || this.state.paused) return;
      this.lastEvent = e;
      // console.log("onMove, e : ", e);
      if (!this.ticking) {
        this.ticking = true;
        this.animationFrameId = requestAnimationFrame(() => {
          if (this.lastEvent) {
            this.handleMove(this.lastEvent);
          } else {
            console.log("onMove, lastEvent is null");
          }
          this.ticking = false;
        });
      }
    }

    /** DomA 选区 overlay 节点（命中检测时需跳过） */
    isOwnOverlay(el) {
      if (!el || !(el instanceof Element)) return false;
      return !!(this.root && this.root.contains(el));
    }

    /** 命中检测时暂隐 overlay（同步恢复），避免全屏层挡住下方 YouMind 等扩展 UI */
    suspendOverlayForHitTest() {
      if (!this.root) return () => {};
      const prev = this.root.style.visibility;
      this.root.style.visibility = "hidden";
      return () => {
        this.root.style.visibility = prev;
      };
    }

    /**********************
     * Inspect 式命中（对齐 DevTools element picker）
     **********************/
    /** 穿透 open shadow root（Inspect 会进入 open shadow） */
    deepElementFromPoint(x, y, scope = document) {
      let el = scope.elementFromPoint(x, y);
      if (!el || !(el instanceof Element)) return null;
      for (let i = 0; i < 16; i++) {
        if (!el.shadowRoot) break;
        const inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      return el;
    }

    /** 是否可作为 Inspect 目标（排除自身 overlay） */
    isInspectableNode(node) {
      if (!node || !(node instanceof Element)) return false;
      if (this.isOwnOverlay(node)) return false;
      if (node === document.documentElement || node === document.body) return false;
      return true;
    }

    /** 节点是否参与 hit test */
    isHitTestable(node) {
      if (!this.isInspectableNode(node)) return false;
      return getComputedStyle(node).pointerEvents !== "none";
    }

    /**
     * 与 DevTools Inspect 对齐：返回坐标下最顶层可命中 DOM 节点，不做语义改写。
     * 1. deepElementFromPoint + shadow 穿透
     * 2. 失败时沿 elementsFromPoint 栈向下找（跳过 pointer-events:none）
     */
    pickElementAtPoint(x, y) {
      const extensionHit = this.resolveExtensionFloatingTarget(x, y);
      if (extensionHit) return extensionHit;

      const deep = this.deepElementFromPoint(x, y);
      if (this.isHitTestable(deep)) return deep;

      if (typeof document.elementsFromPoint !== "function") return null;

      for (const node of document.elementsFromPoint(x, y)) {
        if (!this.isHitTestable(node)) continue;
        if (node.shadowRoot) {
          const inner = node.shadowRoot.elementFromPoint(x, y);
          if (this.isHitTestable(inner) && inner !== node) return inner;
        }
        return node;
      }
      return null;
    }

    /** YouMind 等扩展浮层：按已知 id + 坐标矩形兜底（light DOM） */
    resolveExtensionFloatingTarget(x, y) {
      const bubble = document.getElementById("floating-bubble");
      if (!bubble || this.isOwnOverlay(bubble)) return null;
      const r = bubble.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;

      for (const btn of bubble.querySelectorAll("button, [role='button']")) {
        const br = btn.getBoundingClientRect();
        if (x >= br.left && x <= br.right && y >= br.top && y <= br.bottom) {
          if (br.width >= 1 && br.height >= 1) return btn;
        }
      }
      if (r.width >= 1 && r.height >= 1) return bubble;
      return null;
    }

    getElementFromPoint(x, y) {
      const restore = this.suspendOverlayForHitTest();
      try {
        return this.pickElementAtPoint(x, y);
      } finally {
        restore();
      }
    }

    /** 高亮矩形：优先 overflow 裁剪后的可见区域，否则用 layout box */
    getHighlightRect(el) {
      if (!el || !(el instanceof Element)) return null;
      const visible = this.getVisibleClientRect(el);
      if (visible) return visible;
      const r = el.getBoundingClientRect();
      if (r.width < this.CONFIG.minHighlightSize || r.height < this.CONFIG.minHighlightSize) {
        return null;
      }
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
      };
    }

    /** 选区模式下保持 overlay 为 document 最后一个子节点，压过 YouMind 等同 z-index 扩展 UI */
    ensureOverlayOnTop() {
      if (!this.state.start || !this.root?.parentElement) return;
      const parent = this.root.parentElement;
      if (parent.lastElementChild !== this.root) {
        parent.appendChild(this.root);
      }
    }

    startTopMostObserver() {
      if (this.topMostObserver) return;
      this.topMostObserver = new MutationObserver(() => {
        this.ensureOverlayOnTop();
      });
      this.topMostObserver.observe(document.documentElement, { childList: true });
      if (document.body) {
        this.topMostObserver.observe(document.body, { childList: true });
      }
    }

    stopTopMostObserver() {
      if (this.topMostObserver) {
        this.topMostObserver.disconnect();
        this.topMostObserver = null;
      }
    }

    getScrollableAncestor(el, deltaY = 0, deltaX = 0) {
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        if (!(cur instanceof Element)) {
          cur = cur && cur.parentElement;
          continue;
        }
        const style = getComputedStyle(cur);
        const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight;
        const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && cur.scrollWidth > cur.clientWidth;
        if ((deltaY && canScrollY) || (deltaX && canScrollX) || (!deltaY && !deltaX && (canScrollY || canScrollX))) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    }

    onHitLayerWheel(e) {
      if (!this.state.start) return;
      const target = this.getElementFromPoint(e.clientX, e.clientY);
      const scroller = this.getScrollableAncestor(target, e.deltaY, e.deltaX);
      if (scroller) {
        e.preventDefault();
        if (e.deltaY) scroller.scrollTop += e.deltaY;
        if (e.deltaX) scroller.scrollLeft += e.deltaX;
        return;
      }
      // fallback 到页面滚动
      if (e.deltaY || e.deltaX) {
        e.preventDefault();
        window.scrollBy({
          top: e.deltaY,
          left: e.deltaX,
          behavior: "auto"
        });
      }
    }

    handleMove(e) {
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      const el = this.getElementFromPoint(e.clientX, e.clientY);
      if (!el || el === this.state.currentEl) return;

      const rect = this.getHighlightRect(el);
      if (!rect) return;

      // 增强的防抖逻辑：只有变化明显才切换
      if (this.state.currentRect) {
        const dx = Math.abs(rect.left - this.state.currentRect.left);
        const dy = Math.abs(rect.top - this.state.currentRect.top);

        if (dx < this.CONFIG.enterThreshold && dy < this.CONFIG.enterThreshold) return;
      }

      this.state.currentEl = el;

      this.animateTo({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      });
    }

    getCssEscape(value = "") {
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(String(value));
      }
      return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    }

    createSelectorSegment(el) {
      const tagName = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (!parent) return tagName;

      const sameTagSiblings = Array.from(parent.children).filter(
        child => child.tagName.toLowerCase() === tagName
      );

      if (sameTagSiblings.length <= 1) {
        return tagName;
      }

      const nth = sameTagSiblings.indexOf(el) + 1;
      return `${tagName}:nth-of-type(${nth})`;
    }

    getElementSelectorPath(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";

      // 优先使用唯一 id，路径更短更稳定
      if (el.id) {
        const escapedId = this.getCssEscape(el.id);
        const idSelector = `#${escapedId}`;
        if (document.querySelectorAll(idSelector).length === 1) {
          return idSelector;
        }
      }

      const segments = [];
      let current = el;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        if (current.id) {
          const escapedId = this.getCssEscape(current.id);
          const idSelector = `#${escapedId}`;
          if (document.querySelectorAll(idSelector).length === 1) {
            segments.unshift(idSelector);
            break;
          }
        }

        segments.unshift(this.createSelectorSegment(current));
        const selector = segments.join(" > ");
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
        current = current.parentElement;
      }

      return segments.join(" > ");
    }

    showActionBarForRect(rect) {
      if (!this.actionBar) return;
      this.state.paused = true;

      if(this.state.currentEl.tagName === "IFRAME"){
        if(!this.iframeBtn.parentElement){
          this.actionBar.appendChild(this.iframeBtn);
        }
      }

      this.actionBar.style.display = "flex";

      const gap = 8;
      const insideBottomOffset = 20;
      const barRect = this.actionBar.getBoundingClientRect();
      const barWidth = barRect.width || 140;
      const barHeight = barRect.height || 40;
      const canShowInsideBottom = barHeight + insideBottomOffset <= rect.height;
      const viewportPadding = 8;
      const minTop = viewportPadding;
      const maxTop = Math.max(minTop, window.innerHeight - barHeight - viewportPadding);
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);

      let top = rect.bottom + gap;
      // 选中区域贴近页面底部时：显示在选区内，距离底部20px
      if (rect.bottom + barHeight + gap > window.innerHeight) {
        if (canShowInsideBottom) {
          top = visibleBottom - insideBottomOffset - barHeight;
          if (top < visibleTop + 4) {
            top = visibleTop + 4;
          }
        } else {
          // 当工具条高度 + 距离选区底部的间距大于选区高度时，显示在选区上方
          top = rect.top - barHeight - gap;
        }
      }
      // 保证工具条始终在可视区域
      top = Math.min(maxTop, Math.max(minTop, top));

      const centerLeft = rect.left + rect.width / 2 - barWidth / 2;
      const minLeft = 8;
      const maxLeft = Math.max(8, window.innerWidth - barWidth - 8);
      const left = Math.min(maxLeft, Math.max(minLeft, centerLeft));

      this.actionBar.style.left = `${left}px`;
      this.actionBar.style.top = `${top}px`;
    }

    hideActionBar() {
      if (!this.actionBar) return;
      this.actionBar.style.display = "none";
      if(this.iframeBtn.parentElement){
        this.iframeBtn.remove();
      }
    }

    onCancelSelect(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      this.state.pendingSelection = null;
      this.state.currentSelector = "";
      this.state.paused = false;
      this.hideActionBar();
    }

    onViewportChanged() {
      if (!this.state.start) return;
      // 页面滚动/尺寸变化后，取消当前确认态并恢复选择态
      this.onCancelSelect();
      this.state.currentEl = null;
      this.state.currentRect = null;
      this.state.targetRect = null;
      // 若鼠标位置已记录，立即根据当前视口重新计算一次选区
      if (this.lastEvent) {
        this.handleMove(this.lastEvent);
      }
    }

    onKeydownChange(e){
      if (e.key === "Escape") this.closeSelect();
    }

    onConfirmSelect(e) {
      console.log(this.state.pendingSelection);
      e.preventDefault();
      e.stopPropagation();
      if (!this.state.pendingSelection) {
        this.hideActionBar();
        this.state.paused = false;
        return;
      }
      sendSelectorMessage(this.state.pendingSelection);
      this.closeSelect();
    }

    onIframeClick(e) {
      console.log("onIframeClick, e : ", e, this.state.currentEl?.src);
      e.preventDefault();
      e.stopPropagation();
      if (!this.state.currentEl) return;
      const iframeEl = this.state.currentEl;
      const frameWin = iframeEl && iframeEl.tagName === "IFRAME" ? iframeEl.contentWindow : null;
      if (!frameWin) return;

      this.closeSelect();
      // if (this.hitLayer) {
      //   this.hitLayer.removeEventListener("mousemove", this.onMove, true);
      //   this.hitLayer.removeEventListener("click", this.targetOnClick, true);
      //   this.hitLayer.removeEventListener("wheel", this.onHitLayerWheel, false);
      // }

      this.state.currentIframeId = null;
      frameWin.postMessage({ operate: "handleSelectIframeDom", url: iframeEl.src },"*");
      console.log("onIframeClick, iframeEl.src : ", iframeEl.src);
    }

    targetOnClick(e){
      if (!this.state.start || this.state.paused) return;
      if (this.actionBar?.contains(e.target)) return;
      if (!this.state.currentEl) return;

      const rect = this.getHighlightRect(this.state.currentEl)
        || this.state.currentEl.getBoundingClientRect();

      const isInside = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );

      if (!isInside) return;

      e.preventDefault();
      e.stopPropagation();
      this.handleSelectArea();
      this.showActionBarForRect(rect);
    }

    handleSelectArea(){
      const text = this.state.currentEl.textContent.trim();
      const nodeName = this.state.currentEl.nodeName.toLowerCase();
      console.log("选中元素:", nodeName, text, this.state.currentEl);
      // 解析this.state.currentEl元素的query selector路径
      const selectorPath = this.getElementSelectorPath(this.state.currentEl);
      this.state.currentSelector = selectorPath;
      console.log("选中元素querySelector路径:", selectorPath);

      const imgList = this.getVisibleImages(this.state.currentEl);

      const host = window.location.host;
      let favicon = "";
      const faviconEl = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
      if (faviconEl) {
          favicon = faviconEl.href;
      } else {
          // fallback: 常规拼装 favicon url（有些网站未设置icon标签）
          favicon = `${window.location.origin}/favicon.ico`;
      }
      
      this.state.pendingSelection = {
        selectors: {
          rootSelector: selectorPath,
          childSelectors: [],
        },
        text,
        type: nodeName,
        iframeId: this.state.currentIframeId,
        host: host,
        favicon: favicon,
        imgList: this.getImageUrlList(this.state.currentEl)
      };
    }

    initEventListeners() {
      /**********************
       * document 捕获：YouMind 等同 z-index 扩展 UI 在上层时仍能收到坐标
       * click 仍用坐标 + currentEl rect 判断，不依赖 e.target 是否为 hitLayer
       **********************/
      document.addEventListener("mousemove", this.onMove, true);
      document.addEventListener("click", this.targetOnClick, true);
      if (this.hitLayer) {
        this.hitLayer.addEventListener("wheel", this.onHitLayerWheel, { passive: false });
      }
      window.addEventListener("scroll", this.onViewportChanged, true);
      window.addEventListener("resize", this.onViewportChanged, true);
      window.addEventListener("keydown", this.onKeydownChange, true);
    }

    removeEventListeners() {
      document.removeEventListener("mousemove", this.onMove, true);
      document.removeEventListener("click", this.targetOnClick, true);
      if (this.hitLayer) {
        this.hitLayer.removeEventListener("wheel", this.onHitLayerWheel, false);
      }
      window.removeEventListener("scroll", this.onViewportChanged, true);
      window.removeEventListener("resize", this.onViewportChanged, true);
      window.removeEventListener("keydown", this.onKeydownChange, true);
    }

    resetLayerVisualState() {
      if (this.grayLayer) {
        this.grayLayer.style.transition = "opacity 0.3s ease-in";
        this.grayLayer.style.opacity = "1";
      }
      if (this.border) {
        this.border.style.transition = "opacity 0.3s ease-in";
        this.border.style.opacity = "1";
      }
      if (this.hitLayer) {
        this.hitLayer.style.pointerEvents = "auto";
      }
    }

    /** 清空选中高亮：状态 + 蒙层挖洞/边框，避免再次 taggleSelect 时复现上次选区 */
    resetSelectionHighlight() {
      this.state.currentEl = null;
      this.state.currentRect = null;
      this.state.targetRect = null;
      this.state.currentSelector = "";
      this.state.pendingSelection = null;
      if (this.clipPathEl) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        this.clipPathEl.setAttribute("d", `M 0 0 H ${vw} V ${vh} H 0 Z`);
      }
      if (this.border) {
        Object.assign(this.border.style, {
          left: "0px",
          top: "0px",
          width: "0px",
          height: "0px",
        });
      }
    }

    
    taggleSelect(){
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
      this.resetSelectionHighlight();
      this.resetLayerVisualState();
      if (this.hitLayer && !this.hitLayer.parentElement) {
        this.hitLayer.setAttribute('tabindex', '-1');
        this.hitLayer.style.outline = 'none'; // 移除焦点边框
      }
      if (this.root && !this.root.parentElement) {
        document.documentElement.appendChild(this.root);
      }
      this.ensureOverlayOnTop();
      this.startTopMostObserver();
      this.hideActionBar();
      this.state.pendingSelection = null;
      this.state.paused = false;
      this.state.start = true;
      this.loopAnimation();
      this.initEventListeners();
      
      setTimeout(() => {
        if (this.hitLayer) {
          window.focus();
          document.body.focus();
          this.hitLayer.focus();
        }
      }, 100);

    }

    closeSelect(){
      console.log("closeSelect------");
      this.resetSelectionHighlight();
      this.state.start = false;
      this.state.paused = true;
      this.hideActionBar();
      this.removeEventListeners();
      this.stopTopMostObserver();
      if (this.hitLayer) {
        this.hitLayer.style.pointerEvents = "none";
      }
      requestAnimationFrame(() => {
        if (this.grayLayer) {
          this.grayLayer.style.transition = "opacity 0.3s ease-out";
          this.grayLayer.style.opacity = "0";
        }
        if (this.border) {
          this.border.style.transition = "opacity 0.3s ease-out";
          this.border.style.opacity = "0";
        }
      });
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
      }
      syncTaggleSelectStatus();
      this.closeTimer = setTimeout(() => {
        this.closeTimer = null;
        this.destroy();
      }, this.CONFIG.closeDuration);
    }

    destroy() {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.state.start = false;
      this.resetSelectionHighlight();
      this.hideActionBar();
      this.removeEventListeners();
      this.stopTopMostObserver();
      if (this.root) {
        this.root.remove();
      }
    }
  }
  const syncTaggleSelectStatus = () => {
    context.browser.runtime.sendMessage({
      origin: 'content',
      operate: 'closeCapture',
    });
  }
  const sendSelectorMessage = (data) => {
    context.browser.runtime.sendMessage({
      origin: 'content',
      operate: 'pageSelectResult',
      body: data
    });
  }

  if(window == window.top){
    context.browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // console.log("select.captrue onMessage : ", message);
      const {operate, origin, taggle} = message;
      if (operate === "handleSelect") {
        if (taggle) {
          if(!SelectCaptrue.getInstance().state.start){
            SelectCaptrue.getInstance().state.start = true;
            SelectCaptrue.getInstance().taggleSelect();
            
            console.log("select.captrue taggleSelect------");
          }
        } else {
          SelectCaptrue.getInstance().closeSelect();
        }
      }
      
    });
  }else{
    window.addEventListener("message", (event) => {
      // console.log("select.captrue onMessage : ", event);
      const {operate, origin, url} = event.data;
      // console.log("select.captrue onMessage----operate", operate);  
      if (operate === "handleSelectIframeDom") {
        if(url){
          context.browser.runtime.sendMessage({operate: "iframe/getInfo", origin: "content", url: url}, (response)=>{
            // console.log("select.captrue iframe/getInfo----response", response);
            if(response){
              const {success, iframeInfo} = response;
              if(success && iframeInfo){
                // SelectCaptrue.getInstance().state.currentEl = iframeInfo;
                SelectCaptrue.getInstance().taggleSelect();
                SelectCaptrue.getInstance().state.currentIframeId = iframeInfo.frameId;
              }else{
                // console.log("select.captrue iframe/getInfo----response=", response);
              }
            }
          });
         
        }
      }
      
    });
  }

  

})()