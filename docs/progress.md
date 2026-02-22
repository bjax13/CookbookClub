# MVP Build Progress

Updated: 2026-02-22

## Completed

- Relocated project to standalone folder: `/Users/bryanjackson/Documents/code/CookbookClub`.
- CLI scaffold and command parser.
- JSON persistence layer for fast local iteration.
- Single-club constraints with multi-club-ready schema (`clubId` across entities).
- Role and authorization model:
  - host/admin/co_admin/member
  - policy-aware invite rules (`open|closed`)
  - host transfer for upcoming meetup control
- Meetup lifecycle:
  - upcoming meetup seed
  - schedule datetime
  - set theme
  - advance meetup (closes current, creates next)
  - meetup history listing and direct lookup by ID
- Recipe workflow:
  - add recipe with required local image path
  - list meetup recipes with access checks
- Cookbook access model:
  - default forward-only access for new members
  - host/admin/co_admin grants for past meetups
- Favorites and personal cookbook organization:
  - favorite recipe
  - add to named personal collection
  - list collections with recipe entries
- In-app notifications:
  - scheduled reminder windows (`7d`, `1d`, `3h`, `at-start`, recipe prompt)
  - due-time filtering and deterministic delivery via `notify run --now`
  - host-configurable reminder policies via `club set-reminders`
  - host-selectable reminder templates via `club set-reminder-template`
  - host-managed custom reminder templates (`club add-reminder-template`, `club remove-reminder-template`)
  - custom template sharing/import (`club export-reminder-templates`, `club import-reminder-templates`)
- Test coverage (`node:test`) for critical rules and flows.
  - host transfer behavior
  - host-role consistency guard
  - past cookbook grant boundary behavior (`fromMeetupId`)
  - reminder due-time filtering and reschedule dedupe
  - notification timestamp validation (`--now`)
  - CLI integration tests for command-level flows
  - CLI snapshot export/import flow
  - legacy SQLite blob-to-normalized migration path
  - SQLite migration/version introspection (`data info`)
  - customizable reminder policy window behavior
  - reminder template behavior and CLI coverage
  - custom reminder template CRUD and apply behavior
  - SQLite health diagnostics coverage
  - SQLite repair-path coverage
  - meetup history/list commands coverage
- Data portability commands:
  - `data export --out <path>`
  - `data import --in <path>`
- Optional SQLite storage backend via Node 24 experimental module:
  - global CLI flag `--storage sqlite`
  - default remains `--storage json`
  - normalized relational tables (users, clubs, memberships, meetups, recipes, favorites, collections, grants, notifications, counters)
  - schema migrations table (`schema_migrations`)
  - one-time migration/backfill from legacy `app_state` blob storage
  - SQLite introspection command `data info`
  - SQLite health diagnostics command `data doctor`
  - SQLite repair command `data doctor --repair` with auto backup + malformed JSON cleanup
  - schema migration v4 for club custom reminder templates
- CLI/runtime hardening:
  - strict reminder-window parsing and numeric validation for reminder options
  - stronger required-text validation for club/user/theme/recipe fields
  - better boundary validation for `access grant-past --from-meetup`
  - state-free handling for `data info`, `data doctor`, and `data import` commands
    (works even when SQLite JSON payloads are corrupted)
- Distribution and shell resilience:
  - PATH bootstrap wrapper `scripts/with-dev-path.sh`
  - npm scripts now run through the wrapper (`npm run start`, `npm test`)
  - README install guidance (`npm link` / `npx <repo-path>`)

## In Progress

- Optional polish: add deeper corruption handling and rollback-friendly recovery guides.

## Blockers

- No functional blockers at this point.
- In this Codex shell, PATH did not include Homebrew Node by default; tests were run with:
  - `PATH=/opt/homebrew/Cellar/node/24.10.0/bin:/bin:/usr/bin:$PATH node --test`
