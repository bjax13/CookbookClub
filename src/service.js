import { existsSync } from "node:fs";
import { dedupeBy, nextId, nowIso } from "./state.js";

const ROLES = {
  HOST: "host",
  ADMIN: "admin",
  CO_ADMIN: "co_admin",
  MEMBER: "member"
};

const CLUB_POLICY = {
  OPEN: "open",
  CLOSED: "closed"
};

const DEFAULT_REMINDER_POLICY = {
  meetupWindowHours: [168, 24, 3, 0],
  recipePromptHours: 48
};

const REMINDER_TEMPLATES = {
  standard: { meetupWindowHours: [168, 24, 3, 0], recipePromptHours: 48 },
  light: { meetupWindowHours: [24, 2, 0], recipePromptHours: 24 },
  tight: { meetupWindowHours: [336, 168, 72, 24, 3, 1, 0], recipePromptHours: 72 },
  same_day: { meetupWindowHours: [8, 3, 1, 0], recipePromptHours: 6 }
};

function isValidTemplateName(name) {
  return typeof name === "string" && /^[a-z0-9_]{2,40}$/.test(name);
}

function idSequence(id) {
  const value = Number(String(id).split("_")[1]);
  return Number.isNaN(value) ? -1 : value;
}

function clampDueAt(dueAtIso, nowIsoValue) {
  return Date.parse(dueAtIso) < Date.parse(nowIsoValue) ? nowIsoValue : dueAtIso;
}

function toValidIso(value, errorMessage) {
  if (typeof value !== "string" || !value.trim()) throw new Error(errorMessage);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(errorMessage);
  return new Date(parsed).toISOString();
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function sanitizeReminderPolicy(policy) {
  const candidate = policy || {};
  const meetupWindowHours = Array.isArray(candidate.meetupWindowHours)
    ? candidate.meetupWindowHours
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 0)
    : DEFAULT_REMINDER_POLICY.meetupWindowHours;
  const dedupedSorted = [...new Set(meetupWindowHours)].sort((a, b) => b - a);
  const recipePromptHours = Number(candidate.recipePromptHours);
  return {
    meetupWindowHours: dedupedSorted.length ? dedupedSorted : DEFAULT_REMINDER_POLICY.meetupWindowHours,
    recipePromptHours:
      Number.isFinite(recipePromptHours) && recipePromptHours >= 0
        ? recipePromptHours
        : DEFAULT_REMINDER_POLICY.recipePromptHours
  };
}

function sanitizeReminderTemplateMap(value) {
  const templates = {};
  if (!value || typeof value !== "object") return templates;
  for (const [name, policy] of Object.entries(value)) {
    if (!isValidTemplateName(name)) continue;
    templates[name] = sanitizeReminderPolicy(policy);
  }
  return templates;
}

export class CookbookClubService {
  constructor(state) {
    this.state = state;
  }

  get activeClub() {
    return this.state.clubs[0] || null;
  }

  requireClub() {
    const club = this.activeClub;
    if (!club) throw new Error("Club is not initialized. Run `club init`.");
    club.reminderPolicy = sanitizeReminderPolicy(club.reminderPolicy);
    club.reminderTemplates = sanitizeReminderTemplateMap(club.reminderTemplates);
    return club;
  }

  requireUser(userId) {
    const user = this.state.users.find((entry) => entry.id === userId);
    if (!user) throw new Error(`Unknown user: ${userId}`);
    return user;
  }

  userRole(clubId, userId) {
    const membership = this.state.memberships.find((entry) => entry.clubId === clubId && entry.userId === userId);
    return membership?.role || null;
  }

  isRole(userId, allowedRoles, clubId = this.requireClub().id) {
    const role = this.userRole(clubId, userId);
    return allowedRoles.includes(role);
  }

  assertCanInvite(actorUserId) {
    const club = this.requireClub();
    if (club.membershipPolicy === CLUB_POLICY.OPEN) return;
    if (this.isRole(actorUserId, [ROLES.HOST, ROLES.ADMIN, ROLES.CO_ADMIN], club.id)) return;
    throw new Error("Club is closed. Only host/admin/co_admin can invite members.");
  }

  assertHost(actorUserId) {
    const club = this.requireClub();
    if (club.hostUserId !== actorUserId) throw new Error("Only current host can perform this action.");
  }

