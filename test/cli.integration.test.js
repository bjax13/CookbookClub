import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI = resolve(ROOT_DIR, "src", "cli.js");

function runCli(args, cwd = ROOT_DIR) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8"
  });
  return result;
}

function parseJsonStdout(result) {
  if (!result.stdout?.trim()) return null;
  return JSON.parse(result.stdout);
}

test("CLI version reports package version", () => {
  const result = runCli(["version"]);
  assert.equal(result.status, 0);
  const output = parseJsonStdout(result);
  const packageVersion = JSON.parse(readFileSync(resolve(ROOT_DIR, "package.json"), "utf8")).version;
  assert.equal(output.version, packageVersion);
});

test("CLI end-to-end happy path", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");
  const img = join(dir, "dish.jpg");
  writeFileSync(img, "image");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);
  const init = parseJsonStdout(result);
  assert.equal(init.host.id, "user_1");

  result = runCli(["--data", dataFile, "user", "add", "--name", "Bob"]);
  assert.equal(result.status, 0);
  const bob = parseJsonStdout(result);
  assert.equal(bob.id, "user_2");

  result = runCli(["--data", dataFile, "member", "invite", "--actor", "user_1", "--user", "user_2"]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataFile,
    "meetup",
    "schedule",
    "--actor",
    "user_1",
    "--at",
    "2026-04-03T18:30:00.000Z"
  ]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataFile,
    "recipe",
    "add",
    "--actor",
    "user_2",
    "--title",
    "Soup",
    "--content",
    "Mix and simmer",
    "--image",
    img
  ]);
  assert.equal(result.status, 0);
  const recipe = parseJsonStdout(result);
  assert.equal(recipe.id, "recipe_1");

  result = runCli(["--data", dataFile, "recipe", "list", "--actor", "user_1"]);
  assert.equal(result.status, 0);
  const recipes = parseJsonStdout(result);
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].title, "Soup");
});

test("CLI enforces closed policy member invite restriction", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataFile, "user", "add", "--name", "Bob"]);
  assert.equal(result.status, 0);
  result = runCli(["--data", dataFile, "user", "add", "--name", "Carol"]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataFile, "member", "invite", "--actor", "user_1", "--user", "user_2"]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataFile, "member", "invite", "--actor", "user_2", "--user", "user_3"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Only host\/admin\/co_admin/);
});

test("CLI notify list previews due reminders without delivering", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);
  result = runCli([
    "--data",
    dataFile,
    "meetup",
    "schedule",
    "--actor",
    "user_1",
    "--at",
    "2026-04-10T18:30:00.000Z"
  ]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataFile, "notify", "list", "--now", "2026-04-09T19:00:00.000Z"]);
  assert.equal(result.status, 0);
  const preview = parseJsonStdout(result);
  assert.ok(preview.length >= 1);

  result = runCli(["--data", dataFile, "notify", "run", "--now", "2026-04-09T19:00:00.000Z"]);
  assert.equal(result.status, 0);
  const delivered = parseJsonStdout(result);
  assert.ok(delivered.length >= 1);
});

test("CLI notify commands reject invalid --now values", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataFile, "notify", "list", "--now", "bad-date"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid notification timestamp/);

  result = runCli(["--data", dataFile, "notify", "run", "--now", "bad-date"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid notification timestamp/);
});

test("CLI can export and import state snapshots", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataA = join(dir, "state-a.json");
  const dataB = join(dir, "state-b.json");
  const backup = join(dir, "backup.json");

  let result = runCli(["--data", dataA, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataA, "data", "export", "--out", backup]);
  assert.equal(result.status, 0);
  const exported = parseJsonStdout(result);
  assert.ok(exported.exportedTo.endsWith("backup.json"));

  result = runCli(["--data", dataB, "data", "import", "--in", backup]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataB, "club", "show"]);
  assert.equal(result.status, 0);
  const snapshot = parseJsonStdout(result);
  assert.equal(snapshot.club.name, "Cook Club");
  assert.equal(snapshot.host.name, "Alice");
});

test("CLI supports sqlite storage backend", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dbFile = join(dir, "state.sqlite");

  let result = runCli([
    "--storage",
    "sqlite",
    "--data",
    dbFile,
    "club",
    "init",
    "--name",
    "SQLite Club",
    "--host-name",
    "Alice"
  ]);
  assert.equal(result.status, 0);

  result = runCli(["--storage", "sqlite", "--data", dbFile, "club", "show"]);
  assert.equal(result.status, 0);
  const snapshot = parseJsonStdout(result);
  assert.equal(snapshot.club.name, "SQLite Club");
});

