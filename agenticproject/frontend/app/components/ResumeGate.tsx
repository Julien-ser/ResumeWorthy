"use client";

import { useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ResumeGateProps {
  onResumeReady: (text: string) => void;
}

export default function ResumeGate({ onResumeReady }: ResumeGateProps) {
  const { isSignedIn, getToken } = useAuth();
  const [resumeText, setResumeText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = await getToken();
      const res = await fetch(`${API_URL}/upload-resume`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let detail = "Failed to upload resume";
        try { const d = await res.json(); if (d?.detail) detail = String(d.detail); } catch {}
        throw new Error(detail);
      }
      const data = await res.json();
      // /upload-resume already auto-saves to the account when signed in
      // (with an auth header) -- this just propagates the text into the
      // shared app state so the gate can close.
      onResumeReady(data.text || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process resume");
    } finally {
      setUploading(false);
    }
  };

  const handlePasteSubmit = async () => {
    if (!resumeText.trim()) return;
    setUploading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/save-resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ resume_text: resumeText }),
      });
      if (!res.ok) {
        let detail = "Failed to save resume";
        try { const d = await res.json(); if (d?.detail) detail = String(d.detail); } catch {}
        throw new Error(detail);
      }
      onResumeReady(resumeText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save resume");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200/70 shadow-[0_1px_4px_0_rgb(0,0,0,0.04)] overflow-hidden p-8 md:p-12 text-center">
      {!isSignedIn ? (
        <>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Sign in to get started</h2>
          <p className="text-sm text-stone-500 mb-6 max-w-md mx-auto">
            ResumeWorthy tailors job search, resume tailoring, and recruiter
            finding around your resume — sign in first so it can be saved to
            your account.
          </p>
          <SignInButton mode="modal">
            <button
              type="button"
              className="bg-primary-500 hover:bg-primary-600 active:scale-[0.97] text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all duration-150"
            >
              Sign In
            </button>
          </SignInButton>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Upload your resume to continue</h2>
          <p className="text-sm text-stone-500 mb-6 max-w-md mx-auto">
            Saved to your account — job search, resume tailoring, and
            recruiter finding all build off this from here on.
          </p>

          <label className="inline-flex items-center gap-2 border border-dashed border-stone-300 rounded-xl px-6 py-4 cursor-pointer hover:border-primary-300 hover:bg-primary-50/20 transition-colors">
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFile}
              className="hidden"
              disabled={uploading}
            />
            <span className="text-sm font-medium text-stone-700">
              {uploading ? "Processing…" : "Choose a file — PDF, DOCX, or TXT"}
            </span>
          </label>

          <div className="max-w-md mx-auto mt-6 text-left">
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Or paste resume text
            </label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume content here…"
              rows={5}
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-400 focus:outline-none transition-colors resize-none"
              disabled={uploading}
            />
            <button
              type="button"
              onClick={handlePasteSubmit}
              disabled={uploading || !resumeText.trim()}
              className="mt-2 w-full bg-stone-900 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all duration-150"
            >
              {uploading ? "Saving…" : "Continue"}
            </button>
          </div>

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
        </>
      )}
    </div>
  );
}
