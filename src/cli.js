#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CookbookClubService } from "./service.js";
import { exportStateToFile, importStateFromFile, loadState, resolveDataFile, saveState } from "./storage.js";
import { getSqliteStorageInfo, repairSqliteStorage, runSqliteDoctor } from "./sqlite-storage.js";

function parseArgs(argv) {
  const tokens = [...argv];
  const command = tokens.shift() || "help";
  const subcommand = tokens[0] && !tokens[0].startsWith("--") ? tokens.shift() : null;
  const options = {};
  const positional = [];

  while (tokens.length) {
    const token = tokens.shift();
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = tokens[0];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = tokens.shift();
      }
      continue;
    }
    positional.push(token);
  }

  return { command, subcommand, options, positional };
}

function asJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function takeGlobalOption(tokens, key) {
  const idx = tokens.indexOf(key);
  if (idx < 0) return null;
  const value = tokens[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${key}`);
  }
  tokens.splice(idx, 2);
  return value;
}

function required(options, key, message = `Missing --${key}`) {
  const value = options[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(message);
  }
  return value;
}

function parseCsvNumberList(value) {
  if (!value) return [];
  const parts = String(value)
    .split(",")
    .map((part) => part.trim());
  if (!parts.length || parts.some((part) => part === "")) {
    throw new Error("Invalid hours list. Use comma-separated numbers like `72,24,3,0`.");
  }
  return parts.map((part) => {
    const num = Number(part);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error(`Invalid hours list entry: ${part}`);
    }
    return num;
  });
}

function parseOptionalNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --${fieldName} value. Expected a non-negative number.`);
  }
  return parsed;
}

function readJsonFile(path, fieldLabel) {
  const absolute = resolve(process.cwd(), path);
  const raw = readFileSync(absolute, "utf8").trim();
  if (!raw) {
    throw new Error(`${fieldLabel} file is empty: ${absolute}`);
  }
  try {
    return { absolute, data: JSON.parse(raw) };
  } catch (error) {
    throw new Error(`Invalid JSON in ${fieldLabel} file: ${absolute} (${error.message})`);
  }
}

