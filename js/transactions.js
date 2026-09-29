// ==================================================
// TRANSACTIONS: LOAD / ADD / EDIT / DELETE
// ==================================================

let profileTransactionType = "receive"; // receive = দিলাম, pay = পেলাম

async function loadTransactions(){
  const {data,error}=await supabaseClient.from("transactions").select("*").order("transaction_date",{ascending:false});
  if(error){ alert("Database error: "+error.message); return; }
  transactions=data||[];
  await renderCustomers();
}

function setProfileTransactionType(type){
  if(type !== "receive" && type !== "pay") return;
  profileTransactionType = type;

  const dilam = document.getElementById("profileDilamBtn");
  const pelam = document.getElementById("profilePelamBtn");
  if(dilam) dilam.classList.toggle("selected", type === "receive");
  if(pelam) pelam.classList.toggle("selected", type === "pay");
}

function resetProfileTransactionForm(){
  const amount = document.getElementById("profileAmount");
  const date = document.getElementById("profileDate");
  const note = document.getElementById("profileNote");
  if(amount) amount.value = "";
  if(date) date.value = new Date().toISOString().split("T")[0];
  if(note) note.value = "";
  setProfileTransactionType("receive");
}

async function addProfileTransaction(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user) return alert("আগে Login করুন।");
  if(!currentCustomer) return alert("Customer নির্বাচন করুন।");

  const amount = Number(document.getElementById("profileAmount").value);
  const date = document.getElementById("profileDate").value;
  const note = document.getElementById("profileNote").value.trim();

  if(!amount || amount <= 0) return alert("সঠিক amount দিন।");
  if(!date) return alert("তারিখ নির্বাচন করুন।");

  const customer = customers.find(c => String(c.id) === String(currentCustomerId)) || findCustomerByName(currentCustomer);
  if(!customer) return alert("Customer পাওয়া যায়নি।");

  const {data:insertedTransaction,error}=await supabaseClient.from("transactions").insert({
    user_id:user.id,
    customer_id:customer.id,
    customer_name:customer.name,
    amount,
    type:profileTransactionType,
    transaction_date:date,
    note
  }).select().single();

  if(error){ alert("Save হয়নি: "+error.message); return; }

  resetProfileTransactionForm();
  await loadTransactions();
  openProfileById(customer.id, customer.name);
  showTransactionSuccess(customer, insertedTransaction);
}

async function addTransaction(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user) return alert("আগে Login করুন।");

  const customerName=document.getElementById("customerName").value.trim();
  const customerPhone=document.getElementById("customerPhone")?.value.trim() || "";
  const amount=Number(document.getElementById("amount").value);
  const type=document.getElementById("type").value;
  const date=document.getElementById("date").value;
  const note=document.getElementById("note").value.trim();
  if(!customerName) return alert("Customer-এর নাম দিন।");
  if(!amount || amount<=0) return alert("সঠিক amount দিন।");
  if(!date) return alert("তারিখ নির্বাচন করুন।");

  const customer=await getOrCreateCustomer(customerName,customerPhone);
  if(!customer) return alert("Customer save হয়নি। আবার চেষ্টা করুন।");

  const {error}=await supabaseClient.from("transactions").insert({
    user_id:user.id, customer_id:customer.id, customer_name:customer.name,
    amount,type,transaction_date:date,note
  });
  if(error){ alert("Save হয়নি: "+error.message); return; }

  document.getElementById("customerName").value="";
  if(document.getElementById("customerPhone")) document.getElementById("customerPhone").value="";
  document.getElementById("amount").value="";
  document.getElementById("note").value="";
  await loadTransactions(); showCustomers();
}

function editTransaction(id){
  const t=transactions.find(x=>String(x.id)===String(id));
  if(!t) return;

  document.getElementById("editTransactionId").value = t.id;
  document.getElementById("editAmount").value = t.amount;
  document.getElementById("editType").value = t.type;
  document.getElementById("editDate").value = t.transaction_date || "";
  document.getElementById("editNote").value = t.note || "";
  clearMessage("transactionEditMessage");
  document.getElementById("editTransactionModal").classList.remove("hidden");
}

function closeEditTransaction(){
  document.getElementById("editTransactionModal").classList.add("hidden");
  clearMessage("transactionEditMessage");
}

