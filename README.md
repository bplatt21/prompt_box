# prompt_box

## Fitness Progress Tracker

A small standalone web app for tracking fitness goals — starting with reaching
10% body fat and landing a first muscle-up, with room to add more goals over
time. Lives in [`fitness-tracker/`](fitness-tracker/).

### Running it

No build step and no server required — just open the file:

```
open fitness-tracker/index.html
```

or serve the folder with any static file server, e.g. `python3 -m http.server`
from inside `fitness-tracker/`.

### How it works

- **Goals come in two types:**
  - **Metric goals** — a number to hit, with a direction (go up or down to a
    target). Body Fat % (target 10%) is seeded by default. Use this type for
    anything numeric: weight, a lift number, a race time, rep maxes, etc.
  - **Skill goals** — a milestone checklist plus a practice-session log, for
    feats that aren't a single number. Muscle-Up is seeded by default with a
    standard calisthenics progression (pull-up/dip strength, false-grip hang,
    negatives, band-assisted reps) and a "mark as achieved" button for the day
    you get your first rep.
- **Adding more goals** is a form, not code — click "+ Add goal" and pick
  either type. This is how "more goals to follow" is meant to be handled going
  forward.
- Each metric goal gets a trend chart (hover for a tooltip) plotted against
  its target, plus a full history table.
- **Data lives in the browser's localStorage only** — nothing is sent
  anywhere. Use "Export data" / "Import data" on the dashboard to back up or
  move data between browsers/devices.