// ==================================================
// CUSTOMERS: LIST / PROFILE / EDIT / DELETE
// ==================================================

let customers = [];
let currentCustomerId = null;

async function loadCustomers(){
  // Offline-aware: নেট থাকলে সার্ভার থেকে, না থাকলে লোকাল ক্যাশ থেকে
  if (window.offlineSupport && typeof offlineSupport.loadCustomersOfflineAware === "function") {
    await offlineSupport.loadCustomersOfflineAware();
    return;
  }
  try {
    const {data,error} = await supabaseClient
      .from("customers")
      .select("*")
      .order("name",{ascending:true});
    if(error){ console.error("Customer load error:",error); return; }
    customers = data || [];
  } catch (e) {
    console.error("Customer load error:", e);
  }
}

function findCustomerByName(name){
  return customers.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
}

function getCustomerTransactions(name){
  return transactions.filter(t => t.customer_name === name);
}

async function renderCustomers(){
  const list = document.getElementById("customerList");
  if(!list) return;
  await loadCustomers();

  const search = document.getElementById("customerSearch")?.value.toLowerCase().trim() || "";
  const map = {};
  customers.forEach(c => { map[c.name] = c; });
  transactions.forEach(t => {
    if(t.customer_name && !map[t.customer_name]) map[t.customer_name] = {id:null,name:t.customer_name,phone:""};
  });

  let names = Object.keys(map).filter(n => n.toLowerCase().includes(search));

  // Dashboard total: প্রতিটি customer-এর NET balance হিসাব করা হবে
let totalReceive = 0;
let totalPay = 0;

// Customer অনুযায়ী transaction আলাদা করা
const customerBalances = {};

transactions.forEach(t => {
  const customerName = (t.customer_name || "").trim();

  if (!customerName) return;

  if (!customerBalances[customerName]) {
    customerBalances[customerName] = 0;
  }

  const amount = Number(t.amount) || 0;

  if (t.type === "receive") {
    // দিলাম → customer-এর কাছে আমাদের পাওনা বাড়বে
    customerBalances[customerName] += amount;
  } 
  else if (t.type === "pay") {
    // পেলাম → customer-এর কাছে আমাদের পাওনা কমবে
    customerBalances[customerName] -= amount;
  }
});

// সব customer-এর NET balance থেকে Dashboard total তৈরি
Object.values(customerBalances).forEach(balance => {

  if (balance > 0) {
    // Customer-এর কাছে আমরা পাবো
    totalReceive += balance;
  } 
  else if (balance < 0) {
    // Customer-এর কাছে আমাদের দিতে হবে
    totalPay += Math.abs(balance);
  }

});

// Dashboard-এ দেখানো
const oldTotalReceive = document.getElementById("totalReceive");
  if(oldTotalReceive){
    oldTotalReceive.innerText = "৳ " + formatMoney(totalReceive);
  }

  const oldTotalPay = document.getElementById("totalPay");
  if(oldTotalPay){
    oldTotalPay.innerText = "৳ " + formatMoney(totalPay);
  }

  const oldCustomerCount = document.getElementById("customerCount");
  if(oldCustomerCount){
    oldCustomerCount.innerText = names.length;
  }

  list.innerHTML="";
  if(names.length===0){ list.innerHTML='<div class="empty">এখনো কোনো Customer নেই।</div>'; return; }

  names.forEach(name=>{
    const customer=map[name];
    const ct=getCustomerTransactions(name);
    let balance=0;
    ct.forEach(t=> balance += t.type === "receive" ? Number(t.amount) : -Number(t.amount));
    const balanceHTML = balance>0
      ? `<span class="receive">পাবো: ৳${formatMoney(balance)}</span>`
      : balance<0
        ? `<span class="pay">দেবো: ৳${formatMoney(Math.abs(balance))}</span>`
        : `<span>হিসাব সমান</span>`;
    const phoneHTML = customer.phone
      ? `<div class="customer-phone">${escapeHTML(customer.phone)}</div>`
      : `<div class="customer-phone empty-phone">মোবাইল নম্বর দেওয়া নেই</div>`;

    list.innerHTML += `
      <div class="customer" onclick='openProfileById(${JSON.stringify(customer.id||"")},${JSON.stringify(name)})'>
        <div class="customer-top">
          <div>
            <div class="customer-name">${escapeHTML(name)}</div>
            ${phoneHTML}
            <div class="small">${ct.length} টি লেনদেন</div>
          </div>
          <div class="customer-balance">${balanceHTML}</div>
        </div>
      </div>`;
  });
}

