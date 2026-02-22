# Manual Testing Guide

This guide defines manual test scenarios for the Cookbook Club CLI MVP.

## Prerequisites

- Node 24+ available in your shell.
- CLI dependencies installed:

```bash
cd /Users/bryanjackson/Documents/code/CookbookClub
npm install
```

- Test image file exists (example):
  - `/Users/bryanjackson/Desktop/test-recipe.jpg`

## Test Data Reset

```bash
cd /Users/bryanjackson/Documents/code/CookbookClub
rm -f ./data/manual.json ./data/manual.sqlite ./data/manual-backup.json
```

Use this alias in your shell for shorter commands:

```bash
alias cbc='npm run start -- --data ./data/manual.json'
alias cbc_sql='npm run start -- --storage sqlite --data ./data/manual.sqlite'
```

## Scenario 1: Club Setup and Membership

1. Initialize club and host:
```bash
cbc club init --name "Cook Book Club" --host-name "Alice"
```
Expected:
- Returns `club_1` and `user_1`.
- Club policy defaults to `closed`.

2. Add users and invite:
```bash
cbc user add --name "Bob"
cbc user add --name "Cara"
cbc member invite --actor user_1 --user user_2
cbc member invite --actor user_1 --user user_3
cbc member list
```
Expected:
- Bob and Cara exist (`user_2`, `user_3`).
- Member list includes host + invited users with roles.

3. Validate closed policy restriction:
```bash
cbc user add --name "Eve"
cbc member invite --actor user_2 --user user_4
```
Expected:
- Command fails with closed-policy permission error.

## Scenario 2: Meetup Scheduling and Theme

1. Schedule and theme:
```bash
cbc meetup schedule --actor user_1 --at 2026-04-03T18:30:00.000Z
cbc meetup set-theme --actor user_1 --theme "comfort food"
cbc meetup show
```
Expected:
- Upcoming meetup has scheduled time and theme.
- Host is `user_1`.

2. Meetups history:
```bash
cbc meetup list
cbc meetup show --id meetup_1
```
Expected:
- `meetup list` returns current timeline (at least one meetup).
- `meetup show --id meetup_1` returns host details.

## Scenario 3: Reminder Policies and Templates

1. Set custom reminder windows:
```bash
cbc club set-reminders --actor user_1 --windows 72,24,3,0 --recipe-prompt-hours 36
cbc club show
```
Expected:
- Club shows `reminderPolicy` with provided windows.

2. Built-in templates:
```bash
cbc club reminder-templates
cbc club set-reminder-template --actor user_1 --template same_day
```
Expected:
- Template list includes built-ins (`standard`, `light`, `tight`, `same_day`).
- Applying template updates reminder policy.

3. Custom templates:
```bash
cbc club add-reminder-template --actor user_1 --name weekend_focus --windows 48,6,0 --recipe-prompt-hours 12
cbc club set-reminder-template --actor user_1 --template weekend_focus
cbc club remove-reminder-template --actor user_1 --name weekend_focus
```
Expected:
- Add/apply/remove succeed.
- Removed template can no longer be applied.

4. Template sharing/import:
```bash
cbc club add-reminder-template --actor user_1 --name weekend_focus --windows 48,6,0 --recipe-prompt-hours 12
cbc club export-reminder-templates --out ./data/manual-templates.json
```
Expected:
- Export file contains `templates.weekend_focus`.

## Scenario 4: Recipe and Personal Cookbook

1. Add and list recipe:
```bash
cbc recipe add --actor user_2 --title "Tomato Soup" --content "Roast tomatoes, blend, simmer." --image /Users/bryanjackson/Desktop/test-recipe.jpg
cbc recipe list --actor user_1
```
Expected:
- Recipe created (`recipe_1`).
- Host can view recipe list.

2. Favorite and personal collection:
```bash
cbc recipe favorite --actor user_1 --recipe recipe_1
cbc cookbook personal-add --actor user_1 --recipe recipe_1 --collection "Favorites"
cbc cookbook personal-list --actor user_1
```
Expected:
- Favorite exists.
- Personal collection contains recipe.

## Scenario 5: Access to Past Cookbooks

1. Advance meetup and add new member:
```bash
cbc meetup advance --actor user_1
cbc user add --name "Dave"
cbc member invite --actor user_1 --user user_5
```
Expected:
- `meetup_1` becomes `past`, new upcoming meetup created.
- Dave joined with forward-only access.

2. Grant admin and backfill access:
```bash
cbc member set-role --actor user_1 --user user_2 --role admin
cbc access grant-past --actor user_2 --user user_5 --all
```
Expected:
- Bob promoted to admin.
- Dave gets access grants for past meetup cookbooks.

## Scenario 6: Notifications

1. Preview and deliver:
```bash
cbc notify list --now 2026-04-03T12:00:00.000Z
cbc notify run --now 2026-04-03T18:30:00.000Z
```
Expected:
- `notify list` shows due notifications without delivery.
- `notify run` marks due notifications as delivered.

2. Invalid timestamp validation:
```bash
cbc notify run --now not-a-date
```
Expected:
- Command fails with timestamp validation error.

## Scenario 7: Data Portability

```bash
cbc data export --out ./data/manual-backup.json
npm run start -- --data ./data/manual-restored.json data import --in ./data/manual-backup.json
npm run start -- --data ./data/manual-restored.json club show
```
Expected:
- Export file created.
- Restored state matches original club.

## Scenario 8: SQLite Mode + Diagnostics

1. Initialize SQLite:
```bash
cbc_sql club init --name "SQLite Club" --host-name "Alice"
cbc_sql data info
cbc_sql data doctor
cbc_sql data doctor --repair
```
Expected:
- `data info` includes migration versions and table counts.
- `data doctor` returns `ok: true`.
- `data doctor --repair` returns `repaired: true` and `backupPath`.

## Manual Test Checklist

- Club setup/host/member flows pass.
- Closed/open policy permissions enforced.
- Meetup scheduling/theme/history commands work.
- Recipe add/list/favorite/personal collection flows work.
- Past cookbook access grants work.
- Reminder policy and template commands work.
- Notification preview/run behavior correct.
- JSON export/import works.
- SQLite `data info`/`data doctor`/`--repair` works.
- No unexpected command crashes.