  assertAdminOrCoAdmin(actorUserId) {
    const club = this.requireClub();
    if (!this.isRole(actorUserId, [ROLES.HOST, ROLES.ADMIN, ROLES.CO_ADMIN], club.id)) {
      throw new Error("Only host/admin/co_admin can perform this action.");
    }
  }

  assertMember(userId, clubId = this.requireClub().id) {
    const membership = this.state.memberships.find((entry) => entry.clubId === clubId && entry.userId === userId);
    if (!membership) throw new Error("User is not a member of this club.");
    return membership;
  }

  initClub({ clubName, hostName, hostEmail = null, hostPhone = null }) {
    if (this.activeClub) throw new Error("Only single club is supported in MVP. Club already initialized.");
    const normalizedClubName = requireNonEmptyString(clubName, "Club name");
    const normalizedHostName = requireNonEmptyString(hostName, "Host name");

    const clubId = nextId(this.state, "club");
    const hostUserId = nextId(this.state, "user");
    const timestamp = nowIso();

    const host = {
      id: hostUserId,
      name: normalizedHostName,
      email: hostEmail,
      phone: hostPhone,
      createdAt: timestamp
    };

    const club = {
      id: clubId,
      name: normalizedClubName,
      hostUserId,
      membershipPolicy: CLUB_POLICY.CLOSED,
      reminderPolicy: sanitizeReminderPolicy(null),
      reminderTemplates: {},
      createdAt: timestamp
    };

    const membership = {
      id: nextId(this.state, "membership"),
      clubId,
      userId: hostUserId,
      role: ROLES.HOST,
      joinedAt: timestamp,
      cookbookAccessFrom: null
    };

    this.state.users.push(host);
    this.state.clubs.push(club);
    this.state.memberships.push(membership);

    this.createMeetup({
      clubId,
      hostUserId,
      scheduledFor: null,
      theme: "TBD",
      status: "upcoming"
    });

    return { club, host };
  }

  createUser({ name, email = null, phone = null }) {
    const normalizedName = requireNonEmptyString(name, "User name");
    const user = {
      id: nextId(this.state, "user"),
      name: normalizedName,
      email,
      phone,
      createdAt: nowIso()
    };
    this.state.users.push(user);
    return user;
  }

