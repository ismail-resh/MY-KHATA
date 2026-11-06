// ==================================================
// রিসাইকেল বিন (Profile → রিসাইকেল বিন)
//
// ডিলিট করা গ্রাহক ৩০ দিন এখানে থাকে। এর মধ্যে ফিরিয়ে আনা যায়।
// ৩০ দিন পর Supabase-এর pg_cron job (SUPABASE-RECYCLE-BIN.sql) স্বয়ংক্রিয়ভাবে মুছে দেয়।
//
// কীভাবে কাজ করে:
//   customers.deleted_at = NULL  → সাধারণ গ্রাহক
//   customers.deleted_at = তারিখ → বিনে আছে
// offline.js গ্রাহক লোড করার সময় এই দুই দলকে আলাদা করে:
//   customers / transactions            → সাধারণ তালিকা
//   deletedCustomers / deletedTransactions → বিন
// ==================================================

const BIN_DAYS = 30;
const BIN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];

let binPending = null;      // {kind, id} — খোলা dialog কিসের জন্য
let binBusy = false;
let binSchemaChecked = null; // deleted_at column আছে কি না
let binToastTimer = null;

// ---------- helper ----------
function binBn(v){ return String(v).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]); }
function binDateLabel(iso){
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return "";
  return binBn(d.getDate()) + " " + BIN_MONTHS[d.getMonth()] + " " + binBn(d.getFullYear());
}
function binDaysLeft(c){
  const t = new Date(c.deleted_at).getTime();
  if(Number.isNaN(t)) return BIN_DAYS;
  const left = Math.ceil((t + BIN_DAYS * 86400000 - Date.now()) / 86400000);
  return Math.max(0, Math.min(BIN_DAYS, left));
}
function binTransactionsOf(customer){
  return (deletedTransactions || []).filter(t => String(t.customer_id) === String(customer.id));
}
function binBalanceText(list){
  let bal = 0;
  list.forEach(t => { bal += t.type === "receive" ? Number(t.amount || 0) : -Number(t.amount || 0); });
  if(bal > 0) return "পাবো ৳ " + formatMoney(bal);
  if(bal < 0) return "দেবো ৳ " + formatMoney(Math.abs(bal));
  return "হিসাব সমান";
}

// column আছে কিনা (SQL না চালালে ডিলিট যেন নীরবে ব্যর্থ না হয়)
async function binSchemaReady(){
  if(binSchemaChecked !== null) return binSchemaChecked;
  if(!navigator.onLine) return true; // অফলাইনে পরীক্ষা করা যায় না; sync-এ ধরা পড়বে
  try{
    const { error } = await supabaseClient.from("customers").select("deleted_at").limit(1);
    binSchemaChecked = !(error && /deleted_at/i.test(error.message || ""));
  }catch(e){ binSchemaChecked = true; }
  return binSchemaChecked;
}

async function binUpdateCustomer(id, updates){
  if(window.offlineSupport && typeof offlineSupport.offlineAwareUpdateCustomer === "function"){
    return offlineSupport.offlineAwareUpdateCustomer(id, updates);
  }
  const uid = await currentUserIdOrNull();
  if(!uid) throw new Error("লগইন সেশন পাওয়া যায়নি। আবার লগইন করুন।");
  const { error } = await supabaseClient.from("customers")
    .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", uid);
  if(error) throw error;
}

