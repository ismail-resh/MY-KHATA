// ==================================================
// APP START / NAVIGATION / INITIALIZE
// ==================================================

function finishBoot(){
  const loader = document.getElementById("bootLoader");
  if(!loader) return;
  loader.classList.add("hide");
  setTimeout(() => loader.remove(), 200);
}

async function startApp(session = null){
  // Use the already-restored session when available. This avoids a second auth request.
  if(!session){
    const {data:{session:currentSession}} = await supabaseClient.auth.getSession();
    session = currentSession;
  }

  const user = session?.user;
  if(!user){
    document.getElementById("app").classList.add("hidden");
    showLogin();
    finishBoot();
    return;
  }

  hideAuthPages();
  document.getElementById("app").classList.remove("hidden");

  const userEmailEl = document.getElementById("userEmail");
  if(userEmailEl){
    userEmailEl.innerText = user.is_anonymous ? "👤 Guest Mode" : (user.email || "");
  }
  if(typeof showGuestUpgradeButton === "function") showGuestUpgradeButton(!!user.is_anonymous);

  // Show the main UI immediately. Customer/transaction data can load just after it appears.
  try{
    await loadTransactions();
  }catch(error){
    console.error("Transaction load error:", error);
  }finally{
    finishBoot();
    if(typeof checkPendingGuestUpgrade === "function") {
      await checkPendingGuestUpgrade(session);
    }
  }
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
  try{
    const {data:{session}} = await supabaseClient.auth.getSession();
    if(session){
      await startApp(session);
    }else{
      showLogin();
      finishBoot();
    }
  }catch(error){
    console.error("Startup error:", error);
    showLogin();
    finishBoot();
  }
}

init();
