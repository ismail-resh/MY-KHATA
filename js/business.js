// ==================================================
// মাল্টি ব্যবসা  (নেভিগেশন → ব্যবসা)
//
// একটি অ্যাপে একাধিক ব্যবসার হিসাব আলাদা আলাদা রাখা যায়।
//
// মূল ধারণা:
//   businesses table      → ব্যবসার তালিকা (নাম, ধরন, রং)
//   customers/transactions → প্রতিটির business_id আছে
//   activeBusinessId       → এখন কোন ব্যবসা খোলা ("all" = সব ব্যবসা একত্রে)
//
// গুরুত্বপূর্ণ কৌশল: offline.js ডেটা লোড করার সময় শুধু বর্তমান ব্যবসার গ্রাহক ও লেনদেন
// `customers` / `transactions` এ রাখে। তাই হোম, ইতিহাস, রিপোর্ট, ভয়েস এন্ট্রি, রিসাইকেল বিন
// সবকিছু নিজে থেকেই "বর্তমান ব্যবসা"-র ডেটা দেখায়, আলাদা করে বদলাতে হয়নি।
// ==================================================

const BIZ_KINDS = {
  grocery:  { label: "মুদি দোকান",    icon: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5C4 10.9 5.1 12 6.5 12S9 10.9 9 9.5c0 1.4 1.1 2.5 3 2.5s3-1.1 3-2.5c0 1.4 1.1 2.5 2.5 2.5S20 10.9 20 9.5M5 12v8h14v-8"/>' },
  pharmacy: { label: "ফার্মেসি",      icon: '<path d="M8 9V6.5h8V9M4.5 9h15a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM12 12.5v4M10 14.5h4"/>' },
  dairy:    { label: "ডেয়ারি / ফার্ম", icon: '<path d="M3 10l9-6 9 6v10H3V10zM9 20v-6h6v6"/>' },
  rent:     { label: "বাসা ভাড়া",    icon: '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5"/>' },
  personal: { label: "ব্যক্তিগত",     icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.6 3.1-5.5 7-5.5s6.4 1.9 7 5.5"/>' },
  other:    { label: "অন্যান্য",      icon: '<path d="M4 8h16v11H4zM9 8V5.5h6V8M4 13h16"/>' }
};
const BIZ_COLORS = {
  green:  { name: "সবুজ",   bg: "#e3f4ec", fg: "#067a4b", dot: "#067a4b" },
  orange: { name: "কমলা",   bg: "#fff1d6", fg: "#8a5200", dot: "#d9892b" },
  blue:   { name: "নীল",    bg: "#e1ecfb", fg: "#1d4f91", dot: "#2f6fbf" },
  purple: { name: "বেগুনি", bg: "#efe6fb", fg: "#5b2fa3", dot: "#7a4fc4" },
  pink:   { name: "গোলাপি", bg: "#fde7f0", fg: "#a3224f", dot: "#d0457a" },
  gray:   { name: "ধূসর",   bg: "#e9eeec", fg: "#4b5d54", dot: "#5d6f66" }
};
const BIZ_PAGES = ["bizOverviewPage", "bizFormPage"];

let bizSchemaMissing = false;   // SQL চালানো না হলে true → অ্যাপ আগের মতো একক ব্যবসায় চলে
let bizLoadedFor = null;
let bizLoadPromise = null;
let bizLastId = null;           // সর্বশেষ একক ব্যবসা (সব-ব্যবসা মোডে লেনদেন লেখার জন্য)
let bizEditMode = false;
let bizForm = { id: null, kind: "other", color: "green", autoName: "" };

// ---------- ছোট helper ----------
function bizBn(v){ return String(v).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]); }
function bizStore(key, value){
  try{
    if(value === undefined) return localStorage.getItem(key);
    if(value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  }catch(e){}
  return null;
}
function bizById(id){ return businesses.find(b => String(b.id) === String(id)) || null; }
function bizIsAll(){ return activeBusinessId === "all"; }
function bizActive(){ return bizIsAll() ? null : bizById(activeBusinessId); }
function bizActiveName(){ return bizIsAll() ? "সব ব্যবসা" : (bizActive()?.name || ""); }
function bizOf(row){ return (row && row.business_id) || defaultBusinessId; }
function bizInScope(row){
  if(!activeBusinessId || bizIsAll() || bizSchemaMissing) return true;
  return String(bizOf(row)) === String(activeBusinessId);
}
// সব-ব্যবসা মোডে একই নামের গ্রাহক আলাদা রাখার key (একক মোডে শুধু নাম)
function bizBalKey(row, name){
  const n = name != null ? name : (row && row.customer_name) || "";
  return (typeof bizIsAll === "function" && bizIsAll()) ? bizOf(row) + "|" + n : n;
}
// নতুন গ্রাহক/লেনদেন কোন ব্যবসায় লেখা হবে
function bizWriteId(){
  if(bizSchemaMissing) return null;
  if(activeBusinessId && !bizIsAll()) return activeBusinessId;
  return (bizLastId && bizById(bizLastId)) ? bizLastId : defaultBusinessId;
}
function bizTileHTML(b, size){
  const c = BIZ_COLORS[b?.color] || BIZ_COLORS.green;
  const k = BIZ_KINDS[b?.kind] || BIZ_KINDS.other;
  const s = size || 40, i = Math.round(s * 0.52);
  return `<span class="biz-tile" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * 0.3)}px;background:${c.bg};color:${c.fg}">
    <svg width="${i}" height="${i}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${k.icon}</svg></span>`;
}
function bizStackHTML(){
  return `<span class="biz-stack">${businesses.slice(0, 3).map(b => `<i style="background:${(BIZ_COLORS[b.color] || BIZ_COLORS.green).bg}"></i>`).join("")}</span>`;
}
function bizResetState(){
  businesses = []; activeBusinessId = null; defaultBusinessId = null;
  bizLoadedFor = null; bizLastId = null; bizSchemaMissing = false;
}

// ---------- ব্যবসার তালিকা লোড ----------
async function bizEnsureLoaded(force){
  let uid = null;
  try{ uid = await currentOwnerId(); }catch(e){}
  if(!uid) return;
  if(!force && bizLoadedFor === uid && (businesses.length || bizSchemaMissing)) return;
  if(bizLoadPromise && !force) return bizLoadPromise;

  bizLoadPromise = (async () => {
    let list = null;
    if(navigator.onLine){
      try{
        const { data, error } = await supabaseClient.from("businesses").select("*")
          .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
        if(error){
          if(/PGRST205|42P01|does not exist|schema cache|Could not find the table/i.test((error.code || "") + " " + (error.message || ""))) bizSchemaMissing = true;
          else console.warn("businesses load failed", error.message);
        }else{
          list = data || [];
          bizSchemaMissing = false;
        }
      }catch(e){ console.warn("businesses load failed", e); }
    }
    if(bizSchemaMissing){
      businesses = []; activeBusinessId = null; defaultBusinessId = null; bizLoadedFor = uid;
      renderBizChips();
      return;
    }
    if(list === null){
      try{ list = JSON.parse(bizStore("mk_biz_list_" + uid) || "[]"); }catch(e){ list = []; }
    }
    // প্রথমবার: ডিফল্ট ব্যবসা তৈরি
    if(list.length === 0 && navigator.onLine){
      try{
        const ins = await supabaseClient.from("businesses")
          .insert({ user_id: uid, name: "আমার ব্যবসা", kind: "other", color: "green", is_default: true, sort_order: 0 }).select().single();
        if(!ins.error && ins.data) list = [ins.data];
        else{
          const again = await supabaseClient.from("businesses").select("*").order("created_at", { ascending: true });
          if(!again.error && again.data) list = again.data;
        }
      }catch(e){ console.warn("default business create failed", e); }
    }
    businesses = list;
    if(list.length) bizStore("mk_biz_list_" + uid, JSON.stringify(list));
    defaultBusinessId = (list.find(b => b.is_default) || list[0] || {}).id || null;

    const saved = bizStore("mk_biz_active_" + uid);
    const last = bizStore("mk_biz_last_" + uid);
    if(!activeBusinessId || force !== "keep"){
      activeBusinessId = (saved === "all" || (saved && bizById(saved))) ? saved : defaultBusinessId;
    }
    if(activeBusinessId !== "all" && !bizById(activeBusinessId)) activeBusinessId = defaultBusinessId;
    bizLastId = bizById(last) ? last : (activeBusinessId !== "all" ? activeBusinessId : defaultBusinessId);
    bizLoadedFor = uid;
    renderBizChips();
  })().finally(() => { bizLoadPromise = null; });
  return bizLoadPromise;
}

async function bizPersistActive(){
  let uid = null; try{ uid = await currentOwnerId(); }catch(e){}
  if(!uid) return;
  bizStore("mk_biz_active_" + uid, activeBusinessId);
  if(activeBusinessId && activeBusinessId !== "all"){ bizLastId = activeBusinessId; bizStore("mk_biz_last_" + uid, activeBusinessId); }
}

// ---------- ব্যবসা বদলানো ----------
function bizVisiblePage(){
  const vis = id => { const el = document.getElementById(id); return el && !el.classList.contains("hidden"); };
  if(vis("homePage")) return "home";
  if(vis("customerPage")) return "workspace";
  if(vis("bizOverviewPage")) return "overview";
  return "other";
}

async function setActiveBusiness(id){
  if(id !== "all" && !bizById(id)) return;
  const where = bizVisiblePage();
  activeBusinessId = id;
  await bizPersistActive();
  closeBizSheet();
  try{ await loadCustomers(); await loadTransactions(); }catch(e){ console.warn("scope reload failed", e); }
  renderBizChips();
  if(typeof updateBinBadge === "function") updateBinBadge();

  if(where === "home"){ if(typeof renderHomeDashboard === "function") renderHomeDashboard(); }
  else if(where === "workspace"){ if(id === "all") openBizOverview(); else showCustomers(); }
  else if(where === "overview"){ if(id === "all") renderBizOverview(); else showCustomers(); }
}

function showBusinessTab(){
  if(bizIsAll()) openBizOverview(); else showCustomers();
}

// ---------- চিপ (হোম ও ব্যবসা পেজের ওপরে) ----------
function renderBizChips(){
  const html = (!businesses.length || bizSchemaMissing) ? "" : (bizIsAll()
    ? `${bizStackHTML()}<span class="biz-chip-name">সব ব্যবসা</span><svg class="biz-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`
    : `${bizTileHTML(bizActive(), 32)}<span class="biz-chip-name">${escapeHTML(bizActive()?.name || "")}</span><svg class="biz-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`);
  ["bizChipWorkspace", "bizChipHome"].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = html;
    el.classList.toggle("hidden", !html);
  });
  document.getElementById("bizMoreBtn")?.classList.toggle("hidden", !html || bizIsAll());
  const search = document.getElementById("customerSearch");
  if(search && html && !bizIsAll()) search.placeholder = "🔎 " + (bizActive()?.name || "") + "-এর গ্রাহক খুঁজুন…";
}

