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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/* ---------- data / persistence ---------- */

function defaultState() {
  const now = new Date().toISOString();
  return {
    goals: [
      {
        id: uid(),
        type: 'metric',
        name: 'Body Fat %',
        unit: '%',
        direction: 'decrease',
        target: 10,
        createdAt: now,
        entries: []
      },
      {
        id: uid(),
        type: 'skill',
        name: 'Muscle-Up',
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
      }
    ]
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.goals)) return defaultState();
    return parsed;
  } catch (e) {
    console.error('Failed to load saved data, starting fresh.', e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let ui = { view: 'dashboard', goalId: null, modal: null, modalGoalId: null };

/* ---------- domain logic ---------- */

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

/* ---------- chart (line chart: trend + target reference + crosshair/tooltip) ---------- */

const CHART_W = 640;
const CHART_H = 260;
const CHART_PAD = { top: 24, right: 24, bottom: 32, left: 46 };

function computeChartLayout(entries, target) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const values = sorted.map(e => e.value);
  const allValues = target != null ? [...values, target] : values;
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15 || 1;
  min -= pad;
  max += pad;
  const xFor = (i) => CHART_PAD.left + (sorted.length <= 1 ? innerW / 2 : (i / (sorted.length - 1)) * innerW);
  const yFor = (v) => CHART_PAD.top + innerH - ((v - min) / (max - min)) * innerH;
  const points = sorted.map((e, i) => ({ x: xFor(i), y: yFor(e.value), date: e.date, value: e.value, note: e.note }));
  return { points, min, max, xFor, yFor, innerW, innerH };
}

function renderMetricChart(goal) {
  if (!goal.entries.length) {
    return '<div class="chart-empty">No entries yet — log your first measurement below to start your trend line.</div>';
  }
  const layout = computeChartLayout(goal.entries, goal.target);
  const { points, min, max } = layout;
  const ty = layout.yFor(goal.target);
  const pointsAttr = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const gridLines = [0.25, 0.5, 0.75].map(f => {
    const y = CHART_PAD.top + layout.innerH * f;
    return `<line x1="${CHART_PAD.left}" y1="${y.toFixed(1)}" x2="${CHART_W - CHART_PAD.right}" y2="${y.toFixed(1)}" class="chart-grid" />`;
  }).join('');

  const dots = points.map((p, i) =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" class="chart-dot" data-i="${i}" />`
  ).join('');

  const unit = escapeHtml(goal.unit || '');

  return `
  <div class="chart-wrap" data-goal-id="${goal.id}">
    <svg viewBox="0 0 ${CHART_W} ${CHART_H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(goal.name)} trend chart">
      ${gridLines}
      <line x1="${CHART_PAD.left}" y1="${ty.toFixed(1)}" x2="${CHART_W - CHART_PAD.right}" y2="${ty.toFixed(1)}" class="chart-target-line" />
      <text x="${CHART_W - CHART_PAD.right}" y="${(ty - 8).toFixed(1)}" text-anchor="end" class="chart-target-label">Goal ${goal.target}${unit}</text>
      <polyline points="${pointsAttr}" fill="none" class="chart-line" />
      <line class="chart-crosshair" x1="0" y1="${CHART_PAD.top}" x2="0" y2="${CHART_H - CHART_PAD.bottom}" style="display:none" />
      ${dots}
      <text x="${CHART_PAD.left}" y="${CHART_H - 8}" class="chart-axis-label">${escapeHtml(formatDateLabel(points[0].date))}</text>
      <text x="${CHART_W - CHART_PAD.right}" y="${CHART_H - 8}" text-anchor="end" class="chart-axis-label">${escapeHtml(formatDateLabel(points[points.length - 1].date))}</text>
      <text x="${CHART_PAD.left - 10}" y="${(layout.yFor(max) + 4).toFixed(1)}" text-anchor="end" class="chart-axis-label">${round1(max)}</text>
      <text x="${CHART_PAD.left - 10}" y="${(layout.yFor(min) + 4).toFixed(1)}" text-anchor="end" class="chart-axis-label">${round1(min)}</text>
    </svg>
    <div class="chart-tooltip" hidden></div>
  </div>`;
}

function wireCharts() {
  document.querySelectorAll('.chart-wrap').forEach(wrap => {
    const goalId = wrap.dataset.goalId;
    const goal = state.goals.find(g => g.id === goalId);
    if (!goal || !goal.entries.length) return;
    const layout = computeChartLayout(goal.entries, goal.target);
    const svg = wrap.querySelector('.chart-svg');
    const crosshair = wrap.querySelector('.chart-crosshair');
    const tooltip = wrap.querySelector('.chart-tooltip');
    if (!svg) return;

    function nearestPoint(clientX) {
      const rect = svg.getBoundingClientRect();
      const scaleX = CHART_W / rect.width;
      const xInSvg = (clientX - rect.left) * scaleX;
      let nearest = layout.points[0];
      let bestDist = Infinity;
      for (const p of layout.points) {
        const d = Math.abs(p.x - xInSvg);
        if (d < bestDist) { bestDist = d; nearest = p; }
      }
      return { nearest, rect };
    }

    function showAt(clientX) {
      const { nearest, rect } = nearestPoint(clientX);
      crosshair.setAttribute('x1', nearest.x);
      crosshair.setAttribute('x2', nearest.x);
      crosshair.style.display = '';
      tooltip.hidden = false;
      tooltip.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = `${nearest.value}${goal.unit || ''}`;
      const span = document.createElement('span');
      span.textContent = formatDateLabel(nearest.date);
      tooltip.appendChild(strong);
      tooltip.appendChild(span);
      const scaleXInv = rect.width / CHART_W;
      const scaleYInv = rect.height / CHART_H;
      tooltip.style.left = clamp(nearest.x * scaleXInv, 36, rect.width - 36) + 'px';
      tooltip.style.top = (nearest.y * scaleYInv) + 'px';
    }

    function hide() {
      crosshair.style.display = 'none';
      tooltip.hidden = true;
    }

    svg.addEventListener('pointermove', (e) => showAt(e.clientX));
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('pointerdown', (e) => showAt(e.clientX));
  });
}

/* ---------- views ---------- */

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
      ? `<div class="stat-value">${latest}${escapeHtml(goal.unit)}<span class="stat-target"> / goal ${goal.target}${escapeHtml(goal.unit)}</span></div>`
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

function renderDashboard() {
  const cards = state.goals.map(renderGoalCard).join('');
  return `
  <div class="page-header">
    <div>
      <h1>Fitness Progress</h1>
      <p class="page-subtitle">Track the metrics and skills that matter to you.</p>
    </div>
    <button class="btn btn-primary" type="button" data-action="open-add-goal">+ Add goal</button>
  </div>
  <div class="goal-grid">${cards || '<p class="empty-state">No goals yet — add your first one.</p>'}</div>
  <footer class="app-footer">
    <button class="btn btn-ghost btn-sm" type="button" data-action="export-data">Export data</button>
    <button class="btn btn-ghost btn-sm" type="button" data-action="trigger-import">Import data</button>
    <button class="btn btn-ghost btn-sm btn-danger" type="button" data-action="reset-data">Reset all data</button>
    <input type="file" id="import-file-input" accept="application/json" hidden />
    <p class="footer-note">Data is stored only in this browser (localStorage). Export a backup regularly if that matters to you.</p>
  </footer>`;
}

function renderMetricDetail(goal) {
  const pct = metricProgressPct(goal);
  const achieved = metricAchieved(goal);
  const latest = metricLatest(goal);
  const start = metricBaseline(goal);
  const unit = escapeHtml(goal.unit || '');
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

  const rows = entries.map(e => `
    <tr>
      <td>${escapeHtml(formatDateLabel(e.date))}</td>
      <td>${e.value}${unit}</td>
      <td>${escapeHtml(e.note || '')}</td>
      <td><button class="btn-icon" type="button" data-action="delete-entry" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="Delete entry">&times;</button></td>
    </tr>`).join('');

  const table = entries.length
    ? `<table class="data-table"><thead><tr><th>Date</th><th>Value</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="empty-state">No entries yet.</p>';

  return `
  ${summary}
  <section class="card">
    <div class="card-header-row">
      <h2>Trend</h2>
      <button class="btn btn-primary btn-sm" type="button" data-action="open-log-entry" data-goal-id="${goal.id}">+ Log measurement</button>
    </div>
    ${renderMetricChart(goal)}
  </section>
  <section class="card">
    <h2>History</h2>
    ${table}
  </section>`;
}

function renderSkillDetail(goal) {
  const pct = skillProgressPct(goal);

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
  const rows = entries.map(e => `
    <tr>
      <td>${escapeHtml(formatDateLabel(e.date))}</td>
      <td>${e.successes}/${e.attempts}</td>
      <td>${escapeHtml(e.note || '')}</td>
      <td><button class="btn-icon" type="button" data-action="delete-entry" data-goal-id="${goal.id}" data-entry-id="${e.id}" aria-label="Delete entry">&times;</button></td>
    </tr>`).join('');

  const table = entries.length
    ? `<table class="data-table"><thead><tr><th>Date</th><th>Success / Attempts</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
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
  if (goal.type === 'metric') {
    return `
    <form data-form="log-metric-entry" data-goal-id="${goal.id}">
      <h2>Log a measurement</h2>
      <p class="modal-subtitle">${escapeHtml(goal.name)}</p>
      <label>Date
        <input type="date" name="date" value="${todayStr()}" max="${todayStr()}" required />
      </label>
      <label>Value (${escapeHtml(goal.unit || 'unit')})
        <input type="number" name="value" step="any" required />
      </label>
      <label>Note (optional)
        <input type="text" name="note" maxlength="140" placeholder="How'd it go?" />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`;
  }
  return `
  <form data-form="log-skill-entry" data-goal-id="${goal.id}">
    <h2>Log a practice session</h2>
    <p class="modal-subtitle">${escapeHtml(goal.name)}</p>
    <label>Date
      <input type="date" name="date" value="${todayStr()}" max="${todayStr()}" required />
    </label>
    <div class="form-row">
      <label>Attempts
        <input type="number" name="attempts" min="0" step="1" value="1" required />
      </label>
      <label>Successes
        <input type="number" name="successes" min="0" step="1" value="0" required />
      </label>
    </div>
    <label>Note (optional)
      <input type="text" name="note" maxlength="140" placeholder="e.g. felt strong on the transition" />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Save</button>
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

function renderModal() {
  if (!ui.modal) return '';
  let inner = '';
  if (ui.modal === 'addGoal') inner = renderAddGoalModal();
  else if (ui.modal === 'logEntry') inner = renderLogEntryModal();
  else if (ui.modal === 'editGoal') inner = renderEditGoalModal();
  return `
  <div class="modal-overlay">
    <div class="modal" role="dialog" aria-modal="true">
      ${inner}
    </div>
  </div>`;
}

/* ---------- main render ---------- */

function render() {
  const app = document.getElementById('app');
  let mainHtml;
  const goal = ui.view === 'goal' && ui.goalId ? state.goals.find(g => g.id === ui.goalId) : null;
  if (ui.view === 'goal' && !goal) {
    ui.view = 'dashboard';
    ui.goalId = null;
  }
  mainHtml = goal ? renderGoalDetail(goal) : renderDashboard();

  app.innerHTML = `<div class="app-shell">${mainHtml}</div>${renderModal()}`;

  wireCharts();
  wireAddGoalTypeToggle();

  const modalFirstField = document.querySelector('.modal input, .modal select, .modal textarea');
  if (modalFirstField) modalFirstField.focus();
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

/* ---------- action handlers ---------- */

function closeModal() {
  ui.modal = null;
  ui.modalGoalId = null;
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

function handleLogMetricEntry(goalId, data) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const value = parseFloat(data.get('value'));
  if (isNaN(value)) return;
  const date = data.get('date') || todayStr();
  goal.entries = goal.entries.filter(e => e.date !== date);
  goal.entries.push({ id: uid(), date, value, note: (data.get('note') || '').trim() });
  saveState();
  ui.modal = null;
  ui.modalGoalId = null;
  render();
}

function handleLogSkillEntry(goalId, data) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  const attempts = Math.max(0, parseInt(data.get('attempts'), 10) || 0);
  const successesRaw = Math.max(0, parseInt(data.get('successes'), 10) || 0);
  const date = data.get('date') || todayStr();
  goal.entries.push({
    id: uid(),
    date,
    attempts,
    successes: Math.min(successesRaw, attempts),
    note: (data.get('note') || '').trim()
  });
  saveState();
  ui.modal = null;
  ui.modalGoalId = null;
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
      state = parsed;
      saveState();
      ui = { view: 'dashboard', goalId: null, modal: null, modalGoalId: null };
      render();
    } catch (err) {
      alert('Could not import that file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function handleResetData() {
  if (!confirm('This will erase all goals and history and restore the defaults. Continue?')) return;
  state = defaultState();
  saveState();
  ui = { view: 'dashboard', goalId: null, modal: null, modalGoalId: null };
  render();
}

/* ---------- event delegation ---------- */

function onAppClick(e) {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    closeModal();
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const goalId = actionEl.dataset.goalId;

  switch (action) {
    case 'show-dashboard':
      ui.view = 'dashboard'; ui.goalId = null; render(); break;
    case 'show-goal':
      ui.view = 'goal'; ui.goalId = goalId; render(); break;
    case 'open-add-goal':
      ui.modal = 'addGoal'; ui.modalGoalId = null; render(); break;
    case 'open-log-entry':
      ui.modal = 'logEntry'; ui.modalGoalId = goalId; render(); break;
    case 'open-edit-goal':
      ui.modal = 'editGoal'; ui.modalGoalId = goalId; render(); break;
    case 'close-modal':
      closeModal(); break;
    case 'delete-goal':
      handleDeleteGoal(goalId); break;
    case 'delete-entry':
      handleDeleteEntry(goalId, actionEl.dataset.entryId); break;
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
    case 'reset-data':
      handleResetData(); break;
  }
}

function onAppKeydown(e) {
  if (e.key === 'Escape' && ui.modal) {
    closeModal();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-action="show-goal"]')) {
    e.preventDefault();
    e.target.click();
  }
}

function onAppSubmit(e) {
  const form = e.target.closest('form');
  if (!form) return;
  e.preventDefault();
  const formType = form.dataset.form;
  const data = new FormData(form);
  switch (formType) {
    case 'add-goal': handleAddGoal(data); break;
    case 'log-metric-entry': handleLogMetricEntry(form.dataset.goalId, data); break;
    case 'log-skill-entry': handleLogSkillEntry(form.dataset.goalId, data); break;
    case 'add-milestone': handleAddMilestone(form.dataset.goalId, data); break;
    case 'edit-goal': handleEditGoal(form.dataset.goalId, data); break;
  }
}

function onAppChange(e) {
  if (e.target.id === 'import-file-input') {
    handleImportFile(e.target.files[0]);
    e.target.value = '';
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