function openProfileById(customerId,customerName){
  // Customer profile is an inner page: hide the shared Home header completely.
  document.getElementById("app")?.classList.add("inner-page");
  document.getElementById("myProfileHeader")?.classList.add("hidden");

  document
    .getElementById("homePage")
    ?.classList.add("hidden");

  currentCustomerId = customerId || null;
  currentCustomer = customerName;

  document.getElementById("customerPage")?.classList.add("hidden");
  document.getElementById("addPage")?.classList.add("hidden");
  document.getElementById("profilePage")?.classList.remove("hidden");

  const c = customers.find(x => String(x.id) === String(customerId));

  const nameEl = document.getElementById("profileName");
  const phoneEl = document.getElementById("profilePhone");
  if(nameEl) nameEl.innerText = customerName || "Customer";
  if(phoneEl) phoneEl.innerText = c?.phone || "মোবাইল নম্বর দেওয়া নেই";

  const avatarEl = document.getElementById("profileCustomerAvatar");
  if(avatarEl){
    const clean = String(customerName || "C").trim();
    avatarEl.textContent = clean
      .split(/\s+/)
      .map(word => word.charAt(0))
      .join("")
      .slice(0,2)
      .toUpperCase();
  }

  const searchEl = document.getElementById("transactionSearch");
  const fromEl = document.getElementById("dateFrom");
  const toEl = document.getElementById("dateTo");
  if(searchEl) searchEl.value = "";
  if(fromEl) fromEl.value = "";
  if(toEl) toEl.value = "";

  const history = document.getElementById("profileHistorySection");
  if(history) history.classList.remove("hidden");
  document.querySelector(".profile-filter-more")?.removeAttribute("open");

  const menu = document.getElementById("profileActionMenu");
  if(menu) menu.classList.add("hidden");

  if(typeof resetProfileTransactionForm === "function") resetProfileTransactionForm();

  const form = document.getElementById("profileLedgerForm");
  if(form) form.classList.add("hidden");

  const bottomNav = document.querySelector(".bottom-nav");
  if(bottomNav) bottomNav.style.display = "none";

  renderProfile();
}

function openProfile(name){
  const c=findCustomerByName(name);
  openProfileById(c?.id||"",c?.name||name);
}

function showEditCustomer(){
  const c=customers.find(x=>String(x.id)===String(currentCustomerId)) || findCustomerByName(currentCustomer||"");
  if(!c){ alert("Customer পাওয়া যায়নি।"); return; }
  currentCustomerId=c.id;
  document.getElementById("editCustomerName").value=c.name||"";
  document.getElementById("editCustomerPhone").value=c.phone||"";
  clearMessage("customerEditMessage");
  document.getElementById("editCustomerModal").classList.remove("hidden");
}

function closeEditCustomer(){
  document.getElementById("editCustomerModal").classList.add("hidden");
  clearMessage("customerEditMessage");
}

