// Deploy with: supabase functions deploy delete-account
// Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as function secrets.
// Never expose the service-role key in browser code.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { success: false, error: "শুধু POST অনুরোধ গ্রহণ করা হয়।" });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return response(401, { success: false, error: "লগইন সেশন পাওয়া যায়নি। আবার লগইন করুন।" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return response(500, { success: false, error: "সার্ভারের Supabase secrets সেট করা নেই।" });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return response(401, { success: false, error: "সেশন যাচাই করা যায়নি। আবার লগইন করুন।" });

  let body: { confirmation?: string } = {};
  try { body = await req.json(); } catch { return response(400, { success: false, error: "অনুরোধটি সঠিক নয়।" }); }
  if (body.confirmation !== "DELETE") return response(400, { success: false, error: "অ্যাকাউন্ট ডিলিট নিশ্চিত করা হয়নি।" });

  // Remove only this user's avatar objects before deleting database rows/Auth.
  // If storage cleanup fails, stop here so the user can retry without losing ledger data.
  const avatarPaths: string[] = [];
  let avatarOffset = 0;
  const avatarPageSize = 100;
  while (true) {
    const { data: avatarFiles, error: avatarListError } = await admin.storage
      .from("avatars")
      .list(user.id, { limit: avatarPageSize, offset: avatarOffset });
    if (avatarListError) {
      console.error("List avatar files failed", { userId: user.id, message: avatarListError.message });
      return response(500, { success: false, error: "প্রোফাইল ছবির ফাইল তালিকা যাচাই করা যায়নি। ডেটা মুছিনি; Storage-এর avatars bucket পরীক্ষা করে আবার চেষ্টা করুন।" });
    }
    const files = avatarFiles || [];
    avatarPaths.push(...files.filter(file => file.name && file.id).map(file => `${user.id}/${file.name}`));
    if (files.length < avatarPageSize) break;
    avatarOffset += files.length;
  }
  for (let i = 0; i < avatarPaths.length; i += 100) {
    const { error: avatarRemoveError } = await admin.storage.from("avatars").remove(avatarPaths.slice(i, i + 100));
    if (avatarRemoveError) {
      console.error("Delete avatar files failed", { userId: user.id, message: avatarRemoveError.message });
      return response(500, { success: false, error: "প্রোফাইল ছবির ফাইল মুছে ফেলা যায়নি। লেনদেনের ডেটা মুছিনি; Storage policy/bucket পরীক্ষা করে আবার চেষ্টা করুন।" });
    }
  }

  // Delete this user's app data. If an operation fails, preserve the Auth account
  // so the user can retry; never delete rows belonging to other user IDs.
  const { error: txError } = await admin.from("transactions").delete().eq("user_id", user.id);
  if (txError) {
    console.error("Delete transactions failed", { userId: user.id, message: txError.message });
    return response(500, { success: false, error: "লেনদেনের ডেটা ডিলিট করা যায়নি। টেবিলের user_id কলাম ও database policy/schema পরীক্ষা করুন।" });
  }
  const { error: customerError } = await admin.from("customers").delete().eq("user_id", user.id);
  if (customerError) {
    console.error("Delete customers failed", { userId: user.id, message: customerError.message });
    return response(500, { success: false, error: "গ্রাহকের ডেটা ডিলিট করা যায়নি। টেবিলের user_id কলাম ও database schema পরীক্ষা করুন।" });
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error("Delete auth user failed", { userId: user.id, message: deleteUserError.message });
    return response(500, { success: false, error: "লেনদেন ও গ্রাহকের ডেটা মুছে গেছে, কিন্তু Auth account ডিলিট হয়নি। Supabase Auth সেটিংস পরীক্ষা করে পুনরায় চেষ্টা/সহায়তা নিন।" });
  }
  return response(200, { success: true });
});
