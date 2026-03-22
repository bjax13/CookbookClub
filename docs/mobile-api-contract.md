# Mobile API Contract (v1)

This document defines the current API usage contract for the React Native app.

## Identity Resolution

Mutating and user-scoped endpoints accept identity in one of two ways:

1. `Authorization: Bearer <token>` from `/api/auth/login`
2. `actorUserId` request body/query parameter (legacy compatibility)

If both token and `actorUserId` are provided, they must match or the server returns `403`.

## Auth Endpoints

- `POST /api/auth/login`
  - body: `{ "userId": "user_1" }`
  - response: `{ "token": "...", "expiresAt": "ISO-8601", "user": { "id": "user_1", "name": "Alice" } }`
- `GET /api/auth/session`
  - header: `Authorization: Bearer <token>`
  - response: `{ "expiresAt": "ISO-8601", "user": { "id": "user_1", "name": "Alice" } }`
- `POST /api/auth/refresh`
  - header: `Authorization: Bearer <token>`
  - response: rotated token payload matching login response
- `POST /api/auth/logout`
  - header: `Authorization: Bearer <token>`
  - response: `{ "ok": true }`

## Core Endpoints Used by Mobile

- `GET /api/status`
- `POST /api/club/init`
- `GET /api/members`
- `POST /api/users`
- `POST /api/members/invite`
- `POST /api/members/remove`
- `GET /api/meetup`
- `POST /api/meetup/schedule`
- `GET /api/recipes` (optional `actorUserId`, optional `meetupId`)
- `POST /api/recipes` (supports `imageDataUrl` + `imageFileName` upload)
- `GET /api/recipe-image?path=<absolute-path>`
- `POST /api/favorites`
- `GET /api/collections`
- `POST /api/collections`
- `GET /api/audit/auth` (host/admin/co_admin only; operational debugging)

## Authorization Expectations

Server-side role checks are enforced regardless of client behavior:

- `invite/remove member`: host/admin/co_admin on closed clubs
- `schedule meetup`: host only
- `set host`: host only
- `purge recipes`: host/admin/co_admin
- `favorites/collections`: authenticated member only

## Error Envelope

Errors return:

```json
{ "error": "Message text" }
```

HTTP status guidance:

- `400`: malformed request payload
- `401`: missing/invalid/expired auth token
- `403`: token actor mismatch
- `429`: login rate limit exceeded
- `404`: unknown endpoint/resource
- `422`: domain validation or business-rule failures
