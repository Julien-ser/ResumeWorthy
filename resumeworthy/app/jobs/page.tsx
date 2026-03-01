"use client";
import { useState } from "react";
import Image from "next/image";
import logo from "@/app/logo.png";
import { jsPDF } from "jspdf";

interface Job {
  company: string;
  title: string;
  location: string;
  link: string;
  description: string;
}

interface Recruiter {
  name: string;
  role: string;
  company: string;
  profile_url: string;
  notes: string;
}

interface TailoredResume {
  tailored_resume: string;
  cover_letter: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function JobsPage() {
  // Search state
  const [targetTitle, setTargetTitle] = useState("Intern AI Engineer");
  const [targetLocation, setTargetLocation] = useState("Toronto OR Remote");
  const [searchResults, setSearchResults] = useState<Job[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Resume tailoring state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [tailoredResume, setTailoredResume] = useState<TailoredResume | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);

  // Recruiter search state
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [recruiterLoading, setRecruiterLoading] = useState(false);

  // Search for jobs
  const handleSearchJobs = async () => {
    if (!targetTitle.trim()) {
      alert("Please enter a job title");
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`${API_BASE}/search-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_title: targetTitle,
          target_location: targetLocation,
          max_results: 5,
        }),
      });

      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setSearchResults(data.jobs);
    } catch (error) {
      alert(`Error searching jobs: ${error}`);
    } finally {
      setSearchLoading(false);
    }
  };

  // Tailor resume for selected job
  const handleTailorResume = async () => {
    if (!selectedJob) {
      alert("Please select a job first");
      return;
    }
    if (!resumeText.trim()) {
      alert("Please enter your resume");
      return;
    }

    setTailorLoading(true);
    try {
      const response = await fetch(`${API_BASE}/tailor-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText,
          job_description: selectedJob.description,
          linkedin_url: linkedinUrl,
          portfolio_url: portfolioUrl,
          github_url: githubUrl,
          company_name: selectedJob.company,
        }),
      });

      if (!response.ok) throw new Error("Resume tailoring failed");
      const data = await response.json();
      setTailoredResume(data);
    } catch (error) {
      alert(`Error tailoring resume: ${error}`);
    } finally {
      setTailorLoading(false);
    }
  };

  // Find recruiters
  const handleFindRecruiters = async () => {
    if (!selectedJob) {
      alert("Please select a job first");
      return;
    }

    setRecruiterLoading(true);
    try {
      const response = await fetch(`${API_BASE}/find-recruiters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: selectedJob.company,
          job_title: selectedJob.title,
          location: selectedJob.location,
        }),
      });

      if (!response.ok) throw new Error("Recruiter search failed");
      const data = await response.json();
      setRecruiters(data.recruiters);
    } catch (error) {
      alert(`Error finding recruiters: ${error}`);
    } finally {
      setRecruiterLoading(false);
    }
  };

  // Download tailored resume as PDF
  const downloadResume = () => {
    if (!tailoredResume) return;

    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text(tailoredResume.tailored_resume, 10, 10, { maxWidth: 190 });
    doc.save(`tailored-resume-${selectedJob?.company}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src={logo} alt="ResumeWorthy" width={40} height={40} />
            <h1 className="text-2xl font-bold text-indigo-600">Job Applications</h1>
          </div>
          <nav className="flex gap-6">
            <a href="/" className="text-gray-600 hover:text-indigo-600 font-medium">
              Resume Builder
            </a>
            <a href="/jobs" className="text-indigo-600 font-medium">
              Job Applications
            </a>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Job Search Section */}
        <section className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">🔍 Find Jobs</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Job Title
              </label>
              <input
                type="text"
                value={targetTitle}
                onChange={(e) => setTargetTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g., Senior Engineer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location(s)
              </label>
              <input
                type="text"
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g., Toronto OR Remote"
              />
            </div>
          </div>

          <button
            onClick={handleSearchJobs}
            disabled={searchLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
          >
            {searchLoading ? "Searching..." : "Search Jobs"}
          </button>
        </section>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <section className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Results ({searchResults.length})</h2>

            <div className="space-y-4">
              {searchResults.map((job, idx) => (
                <div
                  key={idx}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                    selectedJob?.link === job.link
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300"
                  }`}
                  onClick={() => setSelectedJob(job)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">{job.title}</h3>
                      <p className="text-gray-600">{job.company}</p>
                      <p className="text-sm text-gray-500">{job.location}</p>
                    </div>
                    <a
                      href={job.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Job
                    </a>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{job.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Resume Tailoring Section */}
        {selectedJob && (
          <section className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">
              📄 Tailor Resume for {selectedJob.company}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Resume
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  className="w-full h-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Paste your resume text here..."
                />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    LinkedIn URL (optional)
                  </label>
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Portfolio URL (optional)
                  </label>
                  <input
                    type="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="https://yourportfolio.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GitHub URL (optional)
                  </label>
                  <input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="https://github.com/..."
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleTailorResume}
                disabled={tailorLoading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
              >
                {tailorLoading ? "Tailoring..." : "Tailor Resume"}
              </button>

              <button
                onClick={handleFindRecruiters}
                disabled={recruiterLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
              >
                {recruiterLoading ? "Finding..." : "Find Recruiters"}
              </button>
            </div>
          </section>
        )}

        {/* Tailored Resume Output */}
        {tailoredResume && (
          <section className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">✨ Tailored Resume & Cover Letter</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Resume */}
              <div>
                <h3 className="font-bold text-lg mb-4 text-gray-800">Resume</h3>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: tailoredResume.tailored_resume
                        .replace(/\n/g, "<br />")
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/###(.*?)(?=<br|###|$)/g, "<h3>$1</h3>"),
                    }}
                  />
                </div>
                <button
                  onClick={downloadResume}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition"
                >
                  Download as PDF
                </button>
              </div>

              {/* Cover Letter */}
              <div>
                <h3 className="font-bold text-lg mb-4 text-gray-800">Cover Letter</h3>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm">
                  {tailoredResume.cover_letter}
                </div>
                <button
                  onClick={() => {
                    const doc = new jsPDF();
                    doc.setFontSize(12);
                    doc.text(tailoredResume.cover_letter, 10, 10, { maxWidth: 190 });
                    doc.save(`cover-letter-${selectedJob?.company}.pdf`);
                  }}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition"
                >
                  Download as PDF
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Recruiters Section */}
        {recruiters.length > 0 && (
          <section className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">
              👥 Recruiters at {selectedJob?.company}
            </h2>

            <div className="space-y-4">
              {recruiters.map((recruiter, idx) => (
                <div key={idx} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">{recruiter.name}</h3>
                      <p className="text-gray-600">{recruiter.role}</p>
                    </div>
                    <a
                      href={recruiter.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium"
                    >
                      View Profile
                    </a>
                  </div>
                  <p className="text-sm text-gray-600">{recruiter.notes}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
