/*!
 * MoneyMate — বাংলা ভয়েস এন্ট্রি (voice-entry.js)
 * "রহিমকে ৫০০ টাকা দিলাম" বললেই লেনদেন তৈরি হবে।
 *
 * ব্যবহার: index.html-এ app.js-এর পরে:
 *   <script src="js/voice-entry.js"></script>
 */
(function () {
  'use strict';

  /* ================================================================
     ১) CONFIG — শুধু এই অংশটা আপনার অ্যাপ অনুযায়ী বদলাতে হবে
     ================================================================ */
  const CONFIG = {
    // ভয়েস চেনার ভাষা: অ্যাপের ভাষা অনুযায়ী (bn-BD / en-IN / hi-IN / ur-PK)
    lang: 'bn-BD',

    // লগইন করা থাকলে true ফেরত দিন। লগইন/সাইনআপ স্ক্রিনে মাইক বাটন লুকাবে।
    isLoggedIn: function () {
      const app = document.getElementById('app');
      return !!app && !app.classList.contains('hidden');
    },

    // সব গ্রাহকের তালিকা ফেরত দিন → [{ id: 'abc123', name: 'Rahim' }, ...]
    getCustomers: async function () {
      await loadCustomers(); // js/customers.js
      return (customers || []).map(function (c) { return { id: c.id, name: c.name }; });
    },

    // একটা লেনদেন সেভ করুন।
    // tx = { customerId, type: 'gave' | 'got', amount: 500, note: '...', date: '2026-10-21' }
    //   gave = দিলাম, got = পেলাম
    addTransaction: async function (tx) {
      // getSession reads the locally restored session; getUser requires a server check.
      const auth = await supabaseClient.auth.getSession();
      const user = auth.data && auth.data.session && auth.data.session.user;
      if (!user) throw new Error('আগে অনলাইনে Login করুন। Offline ব্যবহারের জন্য আগে থেকে Login করা থাকতে হবে।');

      const customer = (customers || []).find(function (c) { return String(c.id) === String(tx.customerId); });
      if (!customer) throw new Error('গ্রাহক পাওয়া যায়নি।');

      // এই অ্যাপে: দিলাম = "receive", পেলাম = "pay"
      const dbType = tx.type === 'gave' ? 'receive' : 'pay';
      const payload = {
        user_id: user.id,
        customer_id: customer.id,
        customer_name: customer.name,
        amount: tx.amount,
        type: dbType,
        transaction_date: tx.date,
        note: tx.note || ''
      };
      let saved;
      if (window.offlineSupport && typeof offlineSupport.offlineAwareInsertTransaction === 'function') {
        saved = await offlineSupport.offlineAwareInsertTransaction(payload);
      } else {
        const res = await supabaseClient.from('transactions').insert(payload).select().single();
        if (res.error) throw new Error(res.error.message);
        saved = res.data;
      }
      if (!saved) throw new Error('লেনদেন Save হয়নি। আবার চেষ্টা করুন।');

      await loadTransactions();                       // লিস্ট ও টোটাল রিফ্রেশ
      showTransactionSuccess(customer, saved);        // অ্যাপের নিজস্ব সফল-স্ক্রিন
    },

    // নতুন গ্রাহক তৈরি করুন → { id, name } ফেরত দিন (নাম আগে থেকে থাকলে সেই গ্রাহকই ফেরত আসে)
    createCustomer: async function (name) {
      const c = await getOrCreateCustomer(name, ''); // js/customers.js
      if (!c) throw new Error('নতুন গ্রাহক তৈরি হয়নি। আবার চেষ্টা করুন।');
      return { id: c.id, name: c.name };
    },

    // সেভ হওয়ার পর লিস্ট/টোটাল রিফ্রেশ করতে চাইলে এখানে কল করুন
    onSaved: function (tx) {},

    // রং (আপনার অ্যাপের সাথে মিলিয়ে নিন)
    colorAccent: '#078b54',
    colorGave: '#d53a42',
    colorGot: '#078b54'
  };

  /* ================================================================
     ২) বাংলা টেক্সট পার্সার (এই অংশ সাধারণত বদলাতে হবে না)
     ================================================================ */
  const N = (s) => (s || '').normalize('NFC');
  const mk = (obj) => {
    const o = {};
    Object.keys(obj).forEach((k) => { o[N(k)] = obj[k]; });
    return o;
  };

  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const toEnDigits = (s) => s
    .replace(/[০-৯]/g, (d) => BN_DIGITS.indexOf(d))
    .replace(/[\u0966-\u096F]/g, (d) => d.charCodeAt(0) - 0x0966)      // Devanagari
    .replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 0x0660)      // Arabic-Indic
    .replace(/[\u06F0-\u06F9]/g, (d) => d.charCodeAt(0) - 0x06F0);     // Persian/Urdu
  const toBnDigits = (s) => String(s).replace(/\d/g, (d) => BN_DIGITS[d]);

  // কথায় বলা সংখ্যা (স্পিচ রিকগনিশন সাধারণত অঙ্কেই লেখে, এটা ব্যাকআপ)
  const SMALL = mk({
    'এক': 1, 'দুই': 2, 'দু': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5, 'পাচ': 5,
    'ছয়': 6, 'সাত': 7, 'আট': 8, 'নয়': 9, 'দশ': 10, 'এগারো': 11, 'বারো': 12,
    'তেরো': 13, 'চৌদ্দ': 14, 'পনেরো': 15, 'পনের': 15, 'ষোলো': 16, 'সতেরো': 17,
    'আঠারো': 18, 'উনিশ': 19, 'বিশ': 20, 'পঁচিশ': 25, 'ত্রিশ': 30, 'চল্লিশ': 40,
    'পঞ্চাশ': 50, 'ষাট': 60, 'সত্তর': 70, 'আশি': 80, 'নব্বই': 90
  });
  const HALF = mk({ 'সাড়ে': 0.5, 'দেড়': 1.5, 'আড়াই': 2.5 });
  const MULT = mk({ 'শো': 100, 'শ': 100, 'শত': 100, 'হাজার': 1000, 'লাখ': 100000, 'লক্ষ': 100000,
    'hundred': 100, 'thousand': 1000, 'lakh': 100000, 'lac': 100000, 'k': 1000,
    'सौ': 100, 'हज़ार': 1000, 'हजार': 1000, 'लाख': 100000, 'سو': 100, 'ہزار': 1000, 'لاکھ': 100000 });
  const MULT_RE = '(শো|শত|শ|হাজার|লাখ|লক্ষ|hundred|thousand|lakh|lac|k|सौ|हज़ार|हजार|लाख|سو|ہزار|لاکھ)';

  const wordVal = (w) => (w in SMALL ? SMALL[w] : (w in HALF ? HALF[w] : null));

  function wordsToNumber(text) {
    const toks = N(text).replace(/[।,]/g, ' ').split(/\s+/).filter(Boolean);
    let total = 0, cur = 0, hit = false;
    for (const raw of toks) {
      let w = raw, mult = null;
      const m = raw.match(/^(.*?)(শো|শত|শ|হাজার|লাখ|লক্ষ)$/);
      if (m && (m[1] === '' || wordVal(m[1]) !== null)) { w = m[1]; mult = MULT[m[2]]; }
      if (w !== '') {
        const v = wordVal(w);
        if (v === null) continue;
        cur += v; hit = true;
      }
      if (mult) {
        hit = true;
        if (cur === 0) cur = 1;
        if (mult >= 1000) { total += cur * mult; cur = 0; } else { cur *= mult; }
      }
    }
    total += cur;
    return hit ? Math.round(total) : null;
  }

  function parseAmount(raw) {
    const t = toEnDigits(N(raw)).replace(/(\d),(\d)/g, '$1$2');
    const m = t.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + MULT_RE + '?(?![a-zA-Z])', 'i'));
    if (m) {
      let v = parseFloat(m[1]);
      if (m[2]) v *= MULT[m[2]];
      return Math.round(v);
    }
    return wordsToNumber(t);
  }

  // দিলাম / পেলাম — বাংলায় ক্রিয়া শেষে আসে, তাই যেটা পরে আছে সেটাই ধরা হয়
  const GAVE = ['দিলাম', 'দিয়েছি', 'দিয়েছিলাম', 'দিছি', 'দিয়া', 'দিলুম',
    'gave', 'given', 'give', 'paid', 'lent', 'दिया', 'दिए', 'दिये', 'दी', 'دیا', 'دیے', 'دی'].map(N);
  const GOT = ['পেলাম', 'পেয়েছি', 'পেয়েছিলাম', 'পাইলাম', 'পাইছি', 'পাইয়াছি', 'আদায়', 'জমা',
    'got', 'received', 'collected', 'मिला', 'मिले', 'मिली', 'पाया', 'वसूल', 'ملا', 'ملے', 'وصول'].map(N);

  function detectType(t) {
    let g = -1, r = -1;
    t = t.toLowerCase();
    GAVE.forEach((w) => { const i = t.lastIndexOf(w); if (i > g) g = i; });
    GOT.forEach((w) => { const i = t.lastIndexOf(w); if (i > r) r = i; });
    if (g < 0 && r < 0) return null;
    return g > r ? 'gave' : 'got';
  }

  /* ---- নাম মেলানো: বাংলা ↔ ইংরেজি নাম ("রহিম" ↔ "Rahim") ---- */
  const BN_MAP = {
    'ক': 'k', 'খ': 'k', 'গ': 'g', 'ঘ': 'g', 'ঙ': 'n', 'চ': 'c', 'ছ': 'c',
    'জ': 'j', 'ঝ': 'j', 'ঞ': 'n', 'ট': 't', 'ঠ': 't', 'ড': 'd', 'ঢ': 'd',
    'ণ': 'n', 'ত': 't', 'থ': 't', 'দ': 'd', 'ধ': 'd', 'ন': 'n', 'প': 'p',
    'ফ': 'p', 'ব': 'b', 'ভ': 'b', 'ম': 'm', 'য': 'j', 'র': 'r', 'ল': 'l',
    'শ': 's', 'ষ': 's', 'স': 's', 'হ': 'h', 'ৎ': 't', 'ং': 'n'
  };
  const collapse = (s) => s.replace(/(.)\1+/g, '$1');
  const isBangla = (s) => /[\u0980-\u09FF]/.test(s);

  function bnSkel(s) {
    s = N(s).replace(/\u09A1\u09BC|\u09A2\u09BC/g, 'র').replace(/\u09AF\u09BC/g, '');
    let out = '';
    for (const ch of s) if (BN_MAP[ch]) out += BN_MAP[ch];
    return collapse(out);
  }
  function enSkel(s) {
    s = s.toLowerCase().replace(/[^a-z]/g, '')
      .replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/sh/g, 's').replace(/ch/g, 'c')
      .replace(/th/g, 't').replace(/dh/g, 'd').replace(/ph/g, 'p').replace(/bh/g, 'b')
      .replace(/jh/g, 'j').replace(/[aeiouyw]/g, '')
      .replace(/q/g, 'k').replace(/z/g, 'j').replace(/v/g, 'b').replace(/f/g, 'p');
    return collapse(s);
  }
  const DEV_MAP = { 'क': 'k', 'ख': 'k', 'ग': 'g', 'घ': 'g', 'च': 'c', 'छ': 'c', 'ज': 'j', 'झ': 'j', 'ट': 't', 'ठ': 't',
    'ड': 'd', 'ढ': 'd', 'ण': 'n', 'त': 't', 'थ': 't', 'द': 'd', 'ध': 'd', 'न': 'n', 'प': 'p', 'फ': 'p', 'ब': 'b',
    'भ': 'b', 'म': 'm', 'र': 'r', 'ल': 'l', 'श': 's', 'ष': 's', 'स': 's', 'ह': 'h', 'ं': 'n', 'ज़': 'j', 'फ़': 'p' };
  const AR_MAP = { 'ک': 'k', 'گ': 'g', 'چ': 'c', 'ج': 'j', 'ٹ': 't', 'ت': 't', 'ط': 't', 'ڈ': 'd', 'د': 'd', 'ن': 'n',
    'ں': 'n', 'پ': 'p', 'ف': 'p', 'ب': 'b', 'م': 'm', 'ر': 'r', 'ڑ': 'r', 'ل': 'l', 'س': 's', 'ص': 's', 'ش': 's',
    'ہ': 'h', 'ح': 'h', 'ھ': 'h', 'ق': 'k', 'خ': 'k', 'ز': 'j', 'ذ': 'j', 'ض': 'j', 'ظ': 'j', 'غ': 'g', 'ث': 's' };
  const isDev = (s) => /[\u0900-\u097F]/.test(s);
  const isAr = (s) => /[\u0600-\u06FF]/.test(s);
  function mapSkel(s, M) {
    s = N(s).replace(/\u095B/g, 'ज').replace(/\u095E/g, 'फ').replace(/\u0921\u093C|\u0922\u093C/g, 'र');
    let out = '';
    for (const ch of s) if (M[ch]) out += M[ch];
    return collapse(out);
  }
  const skel = (s) => (isBangla(s) ? bnSkel(s) : isDev(s) ? mapSkel(s, DEV_MAP) : isAr(s) ? mapSkel(s, AR_MAP) : enSkel(s));

  function lev(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[a.length][b.length];
  }
  function sim(a, b) {
    if (!a || !b) return 0;
    if (a === b) return a.length >= 2 ? 1 : 0.8;
    if (Math.min(a.length, b.length) < 2) return 0;
    return 1 - lev(a, b) / Math.max(a.length, b.length);
  }

  const STOP = new Set([
    'টাকা', 'দিলাম', 'পেলাম', 'দিয়েছি', 'পেয়েছি', 'দিছি', 'পাইছি', 'বাকি', 'আজ', 'আজকে',
    'কে', 'থেকে', 'জন্য', 'বাবদ', 'ও', 'এবং', 'আমি', 'ভাই', 'আপা', 'আপু',
    'to', 'from', 'taka', 'tk', 'rs', 'rupees', 'rupee', 'inr', 'bdt', 'for', 'the', 'a', 'i', 'of', 'and', 'my', 'me',
    'को', 'से', 'रुपये', 'रुपए', 'रूपये', 'रुपया', 'ने', 'کو', 'سے', 'روپے', 'روپیہ', 'نے', 'میں'
  ].map(N));
  const SUFFIXES = ['দেরকে', 'কে', 'এর', 'ের', 'র', 'রে', 'ে'].map(N);

  function nameCandidates(token) {
    const out = [token];
    SUFFIXES.forEach((suf) => {
      if (token.endsWith(suf) && token.length > suf.length + 1) out.push(token.slice(0, -suf.length));
    });
    return out;
  }

  function findCustomer(text, customers) {
    const tokens = N(text).replace(/[।,.?!]/g, ' ').split(/\s+/)
      .filter((t) => t.length > 1 && !/\d/.test(toEnDigits(t)) && !STOP.has(t.toLowerCase()) && wordsToNumber(t) === null);

    const ranked = customers.map((c) => {
      const nameToks = String(c.name || '').split(/\s+/).filter(Boolean);
      let best = 0, matched = 0;
      nameToks.forEach((nt) => {
        const ns = skel(nt);
        let tokBest = 0;
        tokens.forEach((tok) => {
          nameCandidates(tok).forEach((cand) => {
            tokBest = Math.max(tokBest, sim(skel(cand), ns));
          });
        });
        if (tokBest >= 0.75) matched++;
        best = Math.max(best, tokBest);
      });
      return { customer: c, score: best + (matched > 1 ? 0.05 * (matched - 1) : 0) };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

    const top = ranked[0];
    return {
      customer: top && top.score >= 0.7 ? top.customer : null,
      score: top ? top.score : 0,
      ranked: ranked
    };
  }

  // কথা থেকে সম্ভাব্য গ্রাহকের নাম বের করা (নতুন গ্রাহকের জন্য)
  const NAME_BREAK = new Set(['কাছ', 'কাছে', 'থেকে', 'জন্য', 'বাবদ', 'টাকা'].map(N));
  const SAFE_SUFFIXES = ['দেরকে', 'কে', 'এর', 'ের'].map(N);
  const ALL_VERBS = GAVE.concat(GOT);

  function extractName(text) {
    const toks = N(text).replace(/[।,.?!]/g, ' ').split(/\s+/).filter(Boolean);
    const isNum = (t) => /\d/.test(toEnDigits(t)) || wordsToNumber(t) !== null;
    let out = [];
    for (const t of toks) {                       // ১ম চেষ্টা: সংখ্যার আগের শব্দ
      if (isNum(t) || ALL_VERBS.indexOf(t.toLowerCase()) >= 0) break;
      if (STOP.has(t.toLowerCase()) && !NAME_BREAK.has(t)) continue;
      if (NAME_BREAK.has(t)) { if (out.length) break; else continue; }
      out.push(t);
    }
    if (!out.length) {                            // ২য় চেষ্টা: "৫০০ টাকা রহিমকে দিলাম"
      out = toks.filter((t) => !isNum(t) && !STOP.has(t.toLowerCase()) && !NAME_BREAK.has(t) && ALL_VERBS.indexOf(t.toLowerCase()) < 0);
    }
    if (!out.length) return '';
    let last = out[out.length - 1];
    for (const suf of SAFE_SUFFIXES) {
      if (last.endsWith(suf) && last.length > suf.length + 1) { last = last.slice(0, -suf.length); break; }
    }
    out[out.length - 1] = last;
    return out.slice(-3).join(' ').trim();
  }

  function parseTranscript(text, customers) {
    const t = N(text || '');
    const found = findCustomer(t, customers || []);
    const near = !found.customer && found.ranked[0] && found.ranked[0].score >= 0.6 ? found.ranked[0].customer : null;
    return {
      text: t,
      amount: parseAmount(t),
      type: detectType(t),
      customer: found.customer,
      nearCustomer: near,
      name: extractName(t),
      score: found.score
    };
  }

  /* ================================================================
     ৩) UI — ভাসমান মাইক বাটন + নিচ থেকে ওঠা শিট
     ================================================================ */
  const css = `
  #ve-fab{position:fixed;right:16px;bottom:calc(88px + env(safe-area-inset-bottom,0px));width:56px;height:56px;border-radius:50%;border:0;background:${CONFIG.colorAccent};color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;z-index:9998;padding:0}
  body:not(.ve-show) #ve-fab{display:none!important}
  @media (max-width:600px){
    /* হোম পেজে: "নতুন লেনদেন" বাটনের পাশে একই সারিতে মাইক */
    body.ve-on-home #ve-fab{right:20px;bottom:calc(78px + env(safe-area-inset-bottom,0px));width:54px;height:54px;border-radius:14px;z-index:9999;box-shadow:0 5px 18px rgba(0,0,0,.15)}
    body.ve-on-home .home-new-transaction{right:84px!important}
    /* অন্য পেজে: নেভিগেশনের একটু উপরে ছোট গোল বাটন */
    body:not(.ve-on-home) #ve-fab{right:14px;bottom:calc(80px + env(safe-area-inset-bottom,0px));width:52px;height:52px}
  }
  #ve-fab:active{transform:scale(.95)}
  #ve-fab:focus-visible,.ve-btn:focus-visible,#ve-sheet input:focus-visible,#ve-sheet select:focus-visible{outline:3px solid #7aa7ff;outline-offset:2px}
  #ve-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-end;justify-content:center}
  #ve-overlay[hidden],#ve-sheet [hidden]{display:none!important}
  #ve-sheet{width:100%;max-width:480px;max-height:92vh;overflow:auto;background:#fff;color:#1b1b1b;border-radius:20px 20px 0 0;padding:14px 18px calc(20px + env(safe-area-inset-bottom,0px));font-family:inherit;box-sizing:border-box}
  #ve-sheet *{box-sizing:border-box;font-family:inherit}
  .ve-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .ve-head b{font-size:17px}
  .ve-x{border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#555;padding:4px 8px}
  #ve-listen{text-align:center;padding:18px 0 8px;cursor:pointer}
  .ve-ring{width:84px;height:84px;margin:6px auto 26px;border-radius:50%;background:${CONFIG.colorAccent};color:#fff;display:flex;align-items:center;justify-content:center;position:relative}
  .ve-ring.on::after{content:"";position:absolute;inset:0;border-radius:50%;border:3px solid ${CONFIG.colorAccent};animation:ve-pulse 1.3s ease-out infinite}
  @keyframes ve-pulse{from{transform:scale(1);opacity:.7}to{transform:scale(1.7);opacity:0}}
  @media (prefers-reduced-motion:reduce){.ve-ring.on::after{animation:none}}
  #ve-status{font-size:18px;font-weight:600;min-height:28px}
  #ve-live{font-size:16px;color:#444;margin-top:8px;min-height:24px}
  .ve-hint{font-size:13px;color:#777;margin-top:10px}
  #ve-sheet label{display:block;font-size:13px;color:#666;margin:12px 0 4px}
  #ve-sheet input,#ve-sheet select{width:100%;padding:11px 12px;border:1.5px solid #d5d5d5;border-radius:10px;font-size:16px;background:#fff;color:#1b1b1b}
  #ve-summary{margin-top:12px;padding:10px 12px;border-radius:10px;background:#f4f6f5;font-size:15px;font-weight:600}
  .ve-types{display:flex;gap:8px;margin-top:12px}
  .ve-type{flex:1;padding:11px;border-radius:10px;border:1.5px solid #d5d5d5;background:#fff;font-size:16px;font-weight:600;cursor:pointer;color:#444}
  .ve-type.gave.on{background:${CONFIG.colorGave};border-color:${CONFIG.colorGave};color:#fff}
  .ve-type.got.on{background:${CONFIG.colorGot};border-color:${CONFIG.colorGot};color:#fff}
  .ve-actions{display:flex;gap:8px;margin-top:16px;position:sticky;bottom:calc(-20px - env(safe-area-inset-bottom,0px));padding:10px 0 calc(20px + env(safe-area-inset-bottom,0px));background:#fff}
  .ve-btn{flex:1;padding:13px;border-radius:12px;border:1.5px solid ${CONFIG.colorAccent};background:#fff;color:${CONFIG.colorAccent};font-size:16px;font-weight:700;cursor:pointer}
  .ve-btn.primary{background:${CONFIG.colorAccent};color:#fff}
  .ve-btn:disabled{opacity:.6;cursor:default}
  #ve-info{margin-top:10px;font-size:14px;color:#0b6b43;line-height:1.45}
  #ve-info:empty{display:none}
  #ve-error{margin-top:10px;font-size:14px;color:#c62828;min-height:18px}
  #ve-toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#222;color:#fff;padding:10px 16px;border-radius:999px;font-size:15px;z-index:10000}
  @media all{
    html[data-theme="dark"] #ve-sheet{background:#1e1f21;color:#eee}
    html[data-theme="dark"] #ve-sheet input,html[data-theme="dark"] #ve-sheet select{background:#2a2b2e;color:#eee;border-color:#444}
    html[data-theme="dark"] #ve-summary{background:#2a2b2e}
    html[data-theme="dark"] .ve-actions{background:#1e1f21}
    html[data-theme="dark"] .ve-type,html[data-theme="dark"] .ve-btn{background:#2a2b2e;color:#ddd}
    html[data-theme="dark"] .ve-btn.primary{background:${CONFIG.colorAccent};color:#fff}
    html[data-theme="dark"] #ve-live{color:#bbb}
    html[data-theme="dark"] .ve-hint,html[data-theme="dark"] #ve-sheet label{color:#999}
  }`;

  const MIC_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';

  const NEW = '__new__';
  const state = { customers: [], type: null, listening: false, rec: null, finalText: '', gotError: false };
  const $ = (id) => document.getElementById(id);
  let fab, overlay;

  function build() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    fab = document.createElement('button');
    fab.id = 've-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'ভয়েস দিয়ে লেনদেন যোগ করুন');
    fab.innerHTML = MIC_SVG;
    fab.addEventListener('click', openSheet);
    document.body.appendChild(fab);

    overlay = document.createElement('div');
    overlay.id = 've-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div id="ve-sheet" role="dialog" aria-modal="true" aria-label="ভয়েস এন্ট্রি">' +
        '<div class="ve-head"><b>ভয়েস এন্ট্রি</b><button class="ve-x" type="button" id="ve-close" aria-label="বন্ধ করুন">×</button></div>' +
        '<div id="ve-listen">' +
          '<div class="ve-ring" id="ve-ring">' + MIC_SVG + '</div>' +
          '<div id="ve-status">বলুন…</div>' +
          '<div id="ve-live"></div>' +
          '<div class="ve-hint">যেমন: “রহিমকে ৫০০ টাকা দিলাম”</div>' +
          '<button type="button" class="ve-btn primary" id="ve-done" style="margin-top:18px;width:100%;flex:none">বলা শেষ</button>' +
        '</div>' +
        '<div id="ve-confirm" hidden>' +
          '<label for="ve-text">আপনি বলেছেন (ভুল হলে ঠিক করুন)</label>' +
          '<input id="ve-text" type="text" autocomplete="off">' +
          '<div id="ve-summary"></div>' +
          '<label for="ve-cust">গ্রাহক নির্বাচন</label>' +
          '<select id="ve-cust"></select>' +
          '<div id="ve-newwrap" hidden>' +
            '<label for="ve-newname">নতুন গ্রাহকের নাম</label>' +
            '<input id="ve-newname" type="text" autocomplete="off">' +
          '</div>' +
          '<div id="ve-info"></div>' +
          '<div class="ve-types">' +
            '<button type="button" class="ve-type gave" data-type="gave">দিলাম</button>' +
            '<button type="button" class="ve-type got" data-type="got">পেলাম</button>' +
          '</div>' +
          '<label for="ve-amount">পরিমাণ (৳)</label>' +
          '<input id="ve-amount" type="number" inputmode="numeric" min="1" step="1">' +
          '<label for="ve-note">নোট (ঐচ্ছিক)</label>' +
          '<input id="ve-note" type="text" autocomplete="off">' +
          '<div id="ve-error" role="alert"></div>' +
          '<div class="ve-actions">' +
            '<button type="button" class="ve-btn" id="ve-retry">আবার বলুন</button>' +
            '<button type="button" class="ve-btn primary" id="ve-save">সংরক্ষণ করুন</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    $('ve-close').addEventListener('click', closeSheet);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
    $('ve-listen').addEventListener('click', (e) => { if (e.target.id !== 've-done' && state.listening) stopListening(); });
    $('ve-done').addEventListener('click', () => { if (state.listening) stopListening(); });
    $('ve-retry').addEventListener('click', startListening);
    $('ve-save').addEventListener('click', save);
    $('ve-text').addEventListener('change', (e) => processText(e.target.value));
    $('ve-cust').addEventListener('change', () => { syncNewWrap(); updateSummary(); });
    $('ve-newname').addEventListener('input', updateSummary);
    $('ve-amount').addEventListener('input', updateSummary);
    overlay.querySelectorAll('.ve-type').forEach((b) =>
      b.addEventListener('click', () => { setType(b.dataset.type); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeSheet(); });

    // কোন পেজে আছি দেখে মাইক বাটন দেখানো/লুকানো
    const visible = (id) => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); };
    const syncFab = () => {
      const onHome = visible('homePage');
      const show = CONFIG.isLoggedIn() && (onHome || visible('customerPage') || visible('historyPage'));
      document.body.classList.toggle('ve-show', !!show && overlay.hidden);
      document.body.classList.toggle('ve-on-home', onHome);
    };
    syncFab();
    setInterval(syncFab, 400);
  }

  async function openSheet() {
    overlay.hidden = false;
    $('ve-error').textContent = '';
    try {
      state.customers = (await CONFIG.getCustomers()) || [];
    } catch (err) {
      console.error('[VoiceEntry]', err);
      state.customers = [];
      showConfirm(parseTranscript('', []), 'গ্রাহকের তালিকা পাওয়া যায়নি: ' + err.message);
      return;
    }
    startListening();
  }

  function closeSheet() {
    stopListening(true);
    overlay.hidden = true;
  }

  function showListening() {
    $('ve-listen').hidden = false;
    $('ve-confirm').hidden = true;
    $('ve-live').textContent = '';
    $('ve-status').textContent = 'শুনছি… বলুন';
    $('ve-ring').classList.add('on');
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showConfirm(parseTranscript('', state.customers),
        'এই ব্রাউজারে ভয়েস চলে না। Chrome ব্যবহার করুন, অথবা উপরের ঘরে লিখে দিন।');
      return;
    }
    showListening();
    state.finalText = '';
    state.gotError = false;
    const rec = new SR();
    state.rec = rec;
    rec.lang = (window.MM_I18N && MM_I18N.speechLang()) || CONFIG.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + ' ';
      state.finalText = txt.trim();
      $('ve-live').textContent = state.finalText;
    };
    rec.onerror = (e) => {
      state.gotError = true;
      const msg = {
        'not-allowed': 'মাইক্রোফোনের অনুমতি দিন (ব্রাউজার সেটিংস → সাইট → মাইক্রোফোন)।',
        'service-not-allowed': 'মাইক্রোফোনের অনুমতি দিন।',
        'no-speech': 'কিছু শোনা যায়নি। আবার বলুন।',
        'network': 'ভয়েস চিনতে ইন্টারনেট লাগে। কানেকশন দেখুন।',
        'audio-capture': 'মাইক্রোফোন পাওয়া যায়নি।'
      }[e.error] || ('ভয়েস ত্রুটি: ' + e.error);
      showConfirm(parseTranscript('', state.customers), msg);
    };
    rec.onend = () => {
      state.listening = false;
      $('ve-ring').classList.remove('on');
      if (state.gotError || overlay.hidden) return;
      if (state.finalText) processText(state.finalText);
      else showConfirm(parseTranscript('', state.customers), 'কিছু শোনা যায়নি। আবার বলুন।');
    };
    try {
      rec.start();
      state.listening = true;
    } catch (err) {
      console.error('[VoiceEntry]', err);
    }
  }

  function stopListening(silent) {
    if (state.rec) {
      if (silent) { state.rec.onend = null; state.rec.onerror = null; }
      try { state.rec.stop(); } catch (e) { /* ignore */ }
    }
    state.listening = false;
  }

  function processText(text) {
    showConfirm(parseTranscript(text, state.customers), '');
  }

  function showConfirm(p, errorMsg) {
    $('ve-listen').hidden = true;
    $('ve-confirm').hidden = false;
    $('ve-text').value = p.text || '';
    $('ve-note').value = p.text ? '🎙 ' + p.text : '';
    $('ve-amount').value = p.amount || '';

    const sel = $('ve-cust');
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'গ্রাহক নির্বাচন করুন';
    sel.appendChild(ph);
    state.customers.forEach((c) => {
      const o = document.createElement('option');
      o.value = String(c.id);
      o.textContent = c.name;
      sel.appendChild(o);
    });
    const nw = document.createElement('option');
    nw.value = NEW;
    nw.textContent = '＋ নতুন গ্রাহক যোগ করুন';
    sel.appendChild(nw);

    $('ve-newname').value = '';
    let info = '';
    if (p.customer) {
      sel.value = String(p.customer.id);
    } else if (p.name) {
      sel.value = NEW;
      $('ve-newname').value = p.name;
      info = '“' + p.name + '” নামে কোনো গ্রাহক নেই। সংরক্ষণ করলে নতুন গ্রাহক হিসেবে যোগ হবে।' +
        (p.nearCustomer ? ' কাছাকাছি নাম আছে: ' + p.nearCustomer.name + ' — সেটা হলে উপরের তালিকা থেকে বেছে নিন।' : '');
    }
    $('ve-info').textContent = info;
    syncNewWrap();

    setType(p.type);

    let err = errorMsg || '';
    if (!err && p.text) {
      const missing = [];
      if (!p.customer && !p.name) missing.push('গ্রাহক');
      if (!p.amount) missing.push('পরিমাণ');
      if (!p.type) missing.push('দিলাম/পেলাম');
      if (missing.length) err = 'বোঝা যায়নি: ' + missing.join(', ') + '। নিচে ঠিক করে নিন।';
    }
    $('ve-error').textContent = err;
  }

  function syncNewWrap() {
    $('ve-newwrap').hidden = $('ve-cust').value !== NEW;
  }

  function setType(t) {
    state.type = t || null;
    overlay.querySelectorAll('.ve-type').forEach((b) =>
      b.classList.toggle('on', b.dataset.type === state.type));
    updateSummary();
  }

  function updateSummary() {
    const sel = $('ve-cust');
    let name = sel.value ? sel.options[sel.selectedIndex].textContent : '';
    if (sel.value === NEW) name = ($('ve-newname').value.trim() ? 'নতুন: ' + $('ve-newname').value.trim() : '');
    const amt = parseInt($('ve-amount').value, 10);
    const typeLabel = state.type === 'gave' ? 'দিলাম' : state.type === 'got' ? 'পেলাম' : '';
    const parts = [
      name || '— গ্রাহক?',
      amt > 0 ? '৳ ' + toBnDigits(amt.toLocaleString('en-US')) : '— পরিমাণ?',
      typeLabel || '— দিলাম/পেলাম?'
    ];
    $('ve-summary').textContent = parts.join('  |  ');
  }

  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  async function save() {
    let customerId = $('ve-cust').value;
    const newName = $('ve-newname').value.trim();
    const amount = parseInt($('ve-amount').value, 10);
    const err = $('ve-error');
    if (!customerId) { err.textContent = 'গ্রাহক নির্বাচন করুন।'; return; }
    if (customerId === NEW && !newName) { err.textContent = 'নতুন গ্রাহকের নাম লিখুন।'; return; }
    if (!state.type) { err.textContent = 'দিলাম নাকি পেলাম, বেছে নিন।'; return; }
    if (!(amount > 0)) { err.textContent = 'সঠিক পরিমাণ লিখুন।'; return; }

    const tx = {
      customerId: customerId, // নতুন গ্রাহক হলে তৈরির পর আসল id বসবে
      type: state.type,
      amount: amount,
      note: $('ve-note').value.trim(),
      date: today()
    };
    const btn = $('ve-save');
    btn.disabled = true;
    btn.textContent = 'সংরক্ষণ হচ্ছে…';
    try {
      if (customerId === NEW) {
        const created = await CONFIG.createCustomer(newName);
        tx.customerId = created.id;
      }
      await CONFIG.addTransaction(tx);
      try { CONFIG.onSaved(tx); } catch (e) { console.error(e); }
      closeSheet();
    } catch (e) {
      console.error('[VoiceEntry]', e);
      err.textContent = 'সংরক্ষণ হয়নি: ' + (e && e.message ? e.message : 'আবার চেষ্টা করুন');
    } finally {
      btn.disabled = false;
      btn.textContent = 'সংরক্ষণ করুন';
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.id = 've-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ================================================================
     ৪) চালু করা + কনসোলে টেস্ট করার সুবিধা
     ================================================================ */
  window.VoiceEntry = {
    config: CONFIG,
    open: openSheet,
    // কনসোলে টেস্ট: VoiceEntry.parse('রহিমকে ৫০০ টাকা দিলাম', [{id:1,name:'Rahim'}])
    parse: parseTranscript
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
