// ==================================================
// CUSTOMER PROFILE / LEDGER / FILTER
// ==================================================

function openProfile(name){
  const c = (typeof findCustomerByName === "function") ? findCustomerByName(name) : null;
  if(typeof openProfileById === "function") openProfileById(c?.id || "", c?.name || name);
}

function getLedgerBalance(t){
  return t.type === "receive" ? Number(t.amount) : -Number(t.amount);
}

function ledgerLabel(type){
  return type === "receive" ? "দিলাম" : "পেলাম";
}

function renderProfile(){
  if(!currentCustomer) return;

  const list = document.getElementById("transactionList");
  const search = (document.getElementById("transactionSearch")?.value || "").toLowerCase().trim();
  const from = document.getElementById("dateFrom")?.value || "";
  const to = document.getElementById("dateTo")?.value || "";

  // IMPORTANT: Balance is always calculated from ALL transactions.
  // Search/date filters only hide rows; they never change the customer's real balance.
  const allPerson = transactions
    .filter(t => t.customer_name === currentCustomer)
    .map((t, index) => ({...t, __index:index}));

  // Build a running balance in chronological order.
  const chronological = [...allPerson].sort((a,b)=>{
    const dateCompare = String(a.transaction_date || "").localeCompare(String(b.transaction_date || ""));
    if(dateCompare !== 0) return dateCompare;

    // If the database has created_at, use it for same-day ordering.
    const createdA = a.created_at || "";
    const createdB = b.created_at || "";
    const createdCompare = String(createdA).localeCompare(String(createdB));
    if(createdCompare !== 0) return createdCompare;

    return a.__index - b.__index;
  });

  let runningBalance = 0;
  const balanceAfter = {};
  chronological.forEach(t=>{
    runningBalance += getLedgerBalance(t);
    balanceAfter[String(t.id)] = runningBalance;
  });
  // Current balance is always calculated from ALL transactions.
  const totalDilam = allPerson
    .filter(t => t.type === "receive")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalPelam = allPerson
    .filter(t => t.type === "pay")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalDilamEl = document.getElementById("profileTotalDilam");
  const totalPelamEl = document.getElementById("profileTotalPelam");
  if(totalDilamEl) totalDilamEl.textContent = "৳ " + formatMoney(totalDilam);
  if(totalPelamEl) totalPelamEl.textContent = "৳ " + formatMoney(totalPelam);

  const balanceCard = document.getElementById("profileBalanceCard");
  const balanceLabel = document.getElementById("profileBalanceLabel");
  const balanceAmount = document.getElementById("profileBalanceAmount");
  const balanceStatus = document.getElementById("profileBalanceStatus");

  if(balanceCard) balanceCard.classList.remove("receive", "pay", "zero");

  if(runningBalance > 0){
    if(balanceCard) balanceCard.classList.add("receive");
    if(balanceLabel) balanceLabel.textContent = "বর্তমান হিসাব";
    if(balanceAmount) balanceAmount.textContent = "৳ " + formatMoney(runningBalance);
    if(balanceStatus) balanceStatus.textContent = "পাওনা";
  }else if(runningBalance < 0){
    if(balanceCard) balanceCard.classList.add("pay");
    if(balanceLabel) balanceLabel.textContent = "বর্তমান হিসাব";
    if(balanceAmount) balanceAmount.textContent = "৳ " + formatMoney(Math.abs(runningBalance));
    if(balanceStatus) balanceStatus.textContent = "দেনা";
  }else{
    if(balanceCard) balanceCard.classList.add("zero");
    if(balanceLabel) balanceLabel.textContent = "বর্তমান হিসাব";
    if(balanceAmount) balanceAmount.textContent = "৳ 0";
    if(balanceStatus) balanceStatus.textContent = "সমান";
  }

  let person = allPerson.filter(t=>{
    const searchMatch = !search ||
      String(t.amount).includes(search) ||
      (t.note || "").toLowerCase().includes(search) ||
      ledgerLabel(t.type).includes(search);

    const fromMatch = !from || t.transaction_date >= from;
    const toMatch = !to || t.transaction_date <= to;
    return searchMatch && fromMatch && toMatch;
  });

  // Newest transaction first, like a khata.
  person.sort((a,b)=>{
    const dateCompare = String(b.transaction_date || "").localeCompare(String(a.transaction_date || ""));
    if(dateCompare !== 0) return dateCompare;
    return b.__index - a.__index;
  });

  list.innerHTML = "";

  if(person.length === 0){
    list.innerHTML = `<div class="empty">কোনো লেনদেন পাওয়া যায়নি।</div>`;
    return;
  }

  person.forEach(t=>{
    const amount = Number(t.amount);
    const after = Number(balanceAfter[String(t.id)] || 0);
    const afterText = after > 0
      ? `পাবো ৳${formatMoney(after)}`
      : after < 0
        ? `দেবো ৳${formatMoney(Math.abs(after))}`
        : "হিসাব সমান";

    list.innerHTML += `
      <div class="transaction">
        <div class="transaction-top">
          <div>
            <div class="amount ${t.type === "receive" ? "receive" : "pay"}">
              ${t.type === "receive" ? "↑" : "↓"} ${ledgerLabel(t.type)} ৳${formatMoney(amount)}
            </div>
            <div class="small">📅 ${formatDate(t.transaction_date)}</div>
          </div>
          <div class="transaction-actions">
            <button class="primary" onclick="editTransaction('${t.id}')">✏️ Edit</button>
            <button class="red" onclick="deleteTransaction('${t.id}')">🗑️ Delete</button>
          </div>
        </div>
        ${t.note ? `<div class="small">📝 ${escapeHTML(t.note)}</div>` : ""}
        <div class="running-balance ${after > 0 ? "receive" : after < 0 ? "pay" : ""}">
          লেনদেনের পর: ${afterText}
        </div>
      </div>`;
  });
}

