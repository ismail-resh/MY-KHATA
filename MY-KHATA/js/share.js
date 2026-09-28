// ==================================================
// SHARE: WHATSAPP / IMO / DEVICE SHARE
// ==================================================

function createShareMessage(){
  const list = transactions.filter(t=>t.customer_name === currentCustomer);
  let balance = 0;

  let message = "📒 হিসাবের আপডেট\n\n";
  message += "👤 নাম: " + currentCustomer + "\n\n";

  list.forEach(t=>{
    if(t.type === "receive"){
      balance += Number(t.amount);
      message += "➕ পাবো: ৳" + t.amount + "\n";
    }else{
      balance -= Number(t.amount);
      message += "➖ দেবো: ৳" + t.amount + "\n";
    }

    if(t.note) message += "📝 " + t.note + "\n";
    message += "📅 " + formatDate(t.transaction_date) + "\n\n";
  });

  message += "--------------------\n";

  if(balance > 0) message += "💰 মোট পাবো: ৳" + balance;
  else if(balance < 0) message += "💸 মোট দেবো: ৳" + Math.abs(balance);
  else message += "✅ হিসাব সমান";

  return message;
}

function shareWhatsApp(){
  const message = createShareMessage();
  window.open("https://wa.me/?text=" + encodeURIComponent(message),"_blank");
}

async function shareOther(){
  const message = createShareMessage();

  if(navigator.share){
    try{
      await navigator.share({title:"হিসাবের আপডেট",text:message});
    }catch(e){}
  }else{
    await navigator.clipboard.writeText(message);
    alert("Message copy হয়েছে। এখন IMO-তে paste করুন।");
  }
}
