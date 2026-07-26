"""LLM-orchestrated primary job search.

Deliberate architecture choice (not the default): instead of a fixed
keyword-boost query, one LLM call reasons about the filters (and the
candidate's resume, if on file) to generate its own search queries, then
a second batched LLM call scores every candidate posting found against
the resume. Adzuna is the fallback/top-up source, not primary -- this
trades Adzuna's free/instant results for resume-aware relevance on every
search. Real cost: at least 2 LLM calls per search instead of zero.
"""

import asyncio
import json
import re
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage
from ddgs import DDGS

from llm_fallback import ainvoke_with_fallback


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
    """Free-tier models are flaky about strict JSON -- one repair retry
    before giving up (same pattern as resume_blocks.py's structured
    output calls)."""
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


def _ddg_search(query: str, max_results: int = 6) -> List[Dict[str, str]]:
    try:
        results = DDGS().text(query, max_results=max_results)
        return [
            {"title": r.get("title", ""), "url": r.get("href", ""), "content": r.get("body", "")}
            for r in results
        ]
    except Exception:
        return []


# Allowlist, not a blocklist -- confirmed live (2026-07-26) that DDG's
# site: operator isn't reliably honored (the LLM-generated queries all
# requested site:linkedin.com/jobs/view or greenhouse.io or lever.co, but
# results still included robotsguide.com and a Britannica encyclopedia
# article, the exact class of garbage from the original bug report just
# resurfacing via this new path). A blocklist can only ever catch domains
# someone thought to name; an allowlist matching exactly the 3 job boards
# the LLM is instructed to restrict to can't leak generic web noise
# through regardless of whether DDG or the LLM actually honored the
# site: restriction.
_ALLOWED_URL_PATTERNS = [
    "linkedin.com/jobs/view", "greenhouse.io", "lever.co",
]


def _looks_like_job_posting(url: str) -> bool:
    lower = url.lower()
    if not lower.startswith("http"):
        return False
    return any(p in lower for p in _ALLOWED_URL_PATTERNS)


QUERY_GEN_SCHEMA_HINT = '{"queries": ["...", "...", "..."]}'


def _query_gen_prompt(request) -> str:
    resume_snippet = ""
    if request.resume_text.strip():
        resume_snippet = (
            "\n\nCandidate resume (for context -- tailor query relevance "
            f"to this background, pull in real skills/synonyms from it):\n"
            f"{request.resume_text[:1500]}"
        )
    return (
        "Generate 2-3 distinct web search engine queries to find REAL, "
        "CURRENT job postings matching this search. Each query MUST end "
        "with one of: site:linkedin.com/jobs/view OR site:greenhouse.io "
        "OR site:lever.co -- vary which one and vary phrasing/synonyms "
        "across the queries rather than repeating the same words.\n\n"
        f"Job title: {request.target_title}\n"
        f"Location: {request.target_location}\n"
        f"Experience level: {request.experience_level or 'not specified'}\n"
        f"Company tier: {request.company_tier or 'not specified'}\n"
        f"Sector: {request.sector or 'not specified'}"
        f"{resume_snippet}\n\n"
        "Return ONLY valid JSON matching this exact shape:\n"
        f"{QUERY_GEN_SCHEMA_HINT}"
    )


async def _generate_search_queries(request) -> List[str]:
    prompt = _query_gen_prompt(request)
    raw = await ainvoke_with_fallback([HumanMessage(content=prompt)], max_tokens=400, json_mode=True)
    parsed = await _parse_json_with_repair(raw, QUERY_GEN_SCHEMA_HINT)
    queries = parsed.get("queries", [])
    return [q.strip() for q in queries if isinstance(q, str) and q.strip()][:3]


def _fallback_query(request) -> str:
    return f"{request.target_title} {request.target_location} site:linkedin.com/jobs/view"


