/* =====================================================
   MoneyMate i18n — বাংলা · English · हिन्दी · اردو
   - Source UI text stays Bangla in HTML/JS.
   - This script translates text nodes + attributes at runtime
     (and everything the app renders later) using js/i18n-dict.js
   ===================================================== */
(function () {
  'use strict';

  var LANGS = ['bn', 'en', 'hi', 'ur'];
  var SPEECH = { bn: 'bn-BD', en: 'en-IN', hi: 'hi-IN', ur: 'ur-PK' };
  var N = function (s) { return String(s == null ? '' : s).normalize('NFC'); };
  var norm = function (s) { return N(s).replace(/\s+/g, ' ').trim(); };
  var BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  var toLatin = function (s) { return s.replace(/[০-৯]/g, function (d) { return BN_DIGITS.indexOf(d); }); };

  /* ---------- dictionary ---------- */
  var maps = { bn: new Map(), en: new Map(), hi: new Map(), ur: new Map() };
  var prefixKeys = [];
  (window.MM_DICT || []).forEach(function (r) {
    var key = norm(r[0]);
    if (r[1]) maps.bn.set(key, norm(r[1]));
    maps.en.set(key, r[2]); maps.hi.set(key, r[3]); maps.ur.set(key, r[4]);
    if (/[:৳(]$/.test(key)) prefixKeys.push(key);
  });
  prefixKeys.sort(function (a, b) { return b.length - a.length; });

  /* ---------- number-bearing patterns ---------- */
  var REL = {
    en: { d: 'days ago', w: 'weeks ago', m: 'months ago', y: 'years ago', last: 'Last: ', cust: 'customers', tx: 'transactions' },
    hi: { d: 'दिन पहले', w: 'हफ़्ते पहले', m: 'महीने पहले', y: 'साल पहले', last: 'आख़िरी: ', cust: 'ग्राहक', tx: 'लेन-देन' },
    ur: { d: 'دن پہلے', w: 'ہفتے پہلے', m: 'مہینے پہلے', y: 'سال پہلے', last: 'آخری: ', cust: 'گاہک', tx: 'لین دین' }
  };
  var UNIT = { 'দিন': 'd', 'সপ্তাহ': 'w', 'মাস': 'm', 'বছর': 'y' };

  function patterns(t, lang) {
    if (lang === 'bn') return null;
    var m, R = REL[lang];
    if ((m = t.match(/^([\d,০-৯]+) জন$/))) return m[1] + ' ' + R.cust;
    if ((m = t.match(/^([\d,০-৯]+) টি লেনদেন$/))) return m[1] + ' ' + ((lang === 'en' && /^[1১]$/.test(m[1])) ? 'transaction' : R.tx);
    if ((m = t.match(/^([\d,০-৯]+) (দিন|সপ্তাহ|মাস|বছর) আগে$/))) {
      var u = R[UNIT[m[2]]];
      return lang === 'en' ? m[1] + ' ' + u : m[1] + ' ' + u;
    }
    if ((m = t.match(/^সর্বশেষ: (.+)$/))) {
      var inner = tr(m[1], lang);
      return R.last + (inner == null ? m[1] : inner);
    }
    /* transaction row: "↑ দিলাম ৳500" */
    if ((m = t.match(/^([↑↓]) (দিলাম|পেলাম) ৳(.*)$/))) {
      var w = tr(m[2], lang);
      return m[1] + ' ' + (w == null ? m[2] : w) + ' ৳' + m[3];
    }
    /* delete-customer confirm */
    if ((m = t.match(/^Customer '(.*)' delete করতে চান\? ([\d,০-৯]+) টি transaction-ও delete হবে। এই কাজটি undo করা যাবে না।$/))) {
      var n = m[1], c = m[2];
      if (lang === 'en') return "Delete customer '" + n + "'? " + c + " transaction(s) will also be deleted. This cannot be undone.";
      if (lang === 'hi') return "ग्राहक '" + n + "' को हटाना चाहते हैं? " + c + " लेन-देन भी हट जाएँगे। इसे वापस नहीं किया जा सकेगा।";
      return "گاہک '" + n + "' کو حذف کرنا چاہتے ہیں؟ " + c + " لین دین بھی حذف ہو جائیں گے۔ اسے واپس نہیں کیا جا سکے گا۔";
    }
    /* voice: unknown name -> new customer */
    if ((m = t.match(/^“(.*)” নামে কোনো গ্রাহক নেই। সংরক্ষণ করলে নতুন গ্রাহক হিসেবে যোগ হবে।(?: কাছাকাছি নাম আছে: (.*) — সেটা হলে উপরের তালিকা থেকে বেছে নিন।)?$/))) {
      var nm = m[1], near = m[2];
      var base = lang === 'en' ? '“' + nm + '” is not an existing customer. Saving will add them as a new customer.'
        : lang === 'hi' ? '“' + nm + '” नाम का कोई ग्राहक नहीं है। सहेजने पर नया ग्राहक जुड़ जाएगा।'
        : '“' + nm + '” نام کا کوئی گاہک نہیں ہے۔ محفوظ کرنے پر نیا گاہک شامل ہو جائے گا۔';
      if (near) base += lang === 'en' ? ' Similar name: ' + near + ' — if that’s the one, pick it from the list above.'
        : lang === 'hi' ? ' मिलता-जुलता नाम: ' + near + ' — वही हो तो ऊपर की सूची से चुनें।'
        : ' ملتا جلتا نام: ' + near + ' — وہی ہو تو اوپر کی فہرست سے منتخب کریں۔';
      return base;
    }
    /* voice: could not understand fields */
    if ((m = t.match(/^বোঝা যায়নি: (.*)। নিচে ঠিক করে নিন।$/))) {
      var parts = m[1].split(', ').map(function (p) { var x = tr(p, lang); return x == null ? p : x; }).join(', ');
      return lang === 'en' ? "Couldn't understand: " + parts + '. Please fix below.'
        : lang === 'hi' ? 'समझ नहीं आया: ' + parts + '। नीचे ठीक करें।'
        : 'سمجھ نہیں آیا: ' + parts + '۔ نیچے درست کریں۔';
    }
    return null;
  }

  /* ---------- core translate ---------- */
  function tr(t, lang) {
    t = norm(t);
    if (!t) return null;
    var hit = maps[lang].get(t);
    if (hit != null) return finish(hit, lang);
    var p = patterns(t, lang);
    if (p != null) return finish(p, lang);
    for (var i = 0; i < prefixKeys.length; i++) {
      var k = prefixKeys[i];
      if (t.length > k.length && t.indexOf(k) === 0) {
        var v = maps[lang].get(k);
        if (v != null) {
          var rest = t.slice(k.length), sep = /৳$/.test(k) ? '' : ' ';
          var rt = rest.trim();
          var rr = rt ? tr(rt, lang) : null;
          return finish(v + sep + (rr == null ? rt : rr), lang);
        }
      }
    }
    if (t.indexOf(' | ') > 0) {                       /* voice summary line */
      var segs = t.split(' | '), changed = false;
      var outSegs = segs.map(function (s) {
        var x = tr(s, lang);
        if (x == null && /^নতুন: /.test(s)) { var nw = tr('নতুন:', lang); if (nw != null) x = nw + s.slice(5); }
        if (x != null) { changed = true; return x; }
        return s;
      });
      if (changed) return outSegs.join('  |  ');
    }
    return null;
  }
  function finish(s, lang) { return lang === 'bn' ? s : toLatin(s); }

  function translateString(str) {
    var lang = current;
    if (str == null) return str;
    var r = tr(str, lang);
    return r == null ? str : r;
  }

  /* ---------- DOM application ---------- */
  var current = 'bn';
  var applying = false;
  var observer = null;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1 };
  var SKIP_SEL = '[data-no-i18n],.home-customer-name,.customer-name,#profileName,.customer-profile-name,#headerUserName,#profileScreenName,.customer-profile-avatar,.home-avatar,.home-customer-avatar,.history-customer,.history-note,.transaction-note,[contenteditable="true"]';
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  function skipped(el) {
    if (!el || SKIP_TAGS[el.tagName]) return true;
    return !!(el.closest && el.closest(SKIP_SEL));
  }

  function renderTextNode(node) {
    var parent = node.parentNode;
    if (!parent || skipped(parent)) return;
    var cur = node.data;
    if (node.__mmOut !== undefined && cur === node.__mmOut) {
      /* untouched since we wrote it: recompute from the original */
    } else {
      node.__mmOrig = cur;                              /* app wrote new text */
    }
    var orig = node.__mmOrig;
    var out = tr(orig, current);
    var lead = orig.match(/^\s*/)[0], trail = orig.match(/\s*$/)[0];
    var next = out == null ? orig : lead + out + trail;
    node.__mmOut = next;
    if (node.data !== next) node.data = next;
  }

  function renderAttrs(el) {
    if (skipped(el)) return;
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var key = '__mmA_' + a, outKey = '__mmAO_' + a;
      var cur = el.getAttribute(a);
      if (el[outKey] === undefined || cur !== el[outKey]) el[key] = cur;
      var out = tr(el[key], current);
      var next = out == null ? el[key] : out;
      el[outKey] = next;
      if (cur !== next) el.setAttribute(a, next);
    });
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { renderTextNode(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP_TAGS[root.tagName]) return;
    renderAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) renderTextNode(n); else renderAttrs(n);
    }
  }

  function renderTitle() {
    if (document.__mmTitle === undefined) document.__mmTitle = document.title;
    var out = tr(document.__mmTitle, current);
    document.title = out == null ? document.__mmTitle : out;
  }

  function applyAll() {
    applying = true;
    try { walk(document.body); renderTitle(); } finally { applying = false; }
    if (observer) observer.takeRecords();
  }

  function onMutations(muts) {
    if (applying) return;
    applying = true;
    try {
      muts.forEach(function (m) {
        if (m.type === 'childList') m.addedNodes.forEach(function (n) { walk(n); });
        else if (m.type === 'characterData') renderTextNode(m.target);
        else if (m.type === 'attributes') renderAttrs(m.target);
      });
    } finally { applying = false; }
    observer.takeRecords();
  }

  function startObserver() {
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /* ---------- language switching ---------- */
  function setLanguage(lang) {
    if (LANGS.indexOf(lang) < 0) lang = 'bn';
    current = lang;
    try { localStorage.setItem('mm_lang', lang); } catch (e) {}
    var html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
    if (document.body) applyAll();
    document.dispatchEvent(new CustomEvent('mm:langchange', { detail: { lang: lang } }));
  }

  /* alert / confirm / prompt go through the translator too */
  ['alert', 'confirm', 'prompt'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof msg === 'string') args[0] = translateString(msg);
      return orig.apply(window, args);
    };
  });

  window.MM_I18N = {
    t: translateString,
    lang: function () { return current; },
    speechLang: function () { return SPEECH[current] || 'bn-BD'; },
    setLanguage: setLanguage,
    languages: LANGS.slice()
  };
  window.t = translateString;
  window.setLanguage = setLanguage;

  function init() {
    var saved = 'bn';
    try { saved = localStorage.getItem('mm_lang') || 'bn'; } catch (e) {}
    current = LANGS.indexOf(saved) >= 0 ? saved : 'bn';
    document.documentElement.setAttribute('lang', current);
    document.documentElement.setAttribute('dir', current === 'ur' ? 'rtl' : 'ltr');
    applyAll();
    startObserver();
    document.dispatchEvent(new CustomEvent('mm:langchange', { detail: { lang: current } }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
