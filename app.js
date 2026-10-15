/* WORAD Project Plan — static planner for GitHub Pages.
   Source of truth: plan.json in the repo. Edits in the browser are kept in this
   browser (localStorage) until you export plan.json and commit it. */
(() => {
'use strict';

const STORE = 'worad-plan-edits-v1';
const THEME = 'worad-plan-theme';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TYPES = { build: 'Build', deliv: 'Deliverable', mgmt: 'Management', indiv: 'Individual' };
const MSTYPES = { deadline: 'Deadline', freeze: 'Freeze', order: 'Order cut-off', gate: 'Review gate' };

let published = null;   // plan.json as committed
let plan = null;        // working copy
let tab = 'gantt';
let personFilter = '';

const $ = (s, r = document) => r.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- storage ---------- */
function saveLocal() {
  plan.updated = new Date().toISOString().slice(0, 10);
  try { localStorage.setItem(STORE, JSON.stringify(plan)); } catch (e) { /* storage unavailable */ }
  updateBanner();
}
function clearLocal() { try { localStorage.removeItem(STORE); } catch (e) {} }
function readLocal() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
const strip = p => { const c = clone(p); delete c.updated; return JSON.stringify(c); };
const hasLocalChanges = () => published && strip(plan) !== strip(published);

/* ---------- dates ---------- */
function monday(w) {
  const [y, m, d] = plan.project.week1Monday.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7 * (w - 1)));
}
function dayOf(w, day) { const d = monday(w); d.setUTCDate(d.getUTCDate() + Number(day || 0)); return d; }
const iso = d => d.toISOString().slice(0, 10);
const fmt = (d, opts = { day: 'numeric', month: 'short' }) => d.toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
const fmtLong = d => fmt(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
function currentWeekFloat() {
  const now = new Date();
  const t = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  return (t - monday(1).getTime()) / (7 * 864e5) + 1;
}
function parseWeeks(s) {
  const out = new Set();
  String(s).split(',').map(x => x.trim()).filter(Boolean).forEach(part => {
    const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.add(i); }
    else if (/^\d+$/.test(part)) out.add(+part);
  });
  return [...out].sort((a, b) => a - b);
}
function weeksToText(arr) {
  const a = [...arr].sort((x, y) => x - y), out = [];
  for (let i = 0; i < a.length; i++) {
    let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(i === j ? `${a[i]}` : `${a[i]}–${a[j]}`); i = j;
  }
  return out.join(', ');
}

/* ---------- lookups ---------- */
const role = id => plan.roles.find(r => r.id === id);
const roleLabel = r => r ? (r.holder ? r.holder : r.title) : '?';
const roleFull = r => r ? (r.holder ? `${r.holder} (${r.title})` : r.title) : '?';
const wpOf = t => plan.workPackages.find(w => w.id === t.wp) || { type: 'build', name: '?' };
const ownersText = t => (t.owners || []).length === plan.roles.length && plan.roles.length > 1
  ? 'Everyone' : (t.owners || []).map(id => roleLabel(role(id))).join(', ') || '—';
const sortTasks = () => plan.tasks.sort((a, b) => {
  const pa = a.id.split('.').map(Number), pb = b.id.split('.').map(Number);
  return (pa[0] - pb[0]) || ((pa[1] || 0) - (pb[1] || 0));
});
const sortMilestones = () => plan.milestones.sort((a, b) => (a.week - b.week) || (a.day - b.day));

/* ---------- checks ---------- */
function issues() {
  const out = [], P = plan.project, ids = new Set(plan.tasks.map(t => t.id));
  const seen = new Set();
  plan.tasks.forEach(t => {
    if (seen.has(t.id)) out.push({ id: t.id, msg: `${t.id} is used by more than one task.` });
    seen.add(t.id);
    if (t.start > t.end) out.push({ id: t.id, msg: `${t.id} ends (Wk ${t.end}) before it starts (Wk ${t.start}).` });
    if (t.start < P.firstWeek || t.end > P.lastWeek) out.push({ id: t.id, msg: `${t.id} runs outside the plan range (Wk ${P.firstWeek}–${P.lastWeek}).` });
    if (!(t.owners || []).length) out.push({ id: t.id, msg: `${t.id} has no owner.` });
    (t.deps || []).forEach(d => {
      if (!ids.has(d)) { out.push({ id: t.id, msg: `${t.id} depends on ${d}, which doesn't exist.` }); return; }
      const dt = plan.tasks.find(x => x.id === d);
      if (t.start < dt.start || t.end < dt.end)
        out.push({ id: t.id, msg: `${t.id} (Wk ${t.start}–${t.end}) can't run ahead of ${d} (Wk ${dt.start}–${dt.end}): it starts before ${d} starts or finishes before ${d} finishes.` });
    });
  });
  return out;
}

