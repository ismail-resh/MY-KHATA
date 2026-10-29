// ==================================================
// COMMON HELPERS
// ==================================================

function showMessage(id, text, success){
  const el = document.getElementById(id);
  el.innerText = text;
  el.className = "message " + (success ? "success" : "error");
}

function clearMessage(id){
  const el = document.getElementById(id);
  el.innerText = "";
  el.className = "message";
}

function togglePassword(id, button){
  const input = document.getElementById(id);
  if(input.type === "password"){
    input.type = "text";
    button.innerText = "🙈";
  }else{
    input.type = "password";
    button.innerText = "👁️";
  }
}

function formatDate(date){
  const p = date.split("-");
  if(p.length !== 3) return date;
  return p[2] + "/" + p[1] + "/" + p[0];
}

function escapeHTML(text){
  return String(text)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function translateAuthError(message){
  const m = message.toLowerCase();
  if(m.includes("invalid login credentials")) return "❌ Email অথবা Password ভুল।";
  if(m.includes("email not confirmed")) return "📧 আগে আপনার email verify করুন।";
  if(m.includes("user already registered")) return "এই email দিয়ে আগে থেকেই account আছে। Login করুন।";
  if(m.includes("password should be at least")) return "Password কমপক্ষে ৬ অক্ষরের হতে হবে।";
  if(m.includes("rate limit")) return "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  return message;
}

// ==================================================
// SECURITY / DATE HELPERS (added)
// ==================================================

// ব্যবহারকারীর local তারিখ (YYYY-MM-DD)।
// toISOString() UTC দেয়; বাংলাদেশে (UTC+6) মাঝরাত ১২টা থেকে ভোর ৬টা পর্যন্ত গতকালের তারিখ আসত।
function localDateString(d){
  d = d || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// বর্তমান লগইন করা user-এর id (RLS-এর পাশাপাশি client-এও user_id দিয়ে scope করার জন্য)।
async function currentUserIdOrNull(){
  try{
    const { data:{ session } } = await supabaseClient.auth.getSession();
    return session?.user?.id || null;
  }catch(e){
    return null;
  }
}