async function saveCustomerEdit(){
  if(!currentCustomerId) return showMessage("customerEditMessage","Customer ID পাওয়া যায়নি।",false);
  const newName=document.getElementById("editCustomerName").value.trim();
  const newPhone=document.getElementById("editCustomerPhone").value.trim();
  if(!newName) return showMessage("customerEditMessage","Customer-এর নাম দিন।",false);
  const duplicate=customers.find(c=>c.id!==currentCustomerId && c.name.trim().toLowerCase()===newName.toLowerCase());
  if(duplicate) return showMessage("customerEditMessage","এই নামে আরেকটি Customer আছে।",false);

  if (window.offlineSupport && typeof offlineSupport.offlineAwareUpdateCustomer === "function") {
    await offlineSupport.offlineAwareUpdateCustomer(currentCustomerId, { name: newName, phone: newPhone });
  } else {
    const {error}=await supabaseClient.from("customers").update({name:newName,phone:newPhone,updated_at:new Date().toISOString()}).eq("id",currentCustomerId);
    if(error) return showMessage("customerEditMessage","Customer update হয়নি: "+error.message,false);
    const {error:txError}=await supabaseClient.from("transactions").update({customer_name:newName}).eq("customer_id",currentCustomerId);
    if(txError) console.warn("Transaction name update warning:",txError);
  }

  currentCustomer=newName;
  closeEditCustomer();
  await loadCustomers();
  await loadTransactions();
  openProfileById(currentCustomerId,newName);
}

async function deleteCustomer(){
  if(!currentCustomerId) return alert("Customer ID পাওয়া যায়নি।");
  const c=customers.find(x=>String(x.id)===String(currentCustomerId));
  const name=c?.name||currentCustomer;
  const count=transactions.filter(t=>t.customer_name===name).length;
  const msg=`Customer '${name}' delete করতে চান?\n\n${count} টি transaction-ও delete হবে।\n\nএই কাজটি undo করা যাবে না।`;
  if(!confirm(msg)) return;

  if (window.offlineSupport && typeof offlineSupport.offlineAwareDeleteCustomer === "function") {
    await offlineSupport.offlineAwareDeleteCustomer(currentCustomerId);
  } else {
    const {error}=await supabaseClient.from("customers").delete().eq("id",currentCustomerId);
    if(error) return alert("Customer delete হয়নি:\n"+error.message);
  }

  currentCustomer=null; currentCustomerId=null;
  await loadCustomers(); await loadTransactions(); showCustomers();
}

async function getOrCreateCustomer(name,phone=""){
  const cleanName=name.trim();
  if(!cleanName) return null;
  let c=findCustomerByName(cleanName);
  if(c){
    if(phone && !c.phone){
      if (window.offlineSupport && typeof offlineSupport.offlineAwareUpdateCustomer === "function") {
        await offlineSupport.offlineAwareUpdateCustomer(c.id, { phone });
        c.phone = phone;
      } else {
        const {error}=await supabaseClient.from("customers").update({phone,updated_at:new Date().toISOString()}).eq("id",c.id);
        if(!error) c.phone=phone;
      }
    }
    return c;
  }
  const {data:{session}}=await supabaseClient.auth.getSession();
  const user = session?.user || null;
  if(!user) return null;

  if (window.offlineSupport && typeof offlineSupport.offlineAwareInsertCustomer === "function") {
    return await offlineSupport.offlineAwareInsertCustomer({
      user_id: user.id,
      name: cleanName,
      phone: phone || ""
    });
  }

  const {data,error}=await supabaseClient.from("customers").insert({user_id:user.id,name:cleanName,phone:phone||""}).select().single();
  if(error){ console.error("Customer create error:",error); return null; }
  customers.push(data); return data;
}

function formatMoney(amount){ return Number(amount).toLocaleString("en-US"); }

document.addEventListener("click",e=>{
  const modal=document.getElementById("editCustomerModal");
  if(e.target===modal) closeEditCustomer();
});

/* =========================================================
   HOME DASHBOARD
   ========================================================= */