function clearFilters(){
  document.getElementById("transactionSearch").value = "";
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  renderProfile();
}

// ==================================================
// MY PROFILE: NAME + AVATAR
// ==================================================

function getDisplayName(user){
  return user?.user_metadata?.full_name?.trim() ||
         (user?.is_anonymous ? "Guest" : (user?.email?.split("@")[0] || "User"));
}

function getAvatarInitial(name){
  const clean = String(name || "User").trim();
  return clean ? clean.charAt(0).toUpperCase() : "U";
}

function setAvatarElement(element, name, avatarUrl){
  if(!element) return;
  if(avatarUrl){
    element.innerHTML = `<img src="${escapeHTML(avatarUrl)}" alt="Profile">`;
  }else{
    element.textContent = getAvatarInitial(name);
  }
}

function updateMyProfileUI(user){
  const name = getDisplayName(user);
  const avatarUrl = user?.user_metadata?.avatar_url || "";

  const headerName = document.getElementById("headerUserName");
  if(headerName) headerName.textContent = name;

  setAvatarElement(document.getElementById("headerAvatar"), name, avatarUrl);
  setAvatarElement(document.getElementById("myProfileAvatar"), name, avatarUrl);

  const nameInput = document.getElementById("myProfileName");
  if(nameInput) nameInput.value = user?.user_metadata?.full_name || "";

  const emailInput = document.getElementById("myProfileEmail");
  if(emailInput) emailInput.value = user?.is_anonymous ? "Guest account" : (user?.email || "");

  const guest = !!user?.is_anonymous;
  const photoLabel = document.getElementById("changeProfilePhotoLabel");
  const photoHint = document.getElementById("profilePhotoHint");
  if(photoLabel) photoLabel.classList.toggle("hidden", guest);
  if(photoHint) photoHint.textContent = guest ? "Guest account-এ profile picture দিতে আগে Account তৈরি করুন।" : "সর্বোচ্চ 2MB • JPG, PNG বা WebP";
}

async function openMyProfile() {

  // Hide the entire home header (including its green background and height)
  // when the custom Profile page is opened.
  document.getElementById("app")?.classList.add("inner-page");

  // ধাপ ১: আগে থেকেই Profile পেজ দেখাও
  const pageIds = [
    "homePage",
    "customerPage",
    "addPage",
    "profilePage",
    "historyPage"
  ];

  pageIds.forEach(id => {
    document.getElementById(id)?.classList.add("hidden");
  });

  // হোমের Header লুকাও
  document.getElementById("myProfileHeader")
    ?.classList.add("hidden");

  document.getElementById("myProfileHeader")
    ?.style.setProperty("display", "none", "important");

  // Profile পেজ সঙ্গে সঙ্গে দেখাও
  document.getElementById("myProfilePage")
    ?.classList.remove("hidden");

  // Navigation ঠিক রাখো
  const nav = document.querySelector(".bottom-nav");
  if (nav) nav.style.display = "grid";

  if (typeof setActiveBottomNav === "function") {
    setActiveBottomNav("navProfile");
  }

  // আগে থেকে থাকা তথ্য দ্রুত দেখাও
  const headerName = document.getElementById("headerUserName");
  const profileName = document.getElementById("profileScreenName");

  if (headerName && profileName && headerName.textContent.trim()) {
    profileName.textContent = headerName.textContent.trim();
  }

  const pay = document.getElementById("homeTotalPay");
  const receive = document.getElementById("homeTotalReceive");

  const profilePay = document.getElementById("profileScreenPay");
  const profileReceive = document.getElementById("profileScreenReceive");

  if (profilePay && pay) {
    profilePay.textContent = pay.textContent;
  }

  if (profileReceive && receive) {
    profileReceive.textContent = receive.textContent;
  }

  // ধাপ ২: পেজ খোলার পরে ব্যবহারকারীর তথ্য আপডেট করো
  try {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data?.user) {
      console.error("Profile user load error:", error);
      return;
    }

    const user = data.user;

    updateMyProfileUI(user);

    const name = getDisplayName(user);
    const avatarUrl = user.user_metadata?.avatar_url || "";

    if (profileName) {
      profileName.textContent = name;
    }

    setAvatarElement(
      document.getElementById("profileScreenAvatar"),
      name,
      avatarUrl
    );

  } catch (error) {
    console.error("Profile load error:", error);
  }
}

  