/* ---------- banner ---------- */
function updateBanner() {
  const b = $('#banner');
  if (!published) {
    b.hidden = false;
    b.innerHTML = `<p>plan.json couldn't be loaded, so you're working from the copy saved in this browser. Run the app from GitHub Pages or a local server, or import a plan.json on the Save &amp; export tab.</p>`;
    return;
  }
  if (hasLocalChanges()) {
    b.hidden = false;
    b.innerHTML = `<p><b>Unsaved to GitHub.</b> Your edits are stored in this browser only. Export plan.json and commit it to the repo so the team sees them.</p>
      <button class="btn primary" data-act="export-json">Export plan.json</button>
      <button class="btn" data-act="revert">Discard my edits</button>`;
  } else b.hidden = true;
}

/* ---------- render ---------- */
function render() {
  sortTasks(); sortMilestones();
  $('#title').textContent = plan.project.name;
  $('#subtitle').textContent = plan.project.subtitle;
  document.title = plan.project.name;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const v = $('#view');
  ({ gantt: renderGantt, tasks: renderTasks, roles: renderRoles, milestones: renderMilestones, settings: renderSettings, export: renderExport })[tab](v);
  updateBanner();
}

/* Gantt */
function weekCells(cls = '') {
  const P = plan.project, N = P.lastWeek - P.firstWeek + 1;
  let s = '';
  for (let w = P.firstWeek; w <= P.lastWeek; w++) {
    const i = w - P.firstWeek;
    const extra = P.vacationWeeks.includes(w) ? ' vac' : P.examWeeks.includes(w) ? ' exam' : '';
    s += `<div class="wkcell${extra} ${cls}" style="left:${i / N * 100}%;width:${100 / N}%"></div>`;
  }
  return s;
}
const pos = w => { const P = plan.project; return (w - P.firstWeek) / (P.lastWeek - P.firstWeek + 1) * 100; };
const span = (a, b) => { const P = plan.project; return (b - a + 1) / (P.lastWeek - P.firstWeek + 1) * 100; };

