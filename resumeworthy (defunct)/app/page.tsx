"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import { supabase } from "@/lib/supabase";
import { ResumeBlock } from "@/types/database";
import { ingestResume } from "./actions/shred";
import { buildTailoredResumeDraft } from "./actions/tailor";
import { getTargetProfile, saveTargetProfile } from "./actions/target-profile";
import { getUsageStatus, UsageStatus } from "./actions/usage-limits";
import { TailoredResumeDraft, TargetProfileInput } from "@/types/tailor";
import logo from "./logo.png";

export default function Home() {
  const [blocks, setBlocks] = useState<ResumeBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);
  const [generatingDraft, setGeneratingDraft] = useState<boolean>(false);
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [links, setLinks] = useState("");
  const [draft, setDraft] = useState<TailoredResumeDraft | null>(null);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileInitializedRef = useRef(false);
  const router = useRouter();
  const BILLING_LIVE = process.env.NEXT_PUBLIC_BILLING_LIVE === "true";

  const TARGET_PROFILE_STORAGE_KEY = `resumeworthy.targetProfile.${currentUserId ?? "guest"}`;

  async function fetchBlocks() {
    if (!currentUserId) {
      setBlocks([]);
      return;
    }

    const { data, error } = await supabase
      .from("blocks")
      .select("*")
      .eq("user_id", currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching:", error);
    } else {
      setBlocks(data as ResumeBlock[]);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!currentUserId) {
      alert("Please log in first.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await ingestResume(formData, currentUserId);
      alert("Resume parsed successfully!");
      fetchBlocks();
    } catch (err) {
      console.error(err);
      alert("Failed to shred resume. Check console.");
    } finally {
      setUploading(false);
    }
  }

  async function addTestBlock() {
    if (!currentUserId) {
      alert("Please log in first.");
      return;
    }

    setLoading(true);
    const newBlock: Partial<ResumeBlock> = {
      user_id: currentUserId,
      type: "experience",
      content: { 
        title: "Founding Engineer", 
        company: "Resumeworthy", 
        description_bullets: ["Building the future of career tech", "Using React Compiler for GOAT performance"] 
      },
      tags: ["Next.js", "TypeScript", "Startup"]
    };

    const { error } = await supabase.from("blocks").insert([newBlock]);
    if (error) alert(error.message);
    else fetchBlocks();
    setLoading(false);
  }

  async function clearBlocks() {
    if (!currentUserId) {
      alert("Please log in first.");
      return;
    }

    const confirmed = window.confirm("Clear all blocks for this user?");
    if (!confirmed) return;

    setClearing(true);
    const { error } = await supabase.from("blocks").delete().eq("user_id", currentUserId);
    if (error) {
      alert(error.message);
    } else {
      fetchBlocks();
    }
    setClearing(false);
  }

  async function generateDraft() {
    try {
      setGeneratingDraft(true);
      const generated = await buildTailoredResumeDraft({
        blocks,
        target: {
          targetRole,
          targetCompany,
          jobDescription,
          extraContext,
          links,
        },
      });
      setDraft(generated);
    } catch (error: any) {
      alert(error?.message || "Failed to generate tailored draft.");
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setDraft(null);
    router.push("/login");
  }

  async function startCheckout() {
    if (!BILLING_LIVE) {
      alert("Stripe is activated in infra, but checkout is coming soon.");
      return;
    }

    if (!currentUserId) {
      router.push("/login");
      return;
    }

    try {
      setCheckingOut(true);
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create checkout session.");
      }

      if (!payload?.url) {
        throw new Error("No checkout URL was returned.");
      }

      window.location.href = payload.url;
    } catch (error: any) {
      alert(error?.message || "Failed to start checkout.");
    } finally {
      setCheckingOut(false);
    }
  }

  function downloadDraftPdf() {
    if (!draft) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxWidth = pageWidth - margin * 2;
    let y = 16;

    const write = (text: string, size = 11, spacing = 6) => {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, margin, y);
      y += lines.length * spacing;
      if (y > 270) {
        doc.addPage();
        y = 16;
      }
    };

    write(draft.headline, 16, 7);
    write(draft.summary, 11, 6);
    y += 2;

    write("Selected Experience", 13, 6);
    draft.selectedBlocks.forEach((block) => {
      write(`${block.content.title || "Untitled"} · ${block.content.company || ""}`, 11, 6);
      (block.content.description_bullets || []).slice(0, 4).forEach((bullet) => {
        write(`• ${bullet}`, 10, 5);
      });
      y += 2;
    });

    write(`Matched Keywords: ${draft.matchedKeywords.join(", ") || "None"}`, 10, 5);
    write(`Missing Keywords: ${draft.missingKeywords.join(", ") || "None"}`, 10, 5);
    write(`Prioritized Skills: ${draft.prioritizedSkills.join(", ") || "None"}`, 10, 5);

    doc.save("resume-draft.pdf");
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setCurrentUserId(data.user?.id ?? null);
      setAuthLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    fetchBlocks();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setUsageStatus(null);
      return;
    }

    let active = true;
    (async () => {
      try {
        const status = await getUsageStatus(currentUserId);
        if (active) setUsageStatus(status);
      } catch (error) {
        console.error("Failed to load usage status:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUserId, blocks.length]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const saved = localStorage.getItem(TARGET_PROFILE_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!active) return;
          setTargetRole(parsed.targetRole || "");
          setTargetCompany(parsed.targetCompany || "");
          setJobDescription(parsed.jobDescription || "");
          setExtraContext(parsed.extraContext || "");
          setLinks(parsed.links || "");
        }
      } catch (error) {
        console.error("Failed to restore target profile from local storage:", error);
      }

      if (currentUserId) {
        try {
          const remote = await getTargetProfile(currentUserId);
          if (!active || !remote) return;
          setTargetRole(remote.targetRole || "");
          setTargetCompany(remote.targetCompany || "");
          setJobDescription(remote.jobDescription || "");
          setExtraContext(remote.extraContext || "");
          setLinks(remote.links || "");
        } catch (error) {
          console.error("Failed to restore target profile from Supabase:", error);
        }
      }

      if (active) {
        profileInitializedRef.current = true;
      }
    })();

    return () => {
      active = false;
    };
  }, [TARGET_PROFILE_STORAGE_KEY, currentUserId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        TARGET_PROFILE_STORAGE_KEY,
        JSON.stringify({
          targetRole,
          targetCompany,
          jobDescription,
          extraContext,
          links,
        })
      );
    } catch (error) {
      console.error("Failed to persist target profile to local storage:", error);
    }
  }, [TARGET_PROFILE_STORAGE_KEY, targetRole, targetCompany, jobDescription, extraContext, links]);

  useEffect(() => {
    if (!profileInitializedRef.current) return;

    if (!currentUserId) return;

    const timer = setTimeout(async () => {
      try {
        setProfileSyncing(true);
        const profile: TargetProfileInput = {
          targetRole,
          targetCompany,
          jobDescription,
          extraContext,
          links,
        };
        await saveTargetProfile(currentUserId, profile);
      } catch (error) {
        console.error("Failed to sync target profile to Supabase:", error);
      } finally {
        setProfileSyncing(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentUserId, targetRole, targetCompany, jobDescription, extraContext, links]);

  const latestBlocks = blocks.slice(0, 6);

  return (
    <main className="min-h-screen bg-white text-[rgba(57,26,27,1)]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileUpload}
        disabled={uploading}
        className="hidden"
      />

      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <Image src={logo} alt="ResumeWorthy logo" className="h-9 w-auto" priority />
          <span className="font-black tracking-tight text-lg">ResumeWorthy</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-[rgba(110,54,55,1)]">
          <span>Platform</span>
          <span>Solutions</span>
          <span>Resources</span>
          <a href="#pricing" className="hover:underline">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          {authLoading ? null : currentUserId ? (
            <button
              onClick={handleSignOut}
              className="border border-[rgba(212,100,101,0.35)] rounded-md px-4 py-2 font-medium text-[rgba(212,100,101,1)] bg-white"
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="border border-[rgba(212,100,101,0.35)] rounded-md px-4 py-2 font-medium text-[rgba(212,100,101,1)] bg-white"
            >
              Log in
            </button>
          )}
          <button
            onClick={startCheckout}
            disabled={checkingOut || !BILLING_LIVE}
            className="rounded-md px-4 py-2 font-medium text-white bg-[rgba(212,100,101,1)] disabled:opacity-50"
          >
            {checkingOut ? "Opening..." : BILLING_LIVE ? "Upgrade" : "Billing Soon"}
          </button>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 text-center pt-16">
        <p className="text-5xl md:text-6xl leading-tight tracking-tight">
          <span className="italic font-light">Bring the magic of AI</span>
          <br />
          <span className="font-semibold">to resumes, for everyone</span>
        </p>
        <p className="mt-6 text-[rgba(110,54,55,1)] max-w-2xl mx-auto leading-relaxed">
          Parse PDFs into structured career blocks instantly, then edit and reuse every experience,
          skill, and project from one clean workspace.
        </p>
        {usageStatus && (
          <p className="mt-3 text-sm text-[rgba(110,54,55,1)]">
            {usageStatus.isPaid
              ? "Pro plan active: unlimited applications."
              : `Free plan: ${usageStatus.dailyUsed}/${usageStatus.dailyLimit} applications used today.`}
          </p>
        )}

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-[rgba(212,100,101,1)] text-white rounded-md px-5 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {uploading ? "Shredding..." : "Get started for free"}
          </button>
          <button
            onClick={addTestBlock}
            disabled={loading}
            className="border border-[rgba(212,100,101,0.35)] rounded-md px-5 py-2.5 text-sm font-medium text-[rgba(212,100,101,1)] bg-white disabled:opacity-50"
          >
            {loading ? "Saving..." : "Add sample block"}
          </button>
          <button
            onClick={clearBlocks}
            disabled={clearing}
            className="border border-[rgba(212,100,101,0.35)] rounded-md px-5 py-2.5 text-sm font-medium text-[rgba(212,100,101,1)] bg-white disabled:opacity-50"
          >
            {clearing ? "Clearing..." : "Clear latest blocks"}
          </button>
          <button
            onClick={startCheckout}
            disabled={checkingOut || !BILLING_LIVE}
            className="bg-[rgba(212,100,101,1)] text-white rounded-md px-5 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {checkingOut ? "Opening..." : BILLING_LIVE ? "Upgrade Plan" : "Billing Soon"}
          </button>
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-6 pb-10">
        <div className="rounded-3xl border border-[rgba(212,100,101,0.2)] bg-[rgba(212,100,101,0.08)] p-6">
          <p className="text-xs uppercase tracking-wider text-[rgba(110,54,55,1)] font-semibold">Pricing</p>
          <h3 className="mt-2 text-2xl font-semibold">Simple plans</h3>
          <p className="mt-2 text-sm text-[rgba(110,54,55,1)]">
            Start free, then upgrade when you want unlimited resume applications.
          </p>

          <div className="mt-5 grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[rgba(212,100,101,0.25)] bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-[rgba(110,54,55,1)] font-semibold">Free</p>
              <p className="mt-2 text-2xl font-semibold">$0</p>
              <ul className="mt-3 text-sm text-[rgba(110,54,55,1)] list-disc pl-5 space-y-1">
                <li>3 resume applications per day</li>
                <li>Draft generation and PDF export</li>
                <li>Profile save (local + Supabase)</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[rgba(212,100,101,0.35)] bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-[rgba(110,54,55,1)] font-semibold">Pro</p>
              <p className="mt-2 text-2xl font-semibold">$5 / month</p>
              <ul className="mt-3 text-sm text-[rgba(110,54,55,1)] list-disc pl-5 space-y-1">
                <li>Unlimited resume applications</li>
                <li>Priority model throughput</li>
                <li>Billing + webhook infra already wired</li>
              </ul>
              <button
                onClick={startCheckout}
                disabled={checkingOut || !BILLING_LIVE}
                className="mt-4 rounded-md bg-[rgba(212,100,101,1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {checkingOut ? "Opening..." : BILLING_LIVE ? "Start Pro" : "Billing Soon"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pt-14 pb-16">
        <div className="rounded-3xl border border-[rgba(212,100,101,0.2)] bg-[rgba(212,100,101,0.08)] p-4 md:p-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[rgba(212,100,101,0.25)] bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-[rgba(110,54,55,1)] font-semibold">Upload</p>
              <h3 className="mt-2 text-xl font-semibold">Resume Intake</h3>
              <p className="mt-2 text-sm text-[rgba(110,54,55,1)]">
                Drop in a PDF resume and convert it into reusable structured blocks.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-5 bg-[rgba(212,100,101,1)] text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {uploading ? "Processing PDF..." : "Upload PDF"}
              </button>
            </div>

            <div className="rounded-2xl border border-[rgba(212,100,101,0.25)] bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-[rgba(110,54,55,1)] font-semibold">Library</p>
              <h3 className="mt-2 text-xl font-semibold">Latest Blocks</h3>
              {latestBlocks.length === 0 ? (
                <p className="mt-3 text-sm text-[rgba(110,54,55,1)]">No blocks yet. Upload a resume to populate this.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {latestBlocks.map((block) => (
                    <div key={block.id} className="border border-[rgba(212,100,101,0.2)] rounded-lg p-3 bg-[rgba(212,100,101,0.05)]">
                      <p className="text-xs text-[rgba(110,54,55,1)] uppercase tracking-wide">{block.type}</p>
                      <p className="text-sm font-semibold mt-1 text-[rgba(57,26,27,1)]">
                        {block.content.title || "Untitled block"}
                      </p>
                      {block.content.company && (
                        <p className="text-xs text-[rgba(110,54,55,1)] mt-1">{block.content.company}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[rgba(212,100,101,0.25)] bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-[rgba(110,54,55,1)] font-semibold">Target</p>
              <h3 className="mt-2 text-xl font-semibold">Ideal Resume Inputs</h3>

              <div className="mt-4 space-y-3">
                <input
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value)}
                  placeholder="Target role (required)"
                  className="w-full rounded-md border border-[rgba(212,100,101,0.25)] px-3 py-2 text-sm outline-none"
                />
                <input
                  value={targetCompany}
                  onChange={(event) => setTargetCompany(event.target.value)}
                  placeholder="Target company"
                  className="w-full rounded-md border border-[rgba(212,100,101,0.25)] px-3 py-2 text-sm outline-none"
                />
                <textarea
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Paste job description"
                  rows={4}
                  className="w-full rounded-md border border-[rgba(212,100,101,0.25)] px-3 py-2 text-sm outline-none resize-none"
                />
                <textarea
                  value={links}
                  onChange={(event) => setLinks(event.target.value)}
                  placeholder="LinkedIn / portfolio / job URL (comma or newline separated)"
                  rows={3}
                  className="w-full rounded-md border border-[rgba(212,100,101,0.25)] px-3 py-2 text-sm outline-none resize-none"
                />
                <textarea
                  value={extraContext}
                  onChange={(event) => setExtraContext(event.target.value)}
                  placeholder="Extra notes (team scope, location, priorities)"
                  rows={3}
                  className="w-full rounded-md border border-[rgba(212,100,101,0.25)] px-3 py-2 text-sm outline-none resize-none"
                />
                <button
                  onClick={generateDraft}
                  disabled={generatingDraft}
                  className="w-full rounded-md bg-[rgba(212,100,101,1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {generatingDraft ? "Building draft..." : "Generate ideal resume draft"}
                </button>
                <p className="text-xs text-[rgba(110,54,55,1)]">
                  {profileSyncing ? "Syncing profile..." : "Profile auto-saves locally and to Supabase."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {draft && (
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="rounded-3xl border border-[rgba(212,100,101,0.25)] bg-white p-6">
            <p className="text-xs uppercase tracking-wider text-[rgba(110,54,55,1)] font-semibold">Draft</p>
            <h3 className="mt-2 text-2xl font-semibold">{draft.headline}</h3>
            <p className="mt-3 text-sm text-[rgba(110,54,55,1)]">{draft.summary}</p>

            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold">Selected Experience Blocks</h4>
                <div className="mt-3 space-y-2">
                  {draft.selectedBlocks.map((block) => (
                    <div key={block.id ?? `${block.type}-${block.content.title}`} className="rounded-md border border-[rgba(212,100,101,0.2)] bg-[rgba(212,100,101,0.05)] px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-[rgba(110,54,55,1)]">{block.type}</p>
                      <p className="text-sm font-semibold">{block.content.title || "Untitled"}</p>
                      {block.content.company && <p className="text-xs text-[rgba(110,54,55,1)]">{block.content.company}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold">Matched Keywords</h4>
                  <p className="mt-2 text-sm text-[rgba(110,54,55,1)]">{draft.matchedKeywords.join(", ") || "None detected yet"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Missing Keywords</h4>
                  <p className="mt-2 text-sm text-[rgba(110,54,55,1)]">{draft.missingKeywords.join(", ") || "No major gaps"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Prioritized Skills</h4>
                  <p className="mt-2 text-sm text-[rgba(110,54,55,1)]">{draft.prioritizedSkills.join(", ") || "No skills extracted"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Next Edits</h4>
                  <ul className="mt-2 text-sm text-[rgba(110,54,55,1)] list-disc pl-5 space-y-1">
                    {draft.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={downloadDraftPdf}
                className="rounded-md bg-[rgba(212,100,101,1)] px-4 py-2 text-sm font-medium text-white"
              >
                Download Resume PDF
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}