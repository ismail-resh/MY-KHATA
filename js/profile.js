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
  const search = document.getElementById("transactionSearch").value.toLowerCase().trim();
  const from = document.getElementById("dateFrom").value;
  const to = document.getElementById("dateTo").value;

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

  const profileBalance = document.getElementById("profileBalance");
  profileBalance.innerHTML = runningBalance > 0
    ? `<div class="balance-label">বর্তমান পাওনা</div><div class="balance-value receive">৳${formatMoney(runningBalance)}</div>`
    : runningBalance < 0
      ? `<div class="balance-label">বর্তমান দেনা</div><div class="balance-value pay">৳${formatMoney(Math.abs(runningBalance))}</div>`
      : `<div class="balance-label">বর্তমান হিসাব</div><div class="balance-value">৳0</div>`;

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

async function openMyProfile(){
  clearMessage("myProfileMessage");

  const {data:{user}, error} = await supabaseClient.auth.getUser();
  if(error || !user) return;

  updateMyProfileUI(user);
  document.getElementById("myProfileModal")?.classList.remove("hidden");
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
