"""Resume structuring, per-entry tailored generation, and JD-relevance scoring.

Splits a resume into swappable "blocks" (one per achievement bullet, grouped
under its parent experience entry) so the frontend can show alternates,
reorder, and regenerate a single bullet instead of re-rolling the whole
resume. Generation is batched per experience entry (not per bullet) to keep
LLM call count low against OpenRouter's shared 50/day free-tier cap.
"""

import json
import re
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from llm_fallback import ainvoke_with_fallback

STOPWORDS = {
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was",
    "one", "our", "out", "day", "get", "has", "him", "his", "how", "man", "new",
    "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put",
    "say", "she", "too", "use", "with", "this", "that", "from", "your", "have",
    "will", "would", "there", "their", "what", "about", "which", "when", "make",
    "like", "time", "just", "into", "over", "such", "than", "then", "them",
    "these", "some", "more", "most", "other", "role", "team", "work", "years",
    "experience", "required", "preferred", "ability", "including", "years",
}


def _tokenize(text: str) -> set:
    return {
        w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9+/#.\-]{1,}", text.lower())
        if w not in STOPWORDS and len(w) > 2
    }


def keyword_overlap_score(candidate: str, job_description: str) -> float:
    """Cheap local relevance score, no LLM call. Token-set overlap between a
    candidate bullet and the job description, normalized to [0, 1]."""
    jd_tokens = _tokenize(job_description)
    if not jd_tokens:
        return 0.0
    cand_tokens = _tokenize(candidate)
    if not cand_tokens:
        return 0.0
    return round(len(jd_tokens & cand_tokens) / len(jd_tokens), 4)


def _strip_code_fence(raw: str) -> str:
    stripped = raw.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[a-zA-Z]*\n?", "", stripped)
        stripped = re.sub(r"\n?```$", "", stripped)
    return stripped.strip()


def _extract_json_object(raw: str) -> str:
    stripped = _strip_code_fence(raw)
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end < start:
        return stripped
    return stripped[start:end + 1]


async def _parse_json_with_repair(raw: str, schema_hint: str) -> Dict[str, Any]:
    """Free-tier models are flaky about strict JSON. Try to parse directly;
    on failure, ask the model once to fix its own output against the schema."""
    candidate = _extract_json_object(raw)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    repair_prompt = (
        "The following text was supposed to be valid JSON matching this shape:\n"
        f"{schema_hint}\n\n"
        "It is not valid JSON. Fix it and return ONLY the corrected JSON, "
        "nothing else -- no prose, no code fences.\n\n"
        f"Broken text:\n{candidate[:3000]}"
    )
    repaired_raw = await ainvoke_with_fallback(
        [HumanMessage(content=repair_prompt)], max_tokens=1500, json_mode=True
    )
    repaired = _extract_json_object(repaired_raw)
    return json.loads(repaired)  # let this raise if still broken -- caller handles it


ENTRIES_SCHEMA_HINT = (
    '{"entries": [{"id": "exp-0", "title": "...", "company": "...", '
    '"dates": "...", "location": "...", "bullets": ["...", "..."]}]}'
)

def _structure_prompt(resume_text: str) -> str:
    # Built as an f-string, not str.format() -- the schema hint below
    # contains literal JSON braces that str.format() would misparse as
    # placeholders on a second substitution pass.
    return (
        "Parse the following resume text into its work-experience entries. "
        "Do NOT rewrite or improve anything -- extract exactly what is there.\n\n"
        f"Resume:\n{resume_text[:4000]}\n\n"
        "Return ONLY valid JSON matching this exact shape "
        "(id = \"exp-0\", \"exp-1\", ... in resume order):\n"
        f"{ENTRIES_SCHEMA_HINT}"
    )


async def extract_resume_entries(resume_text: str) -> List[Dict[str, Any]]:
    """One LLM call: structure the resume into experience entries + their
    original bullets. Pure extraction, no tailoring happens here."""
    prompt = _structure_prompt(resume_text)
    raw = await ainvoke_with_fallback(
        [HumanMessage(content=prompt)], max_tokens=1500, json_mode=True
    )
    parsed = await _parse_json_with_repair(raw, ENTRIES_SCHEMA_HINT)
    entries = parsed.get("entries", [])
    normalized = []
    for i, entry in enumerate(entries):
        normalized.append({
            "id": entry.get("id") or f"exp-{i}",
            "title": str(entry.get("title", "")).strip(),
            "company": str(entry.get("company", "")).strip(),
            "dates": str(entry.get("dates", "")).strip(),
            "location": str(entry.get("location", "")).strip(),
            "bullets": [str(b).strip() for b in entry.get("bullets", []) if str(b).strip()],
        })
    return normalized


