// Run: node --test scripts/core-survey.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const S = createRequire(import.meta.url)('./core-survey.js');
const good = (o) => Object.assign({ rating: 5, comment: 'She was reliable, fast and always kept me informed.', best: '', recommend: 'yes', videoUrl: '', displayName: 'Ana Cruz', displayRole: 'Founder', displayCompany: 'Acme', consentPublish: true }, o || {});

test('newKey: 32 letters/digits, unique, uses every character class over many keys', () => {
  const seen = new Set(); let chars = '';
  for (let i = 0; i < 2000; i++) { const k = S.newKey(); assert.match(k, /^[A-Za-z0-9]{32}$/); assert.ok(!seen.has(k)); seen.add(k); chars += k; }
  assert.match(chars, /[A-Z]/); assert.match(chars, /[a-z]/); assert.match(chars, /[0-9]/);
});
test('newKey: no obvious bias (each of the 62 characters is within 20% of the mean over 64000 draws)', () => {
  const n = {}; for (let i = 0; i < 2000; i++) for (const c of S.newKey()) n[c] = (n[c] || 0) + 1;
  const vals = Object.values(n), mean = 64000 / 62; assert.equal(vals.length, 62);
  for (const v of vals) assert.ok(Math.abs(v - mean) / mean < 0.2, 'count ' + v);
});
test('newKey: refuses to run without a secure random source', () => assert.throws(() => S.newKey({}), /secure random/));
test('keyFromHash: only #k=<32 letters/digits>', () => {
  const k = S.newKey();
  assert.equal(S.keyFromHash('#k=' + k), k);
  for (const h of ['', '#', '#k=', '#k=short', '#k=' + k + 'x', '#K=' + k, '#k=' + k + '&x=1', '#x=' + k, '?k=' + k, '#k=' + k.slice(0, 31) + '-', '#k=' + k.slice(0, 31) + '%', null, undefined, 5])
    assert.equal(S.keyFromHash(h), '', String(h));
});
test('linkFor: key goes after # and never into the query string', () => {
  const k = S.newKey(), l = S.linkFor('https://x.github.io/portfolio/index.html?a=1#old', k);
  assert.equal(l, 'https://x.github.io/portfolio/survey.html#k=' + k); assert.ok(!l.includes('?'));
});
test('validKey', () => { assert.ok(S.validKey(S.newKey())); for (const v of ['', 'a'.repeat(31), 'a'.repeat(33), 'a'.repeat(31) + '_', 5, null, undefined, {}]) assert.ok(!S.validKey(v)); });

