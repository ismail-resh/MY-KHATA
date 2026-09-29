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
let currentCustomer = null;
