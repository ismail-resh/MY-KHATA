// ==================================================
// CUSTOMERS: LIST / PROFILE / EDIT / DELETE
// ==================================================

let customers = [];
let currentCustomerId = null;

async function loadCustomers(){
  const {data,error} = await supabaseClient
    .from("customers")
    .select("*")
    .order("name",{ascending:true});
  if(error){ console.error("Customer load error:",error); return; }
  customers = data || [];
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
document.getElementById("totalReceive").innerText =
  "৳ " + formatMoney(totalReceive);

document.getElementById("totalPay").innerText =
  "৳ " + formatMoney(totalPay);
  document.getElementById("customerCount").innerText = names.length;

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
  currentCustomerId = customerId || null;
  currentCustomer = customerName;
  document.getElementById("customerPage").classList.add("hidden");
  document.getElementById("addPage").classList.add("hidden");
  document.getElementById("profilePage").classList.remove("hidden");
  document.getElementById("profileName").innerText = customerName;
  const c=customers.find(x=>String(x.id)===String(customerId));
  document.getElementById("profilePhone").innerText = c?.phone || "মোবাইল নম্বর দেওয়া নেই";
  document.getElementById("transactionSearch").value="";
  document.getElementById("dateFrom").value="";
  document.getElementById("dateTo").value="";
  if(typeof resetProfileTransactionForm === "function") resetProfileTransactionForm();
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

  const oldName=currentCustomer;
  const {error}=await supabaseClient.from("customers").update({name:newName,phone:newPhone,updated_at:new Date().toISOString()}).eq("id",currentCustomerId);
  if(error) return showMessage("customerEditMessage","Customer update হয়নি: "+error.message,false);

  const {error:txError}=await supabaseClient.from("transactions").update({customer_name:newName}).eq("customer_id",currentCustomerId);
  if(txError) console.warn("Transaction name update warning:",txError);

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
  const {error}=await supabaseClient.from("customers").delete().eq("id",currentCustomerId);
  if(error) return alert("Customer delete হয়নি:\n"+error.message);
  currentCustomer=null; currentCustomerId=null; customers=[];
  await loadCustomers(); await loadTransactions(); showCustomers();
}

async function getOrCreateCustomer(name,phone=""){
  const cleanName=name.trim();
  if(!cleanName) return null;
  let c=findCustomerByName(cleanName);
  if(c){
    if(phone && !c.phone){
      const {error}=await supabaseClient.from("customers").update({phone,updated_at:new Date().toISOString()}).eq("id",c.id);
      if(!error) c.phone=phone;
    }
    return c;
  }
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user) return null;
  const {data,error}=await supabaseClient.from("customers").insert({user_id:user.id,name:cleanName,phone:phone||""}).select().single();
  if(error){ console.error("Customer create error:",error); return null; }
  customers.push(data); return data;
}

function formatMoney(amount){ return Number(amount).toLocaleString("en-US"); }

document.addEventListener("click",e=>{
  const modal=document.getElementById("editCustomerModal");
  if(e.target===modal) closeEditCustomer();
});
