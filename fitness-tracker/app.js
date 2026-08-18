'use strict';

/* ---------- utils ---------- */

const STORAGE_KEY = 'fitness-tracker-state-v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function unitSuffix(unit) {
  const trimmed = (unit || '').trim();
  if (!trimmed) return '';
  const escaped = escapeHtml(trimmed);
  return trimmed === '%' ? escaped : ' ' + escaped;
}

const WEIGHT_UNITS = ['lb', 'lbs', 'kg', 'kgs', 'kilogram', 'kilograms', 'pound', 'pounds'];

function isWeightUnit(unit) {
  return WEIGHT_UNITS.includes((unit || '').trim().toLowerCase());
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

const EDIT_ICON_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11.5 2.5l2 2-7.5 7.5H4v-2l7.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const DUPLICATE_ICON_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 10.5v-6a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeLabel(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function resizeImageToDataUrl(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image file.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- data / persistence ---------- */

function defaultState() {
  const now = new Date().toISOString();
  return {
    seededPushups: true,
    seededPlank: true,
    bmi: { heightIn: null, entries: [] },
    food: { entries: [], library: [] },
    goals: [
      {
        id: uid(),
        type: 'skill',
        name: 'Muscle-Up',
        unit: ' reps',
        createdAt: now,
        achieved: false,
        achievedDate: null,
        milestones: [
          { id: uid(), label: '5 strict pull-ups', done: false, doneDate: null },
          { id: uid(), label: '10 strict dips', done: false, doneDate: null },
          { id: uid(), label: '10 strict pull-ups', done: false, doneDate: null },
          { id: uid(), label: 'Chest-to-bar explosive pull-ups', done: false, doneDate: null },
          { id: uid(), label: 'False-grip hang, 20+ sec', done: false, doneDate: null },
          { id: uid(), label: 'Slow muscle-up negatives (3-5 sec descent)', done: false, doneDate: null },
          { id: uid(), label: 'Band-assisted muscle-up', done: false, doneDate: null }
        ],
        entries: []
      },
      {
        id: uid(),
        type: 'metric',
        name: 'Push-ups',
        unit: ' reps',
        direction: 'increase',
        target: 50,
        createdAt: now,
        entries: []
      },
      {
        id: uid(),
        type: 'metric',
        name: 'Plank',
        unit: ' sec',
        direction: 'increase',
        target: 60,
        createdAt: now,
        entries: []
      }
    ]
  };
}

function migrateState(parsed) {
  if (!parsed.seededPushups) {
    parsed.goals.push({
      id: uid(),
      type: 'metric',
      name: 'Push-ups',
      unit: ' reps',
      direction: 'increase',
      target: 50,
      createdAt: new Date().toISOString(),
      entries: []
    });
    parsed.seededPushups = true;
  }

  if (!parsed.seededPlank) {
    parsed.goals.push({
      id: uid(),
      type: 'metric',
      name: 'Plank',
      unit: ' sec',
      direction: 'increase',
      target: 60,
      createdAt: new Date().toISOString(),
      entries: []
    });
    parsed.seededPlank = true;
  }

  if (!parsed.bmi) {
    const bodyFatGoal = parsed.goals.find(g => g.type === 'metric' && g.name === 'Body Fat %');
    parsed.bmi = {
      heightIn: null,
      entries: bodyFatGoal ? bodyFatGoal.entries.map(e => ({
        id: e.id,
        date: e.date,
        value: e.value != null ? e.value : null,
        weightLb: null,
        note: e.note || '',
        image: e.image || null
      })) : []
    };
    if (bodyFatGoal) {
      parsed.goals = parsed.goals.filter(g => g.id !== bodyFatGoal.id);
    }
  }

  if (!parsed.food) {
    parsed.food = { entries: [] };
  }
  if (!Array.isArray(parsed.food.library)) {
    parsed.food.library = [];
  }

  parsed.goals.forEach(g => {
    if (g.type === 'skill' && !g.unit) g.unit = ' reps';
    if (!Array.isArray(g.entries)) return;
    g.entries.forEach(en => {
      if (Array.isArray(en.values) && en.values.length) {
        en.value = Math.max(...en.values);
      }
    });
  });

  return parsed;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.goals)) return defaultState();
    return migrateState(parsed);
  } catch (e) {
    console.error('Failed to load saved data, starting fresh.', e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let ui = {
  section: 'overview',
  view: 'dashboard',
  goalId: null,
  foodView: 'log',
  modal: null,
  modalGoalId: null,
  modalEntryId: null,
  lightboxImage: null
};

/* ---------- domain logic: exercise goals ---------- */

function sortedEntries(goal) {
  return [...goal.entries].sort((a, b) => a.date.localeCompare(b.date));
}

function metricBaseline(goal) {
  const s = sortedEntries(goal);
  return s.length ? s[0].value : null;
}

function metricLatest(goal) {
  const s = sortedEntries(goal);
  return s.length ? s[s.length - 1].value : null;
}

function metricProgressPct(goal) {
  const start = metricBaseline(goal);
  const latest = metricLatest(goal);
  if (start == null || latest == null) return 0;
  if (start === goal.target) return 100;
  const pct = goal.direction === 'decrease'
    ? (start - latest) / (start - goal.target) * 100
    : (latest - start) / (goal.target - start) * 100;
  return Math.round(clamp(pct, 0, 100));
}

function metricAchieved(goal) {
  const latest = metricLatest(goal);
  if (latest == null) return false;
  return goal.direction === 'decrease' ? latest <= goal.target : latest >= goal.target;
}

function skillProgressPct(goal) {
  if (goal.achieved) return 100;
  if (!goal.milestones.length) return 0;
  const done = goal.milestones.filter(m => m.done).length;
  return Math.round(done / goal.milestones.length * 100);
}

function goalProgressPct(goal) {
  return goal.type === 'metric' ? metricProgressPct(goal) : skillProgressPct(goal);
}

function goalAchieved(goal) {
  return goal.type === 'metric' ? metricAchieved(goal) : !!goal.achieved;
}

function goalStatus(goal) {
  if (goalAchieved(goal)) return 'achieved';
  const started = goal.type === 'metric'
    ? metricLatest(goal) != null
    : (goal.entries.length > 0 || goal.milestones.some(m => m.done));
  return started ? 'progress' : 'not-started';
}

/* ---------- domain logic: BMI ---------- */

const BMI_EXTRA_FIELDS = [
  { key: 'heartRate', label: 'Heart Rate', unit: 'bpm' },
  { key: 'muscleMass', label: 'Muscle Mass', unit: 'lb' },
  { key: 'fatFreeWeight', label: 'Fat-Free Body Weight', unit: 'lb' },
  { key: 'skeletalMuscle', label: 'Skeletal Muscle', unit: '%' },
  { key: 'subcutaneousFat', label: 'Subcutaneous Fat', unit: '%' },
  { key: 'bodyWater', label: 'Body Water', unit: '%' },
  { key: 'boneMass', label: 'Bone Mass', unit: 'lb' },
  { key: 'protein', label: 'Protein', unit: '%' },
  { key: 'bmr', label: 'BMR', unit: 'kcal' },
  { key: 'visceralFat', label: 'Visceral Fat', unit: '' },
  { key: 'metabolicAge', label: 'Metabolic Age', unit: '' }
];

function sortedBmiEntries() {
  return [...state.bmi.entries].sort((a, b) => a.date.localeCompare(b.date));
}

function bmiLatestEntry() {
  const s = sortedBmiEntries();
  return s.length ? s[s.length - 1] : null;
}

function bmiBaselineEntry() {
  const s = sortedBmiEntries();
  return s.length ? s[0] : null;
}

function computeBmi(weightLb, heightIn) {
  if (!weightLb || !heightIn) return null;
  return 703 * weightLb / (heightIn * heightIn);
}

function bmiCategory(bmi) {
  if (bmi == null) return '';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

/* ---------- domain logic: food ---------- */

function foodTotalsForDate(dateStr) {
  return state.food.entries
    .filter(e => e.date === dateStr)
    .reduce((acc, e) => {
      acc.calories += e.calories || 0;
      acc.protein += e.protein || 0;
      acc.carbs += e.carbs || 0;
      acc.fat += e.fat || 0;
      acc.creatine += e.creatine || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, creatine: 0 });
}

/* ---------- chart (stacked bar chart: each attempt is a colored segment + target reference) ---------- */

const CHART_W = 640;
const CHART_H = 260;
const CHART_PAD = { top: 24, right: 24, bottom: 32, left: 46 };
const STACK_COLORS = ['var(--stack-1)', 'var(--stack-2)', 'var(--stack-3)', 'var(--stack-4)', 'var(--stack-5)', 'var(--stack-6)'];

function segmentsFor(entry) {
  return Array.isArray(entry.values) && entry.values.length ? entry.values : [entry.value];
}

function computeBarChartLayout(entries, target) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const totals = sorted.map(e => segmentsFor(e).reduce((sum, v) => sum + v, 0));
  const max = (Math.max(target != null ? target : 0, ...totals, 0) || 1) * 1.15;
  const min = 0;
  const n = sorted.length;
  const slotW = innerW / n;
  const barW = Math.max(8, Math.min(slotW * 0.55, 56));
  const yFor = (v) => CHART_PAD.top + innerH - (v / max) * innerH;
  const bars = sorted.map((e, i) => {
    const segs = segmentsFor(e);
    const cx = CHART_PAD.left + slotW * (i + 0.5);
    let cumulative = 0;
    const rects = segs.map((v, si) => {
      const y0 = yFor(cumulative);
      cumulative += v;
      const y1 = yFor(cumulative);
      return { x: cx - barW / 2, y: y1, width: barW, height: Math.max(0, y0 - y1), color: STACK_COLORS[si % STACK_COLORS.length] };
    });
    return {
      date: e.date,
      total: cumulative,
      rects,
      cx,
      slotX0: CHART_PAD.left + slotW * i,
      slotX1: CHART_PAD.left + slotW * (i + 1),
      breakdown: segs.length > 1 ? segs : null
    };
  });
  return { bars, max, min, yFor, innerW, innerH, slotW };
}

function chartSpecForGoal(goal) {
  return { entries: goal.entries, target: goal.target, unit: goal.unit || '', name: goal.name };
}

function chartSpecForBmi() {
  return { entries: state.bmi.entries.filter(e => e.value != null), target: 10, unit: '%', name: 'Body Fat %' };
}

function foodDailyChartEntries(key) {
  const byDate = {};
  state.food.entries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e[key] || 0);
  });
  return Object.keys(byDate).map(date => ({ date, values: byDate[date] }));
}

function chartSpecForFoodProtein() {
  return { entries: foodDailyChartEntries('protein'), target: 170, unit: 'g', name: 'Protein' };
}

function getChartSpec(kind, id) {
  if (kind === 'bmi') return chartSpecForBmi();
  if (kind === 'food') return chartSpecForFoodProtein();
  const goal = state.goals.find(g => g.id === id);
  return goal ? chartSpecForGoal(goal) : null;
}

