// ==================================================
// লেনদেন এর হিসাব  (Profile → লেনদেন এর হিসাব)
// দৈনিক / মাসিক / বার্ষিক রিপোর্ট + PDF ডাউনলোড
//
// ডেটা-নিয়ম (অ্যাপের বাকি অংশের মতোই):
//   type === "receive"  →  দিয়েছি  (আপনি টাকা দিয়েছেন)
//   type === "pay"      →  পেয়েছি  (আপনি টাকা পেয়েছেন)
//   ব্যালেন্স = পেয়েছি − দিয়েছি
// ==================================================

const BN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];
const BN_MONTHS_SHORT = ["জানু","ফেব্রু","মার্চ","এপ্রি","মে","জুন","জুলাই","আগ","সেপ্টে","অক্টো","নভে","ডিসে"];
const BN_WEEKDAYS = ["রবি","সোম","মঙ্গল","বুধ","বৃহ","শুক্র","শনি"];

let reportMode = "monthly";           // daily | monthly | yearly
let reportAnchor = new Date();        // যে মাস/বছর/সপ্তাহ দেখছি
let reportSelectedDay = localDateString(); // দৈনিক ট্যাবে বেছে নেওয়া দিন
let reportSheetRange = "this";        // this | last | custom

// ---------- ছোট helper ----------
function toBn(value){
  return String(value).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
}
function keyToDate(key){
  const p = String(key).split("-").map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}
function monthRange(year, month){ // month: 0-11
  return [localDateString(new Date(year, month, 1)), localDateString(new Date(year, month + 1, 0))];
}
function fmtLongDate(key){
  const d = keyToDate(key);
  return toBn(d.getDate()) + " " + BN_MONTHS[d.getMonth()] + " " + toBn(d.getFullYear());
}
function rpMoney(n){ return "৳ " + formatMoney(n); }

