// The language hint (2026-11-04, owner 「언어 변경을 더 편하게 알기 쉽게」): a visitor whose browser prefers another of the
// site's twelve languages, on a page that is in that language too, is told once at the top, in that language
// (「View in English →」). Closing it is remembered on this device only (localStorage); nothing is sent anywhere.
// The words come from the page's language menu (build.py lang_menu: data-see = {code: [link text, close]}).
(function () {
  var menu = document.querySelector('.langmenu');
  if (!menu) return;
  // the menu closes like a menu: a tap anywhere else, or Esc (back to its button)
  document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  var here = document.documentElement.lang, words = {};
  try { words = JSON.parse(menu.getAttribute('data-see') || '{}'); } catch (e) { return; }
  var alts = {};
  menu.querySelectorAll('a[hreflang]').forEach(function (a) { alts[a.getAttribute('hreflang')] = a.getAttribute('href'); });
  function ours(tag) {
    tag = String(tag || '').toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(tag)) return 'zh-Hant';
    if (/^zh/.test(tag)) return 'zh-Hans';
    if (/^pt/.test(tag)) return 'pt-BR';
    var base = tag.split('-')[0];
    if (base === 'in') return 'id';
    return ['ja', 'en', 'ko', 'es', 'fr', 'it', 'de', 'id', 'ru'].indexOf(base) >= 0 ? base : null;
  }
  var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  var want = null;
  for (var i = 0; i < prefs.length && !want; i++) want = ours(prefs[i]);
  if (!want || want === here || !words[want] || !alts[want]) return;
  var key = 'piko.langhint.' + want;
  try { if (localStorage.getItem(key)) return; } catch (e) {}
  var bar = document.createElement('div');
  bar.className = 'langhint'; bar.setAttribute('lang', want); bar.setAttribute('role', 'note');
  var a = document.createElement('a');
  a.href = alts[want]; a.setAttribute('hreflang', want); a.textContent = words[want][0];
  var x = document.createElement('button');
  x.type = 'button'; x.setAttribute('aria-label', words[want][1]); x.textContent = '×';
  x.addEventListener('click', function () { try { localStorage.setItem(key, '1'); } catch (e) {} bar.remove(); });
  bar.appendChild(a); bar.appendChild(x);
  var main = document.querySelector('main');
  if (main) main.insertBefore(bar, main.firstChild);
})();