// ---------- পেজ/UI তৈরি ----------
function ensureBizUI(){
  if(document.getElementById("bizOverviewPage")) return;
  const nav = document.querySelector(".bottom-nav");
  if(!nav) return;

  const overview = document.createElement("section");
  overview.id = "bizOverviewPage";
  overview.className = "biz-page hidden";
  overview.innerHTML = `
    <header class="biz-header">
      <div class="biz-header-row">
        <button type="button" class="biz-back" onclick="showHome()" aria-label="হোমে ফিরুন">‹</button>
        <h1>সব ব্যবসা একত্রে</h1>
      </div>
      <div class="biz-head-totals">
        <div><span>মোট পাবো</span><b id="bizAllReceive">৳ 0</b></div>
        <div><span>মোট দেবো</span><b id="bizAllPay">৳ 0</b></div>
      </div>
      <div class="biz-net"><span>নিট হিসাব (পাবো − দেবো)</span><b id="bizAllNet">৳ 0</b></div>
    </header>
    <div class="biz-body">
      <div id="bizOverviewLabel" class="biz-label"></div>
      <div id="bizOverviewList"></div>
      <button type="button" class="biz-dashed" onclick="openBizForm()">+ নতুন ব্যবসা যোগ করুন</button>
    </div>`;
  nav.before(overview);
  overview.addEventListener("click", e => {
    const card = e.target.closest && e.target.closest("[data-biz-open]");
    if(card) openBusiness(card.dataset.bizOpen);
  });

  const form = document.createElement("section");
  form.id = "bizFormPage";
  form.className = "biz-page hidden";
  form.innerHTML = `
    <header class="biz-header slim">
      <div class="biz-header-row">
        <button type="button" class="biz-back" onclick="closeBizForm()" aria-label="ফিরে যান">‹</button>
        <h1 id="bizFormTitle">নতুন ব্যবসা</h1>
      </div>
    </header>
    <div class="biz-body">
      <div class="biz-preview"><div id="bizPreviewTile"></div><div><b id="bizPreviewName">নতুন ব্যবসা</b><small id="bizPreviewSub">নতুন হিসাবের খাতা</small></div></div>
      <label class="biz-field-label" for="bizName">ব্যবসার নাম</label>
      <input id="bizName" class="biz-input" type="text" maxlength="60" autocomplete="off" oninput="bizFormInput()">
      <div class="biz-field-label">ধরন বেছে নিন (আইকন নিজে ঠিক হবে)</div>
      <div id="bizKindChips" class="biz-chips"></div>
      <div class="biz-field-label">রং (এক নজরে চেনার জন্য)</div>
      <div id="bizColorChips" class="biz-colors"></div>
      <div class="biz-info" id="bizFormInfo"></div>
      <div id="bizFormMsg" class="biz-msg hidden"></div>
      <button type="button" id="bizSaveBtn" class="biz-primary" onclick="saveBizForm()">ব্যবসা তৈরি করুন</button>
      <button type="button" id="bizDeleteBtn" class="biz-danger hidden" onclick="deleteBizFromForm()">এই ব্যবসা মুছুন</button>
    </div>`;
  nav.before(form);

  const overlay = document.createElement("div");
  overlay.id = "bizSheetOverlay";
  overlay.className = "biz-overlay hidden";
  overlay.addEventListener("click", e => { if(e.target === overlay) closeBizSheet(); });
  overlay.addEventListener("click", e => {
    const row = e.target.closest && e.target.closest("[data-biz-pick]");
    if(row){ setActiveBusiness(row.dataset.bizPick); return; }
    const ed = e.target.closest && e.target.closest("[data-biz-edit]");
    if(ed){ closeBizSheet(); openBizForm(ed.dataset.bizEdit); }
  });
  document.getElementById("app").appendChild(overlay);
}

