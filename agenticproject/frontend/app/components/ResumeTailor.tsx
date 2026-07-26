"use client";

import { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import { useAuth, SignInButton } from "@clerk/nextjs";
import BlockCanvas from "./BlockCanvas";
import LatexPreview from "./LatexPreview";
import Tooltip from "./Tooltip";
import { streamSSE, SSEError } from "../lib/sseStream";
import { structureToMarkdown } from "../lib/toMarkdown";
import type { ResumeStructure, ResumeEntry } from "../lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface UsageSummary {
  tailor_count: number;
  tailor_limit: number;
  is_pro: boolean;
  remaining: number;
}

interface ResumeTailorProps {
  onResumeTailored: (data: any) => void;
  resumeData: any;
  onShowPricing: () => void;
}

const inputClass =
  "w-full px-3.5 py-2.5 border border-stone-200 rounded-xl bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-400 focus:outline-none transition-colors";

const sectionHeader = (n: string, title: string) => (
  <div className="flex items-center gap-3 mb-5">
    <span className="text-xs font-mono font-light text-primary-400">{n.padStart(2, "0")}</span>
    <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">{title}</h3>
  </div>
);

export default function ResumeTailor({ onResumeTailored, resumeData, onShowPricing }: ResumeTailorProps) {
  const { isSignedIn, getToken } = useAuth();
  const [resumeFile, setResumeFile]             = useState<File | null>(null);
  const [resumeText, setResumeText]             = useState("");
  const [cachedResumeText, setCachedResumeText] = useState("");
  const [linkedinUrl, setLinkedinUrl]           = useState("");
  const [portfolioUrl, setPortfolioUrl]         = useState("");
  const [githubUrl, setGithubUrl]               = useState("");
  const [autoDetected, setAutoDetected]         = useState({ linkedin: false, portfolio: false, github: false });
  const [jobTitle, setJobTitle]                 = useState("");
  const [jobDescription, setJobDescription]     = useState("");
  const [loading, setLoading]                   = useState(false);
  const [uploading, setUploading]               = useState(false);
  const [error, setError]                       = useState("");
  const [structure, setStructure]               = useState<ResumeStructure | null>(null);
  const [coverLetter, setCoverLetter]           = useState("");
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [usage, setUsage]                       = useState<UsageSummary | null>(null);

  useEffect(() => {
    if (isSignedIn) loadUsage();
  }, [isSignedIn]);

  const loadUsage = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/usage`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setUsage(await res.json());
    } catch {}
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setResumeText("");
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch(`${API_URL}/upload-resume`, { method: "POST", body: formData });

      if (!uploadResponse.ok) {
        let detail = "Failed to upload resume";
        try { const d = await uploadResponse.json(); if (d?.detail) detail = String(d.detail); } catch {}
        throw new Error(detail);
      }

      const uploadData = await uploadResponse.json();
      setCachedResumeText(uploadData.text || "");

      const newAutoDetected = { linkedin: false, portfolio: false, github: false };

      if (uploadData.linkedin_url && !linkedinUrl) {
        setLinkedinUrl(uploadData.linkedin_url);
        newAutoDetected.linkedin = true;
      }
      if (uploadData.github_url && !githubUrl) {
        setGithubUrl(uploadData.github_url);
        newAutoDetected.github = true;
      }
      if (uploadData.portfolio_url && !portfolioUrl) {
        setPortfolioUrl(uploadData.portfolio_url);
        newAutoDetected.portfolio = true;
      }
      setAutoDetected(newAutoDetected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process resume file");
    } finally {
      setUploading(false);
    }
  };

  const handleTailor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setStructure(null);
    setCoverLetter("");
    setCoverLetterLoading(true);

    try {
      let resumeContent = resumeFile ? cachedResumeText : resumeText;

      if (resumeFile && !resumeContent) {
        const formData = new FormData();
        formData.append("file", resumeFile);
        const uploadResponse = await fetch(`${API_URL}/upload-resume`, { method: "POST", body: formData });
        if (!uploadResponse.ok) {
          let detail = "Failed to upload resume";
          try { const d = await uploadResponse.json(); if (d?.detail) detail = String(d.detail); } catch {}
          throw new Error(detail);
        }
        resumeContent = (await uploadResponse.json()).text;
      }

      const token = await getToken();

      for await (const evt of streamSSE(`${API_URL}/tailor-resume-stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify({
          resume_text: resumeContent,
          job_description: jobDescription,
          company_name: jobTitle,
          linkedin_url: linkedinUrl,
          portfolio_url: portfolioUrl,
          github_url: githubUrl,
        }),
      })) {
        if (evt.event === "meta") {
          const entries: ResumeEntry[] = evt.data.entries.map((e: any) => ({
            id: e.id, title: e.title, company: e.company, dates: e.dates, location: e.location, blocks: null,
          }));
          setStructure({
            header: evt.data.header,
            summary: evt.data.summary,
            otherSections: evt.data.other_sections ?? [],
            entries,
          });
        } else if (evt.event === "blocks") {
          setStructure((prev) => {
            if (!prev) return prev;
            const entries = prev.entries.map((entry) => {
              if (entry.id !== evt.data.entry_id) return entry;
              return {
                ...entry,
                blocks: evt.data.blocks.map((b: any) => ({
                  id: b.id,
                  candidates: [b.chosen, ...(b.alternates ?? [])],
                  activeIndex: 0,
                  original: b.original,
                  score: b.score ?? 0,
                })),
              };
            });
            return { ...prev, entries };
          });
        } else if (evt.event === "cover_letter") {
          setCoverLetter(evt.data.text || "");
          setCoverLetterLoading(false);
        } else if (evt.event === "entry_error") {
          // one block group or the cover letter failed -- don't abort the whole stream
          console.warn("tailor-resume-stream partial failure:", evt.data.detail);
        } else if (evt.event === "error") {
          throw new Error(evt.data.detail || "Tailoring failed");
        } else if (evt.event === "done") {
          setCoverLetterLoading(false);
        }
      }

      onResumeTailored({});
      loadUsage();
    } catch (err) {
      if (err instanceof SSEError && err.status === 402) {
        onShowPricing();
      } else {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
      setCoverLetterLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const downloadResumePDF = (content: string) => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18;
      const lineHeight = 5.5;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;
      let nameLineDone = false;

      const checkPage = (needed: number) => {
        if (y + needed > pageHeight - margin) { doc.addPage(); y = margin; }
      };

      for (const line of content.split("\n")) {
        if (line.startsWith("# ")) {
          checkPage(lineHeight + 16);
          doc.setFontSize(20);
          doc.setFont("helvetica", "bold");
          doc.text(line.replace(/^# /, "").replace(/\*\*/g, ""), margin, y);
          y += lineHeight + 2;

          if (!nameLineDone) {
            nameLineDone = true;
            const parts: string[] = [];
            if (linkedinUrl) parts.push(linkedinUrl.replace(/^https?:\/\//, ""));
            if (githubUrl) parts.push(githubUrl.replace(/^https?:\/\//, ""));
            if (portfolioUrl) parts.push(portfolioUrl.replace(/^https?:\/\//, ""));
            if (parts.length) {
              doc.setFontSize(9);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(80, 80, 80);
              doc.text(parts.join("   |   "), margin, y);
              doc.setTextColor(0, 0, 0);
              y += 5;
            }
          }

          doc.setDrawColor(212, 107, 71);
          doc.setLineWidth(0.7);
          doc.line(margin, y, pageWidth - margin, y);
          doc.setDrawColor(0);
          y += 5;
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
        } else if (line.startsWith("## ")) {
          checkPage(lineHeight + 6);
          const text = line.replace(/^## /, "").replace(/\*\*/g, "");
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text(text, margin, y);
          y += lineHeight + 1;
          doc.setDrawColor(209, 213, 219);
          doc.setLineWidth(0.3);
          doc.line(margin, y, pageWidth - margin, y);
          doc.setDrawColor(0);
          y += 4;
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
        } else if (line.startsWith("### ")) {
          checkPage(lineHeight + 3);
          const text = line.replace(/^### /, "").replace(/\*\*/g, "");
          doc.setFontSize(11.5);
          doc.setFont("helvetica", "bold");
          doc.text(text, margin, y);
          y += lineHeight + 2;
          doc.setFont("helvetica", "normal");
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          const bulletText = line.replace(/^[-*] /, "").replace(/\*\*/g, "");
          const wrapped = doc.splitTextToSize(bulletText, contentWidth - 6);
          wrapped.forEach((wl: string, idx: number) => {
            checkPage(lineHeight);
            if (idx === 0) {
              doc.text("•", margin + 2, y);
              doc.text(wl, margin + 7, y);
            } else {
              doc.text(wl, margin + 7, y);
            }
            y += lineHeight;
          });
        } else if (/^\*\*(.+)\*\*$/.test(line.trim())) {
          checkPage(lineHeight);
          const text = line.trim().replace(/^\*\*|\*\*$/g, "");
          doc.setFont("helvetica", "bold");
          const wrapped = doc.splitTextToSize(text, contentWidth);
          wrapped.forEach((wl: string) => {
            checkPage(lineHeight);
            doc.text(wl, margin, y);
            y += lineHeight;
          });
          doc.setFont("helvetica", "normal");
        } else if (line.trim()) {
          const text = line.replace(/\*\*/g, "");
          const wrapped = doc.splitTextToSize(text, contentWidth);
          wrapped.forEach((wl: string) => {
            checkPage(lineHeight);
            doc.text(wl, margin, y);
            y += lineHeight;
          });
        } else {
          y += 2.5;
        }
      }

      doc.save("tailored_resume.pdf");
    } catch {
      const element = document.createElement("a");
      const file = new Blob([content], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = "tailored_resume.txt";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const downloadCoverLetterPDF = (content: string) => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 25;
      const lineHeight = 7;
      const paraGap = 5;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const checkPage = (needed: number) => {
        if (y + needed > pageHeight - margin) { doc.addPage(); y = margin; }
      };

      const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(today, margin, y);
      if (jobTitle) doc.text(`Re: ${jobTitle}`, pageWidth - margin, y, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += 4;
      doc.setDrawColor(212, 107, 71);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      doc.setDrawColor(0);
      y += 10;

      doc.setFontSize(11.5);

      for (const line of content.split("\n")) {
        if (!line.trim()) {
          y += paraGap;
          continue;
        }
        const text = line.replace(/\*\*/g, "");
        const wrapped = doc.splitTextToSize(text, contentWidth);
        wrapped.forEach((wl: string) => {
          checkPage(lineHeight);
          doc.text(wl, margin, y);
          y += lineHeight;
        });
      }

      doc.save("cover_letter.pdf");
    } catch {
      const element = document.createElement("a");
      const file = new Blob([content], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = "cover_letter.txt";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="px-6 md:px-8 pt-6 pb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">Tailor Your Resume</h2>
          <p className="text-sm text-stone-500 mt-1">
            Upload your resume and paste a job description — we&apos;ll craft a tailored resume and cover letter.
          </p>
        </div>

        {/* Usage badge */}
        {isSignedIn && usage && !usage.is_pro && (
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-stone-500">
              <span className={`font-bold ${usage.remaining === 0 ? "text-red-500" : "text-primary-500"}`}>
                {usage.remaining}
              </span>
              {" "}free tailor{usage.remaining !== 1 ? "s" : ""} left
            </p>
            <button
              type="button"
              onClick={onShowPricing}
              className="text-xs text-primary-500 underline underline-offset-2 hover:text-primary-700 mt-0.5 transition-colors"
            >
              Upgrade for unlimited
            </button>
          </div>
        )}
        {isSignedIn && usage?.is_pro && (
          <span className="flex-shrink-0 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-100 px-3 py-1 rounded-full">
            Pro — unlimited
          </span>
        )}
        {!isSignedIn && (
          <SignInButton mode="modal">
            <button
              type="button"
              className="flex-shrink-0 text-xs font-medium text-stone-500 hover:text-stone-900 border border-stone-200 px-3 py-1.5 rounded-xl hover:border-stone-300 transition-colors"
            >
              Sign in to track usage
            </button>
          </SignInButton>
        )}
      </div>

      {/* Form — full-width dividers between sections */}
      <form onSubmit={handleTailor} className="divide-y divide-stone-100 border-t border-stone-100">

        {/* Section 1 — Resume */}
        <div className="px-6 md:px-8 py-6 space-y-4">
          {sectionHeader("1", "Your Resume")}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Upload Resume{" "}
              <span className="text-stone-400 font-normal">PDF, DOCX, or TXT</span>
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.docx,.txt"
              className="w-full px-3.5 py-2.5 border border-dashed border-stone-200 rounded-xl text-sm text-stone-600 cursor-pointer hover:border-primary-300 hover:bg-primary-50/20 transition-colors file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"
            />
            {uploading && (
              <p className="text-xs text-primary-500 mt-2 font-medium">Scanning for profile links…</p>
            )}
            {resumeFile && !uploading && (
              <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {resumeFile.name} ready
              </p>
            )}
          </div>

          {!resumeFile && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Or paste resume text
              </label>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume content here…"
                rows={6}
                className={`${inputClass} resize-none`}
              />
            </div>
          )}
        </div>

        {/* Section 2 — Online Profiles */}
        <div className="px-6 md:px-8 py-6 space-y-4">
          {sectionHeader("2", "Online Profiles")}
          <p className="text-xs text-stone-400 -mt-3">
            Automatically extracted from your resume — edit or clear as needed.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              { label: "LinkedIn",  value: linkedinUrl,  set: setLinkedinUrl,  key: "linkedin"  as const, placeholder: "linkedin.com/in/yourprofile" },
              { label: "Portfolio", value: portfolioUrl, set: setPortfolioUrl, key: "portfolio" as const, placeholder: "yourportfolio.com"            },
              { label: "GitHub",    value: githubUrl,    set: setGithubUrl,    key: "github"    as const, placeholder: "github.com/yourhandle"       },
            ]).map(({ label, value, set, key, placeholder }) => (
              <div key={key}>
                <label className="text-sm font-medium text-stone-700 mb-1.5 flex items-center gap-1.5">
                  {label}
                  {autoDetected[key] && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-100 px-2 py-0.5 rounded-full">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                      </svg>
                      Auto-detected
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => {
                    set(e.target.value);
                    setAutoDetected((prev) => ({ ...prev, [key]: false }));
                  }}
                  placeholder={placeholder}
                  className={`${inputClass} ${autoDetected[key] ? "border-primary-200 bg-primary-50/30" : ""}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3 — Target Job */}
        <div className="px-6 md:px-8 py-6 space-y-4">
          {sectionHeader("3", "Target Job")}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Job Title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Senior Software Engineer"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Job Description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here…"
              rows={7}
              className={`${inputClass} resize-none`}
              required
            />
          </div>
        </div>

        {/* Submit */}
        <div className="px-6 md:px-8 py-6">
          <button
            type="submit"
            disabled={loading || uploading || (!resumeText && !resumeFile)}
            className="w-full bg-primary-500 hover:bg-primary-600 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-150 text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Tailoring your resume…
              </span>
            ) : (
              "Generate Tailored Resume"
            )}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="border-t border-stone-100 px-6 md:px-8 pt-4 pb-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Results */}
      {structure && (
        <div className="border-t border-stone-100 px-6 md:px-8 pt-6 pb-7 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">Tailored Resume</h3>
              <Tooltip content="Blocks appear as each section finishes generating. Cycle alternates, drag to reorder, or regenerate any bullet.">
                <span className="text-stone-300 text-xs cursor-help">ⓘ</span>
              </Tooltip>
            </div>
            <button
              type="button"
              onClick={() => downloadResumePDF(structureToMarkdown(structure))}
              className="text-xs font-semibold text-white bg-stone-900 hover:bg-stone-700 active:scale-[0.97] px-3.5 py-1.5 rounded-xl transition-all duration-150"
            >
              Download PDF
            </button>
          </div>

          <BlockCanvas
            entries={structure.entries}
            onEntriesChange={(entries) => setStructure((prev) => (prev ? { ...prev, entries } : prev))}
            jobDescription={jobDescription}
            getToken={getToken}
          />

          <LatexPreview
            structure={structure}
            linkedinUrl={linkedinUrl}
            githubUrl={githubUrl}
            portfolioUrl={portfolioUrl}
          />

          <div className="border border-stone-100 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 flex justify-between items-center border-b border-stone-100 bg-stone-50/60">
              <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">Cover Letter</h3>
              {coverLetter && (
                <button
                  onClick={() => downloadCoverLetterPDF(coverLetter)}
                  className="text-xs font-semibold text-white bg-stone-900 hover:bg-stone-700 active:scale-[0.97] px-3.5 py-1.5 rounded-xl transition-all duration-150"
                >
                  Download PDF
                </button>
              )}
            </div>
            <div className="px-5 py-4 max-h-80 overflow-y-auto whitespace-pre-wrap text-xs text-stone-700 leading-relaxed font-mono bg-white">
              {coverLetterLoading && !coverLetter ? (
                <div className="space-y-2 py-2">
                  <div className="h-2.5 bg-stone-100 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-stone-100 rounded animate-pulse w-11/12" />
                  <div className="h-2.5 bg-stone-100 rounded animate-pulse w-4/5" />
                  <div className="h-2.5 bg-stone-100 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-stone-100 rounded animate-pulse w-2/3" />
                </div>
              ) : (
                coverLetter
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
