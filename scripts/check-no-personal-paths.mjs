import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowedUserSegments = new Set([
  "<user>",
  "<username>",
  "example",
  "me",
  "user",
  "username",
  "you",
  "your-name",
  "你",
]);

const separator = String.raw`(?:\\{1,4}|/)`;
const checks = [
  {
    label: "Windows user directory",
    pattern: new RegExp(String.raw`\b[A-Za-z]:${separator}Users${separator}([^\\/"'\s]+)${separator}`, "g"),
  },
  {
    label: "Unix user directory",
    pattern: /\/(?:Users|home)\/([^/"'\s]+)\//g,
  },
];

const trackedFiles = execFileSync("git", ["ls-files", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const violations = [];

for (const file of trackedFiles) {
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const { label, pattern } of checks) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (allowedUserSegments.has(match[1].toLowerCase())) continue;
      const line = text.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line}: ${label} contains non-placeholder user segment "${match[1]}"`);
    }
  }
}

if (violations.length > 0) {
  console.error("Personal absolute paths found in tracked files:\n");
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(`Personal-path check passed (${trackedFiles.length} tracked files scanned).`);