// ---------- পেজ দেখানো/লুকানো ----------
function hideBizPages(){
  BIZ_PAGES.forEach(id => document.getElementById(id)?.classList.add("hidden"));
  closeBizSheet();
}

function bizShowPage(pageId, showNav){
  ensureBizUI();
  document.getElementById("app")?.classList.add("inner-page");
  ["homePage","customerPage","addPage","profilePage","historyPage","myProfilePage","myProfileHeader"]
    .forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById("myProfileHeader")?.style.setProperty("display", "none", "important");
  if(typeof hideReportPage === "function") hideReportPage();
  if(typeof hideBinPage === "function") hideBinPage();
  BIZ_PAGES.forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById(pageId)?.classList.remove("hidden");
  const nav = document.querySelector(".bottom-nav");
  if(nav) nav.style.display = showNav ? "grid" : "none";
  if(typeof setActiveBottomNav === "function") setActiveBottomNav("navCustomers");
  currentCustomer = null;
  window.scrollTo(0, 0);
}

// ---------- ব্যবসা বদলান (bottom sheet) ----------
function openBizSheet(){
  ensureBizUI();
  if(!businesses.length) return;
  bizEditMode = false;
  renderBizSheet();
  document.getElementById("bizSheetOverlay").classList.remove("hidden");
}
function closeBizSheet(){ document.getElementById("bizSheetOverlay")?.classList.add("hidden"); }
function toggleBizEdit(){ bizEditMode = !bizEditMode; renderBizSheet(); }

