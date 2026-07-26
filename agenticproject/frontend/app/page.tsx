"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import Header from "@/components/Header";
import JobSearch from "@/components/JobSearch";
import ResumeTailor from "@/components/ResumeTailor";
import RecruiterFinder from "@/components/RecruiterFinder";
import PricingModal from "@/components/PricingModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TABS = [
  { id: "search",     label: "Job Search"      },
  { id: "tailor",     label: "Resume Tailor"   },
  { id: "recruiters", label: "Find Recruiters" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function Home() {
  const { isSignedIn, getToken } = useAuth();
  const [activeTab, setActiveTab]       = useState<Tab>("search");
  const [jobData, setJobData]           = useState(null);
  const [resumeData, setResumeData]     = useState(null);
  const [recruiterData, setRecruiterData] = useState(null);
  const [pricingOpen, setPricingOpen]   = useState(false);

  // Shared across tabs: the raw candidate resume text (not the tailored
  // output) so Job Search can use it for match scoring without asking the
  // user to re-upload, and so it's preloaded even before they visit the
  // Resume Tailor tab this session, per a saved account resume.
  const [sharedResumeText, setSharedResumeText] = useState("");
  const [resumeLoaded, setResumeLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      window.history.replaceState({}, "", "/");
    }
    if (params.get("cancelled") === "true") {
      setPricingOpen(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    const loadSavedResume = async () => {
      if (!isSignedIn) {
        setResumeLoaded(true);
        return;
      }
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/my-resume`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.resume_text) setSharedResumeText(data.resume_text);
        }
      } catch {
        // no saved resume yet, or request failed -- fine, just start empty
      } finally {
        setResumeLoaded(true);
      }
    };
    loadSavedResume();
  }, [isSignedIn]);

  return (
    <div className="min-h-screen bg-stone-50">
      <Header onUpgrade={() => setPricingOpen(true)} />

      <main className="container mx-auto px-4 py-8 max-w-4xl">

        {/* Unified card: tab bar + content */}
        <div className="bg-white rounded-2xl border border-stone-200/70 shadow-[0_1px_4px_0_rgb(0,0,0,0.04)] overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-stone-100">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-stone-900"
                    : "text-stone-400 hover:text-stone-700"
                }`}
              >
                {tab.label}
                {/* Underline indicator — fades in/out */}
                <span
                  className={`absolute bottom-0 left-4 right-4 h-[2px] bg-primary-500 rounded-full transition-opacity duration-200 ${
                    activeTab === tab.id ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "search" && (
            <JobSearch
              onJobsFound={setJobData}
              jobData={jobData}
              sharedResumeText={sharedResumeText}
              resumeLoaded={resumeLoaded}
            />
          )}
          {activeTab === "tailor" && (
            <ResumeTailor
              onResumeTailored={setResumeData}
              resumeData={resumeData}
              onShowPricing={() => setPricingOpen(true)}
              onResumeTextChange={setSharedResumeText}
            />
          )}
          {activeTab === "recruiters" && (
            <RecruiterFinder onRecruitersFound={setRecruiterData} recruiterData={recruiterData} />
          )}
        </div>

        {/* How it works */}
        <div className="mt-10 border-t border-stone-100 pt-8">
          <p className="text-[10px] font-semibold tracking-widest text-stone-400 uppercase mb-6">
            How it works
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {([
              {
                n: "01",
                title: "Search Jobs",
                body: "Find relevant openings using keywords and location across the web.",
              },
              {
                n: "02",
                title: "Tailor Your Resume",
                body: "Upload your PDF and get a tailored resume plus cover letter in seconds.",
              },
              {
                n: "03",
                title: "Find Recruiters",
                body: "Locate hiring managers at target companies for direct outreach.",
              },
            ] as const).map((s) => (
              <div key={s.n} className="flex gap-4">
                <span className="text-xl font-light font-mono text-primary-300 flex-shrink-0 leading-none mt-0.5">
                  {s.n}
                </span>
                <div>
                  <p className="text-sm font-semibold text-stone-900 mb-1">{s.title}</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-100 mt-16 py-6">
        <div className="container mx-auto px-4 text-center text-stone-400 text-xs">
          ResumeWorthy &bull; Job Search &amp; Resume Optimization
        </div>
      </footer>

      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  );
}
