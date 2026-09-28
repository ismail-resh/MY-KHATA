// ==================================================
// TRANSACTIONS: LOAD / ADD / EDIT / DELETE
// ==================================================

async function loadTransactions(){
  const {data,error}=await supabaseClient.from("transactions").select("*").order("transaction_date",{ascending:false});
  if(error){ alert("Database error: "+error.message); return; }
  transactions=data||[];
  await renderCustomers();
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

async function editTransaction(id){

  const t = transactions.find(
    x => String(x.id) === String(id)
  );

  if(!t){
    alert("লেনদেন পাওয়া যায়নি।");
    return;
  }


  document.getElementById("editTransactionId").value = t.id;

  document.getElementById("editAmount").value = t.amount;

  document.getElementById("editType").value = t.type;

  document.getElementById("editDate").value =
    t.transaction_date;

  document.getElementById("editNote").value =
    t.note || "";


  document
    .getElementById("transactionEditMessage")
    .className = "message";

  document
    .getElementById("transactionEditMessage")
    .innerText = "";


  document
    .getElementById("editTransactionModal")
    .classList.remove("hidden");

}


function closeEditTransaction(){

  document
    .getElementById("editTransactionModal")
    .classList.add("hidden");

}


async function saveTransactionEdit(){

  const id =
    document
      .getElementById("editTransactionId")
      .value;


  const amount =
    Number(
      document
        .getElementById("editAmount")
        .value
    );


  const type =
    document
      .getElementById("editType")
      .value;


  const date =
    document
      .getElementById("editDate")
      .value;


  const note =
    document
      .getElementById("editNote")
      .value
      .trim();


  const message =
    document
      .getElementById("transactionEditMessage");


  if(!amount || amount <= 0){

    message.innerText =
      "সঠিক Amount দিন।";

    message.className =
      "message error";

    return;

  }


  if(!date){

    message.innerText =
      "তারিখ নির্বাচন করুন।";

    message.className =
      "message error";

    return;

  }


  if(
    type !== "receive" &&
    type !== "pay"
  ){

    message.innerText =
      "লেনদেনের ধরন সঠিক নয়।";

    message.className =
      "message error";

    return;

  }


  const { error } =
    await supabaseClient
      .from("transactions")
      .update({

        amount: amount,

        type: type,

        transaction_date: date,

        note: note

      })
      .eq("id", id);


  if(error){

    message.innerText =
      "Update হয়নি: " +
      error.message;

    message.className =
      "message error";

    return;

  }


  message.innerText =
    "লেনদেন সফলভাবে পরিবর্তন হয়েছে।";

  message.className =
    "message success";


  await loadTransactions();


  setTimeout(() => {

    closeEditTransaction();

    openProfile(currentCustomer);

  }, 500);

}

async function deleteTransaction(id){
  if(!confirm("এই লেনদেনটি delete করতে চান?")) return;
  const {error}=await supabaseClient.from("transactions").delete().eq("id",id);
  if(error){ alert("Delete হয়নি: "+error.message); return; }
  await loadTransactions(); openProfile(currentCustomer);
}
