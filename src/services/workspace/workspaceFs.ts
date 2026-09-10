/** DomA workspace: persist user-authorized directory via File System Access API */

import { getContext } from "@/services/Context";

const DB_NAME = "doma-workspace-fs";
const DB_VERSION = 1;
const STORE = "handles";
const ROOT_KEY = "root";
/** Absolute filesystem path of the workspace root (for Reveal in Finder via CLI Runner). */
const ROOT_PATH_KEY = "rootPath";

export type WorkspaceEntry = {
  name: string;
  kind: "file" | "directory";
  handle: FileSystemHandle;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
  });
}

export async function loadWorkspaceRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const handle = await idbRequest(store.get(ROOT_KEY));
    db.close();
    return (handle as FileSystemDirectoryHandle) || null;
  } catch (e) {
    console.warn("[workspaceFs] load root failed:", e);
    return null;
  }
}

export async function saveWorkspaceRoot(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await idbRequest(store.put(handle, ROOT_KEY));
  db.close();
}

export async function clearWorkspaceRoot(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await idbRequest(store.delete(ROOT_KEY));
  await idbRequest(store.delete(ROOT_PATH_KEY));
  db.close();
}

export async function loadWorkspaceRootPath(): Promise<string | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const value = await idbRequest(store.get(ROOT_PATH_KEY));
    db.close();
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch (e) {
    console.warn("[workspaceFs] load rootPath failed:", e);
    return null;
  }
}

export async function saveWorkspaceRootPath(absolutePath: string): Promise<void> {
  const trimmed = absolutePath.trim();
  if (!trimmed) {
    throw new Error("empty path");
  }
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await idbRequest(store.put(trimmed, ROOT_PATH_KEY));
  db.close();
}

export async function clearWorkspaceRootPath(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  await idbRequest(store.delete(ROOT_PATH_KEY));
  db.close();
}

type FsPermissionMode = { mode?: "read" | "readwrite" };

type PermissionCapableHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: FsPermissionMode) => Promise<PermissionState>;
  requestPermission?: (descriptor?: FsPermissionMode) => Promise<PermissionState>;
};

export async function queryWorkspacePermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  const h = handle as PermissionCapableHandle;
  if (typeof h.queryPermission !== "function") return "prompt";
  return h.queryPermission({ mode: "readwrite" });
}

export async function ensureWorkspacePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const current = await queryWorkspacePermission(handle);
  if (current === "granted") return true;
  const h = handle as PermissionCapableHandle;
  if (typeof h.requestPermission !== "function") return false;
  const next = await h.requestPermission({ mode: "readwrite" });
  return next === "granted";
}

export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof showDirectoryPicker !== "function") {
    console.warn("[workspaceFs] showDirectoryPicker not available");
    return null;
  }
  try {
    const handle = await showDirectoryPicker({
      id: "doma-workspace",
      mode: "readwrite",
      startIn: "documents",
    });
    await saveWorkspaceRoot(handle);
    return handle;
  } catch (e: any) {
    // user cancelled
    if (e?.name === "AbortError") return null;
    console.warn("[workspaceFs] pick failed:", e);
    return null;
  }
}

/** Ensure a writable root exists (pick if needed). Must run under user gesture when picking. */
export async function ensureWorkspaceRoot(): Promise<FileSystemDirectoryHandle | null> {
  const existing = await loadWorkspaceRoot();
  if (existing && (await ensureWorkspacePermission(existing))) {
    return existing;
  }
  return pickWorkspaceDirectory();
}

export async function listWorkspaceEntries(
  dir: FileSystemDirectoryHandle,
): Promise<WorkspaceEntry[]> {
  const items: WorkspaceEntry[] = [];
  const iterable = dir as FileSystemDirectoryHandle & {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  for await (const [name, handle] of iterable.entries()) {
    items.push({
      name,
      kind: handle.kind === "directory" ? "directory" : "file",
      handle,
    });
  }
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return items;
}

export async function createWorkspaceDirectory(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("empty folder name");
  }
  return parent.getDirectoryHandle(trimmed, { create: true });
}

