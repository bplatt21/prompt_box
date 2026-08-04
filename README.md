# prompt_box

## Fitness Progress Tracker

A small standalone web app for tracking fitness goals — starting with reaching
10% body fat and landing a first muscle-up, with room to add more goals over
time. Lives in [`fitness-tracker/`](fitness-tracker/).

### Running it

No build step required for local UI work — just open the file:

```
open fitness-tracker/index.html
```

or serve the folder with any static file server, e.g. `python3 -m http.server`
from inside `fitness-tracker/`. Cross-device sync (see below) won't work this
way since that needs the `/api/sync` serverless function — use `vercel dev`
(from inside `fitness-tracker/`, with `REDIS_URL` set) if you need to test
that locally. Everything else in the app works fine without it.

### How it works

- **Goals come in two types:**
  - **Metric goals** — a number to hit, with a direction (go up or down to a
    target). Body Fat % (target 10%) and Push-ups (target 50 reps) are seeded
    by default. Use this type for anything numeric: weight, a lift number, a
    race time, rep maxes, etc.
  - **Skill goals** — a milestone checklist plus a practice-session log, for
    feats that aren't a single number. Muscle-Up is seeded by default with a
    standard calisthenics progression (pull-up/dip strength, false-grip hang,
    negatives, band-assisted reps) and a "mark as achieved" button for the day
    you get your first rep.
- **Adding more goals** is a form, not code — click "+ Add goal" and pick
  either type. This is how "more goals to follow" is meant to be handled going
  forward.
- Each metric goal gets a stacked bar chart (hover a bar for a tooltip)
  plotted against its target, plus a full history table. You can log as many
  entries as you want per day (e.g. an AM and PM session) — nothing gets
  overwritten.
- A metric entry can be logged as a single value, or as multiple values (e.g.
  one per set/attempt) via "+ Add another value" on the log form. **The
  highest value becomes the entry's counted value** (e.g. for goal
  progress) — the others are kept for context. Each value shows as its own
  colored segment stacked in that entry's bar, so the bar's total height
  reflects session volume even though only the best attempt counts toward
  the goal. The history table only shows a Breakdown column for goals where
  you've actually logged more than one value.
- When logging a measurement for a metric goal, you can optionally attach a
  screenshot (e.g. a scale or scan reading) — it's resized and compressed in
  the browser before saving, and shows as a thumbnail in the history table
  that opens full-size on click.
- **Data lives in the browser's localStorage by default** — nothing is sent
  anywhere unless you turn on sync. Use "Export data" / "Import data" on the
  dashboard to back up or move data between browsers/devices manually.
- **Cross-device sync (optional)**: click "Sync devices" on the dashboard to
  generate a private sync code, then enter that same code on another device
  to link it. Once linked, data pushes to the cloud on every change and pulls
  the newest copy on load (last-write-wins by timestamp — there's no merge of
  concurrent edits). Backed by a small serverless function
  (`fitness-tracker/api/sync.js`) storing one JSON blob per sync code in
  Redis, keyed off the `REDIS_URL` environment variable. The sync code is a
  shared secret, not a login — anyone with the code can read/write that data,
  which is an appropriate tradeoff for a personal single-user app but worth
  knowing.