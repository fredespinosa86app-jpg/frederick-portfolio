/* ==========================================================================
   survey-page.js - the employer survey page (CodeFlow 4.5.0, SV1). Loaded only by survey.html.
   Flow: read the key from the link (#k=KEY) -> read that ONE invite -> show the form -> send the answer and flip the invite in one batch.
   Everything the employer typed is shown and stored as plain text (textContent only, never innerHTML).
   Any problem with the link (missing, wrong, expired, used, revoked, offline rules) shows one neutral message, so the page never reveals why.
   The unguessable, single-use key is the only credential, so there is no sign-in and no Worker call. Rules: firestore.rules.strict (surveyInvites, surveyResponses).
   ========================================================================== */
const SV = window.coreSurvey, CFG = (window.portfolioSettings && window.portfolioSettings.firebase) || null;
const $ = id => document.getElementById(id);
const show = id => { for (const x of ['svLoading', 'svInvalid', 'svThanks', 'svForm']) $(x).hidden = x !== id; };
const key = SV.keyFromHash(location.hash);

(async function main() {
  if (!SV || !CFG || !key) return show('svInvalid');
  let fs, invRef, respRef, db;
  try {
    const B = new URL('../assets/vendor/firebase/10.12.2/', import.meta.url).href;   // SE-E3: the Firebase SDK comes from this site (assets/vendor/firebase), no query string
    const { initializeApp } = await import(B + 'firebase-app.js');
    fs = await import(B + 'firebase-firestore.js');
    const app = initializeApp(CFG);
    if (window.coreAppCheck) await window.coreAppCheck.start(B, app, window.portfolioSettings);   // SE-E1: App Check (monitoring), never blocks the page
    db = fs.getFirestore(app);
    invRef = fs.doc(db, 'surveyInvites', key); respRef = fs.doc(db, 'surveyResponses', key);
  } catch (e) { return show('svInvalid'); }

  let inv, form = null;
  try { const s = await fs.getDoc(invRef); inv = s.exists() ? s.data() : null; } catch (e) { return show('svInvalid'); }
  if (!SV.inviteUsable(inv, Date.now())) return show('svInvalid');
  /* a custom survey has a copy of its questions (surveyForms/KEY); a default survey has none */
  try { const fsn = await fs.getDoc(fs.doc(db, 'surveyForms', key)); if (fsn.exists()) { form = fsn.data(); if (!form || !Array.isArray(form.questions) || !form.questions.length || form.questions.length > SV.QLIM.questions) return show('svInvalid'); } } catch (e) { return show('svInvalid'); }

  /* ---- fill the page (text only) ---- */
  const owner = String(inv.ownerName || '').slice(0, 80), who = String(inv.employerName || '').slice(0, 100);
  document.title = 'Feedback for ' + owner;
  $('svLead').textContent = 'Hello ' + who + ', thank you for working with ' + owner + '. Two minutes of your time helps others know what to expect.';
  for (const id of ['svOwnerA', 'svOwnerB', 'svOwnerC']) $(id).textContent = owner;
  $('fName').value = who; $('fCompany').value = String(inv.company || '').slice(0, 100);

  /* ---- extra questions of a custom survey (text only; every value is checked again by SV.validateAnswers and by the rules) ---- */
  const extra = {}, extraErr = {};
  if (form) {
    const t = String(form.title || '').slice(0, SV.QLIM.title); if (t) { $('svTitle').textContent = t; document.title = t; }
    const intro = String(form.intro || '').slice(0, SV.QLIM.intro); if (intro) { const p = document.createElement('p'); p.className = 'sv-lead'; p.textContent = intro; p.style.whiteSpace = 'pre-line'; $('svLead').after(p); }
    const host = $('svExtra');
    form.questions.forEach((q, i) => {
      const k = SV.QKEYS[i], id = 'x_' + k, box = document.createElement('fieldset'), lg = document.createElement('legend'), err = document.createElement('p');
      box.className = 'sv-field'; box.id = id; lg.textContent = String(q.label || '').slice(0, SV.QLIM.label) + ' '; const rq = document.createElement('span'); rq.className = q.required ? 'sv-req' : 'sv-opt'; rq.textContent = q.required ? '(required)' : '(optional)'; lg.append(rq); box.append(lg);
      err.className = 'sv-err'; err.setAttribute('role', 'alert'); err.id = 'e' + id; extraErr[k] = err;
      const choose = (vals, labels) => { const w = document.createElement('div'); w.className = 'sv-choices'; vals.forEach((v, j) => { const l = document.createElement('label'), r = document.createElement('input'), sp = document.createElement('span'); l.className = 'sv-choice'; r.type = 'radio'; r.name = id; r.value = String(v); r.addEventListener('change', () => { extra[k] = String(v); err.textContent = ''; }); sp.textContent = labels[j]; l.append(r, sp); w.append(l); }); box.append(w); };
      if (q.type === 'stars') choose([1, 2, 3, 4, 5], ['1', '2', '3', '4', '5'].map(n => n + (n === '1' ? ' star' : ' stars')));
      else if (q.type === 'yesno') choose(['yes', 'no'], ['Yes', 'No']);
      else if (q.type === 'choice') choose(q.options.slice(0, SV.QLIM.options[1]).map(String), q.options.slice(0, SV.QLIM.options[1]).map(o => String(o).slice(0, SV.QLIM.option)));
      else { const long = q.type === 'long', inp = document.createElement(long ? 'textarea' : 'input'); if (long) inp.rows = 4; else inp.type = 'text'; inp.maxLength = long ? SV.QLIM.long : SV.QLIM.short; inp.setAttribute('aria-label', String(q.label || '').slice(0, SV.QLIM.label)); inp.addEventListener('input', () => { extra[k] = inp.value; err.textContent = ''; }); box.append(inp); }
      box.append(err); host.append(box);
    });
  }

  /* ---- stars: five real radio buttons ---- */
  let rating = 0; const stars = $('svStars'), starEls = [];
  for (let n = 1; n <= 5; n++) {
    const l = document.createElement('label'), i = document.createElement('input'), NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use'), name = n + (n === 1 ? ' star' : ' stars');
    l.className = 'sv-star'; i.type = 'radio'; i.name = 'rating'; i.value = String(n); i.setAttribute('aria-label', name); l.title = name;
    g.setAttribute('aria-hidden', 'true'); g.setAttribute('viewBox', '0 0 24 24'); u.setAttribute('href', '#sv-star'); g.append(u); l.append(i, g);
    i.addEventListener('change', () => { rating = n; paint(n); $('svRatingText').textContent = n + ' of 5 stars'; clearErr('Rating'); });
    l.addEventListener('mouseenter', () => paint(n)); l.addEventListener('mouseleave', () => paint(rating));
    stars.append(l); starEls.push(l);
  }
  const paint = v => starEls.forEach((l, k) => l.classList.toggle('on', k < v));

  const FIELD = { Rating: 'fRating', Comment: 'fComment', Best: 'fBest', Rec: 'fRec', Video: 'fVideo', Name: 'fName', Consent: 'fConsent' };
  const clearErr = k => { const e = $('e' + k); if (e) e.textContent = ''; const f = $(FIELD[k]); if (f && f.classList) f.classList.remove('sv-invalid'); };
  const setErr = (k, m) => { $('e' + k).textContent = m; const f = $(FIELD[k]); if (f && f.classList && f.tagName !== 'FIELDSET') f.classList.add('sv-invalid'); };
  $('fComment').addEventListener('input', () => { $('cComment').textContent = $('fComment').value.length + ' / 700'; clearErr('Comment'); });
  for (const [id, k] of [['fBest', 'Best'], ['fVideo', 'Video'], ['fName', 'Name'], ['fConsent', 'Consent']]) $(id).addEventListener('input', () => clearErr(k));
  $('fConsent').addEventListener('change', () => clearErr('Consent'));
  document.querySelectorAll('input[name=recommend]').forEach(r => r.addEventListener('change', () => clearErr('Rec')));
  show('svForm');

  /* ---- send ---- */
  let sending = false;
  $('svForm').addEventListener('submit', async ev => {
    ev.preventDefault(); if (sending) return;
    $('eSubmit').textContent = '';
    const rec = document.querySelector('input[name=recommend]:checked');
    const v = SV.validateResponse({ rating, comment: $('fComment').value, best: $('fBest').value, recommend: rec ? rec.value : '', videoUrl: $('fVideo').value, displayName: $('fName').value, displayRole: $('fRole').value, displayCompany: $('fCompany').value, consentPublish: $('fConsent').checked });
    for (const k of Object.keys(FIELD)) clearErr(k);
    let ans = null;
    if (form) { ans = SV.validateAnswers(form.questions, extra); for (const k of Object.keys(extraErr)) extraErr[k].textContent = ''; if (!ans.ok) for (const [k, m] of Object.entries(ans.errors)) extraErr[k].textContent = m; }
    if (!v.ok || (ans && !ans.ok)) {
      if (v.ok) { const fk = Object.keys(ans.errors)[0], fe = $('x_' + fk); if (fe) (fe.querySelector('input,textarea') || fe).focus(); return; }
      const map = { rating: 'Rating', comment: 'Comment', best: 'Best', recommend: 'Rec', videoUrl: 'Video', displayName: 'Name', consentPublish: 'Consent' };
      let first = '';
      for (const [f, m] of Object.entries(v.errors)) { setErr(map[f], m); first = first || map[f]; }
      const t = $(FIELD[first]); if (t) (t.tagName === 'FIELDSET' ? (t.querySelector('input') || t) : t).focus();
      return;
    }
    sending = true; $('svSend').disabled = true; $('svSend').textContent = 'Sending…';
    try {
      /* one batch = the response + the invite flipping to "submitted". The rules accept it only if both are present and the key is still valid. */
      const b = fs.writeBatch(db);
      b.set(respRef, Object.assign({}, v.data, { submittedAt: fs.serverTimestamp(), ownerStatus: 'pending' }));
      if (form) b.set(fs.doc(db, 'surveyAnswers', key), Object.assign({}, ans.data, { submittedAt: fs.serverTimestamp() }));
      b.update(invRef, { status: 'submitted', submittedAt: fs.serverTimestamp() });
      await b.commit();
      $('svThanksText').textContent = 'Your feedback was sent to ' + owner + '. Nothing is published until ' + owner + ' has reviewed it.';
      history.replaceState(null, '', location.pathname);   // the key leaves the address bar once used
      show('svThanks'); window.scrollTo(0, 0);
    } catch (e) {
      sending = false; $('svSend').disabled = false; $('svSend').textContent = 'Send my feedback';
      const c = e && e.code;
      if (c === 'permission-denied' || c === 'failed-precondition' || c === 'not-found') { show('svInvalid'); return; }
      $('eSubmit').textContent = 'We could not send your feedback. Please check your connection and try again.';
    }
  });
})();
