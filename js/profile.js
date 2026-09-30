// ==================================================
// CUSTOMER PROFILE / LEDGER / FILTER
// ==================================================

function openProfile(name){
  const c = (typeof findCustomerByName === "function") ? findCustomerByName(name) : null;
  if(typeof openProfileById === "function") openProfileById(c?.id || "", c?.name || name);
}

function getLedgerBalance(t){
  return t.type === "receive" ? Number(t.amount) : -Number(t.amount);
}

function ledgerLabel(type){
  return type === "receive" ? "দিলাম" : "পেলাম";
}

function renderProfile(){
  if(!currentCustomer) return;

  const list = document.getElementById("transactionList");
  const search = document.getElementById("transactionSearch").value.toLowerCase().trim();
  const from = document.getElementById("dateFrom").value;
  const to = document.getElementById("dateTo").value;

  // IMPORTANT: Balance is always calculated from ALL transactions.
  // Search/date filters only hide rows; they never change the customer's real balance.
  const allPerson = transactions
    .filter(t => t.customer_name === currentCustomer)
    .map((t, index) => ({...t, __index:index}));

  // Build a running balance in chronological order.
  const chronological = [...allPerson].sort((a,b)=>{
    const dateCompare = String(a.transaction_date || "").localeCompare(String(b.transaction_date || ""));
    if(dateCompare !== 0) return dateCompare;

    // If the database has created_at, use it for same-day ordering.
    const createdA = a.created_at || "";
    const createdB = b.created_at || "";
    const createdCompare = String(createdA).localeCompare(String(createdB));
    if(createdCompare !== 0) return createdCompare;

    return a.__index - b.__index;
  });

  let runningBalance = 0;
  const balanceAfter = {};
  chronological.forEach(t=>{
    runningBalance += getLedgerBalance(t);
    balanceAfter[String(t.id)] = runningBalance;
  });

  const profileBalance = document.getElementById("profileBalance");
  profileBalance.innerHTML = runningBalance > 0
    ? `<div class="balance-label">বর্তমান পাওনা</div><div class="balance-value receive">৳${formatMoney(runningBalance)}</div>`
    : runningBalance < 0
      ? `<div class="balance-label">বর্তমান দেনা</div><div class="balance-value pay">৳${formatMoney(Math.abs(runningBalance))}</div>`
      : `<div class="balance-label">বর্তমান হিসাব</div><div class="balance-value">৳0</div>`;

  let person = allPerson.filter(t=>{
    const searchMatch = !search ||
      String(t.amount).includes(search) ||
      (t.note || "").toLowerCase().includes(search) ||
      ledgerLabel(t.type).includes(search);

    const fromMatch = !from || t.transaction_date >= from;
    const toMatch = !to || t.transaction_date <= to;
    return searchMatch && fromMatch && toMatch;
  });

  // Newest transaction first, like a khata.
  person.sort((a,b)=>{
    const dateCompare = String(b.transaction_date || "").localeCompare(String(a.transaction_date || ""));
    if(dateCompare !== 0) return dateCompare;
    return b.__index - a.__index;
  });

  list.innerHTML = "";

  if(person.length === 0){
    list.innerHTML = `<div class="empty">কোনো লেনদেন পাওয়া যায়নি।</div>`;
    return;
  }

  person.forEach(t=>{
    const amount = Number(t.amount);
    const after = Number(balanceAfter[String(t.id)] || 0);
    const afterText = after > 0
      ? `পাবো ৳${formatMoney(after)}`
      : after < 0
        ? `দেবো ৳${formatMoney(Math.abs(after))}`
        : "হিসাব সমান";

    list.innerHTML += `
      <div class="transaction">
        <div class="transaction-top">
          <div>
            <div class="amount ${t.type === "receive" ? "receive" : "pay"}">
              ${t.type === "receive" ? "↑" : "↓"} ${ledgerLabel(t.type)} ৳${formatMoney(amount)}
            </div>
            <div class="small">📅 ${formatDate(t.transaction_date)}</div>
          </div>
          <div class="transaction-actions">
            <button class="primary" onclick="editTransaction('${t.id}')">✏️ Edit</button>
            <button class="red" onclick="deleteTransaction('${t.id}')">🗑️ Delete</button>
          </div>
        </div>
        ${t.note ? `<div class="small">📝 ${escapeHTML(t.note)}</div>` : ""}
        <div class="running-balance ${after > 0 ? "receive" : after < 0 ? "pay" : ""}">
          লেনদেনের পর: ${afterText}
        </div>
      </div>`;
  });
}

function clearFilters(){
  document.getElementById("transactionSearch").value = "";
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  renderProfile();
}
