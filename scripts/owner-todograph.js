/* ==========================================================================
   owner-todograph.js - Owner Panel > To-do & focus > Graphs (CodeFlow 4.5.0, phase TD2). Owner only, private.
   Time per day (stacked by task, 7 / 14 / 30 days), a daily goal with a streak, tasks completed per week, hours used vs allotted, done vs open.
   Every chart has a text table. Colour is never the only cue (each task also has a letter and a pattern).
   Downloads: CSV files and a PNG picture of a chart. By default task names are replaced by "Task A", "Task B" ... in anything that leaves the panel.
   There is NO public link and nothing is sent anywhere: the file is created in your browser and you choose where it goes.
   Reads: the sessions of the last 60 days (the 7/14/30 day views are slices of it), the log entries of the last 12 weeks, the goal. Nothing runs in the background.
   ========================================================================== */
(function () {
  'use strict';
  const G = window.coreTodoGraph, C = window.coreTodo, tm = window.coreTime, kit = window.dashKit; if (!G || !C || !tm || !kit) return;
  const { el, notify } = kit; const $ = id => document.getElementById(id), TZ = () => (window.ownerTz ? window.ownerTz.get() : 'Asia/Manila');   // EN-1A
  let range = matchMedia('(max-width:600px)').matches ? 7 : 14, includeManual = true, anon = true, loaded = 0, data = null, goalMin = 0, weekGoals = null, showTbl = { daily: false, weekly: false }, busy = false, active = false;
  const api = () => window.todoApi;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = secs => { const m = Math.round(secs / 60), h = Math.floor(m / 60); return h ? h + ' h ' + String(m % 60).padStart(2, '0') + ' m' : m + ' m'; };
  const dayLabel = d => { const p = d.split('-').map(Number); return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2]))); };
  const shortDay = d => { const p = d.split('-').map(Number); return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2]))); };

  /* ------------------------------------------------------------ data */
  async function load(force) {
    const a = api(); if (!a || !a.signedIn() || busy) return; if (!force && data && Date.now() - loaded < 60000) { draw(); return; }
    busy = true; say('Loading…');
    try {
      if (!a.loaded()) await a.reloadTasks();
      const today = a.todayKey(), first60 = tm.addDaysIso(today, -(G.WINDOW_DAYS - 1)), wk0 = tm.addDaysIso(G.weekStart(today), -7 * (G.WEEKS - 1));
      const wkMs = tm.zonedToUtc(Number(wk0.slice(0, 4)), Number(wk0.slice(5, 7)), Number(wk0.slice(8, 10)), 0, 0, 0, TZ());
      const [sessions, events, prefs] = await Promise.all([a.sessionsSince(tm.addDaysIso(first60, -1)), a.eventsSince(wkMs), a.getPrefs()]);
      goalMin = Math.max(0, Math.round(Number(prefs.dailyGoalMin) || 0)); weekGoals = G.cleanWeekday(prefs.weekdayGoalMin); data = { sessions, events, today }; loaded = Date.now(); say('');
    } catch (e) { say('Could not load the graphs. ' + (e && e.code === 'permission-denied' ? 'The database refused this: publish the newest firestore.rules.strict and sign in again.' : 'Check your connection and press Refresh.')); }
    busy = false; draw();
  }
  const say = m => { const n = $('tdGMsg'); if (n) n.textContent = m || ''; };

  /* ------------------------------------------------------------ svg helpers */
  function patDef(id, color, style) {
    const w = '#fff';
    const inner = { stripes: `<path d="M-2 10L10 -2M-2 6L6 -2M2 10L10 2" stroke="${w}" stroke-width="2" opacity=".75"/>`, dots: `<circle cx="4" cy="4" r="1.6" fill="${w}" opacity=".8"/>`, cross: `<path d="M0 0L8 8M8 0L0 8" stroke="${w}" stroke-width="1.4" opacity=".75"/>`, hstripes: `<path d="M0 2H8M0 6H8" stroke="${w}" stroke-width="1.6" opacity=".75"/>`, zigzag: `<path d="M0 6L2 2L4 6L6 2L8 6" fill="none" stroke="${w}" stroke-width="1.4" opacity=".8"/>` }[style];
    return inner ? `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/>${inner}</pattern>` : '';
  }
  const fillOf = (id, s) => s.pattern === 'solid' ? s.color : `url(#${id})`;
  function niceMax(secs) { const h = secs / 3600, steps = [0.5, 1, 2, 4, 6, 8, 12, 24]; let step = steps.find(s => h / s <= 5) || 24; return { step: step * 3600, max: Math.max(step * 3600, Math.ceil(secs / (step * 3600)) * step * 3600) }; }
  const hAxis = secs => (secs / 3600) % 1 === 0 ? (secs / 3600) + ' h' : (secs / 3600).toFixed(1) + ' h';

  /* the daily chart as an SVG string. opt.names(id)->label; opt.title for the picture; opt.pre makes ids unique */
  function dailySvg(model, goalSecs, names, opt) {
    opt = opt || {}; const W = 640, H = 270, L = 46, R = 10, T = opt.title ? 44 : (model.sameGoal ? 14 : 28), B = 36, pw = W - L - R, ph = H - T - B, n = model.rows.length, step = pw / n, bw = Math.max(4, step * 0.68), pre = opt.pre || 'g';
    const nm = niceMax(model.max), y = v => T + ph - v / nm.max * ph; let s = '';
    s += `<defs>${model.series.map((x, i) => patDef(pre + 'p' + i, x.color, x.pattern)).join('')}<pattern id="${pre}nd" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e5e7eb"/><path d="M-2 10L10 -2" stroke="#9ca3af" stroke-width="1.2"/></pattern></defs>`;
    if (opt.title) s += `<rect width="${W}" height="${H + 18}" fill="#fff"/><text x="${L}" y="20" font-size="15" font-weight="700" fill="#111827">${esc(opt.title)}</text><text x="${L}" y="36" font-size="11" fill="#4b5563">${esc(opt.sub || '')}</text>`;
    for (let v = 0; v <= nm.max + 1; v += nm.step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#d1d5db" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#374151">${hAxis(v)}</text>`;
    const labelEvery = n > 21 ? 5 : n > 10 ? 2 : 1;
    model.rows.forEach((r, i) => {
      const x = L + i * step + (step - bw) / 2, cx = x + bw / 2, tip = dayLabel(r.day) + ': ' + (r.state === 'nodata' ? 'no data (before your first record)' : r.state === 'future' ? 'not yet' : hm(r.total) + (r.state === 'zero' ? ' (no time recorded)' : '') + (r.rest ? ', rest day' : r.goalSecs > 0 ? ', goal ' + hm(r.goalSecs) + (r.goalMet ? ' reached' : ' not reached') : '') + (r.state === 'data' ? '. ' + model.series.filter(x2 => r.parts[x2.key]).map(x2 => names(x2) + ' ' + hm(r.parts[x2.key])).join(', ') : ''));
      s += `<g class="td-gbar" data-i="${i}" role="img" tabindex="${opt.export ? -1 : (i === n - 1 ? 0 : -1)}" aria-label="${esc(tip)}" data-tip="${esc(tip)}">`;
      s += `<rect x="${L + i * step}" y="${T}" width="${step}" height="${ph}" fill="transparent"/>`;
      if (r.state === 'nodata') s += `<rect x="${x}" y="${T + ph - 22}" width="${bw}" height="22" fill="url(#${pre}nd)"/>`;
      else if (r.state === 'zero') s += `<text x="${cx}" y="${T + ph - 4}" font-size="10" text-anchor="middle" fill="#374151">0</text>`;
      else { let acc = 0; model.series.forEach((x2, k) => { const v = r.parts[x2.key]; if (!v) return; const y1 = y(acc + v), hh = y(acc) - y1; s += `<rect x="${x}" y="${y1}" width="${bw}" height="${hh}" fill="${fillOf(pre + 'p' + k, x2)}" stroke="#fff" stroke-width=".6"/>`; if (hh >= 15 && bw >= 12) s += `<text x="${cx}" y="${y1 + hh / 2 + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#fff" stroke="#000" stroke-width=".4" paint-order="stroke">${esc(x2.letter)}</text>`; acc += v; }); }
      if (r.goalMet) s += `<text x="${cx}" y="${y(r.total) - 4}" font-size="11" text-anchor="middle" fill="#166534" font-weight="700">✓</text>`;
      if (r.rest && r.state !== 'future') s += `<text x="${cx}" y="${T + 10}" font-size="${n > 14 ? 8 : 9}" text-anchor="middle" fill="#4b5563" font-style="italic">rest</text>`;
      if (i % labelEvery === 0 || i === n - 1) s += `<text x="${cx}" y="${H - B + 14}" font-size="10" text-anchor="middle" fill="#374151">${esc(n > 10 ? shortDay(r.day) : dayLabel(r.day).replace(/^(\w+) (.*)$/, '$1 $2'))}</text>`;
      s += '</g>';
    });
    const g0 = model.rows.length ? model.rows[0].goalSecs : 0;
    if (model.sameGoal && g0 > 0) s += `<line x1="${L}" x2="${W - R}" y1="${y(g0)}" y2="${y(g0)}" stroke="#166534" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${W - R}" y="${y(g0) - 4}" font-size="10" text-anchor="end" fill="#166534">goal ${esc(hm(g0))}</text>`;
    else if (!model.sameGoal) {   // EN-1A: a goal that differs by day is drawn as a short dashed mark on each day
      model.rows.forEach((r, i) => { if (r.goalSecs > 0 && r.state !== 'nodata') s += `<line x1="${L + i * step + 1}" x2="${L + (i + 1) * step - 1}" y1="${y(r.goalSecs)}" y2="${y(r.goalSecs)}" stroke="#166534" stroke-width="2" stroke-dasharray="5 3"/>`; });
      s += `<text x="${W - R}" y="${opt.title ? T - 10 : 12}" font-size="10" text-anchor="end" fill="#166534">dashed mark = goal for that day</text>`;
    }
    const leg = model.series.map(x => x.letter + ' ' + names(x)).join('   ');
    if (opt.export) s += `<text x="${L}" y="${H + 12}" font-size="10" fill="#374151">${esc(leg.slice(0, 120))}</text><text x="${W - R}" y="${H + 12}" font-size="9" text-anchor="end" fill="#6b7280">${esc(TZ())}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${opt.export ? H + 18 : H}" width="${W}" height="${opt.export ? H + 18 : H}" font-family="system-ui,Segoe UI,Arial,sans-serif" ${opt.export ? '' : 'role="group" aria-label="' + esc(opt.label || 'Time per day') + '"'}>${s}</svg>`;
  }
  function weeklySvg(weeks, opt) {
    opt = opt || {}; const W = 640, H = 220, L = 40, R = 10, T = opt.title ? 44 : 14, B = 34, pw = W - L - R, ph = H - T - B, n = weeks.length, step = pw / n, bw = step * 0.62, top = Math.max(4, ...weeks.map(w => w.count)), tmax = Math.ceil(top / 2) * 2, y = v => T + ph - v / tmax * ph; let s = '';
    if (opt.title) s += `<rect width="${W}" height="${H + 18}" fill="#fff"/><text x="${L}" y="20" font-size="15" font-weight="700" fill="#111827">${esc(opt.title)}</text><text x="${L}" y="36" font-size="11" fill="#4b5563">${esc(opt.sub || '')}</text>`;
    for (let v = 0; v <= tmax; v += tmax <= 6 ? 1 : 2) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#d1d5db"/><text x="${L - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#374151">${v}</text>`;
    weeks.forEach((w, i) => {
      const x = L + i * step + (step - bw) / 2, cx = x + bw / 2, tip = 'Week of ' + shortDay(w.weekStart) + ' to ' + shortDay(w.weekEnd) + ': ' + w.count + ' task' + (w.count === 1 ? '' : 's') + ' completed';
      s += `<g class="td-gbar" data-i="${i}" role="img" tabindex="${opt.export ? -1 : (i === n - 1 ? 0 : -1)}" aria-label="${esc(tip)}" data-tip="${esc(tip)}"><rect x="${L + i * step}" y="${T}" width="${step}" height="${ph}" fill="transparent"/>`;
      if (w.count > 0) s += `<rect x="${x}" y="${y(w.count)}" width="${bw}" height="${y(0) - y(w.count)}" fill="#2f4fb3"/>`;
      s += `<text x="${cx}" y="${(w.count > 0 ? y(w.count) : y(0)) - 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#111827">${w.count}</text><text x="${cx}" y="${H - B + 14}" font-size="9" text-anchor="middle" fill="#374151">${esc(shortDay(w.weekStart))}</text></g>`;
    });
    if (opt.export) s += `<text x="${W - R}" y="${H + 12}" font-size="9" text-anchor="end" fill="#6b7280">Weeks start Monday · ${esc(TZ())}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${opt.export ? H + 18 : H}" width="${W}" height="${opt.export ? H + 18 : H}" font-family="system-ui,Segoe UI,Arial,sans-serif" ${opt.export ? '' : 'role="group" aria-label="Tasks completed per week"'}>${s}</svg>`;
  }

  /* ------------------------------------------------------------ the page */
  function models() {
    const a = api(), tasks = a.tasks(), today = data.today, days60 = G.dayList(today, G.WINDOW_DAYS), buckets = G.dailyBuckets(data.sessions.filter(s => includeManual || s.kind !== 'manual'), days60, TZ(), { includeManual });
    const first = G.firstDay(tasks, data.sessions, TZ()), plan = G.goalPlan(goalMin, weekGoals), days = G.dayList(today, range);
    const m = G.stackModel(days, buckets, tasks, first, plan, today), m60 = G.stackModel(days60, buckets, tasks, first, plan, today);
    return { tasks, m, m60, plan, weeks: G.weeklyCompleted(data.events, tasks, today, TZ()), used: G.usedVsAllotted(tasks), counts: G.statusCounts(tasks), today, days };
  }
  function draw() {
    const root = $('tdGraphs'); if (!root) return;
    if (!root.dataset.built) { build(root); root.dataset.built = '1'; }
    const box = $('tdGBody'); box.replaceChildren(); if (!data) return;
    const M = models(), names = x => x.name, st = G.streak(M.m60.rows, 0, M.today, G.WINDOW_DAYS), todayRow = M.m60.rows[M.m60.rows.length - 1];
    $('tdGRange').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.r) === range)));
    $('tdGGoal').value = goalMin ? String(goalMin) : '';
    for (let i = 0; i < 7; i++) { const b = $('tdGWd' + i); if (b && document.activeElement !== b) { b.value = weekGoals && weekGoals[i] !== null ? String(weekGoals[i]) : ''; b.placeholder = goalMin ? String(goalMin) : 'off'; const h = $('tdGWh' + i); if (h) h.textContent = b.value === '' ? (goalMin ? 'uses ' + goalMin : 'no goal') : (Number(b.value) === 0 ? 'rest' : ''); } }
    $('tdGStreak').textContent = !st.on ? 'Set a daily goal, or a goal for a weekday, to see your streak.' : 'Current streak: ' + st.current + ' day' + (st.current === 1 ? '' : 's') + (st.capped ? ' (counted over the last ' + G.WINDOW_DAYS + ' days)' : '') + ' · Longest in the last ' + G.WINDOW_DAYS + ' days: ' + st.longest + ' · Today: ' + hm(todayRow.total) + (todayRow.rest ? ' (rest day)' : todayRow.goalSecs > 0 ? ' of ' + hm(todayRow.goalSecs) + (todayRow.goalMet ? ' (goal reached)' : '') : ' (no goal today)') + (M.m60.hasRest ? ' (rest days skipped)' : '');
    /* daily */
    const sum = M.m, sec = el('section', { class: 'td-gsec', 'aria-labelledby': 'tdGH1' });
    sec.append(el('h3', { id: 'tdGH1' }, 'Time per day'), el('p', { class: 'dhelp' }, 'Total ' + hm(sum.total) + ' · Daily average ' + hm(sum.avg) + (sum.best ? ' · Best day ' + dayLabel(sum.best.day) + ' (' + hm(sum.best.total) + ')' : '') + ' · Last ' + range + ' days, Asia/Manila'));
    const wrap = el('div', { class: 'td-chart', id: 'tdChart1' }); wrap.innerHTML = dailySvg(sum, 0, names, { pre: 'g', label: 'Time per day, stacked by task, last ' + range + ' days. Total ' + hm(sum.total) + '. Use the arrow keys to move between days, or open the table.' });
    sec.append(wrap, el('p', { class: 'td-ginfo', id: 'tdGInfo', role: 'status', 'aria-live': 'polite' }, 'Select a day to see its details.'), legend(sum), tblBtn('daily', 'Show as table'), dailyTable(sum), actions('daily', M));
    box.append(sec); wireBars(wrap, 'tdGInfo');
    /* accomplishment */
    const acc = el('section', { class: 'td-gsec', 'aria-labelledby': 'tdGH2' }), done = M.counts;
    acc.append(el('h3', { id: 'tdGH2' }, 'Accomplishment'), el('h4', {}, 'Tasks completed per week (last ' + G.WEEKS + ' weeks, Monday to Sunday)'), el('p', { class: 'dhelp' }, 'A task counts once in each week it was completed. A reopened task that you finish again counts again in that later week.'));
    const w2 = el('div', { class: 'td-chart', id: 'tdChart2' }); w2.innerHTML = weeklySvg(M.weeks);
    acc.append(w2, el('p', { class: 'td-ginfo', id: 'tdGInfo2', role: 'status', 'aria-live': 'polite' }, 'Select a week to see its details.'), tblBtn('weekly', 'Show as table'), weeklyTable(M.weeks), weeklyActions(M));
    acc.append(el('h4', {}, 'Hours used vs allotted'));
    if (!M.used.length) acc.append(el('p', { class: 'dhelp' }, 'No task has allotted hours yet.'));
    else { const ul = el('ul', { class: 'td-uva' }); M.used.forEach(u => ul.append(el('li', {}, el('span', { class: 'td-uvn' }, u.name), el('div', { class: 'td-bar' + (u.over ? ' over' : ''), role: 'img', 'aria-label': u.name + ': ' + hm(u.usedSecs) + ' used of ' + hm(u.planSecs) }, el('span', { style: 'width:' + u.pct + '%' })), el('span', { class: 'td-uvt' }, hm(u.usedSecs) + ' of ' + hm(u.planSecs) + (u.over ? ' · OVER by ' + hm(u.over) : ' · ' + hm(u.left) + ' left'))))); acc.append(ul); }
    acc.append(el('h4', {}, 'Done vs open'), el('p', { class: 'td-counts' }, 'Done ' + done.done + ' · In progress ' + done.doing + ' · To do ' + done.todo + ' · Archived ' + done.archived));
    const tot = done.done + done.doing + done.todo; if (tot) acc.append(el('div', { class: 'td-seg', role: 'img', 'aria-label': 'Done ' + done.done + ' of ' + tot + ' open or done tasks' }, el('span', { class: 'sd', style: 'width:' + Math.round(done.done / tot * 100) + '%' }), el('span', { class: 'sg', style: 'width:' + Math.round(done.doing / tot * 100) + '%' })));
    box.append(acc);
  }
  function legend(m) { const ul = el('ul', { class: 'td-legend', 'aria-label': 'Tasks in the chart' }); m.series.forEach((s, i) => { const li = el('li', {}); li.innerHTML = `<svg width="18" height="14" aria-hidden="true"><defs>${patDef('lg' + i, s.color, s.pattern)}</defs><rect width="18" height="14" rx="2" fill="${s.pattern === 'solid' ? s.color : 'url(#lg' + i + ')'}"/></svg>`; li.append(el('strong', {}, ' ' + s.letter + ' '), document.createTextNode(s.name + ' · ' + hm(s.total))); ul.append(li); }); if (!m.series.length) ul.append(el('li', {}, 'No time recorded in this range.')); return ul; }
  function tblBtn(k, label) { return el('button', { type: 'button', class: 'dbtn sm', 'aria-expanded': String(showTbl[k]), 'aria-controls': 'tdTbl_' + k, onclick: () => { showTbl[k] = !showTbl[k]; draw(); } }, showTbl[k] ? 'Hide table' : label); }
  function dailyTable(m) {
    const wrap = el('div', { id: 'tdTbl_daily', class: 'td-tbl', hidden: showTbl.daily ? null : 'hidden' }); if (!showTbl.daily) return wrap;
    const t = el('table', {}), cap = el('caption', {}, 'Time per day in minutes'), head = el('tr', {}, el('th', { scope: 'col' }, 'Day'), el('th', { scope: 'col' }, 'Total'), m.series.map(s => el('th', { scope: 'col' }, s.letter + ' ' + s.name)), m.anyGoal ? el('th', { scope: 'col' }, 'Goal') : null);
    t.append(cap, el('thead', {}, head)); const tb = el('tbody', {});
    m.rows.slice().reverse().forEach(r => tb.append(el('tr', {}, el('th', { scope: 'row' }, dayLabel(r.day)), el('td', {}, r.state === 'nodata' ? 'no data' : hm(r.total)), m.series.map(s => el('td', {}, r.state === 'nodata' ? '' : r.parts[s.key] ? hm(r.parts[s.key]) : '0')), m.anyGoal ? el('td', {}, r.rest ? 'rest day' : r.state === 'nodata' ? '' : r.goalSecs > 0 ? hm(r.goalSecs) + (r.goalMet ? ', reached' : ', not reached') : 'no goal') : null)));
    t.append(tb); wrap.append(t); return wrap;
  }
  function weeklyTable(weeks) {
    const wrap = el('div', { id: 'tdTbl_weekly', class: 'td-tbl', hidden: showTbl.weekly ? null : 'hidden' }); if (!showTbl.weekly) return wrap;
    const t = el('table', {}), nm = G.nameMap(api().tasks(), false); t.append(el('caption', {}, 'Tasks completed per week'), el('thead', {}, el('tr', {}, ['Week (Mon–Sun)', 'Completed', 'Tasks'].map(h => el('th', { scope: 'col' }, h)))));
    const tb = el('tbody', {}); weeks.slice().reverse().forEach(w => tb.append(el('tr', {}, el('th', { scope: 'row' }, shortDay(w.weekStart) + ' – ' + shortDay(w.weekEnd)), el('td', {}, String(w.count)), el('td', {}, w.ids.map(nm).join(', '))))); t.append(tb); wrap.append(t); return wrap;
  }
  function wireBars(wrap, infoId) {
    const gs = [...wrap.querySelectorAll('.td-gbar')], info = $(infoId), show = g => { info.textContent = g.dataset.tip; };
    gs.forEach((g, i) => {
      g.addEventListener('focus', () => show(g)); g.addEventListener('mouseenter', () => show(g)); g.addEventListener('click', () => { show(g); g.focus(); });
      g.addEventListener('keydown', e => { const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: gs.length - 1 }[e.key]; if (k == null) return; e.preventDefault(); const n = gs[Math.max(0, Math.min(gs.length - 1, k))]; gs.forEach(x => x.setAttribute('tabindex', '-1')); n.setAttribute('tabindex', '0'); n.focus(); });
    });
  }

  /* ------------------------------------------------------------ downloads (CSV and picture) */
  function saveBlob(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  function csvDownload(kind, M) {
    const days = G.dayList(M.today, range), tasks = M.tasks, text = kind === 'daily' ? G.dailyCsv(days, data.sessions.filter(s => includeManual || s.kind !== 'manual'), tasks, TZ(), anon, M.plan) : G.weeklyCsv(M.weeks, tasks, anon);
    saveBlob(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), 'todo-' + kind + '-' + M.today + (anon ? '-anonymous' : '') + '.csv'); notify('CSV saved to your downloads.', 'success');
  }
  async function pictureDownload(kind, M) {
    try {
      const nm = G.nameMap(M.tasks, anon), sub = kind === 'daily' ? 'Last ' + range + ' days' + (M.m.anyGoal ? (M.m.sameGoal && M.m.rows[0].goalSecs > 0 ? ' · goal ' + hm(M.m.rows[0].goalSecs) : ' · goal per weekday') : '') : 'Last ' + G.WEEKS + ' weeks';
      const model = anon ? anonModel(M.m, M.tasks) : M.m, svg = kind === 'daily' ? dailySvg(model, 0, x => x.name, { export: true, title: 'Time per day', sub, pre: 'x' }) : weeklySvg(M.weeks, { export: true, title: 'Tasks completed per week', sub });
      void nm; const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('image')); img.src = url; });
      const c = document.createElement('canvas'), W = img.naturalWidth || 640, H = img.naturalHeight || 270; c.width = W * 2; c.height = H * 2; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('png');
      const file = new File([blob], 'todo-' + kind + '-' + M.today + (anon ? '-anonymous' : '') + '.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(max-width:900px)').matches) { try { await navigator.share({ files: [file], title: 'To-do & focus' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      saveBlob(blob, file.name); notify('Picture saved to your downloads.', 'success');
    } catch (e) { notify('Could not make the picture. Try the CSV download instead.', 'error'); }
  }
  /* the same chart with the task names replaced by Task A, Task B ... in the order of the legend */
  function anonModel(m, tasks) { const nm = G.nameMap(tasks, true), out = Object.assign({}, m); out.series = m.series.map(s => Object.assign({}, s, { name: s.key === '_other' ? 'Other tasks' : nm(s.key) })); return out; }
  function actions(kind, M) { return el('div', { class: 'td-gact' }, el('button', { type: 'button', class: 'dbtn sm', id: 'tdGCsv_' + kind, onclick: () => csvDownload(kind, M) }, 'Download CSV'), el('button', { type: 'button', class: 'dbtn sm', id: 'tdGPng_' + kind, onclick: () => pictureDownload(kind, M) }, 'Save as picture')); }
  const weeklyActions = M => actions('weekly', M);

  function build(root) {
    const rangeBar = el('div', { class: 'td-gctl', id: 'tdGRange', role: 'group', 'aria-label': 'Range' }, G.RANGES.map(n => el('button', { type: 'button', class: 'dbtn sm', 'data-r': n, 'aria-pressed': 'false', onclick: () => { range = n; draw(); } }, n + ' days')));
    const man = el('label', { class: 'tog' }, el('input', { type: 'checkbox', id: 'tdGManual', checked: 'checked', onchange: e => { includeManual = e.target.checked; draw(); } }), ' Include manual time');
    const anonL = el('label', { class: 'tog' }, el('input', { type: 'checkbox', id: 'tdGAnon', checked: 'checked', onchange: e => { anon = e.target.checked; } }), ' Hide task names in downloads and pictures (they become Task A, Task B…)');
    const goal = el('div', { class: 'td-ggoal' }, el('label', { class: 'fld', for: 'tdGGoal' }, 'Daily goal (minutes of focus time, 0 or empty = off)'), el('input', { type: 'number', id: 'tdGGoal', min: 0, max: 1440, step: 5, inputmode: 'numeric' }),
      el('button', { type: 'button', class: 'dbtn sm', id: 'tdGGoalSave', onclick: async () => { try { const r = await api().setPrefs($('tdGGoal').value === '' ? 0 : $('tdGGoal').value, weekGoals); if (!r.ok) { notify(r.error, 'error'); return; } goalMin = r.value; notify(goalMin ? 'Daily goal saved.' : 'Daily goal turned off.', 'success'); draw(); } catch (e) { notify('Could not save the goal. Check your connection.', 'error'); } } }, 'Save goal'));
    const DN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hint = i => { const b = $('tdGWd' + i), h = $('tdGWh' + i); if (!b || !h) return; const v = b.value.trim(); h.textContent = v === '' ? (goalMin ? 'uses ' + goalMin : 'no goal') : (Number(v) === 0 ? 'rest' : ''); };
    const readWk = () => { const out = []; for (let i = 0; i < 7; i++) { const v = $('tdGWd' + i).value.trim(); if (v === '') { out.push(null); continue; } const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 1440) return { error: DN[i] + ' goal must be a whole number from 0 to 1440, or empty.' }; out.push(n); } return { list: out }; };
    const wk = el('fieldset', { class: 'td-gwk', id: 'tdGWk' }, el('legend', {}, 'Goal per weekday (optional)'),
      el('p', { class: 'dhelp' }, 'Minutes of focus time. Leave a box empty to use the daily goal. Type 0 for a rest day: it has no goal and is skipped in the streak.'),
      el('div', { class: 'td-gwk-grid' }, DN.map((n, i) => el('div', { class: 'td-gwk-c' }, el('label', { for: 'tdGWd' + i }, el('span', { 'aria-hidden': 'true' }, n.slice(0, 3)), el('span', { class: 'sr-only' }, n + ' goal in minutes')),
        el('input', { type: 'number', id: 'tdGWd' + i, min: 0, max: 1440, step: 5, inputmode: 'numeric', oninput: () => hint(i) }), el('span', { class: 'td-gwk-h', id: 'tdGWh' + i, 'aria-hidden': 'true' })))),
      el('div', { class: 'td-gwk-act' },
        el('button', { type: 'button', class: 'dbtn sm', id: 'tdGWdCopy', onclick: () => { for (let i = 1; i < 5; i++) { $('tdGWd' + i).value = $('tdGWd0').value; hint(i); } } }, 'Copy Monday to Mon–Fri'),
        el('button', { type: 'button', class: 'dbtn sm', id: 'tdGWdClear', onclick: () => { for (let i = 0; i < 7; i++) { $('tdGWd' + i).value = ''; hint(i); } } }, 'Clear weekday goals'),
        el('button', { type: 'button', class: 'dbtn sm primary', id: 'tdGWdSave', onclick: async () => {
          const r0 = readWk(); if (r0.error) { notify(r0.error, 'error'); return; }
          try { const r = await api().setPrefs(goalMin, r0.list); if (!r.ok) { notify(r.error, 'error'); return; } weekGoals = G.cleanWeekday(r.weekday); notify(weekGoals ? 'Weekday goals saved.' : 'Weekday goals cleared. The daily goal is used for every day.', 'success'); draw(); } catch (e) { notify('Could not save the goals. Check your connection.', 'error'); }
        } }, 'Save goals')));
    root.append(el('div', { class: 'td-gtop' }, rangeBar, man, el('button', { type: 'button', class: 'dbtn sm', id: 'tdGRefresh', onclick: () => load(true) }, 'Refresh'), el('span', { class: 'dhelp', id: 'tdGMsg', role: 'status' })), goal, wk, el('p', { class: 'td-streak', id: 'tdGStreak', role: 'status' }), anonL,
      el('p', { class: 'dhelp' }, 'Downloads are created in your browser and nothing is uploaded or shared by this page. You choose where a file goes. There is no public link on purpose, because your task names are private.'), el('div', { id: 'tdGBody' }));
  }
  document.addEventListener('td:view', e => { active = e.detail === 'graphs'; if (active) load(false); if (e.detail === 'off') { data = null; loaded = 0; goalMin = 0; weekGoals = null; const b = $('tdGBody'); if (b) b.replaceChildren(); const m = $('tdGMsg'); if (m) m.textContent = ''; } });
  document.addEventListener('owner:tz', () => { data = null; loaded = 0; if (active) load(true); });   // EN-1A: the days are cut in the new zone
  window.__todoGraphTest = { get data() { return data; }, load, dailySvg, weeklySvg };
})();
