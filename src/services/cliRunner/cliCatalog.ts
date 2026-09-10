import { Storage } from "@/store/Storage";

/** User-registered CLIs for DomA to discover (name + description). */
export const CLI_CATALOG_STORAGE_KEY = "doma_cli_catalog_entries";

export type UserCliEntry = {
  id: string;
  /** Executable / command name to search & invoke, e.g. obsidian */
  name: string;
  description: string;
  createdAt: number;
};

export type CliCatalogCommand = {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "user";
  runnerRequired: boolean;
  args?: Record<string, string>;
  examples?: string[];
};

const BUILTIN: CliCatalogCommand[] = [
  {
    id: "reveal",
    name: "reveal",
    description:
      "Reveal a local absolute path in Finder / Explorer via CLI Runner.",
    source: "builtin",
    runnerRequired: true,
    args: { path: "absolute filesystem path" },
    examples: ['browser_cli_run({ commandId: "reveal", path: "/Users/me/file.pdf" })'],
  },
];

function newId(): string {
  return `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadUserCliEntries(): Promise<UserCliEntry[]> {
  try {
    const raw = await Storage.init().get(CLI_CATALOG_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is UserCliEntry => !!e && typeof e === "object")
      .map((e) => ({
        id: String(e.id || newId()),
        name: String(e.name || "").trim(),
        description: String(e.description || "").trim(),
        createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now(),
      }))
      .filter((e) => e.name);
  } catch {
    return [];
  }
}

async function saveUserCliEntries(entries: UserCliEntry[]): Promise<void> {
  await Storage.init().set(CLI_CATALOG_STORAGE_KEY, entries);
}

export async function addUserCliEntry(input: {
  name: string;
  description: string;
}): Promise<UserCliEntry> {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) throw new Error("name_required");
  const list = await loadUserCliEntries();
  if (list.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("name_exists");
  }
  const entry: UserCliEntry = {
    id: newId(),
    name,
    description,
    createdAt: Date.now(),
  };
  list.push(entry);
  await saveUserCliEntries(list);
  return entry;
}

export async function removeUserCliEntry(id: string): Promise<void> {
  const list = await loadUserCliEntries();
  await saveUserCliEntries(list.filter((e) => e.id !== id));
}

/** Full catalog for UI + browser_cli_list (builtin + user). */
export async function listCliCatalogCommands(): Promise<CliCatalogCommand[]> {
  const user = await loadUserCliEntries();
  const userCmds: CliCatalogCommand[] = user.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description || `User-registered CLI: ${e.name}`,
    source: "user" as const,
    runnerRequired: true,
    args: {
      args: "optional string — arguments passed after the command name",
    },
    examples: [
      `browser_cli_run({ commandId: "${e.id}", args: "--help" })`,
    ],
  }));
  return [...BUILTIN, ...userCmds];
}

export async function getCliCatalogCommand(
  commandId: string,
): Promise<CliCatalogCommand | null> {
  const id = commandId.trim();
  const all = await listCliCatalogCommands();
  return all.find((c) => c.id === id || c.name === id) ?? null;
}
