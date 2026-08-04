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
from inside `fitness-tracker/`. Photo scanning (see below) won't work this
way since it needs the `/api/scan-food` and `/api/scan-body` serverless
functions — use `vercel dev` (from inside `fitness-tracker/`, with
`ANTHROPIC_API_KEY` set) if you need to test that locally. Everything else
in the app works fine without it.

### The three sections

- **BMI** — log Body Fat % and/or Weight (lb) entries, each with an optional
  photo and note. Set your height once (inches) and the app computes BMI
  (`703 × weight ÷ height²`) plus the standard category (Underweight / Normal
  / Overweight / Obese) automatically. BMI is a rough weight-and-height
  estimate that doesn't account for muscle mass — it's shown as a
  supplementary number alongside your actual body fat % trend, not an
  authoritative one. There's no way to derive BMI from a photo; it always
  needs a real weight and height — but the photo field can save you typing:
  pick a photo of your scale or body-composition scanner display, leave the
  "Auto-read weight/body fat % from this photo" box checked (default), and
  `fitness-tracker/api/scan-body.js` (Claude vision) reads the weight/body
  fat % digits shown and auto-fills those fields, still editable before
  saving. It only reads numbers off a display — it never tries to visually
  guess body composition from a photo of a person. If you just want to
  attach a body/progress photo for your own reference — not a scale
  reading — uncheck that box first: the photo still saves with the entry,
  but it's never sent anywhere, so it costs nothing beyond the (small,
  local) storage space of the compressed image.
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
- **Food Tracker** — log food/meals with calories, protein, carbs, fat, and
  creatine (g). Optionally attach a photo of a nutrition label — it's sent to
  an AI vision model (`fitness-tracker/api/scan-food.js`, using
  `ANTHROPIC_API_KEY`) that reads the label and auto-fills the macro fields
  (creatine included, for supplement labels that list it), which you can still edit
  before saving. Shows today's totals at the top, a Trend chart tracking daily
  protein against a 170g/day goal (each bar is one day, split into a colored
  segment per meal logged that day, with a dashed goal line), and a full
  history below.

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

### Data

**Data lives entirely in the browser's localStorage** — nothing is sent
anywhere except the two photo-scan calls (a label photo is sent to
`/api/scan-food` whenever you pick one; a BMI photo is sent to
`/api/scan-body` only if the "Auto-read" box is checked — uncheck it for
reference-only body photos and nothing is sent). Only that one image is
ever sent, never your saved data. There's no cross-device sync;
each browser has its own independent copy. Use "Export data" / "Import data"
(in the footer, visible on every section) to back up or move data between
browsers/devices manually — Import fully replaces whatever's currently
loaded, so export first if you want to keep both.

### Required environment variables (Vercel)

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/scan-food.js`, `api/scan-body.js` | Reading nutrition labels and scale/scanner displays from photos |

The app degrades gracefully without it — photo scanning just fails with a
friendly "enter the values manually below" message instead of crashing — but
scanning doesn't work until it's set in the Vercel project.

### Data migration notes

Existing users' data upgrades automatically on first load after an update:
a "Body Fat %" goal (from before the BMI section existed) moves into
`state.bmi.entries`, and old skill-goal practice entries logged as
attempts/successes (from before Muscle-Up switched to reps) are kept and
shown read-only, labeled "(legacy)," in the practice log — they're not
converted to fake rep numbers.