async function saveTransactionEdit(){
  const id=document.getElementById("editTransactionId").value;
  const amount=Number(document.getElementById("editAmount").value);
  const type=document.getElementById("editType").value;
  const date=document.getElementById("editDate").value;
  const note=document.getElementById("editNote").value.trim();

  if(!id) return showMessage("transactionEditMessage","Transaction ID পাওয়া যায়নি।",false);
  if(!amount || amount<=0) return showMessage("transactionEditMessage","সঠিক amount দিন।",false);
  if(type!=="receive" && type!=="pay") return showMessage("transactionEditMessage","সঠিক লেনদেনের ধরন নির্বাচন করুন।",false);
  if(!date) return showMessage("transactionEditMessage","তারিখ দিন।",false);

  const {error}=await supabaseClient.from("transactions").update({
    amount,
    type,
    transaction_date:date,
    note
  }).eq("id",id);

  if(error){
    showMessage("transactionEditMessage","Update হয়নি: "+error.message,false);
    return;
  }

  closeEditTransaction();
  await loadTransactions();
  openProfile(currentCustomer);
}

async function deleteTransaction(id){
  if(!confirm("এই লেনদেনটি delete করতে চান?")) return;
  const {error}=await supabaseClient.from("transactions").delete().eq("id",id);
  if(error){ alert("Delete হয়নি: "+error.message); return; }
  await loadTransactions(); openProfile(currentCustomer);
}

document.addEventListener("click",e=>{
  const modal=document.getElementById("editTransactionModal");
  if(e.target===modal) closeEditTransaction();
});

// ==================================================
// TRANSACTION SUCCESS SCREEN
// ==================================================
let transactionSuccessTimer = null;
let successShareCustomer = null;

function showTransactionSuccess(customer, insertedTransaction){
  successShareCustomer = customer;
  const overlay = document.getElementById('transactionSuccessOverlay');
  if(!overlay) return;

  const person = transactions.filter(t => String(t.customer_id) === String(customer.id) || t.customer_name === customer.name);
  const current = insertedTransaction || person.find(t => String(t.id) === String(insertedTransaction?.id));
  const newType = current?.type || profileTransactionType;
  const newAmount = Number(current?.amount || 0);

  // Calculate balance before the newly-added transaction.
  let previous = 0;
  person.forEach(t => {
    if(current && String(t.id) === String(current.id)) return;
    previous += t.type === 'receive' ? Number(t.amount) : -Number(t.amount);
  });

  let currentBalance = previous + (newType === 'receive' ? newAmount : -newAmount);
  const initial = customer.name ? customer.name.trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase() : 'IS';

  document.getElementById('successAvatar').textContent = initial;
  document.getElementById('successCustomerName').textContent = customer.name || '';
  document.getElementById('successCustomerPhone').textContent = customer.phone || '';
  document.getElementById('successPrevious').textContent = '৳' + formatMoney(Math.abs(previous));
  document.getElementById('successTypeLabel').textContent = newType === 'receive' ? 'দিলাম' : 'পেলাম';
  document.getElementById('successAmount').textContent = newType === 'receive' ? '৳' + formatMoney(newAmount) : '৳0.00';
  document.getElementById('successPaid').textContent = newType === 'pay' ? '৳' + formatMoney(newAmount) : '৳0.00';
  document.getElementById('successCurrentLabel').textContent = currentBalance < 0 ? 'বর্তমান দেনা' : currentBalance > 0 ? 'বর্তমান পাওনা' : 'বর্তমান হিসাব';
  document.getElementById('successCurrent').textContent = '৳' + formatMoney(Math.abs(currentBalance));

  overlay.classList.remove('hidden');
  clearTimeout(transactionSuccessTimer);
  transactionSuccessTimer = setTimeout(() => closeTransactionSuccess(), 4500);
}

function closeTransactionSuccess(){
  clearTimeout(transactionSuccessTimer);
  const overlay = document.getElementById('transactionSuccessOverlay');
  if(overlay) overlay.classList.add('hidden');
  showCustomers();
}

function getSuccessShareText(){
  if(!successShareCustomer) return '';
  return createShareMessageForCustomer(successShareCustomer.name);
}

function shareSuccessWhatsApp(){
  clearTimeout(transactionSuccessTimer);
  const text = getSuccessShareText();
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

async function shareSuccessOther(){
  clearTimeout(transactionSuccessTimer);
  const text = getSuccessShareText();
  if(navigator.share){
    try{ await navigator.share({title:'লেনদেনের আপডেট', text}); }catch(e){}
  }else if(navigator.clipboard){
    await navigator.clipboard.writeText(text);
    alert('Message copy হয়েছে। এখন যেকোনো মেসেজিং অ্যাপে paste করুন।');
  }
}

function shareSuccessSMS(){
  clearTimeout(transactionSuccessTimer);
  const text = getSuccessShareText();
  window.location.href = 'sms:?body=' + encodeURIComponent(text);
}

function shareSuccessMessenger(){
  clearTimeout(transactionSuccessTimer);
  const text = getSuccessShareText();
  if(navigator.share){
    navigator.share({title:'লেনদেনের আপডেট', text}).catch(()=>{});
  }else{
    alert('আপনার ফোনের Share অপশন থেকে Messenger নির্বাচন করুন।');
  }
}
