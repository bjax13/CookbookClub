# Cookbook Club Mobile

React Native (Expo) app for Cookbook Club, wired to the existing API server.

## Prerequisites

- Node.js 24+
- Existing server running from repo root:

```bash
npm run start:web -- --port 4173 --host 0.0.0.0 --data ./data/mobile-state.json
```

## Configure API URL

Set `EXPO_PUBLIC_API_BASE_URL` before starting the app.

Examples:

- iOS simulator: `http://127.0.0.1:4173`
- Android emulator: `http://10.0.2.2:4173`
- Physical device: `http://<your-lan-ip>:4173`

## Run

```bash
cd /Users/bryanjackson/Documents/code/CookbookClub/apps/mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4173 npm run start
```

## Vertical Slice Supported

- Initialize club
- Set active actor user id
- Login/logout token session (`/api/auth/*`)
- Refresh rotating auth token session (`/api/auth/refresh`)
- Invite/remove members
- Schedule meetup
- Submit recipe with image upload
- Capture recipe photos directly from camera (Expo Image Picker)
- List recipe cookbook for actor
- Save recipes into personal collections (Favorites)
- Automatic token refresh + retry on `401` for authenticated API requests
- Startup session validation to clear stale/expired tokens

## Recipe Image Capture Notes

- In `Recipes`, you can either `Select Image` (photo library) or `Take Photo` (camera).
- On iOS Simulator, camera capture is typically unavailable; use `Select Image` there.
- If camera or photo access is blocked, re-enable permissions in device Settings and retry.