async def agentic_job_search(request) -> List[Dict[str, str]]:
    """Primary search path. Returns raw (unscored) candidate postings,
    deduped by URL. Falls back to a single fixed query if the LLM query
    generation itself fails (bad JSON, all providers down, etc.) rather
    than returning nothing."""
    try:
        queries = await _generate_search_queries(request)
    except Exception:
        queries = []
    if not queries:
        queries = [_fallback_query(request)]

    # _ddg_search is a blocking sync call (DDGS().text(...)) -- confirmed
    # live this was a real latency contributor: running up to 3 queries
    # sequentially inside an async function blocks the event loop each
    # time with zero concurrency. asyncio.to_thread + gather runs them in
    # parallel instead.
    result_batches = await asyncio.gather(
        *[asyncio.to_thread(_ddg_search, query, 6) for query in queries]
    )

    candidates: List[Dict[str, str]] = []
    seen_urls: set = set()
    for batch in result_batches:
        for result in batch:
            url = result.get("url", "").strip()
            if not _looks_like_job_posting(url) or url in seen_urls:
                continue
            seen_urls.add(url)

            title = result.get("title", "").strip()
            content = result.get("content", "").strip()
            company, job_title = "Unknown", request.target_title
            if " at " in title:
                parts = title.split(" at ")
                job_title, company = parts[0].strip(), parts[1].split("|")[0].split("-")[0].strip()
            elif " - " in title:
                parts = title.split(" - ", 1)
                company, job_title = (parts[0].strip(), parts[1].strip()) if len(parts[0]) < 50 else (parts[1].strip(), parts[0].strip())

            candidates.append({
                "company": company,
                "title": job_title,
                "location": request.target_location or "Remote",
                "link": url,
                "description": content[:300],
                "salary": "",
            })
    return candidates


SCORE_SCHEMA_HINT = '{"scores": [{"index": 0, "match_score": 87}, {"index": 1, "match_score": 42}]}'


async def score_and_rank_jobs(candidates: List[Dict[str, str]], request) -> List[Dict[str, Any]]:
    """One batched LLM call scores every candidate against the resume
    (0-100 -- semantic fit, not just keyword overlap), then returns the
    top max_results sorted by score. Without a resume on file, scoring is
    skipped entirely (no basis for a %) and candidates are just capped to
    max_results in their existing order."""
    if not candidates:
        return []
    if not request.resume_text.strip():
        return candidates[:request.max_results]

    listing = "\n".join(
        f"{i}. {c['title']} at {c['company']} -- {c['description'][:200]}"
        for i, c in enumerate(candidates)
    )
    prompt = (
        "Score how well each job posting matches this candidate's resume, "
        "0-100 (100 = excellent fit, 0 = no fit). Consider skills, "
        "experience level, and role alignment -- not just keyword overlap "
        "(e.g. an \"ML Engineer\" posting can be a strong match for an "
        "\"AI Engineer\" resume).\n\n"
        f"Resume:\n{request.resume_text[:2000]}\n\n"
        f"Postings:\n{listing}\n\n"
        "Return ONLY valid JSON matching this exact shape, one entry per "
        f"posting index:\n{SCORE_SCHEMA_HINT}"
    )
    scores: Dict[int, float] = {}
    try:
        raw = await ainvoke_with_fallback([HumanMessage(content=prompt)], max_tokens=1500, json_mode=True)
        parsed = await _parse_json_with_repair(raw, SCORE_SCHEMA_HINT)
        for s in parsed.get("scores", []):
            idx = s.get("index")
            if isinstance(idx, int) and 0 <= idx < len(candidates):
                scores[idx] = s.get("match_score")
    except Exception:
        pass

    scored: List[Dict[str, Any]] = []
    for i, c in enumerate(candidates):
        job = dict(c)
        if i in scores and isinstance(scores[i], (int, float)):
            job["match_score"] = scores[i]
        scored.append(job)

    scored.sort(key=lambda j: j.get("match_score", -1), reverse=True)
    return scored[:request.max_results]