function renderChartBlock(kind, id) {
  const spec = getChartSpec(kind, id);
  if (!spec || !spec.entries.length) {
    return '<div class="chart-empty">No entries yet — log your first one below to start your trend line.</div>';
  }
  const layout = computeBarChartLayout(spec.entries, spec.target);
  const { bars, max, min } = layout;
  const unit = unitSuffix(spec.unit);
  const targetLine = spec.target != null ? (() => {
    const ty = layout.yFor(spec.target);
    return `
      <line x1="${CHART_PAD.left}" y1="${ty.toFixed(1)}" x2="${CHART_W - CHART_PAD.right}" y2="${ty.toFixed(1)}" class="chart-target-line" />
      <text x="${CHART_W - CHART_PAD.right}" y="${(ty - 8).toFixed(1)}" text-anchor="end" class="chart-target-label">Goal ${spec.target}${unit}</text>`;
  })() : '';

  const gridLines = [0.25, 0.5, 0.75].map(f => {
    const y = CHART_PAD.top + layout.innerH * f;
    return `<line x1="${CHART_PAD.left}" y1="${y.toFixed(1)}" x2="${CHART_W - CHART_PAD.right}" y2="${y.toFixed(1)}" class="chart-grid" />`;
  }).join('');

  const barsMarkup = bars.map((b, i) => `
      <g data-i="${i}">${b.rects.map(r =>
        `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.width.toFixed(1)}" height="${r.height.toFixed(1)}" fill="${r.color}" class="chart-bar-seg" />`
      ).join('')}</g>`).join('');

  return `
  <div class="chart-wrap" data-chart-kind="${kind}" data-chart-id="${id || ''}">
    <svg viewBox="0 0 ${CHART_W} ${CHART_H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(spec.name)} chart">
      ${gridLines}
      <rect class="chart-hover-col" x="0" y="${CHART_PAD.top}" width="0" height="${layout.innerH}" style="display:none" />
      ${targetLine}
      ${barsMarkup}
      <text x="${CHART_PAD.left}" y="${CHART_H - 8}" class="chart-axis-label">${escapeHtml(formatDateLabel(bars[0].date))}</text>
      <text x="${CHART_W - CHART_PAD.right}" y="${CHART_H - 8}" text-anchor="end" class="chart-axis-label">${escapeHtml(formatDateLabel(bars[bars.length - 1].date))}</text>
      <text x="${CHART_PAD.left - 10}" y="${(layout.yFor(max) + 4).toFixed(1)}" text-anchor="end" class="chart-axis-label">${round1(max)}</text>
      <text x="${CHART_PAD.left - 10}" y="${(layout.yFor(min) + 4).toFixed(1)}" text-anchor="end" class="chart-axis-label">${round1(min)}</text>
    </svg>
    <div class="chart-tooltip" hidden></div>
  </div>`;
}

function wireCharts() {
  document.querySelectorAll('.chart-wrap').forEach(wrap => {
    const kind = wrap.dataset.chartKind;
    const id = wrap.dataset.chartId;
    const spec = getChartSpec(kind, id);
    if (!spec || !spec.entries.length) return;
    const layout = computeBarChartLayout(spec.entries, spec.target);
    const svg = wrap.querySelector('.chart-svg');
    const hoverCol = wrap.querySelector('.chart-hover-col');
    const tooltip = wrap.querySelector('.chart-tooltip');
    if (!svg) return;

    function barAt(clientX) {
      const rect = svg.getBoundingClientRect();
      const scaleX = CHART_W / rect.width;
      const xInSvg = (clientX - rect.left) * scaleX;
      let idx = layout.bars.findIndex(b => xInSvg >= b.slotX0 && xInSvg < b.slotX1);
      if (idx === -1) idx = xInSvg < layout.bars[0].slotX0 ? 0 : layout.bars.length - 1;
      return { bar: layout.bars[idx], idx, rect };
    }

    function showAt(clientX) {
      const { bar, idx, rect } = barAt(clientX);
      hoverCol.setAttribute('x', (CHART_PAD.left + layout.slotW * idx).toFixed(1));
      hoverCol.setAttribute('width', layout.slotW.toFixed(1));
      hoverCol.style.display = '';
      tooltip.hidden = false;
      tooltip.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = `${bar.total}${unitSuffix(spec.unit)}`;
      tooltip.appendChild(strong);
      if (bar.breakdown) {
        const breakdown = document.createElement('span');
        breakdown.textContent = bar.breakdown.join(' + ');
        tooltip.appendChild(breakdown);
      }
      const dateSpan = document.createElement('span');
      dateSpan.textContent = formatDateLabel(bar.date);
      tooltip.appendChild(dateSpan);
      const scaleXInv = rect.width / CHART_W;
      const scaleYInv = rect.height / CHART_H;
      tooltip.style.left = clamp(bar.cx * scaleXInv, 36, rect.width - 36) + 'px';
      tooltip.style.top = (layout.yFor(bar.total) * scaleYInv) + 'px';
    }

    function hide() {
      hoverCol.style.display = 'none';
      tooltip.hidden = true;
    }

    svg.addEventListener('pointermove', (e) => showAt(e.clientX));
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('pointerdown', (e) => showAt(e.clientX));
  });
}

/* ---------- top-level navigation ---------- */

function renderTopNav() {
  const tabs = [
    { key: 'overview', label: 'Daily Overview' },
    { key: 'bmi', label: 'BMI' },
    { key: 'exercise', label: 'Exercise' },
    { key: 'food', label: 'Food Tracker' }
  ];
  return `
  <nav class="top-nav">
    ${tabs.map(t => `<button class="top-nav-tab ${ui.section === t.key ? 'active' : ''}" type="button" data-action="show-section" data-section="${t.key}">${t.label}</button>`).join('')}
  </nav>`;
}

function renderGlobalFooter() {
  return `
  <footer class="app-footer">
    <button class="btn btn-ghost btn-sm" type="button" data-action="export-data">Export data</button>
    <button class="btn btn-ghost btn-sm" type="button" data-action="trigger-import">Import data</button>
    <input type="file" id="import-file-input" accept="application/json" hidden />
    <p class="footer-note">Data is stored only in this browser (localStorage). Export a backup regularly if that matters to you.</p>
  </footer>`;
}

/* ---------- views: daily overview ---------- */

function renderDailyOverviewSection() {
  const today = todayStr();

  const bmiLatest = bmiLatestEntry();
  const bmiLoggedToday = !!(bmiLatest && bmiLatest.date === today);
  const bmiValue = bmiLatest ? computeBmi(bmiLatest.weightLb, state.bmi.heightIn) : null;
  const bmiStats = [];
  if (bmiLatest && bmiLatest.value != null) bmiStats.push({ value: bmiLatest.value + '%', label: 'Body Fat' });
  if (bmiLatest && bmiLatest.weightLb != null) bmiStats.push({ value: bmiLatest.weightLb + ' lb', label: 'Weight' });
  if (bmiValue != null) bmiStats.push({ value: round1(bmiValue), label: 'BMI' + (bmiCategory(bmiValue) ? ' · ' + bmiCategory(bmiValue) : '') });
  const bmiMeta = !bmiLatest
    ? 'No entries yet'
    : (bmiLoggedToday ? 'Logged today' : `Last logged ${formatDateLabel(bmiLatest.date)}`);

  const goals = state.goals;
  const loggedTodayCount = goals.filter(g => g.entries.some(e => e.date === today)).length;
  const achievedCount = goals.filter(g => goalAchieved(g)).length;
  const exerciseStats = goals.length ? [
    { value: `${loggedTodayCount}/${goals.length}`, label: 'Logged today' },
    { value: `${achievedCount}/${goals.length}`, label: 'Achieved' }
  ] : [];
  const exerciseMeta = goals.length ? null : 'No goals yet';

  const totals = foodTotalsForDate(today);
  const foodLoggedToday = state.food.entries.some(e => e.date === today);
  const foodStats = foodLoggedToday ? [
    { value: round1(totals.calories), label: 'Calories' },
    { value: round1(totals.protein) + 'g', label: 'Protein' }
  ] : [];
  const foodMeta = foodLoggedToday ? null : 'Nothing logged today';

  const cards = [
    { section: 'bmi', title: 'BMI', badgeText: bmiLoggedToday ? 'Logged today' : 'Not logged today', badgeGood: bmiLoggedToday, stats: bmiStats, meta: bmiMeta },
    { section: 'exercise', title: 'Exercise', badgeText: goals.length ? `${loggedTodayCount}/${goals.length} logged today` : 'No goals yet', badgeGood: loggedTodayCount > 0, stats: exerciseStats, meta: exerciseMeta },
    { section: 'food', title: 'Food Tracker', badgeText: foodLoggedToday ? 'Logged today' : 'Not logged today', badgeGood: foodLoggedToday, stats: foodStats, meta: foodMeta }
  ];

  const cardsHtml = cards.map(c => `
  <article class="overview-card" data-action="show-section" data-section="${c.section}" tabindex="0" role="button" aria-label="Open ${escapeHtml(c.title)}">
    <div class="overview-card-header">
      <h3>${escapeHtml(c.title)}</h3>
      <span class="status-badge ${c.badgeGood ? 'status-good' : 'status-neutral'}">${escapeHtml(c.badgeText)}</span>
    </div>
    ${c.stats.length ? `<div class="overview-stat-row">${c.stats.map(s => `<div class="overview-stat"><span class="overview-stat-value">${s.value}</span><span class="overview-stat-label">${escapeHtml(s.label)}</span></div>`).join('')}</div>` : ''}
    ${c.meta ? `<p class="overview-meta">${escapeHtml(c.meta)}</p>` : ''}
  </article>`).join('');

  return `
  <div class="page-header">
    <div>
      <h1>Daily Overview</h1>
      <p class="page-subtitle">Where things stand today across BMI, Exercise, and Food Tracker — tap a card for the full picture.</p>
    </div>
  </div>
  <div class="overview-grid">${cardsHtml}</div>`;
}

/* ---------- views: exercise ---------- */

function renderStatusBadge(status) {
  if (status === 'achieved') {
    return `<span class="status-badge status-good"><svg class="status-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5 6 12l8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Achieved</span>`;
  }
  if (status === 'progress') {
    return '<span class="status-badge status-progress">In progress</span>';
  }
  return '<span class="status-badge status-neutral">Not started</span>';
}

function renderMeter(pct, achieved, label) {
  return `
  <div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
    <div class="meter-track"><div class="meter-fill ${achieved ? 'meter-fill-good' : ''}" style="width:${pct}%"></div></div>
    <span class="meter-pct">${escapeHtml(label)}</span>
  </div>`;
}

function renderGoalCard(goal) {
  const pct = goalProgressPct(goal);
  const status = goalStatus(goal);
  const achieved = status === 'achieved';

  let valueLine;
  if (goal.type === 'metric') {
    const latest = metricLatest(goal);
    valueLine = latest != null
      ? `<div class="stat-value">${latest}${unitSuffix(goal.unit)}<span class="stat-target"> / goal ${goal.target}${unitSuffix(goal.unit)}</span></div>`
      : '<div class="stat-value stat-value-empty">No entries yet</div>';
  } else {
    const done = goal.milestones.filter(m => m.done).length;
    valueLine = `<div class="stat-value">${done}/${goal.milestones.length}<span class="stat-target"> milestones</span></div>`;
  }

  const meterLabel = achieved ? 'Goal reached' : `${pct}%`;

  return `
  <article class="goal-card" data-action="show-goal" data-goal-id="${goal.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(goal.name)}">
    <header class="goal-card-header">
      <h3>${escapeHtml(goal.name)}</h3>
      ${renderStatusBadge(status)}
    </header>
    ${valueLine}
    ${renderMeter(pct, achieved, meterLabel)}
    <button class="btn btn-ghost btn-sm goal-card-log" type="button" data-action="open-log-entry" data-goal-id="${goal.id}">+ Log</button>
  </article>`;
}

function renderExerciseDashboard() {
  const cards = state.goals.map(renderGoalCard).join('');
  return `
  <div class="page-header">
    <div>
      <h1>Exercise</h1>
      <p class="page-subtitle">Track the metrics and skills that matter to you.</p>
    </div>
    <button class="btn btn-primary" type="button" data-action="open-add-goal">+ Add goal</button>
  </div>
  <div class="goal-grid">${cards || '<p class="empty-state">No goals yet — add your first one.</p>'}</div>`;
}