function reportTransactions(fromKey, toKey){
  const rows = (Array.isArray(transactions) ? transactions : []).filter(t => {
    const d = String(t.transaction_date || "");
    return d >= fromKey && d <= toKey;
  });
  rows.sort((a, b) => {
    const c = String(b.transaction_date || "").localeCompare(String(a.transaction_date || ""));
    if(c !== 0) return c;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
  return rows;
}
function reportTotals(rows){
  let gave = 0, got = 0;
  rows.forEach(t => {
    const a = Number(t.amount || 0);
    if(t.type === "receive") gave += a; else got += a;
  });
  return { gave, got, balance: got - gave };
}

// ---------- পেজ ও bottom-sheet তৈরি (একবারই) ----------
function ensureReportPage(){
  if(document.getElementById("reportPage")) return;
  const nav = document.querySelector(".bottom-nav");
  if(!nav) return;

  const page = document.createElement("section");
  page.id = "reportPage";
  page.className = "report-page hidden";
  page.innerHTML = `
    <header class="report-header">
      <button type="button" class="report-back" onclick="closeReportPage()" aria-label="ফিরে যান">‹</button>
      <h2>লেনদেন এর হিসাব</h2>
      <button type="button" class="report-pdf-btn" onclick="openReportSheet()">
        <svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>
        <span>PDF</span>
      </button>
    </header>
    <div class="report-body">
      <div class="report-tabs" role="tablist">
        <button type="button" data-mode="daily"   onclick="setReportMode('daily')">দৈনিক</button>
        <button type="button" data-mode="monthly" onclick="setReportMode('monthly')">মাসিক</button>
        <button type="button" data-mode="yearly"  onclick="setReportMode('yearly')">বার্ষিক</button>
      </div>
      <div class="report-period">
        <button type="button" onclick="shiftReportPeriod(-1)" aria-label="আগে">‹</button>
        <strong id="reportPeriodLabel"></strong>
        <button type="button" onclick="shiftReportPeriod(1)" aria-label="পরে">›</button>
      </div>
      <div id="reportWeekStrip" class="report-week hidden"></div>
      <div class="report-summary">
        <div class="report-card give"><span>দিয়েছি</span><strong id="reportGave">৳ 0</strong></div>
        <div class="report-card got"><span>পেয়েছি</span><strong id="reportGot">৳ 0</strong></div>
        <div class="report-card bal"><span>ব্যালেন্স</span><strong id="reportBalance">৳ 0</strong></div>
      </div>
      <div id="reportChartBox" class="report-chart-box">
        <h3>দেওয়া ও পাওয়ার তুলনা</h3>
        <div id="reportChart" class="report-chart"></div>
      </div>
      <div class="report-list-box">
        <h3>লেনদেনের তালিকা</h3>
        <div id="reportList"></div>
      </div>
    </div>`;
  nav.before(page);

  const sheet = document.createElement("div");
  sheet.id = "reportSheet";
  sheet.className = "report-sheet-overlay hidden";
  sheet.innerHTML = `
    <div class="report-sheet" role="dialog" aria-modal="true" aria-labelledby="reportSheetTitle">
      <div class="report-sheet-handle"></div>
      <h3 id="reportSheetTitle">রিপোর্ট ডাউনলোড</h3>
      <p class="report-sheet-sub">কোন সময়ের হিসাব নামাতে চান?</p>
      <div class="report-chips">
        <button type="button" data-range="this"   onclick="setReportSheetRange('this')">এই মাস</button>
        <button type="button" data-range="last"   onclick="setReportSheetRange('last')">গত মাস</button>
        <button type="button" data-range="custom" onclick="setReportSheetRange('custom')">কাস্টম তারিখ</button>
      </div>
      <div id="reportCustomDates" class="report-custom hidden">
        <label>শুরু <input type="date" id="reportFrom"></label>
        <label>শেষ <input type="date" id="reportTo"></label>
      </div>
      <p id="reportSheetRangeText" class="report-range-text"></p>
      <p class="report-sheet-sub strong">রিপোর্টে যা থাকবে</p>
      <label class="report-check"><input type="checkbox" id="reportOptSummary" checked> সামারি (দিয়েছি / পেয়েছি / ব্যালেন্স)</label>
      <label class="report-check"><input type="checkbox" id="reportOptList" checked> লেনদেনের পূর্ণ তালিকা</label>
      <label class="report-check"><input type="checkbox" id="reportOptCustomers"> গ্রাহক অনুযায়ী হিসাব</label>
      <div id="reportSheetMsg" class="report-sheet-msg hidden"></div>
      <button type="button" class="report-download-btn" onclick="downloadReportPdf()">PDF ডাউনলোড করুন</button>
      <button type="button" class="report-cancel-btn" onclick="closeReportSheet()">বাতিল</button>
    </div>`;
  sheet.addEventListener("click", e => { if(e.target === sheet) closeReportSheet(); });
  document.getElementById("app").appendChild(sheet);

  const from = document.getElementById("reportFrom");
  const to = document.getElementById("reportTo");
  [from, to].forEach(el => el.addEventListener("change", updateReportSheetRangeText));
}

// ---------- পেজ খোলা / বন্ধ ----------
function hideReportPage(){
  document.getElementById("reportPage")?.classList.add("hidden");
  document.getElementById("reportSheet")?.classList.add("hidden");
}

function openReportPage(){
  ensureReportPage();
  document.getElementById("app")?.classList.add("inner-page");
  ["homePage","customerPage","addPage","profilePage","historyPage","myProfilePage","myProfileHeader"]
    .forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById("myProfileHeader")?.style.setProperty("display", "none", "important");
  document.getElementById("reportPage")?.classList.remove("hidden");
  const nav = document.querySelector(".bottom-nav");
  if(nav) nav.style.display = "grid";
  if(typeof setActiveBottomNav === "function") setActiveBottomNav("navProfile");
  currentCustomer = null;

  reportAnchor = new Date();
  reportSelectedDay = localDateString();
  renderReport();
  window.scrollTo(0, 0);
}

function closeReportPage(){
  hideReportPage();
  openMyProfile();
}

// ---------- ট্যাব / আগে-পরে ----------
function setReportMode(mode){
  reportMode = mode;
  if(mode === "daily") reportAnchor = keyToDate(reportSelectedDay);
  renderReport();
}

function shiftReportPeriod(step){
  const d = new Date(reportAnchor);
  if(reportMode === "daily"){
    d.setDate(d.getDate() + 7 * step);       // এক সপ্তাহ করে সরবে
    reportAnchor = d;
    reportSelectedDay = localDateString(d);  // নতুন সপ্তাহের একই বার বেছে নেয়
  }else if(reportMode === "monthly"){
    reportAnchor = new Date(d.getFullYear(), d.getMonth() + step, 1);
  }else{
    reportAnchor = new Date(d.getFullYear() + step, 0, 1);
  }
  renderReport();
}

function selectReportDay(key){
  reportSelectedDay = key;
  reportAnchor = keyToDate(key);
  renderReport();
}

// ---------- রেন্ডার ----------
function reportCurrentRange(){
  const y = reportAnchor.getFullYear(), m = reportAnchor.getMonth();
  if(reportMode === "daily") return [reportSelectedDay, reportSelectedDay];
  if(reportMode === "monthly") return monthRange(y, m);
  return [localDateString(new Date(y, 0, 1)), localDateString(new Date(y, 11, 31))];
}

function renderReport(){
  if(!document.getElementById("reportPage")) return;

  document.querySelectorAll("#reportPage .report-tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === reportMode));

  const [from, to] = reportCurrentRange();
  const rows = reportTransactions(from, to);
  const tot = reportTotals(rows);

  // শিরোনাম
  const label = document.getElementById("reportPeriodLabel");
  if(reportMode === "yearly") label.textContent = toBn(reportAnchor.getFullYear());
  else label.textContent = BN_MONTHS[reportAnchor.getMonth()] + " " + toBn(reportAnchor.getFullYear());

  // সামারি
  document.getElementById("reportGave").textContent = rpMoney(tot.gave);
  document.getElementById("reportGot").textContent = rpMoney(tot.got);
  const balEl = document.getElementById("reportBalance");
  balEl.textContent = (tot.balance < 0 ? "- " : "") + rpMoney(Math.abs(tot.balance));
  balEl.className = tot.balance > 0 ? "pos" : tot.balance < 0 ? "neg" : "";

  renderReportWeekStrip();
  renderReportChart();
  renderReportList(rows);
}

function renderReportWeekStrip(){
  const strip = document.getElementById("reportWeekStrip");
  if(reportMode !== "daily"){ strip.classList.add("hidden"); return; }
  strip.classList.remove("hidden");

  const start = new Date(reportAnchor);
  start.setDate(start.getDate() - start.getDay()); // রবিবার থেকে শুরু
  const today = localDateString();
  let html = "";
  for(let i = 0; i < 7; i++){
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = localDateString(d);
    const cls = (key === reportSelectedDay ? " active" : "") + (key === today ? " today" : "");
    html += `<button type="button" class="${cls.trim()}" onclick="selectReportDay('${key}')">
      <small>${BN_WEEKDAYS[i]}</small><b>${toBn(d.getDate())}</b></button>`;
  }
  strip.innerHTML = html;
}

function renderReportChart(){
  const box = document.getElementById("reportChartBox");
  if(reportMode === "daily"){ box.classList.add("hidden"); return; }
  box.classList.remove("hidden");

  const y = reportAnchor.getFullYear(), m = reportAnchor.getMonth();
  let groups = []; // {label, gave, got}

  if(reportMode === "monthly"){
    const days = new Date(y, m + 1, 0).getDate();
    const names = ["১ম সপ্তাহ","২য়","৩য়","৪র্থ","৫ম"];
    const count = days > 28 ? 5 : 4;
    for(let i = 0; i < count; i++) groups.push({label: names[i], gave: 0, got: 0});
    reportTransactions(...monthRange(y, m)).forEach(t => {
      const day = Number(String(t.transaction_date).slice(8, 10));
      const idx = Math.min(Math.floor((day - 1) / 7), count - 1);
      const a = Number(t.amount || 0);
      if(t.type === "receive") groups[idx].gave += a; else groups[idx].got += a;
    });
  }else{
    for(let i = 0; i < 12; i++) groups.push({label: BN_MONTHS_SHORT[i], gave: 0, got: 0});
    reportTransactions(y + "-01-01", y + "-12-31").forEach(t => {
      const idx = Number(String(t.transaction_date).slice(5, 7)) - 1;
      const a = Number(t.amount || 0);
      if(idx >= 0 && idx < 12){ if(t.type === "receive") groups[idx].gave += a; else groups[idx].got += a; }
    });
  }

  const max = Math.max(1, ...groups.map(g => Math.max(g.gave, g.got)));
  const compact = reportMode === "yearly" ? " compact" : "";
  document.getElementById("reportChart").innerHTML = groups.map(g => `
    <div class="report-bar-group${compact}">
      <div class="report-bars">
        <i class="bar give" style="height:${(g.gave / max * 100).toFixed(1)}%" title="দিয়েছি ${escapeHTML(rpMoney(g.gave))}"></i>
        <i class="bar got" style="height:${(g.got / max * 100).toFixed(1)}%" title="পেয়েছি ${escapeHTML(rpMoney(g.got))}"></i>
      </div>
      <span>${escapeHTML(g.label)}</span>
    </div>`).join("");
}

function reportDayLabel(t){
  const key = String(t.transaction_date || "");
  const today = localDateString();
  const y = new Date(); y.setDate(y.getDate() - 1);
  let day;
  if(key === today) day = "আজ";
  else if(key === localDateString(y)) day = "গতকাল";
  else{
    const d = keyToDate(key);
    day = toBn(String(d.getDate()).padStart(2, "0")) + " " + BN_MONTHS_SHORT[d.getMonth()];
  }
  const c = t.created_at ? new Date(t.created_at) : null;
  if(c && !Number.isNaN(c.getTime())){
    const hh = String(c.getHours()).padStart(2, "0"), mm = String(c.getMinutes()).padStart(2, "0");
    day += ", " + toBn(hh + ":" + mm);
  }
  return day;
}

function renderReportList(rows){
  const list = document.getElementById("reportList");
  if(!rows.length){
    list.innerHTML = `<div class="report-empty">এই সময়ে কোনো লেনদেন নেই।</div>`;
    return;
  }
  list.innerHTML = rows.map(t => {
    const gave = t.type === "receive";
    const name = String(t.customer_name || "অজানা");
    return `
    <div class="report-row">
      <div class="report-avatar ${gave ? "give" : "got"}">${escapeHTML(name.trim().charAt(0).toUpperCase() || "?")}</div>
      <div class="report-row-main">
        <b>${escapeHTML(name)}</b>
        <small>${escapeHTML(reportDayLabel(t))}${t.note ? " · " + escapeHTML(t.note) : ""}</small>
      </div>
      <div class="report-row-amt ${gave ? "give" : "got"}">${gave ? "-" : "+"} ${escapeHTML(rpMoney(Number(t.amount || 0)))}</div>
    </div>`;
  }).join("");
}

// ---------- PDF bottom-sheet ----------
function openReportSheet(){
  ensureReportPage();
  const [from, to] = reportCurrentRange();
  document.getElementById("reportFrom").value = from;
  document.getElementById("reportTo").value = to;
  setReportSheetRange("this");
  document.getElementById("reportSheetMsg").classList.add("hidden");
  document.getElementById("reportSheet").classList.remove("hidden");
}
function closeReportSheet(){
  document.getElementById("reportSheet")?.classList.add("hidden");
}

function reportSheetDates(){
  const now = new Date();
  if(reportSheetRange === "this") return monthRange(now.getFullYear(), now.getMonth());
  if(reportSheetRange === "last") return monthRange(now.getFullYear(), now.getMonth() - 1);
  return [document.getElementById("reportFrom").value, document.getElementById("reportTo").value];
}

function setReportSheetRange(range){
  reportSheetRange = range;
  document.querySelectorAll("#reportSheet .report-chips button").forEach(b =>
    b.classList.toggle("active", b.dataset.range === range));
  document.getElementById("reportCustomDates").classList.toggle("hidden", range !== "custom");
  updateReportSheetRangeText();
}

function updateReportSheetRangeText(){
  const [from, to] = reportSheetDates();
  const el = document.getElementById("reportSheetRangeText");
  const sameYear = from && to && from.slice(0, 4) === to.slice(0, 4);
  el.textContent = (from && to) ? "📅 " + (sameYear ? fmtLongDate(from).replace(/ \S+$/, "") : fmtLongDate(from)) + " – " + fmtLongDate(to) : "";
}

function reportSheetError(msg){
  const el = document.getElementById("reportSheetMsg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ---------- PDF তৈরি ----------
// ব্রাউজারের নিজস্ব Print → "Save as PDF" ব্যবহার করা হয়েছে। এতে বাংলা ফন্ট/যুক্তাক্ষর
// একদম ঠিক আসে এবং কোনো বাড়তি লাইব্রেরি লাগে না।
function downloadReportPdf(){
  const [from, to] = reportSheetDates();
  if(!from || !to) return reportSheetError("শুরু ও শেষের তারিখ দিন।");
  if(from > to) return reportSheetError("শুরুর তারিখ শেষের তারিখের আগে হতে হবে।");

  const optSummary = document.getElementById("reportOptSummary").checked;
  const optList = document.getElementById("reportOptList").checked;
  const optCustomers = document.getElementById("reportOptCustomers").checked;
  if(!optSummary && !optList && !optCustomers) return reportSheetError("রিপোর্টে অন্তত একটি অংশ বেছে নিন।");

  const rows = reportTransactions(from, to).slice().reverse(); // পুরনো → নতুন
  const tot = reportTotals(rows);
  const user = document.getElementById("headerUserName")?.textContent.trim()
            || document.getElementById("profileScreenName")?.textContent.trim() || "";

  const sameMonth = from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && to === monthRange(+to.slice(0, 4), +to.slice(5, 7) - 1)[1];
  const kind = sameMonth ? "মাসিক রিপোর্ট" : "রিপোর্ট";
  const subLabel = sameMonth ? BN_MONTHS[+from.slice(5, 7) - 1] + " " + toBn(from.slice(0, 4)) : "";
  const balText = (tot.balance < 0 ? "- " : "") + rpMoney(Math.abs(tot.balance));

  let html = `
    <div class="rp-head">
      <div><small>MoneyMate</small><h1>লেনদেনের হিসাব</h1></div>
      <div class="rp-head-r"><span>${escapeHTML(kind)}</span><b>${escapeHTML(subLabel)}</b></div>
    </div>
    <div class="rp-meta">
      <div><small>ব্যবহারকারী</small><b>${escapeHTML(user || "—")}</b></div>
      <div><small>সময়কাল</small><b>${escapeHTML(fmtLongDate(from))} – ${escapeHTML(fmtLongDate(to))}</b></div>
      <div><small>রিপোর্ট তৈরি</small><b>${escapeHTML(fmtLongDate(localDateString()))}</b></div>
    </div>`;

  if(optSummary){
    html += `
    <h2>এক নজরে</h2>
    <div class="rp-cards">
      <div class="give"><small>মোট দিয়েছি</small><b>${escapeHTML(rpMoney(tot.gave))}</b></div>
      <div class="got"><small>মোট পেয়েছি</small><b>${escapeHTML(rpMoney(tot.got))}</b></div>
      <div class="bal"><small>ব্যালেন্স</small><b>${escapeHTML(balText)}</b></div>
    </div>
    <p class="rp-note">ব্যালেন্স = মোট পেয়েছি − মোট দিয়েছি।</p>`;
  }

  if(optList){
    html += `<h2>লেনদেনের তালিকা</h2>`;
    if(!rows.length){
      html += `<p class="rp-note">এই সময়ে কোনো লেনদেন নেই।</p>`;
    }else{
      html += `<table><thead><tr><th>তারিখ</th><th>গ্রাহক</th><th class="r">দিয়েছি</th><th class="r">পেয়েছি</th></tr></thead><tbody>` +
        rows.map(t => {
          const gave = t.type === "receive", a = rpMoney(Number(t.amount || 0));
          const d = keyToDate(t.transaction_date);
          return `<tr><td>${toBn(String(d.getDate()).padStart(2, "0"))} ${BN_MONTHS_SHORT[d.getMonth()]}</td>
            <td><b>${escapeHTML(t.customer_name || "অজানা")}</b>${t.note ? `<br><small>${escapeHTML(t.note)}</small>` : ""}</td>
            <td class="r give">${gave ? escapeHTML(a) : "–"}</td><td class="r got">${gave ? "–" : escapeHTML(a)}</td></tr>`;
        }).join("") +
        `<tr class="total"><td colspan="2">সর্বমোট</td><td class="r give">${escapeHTML(rpMoney(tot.gave))}</td><td class="r got">${escapeHTML(rpMoney(tot.got))}</td></tr></tbody></table>`;
    }
  }

  if(optCustomers){
    const map = new Map();
    rows.forEach(t => {
      const n = t.customer_name || "অজানা";
      if(!map.has(n)) map.set(n, {gave: 0, got: 0});
      const o = map.get(n), a = Number(t.amount || 0);
      if(t.type === "receive") o.gave += a; else o.got += a;
    });
    html += `<h2>গ্রাহক অনুযায়ী হিসাব</h2>`;
    if(!map.size){
      html += `<p class="rp-note">এই সময়ে কোনো লেনদেন নেই।</p>`;
    }else{
      html += `<table><thead><tr><th>গ্রাহক</th><th class="r">দিয়েছি</th><th class="r">পেয়েছি</th><th class="r">ব্যালেন্স</th></tr></thead><tbody>` +
        [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "bn")).map(([n, o]) => {
          const b = o.got - o.gave;
          return `<tr><td><b>${escapeHTML(n)}</b></td><td class="r give">${escapeHTML(rpMoney(o.gave))}</td>
            <td class="r got">${escapeHTML(rpMoney(o.got))}</td><td class="r">${b < 0 ? "- " : ""}${escapeHTML(rpMoney(Math.abs(b)))}</td></tr>`;
        }).join("") + `</tbody></table>`;
    }
  }

  html += `<div class="rp-foot"><span>MoneyMate অ্যাপ থেকে তৈরি</span></div>`;

  let box = document.getElementById("reportPrint");
  if(!box){ box = document.createElement("div"); box.id = "reportPrint"; document.body.appendChild(box); }
  box.innerHTML = html;

  closeReportSheet();

  const oldTitle = document.title;
  document.title = "MoneyMate-" + from + "-to-" + to;   // এটাই PDF ফাইলের নাম হয়
  document.body.classList.add("printing-report");
  const cleanup = () => {
    document.body.classList.remove("printing-report");
    document.title = oldTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(() => window.print(), 80);
}

// ---------- অন্য পেজ খুললে রিপোর্ট পেজ লুকানো ----------
// showHome(), showCustomers() ইত্যাদি app.js/customers.js-এ আছে। সেগুলো না ছুঁয়ে
// এখানে মুড়ে দেওয়া হলো, যাতে যেকোনো পেজে গেলে আগে রিপোর্ট পেজ বন্ধ হয়।
["showHome","showCustomers","showTransactionHistory","showAddTransaction","openMyProfile","openProfileById","showLogin"]
  .forEach(name => {
    const original = window[name];
    if(typeof original !== "function") return;
    window[name] = function(...args){
      hideReportPage();
      return original.apply(this, args);
    };
  });

// লেনদেন লোড/বদলালে খোলা রিপোর্ট নতুন করে আঁকা
setInterval(() => {
  const page = document.getElementById("reportPage");
  if(page && !page.classList.contains("hidden") && Array.isArray(transactions)){
    const sig = transactions.length + ":" + (transactions[0]?.id || "");
    if(sig !== window.__reportSig){ window.__reportSig = sig; renderReport(); }
  }
}, 1500);

document.addEventListener("DOMContentLoaded", ensureReportPage);
