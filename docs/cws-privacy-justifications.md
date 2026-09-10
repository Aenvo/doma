# Chrome Web Store Privacy 文案（旧项备份，可直接复制）

来源：`ijodjmhhanndphgkcohmokgoogboghja` Privacy 页截图

## Single purpose description

```
DomA Agent is a browser-native AI assistant that turns user instructions into automated web actions. Its single purpose is to help users operate and complete tasks on websites through conversational commands in the side panel.
```

## Permission justifications

### sidePanel

```
DomA Agent is a browser AI assistant whose primary interface runs in the Chrome Side Panel. Users chat with the AI, view conversation history and configure settings from this panel while continuing to browse in the main window.
```

### activeTab

```
DomA needs temporary access to the page the user is actively viewing when they interact with the assistant—for example, to read page context.
```

### storage

```
DomA uses chrome.storage.local to persist data locally on the user's device, including: AI chat history and conversation metadata; user preferences and extension settings.
```

### alarms

```
DomA uses the alarms API to schedule periodic cleanup of an in-memory network response cache used by the extension's resource loader. Cached entries expire after a short TTL; the alarm fires to remove expired cache records and free memory. This avoids keeping stale data indefinitely and does not track user behavior or send data externally—it only maintains efficient local cache hygiene in the background service worker.
```

### tabs

```
DomA is an AI automation agent that operates on browser tabs as part of its core functionality. The tabs permission is used to: identify the active tab and bind it to an AI conversation; list, create, activate, reload, and close tabs when the user asks the AI to perform multi-step web tasks.
```

### tabGroups

```
DomA supports a “group session” mode where the AI assistant coordinates tasks across multiple related tabs in a Chrome Tab Group. We use tabGroups to create and read tab groups when the user starts a group session, display group name/color in the conversation picker, and keep AI context in sync when tabs are added, updated, or removed from a group. We also listen for group removal to clean up associated conversations. This permission is only used to support user-initiated multi-tab workflows, not to monitor unrelated browsing.
```

### unlimitedStorage

```
DomA stores substantial local data that can exceed the default storage.local quota, including AI chat history, conversation metadata, uploaded file attachments, spec/screenshot assets, custom user skills, userscript-related data, and download/sniffer state in IndexedDB. The unlimitedStorage permission prevents data loss when users have long conversation histories or large attachments.
```

### webNavigation

```
DomA uses webNavigation for features that require accurate page and frame lifecycle information. Specifically: (1) detecting when the user opens a new tab/window from a link (onCreatedNavigationTarget) to hand over AI conversation context; (2) tracking main-frame navigations to activate per-site ad-blocking rules; (3) mapping iframe structure (onBeforeNavigate, getAllFrames) so the AI can interact with embedded frames during automation. These APIs are used to improve page-aware automation and site-specific features initiated by the user, not to build a browsing history profile.
```

### userScripts

```
DomA includes a built-in userscript manager compatible with the Chrome User Scripts API. We use userScripts to register, update, and unregister user scripts that the user installs or enables; configure the userscript execution world; and execute scripts on demand for AI-driven automation tasks.
```

### downloads

```
DomA includes a built-in userscript manager, files requested via userscript GM_download APIs to the user’s local Downloads folder.
```

### cookies

```
DomA exposes cookie read/write/delete APIs for installed userscripts (GM_cookie compatibility) so community scripts that require session or site cookies can function correctly. Cookie access is routed through our background handler and scoped to URLs provided by the calling script’s page context. DomA itself does not collect or transmit cookies to external servers for advertising or tracking. This permission supports userscript functionality that the user explicitly installs and runs.
```

### bookmarks

```
DomA exposes a controlled browser_extension_api bridge so the AI agent can call whitelisted Chrome extension APIs when the user explicitly requests bookmark-related tasks (e.g., save a page, search bookmarks, or organize links as part of an automation workflow). The bookmarks permission is included in this allowlist so bookmark operations requested by the user through the side-panel assistant can be executed. DomA does not read or sync bookmarks in the background without user action. In the sidebar's input box, typing '@' brings up a menu. When you type 'open new tab' into this menu, it retrieves and matches your bookmarks based on your input.
```

