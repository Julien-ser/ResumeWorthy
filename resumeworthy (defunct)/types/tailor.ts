import { ResumeBlock } from "./database";

export type TargetProfileInput = {
  targetRole: string;
  targetCompany: string;
  jobDescription: string;
  extraContext: string;
  links: string;
};

export type TailorRequest = {
  blocks: ResumeBlock[];
  target: TargetProfileInput;
};

export type TailoredResumeDraft = {
  headline: string;
  summary: string;
  selectedBlocks: ResumeBlock[];
  prioritizedSkills: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  sourceLinks: string[];
  notes: string[];
};
