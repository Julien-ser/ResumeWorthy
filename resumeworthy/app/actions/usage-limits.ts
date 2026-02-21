"use server";

import { supabase } from "@/lib/supabase";

export type UsageStatus = {
  isPaid: boolean;
  dailyUsed: number;
  dailyLimit: number;
  canApply: boolean;
};

const FREE_DAILY_LIMIT = 3;

function isMissingTableError(error: any) {
  const message = String(error?.message || "");
  return error?.code === "PGRST205" || message.includes("Could not find the table");
}

async function getIsPaidUser(userId: string) {
  const { data, error } = await supabase
    .from("user_plans")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    throw new Error(`Failed to load plan status: ${error.message}`);
  }

  if (!data) return false;
  const status = String(data.status || "").toLowerCase();
  if (status !== "active" && status !== "trialing") return false;

  if (!data.current_period_end) return true;
  return new Date(data.current_period_end).getTime() > Date.now();
}

async function getDailyUsageCount(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { count, error } = await supabase
    .from("application_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (error) {
    if (isMissingTableError(error)) return 0;
    throw new Error(`Failed to load usage: ${error.message}`);
  }

  return count || 0;
}

export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const [isPaid, dailyUsed] = await Promise.all([getIsPaidUser(userId), getDailyUsageCount(userId)]);

  if (isPaid) {
    return {
      isPaid: true,
      dailyUsed,
      dailyLimit: Number.POSITIVE_INFINITY,
      canApply: true,
    };
  }

  return {
    isPaid: false,
    dailyUsed,
    dailyLimit: FREE_DAILY_LIMIT,
    canApply: dailyUsed < FREE_DAILY_LIMIT,
  };
}

export async function assertCanSubmitApplication(userId: string) {
  const status = await getUsageStatus(userId);
  if (status.canApply) return;

  throw new Error(
    `Free plan limit reached: ${FREE_DAILY_LIMIT} resume applications per day. Upgrade for unlimited applications.`
  );
}

export async function recordApplicationUsage(userId: string) {
  const { error } = await supabase
    .from("application_usage")
    .insert([{ user_id: userId }]);

  if (error) {
    if (isMissingTableError(error)) return;
    throw new Error(`Failed to record usage: ${error.message}`);
  }
}
