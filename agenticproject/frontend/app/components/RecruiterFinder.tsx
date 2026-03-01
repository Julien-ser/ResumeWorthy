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

      if (!response.ok) {
        throw new Error("Failed to find recruiters");
      }

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
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Find Recruiters</h2>

      <form onSubmit={handleSearch} className="space-y-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g., Google, Microsoft, Figma"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>

          {/* Job Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Title (Optional)
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Software Engineer, Product Manager"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold py-3 rounded-lg hover:from-primary-700 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Searching..." : "Find Recruiters"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Results */}
      {recruiters.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Found {recruiters.length} Recruiters
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recruiters.map((recruiter, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="mb-3">
                  <h4 className="font-semibold text-gray-900 text-lg">{recruiter.name}</h4>
                  <p className="text-sm text-indigo-600 font-medium">{recruiter.title}</p>
                  <p className="text-xs text-gray-600 mt-1">at {recruiter.company}</p>
                </div>

                {recruiter.connection_strategy && (
                  <div className="mb-3 bg-blue-50 p-3 rounded text-xs text-blue-800 border border-blue-100">
                    <strong>Outreach:</strong> {recruiter.connection_strategy}
                  </div>
                )}

                {recruiter.linkedin_url && (
                  <a
                    href={recruiter.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-primary-50 text-primary-600 rounded hover:bg-primary-100 text-sm font-medium transition-colors"
                  >
                    LinkedIn Profile →
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Outreach Tips */}
          <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-6">
            <h4 className="font-semibold text-green-900 mb-3">Recruiter Outreach Tips</h4>
            <ul className="space-y-2 text-green-800 text-sm">
              <li>✓ Personalize your message referencing their recent activity or posts</li>
              <li>✓ Mention mutual connections or companies you've both worked at</li>
              <li>✓ Keep initial message under 50 words - just request 15-min call</li>
              <li>✓ Send on Tuesday-Thursday, 10am-3pm for best response rates</li>
              <li>✓ Include a link to your tailored resume or portfolio</li>
            </ul>
          </div>
        </div>
      )}

      {!loading && recruiters.length === 0 && companyName && (
        <div className="text-center py-12 text-gray-500">
          <p>No recruiters found. Try a different company name or check LinkedIn directly.</p>
        </div>
      )}
    </div>
  );
}
