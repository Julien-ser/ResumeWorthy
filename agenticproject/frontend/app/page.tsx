"use client";

import { useState } from "react";
import Header from "@/components/Header";
import JobSearch from "@/components/JobSearch";
import ResumeTailor from "@/components/ResumeTailor";
import RecruiterFinder from "@/components/RecruiterFinder";

const TABS = [
  { id: "search", label: "Job Search" },
  { id: "tailor", label: "Resume Tailor" },
  { id: "recruiters", label: "Find Recruiters" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [jobData, setJobData] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [recruiterData, setRecruiterData] = useState(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50/30">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Pill Tab Navigation */}
        <div className="flex gap-1 mb-6 bg-gray-100/80 p-1 rounded-2xl backdrop-blur-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-white text-primary-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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

        {/* How to Use */}
        <div className="mt-8 bg-gradient-to-r from-primary-50 to-orange-50 border border-primary-100 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-primary-800 uppercase tracking-widest mb-3">How to Use</h2>
          <ol className="space-y-2 text-sm text-primary-900">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
              <span><strong>Search jobs</strong> using keywords and location to find relevant openings</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
              <span><strong>Tailor your resume</strong> for a specific role — upload your PDF and get a tailored resume + cover letter</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
              <span><strong>Find recruiters</strong> at target companies for direct outreach</span>
            </li>
          </ol>
        </div>
      </main>

      <footer className="border-t border-gray-100 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-gray-400 text-xs font-medium">
          ResumeWorthy &bull; Job Search &amp; Resume Optimization
        </div>
      </footer>
    </div>
  );
}
