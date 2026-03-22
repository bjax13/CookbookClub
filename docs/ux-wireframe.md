# Cookbook Club Web UX Wireframe (User-Friendly v1)

## Goal

Move the web app from a developer control panel to a member-friendly product UI with clear actions, plain language, and minimal technical inputs.

## UX Principles

- Hide system IDs (`user_1`, `meetup_1`) from normal users.
- Use task language ("Invite member", "Submit recipe") instead of API language.
- Prioritize the next action on each screen.
- Keep core flows to 1-3 steps.
- Preserve power/admin actions, but place them in Settings/Admin areas.

## Delivery Constraints (Current Stack)

- Identity is currently `actorUserId` or Bearer auth token from `/api/auth/*`.
- Current web UI does not implement auth session flows yet.
- Some desired host/admin actions exist in service logic but are not exposed in web API routes.
- Therefore, UX rollout must be staged with explicit backend/API gates.

## Primary Personas

- Host/Admin: sets meetup, invites members, manages reminders and access.
- Member: views upcoming meetup, submits recipes, browses cookbook, saves favorites.

## Information Architecture

Top navigation:

1. Dashboard
2. Meetup
3. Recipes
4. Members
5. My Cookbook
6. Settings

Reality for v1:

- Keep `Settings` and `My Cookbook` visible.
- Show unavailable features with "Coming soon" only when route/API is not implemented.

## Global Layout

Desktop:

```text
+----------------------------------------------------------------------------------+
| Cookbook Club                           [Search]              [Profile Menu]     |
+----------------------------------------------------------------------------------+
| Dashboard | Meetup | Recipes | Members | My Cookbook | Settings                 |
+----------------------------------------------------------------------------------+
| Page header: Title + short guidance + primary CTA                               |
|----------------------------------------------------------------------------------|
| Main content (cards/lists/forms)                                                 |
+----------------------------------------------------------------------------------+
```

Mobile:

- Top bar with page title + action button.
- Bottom tab bar: Dashboard, Meetup, Recipes, Members, My Cookbook.
- Settings under profile menu.

## Screen Wireframes

### 1) Dashboard (Landing)

Purpose: one-page status and "what should I do next?"

```text
[Upcoming Meetup Card]
- Date/time
- Theme
- Host
- CTA: View Meetup

[Recipe Progress Card]
- "6 of 9 members submitted"
- CTA: Submit Recipe (member)

[Members Snapshot Card]
- Member count
- New invites pending
- CTA: Manage Members

[Recent Activity]
- Defer until activity endpoint exists
```

Primary CTA:

- Member: `Submit Recipe`
- Host: `Manage Upcoming Meetup`

### 2) Meetup

Purpose: configure and view current meetup details.

```text
[Meetup Summary]
- Scheduled date/time
- Theme
- Host
- Attendees

[Actions]
- Edit date/time
- Edit theme (requires web API route)
- Transfer host (host/admin only)
- Advance meetup (host/admin only, requires web API route)
```

Design notes:

- Replace ISO timestamps with local date/time picker.
- Show timezone explicitly.

### 3) Recipes

Purpose: submit and browse recipes for upcoming meetup.

```text
[Header]
Title: Recipes
Actions: [Submit Recipe] [Filter]

[Recipe List/Grid]
- Recipe card image
- Title + author
- Time/yield/category chips
- Favorite button
- Open details
```

Recipe submission form (progressive):

1. Required: Title, Description, Image
2. Optional section: Ingredients, Steps, times, tags
3. Submit confirmation

### 4) Members

Purpose: invite, view, and manage member roles.

```text
[Member List]
- Avatar/initials
- Name
- Role badge (Host/Admin/Co-admin/Member)
- Status (Active/Invited)

[Actions]
- Invite Member
- Change Role (admin-only, requires web API route)
- Remove Member (admin-only)
```

Invite flow:

- Input only member name (and email later if added).
- No manual actor/user ID entry.

### 5) My Cookbook

Purpose: personal saved recipes and favorites.

```text
[Collections]
- Favorites
- Custom collections (optional v2)

[Saved Recipe Cards]
- Same recipe visual card pattern as Recipes
- Quick remove/save actions
```

### 6) Settings

Purpose: less-frequent and admin operations.

Sections:

- Club profile (name, policy open/closed)
- Reminder settings/templates (requires web API routes)
- About/version

## Identity and Access UX

Ship this before hiding actor IDs:

1. Add a lightweight "Active User" control in header (name + resolved `userId`).
2. Persist selected active user locally in web app state.
3. Use active user for all requests that currently require `actorUserId`.
4. Add optional sign-in flow using `/api/auth/login` and token storage.
5. Because login currently requires `userId`, provide a member picker (`/api/members`) that maps name -> `userId` for sign-in.
6. Once token-based flow is stable, remove raw `actorUserId` inputs from all forms.

Actor field removal acceptance criteria:

- 100% of mutating requests succeed without visible actor ID input.
- Auth session refresh and expiry recovery works in web UI.
- Users can switch identity from UI control without page reload.

## Core User Flows

### Flow A: First-Time Host Setup

1. Create club (name + host name).
2. Land on Dashboard.
3. Prompted checklist:
   - Schedule meetup
   - Set theme
   - Invite members

### Flow B: Member Submits Recipe

