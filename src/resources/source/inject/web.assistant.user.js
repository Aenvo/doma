(function(){
    console.log("web.assistant.user.js");
    const context = {
        browser: chrome || browser || window.browser || window.chrome
    };

    /**
     * @param {unknown} selectorsPayload `{ rootSelector, childSelectors }` 或旧版 `{ selector }[]`
     * @returns {Element[]}
     */
    function collectElementsFromSelectorsPayload(selectorsPayload) {
        const strings = [];
        if (selectorsPayload && typeof selectorsPayload === "object" && !Array.isArray(selectorsPayload)) {
            var o = selectorsPayload;
            if (typeof o.rootSelector === "string" && o.rootSelector.trim()) {
                strings.push(o.rootSelector.trim());
            }
            if (Array.isArray(o.childSelectors)) {
                for (var i = 0; i < o.childSelectors.length; i++) {
                    var s = o.childSelectors[i];
                    if (typeof s === "string" && s.trim()) strings.push(s.trim());
                }
            }
        } else if (Array.isArray(selectorsPayload)) {
            for (var j = 0; j < selectorsPayload.length; j++) {
                var row = selectorsPayload[j];
                if (row && typeof row === "object" && typeof row.selector === "string" && row.selector.trim()) {
                    strings.push(row.selector.trim());
                }
            }
        }
        if (!strings.length) return [];
        const seen = new Set();
        const list = [];
        for (var k = 0; k < strings.length; k++) {
            try {
                var el = document.querySelector(strings[k]);
                if (el && el.nodeType === Node.ELEMENT_NODE && !seen.has(el)) {
                    seen.add(el);
                    list.push(el);
                }
            } catch (err) {
                /* 非法 selector */
            }
        }
        return list;
    }

    var ASSIST_FIND_STYLE_ID = "assist-find-flash-style";
    var ASSIST_FIND_CLASS = "assist-find-flash";

    /** Safari 风格：每周期「淡入 → 一次亮峰 → 淡出」，iteration-count=2 即肉眼 2 次脉冲（周期内不再多峰，避免像播了 4 次） */
    function ensureFindFlashStyle() {
        if (document.getElementById(ASSIST_FIND_STYLE_ID)) return;
        var style = document.createElement("style");
        style.id = ASSIST_FIND_STYLE_ID;
        style.textContent =
            "." +
            ASSIST_FIND_CLASS +
            "{" +
            "position:relative;" +
            "z-index:2147483646!important;" +
            "border-radius:6px;" +
            "animation:assistFindSafari 1s ease-in-out 2;" +
            "will-change:background-color,box-shadow;" +
            "}" +
            "@keyframes assistFindSafari{" +
            "0%,100%{background-color:transparent;box-shadow:none;}" +
            "48%{background-color:rgba(255,236,140,0.9);box-shadow:0 0 0 1px rgba(255,200,60,0.28),0 3px 20px rgba(255,205,80,0.26);}" +
            "}";
        (document.head || document.documentElement).appendChild(style);
    }

    function flashHighlightElements(elements) {
        if (!elements || !elements.length) return;
        ensureFindFlashStyle();
        var oneCycleMs = 1200;
        var iterations = 2;
        var cleanupMs = oneCycleMs * iterations + 100;
        for (var i = 0; i < elements.length; i++) {
            (function (el) {
                el.classList.add(ASSIST_FIND_CLASS);
                window.setTimeout(function () {
                    el.classList.remove(ASSIST_FIND_CLASS);
                }, cleanupMs);
            })(elements[i]);
        }
    }

    // 侧栏 → 当前页：selectionAnchor 居中滚动 + selectors 定位元素并两次闪烁（仅顶层 frame）
    context.browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (!message) return;
        if (message.origin === "sidepanel" && message.operate === "scrollToSelectionAnchor") {
            if (window !== window.top) {
                sendResponse && sendResponse({ success: false, reason: "not_top_frame" });
                return;
            }
            const a = message.selectionAnchor;
            const hasAnchor =
                a &&
                typeof a.centerDocumentY === "number" &&
                typeof a.centerDocumentX === "number";
            const selectorsPayload = message.selectors;
            var hasSelectors = false;
            if (Array.isArray(selectorsPayload) && selectorsPayload.length > 0) {
                hasSelectors = true;
            } else if (selectorsPayload && typeof selectorsPayload === "object") {
                hasSelectors =
                    (typeof selectorsPayload.rootSelector === "string" &&
                        selectorsPayload.rootSelector.trim()) ||
                    (Array.isArray(selectorsPayload.childSelectors) &&
                        selectorsPayload.childSelectors.some(function (x) {
                            return typeof x === "string" && x.trim();
                        }));
            }
            if (!hasAnchor && !hasSelectors) {
                sendResponse && sendResponse({ success: false, reason: "no_anchor_no_selectors" });
                return;
            }

            function runFlash() {
                const els = collectElementsFromSelectorsPayload(selectorsPayload);
                flashHighlightElements(els);
            }

            if (hasAnchor) {
                const vh = window.innerHeight || 0;
                const vw = window.innerWidth || 0;
                const docEl = document.documentElement || document.body;
                const scrollH = docEl ? docEl.scrollHeight : 0;
                const scrollW = docEl ? docEl.scrollWidth : 0;
                const rawTop = a.centerDocumentY - vh / 2;
                const rawLeft = a.centerDocumentX - vw / 2;
                const targetTop = Math.min(Math.max(0, rawTop), Math.max(0, scrollH - vh));
                const targetLeft = Math.min(Math.max(0, rawLeft), Math.max(0, scrollW - vw));
                window.scrollTo({
                    top: targetTop,
                    left: targetLeft,
                    behavior: "smooth",
                });
                window.setTimeout(runFlash, 420);
            } else {
                runFlash();
            }

            sendResponse && sendResponse({ success: true });
        }
    });

    /**
     * 单个 Range：对所有非空 client rect 取中心点再平均（多行选区会得到行间大致中心）。
     * @param {Range} range
     * @returns {{ x: number, y: number } | null} 视口 CSS 像素中心
     */
    function averageViewportCenterForRange(range) {
        const rects = range.getClientRects();
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (r.width <= 0 && r.height <= 0) continue;
            sx += r.left + r.width / 2;
            sy += r.top + r.height / 2;
            n++;
        }
        if (n === 0) {
            const r = range.getBoundingClientRect();
            if (r.width > 0 || r.height > 0) {
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            return null;
        }
        return { x: sx / n, y: sy / n };
    }

    /**
     * 多 Range（少见）：对各 Range 的平均中心再取平均。
     * @param {Selection} selection
     * @returns {{ x: number, y: number } | null}
     */
    function averageViewportCenterForSelection(selection) {
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let i = 0; i < selection.rangeCount; i++) {
            const c = averageViewportCenterForRange(selection.getRangeAt(i));
            if (c) {
                sx += c.x;
                sy += c.y;
                n++;
            }
        }
        if (n === 0) return null;
        return { x: sx / n, y: sy / n };
    }

    /**
     * 复制时刻选区几何锚点，供侧栏回传 tab 做 scrollIntoView / scrollTo。
     * centerDocument* 为相对 document 的坐标（已加 scrollX/Y）。
     */
    function buildSelectionAnchor(selection) {
        const vp = averageViewportCenterForSelection(selection);
        if (!vp) return undefined;
        const scx = window.scrollX;
        const scy = window.scrollY;
        return {
            centerViewportX: Math.round(vp.x),
            centerViewportY: Math.round(vp.y),
            centerDocumentX: Math.round(vp.x + scx),
            centerDocumentY: Math.round(vp.y + scy),
            scrollX: Math.round(scx),
            scrollY: Math.round(scy),
        };
    }

    /** 仅用于「当前文档」中的节点；cloneContents 里的节点没有真实祖先链，不能用来算路径。 */
    function getCssSelector(el) {
        if (!(el instanceof Element)) return '';
        const path = [];
        let cur = el;
        while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement) {
            let selector = cur.tagName.toLowerCase();
            if (cur.id) {
                selector += '#' + cur.id;
                path.unshift(selector);
                break;
            }
            if (cur.className) {
                const classNames = [...cur.classList].filter(Boolean);
                if (classNames.length) {
                    selector += '.' + classNames.join('.');
                }
            }
            let sibling = cur;
            let idx = 1;
            while (sibling.previousElementSibling) {
                sibling = sibling.previousElementSibling;
                if (sibling.tagName === cur.tagName) idx++;
            }
            if (idx > 1) selector += `:nth-of-type(${idx})`;
            path.unshift(selector);
            cur = cur.parentElement;
        }
        return path.join(' > ');
    }

    // 监听复制事件
    let __assistantLastCopySig = "";
    let __assistantLastCopyAt = 0;
    document.addEventListener('copy', function (e) {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0 && selection.rangeCount > 0) {
            // 轻量去重：部分网站会在同一帧内触发多次 copy
            const now = Date.now();
            const textTrimmed = selection.toString().trim();
            const sig = `${textTrimmed}@@${window.location.href}`;
            if (sig === __assistantLastCopySig && now - __assistantLastCopyAt < 800) return;
            __assistantLastCopySig = sig;
            __assistantLastCopyAt = now;

            const range = selection.getRangeAt(0);
            const caret = range.commonAncestorContainer;
            const ancestorEl =
                caret.nodeType === Node.ELEMENT_NODE ? caret : caret.parentElement;
            const rootSelector =
                ancestorEl instanceof Element ? getCssSelector(ancestorEl) : "";

            const childSelectors = [];
            // 递归收集选区范围内所有叶子节点的 CSS Selector
            function collectLeafSelectors(el, range, selectorsArr) {
                if (!(el instanceof Element)) return;
                // 如果el没有子元素，则为叶子节点（排除空的text node）
                if (!el.children || el.children.length === 0) {
                    try {
                        if (typeof range.intersectsNode === "function" && range.intersectsNode(el)) {
                            selectorsArr.push(getCssSelector(el));
                        }
                    } catch (e) {
                        /* intersectsNode 部分节点可能抛错 */
                    }
                } else {
                    for (let i = 0; i < el.children.length; i++) {
                        collectLeafSelectors(el.children[i], range, selectorsArr);
                    }
                }
            }
            if (ancestorEl instanceof Element && typeof range.intersectsNode === "function") {
                collectLeafSelectors(ancestorEl, range, childSelectors);
            }

            const selectors = {
                rootSelector: rootSelector,
                childSelectors: childSelectors,
            };

            console.log('[Assistant] 用户复制了内容:', selection.toString());
            console.log("[Assistant] 选区 rootSelector:", rootSelector);
            console.log("[Assistant] 选区 childSelectors:", childSelectors);
            const selectionAnchor = buildSelectionAnchor(selection);
            if (selectionAnchor) {
                console.log('[Assistant] 选区平均位置(锚点):', selectionAnchor);
            }
            // 将这些信息发送到sidepanel
            try {
                // 获取当前页面的host和favicon
                const host = window.location.host;
                let favicon = "";
                const faviconEl = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
                if (faviconEl) {
                    favicon = faviconEl.href;
                } else {
                    // fallback: 常规拼装 favicon url（有些网站未设置icon标签）
                    favicon = `${window.location.origin}/favicon.ico`;
                }
     
                context.browser.runtime.sendMessage({
                    origin: "content",
                    operate: "assistant/copySelection",
                    text: selection.toString(),
                    host: host,
                    favicon: favicon,
                    selectors,
                    selectionAnchor,
                    frameUrl: window.location.href,
                    isTopFrame: window === window.top,
                });
            } catch (e) {
                console.warn("[Assistant] 发送到sidepanel时出现错误:", e);
            }
        }
    });
})();