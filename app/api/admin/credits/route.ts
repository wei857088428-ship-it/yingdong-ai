import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !admins.includes(user.email.toLowerCase())) return NextResponse.json({ error: "当前账号没有管理员权限" }, { status: 403 });

  const body = (await request.json()) as { amount?: number };
  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) return NextResponse.json({ error: "单次充值积分必须在 1 到 10000 之间" }, { status: 400 });

  const { data: profile, error: readError } = await supabaseAdmin.from("profiles").select("credits").eq("id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  const credits = Number(profile?.credits ?? 0) + amount;
  const { error: updateError } = await supabaseAdmin.from("profiles").upsert({ id: user.id, email: user.email, credits }, { onConflict: "id" });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ credits, added: amount });
}
