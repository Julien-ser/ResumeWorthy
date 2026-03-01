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

      if (!response.ok) {
        throw new Error("Failed to search jobs");
      }

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
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Search Jobs</h2>

      <form onSubmit={handleSearch} className="space-y-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g., Software Engineer, Data Scientist"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Toronto, Remote, San Francisco"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>

          {/* Experience Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Experience Level
            </label>
            <select
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="entry">Entry Level</option>
              <option value="mid">Mid Level</option>
              <option value="senior">Senior Level</option>
              <option value="lead">Lead/Manager</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold py-3 rounded-lg hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Searching..." : "Search Jobs"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Found {jobs.length} Jobs
          </h3>
          <div className="space-y-4">
            {jobs.map((job, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{job.title}</h4>
                    <p className="text-sm text-indigo-600 font-medium">{job.company}</p>
                  </div>
                  {job.salary && (
                    <span className="text-sm font-medium text-green-600 ml-4">{job.salary}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-3">📍 {job.location}</p>
                {job.description && (
                  <p className="text-xs text-gray-600 mb-3 line-clamp-2">{job.description}</p>
                )}
                <a
                  href={job.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-primary-50 text-primary-600 rounded hover:bg-primary-100 text-sm font-medium transition-colors"
                >
                  View Job →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && jobs.length === 0 && keywords && (
        <div className="text-center py-12 text-gray-500">
          <p>No jobs found. Try different search terms.</p>
        </div>
      )}
    </div>
  );
}
