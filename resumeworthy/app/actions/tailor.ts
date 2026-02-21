"use server";

import { ResumeBlock } from "@/types/database";
import { TailorRequest, TailoredResumeDraft } from "@/types/tailor";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "this", "that", "from", "have", "has", "will", "all", "our", "job", "role", "team", "their", "they", "but", "can", "not", "using", "use", "into", "about", "been", "being", "than", "per", "who", "what", "when", "where", "how", "required", "preferred", "experience", "work",
]);

function normalizeText(text: string) {
  return (text || "").toLowerCase().replace(/[^a-z0-9+.#\-\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function topKeywords(text: string, max = 24) {
  const freq = new Map<string, number>();
  for (const token of tokenize(text)) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([token]) => token);
}

function blockText(block: ResumeBlock) {
  const bullets = block.content.description_bullets?.join(" ") || "";
  const tags = (block.tags || []).join(" ");
  return [block.type, block.content.title, block.content.company, bullets, tags].filter(Boolean).join(" ");
}

function scoreBlock(block: ResumeBlock, keywords: string[]) {
  const text = normalizeText(blockText(block));
  let score = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword)) score += 1;
  }

  if (block.type === "experience" || block.type === "project") score += 2;
  if (block.type === "summary") score -= 1;

  return score;
}

function parseLinks(input: string) {
  return (input || "")
    .split(/\n|,/) 
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function collectSkills(blocks: ResumeBlock[]) {
  const skills: string[] = [];
  for (const block of blocks) {
    for (const tag of block.tags || []) {
      if (tag) skills.push(tag.trim());
    }

    const bullets = block.content.description_bullets || [];
    for (const bullet of bullets) {
      for (const token of tokenize(bullet)) {
        if (token.length >= 4) skills.push(token);
      }
    }
  }

  return uniqueStrings(skills).slice(0, 20);
}

export async function buildTailoredResumeDraft(request: TailorRequest): Promise<TailoredResumeDraft> {
  const blocks = (request.blocks || []).filter(Boolean);
  const targetRole = request.target.targetRole?.trim();
  const targetCompany = request.target.targetCompany?.trim();
  const jobDescription = request.target.jobDescription?.trim() || "";
  const extraContext = request.target.extraContext?.trim() || "";

  if (!targetRole) {
    throw new Error("Target role is required.");
  }

  if (blocks.length === 0) {
    throw new Error("Upload and parse a resume first so blocks are available.");
  }

  const jdKeywords = topKeywords(`${jobDescription} ${extraContext}`);
  const sortedBlocks = [...blocks].sort((a, b) => scoreBlock(b, jdKeywords) - scoreBlock(a, jdKeywords));
  const selectedBlocks = sortedBlocks.slice(0, 8);

  const selectedText = normalizeText(selectedBlocks.map(blockText).join(" "));
  const matchedKeywords = jdKeywords.filter((keyword) => selectedText.includes(keyword)).slice(0, 18);
  const missingKeywords = jdKeywords.filter((keyword) => !selectedText.includes(keyword)).slice(0, 12);

  const prioritizedSkills = collectSkills(selectedBlocks);
  const sourceLinks = parseLinks(request.target.links || "");

  const summaryParts = [
    `Targeting ${targetRole}`,
    targetCompany ? `for ${targetCompany}` : "",
    matchedKeywords.length > 0 ? `with emphasis on ${matchedKeywords.slice(0, 6).join(", ")}` : "",
  ].filter(Boolean);

  const notes = [
    "Re-order selected blocks so most relevant experience appears first.",
    "Tune bullet wording to include exact keywords from the job description naturally.",
  ];

  if (missingKeywords.length > 0) {
    notes.push(`Consider adding evidence for: ${missingKeywords.slice(0, 8).join(", ")}.`);
  }

  if (sourceLinks.length > 0) {
    notes.push("Use LinkedIn/website details to validate dates, titles, and accomplishments.");
  }

  return {
    headline: `${targetRole}${targetCompany ? ` · ${targetCompany}` : ""}`,
    summary: `${summaryParts.join(" ")}.`,
    selectedBlocks,
    prioritizedSkills,
    matchedKeywords,
    missingKeywords,
    sourceLinks,
    notes,
  };
}