function renderMetricDetail(goal) {
  const pct = metricProgressPct(goal);
  const achieved = metricAchieved(goal);
  const latest = metricLatest(goal);
  const start = metricBaseline(goal);
  const unit = unitSuffix(goal.unit);
  const entries = sortedEntries(goal).reverse();

  const summary = `
  <div class="detail-summary">
    <div class="summary-tile">
      <span class="summary-label">Current</span>
      <span class="summary-value">${latest != null ? latest + unit : '—'}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Goal</span>
      <span class="summary-value">${goal.target}${unit}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Starting point</span>
      <span class="summary-value">${start != null ? start + unit : '—'}</span>
    </div>
  </div>
  ${renderMeter(pct, achieved, achieved ? 'Goal reached' : `${pct}% to goal`)}`;

  const hasBreakdown = entries.some(e => Array.isArray(e.values) && e.values.length > 1);
  const showReps = isWeightUnit(goal.unit);

  const rows = entries.map(e => `
    <tr>
      <td>${escapeHtml(formatDateLabel(e.date))}</td>
      <td>${e.value}${unit}</td>
      ${hasBreakdown ? `<td>${Array.isArray(e.values) && e.values.length > 1 ? escapeHtml(e.values.join(' + ')) : ''}</td>` : ''}
      ${showReps ? `<td>${e.reps != null ? e.reps : '—'}</td>` : ''}
      <td>${escapeHtml(e.note || '')}</td>
      <td>${e.image ? `<button class="thumb-btn" type="button" data-action="view-image" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="View screenshot"><img src="${e.image}" class="thumb-img" alt="" /></button>` : ''}</td>
      <td><button class="btn-icon btn-icon-edit" type="button" data-action="open-log-entry" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="Edit entry">${EDIT_ICON_SVG}</button></td>
      <td><button class="btn-icon" type="button" data-action="delete-entry" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="Delete entry">&times;</button></td>
    </tr>`).join('');

  const table = entries.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Value</th>${hasBreakdown ? '<th>Breakdown</th>' : ''}${showReps ? '<th>Reps</th>' : ''}<th>Note</th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty-state">No entries yet.</p>';

  return `
  ${summary}
  <section class="card">
    <div class="card-header-row">
      <h2>Trend</h2>
      <button class="btn btn-primary btn-sm" type="button" data-action="open-log-entry" data-goal-id="${goal.id}">+ Log measurement</button>
    </div>
    ${renderChartBlock('goal', goal.id)}
  </section>
  <section class="card">
    <h2>History</h2>
    ${table}
  </section>`;
}

function renderSkillDetail(goal) {
  const pct = skillProgressPct(goal);
  const unit = escapeHtml((goal.unit || 'reps').trim());

  const milestoneRows = goal.milestones.map(m => `
    <li class="milestone-row ${m.done ? 'milestone-done' : ''}">
      <label class="milestone-label">
        <input type="checkbox" data-action="toggle-milestone" data-goal-id="${goal.id}" data-milestone-id="${m.id}" ${m.done ? 'checked' : ''} />
        <span>${escapeHtml(m.label)}</span>
        ${m.done && m.doneDate ? `<span class="milestone-date">${escapeHtml(formatDateLabel(m.doneDate))}</span>` : ''}
      </label>
      <button class="btn-icon" type="button" data-action="delete-milestone" data-goal-id="${goal.id}" data-milestone-id="${m.id}" aria-label="Remove milestone">&times;</button>
    </li>`).join('');

  const entries = sortedEntries(goal).reverse();
  const hasBreakdown = entries.some(e => Array.isArray(e.values) && e.values.length > 1);

  const rows = entries.map(e => {
    const isLegacy = e.value == null && e.attempts != null;
    if (isLegacy) {
      return `
      <tr>
        <td>${escapeHtml(formatDateLabel(e.date))}</td>
        <td>${e.successes}/${e.attempts} attempts (legacy)</td>
        ${hasBreakdown ? '<td></td>' : ''}
        <td>${escapeHtml(e.note || '')}</td>
        <td></td>
        <td><button class="btn-icon" type="button" data-action="delete-entry" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="Delete entry">&times;</button></td>
      </tr>`;
    }
    return `
    <tr>
      <td>${escapeHtml(formatDateLabel(e.date))}</td>
      <td>${e.value} ${unit}</td>
      ${hasBreakdown ? `<td>${Array.isArray(e.values) && e.values.length > 1 ? escapeHtml(e.values.join(' + ')) : ''}</td>` : ''}
      <td>${escapeHtml(e.note || '')}</td>
      <td><button class="btn-icon btn-icon-edit" type="button" data-action="open-log-entry" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="Edit entry">${EDIT_ICON_SVG}</button></td>
      <td><button class="btn-icon" type="button" data-action="delete-entry" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="Delete entry">&times;</button></td>
    </tr>`;
  }).join('');

  const table = entries.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Value</th>${hasBreakdown ? '<th>Breakdown</th>' : ''}<th>Note</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty-state">No sessions logged yet.</p>';

  const achievedBanner = goal.achieved ? `
  <div class="achieved-banner">
    <span class="achieved-banner-text">Achieved${goal.achievedDate ? ' on ' + escapeHtml(formatDateLabel(goal.achievedDate)) : ''}</span>
    <button class="btn btn-ghost btn-sm" type="button" data-action="unmark-achieved" data-goal-id="${goal.id}">Undo</button>
  </div>` : `
  <button class="btn btn-primary" type="button" data-action="mark-achieved" data-goal-id="${goal.id}">Mark ${escapeHtml(goal.name)} as achieved</button>`;

  return `
  <div class="detail-summary">
    <div class="summary-tile">
      <span class="summary-label">Status</span>
      <span class="summary-value">${goal.achieved ? 'Achieved' : pct + '% ready'}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Milestones</span>
      <span class="summary-value">${goal.milestones.filter(m => m.done).length}/${goal.milestones.length}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Practice sessions</span>
      <span class="summary-value">${goal.entries.length}</span>
    </div>
  </div>
  ${renderMeter(pct, goal.achieved, goal.achieved ? 'Achieved' : `${pct}% ready`)}
  ${achievedBanner}

  <section class="card">
    <div class="card-header-row"><h2>Milestones</h2></div>
    <ul class="milestone-list">${milestoneRows || '<p class="empty-state">No milestones yet.</p>'}</ul>
    <form class="inline-form" data-form="add-milestone" data-goal-id="${goal.id}">
      <input type="text" name="label" placeholder="Add a milestone…" required maxlength="120" />
      <button class="btn btn-ghost" type="submit">Add</button>
    </form>
  </section>

  <section class="card">
    <h2>Trend</h2>
    ${renderChartBlock('goal', goal.id)}
  </section>

  <section class="card">
    <div class="card-header-row">
      <h2>Practice log</h2>
      <button class="btn btn-primary btn-sm" type="button" data-action="open-log-entry" data-goal-id="${goal.id}">+ Log session</button>
    </div>
    ${table}
  </section>`;
}

function renderGoalDetail(goal) {
  const body = goal.type === 'metric' ? renderMetricDetail(goal) : renderSkillDetail(goal);
  return `
  <div class="page-header">
    <div>
      <button class="btn btn-ghost btn-back" type="button" data-action="show-dashboard">&larr; All goals</button>
      <h1>${escapeHtml(goal.name)}</h1>
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost" type="button" data-action="open-edit-goal" data-goal-id="${goal.id}">Edit</button>
      <button class="btn btn-ghost btn-danger" type="button" data-action="delete-goal" data-goal-id="${goal.id}">Delete goal</button>
    </div>
  </div>
  ${body}`;
}

/* ---------- views: BMI ---------- */

function renderBmiSection() {
  const latest = bmiLatestEntry();
  const heightIn = state.bmi.heightIn;
  const latestBmi = latest ? computeBmi(latest.weightLb, heightIn) : null;
  const entries = sortedBmiEntries().reverse();

  const summary = `
  <div class="detail-summary">
    <div class="summary-tile">
      <span class="summary-label">Body Fat %</span>
      <span class="summary-value">${latest && latest.value != null ? latest.value + '%' : '—'}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Weight</span>
      <span class="summary-value">${latest && latest.weightLb != null ? latest.weightLb + ' lb' : '—'}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">BMI</span>
      <span class="summary-value">${latestBmi != null ? round1(latestBmi) + (bmiCategory(latestBmi) ? ' · ' + bmiCategory(latestBmi) : '') : '—'}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Height</span>
      <span class="summary-value summary-value-row">
        ${heightIn ? heightIn + ' in' : 'Not set'}
        <button class="btn-icon btn-icon-edit" type="button" data-action="open-edit-height" aria-label="Edit height">${EDIT_ICON_SVG}</button>
      </span>
    </div>
    ${BMI_EXTRA_FIELDS.map(f => `
    <div class="summary-tile">
      <span class="summary-label">${escapeHtml(f.label)}</span>
      <span class="summary-value">${latest && latest[f.key] != null ? latest[f.key] + unitSuffix(f.unit) : '—'}</span>
    </div>`).join('')}
  </div>
  <p class="field-hint">BMI is a rough estimate from weight and height alone — it doesn't account for muscle mass, so treat it as a supplementary number alongside your actual body fat % readings, not an authoritative one.</p>`;

  const rows = entries.map(e => {
    const bmi = computeBmi(e.weightLb, heightIn);
    return `
    <tr>
      <td>${escapeHtml(formatDateLabel(e.date))}</td>
      <td>${e.value != null ? e.value + '%' : '—'}</td>
      <td>${e.weightLb != null ? e.weightLb + ' lb' : '—'}</td>
      <td>${bmi != null ? round1(bmi) : '—'}</td>
      ${BMI_EXTRA_FIELDS.map(f => `<td>${e[f.key] != null ? e[f.key] + unitSuffix(f.unit) : '—'}</td>`).join('')}
      <td>${escapeHtml(e.note || '')}</td>
      <td>${e.image ? `<button class="thumb-btn" type="button" data-action="view-image" data-entry-kind="bmi" data-entry-id="${e.id}" aria-label="View screenshot"><img src="${e.image}" class="thumb-img" alt="" /></button>` : ''}</td>
      <td><button class="btn-icon btn-icon-edit" type="button" data-action="open-log-bmi" data-entry-id="${e.id}" aria-label="Edit entry">${EDIT_ICON_SVG}</button></td>
      <td><button class="btn-icon" type="button" data-action="delete-bmi-entry" data-entry-id="${e.id}" aria-label="Delete entry">&times;</button></td>
    </tr>`;
  }).join('');

  const table = entries.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Body Fat %</th><th>Weight</th><th>BMI</th>${BMI_EXTRA_FIELDS.map(f => `<th>${escapeHtml(f.label)}</th>`).join('')}<th>Note</th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty-state">No entries yet.</p>';

  return `
  <div class="page-header">
    <div>
      <h1>BMI</h1>
      <p class="page-subtitle">Body composition, weight, and BMI over time.</p>
    </div>
    <button class="btn btn-primary" type="button" data-action="open-log-bmi">+ Log entry</button>
  </div>
  ${summary}
  <section class="card">
    <h2>Trend</h2>
    ${renderChartBlock('bmi', null)}
  </section>
  <section class="card">
    <h2>History</h2>
    ${table}
  </section>`;
}

/* ---------- views: food ---------- */