function renderGantt(v) {
  const P = plan.project, N = P.lastWeek - P.firstWeek + 1;
  const bad = new Set(issues().map(i => i.id));
  const cw = currentWeekFloat();
  const todayLine = cw >= P.firstWeek && cw < P.lastWeek + 1
    ? `<div class="today" style="left:calc(var(--lab) + (100% - var(--lab)) * ${(cw - P.firstWeek) / N})" title="Today"></div>` : '';

  let head = '';
  for (let w = P.firstWeek; w <= P.lastWeek; w++) {
    const i = w - P.firstWeek, d = monday(w);
    const extra = P.vacationWeeks.includes(w) ? ' vac' : P.examWeeks.includes(w) ? ' exam' : '';
    head += `<div class="wkcell${extra}" style="left:${i / N * 100}%;width:${100 / N}%"><b>${w}</b>${fmt(d).replace(' ', '<br>')}</div>`;
  }
  const sprints = plan.sprints.map(s => `<div class="sprintbar" style="left:calc(${pos(s.start)}% + 2px);width:calc(${span(s.start, s.end)}% - 4px)">${esc(s.name)}</div>`).join('');
  const ms = plan.milestones.map((m, i) => {
    const frac = (Number(m.day) + 0.5) / 7;
    return `<span class="ms ${esc(m.type)}" data-tip="${esc(`Wk ${m.week} · ${fmtLong(dayOf(m.week, m.day))}${m.time ? ' ' + m.time : ''} · ${m.label}`)}" style="left:${pos(m.week) + span(m.week, m.week) * frac}%"></span>`;
  }).join('');

  let rows = '';
  plan.workPackages.forEach(wp => {
    rows += `<div class="grow wp"><div class="glab"><span class="c">${esc(wp.id)}.0</span>${esc(wp.name)}</div><div class="track">${weekCells()}</div></div>`;
    plan.tasks.filter(t => t.wp === wp.id).forEach(t => {
      const dim = personFilter && !(t.owners || []).includes(personFilter);
      const tip = `${t.id} ${t.name} · Wk ${t.start}–${t.end} (${fmt(monday(t.start))} – ${fmt(dayOf(t.end, 4))}) · ${ownersText(t)}${t.deps?.length ? ' · after ' + t.deps.join(', ') : ''}`;
      rows += `<div class="grow"><div class="glab${dim ? ' dim' : ''}" title="${esc(t.name)}"><span class="c">${esc(t.id)}</span>${esc(t.name)}<span class="who">${esc(ownersText(t))}</span></div>
        <div class="track">${weekCells()}
          <div class="bar ${wp.type}${t.continuous ? ' thin' : ''}${bad.has(t.id) ? ' bad' : ''}${dim ? ' dim' : ''}" data-id="${esc(t.id)}" data-tip="${esc(tip)}"
            style="left:calc(${pos(t.start)}% + 2px);width:calc(${span(t.start, t.end)}% - 4px)"><span class="h l" data-h="l"></span><span class="h r" data-h="r"></span></div>
        </div></div>`;
    });
  });

  // load heatmap: active, non-continuous tasks per role per week
  let heat = '';
  plan.roles.forEach(r => {
    let cells = '';
    for (let w = P.firstWeek; w <= P.lastWeek; w++) {
      const n = plan.tasks.filter(t => !t.continuous && (t.owners || []).includes(r.id) && t.start <= w && t.end >= w).length;
      if (!n) continue;
      const col = n >= 4 ? 'var(--deadline)' : n === 3 ? 'var(--warn)' : n === 2 ? 'var(--build)' : 'var(--build)';
      const op = n === 1 ? .35 : n === 2 ? .7 : .9;
      cells += `<div class="hc" style="left:calc(${pos(w)}% + 2px);width:calc(${span(w, w)}% - 4px);background:color-mix(in srgb, ${col} ${op * 100}%, transparent);color:${n >= 2 ? '#fff' : 'var(--fg)'}" data-tip="${esc(`${roleFull(r)} · Wk ${w}: ${n} task${n > 1 ? 's' : ''} — ${plan.tasks.filter(t => !t.continuous && (t.owners || []).includes(r.id) && t.start <= w && t.end >= w).map(t => t.id).join(', ')}`)}">${n}</div>`;
    }
    heat += `<div class="grow"><div class="glab"><span class="c">${esc(r.code)}</span>${esc(roleLabel(r))}</div><div class="track">${weekCells()}${cells}</div></div>`;
  });

  const iss = issues();
  v.innerHTML = `<div class="stack">
  <section>
    <div class="gtools">
      <label class="row"><span class="eyebrow">Highlight</span>
        <select id="personSel"><option value="">Everyone</option>${plan.roles.map(r => `<option value="${esc(r.id)}"${personFilter === r.id ? ' selected' : ''}>${esc(roleFull(r))}</option>`).join('')}</select></label>
      <span class="muted" style="font-size:13px">Drag a bar to move it; drag its ends to change the start or end week.</span>
    </div>
    <div class="legend">
      <span><i style="background:var(--build)"></i>Build</span><span><i style="background:var(--deliv)"></i>Deliverable</span>
      <span><i style="background:var(--mgmt)"></i>Management</span><span><i style="background:var(--indiv)"></i>Individual</span>
      <span><i class="d" style="background:var(--deadline)"></i>Deadline</span><span><i class="d" style="background:var(--freeze)"></i>Freeze</span>
      <span><i class="d" style="background:var(--order)"></i>Order cut-off</span><span><i class="d" style="background:var(--gate)"></i>Review gate</span>
      <span><i style="background:repeating-linear-gradient(135deg,var(--muted) 0 2px,transparent 2px 4px)"></i>Vacation</span>
      <span><i style="background:repeating-linear-gradient(0deg,var(--muted) 0 1px,transparent 1px 3px)"></i>Exams</span>
      <span><i style="background:var(--today);width:2px"></i>Today</span>
    </div>
    <div class="scroll"><div class="gantt" id="gantt">
      <div class="grow ghead"><div class="glab eyebrow" style="display:flex;align-items:center">Week · Monday</div><div class="track">${head}</div></div>
      <div class="grow"><div class="glab muted"><span class="c">—</span>Sprints</div><div class="track">${weekCells()}${sprints}</div></div>
      <div class="grow"><div class="glab muted"><span class="c">◆</span>Milestones</div><div class="track">${weekCells()}${ms}</div></div>
      ${rows}${todayLine}
    </div></div>
  </section>
  <section>
    <h2>Checks</h2>
    ${iss.length ? `<div class="warnlist">${iss.map(i => `<div>${esc(i.msg)}</div>`).join('')}</div>` : `<div class="okline">No dependency or range problems.</div>`}
  </section>
  <section>
    <h2>Workload by person</h2>
    <p class="muted">Active tasks per week, not counting continuous ones (meetings, logs, the living report). Three or more in a week is worth rebalancing.</p>
    <div class="scroll"><div class="gantt heat">${heat}</div></div>
  </section></div>`;

  $('#personSel').addEventListener('change', e => { personFilter = e.target.value; render(); });
  bindDrag();
}

