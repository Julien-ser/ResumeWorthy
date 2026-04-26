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
  "w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none text-sm transition-all placeholder:text-gray-400 bg-white";

export default function JobSearch({ onJobsFound, jobData }: JobSearchProps) {
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("mid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);

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
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Search Jobs</h2>
        <p className="text-sm text-gray-500 mt-1">Find relevant openings using keywords and location.</p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4 mb-8">
        <div className="bg-gray-50/60 rounded-2xl border border-gray-100 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Job Keywords</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., Software Engineer, Data Scientist"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Toronto, Remote, San Francisco"
                className={inputClass}
                required
              />
            </div>
          </div>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Experience Level</label>
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
            "Search Jobs"
          )}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {jobs.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
            {jobs.length} result{jobs.length !== 1 ? "s" : ""} found
          </p>
          <div className="space-y-3">
            {jobs.map((job, idx) => (
              <div
                key={idx}
                className="group border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-primary-100 transition-all bg-white"
              >
                <div className="flex justify-between items-start gap-4 mb-1">
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-900 truncate">{job.title}</h4>
                    <p className="text-sm font-semibold text-primary-600 mt-0.5">{job.company}</p>
                  </div>
                  {job.salary && (
                    <span className="flex-shrink-0 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                      {job.salary}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">📍 {job.location}</p>
                {job.description && (
                  <p className="text-xs text-gray-500 mb-4 line-clamp-2 leading-relaxed">{job.description}</p>
                )}
                <a
                  href={job.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition-colors border border-primary-100"
                >
                  View Job
                  <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && jobs.length === 0 && keywords && (
        <div className="text-center py-16 text-gray-400">
          <p className="font-semibold">No jobs found.</p>
          <p className="text-sm mt-1">Try different keywords or a broader location.</p>
        </div>
      )}
    </div>
  );
}