function renderBizSheet(){
  const stats = bizStats();
  const rows = businesses.map(b => {
    const s = stats[b.id] || { customers: 0, receive: 0, pay: 0 };
    const active = !bizIsAll() && String(b.id) === String(activeBusinessId);
    const parts = [bizBn(s.customers) + " জন"];
    if(s.receive) parts.push("পাবো ৳ " + formatMoney(s.receive));
    if(s.pay) parts.push("দেবো ৳ " + formatMoney(s.pay));
    return `
    <div class="biz-row${active ? " active" : ""}" ${bizEditMode ? "" : `data-biz-pick="${escapeHTML(String(b.id))}"`} ${bizEditMode ? "" : 'role="button" tabindex="0"'}>
      ${bizTileHTML(b, 42)}
      <span class="biz-row-main"><b>${escapeHTML(b.name)}</b><small>${escapeHTML(parts.join(" · "))}</small></span>
      ${bizEditMode ? `<button type="button" class="biz-edit-btn" data-biz-edit="${escapeHTML(String(b.id))}">সম্পাদনা</button>` : (active ? '<span class="biz-check">✓</span>' : "")}
    </div>`;
  }).join("");

  document.getElementById("bizSheetOverlay").innerHTML = `
    <div class="biz-sheet" role="dialog" aria-modal="true" aria-label="ব্যবসা বদলান">
      <div class="biz-sheet-handle"></div>
      <div class="biz-sheet-head"><h2>ব্যবসা বদলান</h2>
        <button type="button" class="biz-pill" onclick="toggleBizEdit()">${bizEditMode ? "শেষ" : "সম্পাদনা"}</button></div>
      <div class="biz-all${bizIsAll() ? " active" : ""}" data-biz-pick="all" role="button" tabindex="0">
        ${bizStackHTML()}
        <span class="biz-row-main"><b>সব ব্যবসা একত্রে</b><small>${bizBn(businesses.length)}টি ব্যবসার মোট হিসাব দেখুন</small></span>
        ${bizIsAll() ? '<span class="biz-check">✓</span>' : '<span class="biz-chev-r">›</span>'}
      </div>
      <div class="biz-label">আপনার ব্যবসা</div>
      ${rows}
      <button type="button" class="biz-primary" onclick="closeBizSheet();openBizForm()">+ নতুন ব্যবসা যোগ করুন</button>
    </div>`;
}

