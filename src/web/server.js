import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CookbookClubService } from "../service.js";
import { loadState, resolveDataFile, saveState } from "../storage.js";

const PUBLIC_DIR = fileURLToPath(new URL("./public", import.meta.url));
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 30;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_AUTH_AUDIT_LIMIT = 500;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function text(res, statusCode, message) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`${message}\n`);
}

function sendFile(res, filePath) {
  if (!existsSync(filePath)) {
    text(res, 404, "Not found.");
    return;
  }
  const mimeType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "content-type": mimeType,
    "cache-control": "no-store",
  });
  res.end(body);
}

function isPathInsideDirectory({ candidatePath, allowedDirectory }) {
  if (!isAbsolute(candidatePath)) return false;
  const normalizedCandidate = resolve(candidatePath);
  const normalizedAllowed = resolve(allowedDirectory);
  const rel = relative(normalizedAllowed, normalizedCandidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
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

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function bearerTokenFromRequest(req) {
  const value = req.headers.authorization || "";
  const match = String(value).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function getValidSession(app, token) {
  if (!token) return null;
  const session = app.sessions.get(token);
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    app.sessions.delete(token);
    return null;
  }
  return session;
}

function createSession(app, userId) {
  const token = randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + app.authSessionTtlMs).toISOString();
  const session = { userId, createdAt, expiresAt };
  app.sessions.set(token, session);
  return {
    token,
    ...session,
  };
}

function resolveActorFromAuth(app, req) {
  const token = bearerTokenFromRequest(req);
  if (!token) return null;
  const session = getValidSession(app, token);
  if (!session) throw httpError(401, "Invalid or expired auth token.");
  return session.userId;
}

function resolveActorUserId({ app, req, bodyUserId = null, queryUserId = null }) {
  const actorFromAuth = resolveActorFromAuth(app, req);
  if (bodyUserId) {
    const requestedUserId = String(bodyUserId);
    if (actorFromAuth && actorFromAuth !== requestedUserId) {
      throw httpError(403, "Actor user id does not match authenticated session.");
    }
    return requestedUserId;
  }
  if (queryUserId) {
    const requestedUserId = String(queryUserId);
    if (actorFromAuth && actorFromAuth !== requestedUserId) {
      throw httpError(403, "Actor user id does not match authenticated session.");
    }
    return requestedUserId;
  }
  if (actorFromAuth) return actorFromAuth;
  throw httpError(401, "Missing actor user identity. Provide actorUserId or Bearer token.");
}

function enforceLoginRateLimit(app, req) {
  const remoteIp = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowStart = now - app.loginRateLimitWindowMs;
  const history = app.loginAttemptsByIp.get(remoteIp) || [];
  const recent = history.filter((timestamp) => timestamp >= windowStart);
  if (recent.length >= app.loginRateLimitMax) {
    throw httpError(429, "Too many login attempts. Please try again later.");
  }
  recent.push(now);
  app.loginAttemptsByIp.set(remoteIp, recent);
}

function appendAuthAudit(app, event) {
  app.authAuditEvents.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  });
  if (app.authAuditEvents.length > app.authAuditLimit) {
    app.authAuditEvents.splice(0, app.authAuditEvents.length - app.authAuditLimit);
  }
}

function imageExtensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".img";
}

function saveUploadedImage({ filePath, imageDataUrl, imageFileName }) {
  if (!imageDataUrl) return null;
  const match = String(imageDataUrl).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image upload payload.");
  const mimeType = match[1];
  const rawBase64 = match[2];
  const bytes = Buffer.from(rawBase64, "base64");
  const uploadDir = join(dirname(filePath), "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const candidateExt = extname(String(imageFileName || "")).toLowerCase();
  const ext = candidateExt || imageExtensionForMime(mimeType);
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
  const absolute = join(uploadDir, unique);
  writeFileSync(absolute, bytes);
  return absolute;
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
      "cache-control": "no-store",
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
        pendingNotifications,
      },
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
      membershipPolicy: club.membershipPolicy,
    },
    host: {
      id: host.id,
      name: host.name,
    },
    upcomingMeetup: upcoming
      ? {
          id: upcoming.id,
          scheduledFor: upcoming.scheduledFor,
          theme: upcoming.theme,
          status: upcoming.status,
        }
      : null,
    counts: {
      members: memberCount,
      recipes: clubRecipeCount,
      upcomingMeetupRecipes: upcomingRecipeCount,
      pendingNotifications,
    },
  };
}

