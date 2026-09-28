// ==================================================
// CUSTOMER PROFILE / FILTER
// ==================================================

function openProfile(name){
  const c = (typeof findCustomerByName === "function") ? findCustomerByName(name) : null;
  if(typeof openProfileById === "function") openProfileById(c?.id || "", c?.name || name);
}

function renderProfile(){
  if(!currentCustomer) return;

  const list = document.getElementById("transactionList");
  const search = document.getElementById("transactionSearch").value.toLowerCase().trim();
  const from = document.getElementById("dateFrom").value;
  const to = document.getElementById("dateTo").value;

  let person = transactions.filter(t=>t.customer_name === currentCustomer);
  let balance = 0;

  person.forEach(t=>{
    balance += t.type === "receive" ? Number(t.amount) : -Number(t.amount);
  });

  document.getElementById("profileBalance").innerHTML =
    balance > 0
      ? `<span class="receive">মোট পাবো: ৳${balance}</span>`
      : balance < 0
        ? `<span class="pay">মোট দেবো: ৳${Math.abs(balance)}</span>`
        : "হিসাব সমান";

  person = person.filter(t=>{
    const searchMatch = !search ||
      String(t.amount).includes(search) ||
      (t.note || "").toLowerCase().includes(search);

    const fromMatch = !from || t.transaction_date >= from;
    const toMatch = !to || t.transaction_date <= to;

    return searchMatch && fromMatch && toMatch;
  });

  person.sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date));
  list.innerHTML = "";

  if(person.length === 0){
    list.innerHTML = `<div class="empty">কোনো লেনদেন পাওয়া যায়নি।</div>`;
    return;
  }

  person.forEach(t=>{
    list.innerHTML += `
      <div class="transaction">
        <div class="transaction-top">
          <div class="amount ${t.type === "receive" ? "receive" : "pay"}">
            ${t.type === "receive" ? "➕ পাবো" : "➖ দেবো"} ৳${Number(t.amount)}
          </div>
          <div>
            <button class="primary" onclick="editTransaction('${t.id}')">✏️ Edit</button>
            <button class="red" onclick="deleteTransaction('${t.id}')">🗑️ Delete</button>
          </div>
        </div>
        ${t.note ? `<div class="small">📝 ${escapeHTML(t.note)}</div>` : ""}
        <div class="small">📅 ${formatDate(t.transaction_date)}</div>
      </div>`;
  });
}

function clearFilters(){
  document.getElementById("transactionSearch").value = "";
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  renderProfile();
}
