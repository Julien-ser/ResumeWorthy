"use client";

import { useEffect, useRef, useState } from "react";
import Tooltip from "./Tooltip";
import { hashString } from "../lib/hash";
import type { ResumeStructure } from "../lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEBOUNCE_MS = 800;

interface LatexPreviewProps {
  structure: ResumeStructure;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

type Status = "idle" | "loading" | "ready" | "unavailable";

export default function LatexPreview({ structure, linkedinUrl, githubUrl, portfolioUrl }: LatexPreviewProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState("");

  // hash -> blob URL, so re-visiting an already-compiled state (e.g. cycling
  // back to a previous alternate) skips the network round trip entirely.
  const cacheRef = useRef<Map<string, string>>(new Map());
  const lastHashRef = useRef<string>("");
  const gaveUpRef = useRef(false); // stop auto-retrying after the first failure
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const allLoaded = structure.entries.length > 0 && structure.entries.every((e) => e.blocks !== null);

  const buildPayload = () => ({
    header: structure.header,
    summary: structure.summary,
    entries: structure.entries.map((e) => ({
      id: e.id,
      title: e.title,
      company: e.company,
      dates: e.dates,
      location: e.location,
      blocks: (e.blocks ?? []).map((b) => ({ id: b.id, chosen: b.candidates[b.activeIndex] ?? b.original })),
    })),
    other_sections: structure.otherSections.map((s) => ({ title: s.title, content: s.content })),
    linkedin_url: linkedinUrl,
    github_url: githubUrl,
    portfolio_url: portfolioUrl,
  });

  const render = async (payloadStr: string, hash: string) => {
    setStatus("loading");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/render-latex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadStr,
        signal: controller.signal,
      });
      if (!res.ok) {
        let detail = `Compile failed (${res.status})`;
        try {
          const d = await res.json();
          if (d?.detail) detail = String(d.detail);
        } catch {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      cacheRef.current.set(hash, url);
      setPdfUrl(url);
      setStatus("ready");
      gaveUpRef.current = false;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorDetail(err instanceof Error ? err.message : "Unknown error");
      setStatus("unavailable");
      gaveUpRef.current = true; // don't keep hammering a known-broken endpoint as the user types
    }
  };

  useEffect(() => {
    if (!allLoaded) return;
    const payload = buildPayload();
    const payloadStr = JSON.stringify(payload);
    const hash = hashString(payloadStr);

    if (hash === lastHashRef.current) return; // nothing actually changed
    lastHashRef.current = hash;

    const cached = cacheRef.current.get(hash);
    if (cached) {
      setPdfUrl(cached);
      setStatus("ready");
      return;
    }

    if (gaveUpRef.current) return; // known-broken this session, wait for manual retry

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => render(payloadStr, hash), DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, JSON.stringify(buildPayload())]);

  useEffect(() => () => {
    cacheRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const manualRetry = () => {
    gaveUpRef.current = false;
    lastHashRef.current = "";
  };

  if (!allLoaded) {
    return (
      <div className="border border-stone-100 rounded-2xl p-6 flex items-center justify-center">
        <p className="text-xs text-stone-400">PDF preview will appear once all sections finish generating…</p>
      </div>
    );
  }

  return (
    <div className="border border-stone-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-stone-100 bg-stone-50/60">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">LaTeX PDF Preview</h3>
          <Tooltip content="Compiled with the same LaTeX template used for real applications">
            <span className="text-stone-300 text-xs cursor-help">ⓘ</span>
          </Tooltip>
        </div>
        {status === "loading" && <span className="text-[10px] text-primary-500 font-medium animate-pulse">Compiling…</span>}
        {status === "ready" && pdfUrl && (
          <a
            href={pdfUrl}
            download="tailored_resume.pdf"
            className="text-xs font-semibold text-white bg-stone-900 hover:bg-stone-700 px-3 py-1.5 rounded-xl transition-colors"
          >
            Download PDF
          </a>
        )}
      </div>

      <div className="min-h-[200px]">
        {status === "ready" && pdfUrl && (
          <iframe src={pdfUrl} className="w-full h-[500px]" title="Resume PDF preview" />
        )}
        {status === "loading" && !pdfUrl && (
          <div className="h-[300px] flex items-center justify-center">
            <div className="space-y-2 w-2/3">
              <div className="h-2.5 bg-stone-100 rounded animate-pulse w-full" />
              <div className="h-2.5 bg-stone-100 rounded animate-pulse w-5/6" />
              <div className="h-2.5 bg-stone-100 rounded animate-pulse w-3/4" />
            </div>
          </div>
        )}
        {status === "unavailable" && (
          <div className="h-[200px] flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-xs text-stone-400">
              Live PDF preview isn&apos;t available on this deployment yet.
            </p>
            <button
              type="button"
              onClick={manualRetry}
              className="text-xs font-medium text-primary-500 underline underline-offset-2 hover:text-primary-700"
            >
              Try again
            </button>
            <Tooltip content={errorDetail || "No detail available"}>
              <span className="text-[10px] text-stone-300 cursor-help">Why?</span>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
