# prompt_box

## Fitness Progress Tracker

A small standalone web app for tracking BMI, exercise, and food — three
top-level sections, each purpose-built for what it tracks. Lives in
[`fitness-tracker/`](fitness-tracker/).

### Running it

No build step required for local UI work — just open the file:

```
open fitness-tracker/index.html
```

or serve the folder with any static file server, e.g. `python3 -m http.server`
from inside `fitness-tracker/`. Cross-device sync and food-label scanning
(see below) won't work this way since those need the `/api/sync` and
`/api/scan-food` serverless functions — use `vercel dev` (from inside
`fitness-tracker/`, with `REDIS_URL` and `ANTHROPIC_API_KEY` set) if you need
to test those locally. Everything else in the app works fine without it.

### The three sections

- **BMI** — log Body Fat % and/or Weight (lb) entries, each with an optional
  screenshot and note. Set your height once (inches) and the app computes BMI
  (`703 × weight ÷ height²`) plus the standard category (Underweight / Normal
  / Overweight / Obese) automatically. BMI is a rough weight-and-height
  estimate that doesn't account for muscle mass — it's shown as a
  supplementary number alongside your actual body fat % trend, not an
  authoritative one. There's no way to derive BMI from a photo; it always
  needs a real weight and height.
- **Exercise** — goal-based tracking, same system as before:
  - **Metric goals** — a number to hit, with a direction (go up or down to a
    target). Push-ups (target 50 reps) is seeded by default. Use this type
    for anything numeric: weight, a lift number, a race time, rep maxes, etc.
  - **Skill goals** — a milestone checklist plus a practice-session log, for
    feats that aren't a single number. Muscle-Up is seeded by default with a
    standard calisthenics progression and a "mark as achieved" button for the
    day you get your first rep. Practice sessions log a rep value (with the
    same multi-value/stacked-bar-chart treatment as metric goals) rather than
    an attempts/successes count.
  - Click "+ Add goal" to add more of either type.
- **Food Tracker** — log food/meals with calories, protein, carbs, and fat.
  Optionally attach a photo of a nutrition label — it's sent to an AI vision
  model (`fitness-tracker/api/scan-food.js`, using `ANTHROPIC_API_KEY`) that
  reads the label and auto-fills the macro fields, which you can still edit
  before saving. Shows today's totals at the top and a full history below.

### Shared entry features (BMI, Exercise, Food)

- **Multiple values per entry**: metric/skill entries support "+ Add another
  value" (e.g. one per set/attempt) — the *highest* value becomes the entry's
  counted value, and each value renders as its own colored segment stacked in
  that entry's bar on the trend chart, so the bar's total height still shows
  session volume. The history table only shows a Breakdown column for goals
  where you've actually logged more than one value.
- **Multiple entries per day** are allowed — nothing gets overwritten by
  logging again the same day.
- **Screenshots/photos**: optional on BMI and metric/skill entries, and on
  Food entries (where a photo also triggers the label scan). Resized and
  compressed in the browser before saving, shown as a thumbnail that opens
  full-size on click.
- **Editing**: click the pencil icon on any history-table row to reopen the
  log form pre-filled with that entry's data and save changes in place,
  instead of deleting and re-logging. Leaving a file picker empty on edit
  keeps the current image — check "Remove screenshot"/"Remove photo" to
  clear it.

### Data & sync

- **Data lives in the browser's localStorage by default** — nothing is sent
  anywhere unless you turn on sync. Use "Export data" / "Import data" (in the
  footer, visible on every section) to back up or move data between
  browsers/devices manually.
- **Cross-device sync (optional)**: click "Sync devices" to generate a
  private sync code, then enter that same code on another device to link it.
  Once linked, data pushes to the cloud on every change and pulls the newest
  copy on load (last-write-wins by timestamp — no merge of concurrent
  edits). Backed by `fitness-tracker/api/sync.js`, storing one JSON blob per
  sync code in Redis via `REDIS_URL`. The sync code is a shared secret, not a
  login — anyone with the code can read/write that data, an appropriate
  tradeoff for a personal single-user app but worth knowing.

### Required environment variables (Vercel)

| Variable | Used by | Purpose |
|---|---|---|
| `REDIS_URL` | `api/sync.js` | Cross-device sync storage |
| `ANTHROPIC_API_KEY` | `api/scan-food.js` | Reading nutrition labels from photos |

Both are optional in the sense that the app degrades gracefully without them
(sync/scanning just silently fail with a friendly message instead of
crashing), but neither feature works until its variable is set in the Vercel
project.

### Data migration notes

Existing users' data upgrades automatically on first load after an update:
a "Body Fat %" goal (from before the BMI section existed) moves into
`state.bmi.entries`, and old skill-goal practice entries logged as
attempts/successes (from before Muscle-Up switched to reps) are kept and
shown read-only, labeled "(legacy)," in the practice log — they're not
converted to fake rep numbers.