async function renderHomeDashboard() {

    const debtList =
        document.getElementById("homeDebtList");

    const receiveList =
        document.getElementById("homeReceiveList");

    if (!debtList || !receiveList) return;


    await loadCustomers();


    const balances = {};


    /*
       Customer অনুযায়ী NET balance তৈরি করছি
    */

    customers.forEach(customer => {

        balances[customer.name] = {
            customer: customer,
            balance: 0
        };

    });


    transactions.forEach(transaction => {

        const name =
            (transaction.customer_name || "").trim();

        if (!name) return;


        if (!balances[name]) {

            balances[name] = {

                customer: {
                    id: transaction.customer_id,
                    name: name,
                    phone: ""
                },

                balance: 0

            };

        }


        const amount =
            Number(transaction.amount) || 0;


        if (transaction.type === "receive") {

            /*
              দিলাম
              → আমাদের পাওনা বাড়বে
            */

            balances[name].balance += amount;

        }


        else if (transaction.type === "pay") {

            /*
              পেলাম
              → আমাদের পাওনা কমবে
            */

            balances[name].balance -= amount;

        }

    });


    const debtCustomers = [];
    const receiveCustomers = [];
    const zeroCustomers = [];


    Object.values(balances).forEach(item => {

        if (item.balance < 0) {

            debtCustomers.push(item);

        }

        else if (item.balance > 0) {

            receiveCustomers.push(item);

        }

        else {

            // Transaction 0 / হিসাব সমান হলেও customer-কে home page-এ রাখি।
            zeroCustomers.push(item);

        }

    });


    // মোট unique customer count (balance থাকুক বা ০ হোক)
    const homeCustomerCount = document.getElementById("homeCustomerCount");
    if (homeCustomerCount) {
        const totalCustomers = Object.keys(balances).length;
        homeCustomerCount.textContent = `${totalCustomers.toLocaleString("bn-BD")} জন`;
    }

    /*
       বড় amount আগে দেখাবে
    */

    debtCustomers.sort(
        (a,b) =>
            Math.abs(b.balance) -
            Math.abs(a.balance)
    );


    receiveCustomers.sort(
        (a,b) =>
            b.balance -
            a.balance
    );


    /*
       Total
    */

    const totalReceive =
        receiveCustomers.reduce(
            (sum,item) =>
                sum + item.balance,
            0
        );


    const totalPay =
        debtCustomers.reduce(
            (sum,item) =>
                sum + Math.abs(item.balance),
            0
        );


    const receiveTotalElement =
        document.getElementById(
            "homeTotalReceive"
        );


    const payTotalElement =
        document.getElementById(
            "homeTotalPay"
        );


    if (receiveTotalElement) {

        receiveTotalElement.innerText =
            "৳ " + formatMoney(totalReceive);

    }


    if (payTotalElement) {
        payTotalElement.innerText =
            "৳ " + formatMoney(totalPay);
    }

    /* Net balance card + tab counts (redesigned home) */
    const net = totalReceive - totalPay;
    const netAmountEl = document.getElementById("homeNetAmount");
    const netStatusEl = document.getElementById("homeNetStatus");
    if (netAmountEl) {
        netAmountEl.innerText = "৳ " + formatMoney(Math.abs(net));
        netAmountEl.classList.toggle("is-pay", net < 0);
        netAmountEl.classList.toggle("is-receive", net > 0);
    }
    if (netStatusEl) {
        netStatusEl.innerText = net < 0 ? "দেনা" : (net > 0 ? "পাওনা" : "হিসাব সমান");
        netStatusEl.classList.toggle("is-pay", net < 0);
        netStatusEl.classList.toggle("is-receive", net > 0);
    }
    const tabDebtCount = document.getElementById("tabDebtCount");
    const tabReceiveCount = document.getElementById("tabReceiveCount");
    if (tabDebtCount) tabDebtCount.textContent = debtCustomers.length;
    if (tabReceiveCount) tabReceiveCount.textContent = receiveCustomers.length;
    applyHomeTab();


    /*
       দেনা render
    */

    debtList.innerHTML = "";


    if (debtCustomers.length === 0) {

        debtList.innerHTML = `
            <div class="home-empty">
                কোনো দেনা নেই
            </div>
        `;

    }

    else {

        debtCustomers
            .forEach(item => {

                const customer =
                    item.customer;

                const name =
                    customer.name || "Customer";

                const initial =
                    getCustomerInitial(name);


                debtList.innerHTML += `

                    <div
                        class="home-customer"
                        onclick='openProfileById(
                            ${JSON.stringify(customer.id || "")},
                            ${JSON.stringify(name)}
                        )'
                    >

                        <div class="home-customer-left">

                            <div class="home-customer-avatar">
                                ${initial}
                            </div>

                            <div class="home-customer-info">

                                <span class="home-customer-name">
                                    ${escapeHTML(name)}
                                </span>

                                <span class="home-customer-last">${lastActivityLabel(name)}</span>
<span class="home-customer-amount">
                                    ৳ ${formatMoney(
                                        Math.abs(item.balance)
                                    )}
                                </span>

                            </div>

                        </div>


                        <span class="home-customer-arrow">
                            ›
                        </span>

                    </div>

                `;

            });

    }


    /*
       পাওনা render
    */

    receiveList.innerHTML = "";


    if (receiveCustomers.length === 0) {

        receiveList.innerHTML = `
            <div class="home-empty">
                কোনো পাওনা নেই
            </div>
        `;

    }

    else {

        receiveCustomers
            .forEach(item => {

                const customer =
                    item.customer;

                const name =
                    customer.name || "Customer";

                const initial =
                    getCustomerInitial(name);


                receiveList.innerHTML += `

                    <div
                        class="home-customer"
                        onclick='openProfileById(
                            ${JSON.stringify(customer.id || "")},
                            ${JSON.stringify(name)}
                        )'
                    >

                        <div class="home-customer-left">

                            <div class="home-customer-avatar">
                                ${initial}
                            </div>

                            <div class="home-customer-info">

                                <span class="home-customer-name">
                                    ${escapeHTML(name)}
                                </span>

                                <span class="home-customer-last">${lastActivityLabel(name)}</span>
<span class="home-customer-amount">
                                    ৳ ${formatMoney(item.balance)}
                                </span>

                            </div>

                        </div>


                        <span class="home-customer-arrow">
                            ›
                        </span>

                    </div>

                `;

            });

    }


    /*
       Zero balance customers
       Transaction 0 হলেও customer যেন Home থেকে হারিয়ে না যায়।
    */

    const zeroSection = document.getElementById("homeZeroSection");
    const zeroList = document.getElementById("homeZeroList");

    if (zeroSection && zeroList) {
        zeroList.innerHTML = "";

        if (zeroCustomers.length === 0) {
            zeroSection.classList.add("hidden");
        } else {
            zeroSection.classList.remove("hidden");

            zeroCustomers
                .sort((a,b) => String(a.customer?.name || "").localeCompare(String(b.customer?.name || "")))
                .forEach(item => {
                    const customer = item.customer || {};
                    const name = customer.name || "Customer";
                    const initial = getCustomerInitial(name);

                    zeroList.innerHTML += `
                        <div
                            class="home-customer zero-customer"
                            onclick='openProfileById(
                                ${JSON.stringify(customer.id || "")},
                                ${JSON.stringify(name)}
                            )'
                        >
                            <div class="home-customer-left">
                                <div class="home-customer-avatar zero-avatar">
                                    ${initial}
                                </div>
                                <div class="home-customer-info">
                                    <span class="home-customer-name">
                                        ${escapeHTML(name)}
                                    </span>
                                    <span class="home-customer-amount zero-amount">
                                        হিসাব সমান · ৳ 0
                                    </span>
                                </div>
                            </div>
                            <span class="home-customer-arrow">›</span>
                        </div>
                    `;
                });
        }
    }

}


