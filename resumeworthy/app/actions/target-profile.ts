"use server";

import { supabase } from "@/lib/supabase";
import { TargetProfileInput } from "@/types/tailor";

function isMissingTargetProfilesTable(error: any) {
  const message = String(error?.message || "");
  return error?.code === "PGRST205" || message.includes("Could not find the table 'public.target_profiles'");
}

export async function getTargetProfile(userId: string): Promise<TargetProfileInput | null> {
  const { data, error } = await supabase
    .from("target_profiles")
    .select("target_role, target_company, job_description, extra_context, links")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTargetProfilesTable(error)) {
      return null;
    }
    throw new Error(`Failed to load target profile: ${error.message}`);
  }

  if (!data) return null;

  return {
    targetRole: data.target_role || "",
    targetCompany: data.target_company || "",
    jobDescription: data.job_description || "",
    extraContext: data.extra_context || "",
    links: data.links || "",
  };
}

export async function saveTargetProfile(userId: string, profile: TargetProfileInput) {
  const payload = {
    user_id: userId,
    target_role: profile.targetRole || "",
    target_company: profile.targetCompany || "",
    job_description: profile.jobDescription || "",
    extra_context: profile.extraContext || "",
    links: profile.links || "",
  };

  const { error } = await supabase
    .from("target_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    if (isMissingTargetProfilesTable(error)) {
      return { success: false, reason: "missing_table" as const };
    }
    throw new Error(`Failed to save target profile: ${error.message}`);
  }

  return { success: true };
}
