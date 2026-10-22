/* =====================================================
   Theme (light / dark / auto) + language & theme sheet
   ===================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function pref() { try { return localStorage.getItem('mm_theme') || 'system'; } catch (e) { return 'system'; } }

  function applyTheme() {
    var p = pref();
    var dark = p === 'dark' || (p === 'system' && mq && mq.matches);
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0d1411' : '#067a4b');
    refreshSettingsUI();
  }

  function setTheme(p) {
    try { localStorage.setItem('mm_theme', p); } catch (e) {}
    applyTheme();
  }

  function toggleTheme() {
    setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }

  function refreshSettingsUI() {
    var p = pref();
    document.querySelectorAll('#themeSeg button').forEach(function (b) {
      var on = b.getAttribute('data-theme-pref') === p;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var l = (window.MM_I18N && MM_I18N.lang()) || 'bn';
    document.querySelectorAll('#langGrid button').forEach(function (b) {
      var on = b.getAttribute('data-lang') === l;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function openSettingsSheet() {
    refreshSettingsUI();
    var o = document.getElementById('settingsOverlay');
    if (o) { o.classList.remove('hidden'); var b = o.querySelector('.lang-grid button.active') || o.querySelector('button'); if (b) b.focus(); }
  }
  function closeSettingsSheet() {
    var o = document.getElementById('settingsOverlay');
    if (o) o.classList.add('hidden');
  }

  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (pref() === 'system') applyTheme(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSettingsSheet(); });
  document.addEventListener('mm:langchange', refreshSettingsUI);

  window.setTheme = setTheme;
  window.toggleTheme = toggleTheme;
  window.openSettingsSheet = openSettingsSheet;
  window.closeSettingsSheet = closeSettingsSheet;

  applyTheme();
})();