function closeMyProfile(){
  document.getElementById("myProfileModal")?.classList.add("hidden");
  clearMessage("myProfileMessage");
}

async function saveMyProfile(){
  clearMessage("myProfileMessage");

  const name = document.getElementById("myProfileName")?.value.trim() || "";
  const button = document.getElementById("saveMyProfileBtn");

  if(!name) return showMessage("myProfileMessage","আপনার নাম লিখুন।",false);
  if(name.length > 80) return showMessage("myProfileMessage","নাম ৮০ অক্ষরের মধ্যে রাখুন।",false);

  if(button){
    button.disabled = true;
    button.textContent = "⏳ Save হচ্ছে...";
  }

  try{
    const {data, error} = await supabaseClient.auth.updateUser({
      data:{full_name:name}
    });

    if(error){
      showMessage("myProfileMessage",translateAuthError(error.message),false);
      return;
    }

    updateMyProfileUI(data.user);
    showMessage("myProfileMessage","✅ Profile সফলভাবে update হয়েছে।",true);
  }catch(error){
    console.error("Profile update error:", error);
    showMessage("myProfileMessage","Profile update করা যায়নি। আবার চেষ্টা করুন।",false);
  }finally{
    if(button){
      button.disabled = false;
      button.textContent = "💾 Save Changes";
    }
  }
}

async function uploadProfilePhoto(event){
  clearMessage("myProfileMessage");

  const file = event.target.files?.[0];
  if(!file) return;

  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
    showMessage("myProfileMessage","JPG, PNG অথবা WebP ছবি দিন।",false);
    event.target.value = "";
    return;
  }

  if(file.size > 2 * 1024 * 1024){
    showMessage("myProfileMessage","ছবির size 2MB-এর কম হতে হবে।",false);
    event.target.value = "";
    return;
  }

  const {data:{user}, error:userError} = await supabaseClient.auth.getUser();
  if(userError || !user) return;

  if(user.is_anonymous){
    showMessage("myProfileMessage","Profile picture দিতে আগে Guest account-টি permanent account-এ convert করুন।",false);
    event.target.value = "";
    return;
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filePath = `${user.id}/profile.${ext}`;
  const button = document.getElementById("saveMyProfileBtn");

  try{
    if(button){
      button.disabled = true;
      button.textContent = "⏳ ছবি upload হচ্ছে...";
    }

    // Remove common old formats so only one current profile picture remains.
    const oldPaths = ["jpg","png","webp"].map(x => `${user.id}/profile.${x}`).filter(x => x !== filePath);
    await supabaseClient.storage.from("avatars").remove(oldPaths);

    const {error:uploadError} = await supabaseClient.storage
      .from("avatars")
      .upload(filePath, file, {
        upsert:true,
        contentType:file.type,
        cacheControl:"3600"
      });

    if(uploadError){
      showMessage("myProfileMessage",`ছবি upload করা যায়নি: ${uploadError.message}`,false);
      return;
    }

    const {data:publicData} = supabaseClient.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;

    const {data,error:updateError} = await supabaseClient.auth.updateUser({
      data:{avatar_url:avatarUrl}
    });

    if(updateError){
      showMessage("myProfileMessage",translateAuthError(updateError.message),false);
      return;
    }

    updateMyProfileUI(data.user);
    showMessage("myProfileMessage","✅ Profile picture update হয়েছে।",true);
  }catch(error){
    console.error("Profile photo upload error:", error);
    showMessage("myProfileMessage","ছবি upload করা যায়নি। Supabase Storage-এর avatars bucket ও policy ঠিক আছে কিনা দেখুন।",false);
  }finally{
    if(button){
      button.disabled = false;
      button.textContent = "💾 Save Changes";
    }
    event.target.value = "";
  }
}