test('video: empty is allowed; YouTube, Loom and Drive links are accepted', () => {
  assert.deepEqual(S.parseVideoLink(''), { ok: true, kind: '', url: '', label: '', warn: '' });
  assert.equal(S.parseVideoLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ').kind, 'youtube');
  assert.equal(S.parseVideoLink('https://youtube.com/shorts/dQw4w9WgXcQ').kind, 'youtube');
  assert.equal(S.parseVideoLink('https://youtu.be/dQw4w9WgXcQ').kind, 'youtube');
  assert.equal(S.parseVideoLink('https://www.loom.com/share/0123456789abcdef0123456789abcdef').kind, 'loom');
  const d = S.parseVideoLink('https://drive.google.com/file/d/1AbC/view?usp=sharing'); assert.equal(d.kind, 'drive'); assert.match(d.warn, /Anyone with the link/);
});
test('video: look-alike hosts, other schemes, credentials, ports, spaces and long links are refused', () => {
  for (const u of ['http://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/', 'https://loom.com/share/', 'https://notloom.com/share/0123456789', 'https://drive.google.com',
    'https://user:pw@drive.google.com/file/d/1', 'https://drive.google.com:8443/file/d/1', 'https://docs.google.com/document/d/1', 'javascript:alert(1)', 'data:text/html,x',
    'https://drive.google.com/file/d/1 2', 'https://drive.google.com/' + 'a'.repeat(300), 'not a link', 'ftp://drive.google.com/x', '//drive.google.com/x'])
    assert.equal(S.parseVideoLink(u).ok, false, u);
});

test('cleanText: control, zero-width, bidi and tag characters are removed; spaces collapse', () => {
  assert.equal(S.cleanText('a​b‮c\u0007d\u{E0041}e   f'), 'abcde f');
  assert.equal(S.cleanText('x'.repeat(50), 10), 'x'.repeat(10));
  assert.equal(S.cleanText('Ａｂｃ'), 'Abc');
  assert.equal(S.cleanText('a\r\n\r\n\r\n\r\nb', 50, true), 'a\n\nb');
  assert.equal(S.cleanText(null), ''); assert.equal(S.cleanText(undefined), ''); assert.equal(S.cleanText(42), '42');
});

test('validateResponse: a complete good answer passes and returns only the allowed fields', () => {
  const r = S.validateResponse(good({ extra: 'x', status: 'approved', ownerStatus: 'approved' }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.data).sort(), ['best', 'comment', 'consentPublish', 'displayCompany', 'displayName', 'displayRole', 'rating', 'recommend', 'videoUrl']);
});
test('validateResponse: rating must be a whole number 1 to 5', () => {
  for (const v of [0, 6, -1, 2.5, '', 'abc', null, undefined, NaN, Infinity]) assert.ok(S.validateResponse(good({ rating: v })).errors.rating, String(v));
  for (const v of [1, 2, 3, 4, 5, '4']) assert.equal(S.validateResponse(good({ rating: v })).ok, true, String(v));
});
test('validateResponse: comment length edges (19 fails, 20 passes, 700 passes, long input is refused)', () => {
  assert.ok(S.validateResponse(good({ comment: 'a'.repeat(19) })).errors.comment);
  assert.equal(S.validateResponse(good({ comment: 'a'.repeat(20) })).ok, true);
  assert.equal(S.validateResponse(good({ comment: 'a'.repeat(700) })).ok, true);
  assert.ok(S.validateResponse(good({ comment: 'a'.repeat(701) })).errors.comment);
  assert.ok(S.validateResponse(good({ comment: 'a'.repeat(901) })).errors.comment);
  assert.ok(S.validateResponse(good({ best: 'a'.repeat(501) })).errors.best);
  assert.equal(S.validateResponse(good({ best: 'a'.repeat(500) })).ok, true);
  assert.ok(S.validateResponse(good({ comment: ' '.repeat(40) })).errors.comment);
});
test('validateResponse: consent, recommend and name are required; optional fields may be empty', () => {
  assert.ok(S.validateResponse(good({ consentPublish: false })).errors.consentPublish);
  assert.ok(S.validateResponse(good({ consentPublish: 'true' })).errors.consentPublish);
  assert.ok(S.validateResponse(good({ consentPublish: undefined })).errors.consentPublish);
  assert.ok(S.validateResponse(good({ recommend: 'maybe' })).errors.recommend);
  assert.ok(S.validateResponse(good({ displayName: '   ' })).errors.displayName);
  assert.equal(S.validateResponse(good({ displayRole: '', displayCompany: '', best: '' })).ok, true);
});
test('validateResponse: a bad video link is reported, not silently dropped', () => assert.ok(S.validateResponse(good({ videoUrl: 'https://evil.com/x' })).errors.videoUrl));
test('validateResponse: hostile text is stored as plain text (no markup is interpreted here) and hidden characters are stripped', () => {
  const r = S.validateResponse(good({ comment: '<img src=x onerror=alert(1)> great‮ work done well', displayName: 'A​BC' }));
  assert.equal(r.ok, true); assert.equal(r.data.displayName, 'ABC'); assert.ok(!/‮/.test(r.data.comment)); assert.ok(r.data.comment.includes('<img'));   // escaped later by textContent
});
test('validateResponse: non-objects do not throw', () => { for (const v of [null, undefined, 'x', 5, [], {}]) assert.equal(S.validateResponse(v).ok, false); });

test('inviteUsable: only "sent" and before the end time; every other state is refused', () => {
  const now = 1_000_000;
  assert.equal(S.inviteUsable({ status: 'sent', expiresAt: now + 1 }, now), true);
  assert.equal(S.inviteUsable({ status: 'sent', expiresAt: now }, now), false);
  assert.equal(S.inviteUsable({ status: 'sent', expiresAt: now - 1 }, now), false);
  for (const st of ['submitted', 'revoked', 'draft', 'SENT', undefined]) assert.equal(S.inviteUsable({ status: st, expiresAt: now + 99 }, now), false, String(st));
  assert.equal(S.inviteUsable({ status: 'sent', expiresAt: { toMillis: () => now + 5 } }, now), true);
  assert.equal(S.inviteUsable({ status: 'sent' }, now), false); assert.equal(S.inviteUsable(null, now), false); assert.equal(S.inviteUsable({ status: 'sent', expiresAt: 'soon' }, now), false);
});
test('expiryFrom: 60 days', () => assert.equal(S.expiryFrom(0), 60 * 864e5));
test('stateOf: labels', () => {
  const now = 5e9, ok = { status: 'sent', expiresAt: now + 1 };
  assert.equal(S.stateOf(ok, null, now), 'sent'); assert.equal(S.stateOf({ status: 'sent', expiresAt: now - 1 }, null, now), 'expired');
  assert.equal(S.stateOf({ status: 'revoked', expiresAt: now + 1 }, null, now), 'revoked');
  assert.equal(S.stateOf({ status: 'submitted' }, { ownerStatus: 'pending' }, now), 'answered');
  assert.equal(S.stateOf({ status: 'submitted' }, { ownerStatus: 'approved' }, now), 'approved');
  assert.equal(S.stateOf({ status: 'submitted' }, { ownerStatus: 'rejected' }, now), 'rejected');
  assert.equal(S.stateOf(null, null, now), 'unknown');
});
test('testimonialFromResponse: arrives switched OFF, fits the public limits, no photo', () => {
  const t = S.testimonialFromResponse(good({ comment: 'x'.repeat(700), displayRole: 'R'.repeat(80), displayCompany: 'C'.repeat(100) }), 'sv_abc');
  assert.equal(t.enabled, false); assert.equal(t.photo, ''); assert.equal(t.rating, 5); assert.ok(t.role.length <= 100); assert.ok(t.quote.length <= 700); assert.equal(t.id, 'sv_abc');
  assert.equal(S.testimonialFromResponse(good({ displayRole: '', displayCompany: 'Acme' }), 'i').role, 'Acme');
  assert.equal(S.testimonialFromResponse(good({ displayRole: 'CEO', displayCompany: '' }), 'i').role, 'CEO');
  assert.equal(S.testimonialFromResponse(null, 'i').enabled, false);
});
test('mailtoFor: address stays readable, text is encoded, link is inside the body', () => {
  const k = S.newKey(), l = S.linkFor('https://x.io/p/', k), m = S.mailtoFor('boss+1@acme.com', l, 'Frederick', 'Ana');
  assert.ok(m.startsWith('mailto:boss%2B1@acme.com?subject=')); assert.ok(decodeURIComponent(m).includes(l)); assert.ok(!/ /.test(m)); assert.ok(!m.includes('\n'));
});
test('validEmail', () => { assert.ok(S.validEmail('a@b.co')); for (const v of ['', 'a@b', 'a b@c.de', '@c.de', 'a@@c.de', 'x'.repeat(130) + '@c.de', null, 5]) assert.ok(!S.validEmail(v), String(v)); });
test('messageFor: names the owner and employer, holds the link once, states the expiry', () => {
  const k = S.newKey(), l = S.linkFor('https://x.io/p/', k), m = S.messageFor(l, 'Frederick', 'Ana');
  assert.match(m.subject, /Frederick/); assert.ok(m.body.startsWith('Hello Ana,')); assert.equal(m.body.split(l).length, 2); assert.match(m.body, /60 days/);
});
test('webmailUrls: fixed https hosts, address and text encoded, link inside, no raw spaces or line breaks', () => {
  const k = S.newKey(), l = S.linkFor('https://x.io/p/', k), u = S.webmailUrls('boss+1@acme.com', l, 'Frederick', 'Ana');
  assert.ok(u.gmail.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=boss%2B1%40acme.com&su=')); assert.ok(u.outlook.startsWith('https://outlook.live.com/mail/0/deeplink/compose?to=boss%2B1%40acme.com&subject='));
  for (const x of [u.gmail, u.outlook]) { assert.ok(!/[ \n]/.test(x)); assert.ok(decodeURIComponent(x).includes(l)); assert.equal(new URL(x).protocol, 'https:'); }
  const e = S.webmailUrls('a@b.co&bcc=evil@x.com', l, 'F', 'A'); assert.ok(!new URL(e.gmail).searchParams.has('bcc')); assert.ok(!new URL(e.outlook).searchParams.has('bcc'));
});
test('testimonialFromResponse: only a Google Drive video link is carried over (YouTube, Loom, junk are not)', () => {
  const d = 'https://drive.google.com/file/d/abc123/view?usp=sharing';
  assert.equal(S.testimonialFromResponse(good({ videoUrl: d }), 'i').video, d);
  for (const v of ['', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.loom.com/share/abcdef1234567890', 'javascript:alert(1)', 'http://drive.google.com/x', 'https://evil.com/drive.google.com/x'])
    assert.ok(!('video' in S.testimonialFromResponse(good({ videoUrl: v }), 'i')), v);
});
test('SV2a dates: addMonths clamps to month end, leap years, year roll-over, bad input', () => {
  assert.equal(S.addMonths('2026-08-31', 6), '2027-02-28'); assert.equal(S.addMonths('2027-08-31', 6), '2028-02-29');
  assert.equal(S.addMonths('2026-11-15', 3), '2027-02-15'); assert.equal(S.addMonths('2026-01-31', 1), '2026-02-28'); assert.equal(S.addMonths('2026-12-31', 12), '2027-12-31');
  for (const b of ['', 'x', '2026-02-30', '2026-13-01', '1999-01-01', null, 20260101]) { assert.equal(S.addMonths(b, 3), ''); assert.equal(S.validDate(b), false, String(b)); }
  assert.equal(S.addDays('2026-12-28', 7), '2027-01-04');
});
test('SV2a todayManila uses UTC+8', () => { assert.equal(S.todayManila(Date.parse('2026-11-06T16:30:00Z')), '2026-11-07'); assert.equal(S.todayManila(Date.parse('2026-11-06T15:59:00Z')), '2026-11-06'); });
test('SV2a validReminder: needs a real date and 1-24 whole months; always active, no snooze', () => {
  assert.deepEqual(S.validReminder({ startDate: '2026-02-01', months: 3 }), { ok: true, data: { startDate: '2026-02-01', months: 3, status: 'active', snoozedUntil: '' } });
  assert.ok(S.validReminder({ startDate: '2026-02-01', months: '6' }).ok);
  for (const m of [0, 25, 1.5, 'x', null]) assert.ok(S.validReminder({ startDate: '2026-02-01', months: m }).errors.months, String(m));
  assert.ok(S.validReminder({ startDate: '2026-02-31', months: 3 }).errors.startDate); assert.ok(S.validReminder(null).errors.startDate);
});
test('SV2a isDue: due on the day, not before, not when snoozed, done or skipped', () => {
  const r = { startDate: '2026-08-07', months: 3, status: 'active', snoozedUntil: '' };
  assert.equal(S.dueDate(r), '2026-11-07'); assert.equal(S.isDue(r, '2026-11-06'), false); assert.equal(S.isDue(r, '2026-11-07'), true); assert.equal(S.isDue(r, '2027-03-01'), true);
  assert.equal(S.isDue({ ...r, snoozedUntil: '2026-11-14' }, '2026-11-10'), false); assert.equal(S.isDue({ ...r, snoozedUntil: '2026-11-14' }, '2026-11-14'), true);
  assert.equal(S.isDue({ ...r, status: 'done' }, '2027-01-01'), false); assert.equal(S.isDue({ ...r, status: 'skipped' }, '2027-01-01'), false);
  assert.equal(S.isDue({ ...r, snoozedUntil: 'garbage' }, '2026-11-07'), true); assert.equal(S.isDue(null, '2026-11-07'), false); assert.equal(S.snoozeTo('2026-11-07'), '2026-11-14');
});
test('SV2a cleanable: only never-answered sent/revoked invites past the 30-day grace; answered are never cleanable', () => {
  const now = Date.parse('2026-11-07T00:00:00Z'), D = 864e5;
  assert.equal(S.cleanable({ status: 'sent', expiresAt: now - 31 * D }, now), true); assert.equal(S.cleanable({ status: 'sent', expiresAt: now - 29 * D }, now), false);
  assert.equal(S.cleanable({ status: 'sent', expiresAt: now + D }, now), false); assert.equal(S.cleanable({ status: 'revoked', expiresAt: now - 31 * D }, now), true);
  assert.equal(S.cleanable({ status: 'revoked', expiresAt: now + 20 * D }, now), false);
  assert.equal(S.cleanable({ status: 'submitted', expiresAt: now - 99 * D }, now), false); assert.equal(S.cleanable(null, now), false); assert.equal(S.cleanable({ status: 'sent' }, now), false);
});
