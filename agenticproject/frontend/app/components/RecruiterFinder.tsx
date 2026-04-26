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
  "w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none text-sm transition-all placeholder:text-gray-400 bg-white";

export default function RecruiterFinder({ onRecruitersFound, recruiterData }: RecruiterFinderProps) {
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);

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
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Find Recruiters</h2>
        <p className="text-sm text-gray-500 mt-1">Locate hiring managers and recruiters at your target companies.</p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4 mb-8">
        <div className="bg-gray-50/60 rounded-2xl border border-gray-100 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Google, Microsoft, Figma"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                Job Title <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Software Engineer, Product Manager"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold py-3.5 rounded-xl hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm text-base tracking-tight"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {recruiters.length > 0 && (
        <div className="space-y-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {recruiters.length} recruiter{recruiters.length !== 1 ? "s" : ""} found
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recruiters.map((recruiter, idx) => (
              <div
                key={idx}
                className="group border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-primary-100 transition-all bg-white"
              >
                <div className="mb-3">
                  <h4 className="font-bold text-gray-900 text-base">{recruiter.name}</h4>
                  <p className="text-sm font-semibold text-primary-600 mt-0.5">{recruiter.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">at {recruiter.company}</p>
                </div>

                {recruiter.connection_strategy && (
                  <p className="mb-3 bg-amber-50 px-3 py-2 rounded-xl text-xs text-amber-800 border border-amber-100 font-medium">
                    {recruiter.connection_strategy}
                  </p>
                )}

                {recruiter.linkedin_url && (
                  <a
                    href={recruiter.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition-colors border border-primary-100"
                  >
                    LinkedIn Profile
                    <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-widest mb-3">Outreach Tips</h4>
            <ul className="space-y-2 text-sm text-amber-800">
              {[
                "Personalize your message referencing their recent activity or posts",
                "Mention mutual connections or companies you've both worked at",
                "Keep initial message under 50 words — just request a 15-min call",
                "Send on Tuesday–Thursday, 10am–3pm for best response rates",
                "Include a link to your tailored resume or portfolio",
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold flex-shrink-0 mt-0.5">✓</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!loading && recruiters.length === 0 && companyName && (
        <div className="text-center py-16 text-gray-400">
          <p className="font-semibold">No recruiters found.</p>
          <p className="text-sm mt-1">Try a different company name or check LinkedIn directly.</p>
        </div>
      )}
    </div>
  );
}
