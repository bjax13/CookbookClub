import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultState } from "./state.js";
import { loadStateFromSqlite, saveStateToSqlite } from "./sqlite-storage.js";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FILE = resolve(ROOT_DIR, "data", "state.json");
const DEFAULT_SQLITE_FILE = resolve(ROOT_DIR, "data", "state.sqlite");

export function resolveDataFile(customPath, storage = "json") {
  if (customPath) return resolve(process.cwd(), customPath);
  return storage === "sqlite" ? DEFAULT_SQLITE_FILE : DEFAULT_FILE;
}

export function loadState(filePath, storage = "json") {
  if (storage === "sqlite") return loadStateFromSqlite(filePath);
  if (!existsSync(filePath)) {
    return createDefaultState();
  }

  const raw = readFileSync(filePath, "utf8").trim();
  if (!raw) return createDefaultState();

  const parsed = JSON.parse(raw);
  return { ...createDefaultState(), ...parsed };
}

export function saveState(filePath, state, storage = "json") {
  if (storage === "sqlite") {
    saveStateToSqlite(filePath, state);
    return;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function exportStateToFile(targetPath, state) {
  const absolute = resolve(process.cwd(), targetPath);
  saveState(absolute, state);
  return absolute;
}

export function importStateFromFile(sourcePath) {
  const absolute = resolve(process.cwd(), sourcePath);
  if (!existsSync(absolute)) {
    throw new Error(`Import file not found: ${absolute}`);
  }
  const verification = verifyStateSnapshotFile(sourcePath);
  if (!verification.ok) {
    throw new Error(`Invalid snapshot for import: ${verification.issues.join(" ")}`);
  }
  return loadState(absolute);
}

function validateSnapshotShape(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push("Top-level value must be an object.");
    return issues;
  }

  const requiredArrays = [
    "clubs",
    "users",
    "memberships",
    "meetups",
    "recipes",
    "favorites",
    "personalCollections",
    "collectionItems",
    "cookbookAccessGrants",
    "notifications"
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(value[key])) {
      issues.push(`Field \`${key}\` must be an array.`);
    }
  }

  if (!value.counters || typeof value.counters !== "object" || Array.isArray(value.counters)) {
    issues.push("Field `counters` must be an object.");
  } else {
    for (const [key, raw] of Object.entries(value.counters)) {
      if (!Number.isFinite(Number(raw)) || Number(raw) < 0) {
        issues.push(`Counter \`${key}\` must be a non-negative number.`);
      }
    }
  }

  return issues;
}

export function verifyStateSnapshotFile(sourcePath) {
  const absolute = resolve(process.cwd(), sourcePath);
  if (!existsSync(absolute)) {
    throw new Error(`Snapshot file not found: ${absolute}`);
  }

  const raw = readFileSync(absolute, "utf8").trim();
  if (!raw) {
    return {
      filePath: absolute,
      ok: false,
      issues: ["Snapshot file is empty."]
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      filePath: absolute,
      ok: false,
      issues: [`Invalid JSON: ${error.message}`]
    };
  }

  const issues = validateSnapshotShape(parsed);
  return {
    filePath: absolute,
    ok: issues.length === 0,
    issues,
    counts:
      issues.length === 0
        ? {
            clubs: parsed.clubs.length,
            users: parsed.users.length,
            meetups: parsed.meetups.length,
            recipes: parsed.recipes.length,
            notifications: parsed.notifications.length
          }
        : null
  };
}