// ---------- UI তৈরি (একবারই) ----------
function ensureBinUI(){
  if(document.getElementById("binPage")) return;
  const nav = document.querySelector(".bottom-nav");
  if(!nav) return;

  const page = document.createElement("section");
  page.id = "binPage";
  page.className = "bin-page hidden";
  page.innerHTML = `
    <header class="bin-header">
      <button type="button" class="bin-back" onclick="closeBinPage()" aria-label="ফিরে যান">‹</button>
      <h1>রিসাইকেল বিন</h1>
      <button type="button" id="binEmptyAllBtn" class="bin-empty-all" onclick="openBinDialog('purgeAll')">সব খালি করুন</button>
    </header>
    <div class="bin-body">
      <div id="binNotice" class="bin-notice">
        <svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <span>মুছে ফেলা গ্রাহক এখানে <b>${binBn(BIN_DAYS)} দিন</b> থাকবে। এরপর স্বয়ংক্রিয়ভাবে স্থায়ীভাবে মুছে যাবে। তার আগে চাইলে ফিরিয়ে আনতে পারবেন।</span>
      </div>
      <div id="binCount" class="bin-count"></div>
      <div id="binList"></div>
      <div id="binEmpty" class="bin-empty hidden">
        <div class="bin-empty-icon"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg></div>
        <h2>রিসাইকেল বিন খালি</h2>
        <p>কোনো গ্রাহক ডিলিট করলে এখানে ${binBn(BIN_DAYS)} দিন থাকবে। সেই সময়ের মধ্যে চাইলে ফিরিয়ে আনতে পারবেন।</p>
        <button type="button" class="bin-go-customers" onclick="showCustomers()">গ্রাহক তালিকায় যান</button>
      </div>
    </div>`;
  nav.before(page);
  page.addEventListener("click", e => {
    const btn = e.target.closest && e.target.closest("[data-bin-action]");
    if(!btn) return;
    openBinDialog(btn.dataset.binAction, btn.dataset.id);
  });

  const overlay = document.createElement("div");
  overlay.id = "binDialogOverlay";
  overlay.className = "bin-overlay hidden";
  overlay.addEventListener("click", e => { if(e.target === overlay) closeBinDialog(); });
  document.getElementById("app").appendChild(overlay);

  const toast = document.createElement("div");
  toast.id = "binToast";
  toast.className = "bin-toast hidden";
  toast.setAttribute("role", "status");
  document.getElementById("app").appendChild(toast);
}

// ---------- পেজ খোলা / বন্ধ ----------
function hideBinPage(){
  document.getElementById("binPage")?.classList.add("hidden");
  closeBinDialog();
}

async function openBinPage(){
  ensureBinUI();
  document.getElementById("app")?.classList.add("inner-page");
  ["homePage","customerPage","addPage","profilePage","historyPage","myProfilePage","myProfileHeader"]
    .forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById("myProfileHeader")?.style.setProperty("display", "none", "important");
  if(typeof hideReportPage === "function") hideReportPage();
  document.getElementById("binPage")?.classList.remove("hidden");
  const nav = document.querySelector(".bottom-nav");
  if(nav) nav.style.display = "grid";
  if(typeof setActiveBottomNav === "function") setActiveBottomNav("navProfile");
  currentCustomer = null;
  window.scrollTo(0, 0);

  renderBin();
  // সার্ভার থেকে সর্বশেষ অবস্থা এনে আবার আঁকা (অন্য ডিভাইসে মোছা/ফেরানো হলে)
  try{ await loadCustomers(); await loadTransactions(); }catch(e){ console.warn("bin refresh failed", e); }
  renderBin();
  updateBinBadge();
}

function closeBinPage(){
  hideBinPage();
  openMyProfile();
}

// ---------- তালিকা আঁকা ----------
function renderBin(){
  if(!document.getElementById("binPage")) return;
  const list = document.getElementById("binList");
  const items = [...(deletedCustomers || [])].sort((a, b) => binDaysLeft(a) - binDaysLeft(b));

  const has = items.length > 0;
  document.getElementById("binEmpty").classList.toggle("hidden", has);
  document.getElementById("binNotice").classList.toggle("hidden", !has);
  document.getElementById("binCount").classList.toggle("hidden", !has);
  document.getElementById("binEmptyAllBtn").classList.toggle("hidden", !has);
  document.getElementById("binCount").textContent = binBn(items.length) + " জন গ্রাহক · সবচেয়ে কম সময় বাকি আগে";

  list.innerHTML = items.map(c => {
    const left = binDaysLeft(c);
    const urgent = left <= 7;
    const txs = binTransactionsOf(c);
    const name = String(c.name || "অজানা");
    const tag = left === 0 ? "আজ মুছে যাবে" : binBn(left) + " দিন বাকি";
    return `
    <article class="bin-card${urgent ? " urgent" : ""}">
      <div class="bin-card-top">
        <div class="bin-avatar">${escapeHTML(name.trim().charAt(0).toUpperCase() || "?")}</div>
        <div class="bin-card-main">
          <b>${escapeHTML(name)}</b>
          <small>${binBn(txs.length)}টি লেনদেন · ${escapeHTML(binBalanceText(txs))}</small>
        </div>
        <span class="bin-tag">${tag}</span>
      </div>
      <div class="bin-progress"><i style="width:${(left / BIN_DAYS * 100).toFixed(0)}%"></i></div>
      <div class="bin-date">মুছেছেন: ${escapeHTML(binDateLabel(c.deleted_at))}</div>
      <div class="bin-actions">
        <button type="button" class="bin-restore" data-bin-action="restore" data-id="${escapeHTML(String(c.id))}">ফিরিয়ে আনুন</button>
        <button type="button" class="bin-purge" data-bin-action="purge" data-id="${escapeHTML(String(c.id))}">স্থায়ীভাবে মুছুন</button>
      </div>
    </article>`;
  }).join("");
}

