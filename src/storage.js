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
  return loadState(absolute);
}
