"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";

interface ResumeTailorProps {
  onResumeTailored: (data: any) => void;
  resumeData: any;
}

export default function ResumeTailor({ onResumeTailored, resumeData }: ResumeTailorProps) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [cachedResumeText, setCachedResumeText] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [autoDetected, setAutoDetected] = useState({ linkedin: false, portfolio: false, github: false });
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [tailoredResume, setTailoredResume] = useState("");
  const [coverLetter, setCoverLetter] = useState("");

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

      const uploadResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/upload-resume`,
        { method: "POST", body: formData }
      );

      if (!uploadResponse.ok) {
        let detail = "Failed to upload resume";
        try { const d = await uploadResponse.json(); if (d?.detail) detail = String(d.detail); } catch {}
        throw new Error(detail);
      }

      const uploadData = await uploadResponse.json();
      setCachedResumeText(uploadData.text || "");

      const detected = uploadData.detected_urls || {};
      const newAutoDetected = { linkedin: false, portfolio: false, github: false };

      if (detected.linkedin && !linkedinUrl) {
        setLinkedinUrl(detected.linkedin);
        newAutoDetected.linkedin = true;
      }
      if (detected.github && !githubUrl) {
        setGithubUrl(detected.github);
        newAutoDetected.github = true;
      }
      if (detected.portfolio && !portfolioUrl) {
        setPortfolioUrl(detected.portfolio);
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
    setTailoredResume("");
    setCoverLetter("");

    try {
      let resumeContent = resumeFile ? cachedResumeText : resumeText;

      if (resumeFile && !resumeContent) {
        const formData = new FormData();
        formData.append("file", resumeFile);
        const uploadResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/upload-resume`,
          { method: "POST", body: formData }
        );
        if (!uploadResponse.ok) {
          let detail = "Failed to upload resume";
          try { const d = await uploadResponse.json(); if (d?.detail) detail = String(d.detail); } catch {}
          throw new Error(detail);
        }
        const uploadData = await uploadResponse.json();
        resumeContent = uploadData.text;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/tailor-resume`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resume_text: resumeContent,
            job_description: jobDescription,
            company_name: jobTitle,
            linkedin_url: linkedinUrl,
            portfolio_url: portfolioUrl,
            github_url: githubUrl,
          }),
        }
      );

      if (!response.ok) {
        let detail = "Failed to tailor resume";
        try { const d = await response.json(); if (d?.detail) detail = String(d.detail); } catch {}
        throw new Error(detail);
      }

      const data = await response.json();
      setTailoredResume(data.tailored_resume || "");
      setCoverLetter(data.cover_letter || "");
      onResumeTailored(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = (content: string, filename: string) => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18;
      const lineHeight = 5.5;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const checkPage = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      const lines = content.split("\n");

      lines.forEach((line) => {
        if (line.startsWith("# ")) {
          checkPage(lineHeight + 8);
          const text = line.replace(/^# /, "").replace(/\*\*/g, "");
          doc.setFontSize(20);
          doc.setFont("helvetica", "bold");
          doc.text(text, margin, y);
          y += lineHeight + 2;
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
      });

      doc.save(filename);
    } catch {
      const element = document.createElement("a");
      const file = new Blob([content], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = filename.replace(".pdf", ".txt");
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const inputClass =
    "w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none text-sm transition-all placeholder:text-gray-400";

  const sectionClass = "bg-gray-50/60 rounded-2xl border border-gray-100 p-6 space-y-4";

  const sectionHeader = (step: string, title: string) => (
    <div className="flex items-center gap-3 mb-1">
      <span className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
        {step}
      </span>
      <h3 className="text-base font-bold text-gray-800">{title}</h3>
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Tailor Your Resume</h2>
        <p className="text-sm text-gray-500 mt-1">Upload your resume and paste a job description — we'll craft a tailored resume and cover letter.</p>
      </div>

      <form onSubmit={handleTailor} className="space-y-4">
        {/* Section 1 – Resume */}
        <div className={sectionClass}>
          {sectionHeader("1", "Your Resume")}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              Upload Resume <span className="text-gray-400 font-normal">(PDF, DOCX, or TXT)</span>
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.docx,.txt"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
            />
            {uploading && (
              <p className="text-xs text-primary-600 mt-2 font-medium">Scanning for profile links…</p>
            )}
            {resumeFile && !uploading && (
              <p className="text-xs text-green-600 mt-2 font-medium">✓ {resumeFile.name} ready</p>
            )}
          </div>

          {!resumeFile && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                Or Paste Resume Text
              </label>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume content here..."
                rows={6}
                className={`${inputClass} resize-none`}
              />
            </div>
          )}
        </div>

        {/* Section 2 – Online Profiles */}
        <div className={sectionClass}>
          {sectionHeader("2", "Online Profiles")}
          <p className="text-xs text-gray-500 -mt-2">Automatically extracted from your resume — edit or clear as needed.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label: "LinkedIn",
                value: linkedinUrl,
                set: setLinkedinUrl,
                key: "linkedin" as const,
                placeholder: "linkedin.com/in/yourprofile",
              },
              {
                label: "Portfolio",
                value: portfolioUrl,
                set: setPortfolioUrl,
                key: "portfolio" as const,
                placeholder: "yourportfolio.com",
              },
              {
                label: "GitHub",
                value: githubUrl,
                set: setGithubUrl,
                key: "github" as const,
                placeholder: "github.com/yourhandle",
              },
            ].map(({ label, value, set, key, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
                  {label}
                  {autoDetected[key] && (
                    <span className="text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-2 py-0.5 rounded-full">
                      ✓ Auto-detected
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
                  className={`${inputClass} ${autoDetected[key] ? "border-primary-300 bg-primary-50/40" : ""}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3 – Target Job */}
        <div className={sectionClass}>
          {sectionHeader("3", "Target Job")}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Job Title</label>
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
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Job Description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..."
              rows={7}
              className={`${inputClass} resize-none`}
              required
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || uploading || (!resumeText && !resumeFile)}
          className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold py-3.5 rounded-xl hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm text-base tracking-tight"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Tailoring Your Resume…
            </span>
          ) : (
            "Generate Tailored Resume"
          )}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mt-5 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {tailoredResume && (
        <div className="mt-8 space-y-5">
          <ResultCard
            title="Tailored Resume"
            content={tailoredResume}
            onDownload={() => downloadPDF(tailoredResume, "tailored_resume.pdf")}
          />
          {coverLetter && (
            <ResultCard
              title="Cover Letter"
              content={coverLetter}
              onDownload={() => downloadPDF(coverLetter, "cover_letter.pdf")}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  title,
  content,
  onDownload,
}: {
  title: string;
  content: string;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
      <div className="bg-gradient-to-r from-primary-50 to-orange-50/50 border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <h3 className="font-bold text-gray-900 text-base">{title}</h3>
        <button
          onClick={onDownload}
          className="px-4 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold transition-colors shadow-sm"
        >
          Download PDF
        </button>
      </div>
      <div className="p-6 bg-white max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
        {content}
      </div>
    </div>
  );
}