function renderFoodSection() {
  const totals = foodTotalsForDate(todayStr());
  const entries = [...state.food.entries].sort((a, b) => b.date.localeCompare(a.date));

  const summary = `
  <div class="detail-summary">
    <div class="summary-tile">
      <span class="summary-label">Calories today</span>
      <span class="summary-value">${round1(totals.calories)}</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Protein today</span>
      <span class="summary-value">${round1(totals.protein)}g</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Carbs today</span>
      <span class="summary-value">${round1(totals.carbs)}g</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Fat today</span>
      <span class="summary-value">${round1(totals.fat)}g</span>
    </div>
    <div class="summary-tile">
      <span class="summary-label">Creatine today</span>
      <span class="summary-value">${round1(totals.creatine)}g</span>
    </div>
  </div>`;

  const entryRow = (e) => `
    <tr>
      <td>${e.time ? escapeHtml(formatTimeLabel(e.time)) : '—'}</td>
      <td>${escapeHtml(e.name || '—')}${e.servingSize ? `<br><span class="cell-sub">${escapeHtml(e.servingSize)}</span>` : ''}</td>
      <td>${e.calories != null ? round1(e.calories) : '—'}</td>
      <td>${e.protein != null ? round1(e.protein) + 'g' : '—'}</td>
      <td>${e.carbs != null ? round1(e.carbs) + 'g' : '—'}</td>
      <td>${e.fat != null ? round1(e.fat) + 'g' : '—'}</td>
      <td>${e.creatine != null ? round1(e.creatine) + 'g' : '—'}</td>
      <td>${e.image ? `<button class="thumb-btn" type="button" data-action="view-image" data-entry-kind="food" data-entry-id="${e.id}" aria-label="View photo"><img src="${e.image}" class="thumb-img" alt="" /></button>` : ''}</td>
      <td class="td-icon"><button class="btn-icon btn-icon-edit" type="button" data-action="open-log-food" data-entry-id="${e.id}" aria-label="Edit entry">${EDIT_ICON_SVG}</button></td>
      <td class="td-icon"><button class="btn-icon btn-icon-edit" type="button" data-action="duplicate-food-entry" data-entry-id="${e.id}" aria-label="Duplicate entry">${DUPLICATE_ICON_SVG}</button></td>
      <td><button class="btn-icon" type="button" data-action="delete-food-entry" data-entry-id="${e.id}" aria-label="Delete entry">&times;</button></td>
    </tr>`;

  const dates = [...new Set(entries.map(e => e.date))];

  const rows = dates.map(date => {
    const dayEntries = entries.filter(e => e.date === date).sort((a, b) => {
      if (a.time == null && b.time == null) return 0;
      if (a.time == null) return 1;
      if (b.time == null) return -1;
      return a.time.localeCompare(b.time);
    });
    const dayTotals = foodTotalsForDate(date);
    const dayTotalsText = `${round1(dayTotals.calories)} cal · ${round1(dayTotals.protein)}g protein · ${round1(dayTotals.carbs)}g carbs · ${round1(dayTotals.fat)}g fat${dayTotals.creatine ? ' · ' + round1(dayTotals.creatine) + 'g creatine' : ''}`;
    const dayHeader = `<tr class="day-group-row"><th colspan="11"><div class="day-group-header"><span class="day-group-date">${escapeHtml(formatDateLabel(date))}</span><span class="day-group-total">${escapeHtml(dayTotalsText)}</span></div></th></tr>`;

    const groups = MEAL_ORDER.map(key => ({ key, label: MEAL_LABELS[key], items: dayEntries.filter(e => e.meal === key) })).filter(g => g.items.length);
    const unlabeled = dayEntries.filter(e => !MEAL_ORDER.includes(e.meal));
    if (unlabeled.length) groups.push({ key: 'other', label: groups.length ? 'Other' : null, items: unlabeled });

    const groupRows = groups.map(g =>
      (g.label ? `<tr class="meal-group-row"><th colspan="11">${escapeHtml(g.label)}</th></tr>` : '') +
      g.items.map(entryRow).join('')
    ).join('');

    return dayHeader + groupRows;
  }).join('');

  const table = entries.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Time</th><th>Food</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Creatine</th><th></th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty-state">No food logged yet.</p>';

  return `
  <div class="page-header">
    <div>
      <h1>Food Tracker</h1>
      <p class="page-subtitle">Log meals and snacks — scan a nutrition label photo or enter macros manually.</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-ghost" type="button" data-action="show-food-library">Library</button>
      <button class="btn btn-primary" type="button" data-action="open-log-food">+ Log food</button>
    </div>
  </div>
  ${summary}
  <section class="card">
    <h2>Trend</h2>
    <p class="page-subtitle">Daily protein total vs. your 170g/day goal — each bar is one day, split by the meals logged that day.</p>
    ${renderChartBlock('food', null)}
  </section>
  <section class="card">
    <h2>History</h2>
    ${table}
  </section>`;
}

function renderFoodLibrarySection() {
  const items = state.food.library;

  const rows = items.map(item => `
    <tr>
      <td>${escapeHtml(item.name || '—')}${item.servingSize ? `<br><span class="cell-sub">${escapeHtml(item.servingSize)}</span>` : ''}</td>
      <td>${item.calories != null ? round1(item.calories) : '—'}</td>
      <td>${item.protein != null ? round1(item.protein) + 'g' : '—'}</td>
      <td>${item.carbs != null ? round1(item.carbs) + 'g' : '—'}</td>
      <td>${item.fat != null ? round1(item.fat) + 'g' : '—'}</td>
      <td>${item.creatine != null ? round1(item.creatine) + 'g' : '—'}</td>
      <td>${item.meal && MEAL_LABELS[item.meal] ? escapeHtml(MEAL_LABELS[item.meal]) : '—'}</td>
      <td><button class="btn btn-primary btn-sm" type="button" data-action="quick-log-library-item" data-entry-id="${item.id}">+ Log</button></td>
      <td class="td-icon"><button class="btn-icon btn-icon-edit" type="button" data-action="open-library-item" data-entry-id="${item.id}" aria-label="Edit saved food">${EDIT_ICON_SVG}</button></td>
      <td><button class="btn-icon" type="button" data-action="delete-library-item" data-entry-id="${item.id}" aria-label="Delete saved food">&times;</button></td>
    </tr>`).join('');

  const table = items.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Food</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Creatine</th><th>Meal</th><th></th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty-state">No saved foods yet — add something you eat often below.</p>';

  return `
  <div class="page-header">
    <div>
      <button class="btn btn-ghost btn-back" type="button" data-action="show-food-log">← Back to Food Tracker</button>
      <h1>Food Library</h1>
      <p class="page-subtitle">Save foods you eat often, then log them in one tap from here.</p>
    </div>
    <button class="btn btn-primary" type="button" data-action="open-library-item">+ Add to library</button>
  </div>
  <section class="card">
    ${table}
  </section>`;
}

/* ---------- modals ---------- */

function renderAddGoalModal() {
  return `
  <form data-form="add-goal">
    <h2>Add a new goal</h2>
    <label>Goal name
      <input type="text" name="name" required maxlength="60" placeholder="e.g. Run a 5K under 25 min" />
    </label>
    <label>Goal type
      <select name="type" id="add-goal-type">
        <option value="metric">Metric — a number to hit (weight, reps, time…)</option>
        <option value="skill">Skill — a milestone checklist (a movement or feat)</option>
      </select>
    </label>
    <div id="metric-fields">
      <div class="form-row">
        <label>Unit
          <input type="text" name="unit" maxlength="12" placeholder="%, kg, reps, min" />
        </label>
        <label>Direction
          <select name="direction">
            <option value="decrease">Go down to target</option>
            <option value="increase">Go up to target</option>
          </select>
        </label>
        <label>Target value
          <input type="number" name="target" step="any" placeholder="10" />
        </label>
      </div>
    </div>
    <div id="skill-fields" hidden>
      <label>Milestones (one per line, optional)
        <textarea name="milestones" rows="4" placeholder="5 strict pull-ups&#10;10 strict dips&#10;First rep"></textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Add goal</button>
    </div>
  </form>`;
}

function renderLogEntryModal() {
  const goal = state.goals.find(g => g.id === ui.modalGoalId);
  if (!goal) return '';
  const editEntry = ui.modalEntryId ? goal.entries.find(e => e.id === ui.modalEntryId) : null;
  const editValues = editEntry
    ? (Array.isArray(editEntry.values) && editEntry.values.length ? editEntry.values : (editEntry.value != null ? [editEntry.value] : []))
    : [];
  const extraValueRows = editValues.slice(1).map(v => `
    <div class="inline-form value-field-row">
      <input type="number" name="value" step="any" value="${v}" />
      <button type="button" class="btn-icon" data-action="remove-value-field" aria-label="Remove value">&times;</button>
    </div>`).join('');

  if (goal.type === 'metric') {
    return `
    <form data-form="log-metric-entry" data-goal-id="${goal.id}" ${editEntry ? `data-entry-id="${editEntry.id}"` : ''}>
      <h2>${editEntry ? 'Edit measurement' : 'Log a measurement'}</h2>
      <p class="modal-subtitle">${escapeHtml(goal.name)}</p>
      ${editEntry
        ? `<p class="field-hint">Editing entry for ${escapeHtml(formatDateLabel(editEntry.date))}</p>`
        : `<label>Date
        <input type="date" name="date" value="${todayStr()}" max="${todayStr()}" required />
      </label>`}
      <label>Value (${escapeHtml((goal.unit || 'unit').trim())})
        <input type="number" name="value" step="any" value="${editValues.length ? editValues[0] : ''}" required />
      </label>
      ${isWeightUnit(goal.unit) ? `
      <label>Reps (optional)
        <input type="number" name="reps" step="1" min="1" value="${editEntry && editEntry.reps != null ? editEntry.reps : ''}" />
      </label>
      <p class="field-hint">How many reps at that weight, if you want to note it.</p>` : ''}
      <div class="value-fields-wrap">${extraValueRows}</div>
      <button type="button" class="btn btn-ghost btn-sm add-value-btn" data-action="add-value-field">+ Add another value</button>
      <p class="field-hint">Add one value per attempt/set — the highest one becomes this entry's value.</p>
      <label>Screenshot ${editEntry && editEntry.image ? '' : '(optional)'}
        <input type="file" name="image" accept="image/*" />
      </label>
      ${editEntry && editEntry.image ? `
      <div class="edit-image-current">
        <img src="${editEntry.image}" alt="Current screenshot" class="edit-image-preview" />
        <label class="checkbox-row"><input type="checkbox" name="removeImage" /> Remove screenshot</label>
      </div>` : ''}
      <label>Note (optional)
        <input type="text" name="note" maxlength="140" value="${escapeHtml(editEntry ? (editEntry.note || '') : '')}" placeholder="How'd it go?" />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${editEntry ? 'Save changes' : 'Save'}</button>
      </div>
    </form>`;
  }

  return `
  <form data-form="log-skill-entry" data-goal-id="${goal.id}" ${editEntry ? `data-entry-id="${editEntry.id}"` : ''}>
    <h2>${editEntry ? 'Edit practice session' : 'Log a practice session'}</h2>
    <p class="modal-subtitle">${escapeHtml(goal.name)}</p>
    ${editEntry
      ? `<p class="field-hint">Editing entry for ${escapeHtml(formatDateLabel(editEntry.date))}</p>`
      : `<label>Date
      <input type="date" name="date" value="${todayStr()}" max="${todayStr()}" required />
    </label>`}
    <label>Value (${escapeHtml((goal.unit || 'reps').trim())})
      <input type="number" name="value" step="any" value="${editValues.length ? editValues[0] : ''}" required />
    </label>
    <div class="value-fields-wrap">${extraValueRows}</div>
    <button type="button" class="btn btn-ghost btn-sm add-value-btn" data-action="add-value-field">+ Add another value</button>
    <p class="field-hint">Add one value per attempt/set — the highest one becomes this entry's value.</p>
    <label>Note (optional)
      <input type="text" name="note" maxlength="140" value="${escapeHtml(editEntry ? (editEntry.note || '') : '')}" placeholder="e.g. felt strong on the transition" />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">${editEntry ? 'Save changes' : 'Save'}</button>
    </div>
  </form>`;
}