test("CLI data info reports sqlite migration versions and counts", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dbFile = join(dir, "state.sqlite");

  let result = runCli([
    "--storage",
    "sqlite",
    "--data",
    dbFile,
    "club",
    "init",
    "--name",
    "SQLite Club",
    "--host-name",
    "Alice"
  ]);
  assert.equal(result.status, 0);

  result = runCli(["--storage", "sqlite", "--data", dbFile, "data", "info"]);
  assert.equal(result.status, 0);
  const info = parseJsonStdout(result);
  assert.deepEqual(info.versions, [1, 2, 3, 4]);
  assert.equal(info.counts.clubs, 1);
  assert.equal(info.counts.users, 1);
});

test("legacy sqlite app_state is migrated into normalized tables", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dbFile = join(dir, "legacy.sqlite");
  const db = new DatabaseSync(dbFile);
  try {
    db.exec(`
      CREATE TABLE app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL
      );
    `);
    const legacyState = {
      version: 1,
      clubs: [
        {
          id: "club_1",
          name: "Legacy Club",
          hostUserId: "user_1",
          membershipPolicy: "closed",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      users: [
        {
          id: "user_1",
          name: "Legacy Host",
          email: null,
          phone: null,
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      memberships: [
        {
          id: "membership_1",
          clubId: "club_1",
          userId: "user_1",
          role: "host",
          joinedAt: "2026-01-01T00:00:00.000Z",
          cookbookAccessFrom: null
        }
      ],
      meetups: [
        {
          id: "meetup_1",
          clubId: "club_1",
          hostUserId: "user_1",
          scheduledFor: null,
          theme: "TBD",
          status: "upcoming",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      recipes: [],
      favorites: [],
      personalCollections: [],
      collectionItems: [],
      cookbookAccessGrants: [],
      notifications: [],
      counters: { club: 1, user: 1, membership: 1, meetup: 1 }
    };
    db.prepare("INSERT INTO app_state (id, data) VALUES (1, ?)").run(JSON.stringify(legacyState));
  } finally {
    db.close();
  }

  const result = runCli(["--storage", "sqlite", "--data", dbFile, "club", "show"]);
  assert.equal(result.status, 0);
  const snapshot = parseJsonStdout(result);
  assert.equal(snapshot.club.name, "Legacy Club");
  assert.equal(snapshot.host.name, "Legacy Host");
});

test("CLI can set custom reminder policy for club", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataFile,
    "club",
    "set-reminders",
    "--actor",
    "user_1",
    "--windows",
    "72,24,0",
    "--recipe-prompt-hours",
    "36"
  ]);
  assert.equal(result.status, 0);
  const policy = parseJsonStdout(result);
  assert.deepEqual(policy.meetupWindowHours, [72, 24, 0]);
  assert.equal(policy.recipePromptHours, 36);
});

test("CLI reminder templates can be listed and applied", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataFile, "club", "reminder-templates"]);
  assert.equal(result.status, 0);
  const templates = parseJsonStdout(result);
  assert.ok(templates.some((entry) => entry.name === "same_day"));

  result = runCli([
    "--data",
    dataFile,
    "club",
    "set-reminder-template",
    "--actor",
    "user_1",
    "--template",
    "same_day"
  ]);
  assert.equal(result.status, 0);
  const applied = parseJsonStdout(result);
  assert.equal(applied.template, "same_day");
});

test("CLI can add and remove custom reminder templates", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataFile,
    "club",
    "add-reminder-template",
    "--actor",
    "user_1",
    "--name",
    "weekend_focus",
    "--windows",
    "48,6,0",
    "--recipe-prompt-hours",
    "12"
  ]);
  assert.equal(result.status, 0);
  const added = parseJsonStdout(result);
  assert.equal(added.name, "weekend_focus");

  result = runCli([
    "--data",
    dataFile,
    "club",
    "set-reminder-template",
    "--actor",
    "user_1",
    "--template",
    "weekend_focus"
  ]);
  assert.equal(result.status, 0);
  const applied = parseJsonStdout(result);
  assert.equal(applied.source, "custom");

  result = runCli([
    "--data",
    dataFile,
    "club",
    "remove-reminder-template",
    "--actor",
    "user_1",
    "--name",
    "weekend_focus"
  ]);
  assert.equal(result.status, 0);
  const removed = parseJsonStdout(result);
  assert.equal(removed.removed, "weekend_focus");
});

test("CLI can export and import custom reminder templates", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataA = join(dir, "state-a.json");
  const dataB = join(dir, "state-b.json");
  const templateFile = join(dir, "templates.json");

  let result = runCli(["--data", dataA, "club", "init", "--name", "Club A", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataA,
    "club",
    "add-reminder-template",
    "--actor",
    "user_1",
    "--name",
    "weekend_focus",
    "--windows",
    "48,6,0",
    "--recipe-prompt-hours",
    "12"
  ]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataA, "club", "export-reminder-templates", "--out", templateFile]);
  assert.equal(result.status, 0);
  const exported = parseJsonStdout(result);
  assert.equal(exported.templateCount, 1);

  const payload = JSON.parse(readFileSync(templateFile, "utf8"));
  assert.ok(payload.templates.weekend_focus);

  result = runCli(["--data", dataB, "club", "init", "--name", "Club B", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataB,
    "club",
    "import-reminder-templates",
    "--actor",
    "user_1",
    "--in",
    templateFile,
    "--prefix",
    "shared"
  ]);
  assert.equal(result.status, 0);
  const imported = parseJsonStdout(result);
  assert.ok(imported.imported.includes("shared_weekend_focus"));
  assert.equal(imported.skipped.length, 0);
});

