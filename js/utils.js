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
