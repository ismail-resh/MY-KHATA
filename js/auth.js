// ==================================================
// AUTH: LOGIN / SIGNUP / PASSWORD RESET / LOGOUT
// ==================================================

function hideAuthPages(){
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("signupPage").classList.add("hidden");
  document.getElementById("forgotPage").classList.add("hidden");
}

function showLogin(){
  hideAuthPages();
  document.getElementById("loginPage").classList.remove("hidden");
}

function showSignup(){
  hideAuthPages();
  document.getElementById("signupPage").classList.remove("hidden");
}

function showForgotPassword(){
  hideAuthPages();
  document.getElementById("forgotPage").classList.remove("hidden");
}

async function login(){
  clearMessage("loginMessage");
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if(!email) return showMessage("loginMessage","Email দিন।",false);
  if(!password) return showMessage("loginMessage","Password দিন।",false);

  const { data, error } = await supabaseClient.auth.signInWithPassword({email,password});
  if(error){
    showMessage("loginMessage",translateAuthError(error.message),false);
    return;
  }
  await startApp(data.session);
}


async function guestLogin(){
  clearMessage("loginMessage");

  const guestButton = document.querySelector(".guest-btn");
  if(guestButton){
    guestButton.disabled = true;
    guestButton.textContent = "⏳ Guest mode চালু হচ্ছে...";
  }

  const { data, error } = await supabaseClient.auth.signInAnonymously();

  if(error){
    console.error("Guest login error:", error);
    showMessage(
      "loginMessage",
      "Guest mode চালু করা যায়নি। Supabase-এ Anonymous Sign-ins চালু আছে কি না দেখুন।",
      false
    );
    if(guestButton){
      guestButton.disabled = false;
      guestButton.textContent = "👤 Guest হিসেবে ব্যবহার করুন";
    }
    return;
  }

  await startApp(data.session);
}

async function signup(){
  clearMessage("signupMessage");
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const confirm = document.getElementById("signupConfirm").value;

  if(!email) return showMessage("signupMessage","Email দিন।",false);
  if(password.length < 6) return showMessage("signupMessage","Password কমপক্ষে ৬ অক্ষরের হতে হবে।",false);
  if(password !== confirm) return showMessage("signupMessage","দুইটি Password একই নয়।",false);

  const {data,error} = await supabaseClient.auth.signUp({
    email,
    password,
    options:{emailRedirectTo:"https://ismail-resh.github.io/MY-KHATA/"}
  });

  if(error){
    showMessage("signupMessage",translateAuthError(error.message),false);
    return;
  }

  if(data.session){
    showMessage("signupMessage","✅ Account তৈরি হয়েছে!",true);
    setTimeout(() => startApp(data.session),300);
  }else{
    showMessage("signupMessage","✅ Account তৈরি হয়েছে। আপনার email inbox-এ verification link পাঠানো হয়েছে। Email verify করে তারপর Login করুন।",true);
  }
}

async function resetPassword(){
  clearMessage("forgotMessage");
  const email = document.getElementById("forgotEmail").value.trim();
  if(!email) return showMessage("forgotMessage","Email দিন।",false);

  const {error} = await supabaseClient.auth.resetPasswordForEmail(email,{
    redirectTo:"https://ismail-resh.github.io/MY-KHATA/"
  });

  if(error){
    showMessage("forgotMessage",translateAuthError(error.message),false);
    return;
  }

  showMessage("forgotMessage","📧 Password reset link আপনার email-এ পাঠানো হয়েছে।",true);
}


// ==================================================
// GUEST -> PERMANENT ACCOUNT
// Keeps the SAME Supabase user id, so all guest
// customers and transactions stay attached to the account.
// ==================================================

function isGuestSession(session){
  return !!session?.user?.is_anonymous;
}

function openGuestUpgrade(){
  const modal = document.getElementById("guestUpgradeModal");
  if(!modal) return;
  modal.classList.remove("hidden");
  clearMessage("guestUpgradeMessage");
  const email = document.getElementById("guestUpgradeEmail");
  if(email) email.focus();
}

function closeGuestUpgrade(){
  const modal = document.getElementById("guestUpgradeModal");
  if(modal) modal.classList.add("hidden");
}

function showGuestUpgradeButton(show){
  const btn = document.getElementById("upgradeGuestBtn");
  if(btn) btn.classList.toggle("hidden", !show);
}