function bindDrag() {
  const g = $('#gantt'); if (!g) return;
  g.querySelectorAll('.bar').forEach(bar => {
    bar.addEventListener('pointerdown', e => {
      const t = plan.tasks.find(x => x.id === bar.dataset.id); if (!t) return;
      e.preventDefault();
      const mode = e.target.dataset.h || 'move';
      const track = bar.parentElement, P = plan.project, N = P.lastWeek - P.firstWeek + 1;
      const colW = track.getBoundingClientRect().width / N, x0 = e.clientX;
      let ns = t.start, ne = t.end;
      bar.setPointerCapture(e.pointerId); bar.classList.add('dragging');
      const move = ev => {
        const d = Math.round((ev.clientX - x0) / colW);
        if (mode === 'move') { const len = t.end - t.start; ns = Math.min(Math.max(t.start + d, P.firstWeek), P.lastWeek - len); ne = ns + len; }
        else if (mode === 'l') { ns = Math.min(Math.max(t.start + d, P.firstWeek), t.end); ne = t.end; }
        else { ne = Math.max(Math.min(t.end + d, P.lastWeek), t.start); ns = t.start; }
        bar.style.left = `calc(${pos(ns)}% + 2px)`; bar.style.width = `calc(${span(ns, ne)}% - 4px)`;
        showTip(ev, `${t.id}: Wk ${ns}–${ne} (${fmt(monday(ns))} – ${fmt(dayOf(ne, 4))})`);
      };
      const up = () => {
        bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
        hideTip();
        if (ns !== t.start || ne !== t.end) { t.start = ns; t.end = ne; saveLocal(); }
        render();
      };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
  });
}

/* tooltip */
let tipEl = null;
function showTip(e, text) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
  tipEl.textContent = text; tipEl.hidden = false;
  const x = Math.min(e.clientX + 12, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = x + 'px'; tipEl.style.top = (e.clientY + 14) + 'px';
}
function hideTip() { if (tipEl) tipEl.hidden = true; }
document.addEventListener('pointermove', e => {
  if (document.querySelector('.bar.dragging')) return;
  const el = e.target.closest?.('[data-tip]');
  if (el) showTip(e, el.dataset.tip); else hideTip();
});

/* Tasks */
function renderTasks(v) {
  const bad = new Set(issues().map(i => i.id));
  let body = '';
  plan.workPackages.forEach(wp => {
    body += `<tr class="wp"><td class="code">${esc(wp.id)}.0</td><td colspan="7">${esc(wp.name)} <span class="chip ${wp.type}">${TYPES[wp.type]}</span></td>
      <td><button class="btn" data-act="add-task" data-wp="${esc(wp.id)}">+ Task</button></td></tr>`;
    plan.tasks.filter(t => t.wp === wp.id).forEach(t => {
      const i = plan.tasks.indexOf(t);
      body += `<tr class="${bad.has(t.id) ? 'bad' : ''}">
        <td><input type="text" id="t${i}-id" data-t="${i}" data-f="id" value="${esc(t.id)}" style="width:52px" class="mono" aria-label="WBS code"></td>
        <td style="min-width:260px"><input type="text" id="t${i}-name" class="w-full" data-t="${i}" data-f="name" value="${esc(t.name)}" aria-label="Task name"></td>
        <td><input type="number" id="t${i}-start" data-t="${i}" data-f="start" value="${t.start}" aria-label="Start week"></td>
        <td><input type="number" id="t${i}-end" data-t="${i}" data-f="end" value="${t.end}" aria-label="End week"></td>
        <td class="num muted">${fmt(monday(t.start))} – ${fmt(dayOf(t.end, 4))}</td>
        <td><div class="owners">${plan.roles.map(r => `<button type="button" data-own="${i}" data-role="${esc(r.id)}" aria-pressed="${(t.owners || []).includes(r.id)}" title="${esc(roleFull(r))}">${esc(r.code)}</button>`).join('')}</div></td>
        <td><input type="text" id="t${i}-deps" data-t="${i}" data-f="deps" value="${esc((t.deps || []).join(', '))}" style="width:110px" class="mono" aria-label="Depends on"></td>
        <td style="text-align:center"><input type="checkbox" id="t${i}-cont" data-t="${i}" data-f="continuous" ${t.continuous ? 'checked' : ''} aria-label="Continuous"></td>
        <td><button class="icon" data-act="del-task" data-i="${i}" aria-label="Delete ${esc(t.id)}">✕</button></td></tr>`;
    });
  });
  v.innerHTML = `<section>
    <p class="muted">Change a value and press Enter or click away to apply it. Owner codes toggle on and off; hover one to see the person. Dependencies are WBS codes separated by commas. Continuous tasks show as thin bars and don't count towards workload.</p>
    <div class="scroll"><table><thead><tr><th>WBS</th><th>Task</th><th>Start wk</th><th>End wk</th><th>Dates</th><th>Owners</th><th>Depends on</th><th>Cont.</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
  </section>`;
}

/* Roles */
function renderRoles(v) {
  const rows = plan.roles.map((r, i) => {
    const owned = plan.tasks.filter(t => (t.owners || []).includes(r.id));
    return `<tr>
      <td><input type="text" id="r${i}-code" data-r="${i}" data-f="code" value="${esc(r.code)}" style="width:56px" class="mono" aria-label="Short code"></td>
      <td><input type="text" id="r${i}-holder" data-r="${i}" data-f="holder" value="${esc(r.holder)}" placeholder="Name" style="width:150px" aria-label="Role holder"></td>
      <td style="min-width:220px"><input type="text" id="r${i}-title" class="w-full" data-r="${i}" data-f="title" value="${esc(r.title)}" aria-label="Role"></td>
      <td style="min-width:180px"><input type="text" id="r${i}-pfs" class="w-full" data-r="${i}" data-f="pfsHat" value="${esc(r.pfsHat)}" aria-label="PFS hat"></td>
      <td style="min-width:180px"><input type="text" id="r${i}-rep" class="w-full" data-r="${i}" data-f="reportHat" value="${esc(r.reportHat)}" aria-label="Report hat"></td>
      <td class="num">${owned.length}</td>
      <td><button class="icon" data-act="del-role" data-i="${i}" aria-label="Delete role">✕</button></td></tr>`;
  }).join('');
  v.innerHTML = `<section>
    <p class="muted">Put each person's name against their role. Names replace role titles across the Gantt, workload chart and exports. If someone changes role, change the name here; their tasks follow the role.</p>
    <div class="scroll"><table><thead><tr><th>Code</th><th>Holder</th><th>Build role</th><th>PFS hat</th><th>Report hat</th><th>Tasks</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div><button class="btn" data-act="add-role">+ Role</button></div>
  </section>`;
}

/* Milestones */
function renderMilestones(v) {
  const rows = plan.milestones.map((m, i) => `<tr>
    <td><input type="number" id="m${i}-week" data-m="${i}" data-f="week" value="${m.week}" aria-label="Week"></td>
    <td><select id="m${i}-day" data-m="${i}" data-f="day" aria-label="Day">${DAYS.map((d, j) => `<option value="${j}"${+m.day === j ? ' selected' : ''}>${d}</option>`).join('')}</select></td>
    <td><input type="text" id="m${i}-time" data-m="${i}" data-f="time" value="${esc(m.time)}" placeholder="—" style="width:64px" class="mono" aria-label="Time"></td>
    <td class="num">${fmtLong(dayOf(m.week, m.day))}</td>
    <td><select id="m${i}-type" data-m="${i}" data-f="type" aria-label="Type">${Object.entries(MSTYPES).map(([k, n]) => `<option value="${k}"${m.type === k ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
    <td style="min-width:320px"><input type="text" id="m${i}-label" class="w-full" data-m="${i}" data-f="label" value="${esc(m.label)}" aria-label="Milestone"></td>
    <td><button class="icon" data-act="del-ms" data-i="${i}" aria-label="Delete milestone">✕</button></td></tr>`).join('');
  v.innerHTML = `<section>
    <p class="muted">Freezes, order cut-offs, review gates and module deadlines. Set the week and day; the date is calculated from the Week 1 Monday in Settings.</p>
    <div class="scroll"><table><thead><tr><th>Week</th><th>Day</th><th>Time</th><th>Date</th><th>Type</th><th>Milestone</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div><button class="btn" data-act="add-ms">+ Milestone</button></div>
  </section>`;
}

/* Settings */
function renderSettings(v) {
  const P = plan.project;
  const wps = plan.workPackages.map((w, i) => `<tr>
    <td><input type="text" id="w${i}-id" data-w="${i}" data-f="id" value="${esc(w.id)}" style="width:44px" class="mono" aria-label="WP number"></td>
    <td style="min-width:240px"><input type="text" id="w${i}-name" class="w-full" data-w="${i}" data-f="name" value="${esc(w.name)}" aria-label="Work package"></td>
    <td><select id="w${i}-type" data-w="${i}" data-f="type" aria-label="Type">${Object.entries(TYPES).map(([k, n]) => `<option value="${k}"${w.type === k ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
    <td class="num">${plan.tasks.filter(t => t.wp === w.id).length}</td>
    <td><button class="icon" data-act="del-wp" data-i="${i}" aria-label="Delete work package">✕</button></td></tr>`).join('');
  const sps = plan.sprints.map((s, i) => `<tr>
    <td><input type="text" id="s${i}-name" data-s="${i}" data-f="name" value="${esc(s.name)}" style="width:70px" class="mono" aria-label="Sprint name"></td>
    <td><input type="number" id="s${i}-start" data-s="${i}" data-f="start" value="${s.start}" aria-label="Start week"></td>
    <td><input type="number" id="s${i}-end" data-s="${i}" data-f="end" value="${s.end}" aria-label="End week"></td>
    <td class="num muted">${fmt(monday(s.start))} – ${fmt(dayOf(s.end, 4))}</td>
    <td><button class="icon" data-act="del-sprint" data-i="${i}" aria-label="Delete sprint">✕</button></td></tr>`).join('');
  v.innerHTML = `<div class="stack">
  <section><h2>Project</h2>
    <div class="cards"><div class="card">
      <div class="field"><label for="p-name">Plan name</label><input type="text" id="p-name" data-p="name" value="${esc(P.name)}"></div>
      <div class="field"><label for="p-sub">Subtitle</label><input type="text" id="p-sub" data-p="subtitle" value="${esc(P.subtitle)}"></div>
    </div><div class="card">
      <div class="field"><label for="p-w1">Monday of Week 1</label><input type="date" id="p-w1" data-p="week1Monday" value="${esc(P.week1Monday)}"></div>
      <div class="row"><div class="field"><label for="p-first">First week shown</label><input type="number" id="p-first" data-p="firstWeek" value="${P.firstWeek}"></div>
      <div class="field"><label for="p-last">Last week shown</label><input type="number" id="p-last" data-p="lastWeek" value="${P.lastWeek}"></div></div>
    </div><div class="card">
      <div class="field"><label for="p-vac">Vacation weeks</label><input type="text" id="p-vac" data-p="vacationWeeks" value="${esc(weeksToText(P.vacationWeeks))}" class="mono"></div>
      <div class="field"><label for="p-exam">Exam weeks</label><input type="text" id="p-exam" data-p="examWeeks" value="${esc(weeksToText(P.examWeeks))}" class="mono"></div>
      <p class="muted" style="font-size:12.5px">Ranges and lists, e.g. 11–14, 25–29</p>
    </div></div>
  </section>
  <section><h2>Sprints</h2>
    <div class="scroll"><table><thead><tr><th>Name</th><th>Start wk</th><th>End wk</th><th>Dates</th><th></th></tr></thead><tbody>${sps}</tbody></table></div>
    <div class="row"><button class="btn" data-act="add-sprint">+ Sprint</button><button class="btn" data-act="gen-sprints">Regenerate 2-week sprints (skips vacations)</button></div>
  </section>
  <section><h2>Work packages</h2>
    <div class="scroll"><table><thead><tr><th>WP</th><th>Name</th><th>Type</th><th>Tasks</th><th></th></tr></thead><tbody>${wps}</tbody></table></div>
    <div><button class="btn" data-act="add-wp">+ Work package</button></div>
  </section></div>`;
}

/* Export */
function taskCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  let s = 'WBS,Work package,Task,Owners,Start week,End week,Start date,End date,Depends on,Continuous\n';
  plan.tasks.forEach(t => {
    s += [t.id, wpOf(t).name, t.name, ownersText(t), t.start, t.end, iso(monday(t.start)), iso(dayOf(t.end, 4)), (t.deps || []).join(' '), t.continuous ? 'yes' : 'no'].map(q).join(',') + '\n';
  });
  plan.milestones.forEach(m => {
    s += ['M', MSTYPES[m.type], m.label + (m.time ? ` (${m.time})` : ''), '', m.week, m.week, iso(dayOf(m.week, m.day)), iso(dayOf(m.week, m.day)), '', 'no'].map(q).join(',') + '\n';
  });
  return s;
}
function jiraCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const sprintFor = w => (plan.sprints.find(s => s.start <= w && s.end >= w) || {}).name || '';
  let s = 'Issue ID,Issue Type,Summary,Parent,Start date,Due date,Assignee,Labels,Sprint,Description\n';
  plan.workPackages.forEach((wp, i) => {
    const ts = plan.tasks.filter(t => t.wp === wp.id);
    const st = ts.length ? Math.min(...ts.map(t => t.start)) : plan.project.firstWeek;
    const en = ts.length ? Math.max(...ts.map(t => t.end)) : plan.project.firstWeek;
    s += [1000 + i, 'Epic', `WP${wp.id} ${wp.name}`, '', iso(monday(st)), iso(dayOf(en, 4)), '', wp.type, '', `Work package ${wp.id}`].map(q).join(',') + '\n';
  });
  plan.tasks.forEach((t, i) => {
    const epic = 1000 + plan.workPackages.findIndex(w => w.id === t.wp);
    const first = role((t.owners || [])[0]);
    const desc = `WBS ${t.id}. Owners: ${ownersText(t)}.${t.deps?.length ? ' Depends on ' + t.deps.join(', ') + '.' : ''}`;
    s += [2000 + i, 'Task', `${t.id} ${t.name}`, epic, iso(monday(t.start)), iso(dayOf(t.end, 4)), first?.holder || '', wpOf(t).type, t.continuous ? '' : sprintFor(t.start), desc].map(q).join(',') + '\n';
  });
  return s;
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
function renderExport(v) {
  v.innerHTML = `<div class="stack">
  <section><h2>Save your changes to GitHub</h2>
    <ol class="steps">
      <li>Click <b>Export plan.json</b>. It downloads the plan with all your edits.</li>
      <li>In the repo on GitHub, open <span class="mono">plan.json</span> → <b>…</b> → <b>Upload files</b> (or drag the file onto the repo page), and commit it.</li>
      <li>GitHub Pages republishes within a minute or two. Then click <b>Discard my edits</b> here so this browser shows the published plan again.</li>
    </ol>
    <p class="muted">Each commit is a dated snapshot of the plan. That history is useful evidence of monitoring and adapting the plan for the report and SLDR.</p>
    <div class="row">
      <button class="btn primary" data-act="export-json">Export plan.json</button>
      <label class="btn" for="importFile" style="display:inline-flex;align-items:center">Import plan.json</label>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
      <button class="btn danger" data-act="revert"${published ? '' : ' disabled'}>Discard my edits</button>
    </div>
    <p id="importMsg" class="muted" style="font-size:13px"></p>
  </section>
  <section><h2>Export for other tools</h2>
    <div class="row">
      <button class="btn" data-act="dl-csv">Download task CSV</button>
      <button class="btn" data-act="dl-jira">Download Jira import CSV</button>
      <button class="btn" data-act="copy-csv">Copy task CSV</button> <span id="copyMsg" class="muted mono" style="font-size:12px"></span>
    </div>
    <p class="muted">The Jira file creates one epic per work package and one task per WBS item, with start and due dates, labels and sprint names. In Jira, use <b>Import issues from CSV</b> and map Issue ID, Parent and Sprint. Assignees import only if the holder names match Jira users.</p>
    <textarea class="csv" readonly aria-label="Task CSV">${esc(taskCsv())}</textarea>
  </section></div>`;
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.project || !Array.isArray(data.tasks) || !Array.isArray(data.roles)) throw new Error('missing project, roles or tasks');
      plan = normalise(data); saveLocal(); render();
      $('#importMsg') && ($('#importMsg').textContent = `Imported ${f.name}.`);
    } catch (err) { $('#importMsg').textContent = `That file isn't a valid plan (${err.message}).`; }
  });
}