// Wire the profile photo picker once the page is loaded.
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("profilePhotoInput")?.addEventListener("change", uploadProfilePhoto);
});


/* ==================================================
   CUSTOMER PROFILE - MODERN UI CONTROLS
================================================== */

function toggleProfileHistory(){
  const history = document.getElementById("profileHistorySection");
  if(!history) return;
  history.classList.toggle("hidden");
}

function showProfileTransactionForm(type){
  const form = document.getElementById("profileLedgerForm");
  if(!form) return;

  form.classList.remove("hidden");
  if(typeof setProfileTransactionType === "function"){
    setProfileTransactionType(type);
  }

  form.scrollIntoView({behavior:"smooth", block:"center"});
}

function toggleProfileMenu(){
  const menu = document.getElementById("profileActionMenu");
  if(!menu) return;
  menu.classList.toggle("hidden");
}

function showProfileNotice(message, isError = false){
  const notice = document.getElementById("profileScreenMessage");
  if(!notice) return;
  notice.textContent = message;
  notice.classList.remove("hidden");
  notice.classList.toggle("profile-notice-error", !!isError);
}

async function openMyProfileEdit(){
  const { data, error } = await supabaseClient.auth.getUser();
  if(error || !data?.user){
    showProfileNotice("আপনার account-এর তথ্য পাওয়া যায়নি। আবার লগইন করুন।", true);
    return;
  }
  clearMessage("myProfileMessage");
  updateMyProfileUI(data.user);
  document.getElementById("myProfileModal")?.classList.remove("hidden");
}

async function showPasswordChange(){
  const { data, error } = await supabaseClient.auth.getUser();
  if(error || !data?.user){
    showProfileNotice("Account-এর তথ্য পাওয়া যায়নি। আবার লগইন করুন।", true);
    return;
  }
  if(data.user.is_anonymous || !data.user.email){
    showProfileNotice("Guest account-এ password reset করা যায় না। আগে email দিয়ে account তৈরি করুন।", true);
    return;
  }

  showProfileNotice("Password reset-এর ইমেইল পাঠানো হচ্ছে…");
  try{
    const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(
      data.user.email,
      { redirectTo: "https://ismail-resh.github.io/MY-KHATA/" }
    );
    if(resetError) throw resetError;
    showProfileNotice("আপনার email-এ password পরিবর্তনের লিংক পাঠানো হয়েছে। Inbox এবং Spam folder দেখুন।");
  }catch(error){
    console.error("Password reset request failed:", error);
    showProfileNotice("Password reset email পাঠানো যায়নি। ইন্টারনেট ও Supabase email settings পরীক্ষা করুন।", true);
  }
}

