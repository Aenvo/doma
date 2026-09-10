/** 生成扩展包保存前校验：拦截「有 popup 但 background 收不到消息」等常见死包 */

export type ExtensionPackageIssue = {
  code: string;
  message: string;
};

function findPath(paths: Iterable<string>, re: RegExp): string | undefined {
  for (const p of paths) {
    if (re.test(p)) return p;
  }
  return undefined;
}

function read(byPath: Map<string, string>, path: string | undefined): string {
  if (!path) return "";
  return byPath.get(path) ?? "";
}

/**
 * 返回非空 issues 时，browser_save_extension_files 应 ok:false，
 * 让模型按 message 修正后重调（不要静默存死包）。
 */
export function validateExtensionPackage(byPath: Map<string, string>): ExtensionPackageIssue[] {
  const issues: ExtensionPackageIssue[] = [];
  const paths = [...byPath.keys()];

  const manifestPath = findPath(paths, /(^|\/)manifest\.json$/i);
  if (!manifestPath) {
    issues.push({ code: "missing_manifest", message: "缺少 manifest.json" });
    return issues;
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(byPath.get(manifestPath)!) as Record<string, unknown>;
  } catch {
    issues.push({ code: "bad_manifest", message: "manifest.json 不是合法 JSON" });
    return issues;
  }

  if (manifest.manifest_version !== 3) {
    issues.push({
      code: "mv3_required",
      message: 'manifest_version 必须为 3',
    });
  }

  const bgPath = findPath(paths, /(^|\/)background\.js$/i);
  const popupJsPath = findPath(paths, /(^|\/)popup\.js$/i);
  const popupHtmlPath = findPath(paths, /(^|\/)popup\.html$/i);
  const bgCode = read(byPath, bgPath);
  const popupJs = read(byPath, popupJsPath);

  const action =
    manifest.action && typeof manifest.action === "object" && !Array.isArray(manifest.action)
      ? (manifest.action as Record<string, unknown>)
      : {};
  const hasDefaultPopup =
    typeof action.default_popup === "string" && action.default_popup.trim().length > 0;
  const hasPopupFiles = !!(popupJsPath || popupHtmlPath || hasDefaultPopup);

  const sw =
    manifest.background &&
    typeof manifest.background === "object" &&
    !Array.isArray(manifest.background)
      ? String((manifest.background as { service_worker?: unknown }).service_worker ?? "").trim()
      : "";

  if (bgPath && !sw) {
    issues.push({
      code: "missing_service_worker",
      message:
        '有 background.js 时 manifest 必须包含 "background": { "service_worker": "background.js" }',
    });
  }

  if (hasPopupFiles) {
    if (!bgPath) {
      issues.push({
        code: "popup_needs_background",
        message: "有 popup 时必须提供 background.js，并用 onMessage 处理 popup 的 sendMessage",
      });
    } else {
      if (!/onMessage\s*\.?\s*addListener|runtime\.onMessage/.test(bgCode)) {
        issues.push({
          code: "background_missing_onmessage",
          message:
            "有 popup 时 background.js 必须 chrome.runtime.onMessage.addListener；有 default_popup 时 action.onClicked 不会触发。异步处理须 return true 并用 sendResponse 回传 { ok, ... }",
        });
      }
      if (popupJs && /sendMessage\s*\(/.test(popupJs) === false) {
        // popup 可能只改 DOM；若有按钮跑任务通常要 sendMessage——弱提示不阻断
      }
      if (/\bwindow\./.test(bgCode) && /window\.\w+\s*=/.test(bgCode)) {
        issues.push({
          code: "sw_no_window",
          message: "MV3 service worker 没有 window；禁止用 window.xxx 暴露函数给 popup，改用 onMessage",
        });
      }
    }

    if (hasDefaultPopup && bgPath && /action\.onClicked/.test(bgCode) && !/onMessage/.test(bgCode)) {
      issues.push({
        code: "onclick_with_popup",
        message:
          "manifest 已设 default_popup 时 chrome.action.onClicked 不会触发；请改为 popup sendMessage + background onMessage",
      });
    }
  }

  // 纯 background、无 popup：至少要有某种触发（onClicked 或 commands 或 alarms）——弱校验
  if (bgPath && !hasPopupFiles) {
    if (!/action\.onClicked|onMessage|commands|alarms/.test(bgCode)) {
      issues.push({
        code: "no_trigger",
        message:
          "无 popup 时 background.js 需提供触发入口（如 chrome.action.onClicked，且 manifest 不要设 default_popup）",
      });
    }
  }

  return issues;
}