/* ---------- edits ---------- */
const num = v => Number.parseInt(v, 10);
document.addEventListener('change', e => {
  const el = e.target, d = el.dataset, f = d.f;
  if (el.id === 'themeSel') return;
  if (d.t !== undefined) {
    const t = plan.tasks[+d.t];
    if (f === 'start' || f === 'end') { const n = num(el.value); if (Number.isFinite(n)) t[f] = n; }
    else if (f === 'deps') t.deps = el.value.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
    else if (f === 'continuous') t.continuous = el.checked;
    else if (f === 'id') {
      const old = t.id, nu = el.value.trim(); if (!nu) return render();
      t.id = nu; plan.tasks.forEach(x => { x.deps = (x.deps || []).map(dp => dp === old ? nu : dp); });
      const wp = nu.split('.')[0]; if (plan.workPackages.some(w => w.id === wp)) t.wp = wp;
    } else t[f] = el.value;
  } else if (d.r !== undefined) plan.roles[+d.r][f] = el.value.trim();
  else if (d.m !== undefined) {
    const m = plan.milestones[+d.m];
    if (f === 'week' || f === 'day') { const n = num(el.value); if (Number.isFinite(n)) m[f] = n; } else m[f] = el.value;
  } else if (d.s !== undefined) {
    const s = plan.sprints[+d.s];
    if (f === 'name') s.name = el.value; else { const n = num(el.value); if (Number.isFinite(n)) s[f] = n; }
  } else if (d.w !== undefined) {
    const w = plan.workPackages[+d.w];
    if (f === 'id') { const old = w.id, nu = el.value.trim(); if (!nu) return render(); w.id = nu; plan.tasks.forEach(t => { if (t.wp === old) t.wp = nu; }); }
    else w[f] = el.value;
  } else if (d.p !== undefined) {
    const P = plan.project;
    if (f === 'vacationWeeks' || f === 'examWeeks') P[f] = parseWeeks(el.value);
    else if (f === 'firstWeek' || f === 'lastWeek') { const n = num(el.value); if (Number.isFinite(n)) P[f] = n; if (P.firstWeek > P.lastWeek) [P.firstWeek, P.lastWeek] = [P.lastWeek, P.firstWeek]; }
    else if (f === 'week1Monday') { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) P.week1Monday = el.value; }
    else P[f] = el.value;
  } else return;
  saveLocal(); render();
});

