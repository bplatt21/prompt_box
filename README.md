# prompt_box

## Fitness Progress Tracker

A small standalone web app for tracking BMI, exercise, and food. Four tabs:
a Daily Overview landing page, then BMI/Exercise/Food Tracker, each
purpose-built for what it tracks. Lives in
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

### Daily Overview

The first thing you see on load (and the first tab in the nav): a card per
section — BMI, Exercise, Food Tracker — each showing whether it's been
logged today and a couple of key numbers (BMI's latest Body Fat %/Weight/
BMI, or last-logged date if nothing's from today; Exercise's "X of Y goals
logged today" and "X of Y achieved"; Food Tracker's today's calories and
protein). Tap a card to jump into that section's full detail — it's a
summary, not a replacement for the real pages.

### The three sections

- **BMI** — log Body Fat % and/or Weight (lb), plus whatever else your smart
  scale reports: Heart Rate, Muscle Mass, Fat-Free Body Weight, Skeletal
  Muscle, Subcutaneous Fat, Body Water, Bone Mass, Protein, BMR, Visceral
  Fat, and Metabolic Age — all optional, each with its own summary tile and
  history column. Set your height once (inches) and the app computes BMI
  (`703 × weight ÷ height²`) plus the standard category (Underweight / Normal
  / Overweight / Obese) itself — it never uses a value a scale reports for
  this, so there's no chance of two conflicting BMI numbers. BMI is a rough
  weight-and-height estimate that doesn't account for muscle mass — it's
  shown as a supplementary number alongside your actual body fat % trend,
  not an authoritative one. The photo field can save you typing: pick a
  photo of your scale's results screen, leave the "Auto-read scale numbers
  from this photo" box checked (default), and `fitness-tracker/api/scan-body.js`
  (Claude vision) reads whichever of those numbers the screen shows and
  auto-fills the matching fields, still editable before saving — and that
  photo is only used to read it, never saved with the entry. It only reads
  numbers off a display; it never tries to visually guess body composition
  from a photo of a person. If you just want to attach a body/progress photo
  for your own reference — not a scale reading — uncheck that box first:
  that photo *does* save with the entry (that's the point of a reference
  photo), but it's never sent anywhere either way.
- **Exercise** — goal-based tracking, same system as before:
  - **Metric goals** — a number to hit, with a direction (go up or down to a
    target). Push-ups (target 50 reps) and Plank (target 60 sec) are seeded
    by default. Use this type for anything numeric: weight, a lift number, a
    race time, rep maxes, hold times, etc. If the goal's unit is a weight
    unit (lb/lbs/kg/kgs/pound(s)/kilogram(s)), the log form gets an extra
    optional **Reps** field and the history table gets a matching column —
    e.g. a "Bench Press" goal with unit `lb` lets you note "225 lb for 5
    reps," not just the weight. Goals with other units (reps, sec, etc.)
    don't show it, since it wouldn't add anything there.
  - **Skill goals** — a milestone checklist plus a practice-session log, for
    feats that aren't a single number. Muscle-Up is seeded by default with a
    standard calisthenics progression and a "mark as achieved" button for the
    day you get your first rep. Practice sessions log a rep value (with the
    same multi-value/stacked-bar-chart treatment as metric goals) rather than
    an attempts/successes count.
  - Click "+ Add goal" to add more of either type.
