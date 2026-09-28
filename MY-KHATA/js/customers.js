// ==================================================
// CUSTOMERS: LIST / SEARCH / BALANCE
// ==================================================

function getCustomers(){
  const map = {};
  transactions.forEach(t=>{
    if(!map[t.customer_name]) map[t.customer_name] = [];
    map[t.customer_name].push(t);
  });
  return map;
}

function renderCustomers(){
  const list = document.getElementById("customerList");
  const search = document.getElementById("customerSearch").value.toLowerCase().trim();
  const customers = getCustomers();

  let names = Object.keys(customers).filter(n=>n.toLowerCase().includes(search));

  let receive = 0, pay = 0;
  transactions.forEach(t=>{
    if(t.type === "receive") receive += Number(t.amount);
    else pay += Number(t.amount);
  });

  document.getElementById("totalReceive").innerText = "৳ " + receive;
  document.getElementById("totalPay").innerText = "৳ " + pay;
  document.getElementById("customerCount").innerText = Object.keys(customers).length;

  list.innerHTML = "";

  if(names.length === 0){
    list.innerHTML = `<div class="empty">এখনো কোনো Customer নেই।</div>`;
    return;
  }

  names.forEach(name=>{
    let balance = 0;
    customers[name].forEach(t=>{
      if(t.type === "receive") balance += Number(t.amount);
      else balance -= Number(t.amount);
    });

    let balanceHTML = balance > 0
      ? `<span class="receive">পাবো: ৳${balance}</span>`
      : balance < 0
        ? `<span class="pay">দেবো: ৳${Math.abs(balance)}</span>`
        : "হিসাব সমান";

    list.innerHTML += `
      <div class="customer" onclick='openProfile(${JSON.stringify(name)})'>
        <div class="customer-top">
          <div>
            <div class="customer-name">👤 ${escapeHTML(name)}</div>
            <div class="small">${customers[name].length} টি লেনদেন</div>
          </div>
          <div>${balanceHTML}</div>
        </div>
      </div>`;
  });
}
