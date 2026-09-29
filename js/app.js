// ==================================================
// APP START / NAVIGATION / INITIALIZE
// ==================================================

async function startApp(){
  const {data:{user}} = await supabaseClient.auth.getUser();
  if(!user) return;

  hideAuthPages();
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userEmail").innerText = user.email;

  await loadTransactions();
}

function showCustomers(){
  document.getElementById("customerPage").classList.remove("hidden");
  document.getElementById("addPage").classList.add("hidden");
  document.getElementById("profilePage").classList.add("hidden");

  currentCustomer = null;
  renderCustomers();
}

function showAddTransaction(){
  document.getElementById("customerPage").classList.add("hidden");
  document.getElementById("profilePage").classList.add("hidden");
  document.getElementById("addPage").classList.remove("hidden");

  document.getElementById("date").value =
    new Date().toISOString().split("T")[0];
}

async function init(){
  const {data:{session}} = await supabaseClient.auth.getSession();
  if(session) await startApp();
}

init();