function writeJsonFile(path, payload) {
  const absolute = resolve(process.cwd(), path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return absolute;
}

function cliVersion() {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const raw = readFileSync(packagePath, "utf8");
  return JSON.parse(raw).version;
}

function printHelp() {
  const help = `
Cookbook Club CLI (MVP)

Usage:
  cookbook-club [--data <path>] [--storage <json|sqlite>] <command> [subcommand] [options]

Commands:
  club init --name <clubName> --host-name <name> [--host-email <email>] [--host-phone <phone>]
  club show
  club set-policy --actor <userId> --policy <open|closed>
  club set-reminders --actor <userId> [--windows <hoursCsv>] [--recipe-prompt-hours <hours>]
  club reminder-templates
  club set-reminder-template --actor <userId> --template <standard|light|tight|same_day>
  club add-reminder-template --actor <userId> --name <templateName> --windows <hoursCsv> [--recipe-prompt-hours <hours>]
  club remove-reminder-template --actor <userId> --name <templateName>
  club export-reminder-templates --out <path>
  club import-reminder-templates --actor <userId> --in <path> [--overwrite] [--prefix <name>]
  user add --name <name> [--email <email>] [--phone <phone>]
  user list
  member invite --actor <userId> --user <userId> [--role <member|admin|co_admin>]
  member list
  member set-role --actor <userId> --user <userId> --role <member|admin|co_admin>
  host show
  host set --actor <userId> --user <userId>
  meetup show
  meetup show --id <meetupId>
  meetup list
  meetup schedule --actor <userId> --at <ISO datetime>
  meetup set-theme --actor <userId> --theme <text>
  meetup advance --actor <userId>
  recipe add --actor <userId> --title <title> --content <text> --image <path>
  recipe list --actor <userId> [--meetup <meetupId>]
  recipe favorite --actor <userId> --recipe <recipeId>
  cookbook personal-add --actor <userId> --recipe <recipeId> --collection <name>
  cookbook personal-list --actor <userId>
  access grant-past --actor <userId> --user <userId> [--from-meetup <meetupId> | --all]
  data export --out <path>
  data import --in <path>
  data info
  data doctor [--repair]
  notify list [--now <ISO datetime>] [--user <userId>]
  notify run [--now <ISO datetime>]
  version
  help
`;
  process.stdout.write(help.trimStart());
}

function formatClubSnapshot(snapshot) {
  const { club, host, upcoming } = snapshot;
  return {
    club: {
      id: club.id,
      name: club.name,
      membershipPolicy: club.membershipPolicy,
      reminderPolicy: club.reminderPolicy
    },
    host: {
      id: host.id,
      name: host.name
    },
    upcomingMeetup: upcoming
  };
}

function main() {
  const raw = process.argv.slice(2);
  const dataPath = takeGlobalOption(raw, "--data");
  const storage = takeGlobalOption(raw, "--storage") || "json";
  if (!["json", "sqlite"].includes(storage)) {
    throw new Error("Invalid --storage value. Use `json` or `sqlite`.");
  }

  const args = parseArgs(raw);
  const commandKey = `${args.command}:${args.subcommand || ""}`;
  const filePath = resolveDataFile(dataPath, storage);
  const stateFreeCommands = new Set(["help:", "data:info", "data:doctor", "data:import", "version:"]);
  const state = stateFreeCommands.has(commandKey) ? null : loadState(filePath, storage);
  const service = state ? new CookbookClubService(state) : null;

  let output = null;
  let shouldSave = true;

  switch (commandKey) {
    case "help:":
      shouldSave = false;
      printHelp();
      return;
    case "version:":
      shouldSave = false;
      output = {
        version: cliVersion()
      };
      break;
    case "club:init":
      output = service.initClub({
        clubName: required(args.options, "name"),
        hostName: required(args.options, "host-name"),
        hostEmail: args.options["host-email"] || null,
        hostPhone: args.options["host-phone"] || null
      });
      break;
    case "club:show":
      output = formatClubSnapshot(service.showClub());
      break;
    case "club:set-policy":
      output = service.setPolicy({
        actorUserId: required(args.options, "actor"),
        policy: required(args.options, "policy")
      });
      break;
    case "club:set-reminders":
      output = service.setReminderPolicy({
        actorUserId: required(args.options, "actor"),
        meetupWindowHours: args.options.windows ? parseCsvNumberList(args.options.windows) : undefined,
        recipePromptHours: parseOptionalNonNegativeNumber(
          args.options["recipe-prompt-hours"],
          "recipe-prompt-hours"
        )
      });
      break;
    case "club:reminder-templates":
      output = service.listReminderTemplates();
      break;
    case "club:set-reminder-template":
      output = service.applyReminderTemplate({
        actorUserId: required(args.options, "actor"),
        templateName: required(args.options, "template")
      });
      break;
    case "club:add-reminder-template":
      output = service.addReminderTemplate({
        actorUserId: required(args.options, "actor"),
        name: required(args.options, "name"),
        meetupWindowHours: parseCsvNumberList(required(args.options, "windows")),
        recipePromptHours: parseOptionalNonNegativeNumber(
          args.options["recipe-prompt-hours"],
          "recipe-prompt-hours"
        )
      });
      break;
    case "club:remove-reminder-template":
      output = service.removeReminderTemplate({
        actorUserId: required(args.options, "actor"),
        name: required(args.options, "name")
      });
      break;
    case "club:export-reminder-templates": {
      const templates = service.exportCustomReminderTemplates();
      const exportedTo = writeJsonFile(required(args.options, "out"), {
        version: 1,
        exportedAt: new Date().toISOString(),
        templates
      });
      output = {
        exportedTo,
        templateCount: Object.keys(templates).length
      };
      break;
    }
    case "club:import-reminder-templates": {
      const { absolute, data } = readJsonFile(required(args.options, "in"), "template import");
      const result = service.importCustomReminderTemplates({
        actorUserId: required(args.options, "actor"),
        templates: data?.templates ?? data,
        overwrite: Boolean(args.options.overwrite),
        prefix: args.options.prefix || ""
      });
      output = {
        importedFrom: absolute,
        ...result
      };
      break;
    }
    case "user:add":
      output = service.createUser({
        name: required(args.options, "name"),
        email: args.options.email || null,
        phone: args.options.phone || null
      });
      break;
    case "user:list":
      output = state.users;
      break;
    case "member:invite":
      output = service.inviteMember({
        actorUserId: required(args.options, "actor"),
        userId: required(args.options, "user"),
        role: args.options.role || "member"
      });
      break;
    case "member:list":
      output = service.listMembers();
      break;
    case "member:set-role":
      output = service.setRole({
        actorUserId: required(args.options, "actor"),
        userId: required(args.options, "user"),
        role: required(args.options, "role")
      });
      break;
    case "host:show":
      output = service.showClub().host;
      break;
    case "host:set":
      output = service.setHost({
        actorUserId: required(args.options, "actor"),
        newHostUserId: required(args.options, "user")
      });
      break;
    case "meetup:show":
      output = args.options.id ? service.getMeetupById(args.options.id) : service.getUpcomingMeetup();
      break;
    case "meetup:list":
      output = service.listMeetups();
      break;
    case "meetup:schedule":
      output = service.scheduleUpcomingMeetup({
        actorUserId: required(args.options, "actor"),
        isoDateTime: required(args.options, "at")
      });
      break;
    case "meetup:set-theme":
      output = service.setMeetupTheme({
        actorUserId: required(args.options, "actor"),
        theme: required(args.options, "theme")
      });
      break;
    case "meetup:advance":
      output = service.advanceMeetup({ actorUserId: required(args.options, "actor") });
      break;
    case "recipe:add":
      output = service.addRecipe({
        actorUserId: required(args.options, "actor"),
        title: required(args.options, "title"),
        content: required(args.options, "content"),
        imagePath: resolve(process.cwd(), required(args.options, "image"))
      });
      break;
    case "recipe:list":
      output = service.listMeetupRecipes({
        actorUserId: required(args.options, "actor"),
        meetupId: args.options.meetup || null
      });
      break;
    case "recipe:favorite":
      output = service.favoriteRecipe({
        actorUserId: required(args.options, "actor"),
        recipeId: required(args.options, "recipe")
      });
      break;
    case "cookbook:personal-add":
      output = service.addFavoriteToCollection({
        actorUserId: required(args.options, "actor"),
        recipeId: required(args.options, "recipe"),
        collectionName: required(args.options, "collection")
      });
      break;
    case "cookbook:personal-list":
      output = service.listPersonalCollections({
        actorUserId: required(args.options, "actor")
      });
      break;
    case "access:grant-past":
      output = service.grantPastCookbookAccess({
        actorUserId: required(args.options, "actor"),
        targetUserId: required(args.options, "user"),
        fromMeetupId: args.options["from-meetup"] || null,
        all: Boolean(args.options.all)
      });
      break;
    case "data:export":
      output = {
        exportedTo: exportStateToFile(required(args.options, "out"), state)
      };
      break;
    case "data:import": {
      const sourcePath = required(args.options, "in");
      const imported = importStateFromFile(sourcePath);
      saveState(filePath, imported, storage);
      output = {
        importedFrom: resolve(process.cwd(), sourcePath),
        activeDataFile: filePath
      };
      shouldSave = false;
      break;
    }
    case "data:info":
      output =
        storage === "sqlite"
          ? getSqliteStorageInfo(filePath)
          : {
              filePath,
              storage,
              note: "Detailed table stats are only available for --storage sqlite."
            };
      break;
    case "data:doctor":
      output =
        storage === "sqlite"
          ? args.options.repair
            ? repairSqliteStorage(filePath)
            : runSqliteDoctor(filePath)
          : {
              filePath,
              storage,
              note: "`data doctor` is only available for --storage sqlite."
            };
      break;
    case "notify:list":
      output = service.listPendingNotifications({
        now: args.options.now || null,
        userId: args.options.user || null
      });
      break;
    case "notify:run":
      output = service.runNotifications({
        now: args.options.now || new Date().toISOString()
      });
      break;
    default:
      shouldSave = false;
      printHelp();
      process.exitCode = 1;
      return;
  }

  if (shouldSave && state) {
    saveState(filePath, state, storage);
  }
  process.stdout.write(asJson(output));
}

try {
  main();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
