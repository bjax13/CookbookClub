import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCookbookWebServer } from "../src/web/server.js";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_IMAGE = resolve(ROOT_DIR, "test", "fixtures", "test-recipe.jpg");
const TEST_UPLOAD_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Lx6sAAAAASUVORK5CYII=";

function startServer(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-web-"));
  const dataFile = join(dir, "state.json");
  const { server } = createCookbookWebServer({
    dataPath: dataFile,
    storage: "json",
    ...options,
  });

  return new Promise((resolveStart) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveStart({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        dataFile,
      });
    });
  });
}

async function api(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const body = await response.json();
  return {
    status: response.status,
    body,
  };
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
  };
}

test("web server serves app shell and health endpoint", async () => {
  const { server, baseUrl } = await startServer();

  try {
    const home = await fetch(baseUrl);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Web MVP Control Panel/);

    const health = await api(baseUrl, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web API supports core setup and recipe flow", async () => {
  const { server, baseUrl } = await startServer();

  try {
    let result = await api(baseUrl, "/api/status");
    assert.equal(result.status, 200);
    assert.equal(result.body.initialized, false);

    result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.club.name, "Cook Club");

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Bob" }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.id, "user_2");

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", userId: "user_2" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/members");
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 2);
    assert.equal(result.body[1].user.name, "Bob");

    result = await api(baseUrl, "/api/meetup/schedule", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        isoDateTime: "2026-06-01T18:30:00.000Z",
      }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.scheduledFor, "2026-06-01T18:30:00.000Z");

    result = await api(baseUrl, "/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_2",
        title: "Smoke Soup",
        content: "Test recipe.",
        recipeIngredient: ["smoke", "stock"],
        recipeInstructions: [{ text: "Simmer." }],
        imageDataUrl: TEST_UPLOAD_IMAGE_DATA_URL,
        imageFileName: "smoke-soup.png",
      }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.id, "recipe_1");
    assert.equal(result.body.name, "Smoke Soup");
    assert.equal(result.body.recipeIngredient.length, 2);
    assert.match(result.body.imagePath, /uploads/);

    result = await api(baseUrl, "/api/recipes?actorUserId=user_1");
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].title, "Smoke Soup");

    const imageResponse = await fetch(
      `${baseUrl}/api/recipe-image?path=${encodeURIComponent(result.body[0].imagePath)}`,
    );
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("content-type"), "image/png");

    const blockedImage = await fetch(
      `${baseUrl}/api/recipe-image?path=${encodeURIComponent(FIXTURE_IMAGE)}`,
    );
    assert.equal(blockedImage.status, 403);
    const blockedPayload = await blockedImage.json();
    assert.match(blockedPayload.error, /not allowed/);

    const traversalAttempt = await fetch(
      `${baseUrl}/api/recipe-image?path=${encodeURIComponent("../fixtures/test-recipe.jpg")}`,
    );
    assert.equal(traversalAttempt.status, 403);
    const traversalPayload = await traversalAttempt.json();
    assert.match(traversalPayload.error, /not allowed/);

    result = await api(baseUrl, "/api/status");
    assert.equal(result.status, 200);
    assert.equal(result.body.initialized, true);
    assert.equal(result.body.counts.upcomingMeetupRecipes, 1);

    result = await api(baseUrl, "/api/host/set", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", newHostUserId: "user_2" }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.hostUserId, "user_2");

    result = await api(baseUrl, "/api/members/remove", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_2", userId: "user_1" }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.userId, "user_1");

    result = await api(baseUrl, "/api/members");
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web API returns validation errors as 4xx", async () => {
  const { server, baseUrl } = await startServer();

  try {
    const result = await api(baseUrl, "/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        title: "",
        content: "",
        imagePath: "/missing.jpg",
      }),
    });

    assert.equal(result.status, 422);
    assert.match(result.body.error, /Club is not initialized/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web API can purge all recipes", async () => {
  const { server, baseUrl } = await startServer();

  try {
    let result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/meetup/schedule", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        isoDateTime: "2026-06-01T18:30:00.000Z",
      }),
    });
    assert.equal(result.status, 200);

    result = await api(baseUrl, "/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        title: "Purge Me",
        content: "Test recipe.",
        imagePath: FIXTURE_IMAGE,
      }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/recipes/purge", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        mode: "all",
      }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.removedCount, 1);

    result = await api(baseUrl, "/api/recipes?actorUserId=user_1");
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 0);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web API supports auth token actor resolution and personal collections", async () => {
  const { server, baseUrl } = await startServer();

  try {
    let result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/meetup/schedule", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        isoDateTime: "2026-06-01T18:30:00.000Z",
      }),
    });
    assert.equal(result.status, 200);

    result = await api(baseUrl, "/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        title: "Token Soup",
        content: "Test recipe.",
        imagePath: FIXTURE_IMAGE,
      }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.id, "recipe_1");

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_1" }),
    });
    assert.equal(result.status, 200);
    const { token } = result.body;
    assert.ok(token);

    const loginToken = token;

    result = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      headers: authHeaders(loginToken),
    });
    assert.equal(result.status, 200);
    assert.ok(result.body.token);
    assert.notEqual(result.body.token, loginToken);
    const refreshedToken = result.body.token;

    result = await api(baseUrl, "/api/recipes", {
      headers: authHeaders(loginToken),
    });
    assert.equal(result.status, 401);
    assert.match(result.body.error, /Invalid or expired auth token/);

    result = await api(baseUrl, "/api/recipes", {
      headers: authHeaders(refreshedToken),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);

    result = await api(baseUrl, "/api/collections", {
      method: "POST",
      headers: authHeaders(refreshedToken),
      body: JSON.stringify({
        recipeId: "recipe_1",
        collectionName: "Favorites",
      }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.recipeId, "recipe_1");

    result = await api(baseUrl, "/api/collections", {
      headers: authHeaders(refreshedToken),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].name, "Favorites");
    assert.equal(result.body[0].recipes.length, 1);

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Bob" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/recipes?actorUserId=user_2", {
      headers: authHeaders(refreshedToken),
    });
    assert.equal(result.status, 403);
    assert.match(result.body.error, /does not match authenticated session/);

    result = await api(baseUrl, "/api/auth/logout", {
      method: "POST",
      headers: authHeaders(refreshedToken),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);

    result = await api(baseUrl, "/api/collections", {
      headers: authHeaders(refreshedToken),
    });
    assert.equal(result.status, 401);
    assert.match(result.body.error, /Invalid or expired auth token/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web auth token expires based on configured session ttl", async () => {
  const { server, baseUrl } = await startServer({ authSessionTtlMs: 1 });

  try {
    let result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_1" }),
    });
    assert.equal(result.status, 200);
    const token = result.body.token;
    assert.ok(token);

    await new Promise((resolveWait) => setTimeout(resolveWait, 10));

    result = await api(baseUrl, "/api/auth/session", {
      headers: authHeaders(token),
    });
    assert.equal(result.status, 401);
    assert.match(result.body.error, /Invalid or expired auth token/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web API enforces host-only action under token identity", async () => {
  const { server, baseUrl } = await startServer();

  try {
    let result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Bob" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", userId: "user_2" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_2" }),
    });
    assert.equal(result.status, 200);
    const token = result.body.token;
    assert.ok(token);

    result = await api(baseUrl, "/api/meetup/schedule", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        isoDateTime: "2026-07-01T18:30:00.000Z",
      }),
    });
    assert.equal(result.status, 422);
    assert.match(result.body.error, /Only current host can perform this action/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web auth login endpoint enforces rate limiting", async () => {
  const { server, baseUrl } = await startServer({
    loginRateLimitMax: 2,
    loginRateLimitWindowMs: 60 * 1000,
  });

  try {
    let result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_1" }),
    });
    assert.equal(result.status, 200);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_1" }),
    });
    assert.equal(result.status, 200);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_1" }),
    });
    assert.equal(result.status, 429);
    assert.match(result.body.error, /Too many login attempts/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web API role matrix is enforced for token-authenticated users", async () => {
  const { server, baseUrl } = await startServer();

  try {
    let result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Admin User" }),
    });
    assert.equal(result.status, 201);
    const adminId = result.body.id;

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "CoAdmin User" }),
    });
    assert.equal(result.status, 201);
    const coAdminId = result.body.id;

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Member User" }),
    });
    assert.equal(result.status, 201);
    const memberId = result.body.id;

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", userId: adminId, role: "admin" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", userId: coAdminId, role: "co_admin" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", userId: memberId, role: "member" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: adminId }),
    });
    assert.equal(result.status, 200);
    const adminToken = result.body.token;

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: coAdminId }),
    });
    assert.equal(result.status, 200);
    const coAdminToken = result.body.token;

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: memberId }),
    });
    assert.equal(result.status, 200);
    const memberToken = result.body.token;

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Invitee" }),
    });
    assert.equal(result.status, 201);
    const inviteeId = result.body.id;

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({ userId: inviteeId }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.userId, inviteeId);

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Blocked Invitee" }),
    });
    assert.equal(result.status, 201);
    const blockedInviteeId = result.body.id;

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      headers: authHeaders(memberToken),
      body: JSON.stringify({ userId: blockedInviteeId }),
    });
    assert.equal(result.status, 422);
    assert.match(result.body.error, /Club is closed/);

    result = await api(baseUrl, "/api/recipes/purge", {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({ mode: "all" }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.removedCount, 0);

    result = await api(baseUrl, "/api/recipes/purge", {
      method: "POST",
      headers: authHeaders(memberToken),
      body: JSON.stringify({ mode: "all" }),
    });
    assert.equal(result.status, 422);
    assert.match(result.body.error, /Only host\/admin\/co_admin/);

    result = await api(baseUrl, "/api/members/remove", {
      method: "POST",
      headers: authHeaders(coAdminToken),
      body: JSON.stringify({ userId: memberId }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.userId, memberId);

    result = await api(baseUrl, "/api/host/set", {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({ newHostUserId: adminId }),
    });
    assert.equal(result.status, 422);
    assert.match(result.body.error, /Only current host can perform this action/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("web auth audit endpoint records events and enforces access control", async () => {
  const { server, baseUrl } = await startServer();

  try {
    let result = await api(baseUrl, "/api/club/init", {
      method: "POST",
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_1" }),
    });
    assert.equal(result.status, 200);
    const firstHostToken = result.body.token;

    result = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      headers: authHeaders(firstHostToken),
    });
    assert.equal(result.status, 200);
    const refreshedHostToken = result.body.token;

    result = await api(baseUrl, "/api/auth/logout", {
      method: "POST",
      headers: authHeaders(refreshedHostToken),
    });
    assert.equal(result.status, 200);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: "user_1" }),
    });
    assert.equal(result.status, 200);
    const hostToken = result.body.token;

    result = await api(baseUrl, "/api/audit/auth", {
      headers: authHeaders(hostToken),
    });
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.body));
    assert.ok(result.body.some((entry) => entry.type === "auth.login.success"));
    assert.ok(result.body.some((entry) => entry.type === "auth.refresh.success"));
    assert.ok(result.body.some((entry) => entry.type === "auth.logout.success"));

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Member User" }),
    });
    assert.equal(result.status, 201);
    const memberId = result.body.id;

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", userId: memberId, role: "member" }),
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ userId: memberId }),
    });
    assert.equal(result.status, 200);
    const memberToken = result.body.token;

    result = await api(baseUrl, "/api/audit/auth", {
      headers: authHeaders(memberToken),
    });
    assert.equal(result.status, 422);
    assert.match(result.body.error, /Only host\/admin\/co_admin/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