function nextTaskId(wp) {
  const ns = plan.tasks.filter(t => t.wp === wp).map(t => Number(t.id.split('.')[1]) || 0);
  return `${wp}.${(ns.length ? Math.max(...ns) : 0) + 1}`;
}
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.tabs button');
  if (tabBtn) { tab = tabBtn.dataset.tab; try { history.replaceState(null, '', '#' + tab); } catch (_) {} render(); return; }
  const own = e.target.closest('[data-own]');
  if (own) {
    const t = plan.tasks[+own.dataset.own], r = own.dataset.role;
    t.owners = (t.owners || []).includes(r) ? t.owners.filter(x => x !== r) : [...(t.owners || []), r];
    saveLocal(); render(); return;
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const i = +b.dataset.i, P = plan.project;
  switch (b.dataset.act) {
    case 'export-json': download('plan.json', JSON.stringify(plan, null, 2) + '\n', 'application/json'); return;
    case 'revert':
      if (!published) return;
      if (b.dataset.confirm !== 'yes') { b.dataset.confirm = 'yes'; b.textContent = 'Click again to discard'; return; }
      plan = clone(published); clearLocal(); break;
    case 'dl-csv': download('worad-tasks.csv', taskCsv(), 'text/csv'); return;
    case 'dl-jira': download('worad-jira-import.csv', jiraCsv(), 'text/csv'); return;
    case 'copy-csv': {
      const msg = $('#copyMsg'), ta = $('textarea.csv');
      const fallback = () => { ta.select(); msg.textContent = 'Selected — press Ctrl+C'; };
      try { navigator.clipboard.writeText(taskCsv()).then(() => msg.textContent = 'Copied', fallback); } catch (_) { fallback(); }
      return;
    }
    case 'add-task': { const wp = b.dataset.wp, last = plan.tasks.filter(t => t.wp === wp).pop();
      plan.tasks.push({ id: nextTaskId(wp), wp, name: 'New task', start: last ? last.end : P.firstWeek, end: last ? last.end : P.firstWeek, owners: [], deps: [], continuous: false }); break; }
    case 'del-task': { const id = plan.tasks[i].id; plan.tasks.splice(i, 1); plan.tasks.forEach(t => { t.deps = (t.deps || []).filter(d => d !== id); }); break; }
    case 'add-role': { let n = plan.roles.length + 1, id = 'role' + n; while (role(id)) id = 'role' + (++n);
      plan.roles.push({ id, code: 'R' + n, title: 'New role', holder: '', pfsHat: '', reportHat: '' }); break; }
    case 'del-role': { const id = plan.roles[i].id; plan.roles.splice(i, 1); plan.tasks.forEach(t => { t.owners = (t.owners || []).filter(o => o !== id); }); if (personFilter === id) personFilter = ''; break; }
    case 'add-ms': plan.milestones.push({ week: P.firstWeek, day: 4, time: '', type: 'gate', label: 'New milestone' }); break;
    case 'del-ms': plan.milestones.splice(i, 1); break;
    case 'add-sprint': { const last = plan.sprints[plan.sprints.length - 1]; const s = last ? last.end + 1 : P.firstWeek;
      plan.sprints.push({ name: 'S' + (plan.sprints.length + 1), start: s, end: s + 1 }); break; }
    case 'del-sprint': plan.sprints.splice(i, 1); break;
    case 'gen-sprints': {
      const out = []; let w = P.firstWeek;
      while (w <= P.lastWeek) {
        if (P.vacationWeeks.includes(w)) { w++; continue; }
        const e2 = (w + 1 <= P.lastWeek && !P.vacationWeeks.includes(w + 1)) ? w + 1 : w;
        out.push({ name: 'S' + (out.length + 1), start: w, end: e2 }); w = e2 + 1;
      }
      plan.sprints = out; break;
    }
    case 'add-wp': { const ids = plan.workPackages.map(w => Number(w.id) || 0); plan.workPackages.push({ id: String(Math.max(0, ...ids) + 1), name: 'New work package', type: 'build' }); break; }
    case 'del-wp': {
      const wp = plan.workPackages[i];
      if (plan.tasks.some(t => t.wp === wp.id)) { b.textContent = 'Move or delete its tasks first'; return; }
      plan.workPackages.splice(i, 1); break;
    }
    default: return;
  }
  saveLocal(); render();
});

