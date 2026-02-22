# Manual Verification Script

Use this command set after installing Node.js 20+.

```bash
cd /Users/bryanjackson/Documents/code/CookbookClub
rm -f ./data/dev-state.json
```

Initialize:

```bash
npm run start -- --data ./data/dev-state.json club init --name "Cook Book Club" --host-name "Alice"
npm run start -- --data ./data/dev-state.json user add --name "Bob"
npm run start -- --data ./data/dev-state.json user add --name "Cara"
npm run start -- --data ./data/dev-state.json member invite --actor user_1 --user user_2
npm run start -- --data ./data/dev-state.json member invite --actor user_1 --user user_3
```

SQLite mode quick check:

```bash
npm run start -- --storage sqlite --data ./data/dev-state.sqlite club init --name "Cook Book Club" --host-name "Alice"
npm run start -- --storage sqlite --data ./data/dev-state.sqlite club show
npm run start -- --storage sqlite --data ./data/dev-state.sqlite data info
npm run start -- --storage sqlite --data ./data/dev-state.sqlite data doctor
npm run start -- --storage sqlite --data ./data/dev-state.sqlite data doctor --repair
```

Meetup:

```bash
npm run start -- --data ./data/dev-state.json meetup schedule --actor user_1 --at 2026-04-03T18:30:00.000Z
npm run start -- --data ./data/dev-state.json meetup set-theme --actor user_1 --theme "comfort food"
npm run start -- --data ./data/dev-state.json club set-reminders --actor user_1 --windows 72,24,3,0 --recipe-prompt-hours 36
npm run start -- --data ./data/dev-state.json club reminder-templates
npm run start -- --data ./data/dev-state.json club add-reminder-template --actor user_1 --name weekend_focus --windows 48,6,0 --recipe-prompt-hours 12
npm run start -- --data ./data/dev-state.json club export-reminder-templates --out ./data/reminder-templates.json
npm run start -- --data ./data/dev-state.json club import-reminder-templates --actor user_1 --in ./data/reminder-templates.json --prefix shared
npm run start -- --data ./data/dev-state.json club set-reminder-template --actor user_1 --template same_day
npm run start -- --data ./data/dev-state.json club remove-reminder-template --actor user_1 --name weekend_focus
npm run start -- --data ./data/dev-state.json meetup show
npm run start -- --data ./data/dev-state.json meetup list
npm run start -- --data ./data/dev-state.json meetup show --id meetup_1
```

Recipes:

```bash
npm run start -- --data ./data/dev-state.json recipe add --actor user_2 --title "Tomato Soup" --content "Roast tomatoes, blend, simmer." --image /Users/bryanjackson/Desktop/test-recipe.jpg
npm run start -- --data ./data/dev-state.json recipe list --actor user_1
npm run start -- --data ./data/dev-state.json recipe favorite --actor user_1 --recipe recipe_1
npm run start -- --data ./data/dev-state.json cookbook personal-add --actor user_1 --recipe recipe_1 --collection "Favorites"
npm run start -- --data ./data/dev-state.json cookbook personal-list --actor user_1
```

Past access grants:

```bash
npm run start -- --data ./data/dev-state.json meetup advance --actor user_1
npm run start -- --data ./data/dev-state.json user add --name "Dave"
npm run start -- --data ./data/dev-state.json member invite --actor user_1 --user user_4
npm run start -- --data ./data/dev-state.json member set-role --actor user_1 --user user_2 --role admin
npm run start -- --data ./data/dev-state.json access grant-past --actor user_2 --user user_4 --all
```

Notifications:

```bash
npm run start -- --data ./data/dev-state.json notify run
npm run start -- --data ./data/dev-state.json notify list --now 2026-04-03T12:00:00.000Z
npm run start -- --data ./data/dev-state.json notify run --now 2026-04-03T18:30:00.000Z
```

Backup/restore:

```bash
npm run start -- --data ./data/dev-state.json data export --out ./data/backup.json
npm run start -- --data ./data/restored-state.json data import --in ./data/backup.json
npm run start -- --data ./data/restored-state.json club show
```