async function upgradeGuestAccount(){
  clearMessage("guestUpgradeMessage");

  const email = document.getElementById("guestUpgradeEmail")?.value.trim();
  const password = document.getElementById("guestUpgradePassword")?.value || "";
  const confirm = document.getElementById("guestUpgradeConfirm")?.value || "";
  const submit = document.getElementById("guestUpgradeSubmit");

  if(!email) return showMessage("guestUpgradeMessage","Email দিন।",false);
  if(password.length < 6) return showMessage("guestUpgradeMessage","Password কমপক্ষে ৬ অক্ষরের হতে হবে।",false);
  if(password !== confirm) return showMessage("guestUpgradeMessage","দুইটি Password একই নয়।",false);

  if(submit){
    submit.disabled = true;
    submit.textContent = "⏳ Account তৈরি হচ্ছে...";
  }

  try{
    const {data:{session}} = await supabaseClient.auth.getSession();

    if(!isGuestSession(session)){
      showMessage("guestUpgradeMessage","এই session আর Guest mode-এ নেই।",false);
      return;
    }

    // Mark the upgrade flow without storing the password.
    localStorage.setItem("mykhata_guest_upgrade_pending", "1");

    // Supabase keeps the same user ID when an anonymous user is upgraded.
    // With email confirmation enabled, password must be set after verification.
    const {data,error} = await supabaseClient.auth.updateUser({
      email,
      options:{
        emailRedirectTo:"https://ismail-resh.github.io/MY-KHATA/"
      }
    });

    if(error){
      localStorage.removeItem("mykhata_guest_upgrade_pending");
      showMessage("guestUpgradeMessage",translateAuthError(error.message),false);
      return;
    }

    const updatedUser = data?.user;

    // If email confirmation is disabled, we can set the password immediately.
    if(updatedUser?.email_confirmed_at){
      const {error:passwordError} = await supabaseClient.auth.updateUser({password});

      if(passwordError){
        showMessage("guestUpgradeMessage",translateAuthError(passwordError.message),false);
        return;
      }

      localStorage.removeItem("mykhata_guest_upgrade_pending");
      closeGuestUpgrade();
      showGuestUpgradeButton(false);
      const userEmailEl = document.getElementById("userEmail");
      if(userEmailEl) userEmailEl.innerText = email;
      alert("✅ Account তৈরি হয়েছে! আপনার আগের সব হিসাব ঠিক রাখা হয়েছে।");
      return;
    }

    closeGuestUpgrade();
    showMessage("loginMessage",`📧 ${email}-এ verification link পাঠানো হয়েছে। Email verify করার পর এই website-এ আবার ঢুকলে password সেট করার option আসবে। আপনার Guest-এর সব হিসাব একই থাকবে।`,true);
    showLogin();

  }catch(error){
    console.error("Guest upgrade error:",error);
    showMessage("guestUpgradeMessage","Account তৈরি করা যায়নি। আবার চেষ্টা করুন।",false);
  }finally{
    if(submit){
      submit.disabled = false;
      submit.textContent = "Account তৈরি করুন";
    }
  }
}

async function finishGuestUpgrade(){
  clearMessage("guestPasswordMessage");

  const password = document.getElementById("guestFinalPassword")?.value || "";
  const confirm = document.getElementById("guestFinalConfirm")?.value || "";
  const submit = document.getElementById("guestPasswordSubmit");

  if(password.length < 6) return showMessage("guestPasswordMessage","Password কমপক্ষে ৬ অক্ষরের হতে হবে।",false);
  if(password !== confirm) return showMessage("guestPasswordMessage","দুইটি Password একই নয়।",false);

  if(submit){
    submit.disabled = true;
    submit.textContent = "⏳ Password সেট হচ্ছে...";
  }

  try{
    const {data:{session}} = await supabaseClient.auth.getSession();
    if(!session?.user || session.user.is_anonymous){
      showMessage("guestPasswordMessage","Email verify করার পর এই browser-এই ফিরে আসুন।",false);
      return;
    }

    const {data,error} = await supabaseClient.auth.updateUser({password});
    if(error){
      showMessage("guestPasswordMessage",translateAuthError(error.message),false);
      return;
    }

    localStorage.removeItem("mykhata_guest_upgrade_pending");
    document.getElementById("guestPasswordModal")?.classList.add("hidden");
    showGuestUpgradeButton(false);

    const userEmailEl = document.getElementById("userEmail");
    if(userEmailEl) userEmailEl.innerText = data?.user?.email || "";

    alert("✅ Account তৈরি সম্পন্ন হয়েছে! আপনার আগের সব customer ও transaction একই account-এ রাখা হয়েছে।");
  }catch(error){
    console.error("Guest password setup error:",error);
    showMessage("guestPasswordMessage","Password সেট করা যায়নি। আবার চেষ্টা করুন।",false);
  }finally{
    if(submit){
      submit.disabled = false;
      submit.textContent = "Password সেট করুন";
    }
  }
}

async function checkPendingGuestUpgrade(session){
  if(!session?.user) return;

  const pending = localStorage.getItem("mykhata_guest_upgrade_pending");
  if(!pending) return;

  // Once email verification succeeds, Supabase no longer marks the user anonymous.
  if(!session.user.is_anonymous && session.user.email_confirmed_at){
    const modal = document.getElementById("guestPasswordModal");
    if(modal){
      modal.classList.remove("hidden");
      clearMessage("guestPasswordMessage");
      document.getElementById("guestFinalPassword")?.focus();
    }
  }
}

async function logout(){
  await supabaseClient.auth.signOut();
  transactions = [];
  currentCustomer = null;
  document.getElementById("app").classList.add("hidden");
  showLogin();
}