// ---------- পরিসংখ্যান ----------
function bizStats(){
  const deletedIds = new Set([...deletedCustomers, ...bizOutCustomers.filter(c => c.deleted_at)].map(c => String(c.id)));
  const allC = [...customers, ...bizOutCustomers.filter(c => !c.deleted_at)];
  const allT = [...transactions, ...bizOutTransactions.filter(t => !(t.customer_id != null && deletedIds.has(String(t.customer_id))))];
  const out = {};
  businesses.forEach(b => { out[b.id] = { id: b.id, customers: 0, receive: 0, pay: 0 }; });
  allC.forEach(c => { const k = bizOf(c); if(out[k]) out[k].customers++; });
  const bal = {};
  allT.forEach(t => {
    const k = bizOf(t); if(!out[k]) return;
    const key = k + "|" + (t.customer_id || t.customer_name || "");
    bal[key] = (bal[key] || 0) + (t.type === "receive" ? 1 : -1) * Number(t.amount || 0);
  });
  Object.entries(bal).forEach(([key, v]) => {
    const k = key.split("|")[0];
    if(v > 0) out[k].receive += v; else if(v < 0) out[k].pay += -v;
  });
  return out;
}

// ---------- সব ব্যবসা একত্রে (overview) ----------
async function openBizOverview(){
  ensureBizUI();
  bizShowPage("bizOverviewPage", true);
  renderBizOverview();
  try{ await loadCustomers(); await loadTransactions(); }catch(e){ console.warn(e); }
  renderBizOverview();
}