1. Dashboard CTA: Submit Recipe.
2. Fill form with guided required fields.
3. Success state with "View recipe" and "Submit another."

### Flow C: Host Manages Members

1. Open Members.
2. Invite member by name.
3. Optional: change role or remove member from row actions.

### Flow D: Browse Cookbook

1. Open Recipes or My Cookbook.
2. Filter/search by tag/title.
3. Open recipe detail.
4. Save to Favorites.

## Content and Copy Guidelines

- Replace technical labels:
  - "Actor user ID" -> hidden/internal
  - "ISO datetime" -> "Meetup date and time"
  - "Purge recipes" -> "Clear recipes for upcoming meetup" (admin-only)
- Use short helper text and friendly confirmations.
- Use empty states with clear CTAs:
  - "No recipes yet. Be the first to share one."

## UX Gaps in Current Web MVP

Current UI is developer-centric because it:

- Exposes IDs and raw JSON panels as primary interaction.
- Bundles unrelated operations into one long control page.
- Uses backend data format fields in the form language.
- Has no role-based progressive disclosure.

## Proposed Rollout Plan

### Phase 0 (blockers before UX rollout)

1. Harden `/api/recipe-image` to disallow arbitrary filesystem reads.
2. Add tests covering path traversal and unauthorized file access.
3. Commit identity path for web v1:
   - Default: Option A (Active User picker only) for first UX release.
   - Deferred: Option B (token auth with member picker) in Phase 2.

### Phase 1 (quick wins, no backend changes)

1. Add top navigation and split into route-like sections in frontend state.
2. Add "Active User" picker to centralize actor identity.
3. Replace raw form labels with user language while still sending required actor identity.
4. Hide JSON debug blocks behind a "Developer details" collapse.
5. Convert meetup datetime input to local `datetime-local` with timezone display.
6. Add dashboard summary cards using existing `/api/status`, `/api/members`, `/api/recipes`.
7. Keep unsupported actions hidden: theme edit, meetup advance, role change, reminder templates, recent activity.
8. Implement role gating from `/api/members` role data for the selected active user.

### Phase 2 (interaction polish)

1. Add recipe detail drawer/modal.
2. Add loading/empty/success/error inline states on all major actions.
3. Add role-based visibility for host/admin actions.
4. Add token auth flow in web UI (`/api/auth/login`, `/api/auth/session`, `/api/auth/refresh`, `/api/auth/logout`).
5. Add member picker login flow so users do not enter raw IDs.
6. Remove explicit actor entry fields after auth adoption and acceptance criteria pass.

### Phase 3 (optional enhancements)

1. Add missing web API routes needed for UX parity:
   - Meetup theme update
   - Meetup advance
   - Member role update
   - Reminder policy/template operations
2. Search and filter across recipes.
3. Guided onboarding checklist.
4. Stronger visual system and brand polish.

## Backend Prerequisite Gates

Before enabling specific UI controls:

- `Edit theme` requires web route mapped to service theme mutation.
- `Advance meetup` requires web route mapped to `advanceMeetup`.
- `Change role` requires web route mapped to `setRole`.
- `Reminder templates` require web routes mapped to reminder service methods.
- `Recent activity` requires event/activity API or derived timeline endpoint.
- Role-gated UI uses membership role lookup from `GET /api/members` for active user.

## Capability Model (Phase 1)

Capability source:

- Fetch `GET /api/members`.
- Find entry where `membership.userId === activeUserId`.
- Use `membership.role` (`host`, `admin`, `co_admin`, `member`) to gate controls.

Action visibility rules:

- `Schedule meetup`: show for `host` only.
- `Transfer host`: show for `host` only.
- `Invite member`: show for `host`, `admin`, `co_admin`.
- `Remove member`: show for `host`, `admin`, `co_admin`.
- `Submit recipe`: show for all members.
- `Save to favorites/collections`: show for all members.

Fallback rules:

- If active user is not a current member, show read-only views with no mutating controls.
- If role lookup fails, default to least privilege (member-only actions).

## API Mapping (Current Endpoints)

- Dashboard:
  - `GET /api/status`
  - `GET /api/members`
  - `GET /api/recipes?actorUserId=...`
- Meetup:
  - `POST /api/meetup/schedule`
  - `POST /api/host/set`
- Members:
  - `POST /api/users`
  - `POST /api/members/invite`
  - `POST /api/members/remove`
- Recipes:
  - `POST /api/recipes`
  - `GET /api/recipes`
  - `POST /api/recipes/purge` (admin-only placement)
- My Cookbook:
  - `POST /api/favorites`
  - `GET /api/collections`
  - `POST /api/collections`
- Auth (optional in current web, recommended for rollout):
  - `POST /api/auth/login`
  - `GET /api/auth/session`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`

## Security Hardening (Required Early)

- Restrict `/api/recipe-image` to known upload directories and/or recipe-owned paths.
- Reject arbitrary absolute file paths to prevent local file disclosure.
- Add negative tests for path traversal and unauthorized file access.
- Treat this as Phase 0 exit criteria before broader public-facing UX changes.

## Success Metrics

- New user can submit first recipe in under 2 minutes.
- Host can schedule meetup and invite a member in under 3 minutes.
- Reduced reliance on viewing raw JSON for standard flows.
- No critical auth or file-access regressions introduced by UX changes.
