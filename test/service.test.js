import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CookbookClubService, CLUB_POLICY } from "../src/service.js";
import { createDefaultState } from "../src/state.js";

function bootstrap() {
  const state = createDefaultState();
  const service = new CookbookClubService(state);
  const { host } = service.initClub({
    clubName: "Sunday Supper",
    hostName: "Alice Host"
  });
  return { service, host, state };
}

function makeImage() {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-club-"));
  const filePath = join(dir, "dish.jpg");
  writeFileSync(filePath, "fake-image-content", "utf8");
  return filePath;
}

test("club can initialize once only", () => {
  const { service } = bootstrap();
  assert.throws(
    () =>
      service.initClub({
        clubName: "Second Club",
        hostName: "Other Host"
      }),
    /single club/
  );
});

test("closed club invite requires host/admin/co_admin", () => {
  const { service, host } = bootstrap();
  const bob = service.createUser({ name: "Bob Member" });
  const carol = service.createUser({ name: "Carol Guest" });

  service.inviteMember({ actorUserId: host.id, userId: bob.id });
  assert.throws(
    () => service.inviteMember({ actorUserId: bob.id, userId: carol.id }),
    /Only host\/admin\/co_admin/
  );
});

test("open club lets members invite", () => {
  const { service, host } = bootstrap();
  const bob = service.createUser({ name: "Bob Member" });
  const carol = service.createUser({ name: "Carol Guest" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });

  service.setPolicy({ actorUserId: host.id, policy: CLUB_POLICY.OPEN });
  const membership = service.inviteMember({ actorUserId: bob.id, userId: carol.id });
  assert.equal(membership.userId, carol.id);
});

test("host can schedule meetup and set theme", () => {
  const { service, host } = bootstrap();
  const scheduled = service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  const themed = service.setMeetupTheme({
    actorUserId: host.id,
    theme: "Soups"
  });

  assert.equal(scheduled.scheduledFor, "2026-04-03T18:30:00.000Z");
  assert.equal(themed.theme, "Soups");
});

test("non-host cannot schedule meetup", () => {
  const { service, host } = bootstrap();
  const bob = service.createUser({ name: "Bob Member" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });

  assert.throws(
    () =>
      service.scheduleUpcomingMeetup({
        actorUserId: bob.id,
        isoDateTime: "2026-05-03T18:30:00.000Z"
      }),
    /Only current host/
  );
});

test("recipe flow: member can add, attendees can view and favorite", () => {
  const { service, host } = bootstrap();
  const bob = service.createUser({ name: "Bob Member" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  service.setMeetupTheme({ actorUserId: host.id, theme: "Breads" });
  const image = makeImage();

  const recipe = service.addRecipe({
    actorUserId: bob.id,
    title: "No-Knead Bread",
    content: "Flour, water, yeast, time.",
    imagePath: image
  });
  const recipes = service.listMeetupRecipes({ actorUserId: host.id });
  const favorite = service.favoriteRecipe({ actorUserId: host.id, recipeId: recipe.id });

  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].title, "No-Knead Bread");
  assert.equal(favorite.recipeId, recipe.id);
});

test("image path must exist when adding recipe", () => {
  const { service, host } = bootstrap();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });

  assert.throws(
    () =>
      service.addRecipe({
        actorUserId: host.id,
        title: "Soup",
        content: "Simmer everything.",
        imagePath: "/not/real/image.jpg"
      }),
    /Image path not found/
  );
});

test("new member gets forward-only cookbook visibility by default", () => {
  const { service, host } = bootstrap();
  const image = makeImage();
  const bob = service.createUser({ name: "Bob Member" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });

  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  service.addRecipe({
    actorUserId: host.id,
    title: "Past Recipe",
    content: "Old one",
    imagePath: image
  });
  const { past } = service.advanceMeetup({ actorUserId: host.id });

  const carol = service.createUser({ name: "Carol New" });
  service.inviteMember({ actorUserId: host.id, userId: carol.id });
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-05-03T18:30:00.000Z"
  });
  service.addRecipe({
    actorUserId: host.id,
    title: "Future Recipe",
    content: "New one",
    imagePath: image
  });

  assert.throws(
    () => service.listMeetupRecipes({ actorUserId: carol.id, meetupId: past.id }),
    /No cookbook access/
  );
  const current = service.listMeetupRecipes({ actorUserId: carol.id });
  assert.equal(current.length, 1);
  assert.equal(current[0].title, "Future Recipe");
});

