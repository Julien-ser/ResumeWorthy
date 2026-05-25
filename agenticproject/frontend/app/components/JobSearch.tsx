"use client";

import { useState } from "react";

interface Job {
  title: string;
  company: string;
  location: string;
  link: string;
  salary?: string;
  description?: string;
}

interface JobSearchProps {
  onJobsFound: (data: any) => void;
  jobData: any;
}

const inputClass =
  "w-full px-3.5 py-2.5 border border-stone-200 rounded-xl bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-400 focus:outline-none transition-colors";

export default function JobSearch({ onJobsFound, jobData }: JobSearchProps) {
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("mid");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [jobs, setJobs]         = useState<Job[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setJobs([]);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/search-jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_title: keywords,
            target_location: location,
            max_results: 10,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to search jobs");

      const data = await response.json();
      setJobs(data.jobs || []);
      onJobsFound(data);
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
        <h2 className="text-xl font-bold text-stone-900 tracking-tight">Search Jobs</h2>
        <p className="text-sm text-stone-500 mt-1">Find relevant openings using keywords and location.</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSearch} className="space-y-4 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-widest mb-1.5">
              Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Software Engineer, Product Manager…"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-widest mb-1.5">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Toronto, Remote, San Francisco…"
              className={inputClass}
              required
            />
          </div>
        </div>

        <div className="max-w-xs">
          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-widest mb-1.5">
            Experience Level
          </label>
          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            className={inputClass}
          >
            <option value="entry">Entry Level</option>
            <option value="mid">Mid Level</option>
            <option value="senior">Senior Level</option>
            <option value="lead">Lead / Manager</option>
          </select>
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
            "Search Jobs"
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
      {jobs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-4">
            {jobs.length} result{jobs.length !== 1 ? "s" : ""} found
          </p>

          <div className="divide-y divide-stone-100">
            {jobs.map((job, idx) => (
              <div key={idx} className="py-4 first:pt-0">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-stone-900 text-sm">{job.title}</h4>
                    <p className="text-sm text-primary-500 font-medium mt-0.5">{job.company}</p>
                  </div>
                  {job.salary && (
                    <span className="flex-shrink-0 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                      {job.salary}
                    </span>
                  )}
                </div>

                <p className="text-xs text-stone-400 mb-3 flex items-center gap-1.5">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {job.location}
                </p>

                {job.description && (
                  <p className="text-xs text-stone-500 mb-3 line-clamp-2 leading-relaxed">
                    {job.description}
                  </p>
                )}

                <a
                  href={job.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors group"
                >
                  View Posting
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && jobs.length === 0 && keywords && (
        <div className="text-center py-16">
          <p className="font-medium text-sm text-stone-500">No jobs found</p>
          <p className="text-xs mt-1 text-stone-400">Try different keywords or a broader location.</p>
        </div>
      )}
    </div>
  );
}
