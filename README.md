# Cookbook Club CLI (MVP)

CLI-first implementation of the Cookbook Club product concept.

## Scope in this MVP

- Single club enforced in CLI UX.
- Data model uses `clubId` everywhere so multi-club can be added later.
- Host/admin/co_admin/member role model.
- Host manages upcoming meetup (date/time/theme/next host).
- Club membership policy: `open` or `closed`.
- All current members are auto-attendees for upcoming meetup.
- Members submit recipes with image paths.
- Meetup cookbook is shared to attendees.
- New members get forward-only cookbook access by default.
- Host/admin/co_admin can grant historical cookbook access.
- Favorites and personal cookbook collections.
- In-app reminder queue with scheduled windows and delivery simulation (`notify run`).
- Notification preview command without delivery (`notify list`).
- Host-configurable reminder windows (`club set-reminders`).
- Named reminder templates (`club reminder-templates`, `club set-reminder-template`).
- Custom reminder template CRUD (`club add-reminder-template`, `club remove-reminder-template`).
- Custom reminder template sharing/import (`club export-reminder-templates`, `club import-reminder-templates`).
- Snapshot backup/restore commands (`data export`, `data import`).
- SQLite migration introspection command (`data info` with `--storage sqlite`).
- SQLite health check command (`data doctor` with `--storage sqlite`).
- SQLite repair command (`data doctor --repair` with `--storage sqlite`, with pre-repair backup).

## Requirements

- Node.js 20+

## Usage

```bash
cd /Users/bryanjackson/Documents/code/CookbookClub
npm install
npm run start -- help
```

Use `--data` to choose a specific state file.
Use `--storage` to choose persistence backend (`json` default, or `sqlite`).

```bash
npm run start -- --data ./data/dev-state.json club init --name "Cook Book Club" --host-name "Alice"
npm run start -- --data ./data/dev-state.json club set-reminders --actor user_1 --windows 72,24,3,0 --recipe-prompt-hours 36
npm run start -- --data ./data/dev-state.json club reminder-templates
npm run start -- --data ./data/dev-state.json club add-reminder-template --actor user_1 --name weekend_focus --windows 48,6,0 --recipe-prompt-hours 12
npm run start -- --data ./data/dev-state.json club set-reminder-template --actor user_1 --template same_day
npm run start -- --data ./data/dev-state.json club remove-reminder-template --actor user_1 --name weekend_focus
npm run start -- --data ./data/dev-state.json club export-reminder-templates --out ./data/templates.json
npm run start -- --data ./data/dev-state.json club import-reminder-templates --actor user_1 --in ./data/templates.json --prefix shared
npm run start -- --data ./data/dev-state.json meetup list
npm run start -- --data ./data/dev-state.json meetup show --id meetup_1
npm run start -- --storage sqlite --data ./data/dev-state.sqlite club init --name "Cook Book Club" --host-name "Alice"
npm run start -- --storage sqlite --data ./data/dev-state.sqlite data info
npm run start -- --storage sqlite --data ./data/dev-state.sqlite data doctor
npm run start -- --storage sqlite --data ./data/dev-state.sqlite data doctor --repair
npm run start -- --data ./data/dev-state.json data export --out ./data/backup.json
npm run start -- --data ./data/restore-state.json data import --in ./data/backup.json
```

## Environment Notes

This repo includes `scripts/with-dev-path.sh` and routes `npm run start` / `npm test` through it.
That script prepends common Node locations (`/opt/homebrew/bin`, `/usr/local/bin`, `/bin`, `/usr/bin`) to PATH, which helps in constrained shells where Node/Git are not discoverable by default.

## Install / Distribution

For local command usage:

```bash
cd /Users/bryanjackson/Documents/code/CookbookClub
npm install
npm link
cookbook-club help
```

To run without linking:

```bash
npx /Users/bryanjackson/Documents/code/CookbookClub help
```

## Test

```bash
npm test
```

Test suites are in:

- `test/service.test.js` (domain/service behavior)
- `test/cli.integration.test.js` (command-level flows)

Manual testing docs:

- `docs/manual-testing.md` (scenario-based checklist with expected outcomes)
- `docs/manual-verification.md` (quick command script)

## CI

- GitHub Actions workflow: `/Users/bryanjackson/Documents/code/CookbookClub/.github/workflows/ci.yml`
- Runs on pushes to `main` and all pull requests.
- Executes `npm ci` and `npm test` on Node 24.

## Collaboration Defaults

- PR template: `/Users/bryanjackson/Documents/code/CookbookClub/.github/pull_request_template.md`
- Issue templates: `/Users/bryanjackson/Documents/code/CookbookClub/.github/ISSUE_TEMPLATE`
- Code ownership: `/Users/bryanjackson/Documents/code/CookbookClub/.github/CODEOWNERS`
- Dependabot updates: `/Users/bryanjackson/Documents/code/CookbookClub/.github/dependabot.yml`

## Security

- Security policy: `/Users/bryanjackson/Documents/code/CookbookClub/SECURITY.md`
- Report vulnerabilities through GitHub private security advisories.
