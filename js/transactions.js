// ==================================================
// TRANSACTIONS: LOAD / ADD / EDIT / DELETE
// ==================================================

let profileTransactionType = "receive"; // receive = দিলাম, pay = পেলাম

async function loadTransactions(){
  // Offline-aware: নেট থাকলে সার্ভার থেকে, না থাকলে লোকাল ক্যাশ থেকে
  if (window.offlineSupport && typeof offlineSupport.loadTransactionsOfflineAware === "function") {
    await offlineSupport.loadTransactionsOfflineAware();
  } else {
    try {
      const {data,error}=await supabaseClient.from("transactions").select("*").order("transaction_date",{ascending:false});
      if(error){ alert("Database error: "+error.message); return; }
      transactions=data||[];
    } catch (e) {
      console.error("loadTransactions error", e);
    }
  }
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
  const {data:{session}}=await supabaseClient.auth.getSession();
  const user = session?.user || null;
  if(!user) return alert("আগে Login করুন।");
  if(!currentCustomer) return alert("Customer নির্বাচন করুন।");

  const amount = Number(document.getElementById("profileAmount").value);
  const date = document.getElementById("profileDate").value;
  const note = document.getElementById("profileNote").value.trim();

  if(!amount || amount <= 0) return alert("সঠিক amount দিন।");
  if(!date) return alert("তারিখ নির্বাচন করুন।");

  const customer = customers.find(c => String(c.id) === String(currentCustomerId)) || findCustomerByName(currentCustomer);
  if(!customer) return alert("Customer পাওয়া যায়নি।");

  const payload = {
    user_id:user.id,
    customer_id:customer.id,
    customer_name:customer.name,
    amount,
    type:profileTransactionType,
    transaction_date:date,
    note
  };

  let insertedTransaction;
  if (window.offlineSupport && typeof offlineSupport.offlineAwareInsertTransaction === "function") {
    insertedTransaction = await offlineSupport.offlineAwareInsertTransaction(payload);
  } else {
    const {data,error}=await supabaseClient.from("transactions").insert(payload).select().single();
    if(error){ alert("Save হয়নি: "+error.message); return; }
    insertedTransaction = data;
  }

  if(!insertedTransaction){ alert("Save হয়নি।"); return; }

  resetProfileTransactionForm();
  await loadTransactions();
  openProfileById(customer.id, customer.name);
  showTransactionSuccess(customer, insertedTransaction);
}

let newTransactionType = "receive";

function setNewTransactionType(type){
  if(type !== "receive" && type !== "pay") return;
  newTransactionType = type;

  const receiveBtn = document.getElementById("newReceiveBtn");
  const payBtn = document.getElementById("newPayBtn");
  if(receiveBtn) receiveBtn.classList.toggle("selected", type === "receive");
  if(payBtn) payBtn.classList.toggle("selected", type === "pay");

  const typeSelect = document.getElementById("type");
  if(typeSelect) typeSelect.value = type;
}

function updateNewCustomerPreview(){
  const input = document.getElementById("customerName");
  const avatar = document.getElementById("newCustomerAvatar");
  if(!input || !avatar) return;
  const name = input.value.trim();
  const initial = name
    ? name.split(/\s+/).map(x => x.charAt(0)).join("").slice(0,2).toUpperCase()
    : "C";
  avatar.textContent = initial;
}

function showAddTransactionMenu(){
  const menu = document.getElementById("newTransactionMenu");
  if(menu) menu.classList.toggle("hidden");
}