function updateBinBadge(){
  const n = (deletedCustomers || []).length;
  document.querySelectorAll(".bin-menu-count").forEach(el => {
    el.textContent = binBn(n);
    el.classList.toggle("hidden", n === 0);
  });
}

// ---------- dialog ----------
function openDeleteToBinDialog(){
  const c = customers.find(x => String(x.id) === String(currentCustomerId)) || findCustomerByName(currentCustomer || "");
  if(!c) return alert("Customer পাওয়া যায়নি।");
  openBinDialog("delete", c.id, c);
}

function openBinDialog(kind, id, customerObj){
  ensureBinUI();
  const c = customerObj || (deletedCustomers || []).find(x => String(x.id) === String(id));
  if(kind !== "purgeAll" && !c) return;
  binPending = { kind, id: c ? c.id : null };
  const name = escapeHTML(c ? String(c.name || "") : "");
  document.getElementById("binToast")?.classList.add("hidden");
  const o = document.getElementById("binDialogOverlay");
  let html = "";

  if(kind === "delete"){
    const count = transactions.filter(t => String(t.customer_id) === String(c.id) || (!t.customer_id && t.customer_name === c.name)).length;
    o.className = "bin-overlay";
    html = `
    <div class="bin-dialog" role="dialog" aria-modal="true" aria-labelledby="binDlgTitle">
      <div class="bin-dlg-icon danger"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg></div>
      <h2 id="binDlgTitle">${name} কে ডিলিট করবেন?</h2>
      <p>গ্রাহক ও তার ${binBn(count)}টি লেনদেন <b>রিসাইকেল বিনে</b> যাবে। ${binBn(BIN_DAYS)} দিনের মধ্যে চাইলে ফিরিয়ে আনতে পারবেন।</p>
      <div class="bin-dlg-note"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>${binBn(BIN_DAYS)} দিন পর স্বয়ংক্রিয়ভাবে স্থায়ীভাবে মুছে যাবে।</span></div>
      <div id="binDlgMsg" class="bin-dlg-msg hidden"></div>
      <button type="button" id="binDlgOk" class="bin-dlg-btn danger" onclick="confirmBinDialog()">রিসাইকেল বিনে পাঠান</button>
      <button type="button" class="bin-dlg-cancel" onclick="closeBinDialog()">বাতিল</button>
    </div>`;
  }else if(kind === "restore"){
    o.className = "bin-overlay sheet";
    const left = binDaysLeft(c);
    html = `
    <div class="bin-dialog sheet" role="dialog" aria-modal="true" aria-labelledby="binDlgTitle">
      <div class="bin-sheet-handle"></div>
      <div class="bin-sheet-head">
        <div class="bin-dlg-icon ok"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/></svg></div>
        <div><h2 id="binDlgTitle">${name} কে ফিরিয়ে আনবেন?</h2><small>${binBn(left)} দিন বাকি ছিল</small></div>
      </div>
      <ul class="bin-checks">
        <li><span>✓</span>গ্রাহক তালিকায় আবার যুক্ত হবে</li>
        <li><span>✓</span>${binBn(binTransactionsOf(c).length)}টি লেনদেন ও হিসাব আগের মতোই থাকবে</li>
        <li><span>✓</span>দেবো/পাবোর মোটে আবার যোগ হবে</li>
      </ul>
      <div id="binDlgMsg" class="bin-dlg-msg hidden"></div>
      <button type="button" id="binDlgOk" class="bin-dlg-btn ok" onclick="confirmBinDialog()">হ্যাঁ, ফিরিয়ে আনুন</button>
      <button type="button" class="bin-dlg-cancel" onclick="closeBinDialog()">বাতিল</button>
    </div>`;
  }else{ // purge | purgeAll
    o.className = "bin-overlay";
    const all = kind === "purgeAll";
    const total = (deletedCustomers || []).length;
    html = `
    <div class="bin-dialog" role="dialog" aria-modal="true" aria-labelledby="binDlgTitle">
      <div class="bin-dlg-icon danger"><svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3zM12 10v4.5M12 17.5v.01"/></svg></div>
      <h2 id="binDlgTitle">${all ? "বিনের সব " + binBn(total) + " জন গ্রাহককে স্থায়ীভাবে মুছবেন?" : name + " কে স্থায়ীভাবে মুছবেন?"}</h2>
      <p>${all ? "সব গ্রাহক ও তাদের সব লেনদেন" : "গ্রাহক ও তার " + binBn(binTransactionsOf(c).length) + "টি লেনদেন"} চিরতরে মুছে যাবে। <b class="bin-red">এটি আর ফেরানো যাবে না।</b></p>
      <label for="binConfirmInput" class="bin-confirm-label">নিশ্চিত করতে নিচে <b>মুছুন</b> লিখুন</label>
      <input id="binConfirmInput" type="text" autocomplete="off" oninput="binCheckConfirmText()">
      <div id="binDlgMsg" class="bin-dlg-msg hidden"></div>
      <button type="button" id="binDlgOk" class="bin-dlg-btn danger" onclick="confirmBinDialog()" disabled>চিরতরে মুছে ফেলুন</button>
      <button type="button" class="bin-dlg-cancel" onclick="closeBinDialog()">না, রেখে দিন</button>
    </div>`;
  }
  o.innerHTML = html;
  setTimeout(() => (document.getElementById("binConfirmInput") || document.getElementById("binDlgOk"))?.focus(), 50);
}

