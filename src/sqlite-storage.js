import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDefaultState } from "./state.js";

const ENTITY_TABLES = [
  "clubs",
  "users",
  "memberships",
  "meetups",
  "recipes",
  "favorites",
  "personal_collections",
  "collection_items",
  "cookbook_access_grants",
  "notifications"
];

function tableExists(db, name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row?.name);
}

function columnExists(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

function applyMigration1(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS counters (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host_user_id TEXT NOT NULL,
      membership_policy TEXT NOT NULL,
      reminder_policy_json TEXT NOT NULL DEFAULT '{}',
      reminder_templates_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      cookbook_access_from TEXT
    );

    CREATE TABLE IF NOT EXISTS meetups (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL,
      host_user_id TEXT NOT NULL,
      scheduled_for TEXT,
      theme TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL,
      meetup_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personal_collections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cookbook_access_grants (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      meetup_id TEXT NOT NULL,
      granted_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      key TEXT,
      payload_json TEXT NOT NULL,
      due_at TEXT,
      created_at TEXT NOT NULL,
      delivered_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memberships_club ON memberships(club_id);
    CREATE INDEX IF NOT EXISTS idx_meetups_club ON meetups(club_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_meetup ON recipes(meetup_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_due ON notifications(due_at, delivered_at);
  `);
}

function clearNormalizedTables(db) {
  db.exec(`
    DELETE FROM counters;
    DELETE FROM clubs;
    DELETE FROM users;
    DELETE FROM memberships;
    DELETE FROM meetups;
    DELETE FROM recipes;
    DELETE FROM favorites;
    DELETE FROM personal_collections;
    DELETE FROM collection_items;
    DELETE FROM cookbook_access_grants;
    DELETE FROM notifications;
  `);
}

function writeStateToNormalizedTables(db, state) {
  const clean = { ...createDefaultState(), ...state };
  clearNormalizedTables(db);

  const insertCounter = db.prepare("INSERT INTO counters (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(clean.counters || {})) {
    insertCounter.run(key, Number(value));
  }

  const insertClub = db.prepare(
    "INSERT INTO clubs (id, name, host_user_id, membership_policy, reminder_policy_json, reminder_templates_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const item of clean.clubs) {
    insertClub.run(
      item.id,
      item.name,
      item.hostUserId,
      item.membershipPolicy,
      JSON.stringify(item.reminderPolicy || {}),
      JSON.stringify(item.reminderTemplates || {}),
      item.createdAt
    );
  }

  const insertUser = db.prepare(
    "INSERT INTO users (id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const item of clean.users) {
    insertUser.run(item.id, item.name, item.email, item.phone, item.createdAt);
  }

  const insertMembership = db.prepare(
    "INSERT INTO memberships (id, club_id, user_id, role, joined_at, cookbook_access_from) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const item of clean.memberships) {
    insertMembership.run(item.id, item.clubId, item.userId, item.role, item.joinedAt, item.cookbookAccessFrom);
  }

  const insertMeetup = db.prepare(
    "INSERT INTO meetups (id, club_id, host_user_id, scheduled_for, theme, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const item of clean.meetups) {
    insertMeetup.run(item.id, item.clubId, item.hostUserId, item.scheduledFor, item.theme, item.status, item.createdAt);
  }

  const insertRecipe = db.prepare(
    "INSERT INTO recipes (id, club_id, meetup_id, author_user_id, title, content, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const item of clean.recipes) {
    insertRecipe.run(
      item.id,
      item.clubId,
      item.meetupId,
      item.authorUserId,
      item.title,
      item.content,
      item.imagePath,
      item.createdAt
    );
  }

  const insertFavorite = db.prepare(
    "INSERT INTO favorites (id, user_id, recipe_id, created_at) VALUES (?, ?, ?, ?)"
  );
  for (const item of clean.favorites) {
    insertFavorite.run(item.id, item.userId, item.recipeId, item.createdAt);
  }

  const insertCollection = db.prepare(
    "INSERT INTO personal_collections (id, user_id, name, created_at) VALUES (?, ?, ?, ?)"
  );
  for (const item of clean.personalCollections) {
    insertCollection.run(item.id, item.userId, item.name, item.createdAt);
  }

  const insertCollectionItem = db.prepare(
    "INSERT INTO collection_items (id, collection_id, recipe_id, created_at) VALUES (?, ?, ?, ?)"
  );
  for (const item of clean.collectionItems) {
    insertCollectionItem.run(item.id, item.collectionId, item.recipeId, item.createdAt);
  }

  const insertAccessGrant = db.prepare(
    "INSERT INTO cookbook_access_grants (id, club_id, user_id, meetup_id, granted_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const item of clean.cookbookAccessGrants) {
    insertAccessGrant.run(item.id, item.clubId, item.userId, item.meetupId, item.grantedByUserId, item.createdAt);
  }

  const insertNotification = db.prepare(
    "INSERT INTO notifications (id, club_id, user_id, type, key, payload_json, due_at, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const item of clean.notifications) {
    insertNotification.run(
      item.id,
      item.clubId,
      item.userId,
      item.type,
      item.key || null,
      JSON.stringify(item.payload || {}),
      item.dueAt || null,
      item.createdAt,
      item.deliveredAt || null
    );
  }
}

function applyMigration2(db) {
  if (!tableExists(db, "app_state")) return;

  const normalizedHasData =
    db.prepare("SELECT 1 AS found FROM clubs LIMIT 1").get()?.found ||
    db.prepare("SELECT 1 AS found FROM users LIMIT 1").get()?.found ||
    db.prepare("SELECT 1 AS found FROM memberships LIMIT 1").get()?.found;
  if (normalizedHasData) return;

  const legacy = db.prepare("SELECT data FROM app_state WHERE id = 1").get();
  if (!legacy?.data) return;

  const parsed = JSON.parse(legacy.data);
  writeStateToNormalizedTables(db, parsed);
}

function applyMigration3(db) {
  if (!columnExists(db, "clubs", "reminder_policy_json")) {
    db.exec("ALTER TABLE clubs ADD COLUMN reminder_policy_json TEXT NOT NULL DEFAULT '{}';");
  }
}

function applyMigration4(db) {
  if (!columnExists(db, "clubs", "reminder_templates_json")) {
    db.exec("ALTER TABLE clubs ADD COLUMN reminder_templates_json TEXT NOT NULL DEFAULT '{}';");
  }
}

function ensureSchema(db) {
  applyMigration1(db);

  const currentVersionRow = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
  const currentVersion = currentVersionRow?.version || 0;

  if (currentVersion < 1) {
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, new Date().toISOString());
  }
  if (currentVersion < 2) {
    applyMigration2(db);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(2, new Date().toISOString());
  }
  if (currentVersion < 3) {
    applyMigration3(db);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(3, new Date().toISOString());
  }
  if (currentVersion < 4) {
    applyMigration4(db);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(4, new Date().toISOString());
  }
}

function openDb(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  ensureSchema(db);
  return db;
}

export function loadStateFromSqlite(filePath) {
  const db = openDb(filePath);
  try {
    const state = createDefaultState();

    const counterRows = db.prepare("SELECT key, value FROM counters").all();
    for (const row of counterRows) {
      state.counters[row.key] = row.value;
    }

    state.clubs = db
      .prepare(
        "SELECT id, name, host_user_id, membership_policy, reminder_policy_json, reminder_templates_json, created_at FROM clubs ORDER BY id"
      )
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        hostUserId: row.host_user_id,
        membershipPolicy: row.membership_policy,
        reminderPolicy: JSON.parse(row.reminder_policy_json || "{}"),
        reminderTemplates: JSON.parse(row.reminder_templates_json || "{}"),
        createdAt: row.created_at
      }));

    state.users = db
      .prepare("SELECT id, name, email, phone, created_at FROM users ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        createdAt: row.created_at
      }));

    state.memberships = db
      .prepare("SELECT id, club_id, user_id, role, joined_at, cookbook_access_from FROM memberships ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        clubId: row.club_id,
        userId: row.user_id,
        role: row.role,
        joinedAt: row.joined_at,
        cookbookAccessFrom: row.cookbook_access_from
      }));

    state.meetups = db
      .prepare("SELECT id, club_id, host_user_id, scheduled_for, theme, status, created_at FROM meetups ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        clubId: row.club_id,
        hostUserId: row.host_user_id,
        scheduledFor: row.scheduled_for,
        theme: row.theme,
        status: row.status,
        createdAt: row.created_at
      }));

    state.recipes = db
      .prepare(
        "SELECT id, club_id, meetup_id, author_user_id, title, content, image_path, created_at FROM recipes ORDER BY id"
      )
      .all()
      .map((row) => ({
        id: row.id,
        clubId: row.club_id,
        meetupId: row.meetup_id,
        authorUserId: row.author_user_id,
        title: row.title,
        content: row.content,
        imagePath: row.image_path,
        createdAt: row.created_at
      }));

    state.favorites = db
      .prepare("SELECT id, user_id, recipe_id, created_at FROM favorites ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        userId: row.user_id,
        recipeId: row.recipe_id,
        createdAt: row.created_at
      }));

    state.personalCollections = db
      .prepare("SELECT id, user_id, name, created_at FROM personal_collections ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        createdAt: row.created_at
      }));

    state.collectionItems = db
      .prepare("SELECT id, collection_id, recipe_id, created_at FROM collection_items ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        collectionId: row.collection_id,
        recipeId: row.recipe_id,
        createdAt: row.created_at
      }));

    state.cookbookAccessGrants = db
      .prepare("SELECT id, club_id, user_id, meetup_id, granted_by_user_id, created_at FROM cookbook_access_grants ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        clubId: row.club_id,
        userId: row.user_id,
        meetupId: row.meetup_id,
        grantedByUserId: row.granted_by_user_id,
        createdAt: row.created_at
      }));

    state.notifications = db
      .prepare("SELECT id, club_id, user_id, type, key, payload_json, due_at, created_at, delivered_at FROM notifications ORDER BY id")
      .all()
      .map((row) => ({
        id: row.id,
        clubId: row.club_id,
        userId: row.user_id,
        type: row.type,
        key: row.key,
        payload: JSON.parse(row.payload_json || "{}"),
        dueAt: row.due_at,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at
      }));

    return state;
  } finally {
    db.close();
  }
}

export function saveStateToSqlite(filePath, state) {
  const db = openDb(filePath);
  try {
    db.exec("BEGIN");
    writeStateToNormalizedTables(db, state);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore: transaction may already be closed.
    }
    throw error;
  } finally {
    db.close();
  }
}

export function getSqliteStorageInfo(filePath) {
  const db = openDb(filePath);
  try {
    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((v) => v.version);
    const counts = {};
    for (const table of ENTITY_TABLES) {
      const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get();
      counts[table] = row.total;
    }
    return { filePath, versions, counts };
  } finally {
    db.close();
  }
}

export function runSqliteDoctor(filePath) {
  const db = openDb(filePath);
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => row.integrity_check);
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    const missingTables = ENTITY_TABLES.filter((table) => !tableExists(db, table));
    const migrationVersions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((v) => v.version);
    const jsonIssues = [];

    const clubJsonRows = db
      .prepare("SELECT id, reminder_policy_json, reminder_templates_json FROM clubs")
      .all();
    for (const row of clubJsonRows) {
      try {
        JSON.parse(row.reminder_policy_json || "{}");
      } catch {
        jsonIssues.push({
          table: "clubs",
          rowId: row.id,
          column: "reminder_policy_json"
        });
      }
      try {
        JSON.parse(row.reminder_templates_json || "{}");
      } catch {
        jsonIssues.push({
          table: "clubs",
          rowId: row.id,
          column: "reminder_templates_json"
        });
      }
    }

    const notificationJsonRows = db.prepare("SELECT id, payload_json FROM notifications").all();
    for (const row of notificationJsonRows) {
      try {
        JSON.parse(row.payload_json || "{}");
      } catch {
        jsonIssues.push({
          table: "notifications",
          rowId: row.id,
          column: "payload_json"
        });
      }
    }

    return {
      filePath,
      ok:
        integrity.length === 1 &&
        integrity[0] === "ok" &&
        foreignKeys.length === 0 &&
        missingTables.length === 0 &&
        jsonIssues.length === 0,
      integrity,
      foreignKeyIssues: foreignKeys,
      missingTables,
      migrationVersions,
      jsonIssues
    };
  } finally {
    db.close();
  }
}

export function repairSqliteStorage(filePath) {
  const backupPath = existsSync(filePath) ? `${filePath}.bak.${Date.now()}` : null;
  if (backupPath) {
    copyFileSync(filePath, backupPath);
  }

  const db = openDb(filePath);
  let repairedJsonFields = 0;
  try {
    db.exec("BEGIN");
    const fixClubReminderPolicy = db.prepare("UPDATE clubs SET reminder_policy_json = ? WHERE id = ?");
    const fixClubReminderTemplates = db.prepare("UPDATE clubs SET reminder_templates_json = ? WHERE id = ?");
    const fixNotificationPayload = db.prepare("UPDATE notifications SET payload_json = ? WHERE id = ?");

    const clubRows = db
      .prepare("SELECT id, reminder_policy_json, reminder_templates_json FROM clubs")
      .all();
    for (const row of clubRows) {
      try {
        JSON.parse(row.reminder_policy_json || "{}");
      } catch {
        fixClubReminderPolicy.run("{}", row.id);
        repairedJsonFields += 1;
      }
      try {
        JSON.parse(row.reminder_templates_json || "{}");
      } catch {
        fixClubReminderTemplates.run("{}", row.id);
        repairedJsonFields += 1;
      }
    }

    const notificationRows = db.prepare("SELECT id, payload_json FROM notifications").all();
    for (const row of notificationRows) {
      try {
        JSON.parse(row.payload_json || "{}");
      } catch {
        fixNotificationPayload.run("{}", row.id);
        repairedJsonFields += 1;
      }
    }

    db.exec("COMMIT");
    db.exec("PRAGMA optimize;");
    db.exec("VACUUM;");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
  const doctor = runSqliteDoctor(filePath);
  return {
    repaired: true,
    backupPath,
    repairedJsonFields,
    ...doctor
  };
}
