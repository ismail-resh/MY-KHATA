// ==================================================
// TRANSACTIONS: LOAD / ADD / EDIT / DELETE
// ==================================================

async function loadTransactions(){
  const {data,error} = await supabaseClient
    .from("transactions")
    .select("*")
    .order("transaction_date",{ascending:false});

  if(error){
    alert("Database error: " + error.message);
    return;
  }

  transactions = data || [];
  renderCustomers();
}

async function addTransaction(){
  const {data:{user}} = await supabaseClient.auth.getUser();
  if(!user) return alert("আগে Login করুন।");

  const customerName = document.getElementById("customerName").value.trim();
  const amount = Number(document.getElementById("amount").value);
  const type = document.getElementById("type").value;
  const date = document.getElementById("date").value;
  const note = document.getElementById("note").value.trim();

  if(!customerName) return alert("Customer-এর নাম দিন।");
  if(!amount || amount <= 0) return alert("সঠিক amount দিন।");
  if(!date) return alert("তারিখ নির্বাচন করুন।");

  const {error} = await supabaseClient.from("transactions").insert({
    user_id:user.id,
    customer_name:customerName,
    amount,
    type,
    transaction_date:date,
    note
  });

  if(error){
    alert("Save হয়নি: " + error.message);
    return;
  }

  document.getElementById("customerName").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";

  await loadTransactions();
  showCustomers();
}

async function editTransaction(id){
  const t = transactions.find(x=>String(x.id) === String(id));
  if(!t) return;

  const amount = prompt("Amount:",t.amount);
  if(amount === null) return;

  const type = prompt("receive = পাবো | pay = দেবো",t.type);
  if(type !== "receive" && type !== "pay"){
    alert("receive অথবা pay লিখুন");
    return;
  }

  const date = prompt("Date (YYYY-MM-DD):",t.transaction_date);
  if(!date) return;

  const note = prompt("Note:",t.note || "");

  const {error} = await supabaseClient.from("transactions")
    .update({amount:Number(amount),type,transaction_date:date,note:note || ""})
    .eq("id",id);

  if(error){
    alert("Update হয়নি: " + error.message);
    return;
  }

  await loadTransactions();
  openProfile(currentCustomer);
}

async function deleteTransaction(id){
  if(!confirm("এই লেনদেনটি delete করতে চান?")) return;

  const {error} = await supabaseClient.from("transactions")
    .delete()
    .eq("id",id);

  if(error){
    alert("Delete হয়নি: " + error.message);
    return;
  }

  await loadTransactions();
  openProfile(currentCustomer);
}
