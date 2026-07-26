export interface ResumeBlock {
  id: string;
  /** candidates[0] is the LLM's original "chosen" pick, the rest are alternates. */
  candidates: string[];
  activeIndex: number;
  original: string;
  score: number;
  isRegenerating?: boolean;
}

export interface ResumeEntry {
  id: string;
  title: string;
  company: string;
  dates: string;
  location: string;
  /** null = blocks haven't streamed in yet -> render a skeleton */
  blocks: ResumeBlock[] | null;
}

export interface OtherSection {
  title: string;
  content: string;
}

export interface ResumeHeader {
  name: string;
  email: string;
}

export interface ResumeStructure {
  header: ResumeHeader;
  summary: string;
  otherSections: OtherSection[];
  entries: ResumeEntry[];
}