function renderEditGoalModal() {
  const goal = state.goals.find(g => g.id === ui.modalGoalId);
  if (!goal) return '';
  const metricFields = goal.type === 'metric' ? `
    <div class="form-row">
      <label>Unit
        <input type="text" name="unit" maxlength="12" value="${escapeHtml(goal.unit || '')}" />
      </label>
      <label>Direction
        <select name="direction">
          <option value="decrease" ${goal.direction === 'decrease' ? 'selected' : ''}>Go down to target</option>
          <option value="increase" ${goal.direction === 'increase' ? 'selected' : ''}>Go up to target</option>
        </select>
      </label>
      <label>Target value
        <input type="number" name="target" step="any" value="${goal.target}" required />
      </label>
    </div>` : '';
  return `
  <form data-form="edit-goal" data-goal-id="${goal.id}">
    <h2>Edit goal</h2>
    <label>Goal name
      <input type="text" name="name" required maxlength="60" value="${escapeHtml(goal.name)}" />
    </label>
    ${metricFields}
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Save changes</button>
    </div>
  </form>`;
}

function renderLogBmiModal() {
  const editEntry = ui.modalEntryId ? state.bmi.entries.find(e => e.id === ui.modalEntryId) : null;
  return `
  <form data-form="log-bmi-entry" ${editEntry ? `data-entry-id="${editEntry.id}"` : ''}>
    <h2>${editEntry ? 'Edit entry' : 'Log entry'}</h2>
    <p class="modal-subtitle">Smart scale reading</p>
    <label>Date
      <input type="date" name="date" value="${editEntry ? editEntry.date : todayStr()}" max="${todayStr()}" required />
    </label>
    <label>Photo ${editEntry && editEntry.image ? '' : '(optional)'}
      <input type="file" name="image" id="bmi-image-input" accept="image/*" />
    </label>
    <label class="checkbox-row"><input type="checkbox" name="scanPhoto" id="bmi-scan-toggle" checked /> Auto-read scale numbers from this photo</label>
    <p class="field-hint" id="bmi-scan-status">For a scale/scanner results screen: leave the box above checked to auto-fill the fields below from whatever numbers it shows — that photo is only used to read it and is never saved. For a body photo you just want saved for your own reference, uncheck it first — it's saved with the entry but never sent anywhere, and it never tries to estimate body composition from how you look.</p>
    ${editEntry && editEntry.image ? `
    <div class="edit-image-current">
      <img src="${editEntry.image}" alt="Current screenshot" class="edit-image-preview" />
      <label class="checkbox-row"><input type="checkbox" name="removeImage" /> Remove screenshot</label>
    </div>` : ''}
    <div class="form-row">
      <label>Body Fat % (optional)
        <input type="number" name="value" step="any" value="${editEntry && editEntry.value != null ? editEntry.value : ''}" />
      </label>
      <label>Weight, lb (optional)
        <input type="number" name="weightLb" step="any" value="${editEntry && editEntry.weightLb != null ? editEntry.weightLb : ''}" />
      </label>
    </div>
    ${(() => {
      const pairs = [];
      for (let i = 0; i < BMI_EXTRA_FIELDS.length; i += 2) pairs.push(BMI_EXTRA_FIELDS.slice(i, i + 2));
      return pairs.map(pair => `
    <div class="form-row">
      ${pair.map(f => `<label>${escapeHtml(f.label)}${f.unit ? ` (${escapeHtml(f.unit)})` : ''} (optional)
        <input type="number" name="${f.key}" step="any" value="${editEntry && editEntry[f.key] != null ? editEntry[f.key] : ''}" />
      </label>`).join('')}
    </div>`).join('');
    })()}
    <p class="field-hint">Fill in whatever your scale shows — all optional. Weight is combined with your height setting to calculate BMI.</p>
    <label>Note (optional)
      <input type="text" name="note" maxlength="140" value="${escapeHtml(editEntry ? (editEntry.note || '') : '')}" placeholder="How'd it go?" />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">${editEntry ? 'Save changes' : 'Save'}</button>
    </div>
  </form>`;
}

function renderEditHeightModal() {
  return `
  <form data-form="edit-height">
    <h2>Set height</h2>
    <label>Height (inches)
      <input type="number" name="heightIn" step="any" value="${state.bmi.heightIn != null ? state.bmi.heightIn : ''}" placeholder="e.g. 70 (5'10&quot;)" required />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  </form>`;
}

function renderFoodPhotoAndMacroFields(source, nameFieldHtml, quickFillHtml) {
  return `
    <label>Photo is a...
      <select name="photoMode" id="food-photo-mode">
        <option value="label">Nutrition label (reads the printed numbers)</option>
        <option value="meal">Photo of the meal itself (rough AI estimate)</option>
      </select>
    </label>
    <label>Photo (optional, used only to read the numbers — not saved)
      <input type="file" name="image" id="food-image-input" accept="image/*" />
    </label>
    <p class="field-hint" id="food-scan-status">Pick a photo to auto-fill the fields below, or just type them in. A label photo is read directly; a meal photo gets a rough estimate — not a precise reading — so double-check those numbers especially. The photo itself is only sent for reading and is never saved with the entry.</p>
    ${source && source.image ? `
    <div class="edit-image-current">
      <img src="${source.image}" alt="Current photo" class="edit-image-preview" />
      <label class="checkbox-row"><input type="checkbox" name="removeImage" /> Remove photo (kept from before this changed)</label>
    </div>` : ''}
    ${quickFillHtml || ''}
    ${nameFieldHtml}
    <label>Meal (optional)
      <select name="meal">
        <option value="">— No meal —</option>
        ${MEAL_ORDER.map(key => `<option value="${key}" ${source && source.meal === key ? 'selected' : ''}>${MEAL_LABELS[key]}</option>`).join('')}
      </select>
    </label>
    <label>Serving size (optional)
      <input type="text" name="servingSize" maxlength="60" value="${escapeHtml(source && source.servingSize ? source.servingSize : '')}" placeholder="e.g. 1 cup (240g)" />
    </label>
    <p class="field-hint">What one serving actually is — read automatically off a scanned nutrition label, or type it yourself. Kept as a reference so "2 servings" below means something concrete later.</p>
    <label>Servings
      <input type="number" name="servings" step="any" min="0" value="1" />
    </label>
    <p class="field-hint">Scales the fields below — e.g. if the label is per serving and you're eating 1.5 servings, set this to 1.5. Works whether the numbers came from a scan or you typed them in.</p>
    <div class="form-row">
      <label>Calories
        <input type="number" name="calories" step="any" value="${source && source.calories != null ? source.calories : ''}" />
      </label>
      <label>Protein (g)
        <input type="number" name="protein" step="any" value="${source && source.protein != null ? source.protein : ''}" />
      </label>
    </div>
    <div class="form-row">
      <label>Carbs (g)
        <input type="number" name="carbs" step="any" value="${source && source.carbs != null ? source.carbs : ''}" />
      </label>
      <label>Fat (g)
        <input type="number" name="fat" step="any" value="${source && source.fat != null ? source.fat : ''}" />
      </label>
    </div>
    <div class="form-row">
      <label>Creatine (g)
        <input type="number" name="creatine" step="any" value="${source && source.creatine != null ? source.creatine : ''}" />
      </label>
    </div>`;
}

function renderLogFoodModal() {
  const editEntry = ui.modalEntryId ? state.food.entries.find(e => e.id === ui.modalEntryId) : null;
  const nameField = `
    <label>Food name (optional)
      <input type="text" name="name" maxlength="80" value="${escapeHtml(editEntry ? (editEntry.name || '') : '')}" placeholder="e.g. Greek yogurt" />
    </label>`;
  const quickFillHtml = !editEntry ? `
    <label>Look up a common food (optional)
      <input type="text" id="food-common-lookup" list="common-foods-datalist" placeholder="e.g. Banana, Chicken Breast..." autocomplete="off" />
    </label>
    <datalist id="common-foods-datalist">
      ${COMMON_FOODS.slice().sort((a, b) => a.name.localeCompare(b.name)).map(f => `<option value="${escapeHtml(f.name)}"></option>`).join('')}
    </datalist>
    <p class="field-hint">Fills in the name and macros below with typical reference values for that food — not a measurement of your exact portion or brand, so double-check and adjust if it's not a close match.</p>
    ${state.food.library.length ? `
    <label>Quickly fill from library (optional)
      <select id="food-library-picker">
        <option value="">— Choose a saved food —</option>
        ${state.food.library.map(item => `<option value="${item.id}">${escapeHtml(item.name || 'Unnamed')}${item.servingSize ? ' — ' + escapeHtml(item.servingSize) : ''}</option>`).join('')}
      </select>
    </label>
    <p class="field-hint">Fills in the fields below from something you've saved — still editable before saving. Date and time stay as set below.</p>` : ''}` : '';
  return `
  <form data-form="log-food-entry" ${editEntry ? `data-entry-id="${editEntry.id}"` : ''}>
    <h2>${editEntry ? 'Edit food entry' : 'Log food'}</h2>
    <div class="form-row">
      <label>Date
        <input type="date" name="date" value="${editEntry ? editEntry.date : todayStr()}" max="${todayStr()}" required />
      </label>
      <label>Time (optional)
        <input type="time" name="time" value="${editEntry && editEntry.time ? editEntry.time : nowTimeStr()}" />
      </label>
    </div>
    ${renderFoodPhotoAndMacroFields(editEntry, nameField, quickFillHtml)}
    <label>Note (optional)
      <input type="text" name="note" maxlength="140" value="${escapeHtml(editEntry ? (editEntry.note || '') : '')}" />
    </label>
    ${!editEntry ? `
    <label class="checkbox-row"><input type="checkbox" name="addToLibrary" /> Add to library</label>
    <p class="field-hint">Also saves this as a reusable library item (needs a food name) — separate from logging it today.</p>` : ''}
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">${editEntry ? 'Save changes' : 'Save'}</button>
    </div>
  </form>`;
}

function renderLibraryItemModal() {
  const editItem = ui.modalEntryId ? state.food.library.find(i => i.id === ui.modalEntryId) : null;
  const nameField = `
    <label>Food name
      <input type="text" name="name" maxlength="80" value="${escapeHtml(editItem ? (editItem.name || '') : '')}" placeholder="e.g. Greek yogurt" required />
    </label>`;
  return `
  <form data-form="save-library-item" ${editItem ? `data-entry-id="${editItem.id}"` : ''}>
    <h2>${editItem ? 'Edit saved food' : 'Add to library'}</h2>
    <p class="modal-subtitle">Save something you eat often, so you can log it in one tap later.</p>
    ${renderFoodPhotoAndMacroFields(editItem, nameField)}
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">${editItem ? 'Save changes' : 'Add to library'}</button>
    </div>
  </form>`;
}

