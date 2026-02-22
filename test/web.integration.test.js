import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCookbookWebServer } from "../src/web/server.js";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_IMAGE = resolve(ROOT_DIR, "test", "fixtures", "test-recipe.jpg");

function startServer(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cookbook-web-"));
  const dataFile = join(dir, "state.json");
  const { server } = createCookbookWebServer({
    dataPath: dataFile,
    storage: "json",
    ...options
  });

  return new Promise((resolveStart) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveStart({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        dataFile
      });
    });
  });
}

async function api(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "content-type": "application/json" },
    ...options
  });

  const body = await response.json();
  return {
    status: response.status,
    body
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
      body: JSON.stringify({ clubName: "Cook Club", hostName: "Alice" })
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.club.name, "Cook Club");

    result = await api(baseUrl, "/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Bob" })
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.id, "user_2");

    result = await api(baseUrl, "/api/members/invite", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "user_1", userId: "user_2" })
    });
    assert.equal(result.status, 201);

    result = await api(baseUrl, "/api/meetup/schedule", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_1",
        isoDateTime: "2026-06-01T18:30:00.000Z"
      })
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.scheduledFor, "2026-06-01T18:30:00.000Z");

    result = await api(baseUrl, "/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        actorUserId: "user_2",
        title: "Smoke Soup",
        content: "Test recipe.",
        imagePath: FIXTURE_IMAGE
      })
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.id, "recipe_1");

    result = await api(baseUrl, "/api/recipes?actorUserId=user_1");
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].title, "Smoke Soup");

    result = await api(baseUrl, "/api/status");
    assert.equal(result.status, 200);
    assert.equal(result.body.initialized, true);
    assert.equal(result.body.counts.upcomingMeetupRecipes, 1);
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
        imagePath: "/missing.jpg"
      })
    });

    assert.equal(result.status, 422);
    assert.match(result.body.error, /Club is not initialized/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