function showBackupInfo(){
  try{
    const rows = Array.isArray(transactions) ? transactions : [];
    const payload = {
      app: "MY-KHATA",
      exportedAt: new Date().toISOString(),
      transactions: rows
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "my-khata-backup-" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showProfileNotice("লেনদেনের backup ফাইল ডাউনলোড শুরু হয়েছে। নিরাপদ জায়গায় ফাইলটি সংরক্ষণ করুন।");
  }catch(error){
    console.error("Backup export failed:", error);
    showProfileNotice("Backup তৈরি করা যায়নি। আবার চেষ্টা করুন।", true);
  }
}

function showHelpInfo(){
  showProfileNotice("সহায়তা: কোনো সমস্যা হলে error message-এর screenshot এবং কী করলে সমস্যা হচ্ছে তা লিখে রাখুন। আপনার GitHub repository-তে issue তৈরি করেও জানাতে পারেন।");
}


// ==================================================
// ACCOUNT DELETION (requires deployed Supabase Edge Function)
// ==================================================
function openDeleteAccountDialog(){
  const overlay = document.getElementById("deleteAccountOverlay");
  const message = document.getElementById("deleteAccountMessage");
  const password = document.getElementById("deleteAccountPassword");
  const confirmText = document.getElementById("deleteAccountConfirmText");
  if(message){ message.textContent = ""; message.classList.add("hidden"); }
  if(password) password.value = "";
  if(confirmText) confirmText.value = "";
  if(overlay) overlay.classList.remove("hidden");
}
function closeDeleteAccountDialog(){
  document.getElementById("deleteAccountOverlay")?.classList.add("hidden");
}
function showDeleteAccountMessage(message){
  const el = document.getElementById("deleteAccountMessage");
  if(el){ el.textContent = message; el.classList.remove("hidden"); }
}
async function confirmDeleteAccount(){
  const button = document.getElementById("deleteAccountConfirmButton");
  const password = document.getElementById("deleteAccountPassword")?.value || "";
  const confirmation = document.getElementById("deleteAccountConfirmText")?.value.trim() || "";
  if(confirmation !== "DELETE") return showDeleteAccountMessage("নিশ্চিত করতে ইংরেজিতে DELETE লিখুন।");
  if(button){ button.disabled = true; button.textContent = "অ্যাকাউন্ট ডিলিট হচ্ছে…"; }
  try {
    if (!navigator.onLine) throw new Error("অ্যাকাউন্ট ডিলিট করতে ইন্টারনেট সংযোগ প্রয়োজন। সংযোগ ফিরে এলে আবার চেষ্টা করুন।");
    if (!window.offlineSupport?.getPendingChangesStatus) throw new Error("Offline queue যাচাই করা যাচ্ছে না। নিরাপত্তার জন্য ডিলিট বন্ধ রাখা হয়েছে। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।");
    const pendingStatus = await window.offlineSupport.getPendingChangesStatus();
    if (!pendingStatus.known) throw new Error("Pending offline changes যাচাই করা যায়নি। নিরাপত্তার জন্য ডিলিট বন্ধ রাখা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।");
    if (pendingStatus.count > 0) throw new Error(`আপনার ${pendingStatus.count}টি পরিবর্তন এখনো সিঙ্ক হয়নি। আগে অনলাইনে গিয়ে সিঙ্ক সম্পন্ন করুন অথবা ডেটার backup নিন, তারপর আবার অ্যাকাউন্ট ডিলিট করুন।`);
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if(userError || !userData?.user) throw new Error("আপনার লগইন সেশন পাওয়া যায়নি। আবার লগইন করে চেষ্টা করুন।");
    const user = userData.user;
    if(!user.is_anonymous){
      if(!user.email) throw new Error("এই অ্যাকাউন্টের পরিচয় যাচাই করা যাচ্ছে না। সহায়তার সঙ্গে যোগাযোগ করুন।");
      if(!password) throw new Error("ডিলিট করার আগে বর্তমান পাসওয়ার্ড দিন।");
      const { error: reauthError } = await supabaseClient.auth.signInWithPassword({ email: user.email, password });
      if(reauthError) throw new Error("পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।");
    }
    // Keep the owner ID before the server removes the Auth user.
    const ownerId = user.id;
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;
    if(!token) throw new Error("লগইন সেশন পাওয়া যায়নি। আবার লগইন করুন।");
    const { data, error } = await supabaseClient.functions.invoke("delete-account", {
      body: { confirmation: "DELETE" },
      headers: { Authorization: `Bearer ${token}` }
    });
    if(error) {
      let detail = error.message || "সার্ভার অনুরোধটি গ্রহণ করেনি।";
      try { const ctx = error.context; if(ctx && typeof ctx.json === "function"){ const body = await ctx.json(); if(body?.error) detail = body.error; } } catch(_) {}
      throw new Error(detail + " Supabase-এ delete-account Edge Function deploy করা আছে কি না দেখুন।");
    }
    if(!data?.success) throw new Error(data?.error || "সার্ভার অ্যাকাউন্ট ডিলিট নিশ্চিত করেনি।");
    // Clear only this account's offline rows/outbox. Never clear another user's cache.
    if(window.offlineSupport?.clearLocalDataForCurrentUser) await window.offlineSupport.clearLocalDataForCurrentUser(ownerId);
    try { await supabaseClient.auth.signOut({ scope: "local" }); } catch(_) {}
    transactions = []; currentCustomer = null;
    closeDeleteAccountDialog();
    showLogin();
    const loginMessage = document.getElementById("loginMessage");
    if(loginMessage){ loginMessage.textContent = "আপনার অ্যাকাউন্ট ও সংশ্লিষ্ট সার্ভার ডেটা ডিলিট করা হয়েছে।"; loginMessage.classList.remove("hidden"); }
  } catch(error) {
    console.error("Account deletion failed:", error);
    showDeleteAccountMessage(error?.message || "অ্যাকাউন্ট ডিলিট করা যায়নি। ইন্টারনেট ও Supabase সেটআপ পরীক্ষা করুন।");
  } finally {
    if(button){ button.disabled = false; button.textContent = "অ্যাকাউন্ট স্থায়ীভাবে ডিলিট করুন"; }
  }
}
