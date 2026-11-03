/* Security S3: anti-clickjacking. GitHub Pages cannot send the X-Frame-Options / frame-ancestors headers, so the page
   protects itself: if it is loaded inside another site's frame it tries to break out and, failing that, hides itself. */
(function () {
  'use strict';
  var framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (!framed) return;
  try { window.top.location.replace(window.self.location.href); } catch (e) { /* blocked: fall through */ }
  document.documentElement.style.display = 'none';
  document.addEventListener('DOMContentLoaded', function () { document.body && (document.body.textContent = ''); });
})();
