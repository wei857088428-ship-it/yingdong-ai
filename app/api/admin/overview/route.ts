import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type Money = { val?: string };
type BalanceResponse = { total?: Money; message?: string };
type InvoiceResponse = { coreInvoice?: { amountAfterVat?: string }; effectiveSpendingLimit?: string; message?: string };

export const dynamic = "force-dynamic";

function dollars(value?: string) {
  const cents = Number(value ?? 0);
  return Number.isFinite(cents) ? Math.abs(cents) / 100 : 0;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !admins.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "当前账号没有管理员权限", needsAdminConfig: admins.length === 0 }, { status: 403 });
  }

  const managementKey = process.env.XAI_MANAGEMENT_API_KEY;
  const teamId = process.env.XAI_TEAM_ID;
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const [{ data: profiles, error: profilesError }, { data: usage }, { count: worksToday }] = await Promise.all([
    supabaseAdmin.from("profiles").select("credits"),
    supabaseAdmin.from("usage_events").select("kind,credits,status").gte("created_at", dayStart.toISOString()),
    supabaseAdmin.from("works").select("id", { count: "exact", head: true }).gte("created_at", dayStart.toISOString()),
  ]);
  const profileRows = profiles ?? [];
  const totalCredits = profileRows.reduce((sum, profile) => sum + Number(profile.credits ?? 0), 0);
  let prepaidBalance: number | null = null;
  let monthSpend: number | null = null;
  let spendingLimit: number | null = null;
  let xaiError: string | null = null;

  if (managementKey && teamId) {
    try {
      const headers = { Authorization: `Bearer ${managementKey}`, Accept: "application/json" };
      const [balanceResponse, invoiceResponse] = await Promise.all([
        fetch(`https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(teamId)}/prepaid/balance`, { headers, cache: "no-store" }),
        fetch(`https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(teamId)}/postpaid/invoice/preview`, { headers, cache: "no-store" }),
      ]);
      const balance = (await balanceResponse.json()) as BalanceResponse;
      const invoice = (await invoiceResponse.json()) as InvoiceResponse;
      if (!balanceResponse.ok) throw new Error(balance.message || "无法读取 xAI 预付余额");
      if (!invoiceResponse.ok) throw new Error(invoice.message || "无法读取 xAI 当月账单");
      prepaidBalance = dollars(balance.total?.val);
      monthSpend = dollars(invoice.coreInvoice?.amountAfterVat);
      spendingLimit = dollars(invoice.effectiveSpendingLimit);
    } catch (error) { xaiError = error instanceof Error ? error.message : "读取 xAI 账单失败"; }
  }

  return NextResponse.json({
    xai: { configured: Boolean(managementKey && teamId), prepaidBalance, monthSpend, spendingLimit, error: xaiError },
    site: { users: profileRows.length, totalCredits, requestsToday: usage?.length ?? 0, creditsToday: (usage ?? []).filter((item) => item.status !== "refunded").reduce((sum, item) => sum + Number(item.credits), 0), worksToday: worksToday ?? 0, profilesError: profilesError?.message ?? null },
    updatedAt: new Date().toISOString(),
  });
}