/* theme */
function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
$('#themeSel').addEventListener('change', e => { applyTheme(e.target.value); try { localStorage.setItem(THEME, e.target.value); } catch (_) {} });

/* ---------- boot ---------- */
function normalise(p) {
  p.project.vacationWeeks ||= []; p.project.examWeeks ||= [];
  p.sprints ||= []; p.milestones ||= []; p.workPackages ||= [];
  p.roles.forEach(r => { r.holder ??= ''; r.code ||= r.id.toUpperCase().slice(0, 3); r.pfsHat ??= ''; r.reportHat ??= ''; });
  p.tasks.forEach(t => { t.owners ||= []; t.deps ||= []; t.continuous = !!t.continuous; t.start = +t.start; t.end = +t.end; });
  p.milestones.forEach(m => { m.week = +m.week; m.day = +(m.day || 0); m.time ||= ''; });
  return p;
}
async function boot() {
  let theme = ''; try { theme = localStorage.getItem(THEME) || ''; } catch (_) {}
  applyTheme(theme); $('#themeSel').value = theme;
  const h = (location.hash || '').slice(1); if (['gantt', 'tasks', 'roles', 'milestones', 'settings', 'export'].includes(h)) tab = h;
  try { const r = await fetch('plan.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); published = normalise(await r.json()); }
  catch (_) { published = null; }
  const local = readLocal();
  if (local && local.project) plan = normalise(local);
  else if (published) plan = clone(published);
  else {
    $('#view').innerHTML = `<section><h2>No plan loaded</h2><p>plan.json couldn't be read. Open this app from GitHub Pages, or run <span class="mono">python3 -m http.server</span> in the folder and visit localhost:8000.</p>
      <div class="row"><label class="btn" for="bootImport">Import plan.json</label><input type="file" id="bootImport" accept=".json" hidden></div></section>`;
    $('#bootImport').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; plan = normalise(JSON.parse(await f.text())); saveLocal(); render(); });
    return;
  }
  render();
}
boot();
})();