/** Resolve relative dir + fileName. path defaults to workspace root. */
export function resolveWorkspaceWriteTarget(
  path?: string,
  fileName?: string,
): { dirParts: string[]; fileName: string; relativePath: string } {
  const rawPath = (path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const rawName = (fileName || "").trim();

  let dirParts: string[] = [];
  let name = "";

  if (rawName) {
    name = rawName.replace(/[/\\]/g, "_").trim();
    dirParts = rawPath ? rawPath.split("/").filter(Boolean) : [];
  } else if (rawPath) {
    const parts = rawPath.split("/").filter(Boolean);
    name = parts.pop() || "";
    dirParts = parts;
  }

  if (!name) {
    throw new Error("fileName required (or path including file name)");
  }
  // block traversal
  if (dirParts.some((p) => p === ".." || p === ".") || name === ".." || name === ".") {
    throw new Error("invalid path");
  }

  const relativePath = [...dirParts, name].join("/");
  return { dirParts, fileName: name, relativePath };
}

async function ensureDirPath(
  root: FileSystemDirectoryHandle,
  dirParts: string[],
): Promise<FileSystemDirectoryHandle> {
  let cur = root;
  for (const part of dirParts) {
    cur = await cur.getDirectoryHandle(part, { create: true });
  }
  return cur;
}

/**
 * Write bytes under the authorized workspace root.
 * path = relative directory (default root). fileName = file name.
 * Or pass path as "subdir/a.txt" and omit fileName.
 * data: string (UTF-8 text) | Blob | Uint8Array | ArrayBuffer
 */
export async function writeWorkspaceFile(options: {
  path?: string;
  fileName?: string;
  data: string | Blob | Uint8Array | ArrayBuffer;
}): Promise<{ relativePath: string; bytes: number }> {
  const root = await loadWorkspaceRoot();
  if (!root) {
    throw new Error("workspace_not_authorized");
  }
  const ok = await ensureWorkspacePermission(root);
  if (!ok) {
    throw new Error("workspace_permission_denied");
  }

  const target = resolveWorkspaceWriteTarget(options.path, options.fileName);
  const dir = await ensureDirPath(root, target.dirParts);
  const handle = await dir.getFileHandle(target.fileName, { create: true });
  const writable = await handle.createWritable();

  let bytes = 0;
  try {
    const data = options.data;
    if (typeof data === "string") {
      await writable.write(data);
      bytes =
        typeof TextEncoder !== "undefined"
          ? new TextEncoder().encode(data).byteLength
          : data.length;
    } else if (data instanceof Blob) {
      await writable.write(data);
      bytes = data.size;
    } else if (data instanceof ArrayBuffer) {
      await writable.write(data);
      bytes = data.byteLength;
    } else {
      await writable.write(data);
      bytes = data.byteLength;
    }
  } finally {
    await writable.close();
  }

  return { relativePath: target.relativePath, bytes };
}

/** @deprecated use writeWorkspaceFile */
export async function writeWorkspaceTextFile(options: {
  path?: string;
  fileName?: string;
  content: string;
}): Promise<{ relativePath: string; bytes: number }> {
  return writeWorkspaceFile({
    path: options.path,
    fileName: options.fileName,
    data: options.content ?? "",
  });
}

export async function removeWorkspaceEntry(
  parent: FileSystemDirectoryHandle,
  name: string,
  kind: "file" | "directory",
): Promise<void> {
  await parent.removeEntry(name, { recursive: kind === "directory" });
}

type MovableHandle = FileSystemHandle & {
  move?: {
    (name: string): Promise<void>;
    (dir: FileSystemDirectoryHandle, name?: string): Promise<void>;
  };
};

async function uniqueName(
  dest: FileSystemDirectoryHandle,
  baseName: string,
): Promise<string> {
  const existing = new Set((await listWorkspaceEntries(dest)).map((e) => e.name));
  if (!existing.has(baseName)) return baseName;
  const dot = baseName.lastIndexOf(".");
  const hasExt = dot > 0;
  const stem = hasExt ? baseName.slice(0, dot) : baseName;
  const ext = hasExt ? baseName.slice(dot) : "";
  let i = 2;
  while (existing.has(`${stem} ${i}${ext}`)) i += 1;
  return `${stem} ${i}${ext}`;
}

async function writeFileFromHandle(
  dest: FileSystemDirectoryHandle,
  name: string,
  source: FileSystemFileHandle,
): Promise<void> {
  const file = await source.getFile();
  const out = await dest.getFileHandle(name, { create: true });
  const writable = await out.createWritable();
  await writable.write(file);
  await writable.close();
}

async function copyDirectoryRecursive(
  source: FileSystemDirectoryHandle,
  destParent: FileSystemDirectoryHandle,
  destName: string,
): Promise<void> {
  const dest = await destParent.getDirectoryHandle(destName, { create: true });
  const children = await listWorkspaceEntries(source);
  for (const child of children) {
    if (child.kind === "directory") {
      await copyDirectoryRecursive(
        child.handle as FileSystemDirectoryHandle,
        dest,
        child.name,
      );
    } else {
      await writeFileFromHandle(dest, child.name, child.handle as FileSystemFileHandle);
    }
  }
}

/** Rename within the same parent directory. */
export async function renameWorkspaceEntry(
  parent: FileSystemDirectoryHandle,
  entry: WorkspaceEntry,
  newName: string,
): Promise<string> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("empty name");
  if (trimmed === entry.name) return entry.name;

  const h = entry.handle as MovableHandle;
  if (typeof h.move === "function") {
    try {
      await h.move(trimmed);
      return trimmed;
    } catch {
      /* fallback */
    }
  }

  if (entry.kind === "directory") {
    await copyDirectoryRecursive(entry.handle as FileSystemDirectoryHandle, parent, trimmed);
  } else {
    await writeFileFromHandle(parent, trimmed, entry.handle as FileSystemFileHandle);
  }
  await parent.removeEntry(entry.name, { recursive: entry.kind === "directory" });
  return trimmed;
}