test("admin/co_admin can grant access to past cookbooks", () => {
  const { service, host } = bootstrap();
  const image = makeImage();
  const bob = service.createUser({ name: "Bob Admin" });
  const carol = service.createUser({ name: "Carol Member" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });
  service.inviteMember({ actorUserId: host.id, userId: carol.id });
  service.setRole({ actorUserId: host.id, userId: bob.id, role: "admin" });

  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  service.addRecipe({
    actorUserId: host.id,
    title: "Tomato Soup",
    content: "Tomatoes, stock.",
    imagePath: image
  });
  const { past } = service.advanceMeetup({ actorUserId: host.id });

  const dave = service.createUser({ name: "Dave Late Joiner" });
  service.inviteMember({ actorUserId: host.id, userId: dave.id });

  assert.throws(
    () => service.listMeetupRecipes({ actorUserId: dave.id, meetupId: past.id }),
    /No cookbook access/
  );

  const grants = service.grantPastCookbookAccess({
    actorUserId: bob.id,
    targetUserId: dave.id,
    all: true
  });
  assert.ok(grants.length > 0);

  const recipes = service.listMeetupRecipes({ actorUserId: dave.id, meetupId: past.id });
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].title, "Tomato Soup");
});

test("notify run returns pending notifications", () => {
  const { service, host } = bootstrap();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  const delivered = service.runNotifications({ now: "2026-03-31T12:00:00.000Z" });
  assert.ok(delivered.length >= 1);
  assert.ok(delivered.every((entry) => entry.deliveredAt === "2026-03-31T12:00:00.000Z"));
});

test("notify run only delivers reminders due by provided timestamp", () => {
  const { service, host } = bootstrap();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-10T18:30:00.000Z"
  });

  const tooEarly = service.runNotifications({ now: "2026-04-01T12:00:00.000Z" });
  const dayBefore = service.runNotifications({ now: "2026-04-09T19:00:00.000Z" });

  assert.equal(tooEarly.length, 1);
  assert.ok(dayBefore.length >= 1);
  assert.ok(dayBefore.every((entry) => Date.parse(entry.dueAt) <= Date.parse("2026-04-09T19:00:00.000Z")));
});

test("rescheduling meetup updates pending reminder dueAt values without duplication", () => {
  const { service, host } = bootstrap();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-10T18:30:00.000Z"
  });
  const beforeCount = service.state.notifications.length;
  const original = service.state.notifications.filter((n) => n.key === "meetup_0h")[0];
  assert.equal(original.dueAt, "2026-04-10T18:30:00.000Z");

  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-12T20:00:00.000Z"
  });
  const afterCount = service.state.notifications.length;
  const updated = service.state.notifications.filter((n) => n.key === "meetup_0h")[0];

  assert.equal(beforeCount, afterCount);
  assert.equal(updated.dueAt, "2026-04-12T20:00:00.000Z");
});

test("host can customize reminder policy windows", () => {
  const { service, host } = bootstrap();
  const policy = service.setReminderPolicy({
    actorUserId: host.id,
    meetupWindowHours: [72, 24, 0],
    recipePromptHours: 36
  });
  assert.deepEqual(policy.meetupWindowHours, [72, 24, 0]);
  assert.equal(policy.recipePromptHours, 36);

  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-10T18:30:00.000Z"
  });
  const keys = service.state.notifications.map((n) => n.key);
  assert.ok(keys.includes("meetup_72h"));
  assert.ok(keys.includes("meetup_24h"));
  assert.ok(keys.includes("meetup_0h"));
  assert.ok(keys.includes("recipe_prompt"));
});

test("host can apply reminder template and non-host cannot", () => {
  const { service, host } = bootstrap();
  const bob = service.createUser({ name: "Bob" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });

  const templates = service.listReminderTemplates();
  assert.ok(templates.some((entry) => entry.name === "light"));

  const applied = service.applyReminderTemplate({ actorUserId: host.id, templateName: "light" });
  assert.equal(applied.template, "light");
  assert.deepEqual(applied.policy.meetupWindowHours, [24, 2, 0]);

  assert.throws(
    () => service.applyReminderTemplate({ actorUserId: bob.id, templateName: "tight" }),
    /Only current host/
  );
});