/* Home dashboard search: customer name, phone, balance and transaction note */
function filterHomeCustomers() {
    const input = document.getElementById("homeCustomerSearch");
    const query = String(input?.value || "").trim().toLocaleLowerCase();
    const searchBox = input?.closest(".home-search-box");
    if (searchBox) searchBox.classList.toggle("has-value", Boolean(query));

    const rows = document.querySelectorAll(
        "#homeDebtList .home-customer, #homeReceiveList .home-customer, #homeZeroList .home-customer"
    );
    rows.forEach(row => {
        const name = row.querySelector(".home-customer-name")?.textContent?.trim() || "";
        const amount = row.querySelector(".home-customer-amount")?.textContent?.trim() || "";
        const customer = customers.find(c => String(c.name || "").trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        const phone = customer?.phone || "";
        const notes = transactions
            .filter(t => String(t.customer_name || "").trim().toLocaleLowerCase() === name.toLocaleLowerCase())
            .map(t => t.note || t.description || "")
            .join(" ");
        const searchable = `${name} ${phone} ${amount} ${notes} ${row.textContent || ""}`.toLocaleLowerCase();
        row.style.display = !query || searchable.includes(query) ? "" : "none";
    });
}

function clearHomeCustomerSearch() {
    const input = document.getElementById("homeCustomerSearch");
    if (!input) return;
    input.value = "";
    filterHomeCustomers();
    input.focus();
}


/* Customer initial */

function getCustomerInitial(name) {

    const text =
        String(name || "C").trim();

    if (!text) return "C";

    return text
        .split(/\s+/)
        .map(word => word.charAt(0))
        .join("")
        .slice(0,2)
        .toUpperCase();

}

/* ==================================================
   HOME: tabs (দেনা | পাওনা) + "last activity" label
   ================================================== */
function applyHomeTab() {
    let tab = "debt";
    try { tab = localStorage.getItem("mm_home_tab") || "debt"; } catch (e) {}
    if (tab !== "debt" && tab !== "receive") tab = "debt";
    const cols = document.getElementById("homeBalanceColumns");
    if (cols) cols.setAttribute("data-tab", tab);
    document.getElementById("tabDebt")?.classList.toggle("active", tab === "debt");
    document.getElementById("tabReceive")?.classList.toggle("active", tab === "receive");
    document.getElementById("tabDebt")?.setAttribute("aria-selected", tab === "debt");
    document.getElementById("tabReceive")?.setAttribute("aria-selected", tab === "receive");
}

function setHomeTab(tab) {
    try { localStorage.setItem("mm_home_tab", tab); } catch (e) {}
    applyHomeTab();
}

/* "সর্বশেষ: আজ / গতকাল / N দিন আগে" — customer-এর শেষ লেনদেন থেকে */
function lastActivityLabel(customerName) {
    try {
        const list = (typeof transactions !== "undefined" ? transactions : [])
            .filter(t => String(t.customer_name || "") === String(customerName || ""));
        if (!list.length) return "";
        let latest = 0;
        list.forEach(t => {
            const d = new Date(t.transaction_date || t.created_at || 0).getTime();
            if (d > latest) latest = d;
        });
        if (!latest) return "";
        const startOfDay = x => { const d = new Date(x); d.setHours(0,0,0,0); return d.getTime(); };
        const days = Math.max(0, Math.round((startOfDay(Date.now()) - startOfDay(latest)) / 86400000));
        let label;
        if (days === 0) label = "আজ";
        else if (days === 1) label = "গতকাল";
        else if (days < 7) label = days + " দিন আগে";
        else if (days < 30) label = Math.floor(days / 7) + " সপ্তাহ আগে";
        else if (days < 365) label = Math.floor(days / 30) + " মাস আগে";
        else label = Math.floor(days / 365) + " বছর আগে";
        return "সর্বশেষ: " + label;
    } catch (e) {
        return "";
    }
}

/* গ্রাহককে ফোন করা */
function callCustomer() {
    const c = (customers || []).find(x => String(x.id) === String(currentCustomerId))
        || (typeof findCustomerByName === "function" ? findCustomerByName(currentCustomer || "") : null);
    const phone = String(c?.phone || "").replace(/[^\d+]/g, "");
    if (!phone) { alert("মোবাইল নম্বর দেওয়া নেই"); return; }
    window.location.href = "tel:" + phone;
}
