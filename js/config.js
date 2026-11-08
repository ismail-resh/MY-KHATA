// ==================================================
// SUPABASE CONFIG
// এখানে শুধু Supabase URL ও Publishable Key রাখুন.
// ==================================================

const SUPABASE_URL = "https://paqfvtvbojngpmspjuun.supabase.co";
const SUPABASE_KEY = "sb_publishable_OYoRSxVznMR3UyStGEmZZw_5vOFmtMY";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let transactions = [];
// রিসাইকেল বিন: ডিলিট করা গ্রাহক ও তাদের লেনদেন (সাধারণ তালিকা থেকে আলাদা রাখা হয়)
let deletedCustomers = [];
let deletedTransactions = [];
// মাল্টি ব্যবসা (js/business.js)
let businesses = [];            // এই ব্যবহারকারীর সব ব্যবসা
let activeBusinessId = null;    // বর্তমান ব্যবসার id, অথবা "all" (সব ব্যবসা একত্রে)
let defaultBusinessId = null;   // business_id নেই এমন পুরনো ডেটা এই ব্যবসার ধরা হয়
let bizOutCustomers = [];       // বর্তমান ব্যবসার বাইরের গ্রাহক (ক্যাশ ঠিক রাখার জন্য)
let bizOutTransactions = [];    // বর্তমান ব্যবসার বাইরের লেনদেন
let currentCustomer = null;