function mutateState(app, action) {
  const service = new CookbookClubService(app.state);
  const result = action(service);
  saveState(app.filePath, app.state, app.storage);
  return result;
}

export function createCookbookWebServer({
  dataPath = null,
  storage = "json",
  authSessionTtlMs = DEFAULT_SESSION_TTL_MS,
  loginRateLimitMax = DEFAULT_LOGIN_RATE_LIMIT_MAX,
  loginRateLimitWindowMs = DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
  authAuditLimit = DEFAULT_AUTH_AUDIT_LIMIT,
} = {}) {
  if (!["json", "sqlite"].includes(storage)) {
    throw new Error("Invalid storage backend. Use `json` or `sqlite`.");
  }

  const filePath = resolveDataFile(dataPath, storage);
  const app = {
    storage,
    filePath,
    state: loadState(filePath, storage),
    sessions: new Map(),
    authSessionTtlMs,
    loginAttemptsByIp: new Map(),
    loginRateLimitMax,
    loginRateLimitWindowMs,
    authAuditLimit,
    authAuditEvents: [],
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

      if (pathname === "/api/auth/login" && method === "POST") {
        try {
          enforceLoginRateLimit(app, req);
        } catch (error) {
          appendAuthAudit(app, {
            type: "auth.login.rate_limited",
            remoteIp: req.socket.remoteAddress || "unknown",
          });
          throw error;
        }
        const body = await readBody(req);
        if (!body.userId) {
          throw httpError(400, "Missing userId.");
        }
        const user = app.state.users.find((entry) => entry.id === body.userId);
        if (!user) {
          throw httpError(404, `Unknown user: ${body.userId}`);
        }
        const session = createSession(app, user.id);
        appendAuthAudit(app, {
          type: "auth.login.success",
          userId: user.id,
          remoteIp: req.socket.remoteAddress || "unknown",
          tokenExpiresAt: session.expiresAt,
        });
        json(res, 200, {
          token: session.token,
          expiresAt: session.expiresAt,
          user: {
            id: user.id,
            name: user.name,
          },
        });
        return;
      }

      if (pathname === "/api/auth/session" && method === "GET") {
        const token = bearerTokenFromRequest(req);
        const session = getValidSession(app, token);
        if (!session) {
          throw httpError(401, "Invalid or expired auth token.");
        }
        const actorUserId = session.userId;
        const user = app.state.users.find((entry) => entry.id === actorUserId);
        if (!user) {
          throw httpError(404, `Unknown user: ${actorUserId}`);
        }
        json(res, 200, {
          expiresAt: session.expiresAt,
          user: {
            id: user.id,
            name: user.name,
          },
        });
        return;
      }

      if (pathname === "/api/auth/refresh" && method === "POST") {
        const token = bearerTokenFromRequest(req);
        const session = getValidSession(app, token);
        if (!session) {
          appendAuthAudit(app, {
            type: "auth.refresh.failed",
            reason: "invalid_or_expired_token",
            remoteIp: req.socket.remoteAddress || "unknown",
          });
          throw httpError(401, "Invalid or expired auth token.");
        }
        app.sessions.delete(token);
        const refreshedSession = createSession(app, session.userId);
        appendAuthAudit(app, {
          type: "auth.refresh.success",
          userId: session.userId,
          remoteIp: req.socket.remoteAddress || "unknown",
          tokenExpiresAt: refreshedSession.expiresAt,
        });
        const user = app.state.users.find((entry) => entry.id === session.userId);
        json(res, 200, {
          token: refreshedSession.token,
          expiresAt: refreshedSession.expiresAt,
          user: user
            ? {
                id: user.id,
                name: user.name,
              }
            : {
                id: session.userId,
                name: session.userId,
              },
        });
        return;
      }

      if (pathname === "/api/auth/logout" && method === "POST") {
        const token = bearerTokenFromRequest(req);
        const session = getValidSession(app, token);
        if (!session) {
          appendAuthAudit(app, {
            type: "auth.logout.failed",
            reason: "invalid_or_expired_token",
            remoteIp: req.socket.remoteAddress || "unknown",
          });
          throw httpError(401, "Invalid or expired auth token.");
        }
        app.sessions.delete(token);
        appendAuthAudit(app, {
          type: "auth.logout.success",
          userId: session.userId,
          remoteIp: req.socket.remoteAddress || "unknown",
        });
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/audit/auth" && method === "GET") {
        const actorUserId = resolveActorUserId({
          app,
          req,
          queryUserId: url.searchParams.get("actorUserId"),
        });
        const service = new CookbookClubService(app.state);
        service.assertAdminOrCoAdmin(actorUserId);
        json(res, 200, app.authAuditEvents);
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
            hostPhone: body.hostPhone || null,
          }),
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
            phone: body.phone || null,
          }),
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/members/invite" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const payload = mutateState(app, (service) =>
          service.inviteMember({
            actorUserId,
            userId: body.userId,
            role: body.role || "member",
          }),
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/members/remove" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const payload = mutateState(app, (service) =>
          service.removeMember({
            actorUserId,
            userId: body.userId,
          }),
        );
        json(res, 200, payload);
        return;
      }

      if (pathname === "/api/members" && method === "GET") {
        if (!app.state.clubs.length) {
          json(res, 200, []);
          return;
        }
        const service = new CookbookClubService(app.state);
        json(res, 200, service.listMembers());
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

      if (pathname === "/api/host/set" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const payload = mutateState(app, (service) =>
          service.setHost({
            actorUserId,
            newHostUserId: body.newHostUserId,
          }),
        );
        json(res, 200, payload);
        return;
      }

      if (pathname === "/api/meetup/schedule" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const payload = mutateState(app, (service) =>
          service.scheduleUpcomingMeetup({
            actorUserId,
            isoDateTime: body.isoDateTime,
          }),
        );
        json(res, 200, payload);
        return;
      }

      if (pathname === "/api/recipes" && method === "GET") {
        const actorUserId = resolveActorUserId({
          app,
          req,
          queryUserId: url.searchParams.get("actorUserId"),
        });
        const meetupId = url.searchParams.get("meetupId");
        const service = new CookbookClubService(app.state);
        json(res, 200, service.listMeetupRecipes({ actorUserId, meetupId }));
        return;
      }

      if (pathname === "/api/recipe-image" && method === "GET") {
        const imagePath = url.searchParams.get("path");
        if (!imagePath) {
          json(res, 400, { error: "Missing path query parameter." });
          return;
        }
        const uploadDir = join(dirname(app.filePath), "uploads");
        if (!isPathInsideDirectory({ candidatePath: imagePath, allowedDirectory: uploadDir })) {
          json(res, 403, { error: "Image path is not allowed." });
          return;
        }
        sendFile(res, imagePath);
        return;
      }

      if (pathname === "/api/recipes" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const uploadedImagePath = saveUploadedImage({
          filePath: app.filePath,
          imageDataUrl: body.imageDataUrl,
          imageFileName: body.imageFileName,
        });
        const payload = mutateState(app, (service) =>
          service.addRecipe({
            actorUserId,
            name: body.name,
            title: body.title,
            description: body.description,
            content: body.content,
            image: body.image,
            imagePath: uploadedImagePath || body.imagePath,
            recipeIngredient: body.recipeIngredient,
            recipeInstructions: body.recipeInstructions,
            prepTime: body.prepTime,
            cookTime: body.cookTime,
            totalTime: body.totalTime,
            recipeYield: body.recipeYield,
            recipeCategory: body.recipeCategory,
            recipeCuisine: body.recipeCuisine,
            keywords: body.keywords,
            nutrition: body.nutrition,
          }),
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/favorites" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const payload = mutateState(app, (service) =>
          service.favoriteRecipe({
            actorUserId,
            recipeId: body.recipeId,
          }),
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/collections" && method === "GET") {
        const actorUserId = resolveActorUserId({
          app,
          req,
          queryUserId: url.searchParams.get("actorUserId"),
        });
        const service = new CookbookClubService(app.state);
        json(res, 200, service.listPersonalCollections({ actorUserId }));
        return;
      }

      if (pathname === "/api/collections" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const payload = mutateState(app, (service) =>
          service.addFavoriteToCollection({
            actorUserId,
            recipeId: body.recipeId,
            collectionName: body.collectionName || "Favorites",
          }),
        );
        json(res, 201, payload);
        return;
      }

      if (pathname === "/api/recipes/purge" && method === "POST") {
        const body = await readBody(req);
        const actorUserId = resolveActorUserId({ app, req, bodyUserId: body.actorUserId });
        const payload = mutateState(app, (service) =>
          service.purgeRecipes({
            actorUserId,
            mode: body.mode || "all",
          }),
        );
        json(res, 200, payload);
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
        error.statusCode ||
        (error.message.includes("Invalid JSON") || error.message.includes("Missing") ? 400 : 422);
      json(res, statusCode, { error: error.message });
    }
  });

  return {
    server,
    filePath,
    storage,
  };
}