function renderModal() {
  if (!ui.modal) return '';
  let inner = '';
  if (ui.modal === 'addGoal') inner = renderAddGoalModal();
  else if (ui.modal === 'logEntry') inner = renderLogEntryModal();
  else if (ui.modal === 'editGoal') inner = renderEditGoalModal();
  else if (ui.modal === 'logBmi') inner = renderLogBmiModal();
  else if (ui.modal === 'editHeight') inner = renderEditHeightModal();
  else if (ui.modal === 'logFood') inner = renderLogFoodModal();
  else if (ui.modal === 'libraryItem') inner = renderLibraryItemModal();
  return `
  <div class="modal-overlay">
    <div class="modal" role="dialog" aria-modal="true">
      ${inner}
    </div>
  </div>`;
}

function renderLightbox() {
  if (!ui.lightboxImage) return '';
  return `
  <div class="lightbox-overlay" tabindex="-1">
    <img src="${ui.lightboxImage}" class="lightbox-img" alt="Screenshot" />
  </div>`;
}

/* ---------- main render ---------- */

function render() {
  const app = document.getElementById('app');
  let mainHtml;
  if (ui.section === 'overview') {
    mainHtml = renderDailyOverviewSection();
  } else if (ui.section === 'bmi') {
    mainHtml = renderBmiSection();
  } else if (ui.section === 'food') {
    mainHtml = ui.foodView === 'library' ? renderFoodLibrarySection() : renderFoodSection();
  } else {
    const goal = ui.view === 'goal' && ui.goalId ? state.goals.find(g => g.id === ui.goalId) : null;
    if (ui.view === 'goal' && !goal) {
      ui.view = 'dashboard';
      ui.goalId = null;
    }
    mainHtml = goal ? renderGoalDetail(goal) : renderExerciseDashboard();
  }

  app.innerHTML = `<div class="app-shell">${renderTopNav()}${mainHtml}${renderGlobalFooter()}</div>${renderModal()}${renderLightbox()}`;

  wireCharts();
  wireAddGoalTypeToggle();

  const modalFirstField = document.querySelector('.modal input, .modal select, .modal textarea');
  if (modalFirstField) modalFirstField.focus();

  const lightboxEl = document.querySelector('.lightbox-overlay');
  if (lightboxEl) lightboxEl.focus();
}

function wireAddGoalTypeToggle() {
  const sel = document.getElementById('add-goal-type');
  if (!sel) return;
  const update = () => {
    document.getElementById('metric-fields').hidden = sel.value !== 'metric';
    document.getElementById('skill-fields').hidden = sel.value !== 'skill';
  };
  sel.addEventListener('change', update);
  update();
}

/* ---------- action handlers: exercise ---------- */

function closeModal() {
  ui.modal = null;
  ui.modalGoalId = null;
  ui.modalEntryId = null;
  ui.lightboxImage = null;
  render();
}

function handleAddGoal(data) {
  const name = (data.get('name') || '').trim();
  if (!name) return;
  const type = data.get('type') === 'skill' ? 'skill' : 'metric';
  const now = new Date().toISOString();
  let goal;
  if (type === 'metric') {
    const target = parseFloat(data.get('target'));
    if (isNaN(target)) {
      alert('Please enter a target value for this goal.');
      return;
    }
    goal = {
      id: uid(),
      type: 'metric',
      name,
      unit: (data.get('unit') || '').trim(),
      direction: data.get('direction') === 'increase' ? 'increase' : 'decrease',
      target,
      createdAt: now,
      entries: []
    };
  } else {
    const milestoneLines = (data.get('milestones') || '').split('\n').map(s => s.trim()).filter(Boolean);
    goal = {
      id: uid(),
      type: 'skill',
      name,
      unit: (data.get('unit') || '').trim(),
      createdAt: now,
      achieved: false,
      achievedDate: null,
      milestones: milestoneLines.map(label => ({ id: uid(), label, done: false, doneDate: null })),
      entries: []
    };
  }
  state.goals.push(goal);
  saveState();
  ui.modal = null;
  ui.modalGoalId = null;
  ui.view = 'goal';
  ui.goalId = goal.id;
  render();
}

function handleLogMetricEntry(goalId, data, image, entryId, removeImage) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const values = data.getAll('value').map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (!values.length) return;
  const value = Math.max(...values);
  const rawReps = data.get('reps');
  const reps = rawReps ? parseInt(rawReps, 10) : null;
  const note = (data.get('note') || '').trim();

  const entry = entryId ? goal.entries.find(e => e.id === entryId) : null;
  const date = data.get('date') || (entry ? entry.date : todayStr());
  if (entry) {
    entry.date = date;
    entry.value = value;
    entry.values = values;
    entry.reps = reps;
    entry.note = note;
    if (image) entry.image = image;
    else if (removeImage) entry.image = null;
  } else {
    goal.entries.push({ id: uid(), date, value, values, reps, note, image: image || null });
  }

  try {
    saveState();
  } catch (err) {
    const target = entry || goal.entries[goal.entries.length - 1];
    target.image = null;
    saveState();
    alert('Entry saved, but the screenshot was too large for local storage and was not kept.');
  }
  ui.modal = null;
  ui.modalGoalId = null;
  ui.modalEntryId = null;
  render();
}

function handleLogSkillEntry(goalId, data, entryId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const values = data.getAll('value').map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (!values.length) return;
  const value = Math.max(...values);
  const note = (data.get('note') || '').trim();

  const entry = entryId ? goal.entries.find(e => e.id === entryId) : null;
  const date = data.get('date') || (entry ? entry.date : todayStr());
  if (entry) {
    entry.date = date;
    entry.value = value;
    entry.values = values;
    entry.note = note;
  } else {
    goal.entries.push({ id: uid(), date, value, values, note });
  }

  saveState();
  ui.modal = null;
  ui.modalGoalId = null;
  ui.modalEntryId = null;
  render();
}

function handleAddMilestone(goalId, data) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const label = (data.get('label') || '').trim();
  if (!label) return;
  goal.milestones.push({ id: uid(), label, done: false, doneDate: null });
  saveState();
  render();
}

function handleEditGoal(goalId, data) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const name = (data.get('name') || '').trim();
  if (name) goal.name = name;
  if (goal.type === 'metric') {
    const target = parseFloat(data.get('target'));
    if (!isNaN(target)) goal.target = target;
    goal.unit = (data.get('unit') || '').trim();
    goal.direction = data.get('direction') === 'increase' ? 'increase' : 'decrease';
  }
  saveState();
  ui.modal = null;
  ui.modalGoalId = null;
  render();
}

function handleDeleteGoal(goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  if (!confirm(`Delete "${goal.name}" and all its history? This can't be undone.`)) return;
  state.goals = state.goals.filter(g => g.id !== goalId);
  saveState();
  ui.view = 'dashboard';
  ui.goalId = null;
  render();
}

function handleDeleteEntry(goalId, entryId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.entries = goal.entries.filter(e => e.id !== entryId);
  saveState();
  render();
}

function handleToggleMilestone(goalId, milestoneId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const m = goal.milestones.find(m => m.id === milestoneId);
  if (!m) return;
  m.done = !m.done;
  m.doneDate = m.done ? todayStr() : null;
  saveState();
  render();
}

function handleDeleteMilestone(goalId, milestoneId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.milestones = goal.milestones.filter(m => m.id !== milestoneId);
  saveState();
  render();
}

function handleMarkAchieved(goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.achieved = true;
  goal.achievedDate = todayStr();
  saveState();
  render();
}

function handleUnmarkAchieved(goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.achieved = false;
  goal.achievedDate = null;
  saveState();
  render();
}

/* ---------- action handlers: BMI ---------- */

function handleLogBmiEntry(data, image, entryId, removeImage) {
  const rawValue = data.get('value');
  const rawWeight = data.get('weightLb');
  const value = rawValue ? parseFloat(rawValue) : null;
  const weightLb = rawWeight ? parseFloat(rawWeight) : null;
  const extras = {};
  BMI_EXTRA_FIELDS.forEach(f => {
    const raw = data.get(f.key);
    extras[f.key] = raw ? parseFloat(raw) : null;
  });
  const hasAnyValue = value != null || weightLb != null || BMI_EXTRA_FIELDS.some(f => extras[f.key] != null);
  if (!hasAnyValue) return;
  const date = data.get('date') || todayStr();
  const note = (data.get('note') || '').trim();

  const entry = entryId ? state.bmi.entries.find(e => e.id === entryId) : null;
  if (entry) {
    entry.date = date;
    entry.value = value;
    entry.weightLb = weightLb;
    Object.assign(entry, extras);
    entry.note = note;
    if (image) entry.image = image;
    else if (removeImage) entry.image = null;
  } else {
    state.bmi.entries.push({ id: uid(), date, value, weightLb, ...extras, note, image: image || null });
  }

  try {
    saveState();
  } catch (err) {
    const target = entry || state.bmi.entries[state.bmi.entries.length - 1];
    target.image = null;
    saveState();
    alert('Entry saved, but the screenshot was too large for local storage and was not kept.');
  }
  ui.modal = null;
  ui.modalEntryId = null;
  render();
}

function handleDeleteBmiEntry(entryId) {
  state.bmi.entries = state.bmi.entries.filter(e => e.id !== entryId);
  saveState();
  render();
}

function handleEditHeight(data) {
  const heightIn = parseFloat(data.get('heightIn'));
  if (isNaN(heightIn) || heightIn <= 0) return;
  state.bmi.heightIn = heightIn;
  saveState();
  ui.modal = null;
  render();
}

/* ---------- action handlers: food ---------- */

const FOOD_MACRO_FIELDS = ['calories', 'protein', 'carbs', 'fat', 'creatine'];
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