  inviteMember({ actorUserId, userId, role = ROLES.MEMBER }) {
    const club = this.requireClub();
    this.requireUser(actorUserId);
    this.requireUser(userId);
    this.assertCanInvite(actorUserId);

    if (!Object.values(ROLES).includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    if (role === ROLES.HOST) {
      throw new Error("Use host transfer to assign host role.");
    }

    const existing = this.state.memberships.find((entry) => entry.clubId === club.id && entry.userId === userId);
    if (existing) return existing;

    const upcoming = this.getUpcomingMeetup();
    const membership = {
      id: nextId(this.state, "membership"),
      clubId: club.id,
      userId,
      role,
      joinedAt: nowIso(),
      cookbookAccessFrom: upcoming?.id || null
    };
    this.state.memberships.push(membership);
    if (upcoming?.scheduledFor) {
      this.scheduleMeetupReminders(upcoming, [userId]);
    }
    return membership;
  }

  listMembers() {
    const club = this.requireClub();
    return this.state.memberships
      .filter((entry) => entry.clubId === club.id)
      .map((entry) => ({
        ...entry,
        user: this.requireUser(entry.userId)
      }));
  }

  setRole({ actorUserId, userId, role }) {
    const club = this.requireClub();
    if (!Object.values(ROLES).includes(role)) throw new Error(`Invalid role: ${role}`);
    if (role === ROLES.HOST) {
      throw new Error("Use host transfer to assign host role.");
    }
    if (club.hostUserId === userId) {
      throw new Error("Use host transfer before changing the current host role.");
    }
    if (!this.isRole(actorUserId, [ROLES.HOST, ROLES.ADMIN], club.id)) {
      throw new Error("Only host/admin can set member roles.");
    }

    const membership = this.assertMember(userId, club.id);
    membership.role = role;
    return membership;
  }

  setHost({ actorUserId, newHostUserId }) {
    const club = this.requireClub();
    this.assertHost(actorUserId);
    this.assertMember(newHostUserId, club.id);

    const oldHostMembership = this.assertMember(club.hostUserId, club.id);
    const newHostMembership = this.assertMember(newHostUserId, club.id);

    oldHostMembership.role = ROLES.MEMBER;
    newHostMembership.role = ROLES.HOST;
    club.hostUserId = newHostUserId;

    const upcoming = this.getUpcomingMeetup();
    if (upcoming) {
      upcoming.hostUserId = newHostUserId;
    }

    return club;
  }

  setPolicy({ actorUserId, policy }) {
    if (!Object.values(CLUB_POLICY).includes(policy)) throw new Error(`Invalid policy: ${policy}`);
    this.assertHost(actorUserId);
    const club = this.requireClub();
    club.membershipPolicy = policy;
    return club;
  }

  setReminderPolicy({ actorUserId, meetupWindowHours, recipePromptHours }) {
    this.assertHost(actorUserId);
    const club = this.requireClub();
    club.reminderPolicy = sanitizeReminderPolicy({
      meetupWindowHours,
      recipePromptHours
    });
    return club.reminderPolicy;
  }

  listReminderTemplates() {
    const club = this.requireClub();
    const builtIn = Object.entries(REMINDER_TEMPLATES).map(([name, policy]) => ({
      name,
      source: "builtin",
      policy: sanitizeReminderPolicy(policy)
    }));
    const custom = Object.entries(club.reminderTemplates || {}).map(([name, policy]) => ({
      name,
      source: "custom",
      policy: sanitizeReminderPolicy(policy)
    }));
    return [...builtIn, ...custom];
  }

  addReminderTemplate({ actorUserId, name, meetupWindowHours, recipePromptHours }) {
    this.assertHost(actorUserId);
    if (!isValidTemplateName(name)) {
      throw new Error("Invalid template name. Use 2-40 chars: lowercase letters, numbers, underscore.");
    }
    if (REMINDER_TEMPLATES[name]) {
      throw new Error("Cannot overwrite built-in reminder template.");
    }
    const club = this.requireClub();
    const policy = sanitizeReminderPolicy({ meetupWindowHours, recipePromptHours });
    club.reminderTemplates[name] = policy;
    return {
      name,
      source: "custom",
      policy
    };
  }

  removeReminderTemplate({ actorUserId, name }) {
    this.assertHost(actorUserId);
    const club = this.requireClub();
    if (!club.reminderTemplates[name]) {
      throw new Error(`Unknown custom reminder template: ${name}`);
    }
    delete club.reminderTemplates[name];
    return { removed: name };
  }

  applyReminderTemplate({ actorUserId, templateName }) {
    this.assertHost(actorUserId);
    const club = this.requireClub();
    const template = club.reminderTemplates[templateName] || REMINDER_TEMPLATES[templateName];
    if (!template) throw new Error(`Unknown reminder template: ${templateName}`);
    club.reminderPolicy = sanitizeReminderPolicy(template);
    return {
      template: templateName,
      source: club.reminderTemplates[templateName] ? "custom" : "builtin",
      policy: club.reminderPolicy
    };
  }

  exportCustomReminderTemplates() {
    const club = this.requireClub();
    const templates = sanitizeReminderTemplateMap(club.reminderTemplates);
    return { ...templates };
  }

  importCustomReminderTemplates({ actorUserId, templates, overwrite = false, prefix = "" }) {
    this.assertHost(actorUserId);
    if (!templates || typeof templates !== "object" || Array.isArray(templates)) {
      throw new Error("Invalid template payload. Expected an object keyed by template name.");
    }
    const normalizedPrefix = String(prefix || "").trim();
    if (normalizedPrefix && !/^[a-z0-9_]{1,20}$/.test(normalizedPrefix)) {
      throw new Error("Invalid template prefix. Use 1-20 chars: lowercase letters, numbers, underscore.");
    }

    const club = this.requireClub();
    const imported = [];
    const skipped = [];
    for (const [rawName, policy] of Object.entries(templates)) {
      if (!isValidTemplateName(rawName)) {
        skipped.push({ name: rawName, reason: "invalid_name" });
        continue;
      }
      const name = normalizedPrefix ? `${normalizedPrefix}_${rawName}` : rawName;
      if (!isValidTemplateName(name)) {
        skipped.push({ name, reason: "invalid_name" });
        continue;
      }
      if (REMINDER_TEMPLATES[name]) {
        skipped.push({ name, reason: "builtin_conflict" });
        continue;
      }
      if (club.reminderTemplates[name] && !overwrite) {
        skipped.push({ name, reason: "already_exists" });
        continue;
      }
      club.reminderTemplates[name] = sanitizeReminderPolicy(policy);
      imported.push(name);
    }

    return {
      imported,
      skipped,
      overwrite: Boolean(overwrite),
      prefix: normalizedPrefix || null
    };
  }

  createMeetup({ clubId, hostUserId, scheduledFor, theme, status }) {
    const meetup = {
      id: nextId(this.state, "meetup"),
      clubId,
      hostUserId,
      scheduledFor,
      theme,
      status,
      createdAt: nowIso()
    };
    this.state.meetups.push(meetup);
    return meetup;
  }

  getUpcomingMeetup() {
    const club = this.requireClub();
    return (
      this.state.meetups.find((entry) => entry.clubId === club.id && entry.status === "upcoming") || null
    );
  }

  getPastMeetups() {
    const club = this.requireClub();
    return this.state.meetups.filter((entry) => entry.clubId === club.id && entry.status === "past");
  }

  listMeetups() {
    const club = this.requireClub();
    return this.state.meetups
      .filter((entry) => entry.clubId === club.id)
      .slice()
      .sort((a, b) => idSequence(a.id) - idSequence(b.id))
      .map((meetup) => ({
        ...meetup,
        host: this.requireUser(meetup.hostUserId)
      }));
  }

  getMeetupById(meetupId) {
    const club = this.requireClub();
    const meetup = this.state.meetups.find((entry) => entry.id === meetupId);
    if (!meetup || meetup.clubId !== club.id) throw new Error(`Unknown meetup: ${meetupId}`);
    return {
      ...meetup,
      host: this.requireUser(meetup.hostUserId)
    };
  }

  scheduleUpcomingMeetup({ actorUserId, isoDateTime }) {
    this.assertHost(actorUserId);
    const upcoming = this.getUpcomingMeetup();
    if (!upcoming) throw new Error("No upcoming meetup record exists.");
    upcoming.scheduledFor = toValidIso(isoDateTime, "Invalid datetime. Use ISO format.");
    this.scheduleMeetupReminders(upcoming);
    this.queueReminder("meetup_updated", {
      meetupId: upcoming.id,
      message: `Meetup scheduled for ${upcoming.scheduledFor}. Theme: ${upcoming.theme}`
    });

    return upcoming;
  }

  setMeetupTheme({ actorUserId, theme }) {
    this.assertHost(actorUserId);
    const upcoming = this.getUpcomingMeetup();
    if (!upcoming) throw new Error("No upcoming meetup record exists.");
    upcoming.theme = requireNonEmptyString(theme, "Theme");
    this.scheduleMeetupReminders(upcoming);
    this.queueReminder("meetup_updated", {
      meetupId: upcoming.id,
      message: `Theme updated: ${theme}`
    });
    return upcoming;
  }

  advanceMeetup({ actorUserId }) {
    this.assertHost(actorUserId);
    const club = this.requireClub();
    const upcoming = this.getUpcomingMeetup();
    if (!upcoming) throw new Error("No upcoming meetup to advance.");

    upcoming.status = "past";
    const next = this.createMeetup({
      clubId: club.id,
      hostUserId: club.hostUserId,
      scheduledFor: null,
      theme: "TBD",
      status: "upcoming"
    });
    return { past: upcoming, next };
  }

  queueReminder(type, payload, options = {}) {
    const { dueAt = nowIso(), userIds = null, key = null } = options;
    const club = this.requireClub();
    const memberIds = userIds || this.state.memberships.filter((entry) => entry.clubId === club.id).map((entry) => entry.userId);
    const uniqueUserIds = dedupeBy(memberIds.map((id) => ({ id })), (v) => v.id).map((v) => v.id);

    for (const userId of uniqueUserIds) {
      const duplicate = this.state.notifications.find(
        (entry) =>
          !entry.deliveredAt &&
          entry.userId === userId &&
          entry.type === type &&
          entry.key === key &&
          entry.payload?.meetupId === payload?.meetupId
      );
      if (duplicate) {
        duplicate.payload = payload;
        duplicate.dueAt = dueAt;
        continue;
      }

      this.state.notifications.push({
        id: nextId(this.state, "notification"),
        clubId: club.id,
        userId,
        type,
        key,
        payload,
        dueAt,
        createdAt: nowIso(),
        deliveredAt: null
      });
    }
  }

  scheduleMeetupReminders(meetup, specificUserIds = null) {
    if (!meetup?.scheduledFor) return;

    const now = nowIso();
    const scheduledAt = Date.parse(meetup.scheduledFor);
    const club = this.requireClub();
    const policy = sanitizeReminderPolicy(club.reminderPolicy);
    const targets = policy.meetupWindowHours.map((hours) => ({
      type: "meetup_reminder",
      key: `meetup_${hours}h`,
      offsetMs: hours * 60 * 60 * 1000,
      message:
        hours === 0
          ? `Meetup starting now. Theme: ${meetup.theme}`
          : `Reminder: meetup in ${hours} hour(s) (${meetup.scheduledFor})`
    }));
    targets.push({
      type: "recipe_prompt",
      key: "recipe_prompt",
      offsetMs: policy.recipePromptHours * 60 * 60 * 1000,
      message: `Prompt: add your recipe and image for theme "${meetup.theme}".`
    });

    for (const target of targets) {
      const dueAtIso = new Date(scheduledAt - target.offsetMs).toISOString();
      this.queueReminder(
        target.type,
        {
          meetupId: meetup.id,
          message: target.message
        },
        {
          dueAt: clampDueAt(dueAtIso, now),
          userIds: specificUserIds,
          key: target.key
        }
      );
    }
  }

  runNotifications({ now = new Date().toISOString() } = {}) {
    const nowIsoValue = toValidIso(now, "Invalid notification timestamp. Use ISO format.");
    const pending = this.state.notifications.filter((entry) => {
      if (entry.deliveredAt) return false;
      if (!entry.dueAt) return true;
      return Date.parse(entry.dueAt) <= Date.parse(nowIsoValue);
    });
    for (const notification of pending) {
      notification.deliveredAt = nowIsoValue;
    }
    return pending.map((entry) => ({
      ...entry,
      user: this.requireUser(entry.userId)
    }));
  }

  listPendingNotifications({ now = null, userId = null } = {}) {
    let pending = this.state.notifications.filter((entry) => !entry.deliveredAt);
    if (now) {
      const nowIsoValue = toValidIso(now, "Invalid notification timestamp. Use ISO format.");
      pending = pending.filter((entry) => !entry.dueAt || Date.parse(entry.dueAt) <= Date.parse(nowIsoValue));
    }
    if (userId) {
      this.requireUser(userId);
      pending = pending.filter((entry) => entry.userId === userId);
    }
    return pending.map((entry) => ({
      ...entry,
      user: this.requireUser(entry.userId)
    }));
  }

  canViewMeetupCookbook(userId, meetupId) {
    const membership = this.assertMember(userId);
    const meetup = this.state.meetups.find((entry) => entry.id === meetupId);
    if (!meetup) throw new Error(`Unknown meetup: ${meetupId}`);

    if (!membership.cookbookAccessFrom) return true;
    if (idSequence(meetup.id) >= idSequence(membership.cookbookAccessFrom)) return true;

    return this.state.cookbookAccessGrants.some(
      (entry) => entry.userId === userId && entry.meetupId === meetupId
    );
  }

  addRecipe({ actorUserId, title, content, imagePath }) {
    const upcoming = this.getUpcomingMeetup();
    if (!upcoming) throw new Error("No upcoming meetup.");
    this.assertMember(actorUserId);
    const normalizedTitle = requireNonEmptyString(title, "Recipe title");
    const normalizedContent = requireNonEmptyString(content, "Recipe content");
    const normalizedImagePath = requireNonEmptyString(imagePath, "Recipe image path");

    if (!existsSync(normalizedImagePath)) {
      throw new Error(`Image path not found: ${normalizedImagePath}`);
    }

    const recipe = {
      id: nextId(this.state, "recipe"),
      clubId: upcoming.clubId,
      meetupId: upcoming.id,
      authorUserId: actorUserId,
      title: normalizedTitle,
      content: normalizedContent,
      imagePath: normalizedImagePath,
      createdAt: nowIso()
    };
    this.state.recipes.push(recipe);
    return recipe;
  }

  listMeetupRecipes({ actorUserId, meetupId = null }) {
    this.assertMember(actorUserId);
    const id = meetupId || this.getUpcomingMeetup()?.id;
    if (!id) return [];
    if (!this.canViewMeetupCookbook(actorUserId, id)) {
      throw new Error("No cookbook access for this meetup.");
    }

    return this.state.recipes
      .filter((entry) => entry.meetupId === id)
      .map((entry) => ({ ...entry, author: this.requireUser(entry.authorUserId) }));
  }

  favoriteRecipe({ actorUserId, recipeId }) {
    this.assertMember(actorUserId);
    const recipe = this.state.recipes.find((entry) => entry.id === recipeId);
    if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`);
    if (!this.canViewMeetupCookbook(actorUserId, recipe.meetupId)) {
      throw new Error("You cannot favorite recipes you cannot view.");
    }

    const existing = this.state.favorites.find((entry) => entry.userId === actorUserId && entry.recipeId === recipeId);
    if (existing) return existing;

    const favorite = {
      id: nextId(this.state, "favorite"),
      userId: actorUserId,
      recipeId,
      createdAt: nowIso()
    };
    this.state.favorites.push(favorite);
    return favorite;
  }

  ensurePersonalCollection({ actorUserId, name }) {
    const existing = this.state.personalCollections.find((entry) => entry.userId === actorUserId && entry.name === name);
    if (existing) return existing;
    const collection = {
      id: nextId(this.state, "collection"),
      userId: actorUserId,
      name,
      createdAt: nowIso()
    };
    this.state.personalCollections.push(collection);
    return collection;
  }

  addFavoriteToCollection({ actorUserId, recipeId, collectionName }) {
    const favorite = this.favoriteRecipe({ actorUserId, recipeId });
    const collection = this.ensurePersonalCollection({ actorUserId, name: collectionName });
    const exists = this.state.collectionItems.find(
      (entry) => entry.collectionId === collection.id && entry.recipeId === favorite.recipeId
    );
    if (exists) return exists;

    const item = {
      id: nextId(this.state, "collectionItem"),
      collectionId: collection.id,
      recipeId: favorite.recipeId,
      createdAt: nowIso()
    };
    this.state.collectionItems.push(item);
    return item;
  }

  listPersonalCollections({ actorUserId }) {
    this.assertMember(actorUserId);
    const collections = this.state.personalCollections.filter((entry) => entry.userId === actorUserId);
    return collections.map((collection) => ({
      ...collection,
      recipes: this.state.collectionItems
        .filter((entry) => entry.collectionId === collection.id)
        .map((entry) => this.state.recipes.find((recipe) => recipe.id === entry.recipeId))
        .filter(Boolean)
    }));
  }

  grantPastCookbookAccess({ actorUserId, targetUserId, fromMeetupId = null, all = false }) {
    this.assertAdminOrCoAdmin(actorUserId);
    this.assertMember(targetUserId);

    const pastMeetups = this.getPastMeetups();
    if (!pastMeetups.length) return [];
    if (fromMeetupId && !pastMeetups.some((entry) => entry.id === fromMeetupId)) {
      throw new Error(`Unknown past meetup: ${fromMeetupId}`);
    }

    const targets = all
      ? pastMeetups
      : pastMeetups.filter((entry) => (fromMeetupId ? idSequence(entry.id) >= idSequence(fromMeetupId) : true));

    const grants = [];
    for (const meetup of targets) {
      const existing = this.state.cookbookAccessGrants.find(
        (entry) => entry.userId === targetUserId && entry.meetupId === meetup.id
      );
      if (existing) continue;
      const grant = {
        id: nextId(this.state, "accessGrant"),
        clubId: meetup.clubId,
        userId: targetUserId,
        meetupId: meetup.id,
        grantedByUserId: actorUserId,
        createdAt: nowIso()
      };
      this.state.cookbookAccessGrants.push(grant);
      grants.push(grant);
    }
    return grants;
  }

  showClub() {
    const club = this.requireClub();
    const host = this.requireUser(club.hostUserId);
    const upcoming = this.getUpcomingMeetup();
    return { club, host, upcoming };
  }
}

export { ROLES, CLUB_POLICY, REMINDER_TEMPLATES };