- **Food Tracker** — log food/meals with calories, protein, carbs, fat, and
  creatine (g). Optionally attach a photo — a **"Photo is a..."** selector
  picks how it's read: **Nutrition label** sends it to an AI vision model
  (`fitness-tracker/api/scan-food.js`, using `ANTHROPIC_API_KEY`) that reads
  the printed numbers directly and auto-fills the macro fields (creatine
  included, for supplement labels that list it) — as reliable as the label
  itself. **Photo of the meal itself** is for food with no label (a
  restaurant plate, home cooking): the same endpoint instead has the AI
  *visually estimate* calories/macros for the whole portion shown, which is
  inherently a rough guess, not a reading — the UI says so explicitly, and
  those numbers are worth double-checking more than a label scan's. Either
  way the fields stay fully editable before saving. A **Servings** field
  scales all the macro fields at once —
  set it to 1.5 if you're eating 1.5x whatever the label (or your typed-in
  numbers) describe; works whether the starting numbers came from a scan or
  manual entry, and re-scales correctly if you change it more than once or
  hand-correct a field afterward. It's a form-only convenience — only the
  final scaled numbers get saved on the entry. Each entry also has an
  optional **Time** (defaults to the current time when you open the form,
  editable like Date) and can be labeled Breakfast/Lunch/Dinner. Shows
  today's totals at the top, a Trend chart tracking daily protein against a
  170g/day goal (each bar is one day, split into a colored segment per meal
  logged that day, with a dashed goal line), and a history grouped by day,
  then by meal within each day (unlabeled entries land in an "Other" group,
  unless a day has no labeled entries at all, in which case it's just shown
  as a flat list) — entries within each group are sorted chronologically by
  time, and each day's header shows that day's totals across every meal.
  A **Library** (button next to "+ Log food") holds foods you eat often —
  saved once (typed, scanned, or scaled with Servings like any other entry,
  minus a date/time since it's a reusable template, not a specific meal) and
  then logged again with a single **+ Log** tap, which drops a new entry in
  today at the current time using the saved macros/meal. No photo is ever
  kept on a library item either, same as regular Food entries. The regular
  "+ Log food" form also gets a **"Quickly fill from library"** picker at
  the top (only shown when you have library items saved) — pick one to fill
  in the name/meal/macro fields below without leaving the form, then adjust
  anything (including Date/Time, which the pick never touches) before
  saving; it's a shortcut into the same form, not a separate save path. Going
  the other direction, that same form (only when logging a brand-new entry,
  not editing) has an **"Add to library"** checkbox — check it to save
  whatever you're logging as a library item too, in the same step. It needs
  a food name; if you check it but leave the name blank, the entry still
  saves normally and you're told the library save was skipped rather than
  losing the whole entry over it.

### Shared entry features (BMI, Exercise, Food)

- **Multiple values per entry**: metric/skill entries support "+ Add another
  value" (e.g. one per set/attempt) — the *highest* value becomes the entry's
  counted value, and each value renders as its own colored segment stacked in
  that entry's bar on the trend chart, so the bar's total height still shows
  session volume. The history table only shows a Breakdown column for goals
  where you've actually logged more than one value.
- **Multiple entries per day** are allowed — nothing gets overwritten by
  logging again the same day.
- **Screenshots/photos**: optional on BMI and metric/skill entries — resized
  and compressed in the browser before saving, shown as a thumbnail that
  opens full-size on click. Food entries are different: a photo there
  (label or meal) is sent to the AI to read/estimate the macro fields, then
  discarded — it's never saved with the entry, so Food Tracker never keeps a
  picture around, only the numbers it read. Entries saved before this
  changed may still show an old photo; editing one of those still lets you
  remove it, it just won't be replaced by a new one.
- **Editing**: click the pencil icon on any history-table row to reopen the
  log form pre-filled with that entry's data and save changes in place,
  instead of deleting and re-logging. Leaving a file picker empty on edit
  keeps the current image — check "Remove screenshot"/"Remove photo" to
  clear it. On Exercise goal entries specifically, editing shows the entry's
  date as plain text instead of a date picker, since editing is for
  correcting/appending values on that same day — the date field only shows
  up when logging a brand-new entry.
- **Duplicating**: Food Tracker rows have a copy icon next to Edit for
  quickly re-logging something you eat often. It copies the name and macros
  (calories/protein/carbs/fat/creatine) and meal label into a new entry dated
  today at the current time — note and photo are left blank/unset rather
  than carried over, and the original entry is untouched.

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