function binCheckConfirmText(){
  const ok = (document.getElementById("binConfirmInput")?.value || "").trim() === "মুছুন";
  const btn = document.getElementById("binDlgOk");
  if(btn) btn.disabled = !ok;
}

function closeBinDialog(){
  if(binBusy) return;
  binPending = null;
  const o = document.getElementById("binDialogOverlay");
  if(o){ o.classList.add("hidden"); o.innerHTML = ""; }
}

function binDialogError(msg){
  const el = document.getElementById("binDlgMsg");
  if(!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function showBinToast(text, actionLabel, action){
  ensureBinUI();
  const t = document.getElementById("binToast");
  t.innerHTML = `<span>${escapeHTML(text)}</span>`;
  if(actionLabel && action){
    const b = document.createElement("button");
    b.type = "button"; b.textContent = actionLabel;
    b.onclick = () => { t.classList.add("hidden"); action(); };
    t.appendChild(b);
  }
  t.classList.remove("hidden");
  clearTimeout(binToastTimer);
  binToastTimer = setTimeout(() => t.classList.add("hidden"), actionLabel ? 7000 : 3500);
}

// ---------- কাজ ----------
async function confirmBinDialog(){
  if(!binPending || binBusy) return;
  const { kind, id } = binPending;
  const btn = document.getElementById("binDlgOk");
  const label = btn?.textContent;
  binBusy = true;
  if(btn){ btn.disabled = true; btn.textContent = "⏳ অপেক্ষা করুন…"; }
  try{
    if(kind === "delete") await binDoSoftDelete(id);
    else if(kind === "restore") await binDoRestore(id);
    else if(kind === "purge") await binDoPurge([id]);
    else await binDoPurge((deletedCustomers || []).map(c => c.id));
    binBusy = false;
    closeBinDialog();
  }catch(err){
    binBusy = false;
    console.error("Recycle bin action failed:", err);
    binDialogError(err?.message || "কাজটি করা যায়নি। আবার চেষ্টা করুন।");
    if(btn){ btn.textContent = label; btn.disabled = false; if(kind.startsWith("purge")) binCheckConfirmText(); }
  }
}

async function binDoSoftDelete(id){
  if(!(await binSchemaReady())) throw new Error("ডেটাবেসে deleted_at column নেই। আগে SUPABASE-RECYCLE-BIN.sql চালান।");
  const c = customers.find(x => String(x.id) === String(id));
  if(!c) throw new Error("Customer পাওয়া যায়নি।");
  await binUpdateCustomer(c.id, { deleted_at: new Date().toISOString() });
  const name = c.name;
  currentCustomer = null; currentCustomerId = null;
  await loadCustomers(); await loadTransactions();
  showCustomers();
  updateBinBadge();
  showBinToast(name + " রিসাইকেল বিনে গেছে", "ফিরিয়ে আনুন", () => binRestoreQuick(c.id));
}

// toast-এর "ফিরিয়ে আনুন" (undo)
async function binRestoreQuick(id){
  try{ await binDoRestore(id); }
  catch(err){ showBinToast(err?.message || "ফিরিয়ে আনা যায়নি।"); }
}

async function binDoRestore(id){
  const c = (deletedCustomers || []).find(x => String(x.id) === String(id));
  if(!c) throw new Error("গ্রাহক বিনে পাওয়া যায়নি।");
  // লেনদেন নাম দিয়ে মেলানো হয়, তাই একই নামের দুজন সক্রিয় গ্রাহক থাকতে দেওয়া যায় না।
  const clash = customers.some(x => String(x.name || "").trim().toLowerCase() === String(c.name || "").trim().toLowerCase());
  if(clash) throw new Error("এই নামে আরেকজন গ্রাহক আছে। আগে তার নাম বদলান, তারপর ফিরিয়ে আনুন।");

  // আগে সক্রিয় তালিকায় তুলে নিই, যাতে অফলাইনেও ক্যাশে সঠিক অবস্থা সেভ হয়।
  deletedCustomers = deletedCustomers.filter(x => String(x.id) !== String(id));
  customers.push({ ...c, deleted_at: null });
  try{
    await binUpdateCustomer(c.id, { deleted_at: null });
  }catch(err){
    customers = customers.filter(x => String(x.id) !== String(id));
    deletedCustomers.push(c);
    throw err;
  }
  await loadCustomers(); await loadTransactions();
  renderBin(); updateBinBadge();
  showBinToast(c.name + " ফিরে এসেছে");
}

async function binDoPurge(ids){
  const idSet = new Set(ids.map(String));
  const targets = (deletedCustomers || []).filter(c => idSet.has(String(c.id)));
  if(!targets.length) return;

  deletedCustomers = deletedCustomers.filter(c => !idSet.has(String(c.id)));
  deletedTransactions = deletedTransactions.filter(t => !idSet.has(String(t.customer_id)));
  try{
    for(const c of targets){
      if(window.offlineSupport?.offlineAwareDeleteCustomer){
        await offlineSupport.offlineAwareDeleteCustomer(c.id);
      }else{
        const uid = await currentUserIdOrNull();
        const { error } = await supabaseClient.from("customers").delete().eq("id", c.id).eq("user_id", uid);
        if(error) throw error;
      }
    }
  }catch(err){
    await loadCustomers().catch(() => {}); await loadTransactions().catch(() => {});
    renderBin(); updateBinBadge();
    throw err;
  }
  await loadCustomers(); await loadTransactions();
  renderBin(); updateBinBadge();
  showBinToast(targets.length === 1 ? targets[0].name + " স্থায়ীভাবে মুছে গেছে" : binBn(targets.length) + " জন গ্রাহক স্থায়ীভাবে মুছে গেছে");
}

// ---------- অন্য পেজ খুললে বিন পেজ লুকানো; প্রোফাইল খুললে badge আপডেট ----------
["showHome","showCustomers","showTransactionHistory","showAddTransaction","openMyProfile","openProfileById","openReportPage","showLogin"]
  .forEach(name => {
    const original = window[name];
    if(typeof original !== "function") return;
    window[name] = function(...args){
      hideBinPage();
      const result = original.apply(this, args);
      if(name === "openMyProfile") updateBinBadge();
      return result;
    };
  });

document.addEventListener("DOMContentLoaded", () => { ensureBinUI(); updateBinBadge(); });