async function addTransaction(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  const user = session?.user || null;
  if(!user) return alert("আগে Login করুন।");

  const customerName=document.getElementById("customerName").value.trim();
  const customerPhone=document.getElementById("customerPhone")?.value.trim() || "";
  const amount=Number(document.getElementById("amount").value);
  const type=document.getElementById("type").value || newTransactionType;
  const date=document.getElementById("date").value;
  const note=document.getElementById("note").value.trim();
  if(!customerName) return alert("Customer-এর নাম দিন।");
  if(!amount || amount<=0) return alert("সঠিক amount দিন।");
  if(!date) return alert("তারিখ নির্বাচন করুন।");

  const customer=await getOrCreateCustomer(customerName,customerPhone);
  if(!customer) return alert("Customer save হয়নি। আবার চেষ্টা করুন।");

  const payload = {
    user_id:user.id, customer_id:customer.id, customer_name:customer.name,
    amount,type,transaction_date:date,note
  };

  let insertedTransaction;
  if (window.offlineSupport && typeof offlineSupport.offlineAwareInsertTransaction === "function") {
    insertedTransaction = await offlineSupport.offlineAwareInsertTransaction(payload);
  } else {
    const {data,error}=await supabaseClient.from("transactions").insert(payload).select().single();
    if(error){ alert("Save হয়নি: "+error.message); return; }
    insertedTransaction = data;
  }
  if(!insertedTransaction){ alert("Save হয়নি।"); return; }

  document.getElementById("customerName").value="";
  if(document.getElementById("customerPhone")) document.getElementById("customerPhone").value="";
  document.getElementById("amount").value="";
  document.getElementById("note").value="";
  setNewTransactionType("receive");
  updateNewCustomerPreview();
  await loadTransactions();
  showTransactionSuccess(customer, insertedTransaction);
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

  const updates = { amount, type, transaction_date: date, note };

  if (window.offlineSupport && typeof offlineSupport.offlineAwareUpdateTransaction === "function") {
    await offlineSupport.offlineAwareUpdateTransaction(id, updates);
  } else {
    const {error}=await supabaseClient.from("transactions").update(updates).eq("id",id);
    if(error){
      showMessage("transactionEditMessage","Update হয়নি: "+error.message,false);
      return;
    }
  }

  closeEditTransaction();
  await loadTransactions();
  openProfile(currentCustomer);
}

async function deleteTransaction(id){
  if(!confirm("এই লেনদেনটি delete করতে চান?")) return;

  if (window.offlineSupport && typeof offlineSupport.offlineAwareDeleteTransaction === "function") {
    await offlineSupport.offlineAwareDeleteTransaction(id);
  } else {
    const {error}=await supabaseClient.from("transactions").delete().eq("id",id);
    if(error){ alert("Delete হয়নি: "+error.message); return; }
  }

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

function formatSuccessDate(dateValue){
  if(!dateValue) return '';
  const d = new Date(dateValue + (String(dateValue).length === 10 ? 'T00:00:00' : ''));
  if(Number.isNaN(d.getTime())) return dateValue;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}

function showTransactionSuccess(customer, insertedTransaction){
  successShareCustomer = customer;
  const overlay = document.getElementById('transactionSuccessOverlay');
  if(!overlay) return;

  const person = transactions.filter(t => String(t.customer_id) === String(customer.id) || t.customer_name === customer.name);
  const current = insertedTransaction || person[0];
  const newType = current?.type || profileTransactionType;
  const newAmount = Number(current?.amount || 0);
  const initial = customer.name ? customer.name.trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase() : 'U';

  document.getElementById('successAvatar').textContent = initial;
  document.getElementById('successCustomerName').textContent = customer.name || '';
  document.getElementById('successAmount').textContent = '৳ ' + formatMoney(newAmount);
  document.getElementById('successTypeLabel').textContent = newType === 'receive' ? 'দিলাম' : 'পেলাম';
  document.getElementById('successTypeLabel').style.color = newType === 'receive' ? '#d53a42' : '#078b54';
  document.getElementById('successDate').textContent = formatSuccessDate(current?.transaction_date || current?.date);

  overlay.classList.remove('hidden');
  clearTimeout(transactionSuccessTimer);
  // Keep this screen open until the user chooses an action.
}

function closeTransactionSuccess(){
  clearTimeout(transactionSuccessTimer);
  const overlay = document.getElementById('transactionSuccessOverlay');
  if(overlay) overlay.classList.add('hidden');
}

function goToSuccessHome(){
  closeTransactionSuccess();
  showHome();
}

function goToSuccessHistory(){
  closeTransactionSuccess();
  if(successShareCustomer?.id){
    openProfileById(successShareCustomer.id, successShareCustomer.name);
  }else{
    showCustomers();
  }
  setTimeout(()=>{
    const history = document.getElementById('profileHistorySection');
    if(history && history.classList.contains('hidden')) toggleProfileHistory();
  },80);
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