// Typical reference values for common whole foods (not brand-specific), used
// by the "Look up a common food" lookup. Creatine is left unset throughout —
// it isn't a meaningfully labeled property of whole foods.
const COMMON_FOODS = [
  { name: 'Chicken Breast, cooked (3 oz)', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: 'Chicken Thigh, cooked (3 oz)', calories: 178, protein: 23, carbs: 0, fat: 9 },
  { name: 'Ground Beef 80/20, cooked (3 oz)', calories: 230, protein: 21, carbs: 0, fat: 15 },
  { name: 'Ground Beef 90/10, cooked (3 oz)', calories: 173, protein: 22, carbs: 0, fat: 9 },
  { name: 'Sirloin Steak, cooked (3 oz)', calories: 156, protein: 26, carbs: 0, fat: 5 },
  { name: 'Salmon, cooked (3 oz)', calories: 175, protein: 19, carbs: 0, fat: 10 },
  { name: 'Tuna, canned in water (3 oz)', calories: 99, protein: 22, carbs: 0, fat: 0.7 },
  { name: 'Shrimp, cooked (3 oz)', calories: 84, protein: 18, carbs: 0.2, fat: 0.9 },
  { name: 'Turkey Breast, cooked (3 oz)', calories: 125, protein: 26, carbs: 0, fat: 1.7 },
  { name: 'Pork Chop, cooked (3 oz)', calories: 197, protein: 26, carbs: 0, fat: 9.4 },
  { name: 'Bacon (2 slices)', calories: 90, protein: 6, carbs: 0.3, fat: 7 },
  { name: 'Egg, large (1)', calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
  { name: 'Egg Whites (1 large)', calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1 },
  { name: 'Tofu, firm (3 oz)', calories: 70, protein: 8, carbs: 1.9, fat: 4 },
  { name: 'Tempeh (3 oz)', calories: 160, protein: 15, carbs: 8, fat: 9 },
  { name: 'Milk, whole (1 cup)', calories: 149, protein: 8, carbs: 12, fat: 8 },
  { name: 'Milk, skim (1 cup)', calories: 83, protein: 8, carbs: 12, fat: 0.2 },
  { name: 'Greek Yogurt, plain nonfat (1 cup)', calories: 130, protein: 23, carbs: 9, fat: 0.7 },
  { name: 'Cottage Cheese, low-fat (1 cup)', calories: 163, protein: 28, carbs: 6, fat: 2.3 },
  { name: 'Cheddar Cheese (1 oz)', calories: 113, protein: 7, carbs: 0.4, fat: 9 },
  { name: 'Mozzarella, part-skim (1 oz)', calories: 72, protein: 6.9, carbs: 0.8, fat: 4.5 },
  { name: 'String Cheese (1 stick)', calories: 80, protein: 6, carbs: 1, fat: 6 },
  { name: 'White Rice, cooked (1 cup)', calories: 205, protein: 4.3, carbs: 45, fat: 0.4 },
  { name: 'Brown Rice, cooked (1 cup)', calories: 216, protein: 5, carbs: 45, fat: 1.8 },
  { name: 'Quinoa, cooked (1 cup)', calories: 222, protein: 8, carbs: 39, fat: 3.6 },
  { name: 'Oats, dry (1/2 cup)', calories: 150, protein: 5, carbs: 27, fat: 2.5 },
  { name: 'White Bread (1 slice)', calories: 75, protein: 2.6, carbs: 14, fat: 1 },
  { name: 'Whole Wheat Bread (1 slice)', calories: 81, protein: 4, carbs: 14, fat: 1.1 },
  { name: 'Pasta, cooked (1 cup)', calories: 221, protein: 8, carbs: 43, fat: 1.3 },
  { name: 'Sweet Potato, baked (1 medium)', calories: 103, protein: 2.3, carbs: 24, fat: 0.2 },
  { name: 'Potato, baked (1 medium)', calories: 161, protein: 4.3, carbs: 37, fat: 0.2 },
  { name: 'Tortilla, flour (1 medium)', calories: 146, protein: 4, carbs: 24, fat: 3.5 },
  { name: 'Bagel, plain (1 medium)', calories: 245, protein: 10, carbs: 48, fat: 1.5 },
  { name: 'Banana, medium (1)', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { name: 'Apple, medium (1)', calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { name: 'Orange, medium (1)', calories: 62, protein: 1.2, carbs: 15, fat: 0.2 },
  { name: 'Strawberries (1 cup)', calories: 49, protein: 1, carbs: 12, fat: 0.5 },
  { name: 'Blueberries (1 cup)', calories: 84, protein: 1.1, carbs: 21, fat: 0.5 },
  { name: 'Grapes (1 cup)', calories: 104, protein: 1.1, carbs: 27, fat: 0.2 },
  { name: 'Watermelon (1 cup)', calories: 46, protein: 0.9, carbs: 11, fat: 0.2 },
  { name: 'Avocado (1/2 medium)', calories: 120, protein: 1.5, carbs: 6, fat: 11 },
  { name: 'Pineapple (1 cup)', calories: 82, protein: 0.9, carbs: 22, fat: 0.2 },
  { name: 'Mango (1 cup)', calories: 99, protein: 1.4, carbs: 25, fat: 0.6 },
  { name: 'Broccoli, cooked (1 cup)', calories: 55, protein: 3.7, carbs: 11, fat: 0.6 },
  { name: 'Spinach, raw (1 cup)', calories: 7, protein: 0.9, carbs: 1.1, fat: 0.1 },
  { name: 'Carrots, raw (1 cup)', calories: 52, protein: 1.2, carbs: 12, fat: 0.3 },
  { name: 'Green Beans, cooked (1 cup)', calories: 44, protein: 2.4, carbs: 10, fat: 0.4 },
  { name: 'Bell Pepper, raw (1 cup)', calories: 30, protein: 1, carbs: 7, fat: 0.3 },
  { name: 'Cucumber (1 cup)', calories: 16, protein: 0.7, carbs: 3.8, fat: 0.1 },
  { name: 'Tomato, medium (1)', calories: 22, protein: 1.1, carbs: 4.8, fat: 0.2 },
  { name: 'Corn, cooked (1 cup)', calories: 143, protein: 5.4, carbs: 31, fat: 2.2 },
  { name: 'Asparagus, cooked (1 cup)', calories: 40, protein: 4.3, carbs: 7.4, fat: 0.4 },
  { name: 'Black Beans, cooked (1 cup)', calories: 227, protein: 15, carbs: 41, fat: 0.9 },
  { name: 'Chickpeas, cooked (1 cup)', calories: 269, protein: 15, carbs: 45, fat: 4.3 },
  { name: 'Lentils, cooked (1 cup)', calories: 230, protein: 18, carbs: 40, fat: 0.8 },
  { name: 'Peanut Butter (2 tbsp)', calories: 190, protein: 8, carbs: 6, fat: 16 },
  { name: 'Almonds (1 oz, ~23 nuts)', calories: 164, protein: 6, carbs: 6, fat: 14 },
  { name: 'Walnuts (1 oz)', calories: 185, protein: 4.3, carbs: 3.9, fat: 18.5 },
  { name: 'Cashews (1 oz)', calories: 157, protein: 5.2, carbs: 8.6, fat: 12.4 },
  { name: 'Chia Seeds (1 tbsp)', calories: 58, protein: 2, carbs: 5, fat: 3.7 },
  { name: 'Olive Oil (1 tbsp)', calories: 119, protein: 0, carbs: 0, fat: 13.5 },
  { name: 'Butter (1 tbsp)', calories: 102, protein: 0.1, carbs: 0, fat: 11.5 },
  { name: 'Honey (1 tbsp)', calories: 64, protein: 0.1, carbs: 17, fat: 0 }
];
let foodServingsBaseline = {};

function currentServingsValue() {
  const el = document.querySelector('[name="servings"]');
  const v = el ? parseFloat(el.value) : 1;
  return isFinite(v) && v > 0 ? v : 1;
}

function handleLogFoodEntry(data, image, entryId, removeImage) {
  const date = data.get('date') || todayStr();
  const time = data.get('time') || null;
  const name = (data.get('name') || '').trim();
  const num = (key) => {
    const raw = data.get(key);
    return raw ? parseFloat(raw) : null;
  };
  const calories = num('calories');
  const protein = num('protein');
  const carbs = num('carbs');
  const fat = num('fat');
  const creatine = num('creatine');
  const meal = data.get('meal') || null;
  const servingSize = (data.get('servingSize') || '').trim() || null;
  const note = (data.get('note') || '').trim();
  const addToLibrary = !entryId && data.get('addToLibrary') === 'on';

  const entry = entryId ? state.food.entries.find(e => e.id === entryId) : null;
  if (entry) {
    entry.date = date;
    entry.time = time;
    entry.name = name;
    entry.calories = calories;
    entry.protein = protein;
    entry.carbs = carbs;
    entry.fat = fat;
    entry.creatine = creatine;
    entry.meal = meal;
    entry.servingSize = servingSize;
    entry.note = note;
    if (image) entry.image = image;
    else if (removeImage) entry.image = null;
  } else {
    state.food.entries.push({ id: uid(), date, time, name, calories, protein, carbs, fat, creatine, meal, servingSize, note, image: image || null });
  }

  let libraryNameMissing = false;
  if (addToLibrary) {
    if (name) state.food.library.push({ id: uid(), name, calories, protein, carbs, fat, creatine, meal, servingSize });
    else libraryNameMissing = true;
  }

  try {
    saveState();
  } catch (err) {
    const target = entry || state.food.entries[state.food.entries.length - 1];
    target.image = null;
    saveState();
    alert('Entry saved, but the photo was too large for local storage and was not kept.');
  }
  if (libraryNameMissing) {
    alert('Entry saved, but a food name is needed to also save it to your library.');
  }
  ui.modal = null;
  ui.modalEntryId = null;
  render();
}

function handleDeleteFoodEntry(entryId) {
  state.food.entries = state.food.entries.filter(e => e.id !== entryId);
  saveState();
  render();
}

function handleDuplicateFoodEntry(entryId) {
  const source = state.food.entries.find(e => e.id === entryId);
  if (!source) return;
  state.food.entries.push({
    id: uid(),
    date: todayStr(),
    time: nowTimeStr(),
    name: source.name,
    calories: source.calories,
    protein: source.protein,
    carbs: source.carbs,
    fat: source.fat,
    creatine: source.creatine,
    meal: source.meal,
    servingSize: source.servingSize || null,
    note: '',
    image: null
  });
  saveState();
  render();
}

function handleSaveLibraryItem(data, entryId) {
  const name = (data.get('name') || '').trim();
  if (!name) return;
  const num = (key) => {
    const raw = data.get(key);
    return raw ? parseFloat(raw) : null;
  };
  const calories = num('calories');
  const protein = num('protein');
  const carbs = num('carbs');
  const fat = num('fat');
  const creatine = num('creatine');
  const meal = data.get('meal') || null;
  const servingSize = (data.get('servingSize') || '').trim() || null;

  const item = entryId ? state.food.library.find(i => i.id === entryId) : null;
  if (item) {
    item.name = name;
    item.calories = calories;
    item.protein = protein;
    item.carbs = carbs;
    item.fat = fat;
    item.creatine = creatine;
    item.meal = meal;
    item.servingSize = servingSize;
  } else {
    state.food.library.push({ id: uid(), name, calories, protein, carbs, fat, creatine, meal, servingSize });
  }
  saveState();
  ui.modal = null;
  ui.modalEntryId = null;
  render();
}

function handleDeleteLibraryItem(id) {
  state.food.library = state.food.library.filter(i => i.id !== id);
  saveState();
  render();
}

function handleQuickLogFromLibrary(id) {
  const item = state.food.library.find(i => i.id === id);
  if (!item) return;
  state.food.entries.push({
    id: uid(),
    date: todayStr(),
    time: nowTimeStr(),
    name: item.name,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    creatine: item.creatine,
    meal: item.meal,
    servingSize: item.servingSize || null,
    note: '',
    image: null
  });
  saveState();
  ui.foodView = 'log';
  render();
}

async function handleScanFoodPhoto(file) {
  const statusEl = document.getElementById('food-scan-status');
  const modeEl = document.getElementById('food-photo-mode');
  const isMealMode = modeEl && modeEl.value === 'meal';
  if (statusEl) statusEl.textContent = isMealMode ? 'Estimating this meal…' : 'Scanning label…';
  try {
    const dataUrl = await resizeImageToDataUrl(file, 1200, 0.85);
    const res = await fetch('/api/scan-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, mode: isMealMode ? 'meal' : 'label' })
    });
    if (!res.ok) throw new Error('Scan failed with status ' + res.status);
    const result = await res.json();
    const setIfPresent = (name, val) => {
      if (val == null) return;
      const el = document.querySelector(`[name="${name}"]`);
      if (el) el.value = val;
    };
    setIfPresent('name', result.name);
    setIfPresent('servingSize', result.servingSize);
    const servings = currentServingsValue();
    FOOD_MACRO_FIELDS.forEach(key => {
      if (result[key] == null) return;
      foodServingsBaseline[key] = result[key];
      const el = document.querySelector(`[name="${key}"]`);
      if (el) el.value = round1(result[key] * servings);
    });
    if (statusEl) {
      if (result.calories == null && result.protein == null) {
        statusEl.textContent = isMealMode
          ? "Couldn't tell what this was from the photo — enter the values manually below."
          : "Couldn't read numbers off that photo — enter the values manually below.";
      } else {
        statusEl.textContent = isMealMode
          ? "Estimated from the photo — this is a rough guess, not a precise reading, so treat it as a starting point and adjust as needed."
          : 'Scanned — double check the numbers below before saving.';
      }
    }
  } catch (err) {
    console.error('Food scan failed', err);
    if (statusEl) statusEl.textContent = "Couldn't reach the scanner — enter the values manually below.";
  }
}

async function handleScanBodyPhoto(file) {
  const statusEl = document.getElementById('bmi-scan-status');
  if (statusEl) statusEl.textContent = 'Reading the photo…';
  try {
    const dataUrl = await resizeImageToDataUrl(file, 1200, 0.85);
    const res = await fetch('/api/scan-body', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    });
    if (!res.ok) throw new Error('Scan failed with status ' + res.status);
    const result = await res.json();
    const setIfPresent = (name, val) => {
      if (val == null) return;
      const el = document.querySelector(`[name="${name}"]`);
      if (el) el.value = val;
    };
    setIfPresent('value', result.bodyFatPct);
    setIfPresent('weightLb', result.weightLb);
    BMI_EXTRA_FIELDS.forEach(f => setIfPresent(f.key, result[f.key]));
    const gotAnything = result.bodyFatPct != null || result.weightLb != null || BMI_EXTRA_FIELDS.some(f => result[f.key] != null);
    if (statusEl) {
      statusEl.textContent = gotAnything
        ? 'Read from photo — double check the numbers below before saving.'
        : "Couldn't read any numbers off that photo — enter the values manually below.";
    }
  } catch (err) {
    console.error('Body scan failed', err);
    if (statusEl) statusEl.textContent = "Couldn't reach the scanner — enter the values manually below.";
  }
}

/* ---------- action handlers: data import/export ---------- */

function handleExportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitness-progress-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.goals)) throw new Error('missing "goals" array');
      if (!confirm('Import this file? It will replace all current data.')) return;
      state = migrateState(parsed);
      saveState();
      ui = { section: 'exercise', view: 'dashboard', goalId: null, modal: null, modalGoalId: null, modalEntryId: null, lightboxImage: null };
      render();
    } catch (err) {
      alert('Could not import that file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ---------- event delegation ---------- */

function onAppClick(e) {
  if (e.target.classList && (e.target.classList.contains('modal-overlay') || e.target.classList.contains('lightbox-overlay'))) {
    closeModal();
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const goalId = actionEl.dataset.goalId;

  switch (action) {
    case 'show-section':
      ui.section = actionEl.dataset.section;
      ui.view = 'dashboard';
      ui.goalId = null;
      ui.foodView = 'log';
      render();
      break;
    case 'show-dashboard':
      ui.view = 'dashboard'; ui.goalId = null; render(); break;
    case 'show-goal':
      ui.view = 'goal'; ui.goalId = goalId; render(); break;
    case 'open-add-goal':
      ui.modal = 'addGoal'; ui.modalGoalId = null; render(); break;
    case 'open-log-entry':
      ui.modal = 'logEntry'; ui.modalGoalId = goalId; ui.modalEntryId = actionEl.dataset.entryId || null; render(); break;
    case 'open-edit-goal':
      ui.modal = 'editGoal'; ui.modalGoalId = goalId; render(); break;
    case 'open-log-bmi':
      ui.modal = 'logBmi'; ui.modalEntryId = actionEl.dataset.entryId || null; render(); break;
    case 'delete-bmi-entry':
      handleDeleteBmiEntry(actionEl.dataset.entryId); break;
    case 'open-edit-height':
      ui.modal = 'editHeight'; render(); break;
    case 'open-log-food':
      foodServingsBaseline = {};
      ui.modal = 'logFood'; ui.modalEntryId = actionEl.dataset.entryId || null; render(); break;
    case 'delete-food-entry':
      handleDeleteFoodEntry(actionEl.dataset.entryId); break;
    case 'duplicate-food-entry':
      handleDuplicateFoodEntry(actionEl.dataset.entryId); break;
    case 'show-food-library':
      ui.foodView = 'library'; render(); break;
    case 'show-food-log':
      ui.foodView = 'log'; render(); break;
    case 'open-library-item':
      foodServingsBaseline = {};
      ui.modal = 'libraryItem'; ui.modalEntryId = actionEl.dataset.entryId || null; render(); break;
    case 'quick-log-library-item':
      handleQuickLogFromLibrary(actionEl.dataset.entryId); break;
    case 'delete-library-item':
      handleDeleteLibraryItem(actionEl.dataset.entryId); break;
    case 'close-modal':
      closeModal(); break;
    case 'delete-goal':
      handleDeleteGoal(goalId); break;
    case 'delete-entry':
      handleDeleteEntry(goalId, actionEl.dataset.entryId); break;
    case 'view-image': {
      const kind = actionEl.dataset.entryKind || 'goal';
      let entry = null;
      if (kind === 'bmi') entry = state.bmi.entries.find(en => en.id === actionEl.dataset.entryId);
      else if (kind === 'food') entry = state.food.entries.find(en => en.id === actionEl.dataset.entryId);
      else {
        const g = state.goals.find(g => g.id === goalId);
        entry = g && g.entries.find(en => en.id === actionEl.dataset.entryId);
      }
      if (entry && entry.image) { ui.lightboxImage = entry.image; render(); }
      break;
    }
    case 'add-value-field': {
      const wrap = document.querySelector('.value-fields-wrap');
      if (wrap) {
        const row = document.createElement('div');
        row.className = 'inline-form value-field-row';
        row.innerHTML = '<input type="number" name="value" step="any" placeholder="Value" /><button type="button" class="btn-icon" data-action="remove-value-field" aria-label="Remove value">&times;</button>';
        wrap.appendChild(row);
        row.querySelector('input').focus();
      }
      break;
    }
    case 'remove-value-field': {
      const row = actionEl.closest('.value-field-row');
      if (row) row.remove();
      break;
    }
    case 'toggle-milestone':
      handleToggleMilestone(goalId, actionEl.dataset.milestoneId); break;
    case 'delete-milestone':
      handleDeleteMilestone(goalId, actionEl.dataset.milestoneId); break;
    case 'mark-achieved':
      handleMarkAchieved(goalId); break;
    case 'unmark-achieved':
      handleUnmarkAchieved(goalId); break;
    case 'export-data':
      handleExportData(); break;
    case 'trigger-import':
      document.getElementById('import-file-input').click(); break;
  }
}

function onAppKeydown(e) {
  if (e.key === 'Escape' && (ui.modal || ui.lightboxImage)) {
    closeModal();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-action="show-goal"]')) {
    e.preventDefault();
    e.target.click();
  }
}

async function onAppSubmit(e) {
  const form = e.target.closest('form');
  if (!form) return;
  e.preventDefault();
  const formType = form.dataset.form;
  const data = new FormData(form);
  switch (formType) {
    case 'add-goal': handleAddGoal(data); break;
    case 'log-metric-entry': {
      const file = data.get('image');
      let image = null;
      if (file && file.size > 0) {
        try {
          image = await resizeImageToDataUrl(file, 900, 0.8);
        } catch (err) {
          console.error('Failed to process screenshot', err);
        }
      }
      const removeImage = data.get('removeImage') === 'on';
      handleLogMetricEntry(form.dataset.goalId, data, image, form.dataset.entryId || null, removeImage);
      break;
    }
    case 'log-skill-entry': handleLogSkillEntry(form.dataset.goalId, data, form.dataset.entryId || null); break;
    case 'add-milestone': handleAddMilestone(form.dataset.goalId, data); break;
    case 'edit-goal': handleEditGoal(form.dataset.goalId, data); break;
    case 'log-bmi-entry': {
      const scanPhoto = data.get('scanPhoto') === 'on';
      const file = data.get('image');
      let image = null;
      if (!scanPhoto && file && file.size > 0) {
        try {
          image = await resizeImageToDataUrl(file, 900, 0.8);
        } catch (err) {
          console.error('Failed to process screenshot', err);
        }
      }
      const removeImage = data.get('removeImage') === 'on';
      handleLogBmiEntry(data, image, form.dataset.entryId || null, removeImage);
      break;
    }
    case 'edit-height': handleEditHeight(data); break;
    case 'log-food-entry': {
      const removeImage = data.get('removeImage') === 'on';
      handleLogFoodEntry(data, null, form.dataset.entryId || null, removeImage);
      break;
    }
    case 'save-library-item':
      handleSaveLibraryItem(data, form.dataset.entryId || null);
      break;
  }
}

async function onAppChange(e) {
  if (e.target.id === 'import-file-input') {
    handleImportFile(e.target.files[0]);
    e.target.value = '';
    return;
  }
  if (e.target.id === 'food-image-input') {
    const file = e.target.files[0];
    if (!file) return;
    await handleScanFoodPhoto(file);
    return;
  }
  if (e.target.id === 'food-common-lookup') {
    const food = COMMON_FOODS.find(f => f.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (!food) return;
    const nameEl = document.querySelector('[name="name"]');
    if (nameEl) nameEl.value = food.name;
    const servings = currentServingsValue();
    FOOD_MACRO_FIELDS.forEach(key => {
      if (food[key] == null) return;
      foodServingsBaseline[key] = food[key];
      const el = document.querySelector(`[name="${key}"]`);
      if (el) el.value = round1(food[key] * servings);
    });
    return;
  }
  if (e.target.id === 'food-library-picker') {
    const id = e.target.value;
    if (!id) return;
    const item = state.food.library.find(i => i.id === id);
    if (!item) return;
    const nameEl = document.querySelector('[name="name"]');
    if (nameEl && item.name) nameEl.value = item.name;
    const mealEl = document.querySelector('[name="meal"]');
    if (mealEl && item.meal) mealEl.value = item.meal;
    const servingSizeEl = document.querySelector('[name="servingSize"]');
    if (servingSizeEl && item.servingSize) servingSizeEl.value = item.servingSize;
    const servings = currentServingsValue();
    FOOD_MACRO_FIELDS.forEach(key => {
      if (item[key] == null) return;
      foodServingsBaseline[key] = item[key];
      const el = document.querySelector(`[name="${key}"]`);
      if (el) el.value = round1(item[key] * servings);
    });
    return;
  }
  if (e.target.name === 'servings') {
    const servings = currentServingsValue();
    FOOD_MACRO_FIELDS.forEach(key => {
      const el = document.querySelector(`[name="${key}"]`);
      if (!el) return;
      if (!(key in foodServingsBaseline)) {
        foodServingsBaseline[key] = el.value !== '' ? parseFloat(el.value) : null;
      }
      const base = foodServingsBaseline[key];
      if (base != null) el.value = round1(base * servings);
    });
    return;
  }
  if (FOOD_MACRO_FIELDS.includes(e.target.name)) {
    const v = e.target.value !== '' ? parseFloat(e.target.value) : null;
    foodServingsBaseline[e.target.name] = v != null ? v / currentServingsValue() : null;
    return;
  }
  if (e.target.id === 'bmi-image-input') {
    const file = e.target.files[0];
    if (!file) return;
    const scanToggle = document.getElementById('bmi-scan-toggle');
    if (scanToggle && !scanToggle.checked) {
      const statusEl = document.getElementById('bmi-scan-status');
      if (statusEl) statusEl.textContent = 'Photo attached for reference — not scanned, not sent anywhere.';
      return;
    }
    await handleScanBodyPhoto(file);
  }
}

/* ---------- init ---------- */

function init() {
  const app = document.getElementById('app');
  app.addEventListener('click', onAppClick);
  app.addEventListener('keydown', onAppKeydown);
  app.addEventListener('submit', onAppSubmit);
  app.addEventListener('change', onAppChange);
  saveState();
  render();
}

document.addEventListener('DOMContentLoaded', init);
