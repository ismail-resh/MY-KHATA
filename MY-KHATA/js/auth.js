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

  const { error } = await supabaseClient.auth.signInWithPassword({email,password});
  if(error){
    showMessage("loginMessage",translateAuthError(error.message),false);
    return;
  }
  await startApp();
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
    setTimeout(startApp,800);
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

async function logout(){
  await supabaseClient.auth.signOut();
  transactions = [];
  currentCustomer = null;
  document.getElementById("app").classList.add("hidden");
  showLogin();
}
