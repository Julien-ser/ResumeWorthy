"use client";

import { useState } from "react";

interface Recruiter {
  name: string;
  title: string;
  company: string;
  linkedin_url?: string;
  connection_strategy?: string;
}

interface RecruiterFinderProps {
  onRecruitersFound: (data: any) => void;
  recruiterData: any;
}

const inputClass =
  "w-full px-3.5 py-2.5 border border-stone-200 rounded-xl bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-400 focus:outline-none transition-colors";

const OUTREACH_TIPS = [
  "Personalize your message referencing their recent activity or posts",
  "Mention mutual connections or companies you have both worked at",
  "Keep the initial message under 50 words — just request a 15-min call",
  "Send on Tuesday through Thursday, 10am to 3pm for best response rates",
  "Include a link to your tailored resume or portfolio",
];

export default function RecruiterFinder({ onRecruitersFound, recruiterData }: RecruiterFinderProps) {
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [recruiters, setRecruiters]   = useState<Recruiter[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setRecruiters([]);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/find-recruiters`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: companyName,
            job_title: jobTitle,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to find recruiters");

      const data = await response.json();
      setRecruiters(data.recruiters || []);
      onRecruitersFound(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 md:px-8 py-6 md:py-7">

      {/* Section heading */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-stone-900 tracking-tight">Find Recruiters</h2>
        <p className="text-sm text-stone-500 mt-1">
          Locate hiring managers and recruiters at your target companies.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSearch} className="space-y-4 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-widest mb-1.5">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Google, Figma, Shopify…"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-widest mb-1.5">
              Job Title{" "}
              <span className="normal-case font-normal text-stone-400">optional</span>
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Software Engineer, Product Manager…"
              className={inputClass}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-500 hover:bg-primary-600 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-150 text-sm"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Searching…
            </span>
          ) : (
            "Find Recruiters"
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-6">
          {error}
        </div>
      )}

      {/* Results */}
      {recruiters.length > 0 && (
        <div className="space-y-6">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest">
            {recruiters.length} recruiter{recruiters.length !== 1 ? "s" : ""} found
          </p>

          {/* Recruiter list */}
          <div className="divide-y divide-stone-100">
            {recruiters.map((recruiter, idx) => (
              <div key={idx} className="py-4 first:pt-0">
                <div className="mb-2">
                  <h4 className="font-semibold text-stone-900 text-sm">{recruiter.name}</h4>
                  <p className="text-sm text-primary-500 font-medium mt-0.5">{recruiter.title}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{recruiter.company}</p>
                </div>

                {recruiter.connection_strategy && (
                  <p className="mb-3 text-xs text-stone-500 bg-stone-50 px-3 py-2.5 rounded-xl italic leading-relaxed">
                    {recruiter.connection_strategy}
                  </p>
                )}

                {recruiter.linkedin_url && (
                  <a
                    href={recruiter.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors group"
                  >
                    LinkedIn Profile
                    <svg
                      className="w-3 h-3 group-hover:translate-x-0.5 transition-transform duration-150"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Outreach tips */}
          <div className="border-t border-stone-100 pt-6">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-4">
              Outreach Tips
            </p>
            <ul className="space-y-2.5">
              {OUTREACH_TIPS.map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <svg
                    className="w-3.5 h-3.5 text-primary-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs text-stone-600 leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && recruiters.length === 0 && companyName && (
        <div className="text-center py-16">
          <p className="font-medium text-sm text-stone-500">No recruiters found</p>
          <p className="text-xs mt-1 text-stone-400">Try a different company name or check LinkedIn directly.</p>
        </div>
      )}
    </div>
  );
}
