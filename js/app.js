// ==================================================
// APP START / NAVIGATION / INITIALIZE
// ==================================================

function finishBoot(){
  const loader = document.getElementById("bootLoader");
  if(!loader) return;
  loader.classList.add("hide");
  setTimeout(() => loader.remove(), 200);
}

async function startApp(session = null){
  // Use the already-restored session when available. This avoids a second auth request.
  if(!session){
    const {data:{session:currentSession}} = await supabaseClient.auth.getSession();
    session = currentSession;
  }

  const user = session?.user;
  if(!user){
    document.getElementById("app").classList.add("hidden");
    showLogin();
    finishBoot();
    return;
  }

  hideAuthPages();
  document.getElementById("app").classList.remove("hidden");

  const userEmailEl = document.getElementById("userEmail");
  if(userEmailEl){

  if(user.is_anonymous){

    // Guest user
    userEmailEl.innerText = "👤 Guest Mode";

  }else{

    // Account user's saved name
    const userName =
      user.user_metadata?.full_name?.trim();

    if(userName){

      // নাম দেওয়া থাকলে নাম দেখাবে
      userEmailEl.innerText = userName;

    }else{

      // নাম না থাকলে email দেখাবে
      userEmailEl.innerText =
        user.email || "";

    }

  }

}
  if(typeof updateMyProfileUI === "function") updateMyProfileUI(user);
  if(typeof showGuestUpgradeButton === "function") showGuestUpgradeButton(!!user.is_anonymous);

  // Show the main UI immediately. Customer/transaction data can load just after it appears.
  try{
    await loadTransactions();
    // নেট থাকলে pending outbox সিঙ্ক করো
    if (window.offlineSupport && typeof offlineSupport.processOutbox === "function") {
      offlineSupport.processOutbox().catch(function(e){ console.warn("sync", e); });
    }
    showHome();
  }catch(error){
    console.error("Transaction load error:", error);
  }finally{
    finishBoot();
    if(typeof checkPendingGuestUpgrade === "function") {
      await checkPendingGuestUpgrade(session);
    }
  }
}

function showHome(){
    const header = document.getElementById("myProfileHeader");

        if (header) {
             header.style.removeProperty("display");
            header.classList.remove("hidden");}
    document.getElementById("app")?.classList.remove("inner-page");
    document.getElementById("myProfileHeader")?.classList.remove("hidden");
    document.getElementById("myProfilePage")?.classList.add("hidden");
    const bottomNav = document.querySelector(".bottom-nav");
    if(bottomNav) bottomNav.style.display = "grid";


    document
        .getElementById("homePage")
        ?.classList.remove("hidden");


    document
        .getElementById("customerPage")
        ?.classList.add("hidden");


    document
        .getElementById("addPage")
        ?.classList.add("hidden");


    document
        .getElementById("profilePage")
        ?.classList.add("hidden");

    document
        .getElementById("historyPage")
        ?.classList.add("hidden");

    document
        .getElementById("myProfilePage")
        ?.classList.add("hidden");


    currentCustomer = null;


    if(typeof renderHomeDashboard === "function"){

        renderHomeDashboard();

    }


    setActiveBottomNav("navHome");

}
function showCustomers(){
    document.getElementById("app")?.classList.add("inner-page");
    document.getElementById("myProfileHeader")?.classList.add("hidden");
    document.getElementById("myProfilePage")?.classList.add("hidden");

    const bottomNav = document.querySelector(".bottom-nav");
    if(bottomNav) bottomNav.style.display = "grid";

    document
        .getElementById("homePage")
        ?.classList.add("hidden");


    document
        .getElementById("customerPage")
        ?.classList.remove("hidden");


    document
        .getElementById("addPage")
        ?.classList.add("hidden");


    document
        .getElementById("profilePage")
        ?.classList.add("hidden");

    document
        .getElementById("historyPage")
        ?.classList.add("hidden");
    
    document
        .getElementById("myProfilePage")
        ?.classList.add("hidden");


    currentCustomer = null;


    renderCustomers();


    setActiveBottomNav("navCustomers");

}


let globalHistoryFilter = "all";

function showTransactionHistory(){
    document.getElementById("app")?.classList.add("inner-page");
    document.getElementById("myProfileHeader")?.classList.add("hidden");
    document.getElementById("myProfilePage")?.classList.add("hidden");
    document.getElementById("homePage")?.classList.add("hidden");
    document.getElementById("customerPage")?.classList.add("hidden");
    document.getElementById("addPage")?.classList.add("hidden");
    document.getElementById("profilePage")?.classList.add("hidden");
    document.getElementById("historyPage")?.classList.remove("hidden");
    document
        .getElementById("myProfilePage")
        ?.classList.add("hidden");

    const bottomNav = document.querySelector(".bottom-nav");
    if(bottomNav) bottomNav.style.display = "grid";

    currentCustomer = null;
    setActiveBottomNav("navTransaction");
    renderGlobalHistory();
}

function setGlobalHistoryFilter(filter, button){
    globalHistoryFilter = filter;
    document.querySelectorAll(".history-filter").forEach(btn=>{
        btn.classList.toggle("active", btn.dataset.historyFilter === filter);
    });
    renderGlobalHistory();
}