test("host can add/remove custom reminder templates", () => {
  const { service, host } = bootstrap();
  const added = service.addReminderTemplate({
    actorUserId: host.id,
    name: "weekend_focus",
    meetupWindowHours: [48, 6, 0],
    recipePromptHours: 12
  });
  assert.equal(added.name, "weekend_focus");

  const templates = service.listReminderTemplates();
  assert.ok(templates.some((entry) => entry.name === "weekend_focus" && entry.source === "custom"));

  const applied = service.applyReminderTemplate({
    actorUserId: host.id,
    templateName: "weekend_focus"
  });
  assert.equal(applied.source, "custom");
  assert.deepEqual(applied.policy.meetupWindowHours, [48, 6, 0]);

  const removed = service.removeReminderTemplate({
    actorUserId: host.id,
    name: "weekend_focus"
  });
  assert.equal(removed.removed, "weekend_focus");
  assert.throws(
    () => service.applyReminderTemplate({ actorUserId: host.id, templateName: "weekend_focus" }),
    /Unknown reminder template/
  );
});

test("custom reminder templates can be exported and imported with a prefix", () => {
  const { service, host } = bootstrap();
  service.addReminderTemplate({
    actorUserId: host.id,
    name: "weekend_focus",
    meetupWindowHours: [48, 6, 0],
    recipePromptHours: 12
  });

  const exported = service.exportCustomReminderTemplates();
  const imported = service.importCustomReminderTemplates({
    actorUserId: host.id,
    templates: exported,
    prefix: "shared"
  });

  assert.ok(imported.imported.includes("shared_weekend_focus"));
  assert.equal(imported.skipped.length, 0);
  const templates = service.listReminderTemplates();
  assert.ok(templates.some((entry) => entry.name === "shared_weekend_focus" && entry.source === "custom"));
});

test("built-in reminder templates cannot be overwritten", () => {
  const { service, host } = bootstrap();
  assert.throws(
    () =>
      service.addReminderTemplate({
        actorUserId: host.id,
        name: "standard",
        meetupWindowHours: [1],
        recipePromptHours: 1
      }),
    /Cannot overwrite built-in/
  );
});

test("inviting a member after scheduling creates reminders for the new member", () => {
  const { service, host } = bootstrap();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-10T18:30:00.000Z"
  });
  const bob = service.createUser({ name: "Bob Member" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });

  const bobPending = service.state.notifications.filter((entry) => entry.userId === bob.id);
  assert.ok(bobPending.length >= 5);
  assert.ok(bobPending.some((entry) => entry.key === "recipe_prompt"));
});

test("pending notification listing does not mark notifications delivered", () => {
  const { service, host } = bootstrap();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-10T18:30:00.000Z"
  });

  const listed = service.listPendingNotifications({ now: "2026-04-09T19:00:00.000Z", userId: host.id });
  assert.ok(listed.length >= 1);

  const stillPending = service.state.notifications.filter((entry) => entry.userId === host.id && !entry.deliveredAt);
  assert.ok(stillPending.length >= listed.length);
});

test("pending notification list can be filtered by user", () => {
  const { service, host } = bootstrap();
  const bob = service.createUser({ name: "Bob" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-10T18:30:00.000Z"
  });

  const forHost = service.listPendingNotifications({ userId: host.id });
  const forBob = service.listPendingNotifications({ userId: bob.id });
  assert.ok(forHost.length >= 1);
  assert.ok(forBob.length >= 1);
  assert.ok(forHost.every((entry) => entry.userId === host.id));
  assert.ok(forBob.every((entry) => entry.userId === bob.id));
});

test("notification APIs reject invalid now timestamps", () => {
  const { service } = bootstrap();
  assert.throws(
    () => service.runNotifications({ now: "not-a-date" }),
    /Invalid notification timestamp/
  );
  assert.throws(
    () => service.listPendingNotifications({ now: "still-not-a-date" }),
    /Invalid notification timestamp/
  );
});

test("pending notification list rejects unknown user filter", () => {
  const { service } = bootstrap();
  assert.throws(
    () => service.listPendingNotifications({ userId: "user_999" }),
    /Unknown user/
  );
});

test("favorite can be added to personal cookbook collection", () => {
  const { service, host } = bootstrap();
  const image = makeImage();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  const recipe = service.addRecipe({
    actorUserId: host.id,
    title: "Berry Pie",
    content: "Berries and crust.",
    imagePath: image
  });

  service.addFavoriteToCollection({
    actorUserId: host.id,
    recipeId: recipe.id,
    collectionName: "Desserts"
  });
  const collections = service.listPersonalCollections({ actorUserId: host.id });
  assert.equal(collections.length, 1);
  assert.equal(collections[0].name, "Desserts");
  assert.equal(collections[0].recipes.length, 1);
  assert.equal(collections[0].recipes[0].title, "Berry Pie");
});