test("CLI rejects invalid reminder window list entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataFile,
    "club",
    "set-reminders",
    "--actor",
    "user_1",
    "--windows",
    "72,bad,0"
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid hours list entry/);
});

test("CLI data doctor reports sqlite health", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dbFile = join(dir, "doctor.sqlite");

  let result = runCli([
    "--storage",
    "sqlite",
    "--data",
    dbFile,
    "club",
    "init",
    "--name",
    "Doctor Club",
    "--host-name",
    "Alice"
  ]);
  assert.equal(result.status, 0);

  result = runCli(["--storage", "sqlite", "--data", dbFile, "data", "doctor"]);
  assert.equal(result.status, 0);
  const doctor = parseJsonStdout(result);
  assert.equal(doctor.ok, true);
  assert.deepEqual(doctor.integrity, ["ok"]);
  assert.deepEqual(doctor.missingTables, []);
});

test("CLI data doctor --repair returns repaired health report", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dbFile = join(dir, "doctor-repair.sqlite");

  let result = runCli([
    "--storage",
    "sqlite",
    "--data",
    dbFile,
    "club",
    "init",
    "--name",
    "Doctor Club",
    "--host-name",
    "Alice"
  ]);
  assert.equal(result.status, 0);

  result = runCli(["--storage", "sqlite", "--data", dbFile, "data", "doctor", "--repair"]);
  assert.equal(result.status, 0);
  const doctor = parseJsonStdout(result);
  assert.equal(doctor.repaired, true);
  assert.equal(doctor.ok, true);
});

test("CLI data doctor detects malformed sqlite JSON and repair fixes it with backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dbFile = join(dir, "doctor-corrupt.sqlite");

  let result = runCli([
    "--storage",
    "sqlite",
    "--data",
    dbFile,
    "club",
    "init",
    "--name",
    "Doctor Club",
    "--host-name",
    "Alice"
  ]);
  assert.equal(result.status, 0);

  const db = new DatabaseSync(dbFile);
  try {
    db.prepare("UPDATE clubs SET reminder_policy_json = ? WHERE id = ?").run("{", "club_1");
  } finally {
    db.close();
  }

  result = runCli(["--storage", "sqlite", "--data", dbFile, "data", "doctor"]);
  assert.equal(result.status, 0);
  const doctorBefore = parseJsonStdout(result);
  assert.equal(doctorBefore.ok, false);
  assert.ok(doctorBefore.jsonIssues.some((issue) => issue.column === "reminder_policy_json"));

  result = runCli(["--storage", "sqlite", "--data", dbFile, "data", "doctor", "--repair"]);
  assert.equal(result.status, 0);
  const doctorAfter = parseJsonStdout(result);
  assert.equal(doctorAfter.repaired, true);
  assert.equal(doctorAfter.ok, true);
  assert.ok(doctorAfter.repairedJsonFields >= 1);
  assert.equal(typeof doctorAfter.backupPath, "string");
  assert.equal(existsSync(doctorAfter.backupPath), true);
});

test("CLI meetup list and meetup show --id expose meetup history", () => {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-cli-"));
  const dataFile = join(dir, "state.json");

  let result = runCli(["--data", dataFile, "club", "init", "--name", "Cook Club", "--host-name", "Alice"]);
  assert.equal(result.status, 0);

  result = runCli([
    "--data",
    dataFile,
    "meetup",
    "schedule",
    "--actor",
    "user_1",
    "--at",
    "2026-04-03T18:30:00.000Z"
  ]);
  assert.equal(result.status, 0);
  const scheduled = parseJsonStdout(result);

  result = runCli(["--data", dataFile, "meetup", "advance", "--actor", "user_1"]);
  assert.equal(result.status, 0);

  result = runCli(["--data", dataFile, "meetup", "list"]);
  assert.equal(result.status, 0);
  const meetups = parseJsonStdout(result);
  assert.equal(meetups.length, 2);
  assert.ok(meetups[0].host?.name);

  result = runCli(["--data", dataFile, "meetup", "show", "--id", scheduled.id]);
  assert.equal(result.status, 0);
  const shown = parseJsonStdout(result);
  assert.equal(shown.id, scheduled.id);
  assert.equal(shown.host.id, "user_1");
});
