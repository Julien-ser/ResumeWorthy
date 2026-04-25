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

      if (!uploadResponse.ok) throw new Error("Failed to upload resume");

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
        if (!uploadResponse.ok) throw new Error("Failed to upload resume");
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

      if (!response.ok) throw new Error("Failed to tailor resume");

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
      const margin = 15;
      const lineHeight = 5;
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
          checkPage(lineHeight + 6);
          const text = line.replace(/^# /, "").replace(/\*\*/g, "");
          doc.setFontSize(18);
          doc.setFont("helvetica", "bold");
          doc.text(text, margin, y);
          y += lineHeight + 1;
          doc.setDrawColor(79, 70, 229);
          doc.setLineWidth(0.5);
          doc.line(margin, y, pageWidth - margin, y);
          doc.setDrawColor(0);
          y += 4;
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
        } else if (line.startsWith("## ")) {
          checkPage(lineHeight + 5);
          const text = line.replace(/^## /, "").replace(/\*\*/g, "");
          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          doc.text(text, margin, y);
          y += lineHeight;
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.line(margin, y, pageWidth - margin, y);
          doc.setDrawColor(0);
          y += 3;
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
        } else if (line.startsWith("### ")) {
          checkPage(lineHeight + 2);
          const text = line.replace(/^### /, "").replace(/\*\*/g, "");
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text(text, margin, y);
          y += lineHeight + 2;
          doc.setFont("helvetica", "normal");
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          const bulletText = line.replace(/^[-*] /, "").replace(/\*\*/g, "");
          const wrapped = doc.splitTextToSize(bulletText, contentWidth - 5);
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
          y += 2;
        }
      });

      doc.save(filename);
    } catch (err) {
      const element = document.createElement("a");
      const file = new Blob([content], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = filename.replace(".pdf", ".txt");
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Tailor Your Resume</h2>

      <form onSubmit={handleTailor} className="space-y-6">
        {/* Resume Input Section */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Resume</h3>

          <div className="space-y-4">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Resume (PDF, DOCX, or TXT)
              </label>
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {uploading && (
                <p className="text-sm text-indigo-600 mt-2">Scanning resume for profile links…</p>
              )}
              {resumeFile && !uploading && (
                <p className="text-sm text-green-600 mt-2">✓ {resumeFile.name} selected</p>
              )}
            </div>

            {/* Text Input Alternative */}
            {!resumeFile && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or Paste Resume Text
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume content here..."
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Profile Links Section */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Online Profiles</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LinkedIn Profile
                {autoDetected.linkedin && (
                  <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                    ✓ Auto-detected
                  </span>
                )}
              </label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinUrl(e.target.value);
                  setAutoDetected((prev) => ({ ...prev, linkedin: false }));
                }}
                placeholder="https://linkedin.com/in/yourprofile"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm ${
                  autoDetected.linkedin ? "border-indigo-400 bg-indigo-50" : "border-gray-300"
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Portfolio Website
                {autoDetected.portfolio && (
                  <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                    ✓ Auto-detected
                  </span>
                )}
              </label>
              <input
                type="url"
                value={portfolioUrl}
                onChange={(e) => {
                  setPortfolioUrl(e.target.value);
                  setAutoDetected((prev) => ({ ...prev, portfolio: false }));
                }}
                placeholder="https://yourportfolio.com"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm ${
                  autoDetected.portfolio ? "border-indigo-400 bg-indigo-50" : "border-gray-300"
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GitHub Profile
                {autoDetected.github && (
                  <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                    ✓ Auto-detected
                  </span>
                )}
              </label>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => {
                  setGithubUrl(e.target.value);
                  setAutoDetected((prev) => ({ ...prev, github: false }));
                }}
                placeholder="https://github.com/yourprofile"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm ${
                  autoDetected.github ? "border-indigo-400 bg-indigo-50" : "border-gray-300"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Job Details Section */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Target Job</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Senior Software Engineer"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Description
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here..."
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                required
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || uploading || (!resumeText && !resumeFile)}
          className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold py-3 rounded-lg hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Tailoring Resume..." : "Generate Tailored Resume"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mt-6">
          {error}
        </div>
      )}

      {/* Results */}
      {tailoredResume && (
        <div className="mt-8 space-y-6">
          {/* Tailored Resume */}
          <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Tailored Resume</h3>
              <button
                onClick={() => downloadPDF(tailoredResume, "tailored_resume.pdf")}
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm font-medium transition-colors"
              >
                Download as PDF
              </button>
            </div>
            <div className="bg-white p-4 rounded border border-gray-200 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700 font-mono">
              {tailoredResume}
            </div>
          </div>

          {/* Cover Letter */}
          {coverLetter && (
            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Generated Cover Letter</h3>
                <button
                  onClick={() => downloadPDF(coverLetter, "cover_letter.pdf")}
                  className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm font-medium transition-colors"
                >
                  Download as PDF
                </button>
              </div>
              <div className="bg-white p-4 rounded border border-gray-200 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">
                {coverLetter}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