function renderBizOverview(){
  if(!document.getElementById("bizOverviewPage")) return;
  const stats = bizStats();
  let r = 0, p = 0;
  Object.values(stats).forEach(s => { r += s.receive; p += s.pay; });
  document.getElementById("bizAllReceive").textContent = "৳ " + formatMoney(r);
  document.getElementById("bizAllPay").textContent = "৳ " + formatMoney(p);
  const net = r - p;
  document.getElementById("bizAllNet").textContent = (net > 0 ? "+ " : net < 0 ? "- " : "") + "৳ " + formatMoney(Math.abs(net));
  document.getElementById("bizOverviewLabel").textContent = bizBn(businesses.length) + "টি ব্যবসা · ট্যাপ করলে ঢুকবেন";
  document.getElementById("bizOverviewList").innerHTML = businesses.map(b => {
    const s = stats[b.id] || { customers: 0, receive: 0, pay: 0 };
    return `
    <div class="biz-card" data-biz-open="${escapeHTML(String(b.id))}" role="button" tabindex="0">
      <div class="biz-card-top">${bizTileHTML(b, 42)}
        <div class="biz-row-main"><b>${escapeHTML(b.name)}</b><small>${bizBn(s.customers)} জন গ্রাহক</small></div>
      </div>
      <div class="biz-card-nums">
        <div><span>পাবো</span><b class="g">৳ ${formatMoney(s.receive)}</b></div>
        <div><span>দেবো</span><b class="${s.pay ? "r" : ""}">৳ ${formatMoney(s.pay)}</b></div>
      </div>
    </div>`;
  }).join("");
}

async function openBusiness(id){
  await setActiveBusiness(id);   // overview থেকে ডাকলে নিজেই শুধু ওই ব্যবসার গ্রাহক পেজ খুলবে
}

// ---------- নতুন ব্যবসা / সম্পাদনা ----------
function openBizForm(id){
  ensureBizUI();
  const b = id ? bizById(id) : null;
  bizForm = { id: b ? b.id : null, kind: b ? b.kind : "grocery", color: b ? b.color : "green", autoName: "" };
  bizShowPage("bizFormPage", false);
  document.getElementById("bizFormTitle").textContent = b ? "ব্যবসা সম্পাদনা" : "নতুন ব্যবসা";
  const nameEl = document.getElementById("bizName");
  nameEl.value = b ? b.name : "";
  if(!b){ bizForm.autoName = BIZ_KINDS[bizForm.kind].label; nameEl.value = bizForm.autoName; }
  document.getElementById("bizSaveBtn").textContent = b ? "পরিবর্তন সেভ করুন" : "ব্যবসা তৈরি করুন";
  document.getElementById("bizDeleteBtn").classList.toggle("hidden", !b || !!b.is_default);
  document.getElementById("bizFormInfo").innerHTML = b
    ? "এই ব্যবসার গ্রাহক ও লেনদেন আগের মতোই থাকবে। শুধু নাম, ধরন ও রং বদলাবে।"
    : "প্রতিটি ব্যবসার গ্রাহক, লেনদেন আর হিসাব সম্পূর্ণ আলাদা থাকবে। আপনার আগের সব হিসাব <b>\"" + escapeHTML(bizById(defaultBusinessId)?.name || "আমার ব্যবসা") + "\"</b> এ আছে, কিছু হারাবে না।";
  document.getElementById("bizFormMsg").classList.add("hidden");
  renderBizFormChips();
  bizFormInput();
}

