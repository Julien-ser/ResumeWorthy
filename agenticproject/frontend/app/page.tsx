"use client";

import { useState } from "react";
import Header from "@/components/Header";
import JobSearch from "@/components/JobSearch";
import ResumeTailor from "@/components/ResumeTailor";
import RecruiterFinder from "@/components/RecruiterFinder";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"search" | "tailor" | "recruiters">("search");
  const [jobData, setJobData] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [recruiterData, setRecruiterData] = useState(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Tab Navigation */}
        <div className="flex gap-4 mb-8 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("search")}
            className={`px-6 py-3 font-semibold transition-all ${
              activeTab === "search"
                ? "text-primary-600 border-b-2 border-primary-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Job Search
          </button>
          <button
            onClick={() => setActiveTab("tailor")}
            className={`px-6 py-3 font-semibold transition-all ${
              activeTab === "tailor"
                ? "text-primary-600 border-b-2 border-primary-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Resume Tailor
          </button>
          <button
            onClick={() => setActiveTab("recruiters")}
            className={`px-6 py-3 font-semibold transition-all ${
              activeTab === "recruiters"
                ? "text-primary-600 border-b-2 border-primary-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Find Recruiters
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {activeTab === "search" && (
            <JobSearch onJobsFound={setJobData} jobData={jobData} />
          )}
          {activeTab === "tailor" && (
            <ResumeTailor onResumeTailored={setResumeData} resumeData={resumeData} />
          )}
          {activeTab === "recruiters" && (
            <RecruiterFinder onRecruitersFound={setRecruiterData} recruiterData={recruiterData} />
          )}
        </div>

        {/* Action Flow Info */}
        <div className="mt-12 bg-primary-50 border border-primary-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-2">How to Use</h2>
          <ol className="space-y-2 text-primary-800">
            <li>1. <strong>Search jobs</strong> using keywords, location, and experience level</li>
            <li>2. <strong>Tailor your resume</strong> for specific roles with cover letter generation</li>
            <li>3. <strong>Find recruiters</strong> at target companies for direct outreach</li>
          </ol>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-gray-600 text-sm">
          <p>ResumeWorthy Agentic • Job Search & Resume Optimization</p>
        </div>
      </footer>
    </div>
  );
}