function renderGlobalHistory(){
    const list = document.getElementById("globalHistoryList");
    if(!list) return;

    const query = (document.getElementById("globalHistorySearch")?.value || "").trim().toLowerCase();
    const selectedDate = document.getElementById("globalHistoryDate")?.value || "";

    const filtered = (Array.isArray(transactions) ? transactions : []).filter(t=>{
        const typeMatch = globalHistoryFilter === "all" || t.type === globalHistoryFilter;
        const date = String(t.transaction_date || "");
        const dateMatch = !selectedDate || date === selectedDate;
        const searchText = [
            t.customer_name || "",
            t.note || "",
            String(t.amount ?? ""),
            t.type === "receive" ? "দিলাম" : "পেলাম"
        ].join(" ").toLowerCase();
        return typeMatch && dateMatch && (!query || searchText.includes(query));
    }).sort((a,b)=>{
        const dateCompare = String(b.transaction_date || "").localeCompare(String(a.transaction_date || ""));
        if(dateCompare !== 0) return dateCompare;
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });

    if(!filtered.length){
        list.innerHTML = '<div class="history-empty">কোনো লেনদেন পাওয়া যায়নি।</div>';
        return;
    }

    const groups = new Map();
    filtered.forEach(t=>{
        const date = String(t.transaction_date || "তারিখ নেই");
        if(!groups.has(date)) groups.set(date,[]);
        groups.get(date).push(t);
    });

    let output = "";
    groups.forEach((items,date)=>{
        let dateLabel = date;
        if(/^\d{4}-\d{2}-\d{2}$/.test(date)){
            const parts = date.split("-");
            const dt = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate()-1);
            const sameDay = (a,b)=>a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
            const formatted = dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
            if(sameDay(dt,today)) dateLabel = "আজ ("+formatted+")";
            else if(sameDay(dt,yesterday)) dateLabel = "গতকাল ("+formatted+")";
            else dateLabel = formatted;
        }

        output += '<section class="history-date-group"><h3 class="history-date-heading">'+escapeHTML(dateLabel)+'</h3>';
        items.forEach(t=>{
            const isReceive = t.type === "receive";
            const amount = formatMoney(Number(t.amount || 0));
            const customer = escapeHTML(t.customer_name || "অজানা গ্রাহক");
            const note = escapeHTML(t.note || (isReceive ? "টাকা লেনদেন" : "টাকা লেনদেন"));
            const createdAt = t.created_at ? new Date(t.created_at) : null;
            const timeLabel = createdAt && !Number.isNaN(createdAt.getTime())
                ? createdAt.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})
                : "";
            output += `
              <article class="global-history-card">
                <div class="history-card-icon ${isReceive ? "history-pay-icon" : "history-receive-icon"}">
                  <span>${isReceive ? "↑" : "↓"}</span>
                </div>
                <div class="history-card-main">
                  <div class="history-card-title ${isReceive ? "history-amount-pay" : "history-amount-receive"}">
                    <span>${isReceive ? "দিলাম" : "পেলাম"}</span>
                    <strong>৳ ${amount}</strong>
                  </div>
                  <div class="history-card-sub">${customer} · <span>${note}</span></div>
                </div>
                ${timeLabel ? `<time class="history-card-time">${timeLabel}</time>` : ""}
              </article>`;
        });
        output += '</section>';
    });
    list.innerHTML = output;
}

function showAddTransaction(){
    document.getElementById("app")?.classList.add("inner-page");
    document.getElementById("myProfileHeader")?.classList.add("hidden");
    document.getElementById("myProfilePage")?.classList.add("hidden");

    const bottomNav = document.querySelector(".bottom-nav");
    if(bottomNav) bottomNav.style.display = "grid";

    document
        .getElementById("homePage")
        ?.classList.add("hidden");


    document
        .getElementById("customerPage")
        ?.classList.add("hidden");


    document
        .getElementById("profilePage")
        ?.classList.add("hidden");

    document
        .getElementById("historyPage")
        ?.classList.add("hidden");


    document
        .getElementById("addPage")
        ?.classList.remove("hidden");
    document
        .getElementById("myProfilePage")
        ?.classList.add("hidden");


    const dateEl = document.getElementById("date");
    if(dateEl) dateEl.value = localDateString();

    const typeEl = document.getElementById("type");
    if(typeEl) typeEl.value = "receive";
    if(typeof setNewTransactionType === "function") setNewTransactionType("receive");
    if(typeof updateNewCustomerPreview === "function") updateNewCustomerPreview();
    const menu = document.getElementById("newTransactionMenu");
    if(menu) menu.classList.add("hidden");

    setActiveBottomNav("navTransaction");

}

async function init(){
  try{
    const {data:{session}} = await supabaseClient.auth.getSession();
    if(session){
      await startApp(session);
    }else{
      showLogin();
      finishBoot();
    }
  }catch(error){
    console.error("Startup error:", error);
    showLogin();
    finishBoot();
  }
}

init();

function setActiveBottomNav(activeId){

    document
        .querySelectorAll(".bottom-nav-item")
        .forEach(item => {

            item.classList.remove("active");

        });


    const active =
        document.getElementById(activeId);


    if(active){

        active.classList.add("active");

    }

}
