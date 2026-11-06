/* ==========================================================================
   owner-surveys.js - Owner Panel > Employer surveys (CodeFlow 4.5.0, SV1)
   Create a personal survey link for one employer, send it from your own e-mail program, then review the answer and (if you approve) copy it
   into Testimonials as a HIDDEN item that you switch on yourself.
     surveyInvites/{key}         public to the key holder: { surveyVersion, employerName, company, ownerName, status, createdAt, expiresAt, submittedAt? }
     surveyInvitesPrivate/{key}  owner only: { employerEmail, clientId, createdAt }          (never in the link, never public)
     surveyResponses/{key}       the employer's answer; owner decides once: pending -> approved | rejected
   The key is 32 random letters/digits and travels in the link after "#". Rules: firestore.rules.strict. Logic and limits: scripts/core-survey.js.
   Everything the employer wrote is untrusted and is shown as plain text only.
   ========================================================================== */
(function () {
  'use strict';
  const kit = window.dashKit, SV = window.coreSurvey; if (!kit || !SV) return;
  const { el, notify, confirmBox } = kit;
  const $ = id => document.getElementById(id), own = () => window.OWN;
  let invites = [], priv = {}, resps = {}, rems = {}, signed = false, loaded = false, clientIds = [];
  const say = (id, m) => { const n = $(id); if (n) n.textContent = m || ''; };
  const errText = e => (e && e.code === 'permission-denied') ? 'The database refused this (permission denied). Publish the newest firestore.rules.strict, sign in again and refresh this page.' : ((e && e.message) || 'Unknown error.');
  const ms = t => t && typeof t.toMillis === 'function' ? t.toMillis() : (Number(t) || 0);
  const fmt = t => { const m = ms(t); return m ? new Date(m).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
  const STATE = { sent: 'Waiting for answer', answered: 'Answered, to review', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', revoked: 'Revoked', unknown: 'Unknown' };
  const linkOf = key => SV.linkFor(location.href, key);
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); notify(what + ' copied.', 'success'); } catch (e) { notify('Please copy it by hand.', 'info'); } };

  /* ---------------------------------------------------------------- data */
  async function load() {
    const o = own(), f = o.fs;
    const [a, b, c] = await Promise.all([f.getDocs(f.query(f.collection(o.db, 'surveyInvites'))), f.getDocs(f.query(f.collection(o.db, 'surveyInvitesPrivate'))), f.getDocs(f.query(f.collection(o.db, 'surveyResponses')))]);
    invites = a.docs.map(d => Object.assign({ key: d.id }, d.data())).sort((x, y) => ms(y.createdAt) - ms(x.createdAt));
    priv = {}; b.docs.forEach(d => { priv[d.id] = d.data(); }); resps = {}; c.docs.forEach(d => { resps[d.id] = d.data(); });
    rems = {}; try { const r = await f.getDocs(f.query(f.collection(o.db, 'surveyReminders'))); r.docs.forEach(d => { rems[d.id] = d.data(); }); } catch (e) { rems = {}; }
    try { const s = await f.getDocs(f.query(f.collection(o.db, 'clientRegistry'))); clientIds = s.docs.filter(d => d.data().status === 'active').map(d => d.id).sort(); } catch (e) { clientIds = []; }
    try { const m = await f.getDoc(f.doc(o.db, 'ownerPrivate', 'surveySettings')); if (m.exists() && !$('svOwnerName').value) $('svOwnerName').value = SV.cleanText(m.data().ownerName, 80); } catch (e) { /* optional */ }
    loaded = true;
  }
  const dueList = () => Object.entries(rems).filter(([, r]) => SV.isDue(r, SV.todayManila(Date.now()))).sort((x, y) => (SV.dueDate(x[1]) < SV.dueDate(y[1]) ? -1 : 1));
  function setBadge(c) { const n = $('surveyBadge'); if (!n) return; n.textContent = String(c); n.hidden = !c; n.setAttribute('aria-label', c + ' survey item' + (c === 1 ? '' : 's') + ' to look at (answers to review and reminders due)'); }
  const badge = () => setBadge(Object.values(resps).filter(r => r.ownerStatus === 'pending').length + dueList().length);
  async function badgeOnly() {
    if (!signed) return; try { const o = own(), f = o.fs, s = await f.getDocs(f.query(f.collection(o.db, 'surveyResponses'), f.where('ownerStatus', '==', 'pending'), f.limit(50)));
      let due = 0; try { const r = await f.getDocs(f.query(f.collection(o.db, 'surveyReminders'))); const t = SV.todayManila(Date.now()); r.docs.forEach(d => { if (SV.isDue(d.data(), t)) due++; }); } catch (e) { /* reminders are optional */ }
      setBadge(s.size + due); } catch (e) { /* the badge is optional */ }
  }

  /* ---------------------------------------------------------------- reminders (SV2a): start date + months per Client ID, due card, snooze, not needed */
  async function saveReminder(id, data) { const o = own(), f = o.fs; await f.setDoc(f.doc(o.db, 'surveyReminders', id), Object.assign({}, data, { updatedAt: f.serverTimestamp() })); }
  async function addReminder() {
    say('svRemErr', ''); const id = $('svRemClient').value; if (!id) return say('svRemErr', 'Choose a Client ID first.');
    const v = SV.validReminder({ startDate: $('svRemStart').value, months: $('svRemMonths').value }); if (!v.ok) return say('svRemErr', v.errors.startDate || v.errors.months);
    try { await saveReminder(id, v.data); own().log && own().log('Survey reminder saved for ' + id); notify('Reminder saved. It is due on ' + SV.dueDate(v.data) + '.', 'success'); $('svRemStart').value = ''; await load(); draw(); badge(); }
    catch (e) { say('svRemErr', 'Could not save the reminder. ' + errText(e)); }
  }
  async function patchReminder(id, patch, msg) {
    try { const r = rems[id]; if (!r) return; await saveReminder(id, { startDate: r.startDate, months: r.months, status: r.status, snoozedUntil: r.snoozedUntil || '', ...patch }); notify(msg, 'success'); await load(); draw(); badge(); }
    catch (e) { notify('Could not change the reminder. ' + errText(e), 'error'); }
  }
  async function removeReminder(id) {
    if (!await confirmBox('Delete this reminder?', 'The reminder for ' + id + ' is removed. Your survey links and answers are not affected.', 'Delete reminder')) return;
    try { const o = own(), f = o.fs; await f.deleteDoc(f.doc(o.db, 'surveyReminders', id)); notify('Reminder deleted.', 'success'); await load(); draw(); badge(); } catch (e) { notify('Could not delete. ' + errText(e), 'error'); }
  }
  function useReminder(id) { const sel = $('svClient'); if (sel) sel.value = id; const n = $('svEmpName'); if (n) { n.scrollIntoView({ block: 'center' }); n.focus(); } notify('Client ID ' + id + ' is selected. Enter the employer’s name and e-mail, then create the link.', 'info'); }

  /* ---------------------------------------------------------------- cleanup of old unanswered links (SV2a): manual, never touches answers */
  const oldInvites = () => invites.filter(i => !resps[i.key] && SV.cleanable(i, Date.now()));
  async function cleanup() {
    const list = oldInvites(); if (!list.length) return;
    if (!await confirmBox('Remove ' + list.length + ' old survey link' + (list.length === 1 ? '' : 's') + '?', 'These links were never answered and ended more than ' + SV.REMIND.cleanupGraceDays + ' days ago (expired or revoked). They and their private e-mail records are deleted. Answers are never removed here.', 'Remove old links')) return;
    try {
      const o = own(), f = o.fs;
      for (let i = 0; i < list.length; i += 100) { const b = f.writeBatch(); list.slice(i, i + 100).forEach(x => { b.delete(f.doc(o.db, 'surveyInvites', x.key)); b.delete(f.doc(o.db, 'surveyInvitesPrivate', x.key)); }); await b.commit(); }
      o.log && o.log('Old survey links removed (' + list.length + ')'); notify(list.length + ' old link' + (list.length === 1 ? '' : 's') + ' removed.', 'success'); await load(); draw(); badge();
    } catch (e) { notify('Could not remove the old links. ' + errText(e), 'error'); }
  }

  /* ---------------------------------------------------------------- create + send */
  async function create() {
    say('svErr', '');
    const name = SV.cleanText($('svEmpName').value, 100), email = String($('svEmpEmail').value || '').trim(), company = SV.cleanText($('svEmpCompany').value, 100),
      ownerName = SV.cleanText($('svOwnerName').value, 80), clientId = $('svClient').value;
    if (!name) return say('svErr', 'Enter the employer’s name.');
    if (!SV.validEmail(email)) return say('svErr', 'Enter a valid e-mail address for the employer.');
    if (!ownerName) return say('svErr', 'Enter your name as the employer knows you.');
    const key = SV.newKey(), now = Date.now();
    try {
      const o = own(), f = o.fs, b = f.writeBatch();
      b.set(f.doc(o.db, 'surveyInvites', key), { surveyVersion: SV.DEFAULT_SURVEY.version, employerName: name, company, ownerName, status: 'sent', createdAt: f.serverTimestamp(), expiresAt: new Date(SV.expiryFrom(now)) });
      b.set(f.doc(o.db, 'surveyInvitesPrivate', key), { employerEmail: email, clientId, createdAt: f.serverTimestamp() });
      await b.commit();
      f.setDoc(f.doc(o.db, 'ownerPrivate', 'surveySettings'), { ownerName }).catch(() => {});
      o.log && o.log('Survey link created for an employer (reference ' + key.slice(0, 8) + ')');
      ['svEmpName', 'svEmpEmail', 'svEmpCompany'].forEach(i => { $(i).value = ''; }); $('svClient').value = '';
      if (clientId && rems[clientId] && rems[clientId].status === 'active') { try { await saveReminder(clientId, Object.assign({}, rems[clientId], { status: 'done', snoozedUntil: '' })); } catch (e) { /* the link is created; the reminder can be marked by hand */ } }
      await load(); draw(); badge();
      showLink(key, name, email, ownerName);
    } catch (e) { say('svErr', 'Could not create the link. ' + errText(e) + (e && e.code === 'permission-denied' ? ' If your computer clock is more than a day ahead, correct it and try again.' : '')); }
  }
  function showLink(key, name, email, ownerName) {
    const link = linkOf(key), m = SV.messageFor(link, ownerName, name), box = $('svOut'); box.hidden = false;
    const inp = el('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Personal survey link for ' + name, class: 'svlink' });
    box.replaceChildren(el('h2', {}, 'Link ready for ' + name),
      el('p', { class: 'dhelp' }, 'This link belongs to ' + name + ' only and works once. It expires in ' + SV.EXPIRY_DAYS + ' days. Send it now: choose your mail program, Gmail or Outlook, or copy the message.'),
      inp,
      el('div', { class: 'dact-row' },
        kit.iconBtn('inbox', 'Send e-mail', name, () => openMail(email, link, ownerName, name), { primary: true, text: 'Send e-mail' }),
        kit.iconBtn('link', 'Copy link', name, () => copy(link, 'Link'), { text: 'Copy link' }),
        kit.iconBtn('copy', 'Copy message', name, () => copy(m.subject + '\n\n' + m.body, 'Message'), { text: 'Copy message' }),
        kit.iconBtn('close', 'Hide', name, () => { box.hidden = true; box.replaceChildren(); }, { text: 'Hide' })));
    inp.addEventListener('focus', () => inp.select()); box.scrollIntoView({ block: 'nearest' });
  }
  /* One small chooser, so it works whether or not this computer has a mail program: mail program, Gmail, Outlook (web), or copy the message. */
  function openMail(email, link, ownerName, name) {
    const d = el('dialog', { class: 'dmodal', 'aria-labelledby': 'svSendT' }), m = SV.messageFor(link, ownerName, name), w = SV.webmailUrls(email, link, ownerName, name);
    const done = fn => () => { fn(); d.close(); };
    const web = url => done(() => { window.open(url, '_blank', 'noopener,noreferrer'); });
    d.append(el('div', {}, el('h2', { id: 'svSendT' }, 'Send the survey to ' + name),
      el('p', { class: 'dhelp' }, 'Choose how to send it. Each choice only prepares the message: you press Send yourself. If a choice does nothing, your computer probably has no mail program set up; use Gmail, Outlook or Copy message.'),
      el('div', { class: 'dact-row svchoose' },
        el('button', { type: 'button', class: 'dbtn primary', onclick: done(() => { const a = el('a', { href: SV.mailtoFor(email, link, ownerName, name), hidden: true }); document.body.append(a); a.click(); a.remove(); }) }, 'Mail program'),
        el('button', { type: 'button', class: 'dbtn', onclick: web(w.gmail) }, 'Gmail (new tab)'),
        el('button', { type: 'button', class: 'dbtn', onclick: web(w.outlook) }, 'Outlook (new tab)'),
        el('button', { type: 'button', class: 'dbtn', onclick: done(() => copy(m.subject + '\n\n' + m.body, 'Message')) }, 'Copy message')),
      el('div', { class: 'dact-row' }, el('button', { type: 'button', class: 'dbtn', onclick: () => d.close() }, 'Close'))));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
  }

  /* ---------------------------------------------------------------- invite actions */
  async function revoke(inv) {
    if (!await confirmBox('Revoke this link?', 'The link for ' + inv.employerName + ' stops working at once. This cannot be undone.', 'Revoke')) return;
    try {
      const o = own(), f = o.fs; await f.updateDoc(f.doc(o.db, 'surveyInvites', inv.key), { status: 'revoked' });
      o.log && o.log('Survey link revoked (reference ' + inv.key.slice(0, 8) + ')'); notify('Link revoked.', 'success'); await load(); draw(); badge();
    } catch (e) { notify('Could not revoke. ' + errText(e), 'error'); }
  }
  async function removeInvite(inv) {
    if (!await confirmBox('Delete this invite?', 'The invite and the employer e-mail saved with it are deleted. This cannot be undone.', 'Delete')) return;
    try {
      const o = own(), f = o.fs, b = f.writeBatch(); b.delete(f.doc(o.db, 'surveyInvites', inv.key)); b.delete(f.doc(o.db, 'surveyInvitesPrivate', inv.key)); await b.commit();
      notify('Invite deleted.', 'success'); await load(); draw(); badge();
    } catch (e) { notify('Could not delete. ' + errText(e), 'error'); }
  }

  /* ---------------------------------------------------------------- response actions */
  async function approve(key, r) {
    if (!await confirmBox('Add to Testimonials?', 'A copy of the answer from “' + r.displayName + '” is added to your Testimonials as HIDDEN. You then switch it on and publish it there. This response is marked approved.', 'Add to Testimonials')) return;
    try {
      const o = own(), f = o.fs, id = 'sv_' + key.slice(0, 12), tref = f.doc(o.db, 'content', 'testimonials');
      const snap = await f.getDoc(tref), raw = snap.exists() ? snap.data() : null, base = raw && Array.isArray(raw.items) ? raw : (window.testiApi ? window.testiApi.get() : { enabled: false, view: 'grid', items: [] });
      const items = base.items.slice();
      if (!items.some(t => t && t.id === id)) {
        if (items.length >= 20) { notify('Testimonials already has 20 items. Delete one first.', 'error'); return; }
        items.push(SV.testimonialFromResponse(r, id));
        await f.setDoc(tref, { enabled: base.enabled === true, view: ['grid', 'carousel', 'list'].includes(base.view) ? base.view : 'grid', items });
      }
      await f.updateDoc(f.doc(o.db, 'surveyResponses', key), { ownerStatus: 'approved', decidedAt: f.serverTimestamp(), testimonialId: id });
      o.log && o.log('Survey answer approved and added to Testimonials as hidden (reference ' + key.slice(0, 8) + ')');
      notify('Added to Testimonials as hidden. Open Testimonials to switch it on.', 'success'); await load(); draw(); badge();
    } catch (e) { notify('Could not approve. ' + errText(e), 'error'); }
  }
  async function reject(key, r) {
    if (!await confirmBox('Reject this answer?', 'The answer from “' + r.displayName + '” is kept for your records but is never published.', 'Reject')) return;
    try {
      const o = own(), f = o.fs; await f.updateDoc(f.doc(o.db, 'surveyResponses', key), { ownerStatus: 'rejected', decidedAt: f.serverTimestamp() });
      o.log && o.log('Survey answer rejected (reference ' + key.slice(0, 8) + ')'); notify('Answer rejected.', 'success'); await load(); draw(); badge();
    } catch (e) { notify('Could not reject. ' + errText(e), 'error'); }
  }

  /* ---------------------------------------------------------------- drawing (all text via el(), never innerHTML) */
  const chip = s => el('span', { class: 'svbadge ' + s }, STATE[s] || s);
  function draw() {
    const now = Date.now();
    say('svState', invites.length + ' invite' + (invites.length === 1 ? '' : 's') + ', ' + Object.keys(resps).length + ' answer' + (Object.keys(resps).length === 1 ? '' : 's') + '.');
    $('svInvList').replaceChildren(...(invites.length ? invites.map(inv => {
      const st = SV.stateOf(inv, resps[inv.key], now), p = priv[inv.key] || {};
      return el('div', { class: 'cidrow svrow' },
        el('div', { class: 'cidmain' }, el('strong', {}, inv.employerName), chip(st), el('span', { class: 'libmeta' }, [inv.company, p.clientId ? 'Client ID ' + p.clientId : '', 'Created ' + fmt(inv.createdAt), st === 'sent' ? 'Expires ' + fmt(inv.expiresAt) : '', 'Ref ' + inv.key.slice(0, 8)].filter(Boolean).join(' \u00B7 '))),
        el('div', { class: 'svact' },
          st === 'sent' ? kit.iconBtn('inbox', 'Send e-mail', inv.employerName, () => openMail(p.employerEmail || '', linkOf(inv.key), inv.ownerName, inv.employerName), { disabled: !p.employerEmail }) : null,
          st === 'sent' ? kit.iconBtn('link', 'Copy link', inv.employerName, () => copy(linkOf(inv.key), 'Link')) : null,
          st === 'sent' ? kit.iconBtn('close', 'Revoke link', inv.employerName, () => revoke(inv), { danger: true }) : null,
          (st === 'revoked' || st === 'expired') ? kit.iconBtn('trash', 'Delete', inv.employerName, () => removeInvite(inv), { danger: true }) : null));
    }) : [el('p', { class: 'dstate' }, 'No survey links yet.')]));
    const list = Object.entries(resps).sort((a, b) => (a[1].ownerStatus === 'pending' ? 0 : 1) - (b[1].ownerStatus === 'pending' ? 0 : 1) || ms(b[1].submittedAt) - ms(a[1].submittedAt));
    $('svRespList').replaceChildren(...(list.length ? list.map(([key, r]) => {
      const v = SV.parseVideoLink(r.videoUrl), s = r.ownerStatus === 'approved' ? 'approved' : r.ownerStatus === 'rejected' ? 'rejected' : 'answered';
      return el('div', { class: 'cidrow svresp' },
        el('div', { class: 'cidmain' }, el('strong', {}, r.displayName), chip(s), el('span', { class: 'libmeta' }, [r.displayRole, r.displayCompany, 'Sent ' + fmt(r.submittedAt), 'Ref ' + key.slice(0, 8)].filter(Boolean).join(' · '))),
        el('div', { class: 'svstars', role: 'img', 'aria-label': 'Rated ' + r.rating + ' out of 5' }, '★'.repeat(Number(r.rating) || 0) + '☆'.repeat(5 - (Number(r.rating) || 0)), el('span', { class: 'libmeta' }, ' ' + r.rating + '/5 · Would recommend: ' + (r.recommend === 'yes' ? 'yes' : 'no'))),
        el('p', { class: 'svquote' }, r.comment), r.best ? el('p', { class: 'dhelp' }, 'Best: ' + r.best) : null,
        v.ok && v.url ? el('p', { class: 'dhelp' }, 'Video (' + v.label + '): ', el('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer' }, 'open in a new tab'), v.kind === 'drive' ? ' · check that it opens without signing in before you use it' : '') : null,
        el('div', { class: 'dact-row' },
          s === 'answered' ? kit.iconBtn('eye', 'Approve and add to Testimonials', r.displayName, () => approve(key, r), { primary: true, text: 'Approve' }) : null,
          s === 'answered' ? kit.iconBtn('close', 'Reject', r.displayName, () => reject(key, r), { danger: true, text: 'Reject' }) : null,
          v.ok && v.url ? kit.iconBtn('copy', 'Copy video link', r.displayName, () => copy(v.url, 'Video link')) : null,
          s === 'approved' ? kit.iconBtn('pencil', 'Open Testimonials', r.displayName, () => { const b = document.querySelector('.dnav button[data-page="testimonials"]'); if (b) b.click(); }, { text: 'Open Testimonials' }) : null));
    }) : [el('p', { class: 'dstate' }, 'No answers yet.')]));
    const due = dueList(), today = SV.todayManila(now);
    $('svDueList').replaceChildren(...(due.length ? due.map(([id, r]) => el('div', { class: 'cidrow svrow' },
      el('div', { class: 'cidmain' }, el('strong', {}, id), el('span', { class: 'svbadge answered' }, 'Survey due'), el('span', { class: 'libmeta' }, 'Started ' + r.startDate + ' · due ' + SV.dueDate(r))),
      el('div', { class: 'svact' },
        kit.iconBtn('plus', 'Create survey link', id, () => useReminder(id), { primary: true }),
        kit.iconBtn('clock', 'Snooze 7 days', id, () => patchReminder(id, { snoozedUntil: SV.snoozeTo(today) }, 'Snoozed until ' + SV.snoozeTo(today) + '.')),
        kit.iconBtn('close', 'Not needed', id, () => patchReminder(id, { status: 'skipped', snoozedUntil: '' }, 'Marked as not needed.'), { danger: true })))) : [el('p', { class: 'dstate' }, 'No survey is due right now.')]));
    const all = Object.entries(rems).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    $('svRemList').replaceChildren(...(all.length ? all.map(([id, r]) => el('div', { class: 'cidrow svrow' },
      el('div', { class: 'cidmain' }, el('strong', {}, id), el('span', { class: 'libmeta' }, 'Started ' + r.startDate + ' · ' + r.months + ' months · due ' + SV.dueDate(r) + ' · ' + (r.status === 'done' ? 'survey sent' : r.status === 'skipped' ? 'not needed' : (SV.isDue(r, today) ? 'due now' : (r.snoozedUntil && r.snoozedUntil > today ? 'snoozed until ' + r.snoozedUntil : 'waiting'))))),
      el('div', { class: 'svact' },
        kit.iconBtn('pencil', 'Edit reminder', id, () => { $('svRemClient').value = id; $('svRemStart').value = r.startDate; $('svRemMonths').value = String(r.months); $('svRemStart').focus(); }),
        kit.iconBtn('trash', 'Delete reminder', id, () => removeReminder(id), { danger: true })))) : [el('p', { class: 'dstate' }, 'No reminders yet. Choose a Client ID, enter the start work date and save.')]));
    const rc = $('svRemClient'), rcur = rc.value; rc.replaceChildren(el('option', { value: '' }, 'Choose…'), ...clientIds.map(id => el('option', { value: id }, id))); rc.value = clientIds.includes(rcur) ? rcur : '';
    const old = oldInvites(); say('svCleanState', old.length ? old.length + ' old link' + (old.length === 1 ? '' : 's') + ' can be removed.' : 'Nothing to clean up.'); $('svCleanBtn').disabled = !old.length;
    const sel = $('svClient'), cur = sel.value;
    sel.replaceChildren(el('option', { value: '' }, 'None'), ...clientIds.map(id => el('option', { value: id }, id))); sel.value = clientIds.includes(cur) ? cur : '';
  }
  async function show() {
    if (!signed) return; say('svState', 'Loading…');
    try { await load(); draw(); badge(); } catch (e) { say('svState', 'Could not load the surveys. ' + errText(e)); }
  }
  function init() {
    if (!$('dp-surveys')) return;
    $('svCreate').addEventListener('click', create); $('svRemSave').addEventListener('click', addReminder); $('svCleanBtn').addEventListener('click', cleanup); $('svRefresh').addEventListener('click', show);
    $('svEmpEmail').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
    document.addEventListener('dash:page', e => { if (e.detail === 'surveys') show(); });
    document.addEventListener('own:auth', e => { signed = !!(e.detail && e.detail.ok); loaded = false; invites = []; priv = {}; resps = {}; if (!signed) { $('svInvList').replaceChildren(); $('svRespList').replaceChildren(); $('svOut').replaceChildren(); $('svOut').hidden = true; say('svState', ''); const n = $('surveyBadge'); if (n) n.hidden = true; } else badgeOnly(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