function closeBizForm(){
  hideBizPages();
  if(bizForm.id || bizIsAll()) { if(bizIsAll()) openBizOverview(); else showCustomers(); }
  else showBusinessTab();
}

function renderBizFormChips(){
  document.getElementById("bizKindChips").innerHTML = Object.entries(BIZ_KINDS).map(([k, v]) =>
    `<button type="button" class="biz-kind${k === bizForm.kind ? " on" : ""}" onclick="pickBizKind('${k}')">${escapeHTML(v.label)}</button>`).join("");
  document.getElementById("bizColorChips").innerHTML = Object.entries(BIZ_COLORS).map(([k, v]) =>
    `<button type="button" class="biz-color${k === bizForm.color ? " on" : ""}" style="background:${v.dot}" aria-label="${v.name}" aria-pressed="${k === bizForm.color}" onclick="pickBizColor('${k}')"></button>`).join("");
}

function pickBizKind(k){
  const nameEl = document.getElementById("bizName");
  const cur = nameEl.value.trim();
  bizForm.kind = k;
  if(!bizForm.id && (!cur || cur === bizForm.autoName)){ bizForm.autoName = BIZ_KINDS[k].label; nameEl.value = bizForm.autoName; }
  renderBizFormChips(); bizFormInput();
}
function pickBizColor(k){ bizForm.color = k; renderBizFormChips(); bizFormInput(); }

function bizFormInput(){
  const name = document.getElementById("bizName").value.trim();
  const temp = { kind: bizForm.kind, color: bizForm.color };
  document.getElementById("bizPreviewTile").innerHTML = bizTileHTML(temp, 56);
  document.getElementById("bizPreviewName").textContent = name || "নতুন ব্যবসা";
  const existing = bizForm.id ? bizById(bizForm.id) : null;
  document.getElementById("bizPreviewSub").textContent = existing ? "বর্তমান ব্যবসা" : "০ জন গ্রাহক · নতুন হিসাবের খাতা";
}

function bizFormError(msg){
  const el = document.getElementById("bizFormMsg");
  el.textContent = msg; el.classList.remove("hidden");
}

async function saveBizForm(){
  const name = document.getElementById("bizName").value.trim();
  if(!name) return bizFormError("ব্যবসার নাম দিন।");
  if(businesses.some(b => String(b.id) !== String(bizForm.id) && b.name.trim().toLowerCase() === name.toLowerCase()))
    return bizFormError("এই নামে আরেকটি ব্যবসা আছে।");
  if(!navigator.onLine) return bizFormError("ব্যবসা যোগ বা পরিবর্তন করতে ইন্টারনেট লাগবে।");
  if(bizSchemaMissing) return bizFormError("ডেটাবেসে businesses table নেই। আগে SUPABASE-MULTI-BUSINESS.sql চালান।");

  const btn = document.getElementById("bizSaveBtn");
  btn.disabled = true;
  try{
    const uid = await currentOwnerId();
    if(!uid) throw new Error("লগইন সেশন পাওয়া যায়নি। আবার লগইন করুন।");
    let savedId = bizForm.id;
    if(bizForm.id){
      const { error } = await supabaseClient.from("businesses")
        .update({ name, kind: bizForm.kind, color: bizForm.color, updated_at: new Date().toISOString() })
        .eq("id", bizForm.id).eq("user_id", uid);
      if(error) throw error;
    }else{
      const sort = businesses.reduce((m, b) => Math.max(m, Number(b.sort_order || 0)), 0) + 1;
      const { data, error } = await supabaseClient.from("businesses")
        .insert({ user_id: uid, name, kind: bizForm.kind, color: bizForm.color, sort_order: sort }).select().single();
      if(error) throw error;
      savedId = data.id;
    }
    await bizEnsureLoaded(true);
    if(!bizForm.id){ activeBusinessId = savedId; await bizPersistActive(); }
    await loadCustomers(); await loadTransactions();
    renderBizChips();
    hideBizPages();
    showCustomers();
  }catch(err){
    console.error("business save failed", err);
    bizFormError(/duplicate|23505/i.test((err.code || "") + (err.message || "")) ? "এই নামে আরেকটি ব্যবসা আছে।" : (err.message || "সেভ করা যায়নি।"));
  }finally{
    btn.disabled = false;
  }
}

