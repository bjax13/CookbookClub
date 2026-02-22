import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { CookbookClubService } from "../service.js";
import { loadState, resolveDataFile, saveState } from "../storage.js";

const PUBLIC_DIR = fileURLToPath(new URL("./public", import.meta.url));
const MAX_BODY_BYTES = 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function text(res, statusCode, message) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(`${message}\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function sendStaticFile(res, pathname) {
  const cleanPath = normalize(pathname).replace(/^\/+/, "");
  const localPath = cleanPath === "" ? "index.html" : cleanPath;
  const filePath = join(PUBLIC_DIR, localPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    text(res, 404, "Not found.");
    return;
  }

  try {
    const body = readFileSync(filePath);
    const mimeType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": mimeType,
      "cache-control": "no-store"
    });
    res.end(body);
  } catch {
    text(res, 404, "Not found.");
  }
}

function buildStatus(state, service, storage, filePath) {
  const pendingNotifications = state.notifications.filter((entry) => !entry.deliveredAt).length;
  if (!state.clubs.length) {
    return {
      initialized: false,
      storage,
      dataFile: filePath,
      counts: {
        users: state.users.length,
        pendingNotifications
      }
    };
  }

  const { club, host, upcoming } = service.showClub();
  const memberCount = state.memberships.filter((entry) => entry.clubId === club.id).length;
  const clubRecipeCount = state.recipes.filter((entry) => entry.clubId === club.id).length;
  const upcomingRecipeCount = upcoming
    ? state.recipes.filter((entry) => entry.meetupId === upcoming.id).length
    : 0;

  return {
    initialized: true,
    storage,
    dataFile: filePath,
    club: {
      id: club.id,
      name: club.name,
      membershipPolicy: club.membershipPolicy
    },
    host: {
      id: host.id,
      name: host.name
    },
    upcomingMeetup: upcoming
      ? {
          id: upcoming.id,
          scheduledFor: upcoming.scheduledFor,
          theme: upcoming.theme,
          status: upcoming.status
        }
      : null,
    counts: {
      members: memberCount,
      recipes: clubRecipeCount,
      upcomingMeetupRecipes: upcomingRecipeCount,
      pendingNotifications
    }
  };
}

function mutateState(app, action) {
  const service = new CookbookClubService(app.state);
  const result = action(service);
  saveState(app.filePath, app.state, app.storage);
  return result;
}

export function createCookbookWebServer({ dataPath = null, storage = "json" } = {}) {
  if (!["json", "sqlite"].includes(storage)) {
    throw new Error("Invalid storage backend. Use `json` or `sqlite`.");
  }

  const filePath = resolveDataFile(dataPath, storage);
  const app = {
    storage,
    filePath,
    state: loadState(filePath, storage)
  };

  const server = createServer(async (req, res) => {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    try {
      if (pathname === "/health") {
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/status" && method === "GET") {
        const service = new CookbookClubService(app.state);
        json(res, 200, buildStatus(app.state, service, app.storage, app.filePath));
        return;
      }

      if (pathname === "/api/club" && method === "GET") {
        if (!app.state.clubs.length) {
          json(res, 404, { error: "Club is not initialized." });
          return;
        }
        const service = new CookbookClubService(app.state);
        json(res, 200, service.showClub());
        return;
      }

      if (pathname === "/api/club/init" && method === "POST") {
        const body = await readBody(req);
        const payload = mutateState(app, (service) =>
          service.initClub({
            clubName: body.clubName,
            hostName: body.hostName,
            hostEmail: body.hostEmail || null,
            hostPhone: body.hostPhone || null
          })
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/users" && method === "POST") {
        const body = await readBody(req);
        const payload = mutateState(app, (service) =>
          service.createUser({
            name: body.name,
            email: body.email || null,
            phone: body.phone || null
          })
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/members/invite" && method === "POST") {
        const body = await readBody(req);
        const payload = mutateState(app, (service) =>
          service.inviteMember({
            actorUserId: body.actorUserId,
            userId: body.userId,
            role: body.role || "member"
          })
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/meetup" && method === "GET") {
        if (!app.state.clubs.length) {
          json(res, 404, { error: "Club is not initialized." });
          return;
        }
        const service = new CookbookClubService(app.state);
        json(res, 200, service.getUpcomingMeetup());
        return;
      }

      if (pathname === "/api/meetup/schedule" && method === "POST") {
        const body = await readBody(req);
        const payload = mutateState(app, (service) =>
          service.scheduleUpcomingMeetup({
            actorUserId: body.actorUserId,
            isoDateTime: body.isoDateTime
          })
        );
        json(res, 200, payload);
        return;
      }

      if (pathname === "/api/recipes" && method === "GET") {
        const actorUserId = url.searchParams.get("actorUserId");
        if (!actorUserId) {
          json(res, 400, { error: "Missing actorUserId query parameter." });
          return;
        }
        const service = new CookbookClubService(app.state);
        json(res, 200, service.listMeetupRecipes({ actorUserId }));
        return;
      }

      if (pathname === "/api/recipes" && method === "POST") {
        const body = await readBody(req);
        const payload = mutateState(app, (service) =>
          service.addRecipe({
            actorUserId: body.actorUserId,
            title: body.title,
            content: body.content,
            imagePath: body.imagePath
          })
        );
        json(res, 201, payload);
        return;
      }

      if (pathname.startsWith("/api/")) {
        json(res, 404, { error: `Unknown API endpoint: ${pathname}` });
        return;
      }

      if (method !== "GET") {
        text(res, 405, "Method not allowed.");
        return;
      }

      sendStaticFile(res, pathname);
    } catch (error) {
      const statusCode =
        error.message.includes("Invalid JSON") || error.message.includes("Missing") ? 400 : 422;
      json(res, statusCode, { error: error.message });
    }
  });

  return {
    server,
    filePath,
    storage
  };
}