BULLETS_SCHEMA_HINT = '{"bullets": [{"chosen": "...", "alternates": ["...", "..."]}]}'

def _entry_tailor_prompt(entry: Dict[str, Any], job_description: str, section_title: str) -> str:
    original_bullets = "\n".join(f"- {b}" for b in entry["bullets"])
    return (
        "You are tailoring ONE work-experience entry from a resume to a specific "
        "target job. Stay truthful to the original achievements -- tailor "
        "emphasis, keywords, and phrasing, do not invent new accomplishments or "
        "numbers. Use hyphens instead of em/en dashes.\n\n"
        f"Role: {entry['title'] or 'Unknown Role'} at {entry['company'] or 'Unknown Company'} ({entry['dates']})\n"
        f"Original bullets for this role:\n{original_bullets}\n\n"
        f"Target Job Description:\n{job_description[:2000]}\n\n"
        "For EACH original bullet (in the same order), produce one best tailored "
        "rewrite (\"chosen\") plus 2 alternate phrasings (\"alternates\"). "
        "Return ONLY valid JSON matching this exact shape, with exactly "
        f"{len(entry['bullets'])} items in the bullets array:\n"
        f"{BULLETS_SCHEMA_HINT}"
    )


async def generate_entry_blocks(
    entry: Dict[str, Any], job_description: str
) -> List[Dict[str, Any]]:
    """One LLM call per experience entry: tailor all of that entry's bullets
    together (cheaper than one call per bullet), return them as blocks."""
    if not entry["bullets"]:
        return []

    section_title = f"{entry['title']} @ {entry['company']}".strip(" @")
    prompt = _entry_tailor_prompt(entry, job_description, section_title)
    max_tokens = min(300 * len(entry["bullets"]) + 200, 2500)
    raw = await ainvoke_with_fallback(
        [HumanMessage(content=prompt)], max_tokens=max_tokens, json_mode=True
    )
    parsed = await _parse_json_with_repair(raw, BULLETS_SCHEMA_HINT)
    bullets = parsed.get("bullets", [])

    blocks = []
    for i, original in enumerate(entry["bullets"]):
        candidate = bullets[i] if i < len(bullets) else {}
        chosen = str(candidate.get("chosen", "")).strip() or original
        alternates = [str(a).strip() for a in candidate.get("alternates", [])[:2] if str(a).strip()]
        blocks.append({
            "id": f"{entry['id']}-bullet-{i}",
            "type": "experience_bullet",
            "section_title": section_title,
            "order": i,
            "original": original,
            "chosen": chosen,
            "alternates": alternates,
            "score": keyword_overlap_score(chosen, job_description),
            "source": "llm",
        })
    return blocks


SINGLE_BULLET_SCHEMA_HINT = '{"chosen": "...", "alternates": ["...", "..."]}'

def _single_bullet_prompt(section_title: str, original_text: str, current_text: str, job_description: str) -> str:
    return (
        "Rewrite ONE resume achievement bullet to better match a target job "
        "description. Stay truthful to the original achievement -- tailor "
        "emphasis and keywords, do not invent new accomplishments. Use hyphens "
        "instead of em/en dashes.\n\n"
        f"Role context: {section_title}\n"
        f"Original bullet: {original_text}\n"
        f"Current text (may already be a previous rewrite): {current_text or original_text}\n\n"
        f"Target Job Description:\n{job_description[:2000]}\n\n"
        "Produce one best rewrite (\"chosen\") plus 2 alternate phrasings "
        "(\"alternates\"). Return ONLY valid JSON matching this exact shape:\n"
        f"{SINGLE_BULLET_SCHEMA_HINT}"
    )


async def regenerate_block(
    section_title: str, original_text: str, current_text: str, job_description: str
) -> Dict[str, Any]:
    """Regenerate a single block in isolation -- powers the 'regenerate this
    block' button without touching any other block or the cover letter."""
    prompt = _single_bullet_prompt(section_title, original_text, current_text, job_description)
    raw = await ainvoke_with_fallback(
        [HumanMessage(content=prompt)], max_tokens=500, json_mode=True
    )
    parsed = await _parse_json_with_repair(raw, SINGLE_BULLET_SCHEMA_HINT)
    chosen = str(parsed.get("chosen", "")).strip() or current_text or original_text
    alternates = [str(a).strip() for a in parsed.get("alternates", [])[:2] if str(a).strip()]
    return {
        "chosen": chosen,
        "alternates": alternates,
        "score": keyword_overlap_score(chosen, job_description),
    }