### declarativeNetRequest

```
DomA uses declarativeNetRequest to install and update dynamic network rules at runtime. These rules help AI-assisted ad blocking—blocking rules generated or enabled by the user are applied as DNR rules per visited site.
```

### declarativeNetRequestWithHostAccess

```
Some DomA features require network rules that match requests on arbitrary website hosts (e.g., site-specific ad-blocking rules and conditional header changes for media parsing). The base declarativeNetRequest permission alone is insufficient for rules scoped to user-visited domains across the web. declarativeNetRequestWithHostAccess allows our extension to apply these user-initiated rules to matching host requests safely via the Declarative Net Request API, without programmatically reading page content from those requests.
```

### scripting

```
DomA is a browser AI automation agent. The scripting permission is essential to inject scripts into tabs so the AI can perform user-requested actions: click elements, fill forms, scroll, read page structure, capture screenshots, interact with iframes, and run one-off automation logic. Scripts are executed only on tabs linked to an active user conversation or when the user triggers a tool (e.g., page selection, download, or an explicit AI command). This is the core mechanism that lets natural-language instructions operate on web pages.
```

### clipboardRead

```
DomA provides a browser_get_clipboard tool so users can ask the AI to read text from the system clipboard as part of a workflow (e.g., paste copied data into a form, compare clipboard content with page data, or continue a multi-step task). Clipboard access occurs only when the user invokes this feature through the assistant or an automation command—not continuously or silently. The clipboardRead permission is required because programmatic clipboard reads in Manifest V3 need explicit user-granted capability beyond ordinary page access.
```

### clipboardWrite

```
DomA uses clipboardWrite so users can copy content to the system clipboard during normal workflows: copying AI assistant replies (toolbar “copy” actions), copying code/table blocks from markdown responses, and writing text via the browser_set_clipboard automation tool when the user asks the AI to paste results elsewhere. Clipboard writes occur only in response to explicit user actions or user-initiated AI commands. We do not write to the clipboard silently or without user intent.
```

### notifications

```
DomA includes notifications in a restricted allowlist exposed through our browser_extension_api bridge, so the AI agent can call the Chrome notifications API when the user explicitly requests notification-related automation (e.g., remind me when a task completes). DomA does not show background notifications for advertising or passive tracking. Any notification would be triggered by a user-directed action in the side-panel assistant or an automation the user initiated.
```

### history

```
The history permission is included in DomA’s controlled extension-API allowlist so the AI agent can perform browsing-history tasks only when the user explicitly asks—for example, finding recently visited pages or continuing a workflow tied to past visits. Access is routed through our background API bridge with path whitelisting, not used to collect or upload browsing history in the background. DomA does not build user profiles from history data. In the sidebar's input box, typing '@' brings up a menu. When you type 'open new tab' into this menu, it retrieves and matches your history based on your input.
```

### debugger

```
We request the "debugger" permission only as a fallback for hover actions. When ordinary DOM/synthetic mouse events cannot trigger CSS :hover behavior (e.g., navigation dropdown menus), we temporarily attach the Chrome DevTools Protocol to the user's current tab, send Input.dispatchMouseEvent (type: mouseMoved) to move the pointer over the target element, and then immediately detach.

Scope and limits:
- Used only during user-initiated agent actions on the active tab; never attached in the background.
- Only Input.dispatchMouseEvent is used. We do not read page content, network traffic, cookies, local storage, or any other sensitive data via the debugger API.
- Synthetic hover is attempted first; debugger is used only if hover verification fails and the element is in the main frame.
```

## Host permission justification

```
DomA is a browser AI agent that must operate on the websites users choose to automate. Host access (<all_urls>) is required because users can ask the assistant to work on any site they visit—clicking, filling forms, reading page content, selecting elements, detecting media, applying site-specific ad rules, running installed userscripts. DomA does not collect page content in bulk without user interaction; access supports on-demand automation tied to the user's active conversation or explicit actions in the side panel.
```

## Are you using remote code?

选：**No, I am not using remote code**（下方 justification 留空）