test("host transfer updates club host and upcoming meetup host", () => {
  const { service, host } = bootstrap();
  const bob = service.createUser({ name: "Bob Next Host" });
  service.inviteMember({ actorUserId: host.id, userId: bob.id });

  const updated = service.setHost({ actorUserId: host.id, newHostUserId: bob.id });
  const upcoming = service.getUpcomingMeetup();
  const memberships = service.listMembers();

  assert.equal(updated.hostUserId, bob.id);
  assert.equal(upcoming.hostUserId, bob.id);
  assert.equal(memberships.find((m) => m.userId === bob.id)?.role, "host");
  assert.equal(memberships.find((m) => m.userId === host.id)?.role, "member");
});

test("set-role cannot directly change current host role", () => {
  const { service, host } = bootstrap();
  assert.throws(
    () => service.setRole({ actorUserId: host.id, userId: host.id, role: "admin" }),
    /Use host transfer before changing the current host role/
  );
});

test("grant past cookbook access from a specific meetup boundary", () => {
  const { service, host } = bootstrap();
  const image = makeImage();
  const admin = service.createUser({ name: "Admin" });
  const lateUser = service.createUser({ name: "Late User" });
  service.inviteMember({ actorUserId: host.id, userId: admin.id });
  service.setRole({ actorUserId: host.id, userId: admin.id, role: "admin" });

  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  service.addRecipe({
    actorUserId: host.id,
    title: "M1",
    content: "One",
    imagePath: image
  });
  const firstPast = service.advanceMeetup({ actorUserId: host.id }).past;

  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-05-03T18:30:00.000Z"
  });
  service.addRecipe({
    actorUserId: host.id,
    title: "M2",
    content: "Two",
    imagePath: image
  });
  const secondPast = service.advanceMeetup({ actorUserId: host.id }).past;

  service.inviteMember({ actorUserId: host.id, userId: lateUser.id });
  const grants = service.grantPastCookbookAccess({
    actorUserId: admin.id,
    targetUserId: lateUser.id,
    fromMeetupId: secondPast.id
  });

  assert.equal(grants.length, 1);
  assert.equal(grants[0].meetupId, secondPast.id);
  assert.throws(
    () => service.listMeetupRecipes({ actorUserId: lateUser.id, meetupId: firstPast.id }),
    /No cookbook access/
  );
  const visible = service.listMeetupRecipes({ actorUserId: lateUser.id, meetupId: secondPast.id });
  assert.equal(visible.length, 1);
});

test("grant past cookbook access rejects unknown meetup boundary", () => {
  const { service, host } = bootstrap();
  const admin = service.createUser({ name: "Admin" });
  const lateUser = service.createUser({ name: "Late User" });
  service.inviteMember({ actorUserId: host.id, userId: admin.id });
  service.inviteMember({ actorUserId: host.id, userId: lateUser.id });
  service.setRole({ actorUserId: host.id, userId: admin.id, role: "admin" });
  service.advanceMeetup({ actorUserId: host.id });

  assert.throws(
    () =>
      service.grantPastCookbookAccess({
        actorUserId: admin.id,
        targetUserId: lateUser.id,
        fromMeetupId: "meetup_999"
      }),
    /Unknown past meetup/
  );
});

test("service validates required names and recipe text", () => {
  const state = createDefaultState();
  const service = new CookbookClubService(state);
  assert.throws(
    () =>
      service.initClub({
        clubName: "   ",
        hostName: "Alice"
      }),
    /Club name is required/
  );

  const { host } = service.initClub({
    clubName: "Sunday Supper",
    hostName: "Alice"
  });
  assert.throws(
    () => service.createUser({ name: "  " }),
    /User name is required/
  );

  assert.throws(
    () =>
      service.setMeetupTheme({
        actorUserId: host.id,
        theme: "  "
      }),
    /Theme is required/
  );
});

test("meetup list returns history with host details and id lookup", () => {
  const { service, host } = bootstrap();
  service.scheduleUpcomingMeetup({
    actorUserId: host.id,
    isoDateTime: "2026-04-03T18:30:00.000Z"
  });
  const first = service.getUpcomingMeetup();
  service.advanceMeetup({ actorUserId: host.id });

  const list = service.listMeetups();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, first.id);
  assert.equal(list[0].host.name, "Alice Host");

  const lookedUp = service.getMeetupById(first.id);
  assert.equal(lookedUp.id, first.id);
  assert.equal(lookedUp.host.id, host.id);
});