async function deleteBizFromForm(){
  const b = bizById(bizForm.id);
  if(!b) return;
  if(b.is_default) return bizFormError("মূল ব্যবসা মুছে ফেলা যায় না।");
  const used = [...customers, ...deletedCustomers, ...bizOutCustomers].some(c => String(bizOf(c)) === String(b.id));
  if(used) return bizFormError("এই ব্যবসায় গ্রাহক আছে (রিসাইকেল বিনে থাকাগুলোও)। আগে সেগুলো স্থায়ীভাবে মুছুন, তারপর ব্যবসা মুছুন।");
  if(!navigator.onLine) return bizFormError("ব্যবসা মুছতে ইন্টারনেট লাগবে।");
  if(!confirm("\"" + b.name + "\" ব্যবসাটি মুছে ফেলবেন?")) return;
  try{
    const uid = await currentOwnerId();
    const { error } = await supabaseClient.from("businesses").delete().eq("id", b.id).eq("user_id", uid);
    if(error) throw error;
    if(String(activeBusinessId) === String(b.id)) activeBusinessId = defaultBusinessId;
    await bizEnsureLoaded(true);
    await bizPersistActive();
    await loadCustomers(); await loadTransactions();
    renderBizChips();
    hideBizPages();
    showCustomers();
  }catch(err){
    bizFormError(/foreign key|23503/i.test((err.code || "") + (err.message || "")) ? "এই ব্যবসায় এখনো ডেটা আছে, তাই মোছা যায়নি।" : (err.message || "মোছা যায়নি।"));
  }
}

// ---------- অন্য পেজ খুললে ব্যবসার পেজ লুকানো; বিশেষ আচরণ ----------
["showHome","showCustomers","showTransactionHistory","showAddTransaction","openMyProfile","openProfileById","openReportPage","openBinPage","showLogin"]
  .forEach(name => {
    const original = window[name];
    if(typeof original !== "function") return;
    window[name] = function(...args){
      hideBizPages();
      // সব-ব্যবসা মোডে "গ্রাহক" তালিকার বদলে overview দেখাই
      if(name === "showCustomers" && bizIsAll()) return openBizOverview();
      // লেনদেন সবসময় একটি নির্দিষ্ট ব্যবসায় লেখা হয়
      if(name === "showAddTransaction" && bizIsAll()){
        const target = bizWriteId();
        if(target){
          return setActiveBusiness(target).then(() => original.apply(this, args));
        }
      }
      return original.apply(this, args);
    };
  });

document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeBizSheet();
  if((e.key === "Enter" || e.key === " ") && e.target?.getAttribute?.("role") === "button" && (e.target.dataset.bizPick || e.target.dataset.bizOpen)){
    e.preventDefault(); e.target.click();
  }
});

document.addEventListener("DOMContentLoaded", () => { ensureBizUI(); renderBizChips(); });