/** Write a Blob/File into destDir (auto-suffix on name conflict). */
export async function writeBlobIntoDirectory(
  dest: FileSystemDirectoryHandle,
  data: Blob,
  preferredName: string,
): Promise<string> {
  const safe = preferredName.replace(/[/\\]/g, "_").trim() || "untitled";
  const name = await uniqueName(dest, safe);
  const handle = await dest.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
  return name;
}

/** Copy entry into destDir (optionally with a new name; auto-suffix on conflict). */
export async function copyWorkspaceEntry(
  entry: WorkspaceEntry,
  destDir: FileSystemDirectoryHandle,
  preferredName?: string,
): Promise<string> {
  const targetName = await uniqueName(destDir, preferredName?.trim() || entry.name);
  if (entry.kind === "directory") {
    await copyDirectoryRecursive(
      entry.handle as FileSystemDirectoryHandle,
      destDir,
      targetName,
    );
  } else {
    await writeFileFromHandle(destDir, targetName, entry.handle as FileSystemFileHandle);
  }
  return targetName;
}

/** Move entry into destDir (cut+paste). Falls back to copy+delete. */
export async function moveWorkspaceEntry(
  sourceDir: FileSystemDirectoryHandle,
  entry: WorkspaceEntry,
  destDir: FileSystemDirectoryHandle,
  preferredName?: string,
): Promise<string> {
  const desired = preferredName?.trim() || entry.name;

  // Same directory: rename if needed, else no-op
  if (sourceDir === destDir) {
    if (desired === entry.name) return entry.name;
    return renameWorkspaceEntry(sourceDir, entry, desired);
  }

  const targetName = await uniqueName(destDir, desired);
  const h = entry.handle as MovableHandle;
  if (typeof h.move === "function") {
    try {
      await h.move(destDir, targetName);
      return targetName;
    } catch {
      /* fallback */
    }
  }

  await copyWorkspaceEntry(entry, destDir, targetName);
  await sourceDir.removeEntry(entry.name, { recursive: entry.kind === "directory" });
  return targetName;
}

export function workspacePageUrl(): string {
  const browser = getContext().browser;
  try {
    return browser.runtime.getURL("workspace/index.html");
  } catch {
    return "/workspace/index.html";
  }
}

/** 从侧栏点击打开；优先同步 window.open，避免 await 丢用户手势导致“没反应”。 */
export function openWorkspaceTab(): void {
  const browser = getContext().browser;
  const url = workspacePageUrl();

  try {
    const opened = window.open(url, "doma-workspace");
    if (opened) {
      try {
        opened.focus();
      } catch {
        /* ignore */
      }
      return;
    }
  } catch (e) {
    console.warn("[workspace] window.open failed:", e);
  }

  try {
    const create = browser.tabs.create({ url, active: true });
    if (create && typeof create.then === "function") {
      void create.catch((err: unknown) => {
        console.warn("[workspace] tabs.create failed:", err);
      });
    }
  } catch (e) {
    console.warn("[workspace] tabs.create threw:", e);
  }
}

