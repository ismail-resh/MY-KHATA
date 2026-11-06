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
let currentCustomer = null;
