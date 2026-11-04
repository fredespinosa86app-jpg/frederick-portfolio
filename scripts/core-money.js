/* ==========================================================================
   core-money.js - currency-aware money maths for CodeFlow 4.5.0 (P0 library; used by the billing phases).
   Amounts are whole numbers of the currency's smallest unit ("minor units"), never floating point.
   Supported currencies are an explicit table; anything else is refused.
   Invoice total = hourly rate (minor units) x minutes / 60, rounded ONCE (half up) at the total.
   ========================================================================== */
(function (root) {
  'use strict';
  const CURRENCIES = { USD: 2, GBP: 2, EUR: 2, AUD: 2, CAD: 2, PHP: 2, JPY: 0, KWD: 3 };
  const isSupported = c => Object.prototype.hasOwnProperty.call(CURRENCIES, c);
  function exponent(cur) { if (!isSupported(cur)) throw new Error('Unsupported currency: ' + cur); return CURRENCIES[cur]; }
  const safe = b => { if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large.'); return Number(b); };
  /* "12.5" -> 1250 (USD). Text only, never a float. Refuses more decimals than the currency allows. */
  function toMinor(text, cur) {
    const e = exponent(cur), s = String(text).trim();
    const m = /^([0-9]{1,12})(?:\.([0-9]+))?$/.exec(s);
    if (!m) throw new Error('Enter a positive amount such as 12.50.');
    const frac = m[2] || '';
    if (frac.length > e) throw new Error(cur + ' allows ' + e + ' decimal place' + (e === 1 ? '' : 's') + '.');
    return safe(BigInt(m[1] + frac.padEnd(e, '0')));
  }
  function fromMinor(minor, cur) {
    const e = exponent(cur);
    if (!Number.isSafeInteger(minor)) throw new Error('Amount must be a whole number of minor units.');
    const neg = minor < 0, s = String(Math.abs(minor)).padStart(e + 1, '0');
    const out = e ? s.slice(0, -e) + '.' + s.slice(-e) : s;
    return (neg ? '-' : '') + out;
  }
  function format(minor, cur) {
    const t = fromMinor(minor, cur), neg = t[0] === '-', body = neg ? t.slice(1) : t, dot = body.indexOf('.');
    const whole = dot < 0 ? body : body.slice(0, dot), rest = dot < 0 ? '' : body.slice(dot);
    return cur + ' ' + (neg ? '-' : '') + whole.replace(/\B(?=(\d{3})+$)/g, ',') + rest;
  }
  /* half-up integer division of a non-negative BigInt */
  const divRound = (n, d) => (n * 2n + d) / (d * 2n);
  function lineTotal(rateMinorPerHour, minutes) {
    if (!Number.isSafeInteger(rateMinorPerHour) || rateMinorPerHour < 0) throw new Error('Rate must be a non-negative whole number of minor units.');
    if (!Number.isSafeInteger(minutes) || minutes < 0) throw new Error('Minutes must be a non-negative whole number.');
    return safe(divRound(BigInt(rateMinorPerHour) * BigInt(minutes), 60n));
  }
  /* several billable entries on one invoice: sum the minutes first, then round once */
  function invoiceTotal(rateMinorPerHour, minutesList) {
    const total = (minutesList || []).reduce((a, m) => { if (!Number.isSafeInteger(m) || m < 0) throw new Error('Minutes must be non-negative whole numbers.'); return a + m; }, 0);
    return { minutes: total, amount: lineTotal(rateMinorPerHour, total) };
  }
  /* hours as text ("40", "7.25") -> whole minutes; at most 2 decimals; refuses anything that is not an exact minute */
  function hoursToMinutes(text) {
    const m = /^([0-9]{1,5})(?:\.([0-9]{1,2}))?$/.exec(String(text).trim());
    if (!m) throw new Error('Enter hours such as 7.5.');
    const frac = (m[2] || '').padEnd(2, '0'), mins = BigInt(m[1]) * 60n + BigInt(frac) * 60n / 100n;
    if (BigInt(frac) * 60n % 100n !== 0n) throw new Error('Use hours that are a whole number of minutes (for example 7.25 = 7 h 15 min).');
    return safe(mins);
  }
  const api = { CURRENCIES, isSupported, exponent, toMinor, fromMinor, format, lineTotal, invoiceTotal, hoursToMinutes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.coreMoney = api;
})(typeof window !== 'undefined' ? window : globalThis);
