// Run: node --test scripts/core-booking.test.mjs   (Node 20+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const B = createRequire(import.meta.url)('./core-booking.js');

test('plain links from every approved provider are accepted', () => {
  const ok = ['https://calendly.com/fred/30min', 'https://api.leadconnectorhq.com/widget/booking/abc123', 'https://link.msgsndr.com/widget/booking/x', 'https://app.gohighlevel.com/v2/preview/x',
    'https://cal.com/fred/intro', 'https://app.cal.com/fred', 'https://tidycal.com/fred/call', 'https://fred.as.me/schedule.php', 'https://app.acuityscheduling.com/schedule.php?owner=1',
    'https://savvycal.com/fred/intro', 'https://calendar.google.com/calendar/appointments/schedules/AcZss?gv=true', 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZss'];
  for (const u of ok) { const r = B.parse(u); assert.equal(r.ok, true, u); assert.ok(r.name); }
});
test('Calendly inline-widget code: address comes from data-url, the script tag is ignored', () => {
  const code = '<!-- Calendly inline widget begin -->\n<div class="calendly-inline-widget" data-url="https://calendly.com/fred/30min?hide_gdpr_banner=1" style="min-width:320px;height:700px;"></div>\n<script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js" async></script>';
  const r = B.parse(code); assert.equal(r.ok, true); assert.equal(r.provider, 'calendly'); assert.equal(r.url, 'https://calendly.com/fred/30min?hide_gdpr_banner=1');
});
test('GoHighLevel iframe code: src is read, helper script is ignored, &amp; is decoded', () => {
  const code = '<iframe src="https://api.leadconnectorhq.com/widget/booking/AbC?a=1&amp;b=2" style="width:100%;border:none;" scrolling="no" id="x_1"></iframe>\n<script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>';
  const r = B.parse(code); assert.equal(r.ok, true); assert.equal(r.provider, 'ghl'); assert.equal(r.url, 'https://api.leadconnectorhq.com/widget/booking/AbC?a=1&b=2');
});
test('output never contains pasted markup, scripts or attributes', () => {
  const r = B.parse('<iframe src="https://calendly.com/fred" onload="alert(1)"></iframe><script>alert(2)</script>');
  assert.equal(r.ok, true); assert.equal(r.url, 'https://calendly.com/fred'); assert.ok(!/[<>"\s]/.test(r.url));
  assert.deepEqual(Object.keys(r).sort(), ['name', 'ok', 'provider', 'url']);
});
test('refused: script only, javascript:, data:, http, other providers, look-alike hosts, credentials, ports', () => {
  const bad = ['<script>alert(1)</script>', '<script src="https://calendly.com/x.js"></script>', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://calendly.com/fred',
    'https://evil.com/calendly.com', 'https://calendly.com.evil.com/x', 'https://evilcalendly.com/x', 'https://notcal.com/x', 'https://x.cal.com.evil.io/x',
    'https://user:pw@calendly.com/x', 'https://calendly.com:8443/x', 'https://calendly.com@evil.com/x', 'https://www.example.com', 'https://sub.calendly.com/x',
    '<iframe src="javascript:alert(1)"></iframe>', '<iframe src="//calendly.com/x"></iframe>', 'ftp://calendly.com/x', '', '   ', 'hello', 'https://calendar.google.com/calendar/r', 'https://calendly.com./x'];
  for (const u of bad) assert.equal(B.parse(u).ok, false, JSON.stringify(u));
});
test('refused: not a string, too long', () => {
  for (const v of [null, undefined, 5, {}, []]) assert.equal(B.parse(v).ok, false);
  assert.equal(B.parse('https://calendly.com/' + 'a'.repeat(B.MAX_URL)).ok, false);
  assert.equal(B.parse('x'.repeat(B.MAX_INPUT + 1)).ok, false);
});
test('fragment is dropped; the result is stable when parsed again', () => {
  const r = B.parse('https://calendly.com/fred/30min#frag'); assert.equal(r.url, 'https://calendly.com/fred/30min');
  assert.equal(B.parse(r.url).url, r.url);
});
test('clean: only a checked embed address keeps embed mode, everything else is the native form', () => {
  assert.deepEqual(B.clean({ mode: 'embed', url: 'https://calendly.com/fred' }), { mode: 'embed', url: 'https://calendly.com/fred' });
  for (const v of [null, undefined, 'x', 5, {}, { mode: 'native', url: 'https://calendly.com/fred' }, { mode: 'embed' }, { mode: 'embed', url: '' }, { mode: 'embed', url: 'https://evil.com/x' },
    { mode: 'embed', url: 'javascript:alert(1)' }, { mode: 'embed', url: '<iframe src="https://calendly.com/fred">' }, { mode: 'embed', url: 'https://calendly.com/fred#a' }, { mode: 'embed', url: 5 }, { mode: 'EMBED', url: 'https://calendly.com/fred' }])
    assert.deepEqual(B.clean(v), { mode: 'native', url: '' }, JSON.stringify(v));
});
test('CSP host list covers every provider host, https only', () => {
  assert.ok(B.CSP_HOSTS.every(h => h.startsWith('https://')));
  for (const h of ['https://calendly.com', 'https://*.leadconnectorhq.com', 'https://*.msgsndr.com', 'https://*.gohighlevel.com', 'https://*.cal.com', 'https://cal.com', 'https://tidycal.com', 'https://*.acuityscheduling.com', 'https://*.as.me', 'https://savvycal.com', 'https://calendar.google.com']) assert.ok(B.CSP_HOSTS.includes(h), h);
});
