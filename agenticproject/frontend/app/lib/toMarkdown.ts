import type { ResumeStructure } from "./types";

/** Flattens block state into the markdown shape the existing jsPDF
 * downloadResumePDF() parser expects (#, ##, ###, -, **bold**) -- keeps the
 * old text-based PDF export working as a fallback while the real LaTeX
 * render is unavailable, rather than losing "download a PDF" entirely. */
export function structureToMarkdown(structure: ResumeStructure): string {
  const lines: string[] = [];
  lines.push(`# ${structure.header.name || "Your Name"}`);
  if (structure.summary) {
    lines.push("");
    lines.push(structure.summary);
  }

  lines.push("");
  lines.push("## Experience");
  for (const entry of structure.entries) {
    lines.push("");
    lines.push(`### ${entry.title} — ${entry.dates}`);
    lines.push(`${entry.company} — ${entry.location}`);
    for (const block of entry.blocks ?? []) {
      lines.push(`- ${block.candidates[block.activeIndex] ?? block.original}`);
    }
  }

  for (const section of structure.otherSections) {
    lines.push("");
    lines.push(`## ${section.title}`);
    for (const line of section.content.split("\n")) {
      if (line.trim()) lines.push(`- ${line.trim()}`);
    }
  }

  return lines.join("\n");
}
