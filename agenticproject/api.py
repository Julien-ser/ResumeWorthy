"""
ResumeWorthy Job Application + Recruiter Finder Backend API
"""

import os
import re
import json
import asyncio
import sqlite3
import io
from datetime import datetime
from typing import List, Dict, Any, Optional

import httpx
import requests as http_requests
import stripe
import pypdf
import docx
import sentry_sdk
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from llm_fallback import ainvoke_with_fallback
from resume_blocks import extract_resume_structure, generate_entry_blocks, regenerate_block
from latex_template import blocks_to_tex
from latex_compile import compile_tex_to_pdf, LatexCompileError
from fastapi import Response
from ddgs import DDGS
from pydantic import BaseModel
from urllib.parse import urlparse

try:
    import fitz
    _HAS_FITZ = True
except ImportError:
    _HAS_FITZ = False

try:
    from jwt import PyJWKClient
    import jwt as pyjwt
    _HAS_JWT = True
except ImportError:
    _HAS_JWT = False

load_dotenv()

# ==================== Sentry ====================
_sentry_dsn = os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    try:
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        sentry_sdk.init(
            dsn=_sentry_dsn,
            traces_sample_rate=0.1,
            integrations=[FastApiIntegration(), StarletteIntegration()],
        )
    except Exception:
        sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.1)

# ==================== SQLite ====================
DB_PATH = os.path.join(os.path.dirname(__file__), "resumeworthy.db")
FREE_TAILOR_LIMIT = 3


def _init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            clerk_user_id TEXT PRIMARY KEY,
            tailor_count  INTEGER DEFAULT 0,
            tailor_month  TEXT    DEFAULT '',
            is_pro        INTEGER DEFAULT 0,
            stripe_customer_id      TEXT DEFAULT '',
            stripe_subscription_id  TEXT DEFAULT ''
        )
    """)
    conn.commit()
    conn.close()


_init_db()

# ==================== Stripe ====================
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

# ==================== Auth helpers ====================
_jwks_client: Optional[Any] = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None and _HAS_JWT:
        jwks_url = os.environ.get("CLERK_JWKS_URL")
        if jwks_url:
            _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def _current_month() -> str:
    return datetime.now().strftime("%Y-%m")


def verify_clerk_token(authorization: Optional[str]) -> Optional[str]:
    """Return clerk_user_id, or None if auth is disabled (no CLERK_JWKS_URL).
    Raises 401 when auth is enabled but the token is missing/invalid.
    """
    if not os.environ.get("CLERK_JWKS_URL"):
        return None  # dev mode — auth not enforced

    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

    if not _HAS_JWT:
        raise HTTPException(status_code=500, detail="PyJWT not installed on server.")

    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        data = pyjwt.decode(
            token, signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        return data["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")


def get_user_usage(user_id: str) -> dict:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT tailor_count, tailor_month, is_pro FROM users WHERE clerk_user_id = ?",
        (user_id,),
    ).fetchone()
    conn.close()
    current = _current_month()
    if not row:
        return {"tailor_count": 0, "tailor_month": current, "is_pro": False}
    count, month, is_pro = row
    if month != current:
        return {"tailor_count": 0, "tailor_month": current, "is_pro": bool(is_pro)}
    return {"tailor_count": count, "tailor_month": month, "is_pro": bool(is_pro)}


def increment_tailor_count(user_id: str):
    conn = sqlite3.connect(DB_PATH)
    current = _current_month()
    usage = get_user_usage(user_id)
    new_count = (usage["tailor_count"] if usage["tailor_month"] == current else 0) + 1
    conn.execute("""
        INSERT INTO users (clerk_user_id, tailor_count, tailor_month)
        VALUES (?, ?, ?)
        ON CONFLICT(clerk_user_id) DO UPDATE SET
            tailor_count = excluded.tailor_count,
            tailor_month = excluded.tailor_month
    """, (user_id, new_count, current))
    conn.commit()
    conn.close()


def mark_user_pro(clerk_user_id: str, stripe_customer_id: str, stripe_sub_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO users (clerk_user_id, is_pro, stripe_customer_id, stripe_subscription_id)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(clerk_user_id) DO UPDATE SET
            is_pro = 1,
            stripe_customer_id     = excluded.stripe_customer_id,
            stripe_subscription_id = excluded.stripe_subscription_id
    """, (clerk_user_id, stripe_customer_id, stripe_sub_id))
    conn.commit()
    conn.close()


def mark_user_free(clerk_user_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE users SET is_pro = 0 WHERE clerk_user_id = ?", (clerk_user_id,))
    conn.commit()
    conn.close()


def lookup_user_by_stripe_customer(stripe_customer_id: str) -> Optional[str]:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT clerk_user_id FROM users WHERE stripe_customer_id = ?",
        (stripe_customer_id,),
    ).fetchone()
    conn.close()
    return row[0] if row else None


# ==================== FastAPI app ====================
_frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3001")

app = FastAPI(title="ResumeWorthy API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        _frontend_url,
        "http://localhost:3001",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== DuckDuckGo tool (recruiter finder only) ====================
@tool
def internet_search(query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """Search the internet using DuckDuckGo."""
    try:
        ddgs = DDGS()
        results = ddgs.text(query, max_results=max_results)
        return [
            {"title": r.get("title", ""), "url": r.get("href", ""), "content": r.get("body", "")}
            for r in results
        ]
    except Exception as e:
        raise RuntimeError(f"Search failed: {e}")


# ==================== Pydantic models ====================
class JobSearchRequest(BaseModel):
    target_title: str
    target_location: str
    experience_level: str = ""
    company_tier: str = ""
    sector: str = ""
    max_results: int = 10


class JobSearchResponse(BaseModel):
    jobs: List[Dict[str, str]]
    count: int


class ResumeTailorRequest(BaseModel):
    resume_text: str
    job_description: str
    linkedin_url: str = ""
    portfolio_url: str = ""
    github_url: str = ""
    company_name: str = ""


class ResumeTailorResponse(BaseModel):
    tailored_resume: str
    cover_letter: str


class RecruiterSearchRequest(BaseModel):
    company_name: str
    job_title: str
    location: str = ""


class RecruiterSearchResponse(BaseModel):
    recruiters: List[Dict[str, str]]
    count: int


# ==================== Helper functions ====================
def extract_urls_from_resume(text: str) -> dict:
    full_url = re.compile(r'https?://[^\s,<>"\'\)\]]+', re.IGNORECASE)
    bare_linkedin = re.compile(r'linkedin\.com/in/[^\s,<>"\'\)\]]+', re.IGNORECASE)
    bare_github = re.compile(r'github\.com/[^\s,<>"\'\)\]]+', re.IGNORECASE)

    all_urls = full_url.findall(text)
    bare_li = ["https://" + u for u in bare_linkedin.findall(text) if not any(u in au for au in all_urls)]
    bare_gh = ["https://" + u for u in bare_github.findall(text) if not any(u in au for au in all_urls)]
    all_found = all_urls + bare_li + bare_gh

    skip_domains = {
        "google.com", "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
        "twitter.com", "facebook.com", "instagram.com", "youtube.com",
        "schemas.openxmlformats.org", "purl.org", "w3.org",
    }

    linkedin = github = portfolio = ""
    for url in all_found:
        url = url.rstrip(".,;)]")
        lower = url.lower()
        if "linkedin.com/in/" in lower and not linkedin:
            linkedin = url
        elif "github.com/" in lower and not github:
            parts = url.rstrip("/").split("/")
            github = "/".join(parts[:4]) if len(parts) >= 4 else url
        elif not portfolio:
            try:
                domain = urlparse(url).netloc.lower().replace("www.", "")
                if domain and domain not in skip_domains:
                    portfolio = url
            except Exception:
                pass

    return {"linkedin": linkedin, "github": github, "portfolio": portfolio}


def extract_links_from_pdf(file_bytes: bytes) -> list:
    if _HAS_FITZ:
        return _extract_links_fitz(file_bytes)
    return _extract_links_pypdf(file_bytes)


def _extract_links_fitz(file_bytes: bytes) -> list:
    links = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for page in doc:
            for link in page.get_links():
                uri = link.get("uri", "")
                if uri:
                    links.append(uri)
        doc.close()
    except Exception:
        pass
    return links


def _extract_links_pypdf(file_bytes: bytes) -> list:
    links = []
    try:
        pdf = pypdf.PdfReader(io.BytesIO(file_bytes))
        for page in pdf.pages:
            annots = page.get("/Annots")
            if not annots:
                continue
            if hasattr(annots, "get_object"):
                annots = annots.get_object()
            for annot_ref in annots:
                try:
                    obj = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
                    if obj.get("/Subtype") != "/Link":
                        continue
                    action = obj.get("/A")
                    if action is None:
                        continue
                    if hasattr(action, "get_object"):
                        action = action.get_object()
                    if not action or action.get("/S") != "/URI":
                        continue
                    uri = action.get("/URI", "")
                    if isinstance(uri, bytes):
                        uri = uri.decode("utf-8", errors="ignore")
                    uri = str(uri).strip()
                    if uri:
                        links.append(uri)
                except Exception:
                    continue
    except Exception:
        pass
    return links


def extract_text_from_bytes(file_bytes: bytes, filename: str) -> str:
    if filename.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf"):
        pdf = pypdf.PdfReader(io.BytesIO(file_bytes))
        text_parts = []
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
            try:
                if "/Annots" in page:
                    for annot in page["/Annots"]:
                        try:
                            obj = annot.get_object()
                            if obj["/Subtype"] == "/Link" and "/A" in obj:
                                action = obj["/A"].get_object()
                                if "/URI" in action:
                                    text_parts.append(f"[LINK: {action['/URI']}]")
                        except Exception:
                            pass
            except Exception:
                pass
        return "\n".join(text_parts)
    elif filename.endswith(".docx"):
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)
    else:
        raise ValueError("Unsupported file format")


def fetch_url_content(url: str, timeout: int = 5) -> str:
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = http_requests.get(url, timeout=timeout, headers=headers, allow_redirects=True)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
        for script in soup(["script", "style"]):
            script.decompose()
        lines = [line.strip() for line in soup.get_text(separator="\n", strip=True).split("\n") if line.strip()]
        return "\n".join(lines[:1000])
    except Exception:
        return ""


def extract_linkedin_info(url: str) -> str:
    if not url or "linkedin.com" not in url:
        return ""
    content = fetch_url_content(url)
    sections = [
        line for line in content.split("\n")
        if any(kw in line.lower() for kw in ["experience", "education", "skills", "about", "summary", "headline"])
    ]
    return "\n".join(sections[:500])


def extract_github_info(url: str) -> str:
    if not url or "github.com" not in url:
        return ""
    try:
        username = url.rstrip("/").split("/")[-1]
        headers = {"User-Agent": "ResumeWorthy"}
        resp = http_requests.get(f"https://api.github.com/users/{username}", timeout=5, headers=headers)
        resp.raise_for_status()
        user = resp.json()
        parts = []
        for key, label in [("bio", "Bio"), ("company", "Company"), ("blog", "Website"), ("location", "Location")]:
            if user.get(key):
                parts.append(f"{label}: {user[key]}")
        if user.get("public_repos"):
            parts.append(f"Public Repos: {user['public_repos']}")
        repos_resp = http_requests.get(
            f"https://api.github.com/users/{username}/repos?sort=stars&per_page=5",
            timeout=5, headers=headers,
        )
        repos_resp.raise_for_status()
        repos = repos_resp.json()
        if repos:
            parts.append("\nTop Projects:")
            for repo in repos[:5]:
                desc = f": {repo['description']}" if repo.get("description") else ""
                parts.append(f"- {repo['name']}{desc}")
        return "\n".join(parts)
    except Exception:
        return ""


def extract_portfolio_info(url: str) -> str:
    if not url:
        return ""
    content = fetch_url_content(url)
    lines = [l for l in content.split("\n")[:300] if l.strip() and len(l.strip()) > 10]
    return "\n".join(lines[:200])


def clean_dashes(text: str) -> str:
    return text.replace("—", "-").replace("–", "-").replace("—", "-").replace("–", "-")


# ==================== Endpoints ====================

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/usage")
async def get_usage(authorization: Optional[str] = Header(default=None)):
    user_id = verify_clerk_token(authorization)
    if user_id is None:
        # Auth not configured — return unlimited
        return {"tailor_count": 0, "tailor_limit": FREE_TAILOR_LIMIT, "is_pro": True, "remaining": -1}
    usage = get_user_usage(user_id)
    remaining = -1 if usage["is_pro"] else max(0, FREE_TAILOR_LIMIT - usage["tailor_count"])
    return {
        "tailor_count": usage["tailor_count"],
        "tailor_limit": FREE_TAILOR_LIMIT,
        "is_pro": usage["is_pro"],
        "remaining": remaining,
    }


# Job boards (Adzuna, DDG-indexed postings) don't expose company size or
# industry as real structured filters -- these hints get folded into the
# search query text itself instead, nudging keyword matching rather than
# strictly filtering. "mid" experience and "midsize"/"enterprise" tier
# deliberately add no boost term: "mid" is the unmarked default nobody
# writes in a posting, and "enterprise"/"midsize" as literal keywords are
# more likely to filter out real matches than find them.
_EXPERIENCE_HINTS = {
    "internship": "internship",
    "entry": "entry level",
    "senior": "senior",
    "lead": "lead",
}
_TIER_HINTS = {
    "startup": "startup",
}


def _build_search_terms(request: JobSearchRequest) -> str:
    """Full-boost query string (all filters applied). Used as-is by the DDGS
    fallback; Adzuna uses _search_term_ladder() instead since it's the path
    that actually hit the over-narrowing bug (internship+startup+city
    stacked to zero results even though internship alone found 5)."""
    parts = [request.target_title]
    hint = _EXPERIENCE_HINTS.get(request.experience_level)
    if hint:
        parts.append(hint)
    tier_hint = _TIER_HINTS.get(request.company_tier)
    if tier_hint:
        parts.append(tier_hint)
    if request.sector.strip():
        parts.append(request.sector.strip())
    return " ".join(parts)


def _search_term_ladder(request: JobSearchRequest) -> List[str]:
    """Ordered query strings from most-specific to least, dropping the
    weakest signal first. Company tier keywords are dropped first --
    "startup" often isn't literally in a posting even at a real startup,
    so it's the most likely single term to zero out real matches. Sector
    is user-deliberate but still just a keyword nudge, dropped second.
    Experience level is core intent (internship vs senior genuinely
    matters), kept until the last deterministic level."""
    title = request.target_title
    exp_hint = _EXPERIENCE_HINTS.get(request.experience_level)
    tier_hint = _TIER_HINTS.get(request.company_tier)
    sector = request.sector.strip()

    def build(use_tier: bool, use_sector: bool, use_exp: bool) -> str:
        parts = [title]
        if use_exp and exp_hint:
            parts.append(exp_hint)
        if use_tier and tier_hint:
            parts.append(tier_hint)
        if use_sector and sector:
            parts.append(sector)
        return " ".join(parts)

    ladder = [
        build(True, True, True),
        build(False, True, True),
        build(False, False, True),
        build(False, False, False),
    ]
    deduped: List[str] = []
    for q in ladder:
        if q not in deduped:
            deduped.append(q)
    return deduped


_REMOTE_LOCATION_TERMS = {"remote", "anywhere", "wfh", "work from home", "n/a", "any", ""}


def _is_remote_like_location(location: str) -> bool:
    return location.strip().lower() in _REMOTE_LOCATION_TERMS


async def _llm_reformulate_query(request: JobSearchRequest) -> str:
    """Last resort when every deterministic ladder level came back empty --
    one LLM call to suggest a broader/synonym phrasing a real posting is
    more likely to use, rather than just giving up. Only spent when the
    free deterministic attempts have already failed, to avoid burning
    LLM quota on every routine search."""
    prompt = (
        "A job search on a job board API returned zero results for every "
        "attempted phrasing. Suggest ONE better search phrase more likely "
        "to match real postings -- broader or synonymous job title if the "
        "original seems overly narrow or niche.\n\n"
        f"Original title: {request.target_title}\n"
        f"Location: {request.target_location}\n"
        f"Experience level: {request.experience_level or 'not specified'}\n"
        f"Sector: {request.sector or 'not specified'}\n\n"
        "Return ONLY the reformulated search phrase (2-5 words), nothing "
        "else -- no explanation, no quotes, no location."
    )
    raw = await ainvoke_with_fallback([HumanMessage(content=prompt)], max_tokens=30)
    return raw.strip().strip('"').strip("'")


@app.post("/search-jobs", response_model=JobSearchResponse)
async def search_jobs(request: JobSearchRequest):
    """Search for jobs via Adzuna API (falls back to DuckDuckGo if not configured)."""
    adzuna_app_id = os.environ.get("ADZUNA_APP_ID")
    adzuna_app_key = os.environ.get("ADZUNA_API_KEY")

    if adzuna_app_id and adzuna_app_key:
        return await _search_jobs_adzuna(request, adzuna_app_id, adzuna_app_key)
    return await _search_jobs_ddgs(request)


def _adzuna_country(target_location: str) -> str:
    location_lower = target_location.lower()
    return "gb" if any(c in location_lower for c in ["uk", "london", "england", "britain"]) else \
           "ca" if any(c in location_lower for c in ["canada", "toronto", "vancouver", "montreal"]) else \
           "au" if any(c in location_lower for c in ["australia", "sydney", "melbourne"]) else "us"


async def _adzuna_raw_query(
    app_id: str, app_key: str, country: str, what: str, where: str, max_results: int,
) -> List[Dict[str, str]]:
    """One Adzuna API call for a single (what, where) pair. Returns a
    parsed job list, possibly empty -- callers decide what empty means."""
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "results_per_page": min(max_results, 20),
        "what": what,
        "sort_by": "relevance",
        "content-type": "application/json",
    }
    if where:
        params["where"] = where

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Job search API error: {e}")

    jobs = []
    for item in data.get("results", []):
        salary = ""
        s_min = item.get("salary_min")
        s_max = item.get("salary_max")
        if s_min and s_max:
            salary = f"${int(s_min):,} – ${int(s_max):,}"
        elif s_min:
            salary = f"${int(s_min):,}+"

        jobs.append({
            "company": item.get("company", {}).get("display_name", "Unknown"),
            "title": item.get("title", what),
            "location": item.get("location", {}).get("display_name", where or "Remote"),
            "link": item.get("redirect_url", ""),
            "description": (item.get("description", "")[:200]).strip(),
            "salary": salary,
        })
    return jobs


async def _search_jobs_adzuna(
    request: JobSearchRequest, app_id: str, app_key: str
) -> JobSearchResponse:
    country = _adzuna_country(request.target_location)
    is_remote = _is_remote_like_location(request.target_location)
    # Adzuna's `where` expects a real geocodable place -- "Remote" isn't
    # one (confirmed live: it returned zero results). Omitting `where`
    # entirely searches nationwide for the detected country instead of
    # failing to geocode a non-place.
    where = "" if is_remote else request.target_location

    ladder = _search_term_ladder(request)
    if is_remote:
        # Dropping `where` alone just searches the whole country blind --
        # confirmed live it returned on-site defense-contractor jobs in
        # random counties, nothing actually remote-friendly. Appending
        # "remote" as a keyword biases toward postings that literally say
        # so, which is the closest Adzuna gets to a real remote filter.
        ladder = [f"{q} remote" for q in ladder]

    jobs: List[Dict[str, str]] = []
    for what in ladder:
        jobs = await _adzuna_raw_query(app_id, app_key, country, what, where, request.max_results)
        if jobs:
            return JobSearchResponse(jobs=jobs, count=len(jobs))

    # Deterministic ladder exhausted (even bare title+location came back
    # empty) -- one LLM call to reformulate, rather than just giving up.
    try:
        reformulated = await _llm_reformulate_query(request)
        if reformulated:
            jobs = await _adzuna_raw_query(app_id, app_key, country, reformulated, where, request.max_results)
    except Exception:
        pass

    return JobSearchResponse(jobs=jobs, count=len(jobs))


async def _search_jobs_ddgs(request: JobSearchRequest) -> JobSearchResponse:
    """DuckDuckGo fallback when Adzuna is not configured."""
    search_terms = _build_search_terms(request)
    search_queries = [
        f'{search_terms} {request.target_location} site:linkedin.com/jobs/view',
        f'{search_terms} {request.target_location} site:greenhouse.io',
        f'{search_terms} {request.target_location} site:lever.co',
        f'{search_terms} {request.target_location} "apply now"',
    ]

    raw_jobs: List[Dict[str, str]] = []
    seen_urls: set = set()
    skip_patterns = [
        "linkedin.com/feed", "linkedin.com/jobs/search", "/search?", "/browse/",
    ]

    for query in search_queries:
        if len(raw_jobs) >= request.max_results:
            break
        try:
            results = internet_search.invoke({"query": query, "max_results": 8})
            for result in results:
                if len(raw_jobs) >= request.max_results:
                    break
                url = result.get("url", "").strip()
                title = result.get("title", "").strip()
                content = result.get("content", "").strip()
                if not url.startswith("http") or url in seen_urls:
                    continue
                if any(p in url.lower() for p in skip_patterns):
                    continue
                company, job_title = "Unknown", request.target_title
                if " at " in title:
                    parts = title.split(" at ")
                    job_title, company = parts[0].strip(), parts[1].split("|")[0].split("-")[0].strip()
                elif " - " in title:
                    parts = title.split(" - ", 1)
                    company, job_title = (parts[0].strip(), parts[1].strip()) if len(parts[0]) < 50 else (parts[1].strip(), parts[0].strip())
                raw_jobs.append({
                    "company": company,
                    "title": job_title,
                    "location": request.target_location.split(" OR ")[0] or "Remote",
                    "link": url,
                    "description": content[:200],
                    "salary": "",
                })
                seen_urls.add(url)
        except Exception:
            continue

    return JobSearchResponse(jobs=raw_jobs, count=len(raw_jobs))


async def _safe_thread(fn, arg):
    try:
        return await asyncio.to_thread(fn, arg)
    except Exception:
        return ""


async def _gather_candidate_context(request: ResumeTailorRequest) -> str:
    async def noop():
        return ""

    linkedin_info, github_info, portfolio_info = await asyncio.gather(
        _safe_thread(extract_linkedin_info, request.linkedin_url) if request.linkedin_url else noop(),
        _safe_thread(extract_github_info, request.github_url) if request.github_url else noop(),
        _safe_thread(extract_portfolio_info, request.portfolio_url) if request.portfolio_url else noop(),
    )

    context_parts = [f"Original Resume:\n{request.resume_text[:2500]}"]
    if linkedin_info:
        context_parts.append(f"LinkedIn Profile Info:\n{linkedin_info[:500]}")
    if github_info:
        context_parts.append(f"GitHub Profile Info:\n{github_info[:500]}")
    if portfolio_info:
        context_parts.append(f"Portfolio Info:\n{portfolio_info[:300]}")
    return "\n\n".join(context_parts)


def _build_letter_prompt(request: ResumeTailorRequest, candidate_context: str) -> str:
    return (
        f"Write a compelling cover letter (150-200 words) for this position.\n\n"
        f"Company: {request.company_name}\n"
        f"Job Description: {request.job_description[:1500]}\n\n"
        f"Candidate Profile:\n{candidate_context}\n\n"
        f"Requirements:\n"
        f"1. Reference specific skills/projects from their GitHub or portfolio\n"
        f"2. Show enthusiasm and understanding of the role\n"
        f"3. Include 1-2 specific examples of relevant work\n"
        f"4. Use hyphens instead of dashes\n"
        f"5. Professional tone, ready to copy/paste\n\n"
        f"Make it personal and specific to this opportunity."
    )


def _check_tailor_usage_gate(user_id: Optional[str]):
    if user_id is not None:
        usage = get_user_usage(user_id)
        if not usage["is_pro"] and usage["tailor_count"] >= FREE_TAILOR_LIMIT:
            raise HTTPException(
                status_code=402,
                detail=f"You've used all {FREE_TAILOR_LIMIT} free tailors this month. Upgrade to Pro for unlimited access.",
            )


@app.post("/tailor-resume", response_model=ResumeTailorResponse)
async def tailor_resume(
    request: ResumeTailorRequest,
    authorization: Optional[str] = Header(default=None),
):
    user_id = verify_clerk_token(authorization)
    _check_tailor_usage_gate(user_id)

    try:
        candidate_context = await _gather_candidate_context(request)

        resume_prompt = (
            f"You are an expert resume writer specializing in ATS-optimized resumes.\n\n"
            f"Target Job:\n{request.job_description[:2000]}\n\n"
            f"Candidate Background:\n{candidate_context}\n\n"
            f"Create a tailored resume in markdown format (use ###, **, and - for formatting) that:\n"
            f"1. Matches keywords from the job description\n"
            f"2. Highlights relevant skills and projects from their GitHub/portfolio\n"
            f"3. Shows specific accomplishments from their LinkedIn\n"
            f"4. Keeps ATS-scannable formatting\n"
            f"5. Uses hyphens instead of dashes\n\n"
            f"Make it concise, impactful, and specific to this role."
        )
        letter_prompt = _build_letter_prompt(request, candidate_context)

        try:
            resume_text_raw, letter_text_raw = await asyncio.gather(
                ainvoke_with_fallback([HumanMessage(content=resume_prompt)], max_tokens=2000),
                ainvoke_with_fallback([HumanMessage(content=letter_prompt)], max_tokens=800),
            )
        except Exception as llm_err:
            raise HTTPException(status_code=502, detail=f"LLM API error: {llm_err}")

        tailored_resume = clean_dashes(resume_text_raw)
        cover_letter = clean_dashes(letter_text_raw)

        if user_id is not None:
            increment_tailor_count(user_id)

        return ResumeTailorResponse(tailored_resume=tailored_resume, cover_letter=cover_letter)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/tailor-resume-stream")
async def tailor_resume_stream(
    request: ResumeTailorRequest,
    authorization: Optional[str] = Header(default=None),
):
    """SSE version of /tailor-resume. Structures the resume into per-entry
    blocks, tailors each entry concurrently, and streams each block group to
    the client the moment it resolves (asyncio.as_completed) instead of
    waiting for the whole resume to finish -- this is what makes blocks
    appear progressively on the frontend rather than all at once."""
    user_id = verify_clerk_token(authorization)
    _check_tailor_usage_gate(user_id)

    async def event_stream():
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        try:
            candidate_context = await _gather_candidate_context(request)
            letter_prompt = _build_letter_prompt(request, candidate_context)

            try:
                structure = await extract_resume_structure(request.resume_text)
            except Exception as exc:
                yield sse("error", {"detail": f"Failed to parse resume structure: {exc}"[:300]})
                return

            entries = structure["entries"]
            if not entries:
                yield sse("error", {"detail": "Could not find any experience entries to tailor."})
                return

            # Full structural context (header/summary/other_sections) the
            # frontend needs to hold onto for /render-latex later -- the
            # entries list here is metadata only, tailored blocks stream
            # separately via "blocks" events below.
            yield sse("meta", {
                "header": structure["header"],
                "summary": structure["summary"],
                "other_sections": structure["other_sections"],
                "entries": [
                    {"id": e["id"], "title": e["title"], "company": e["company"],
                     "dates": e["dates"], "location": e["location"]}
                    for e in entries
                ],
            })

            letter_task = asyncio.create_task(
                ainvoke_with_fallback([HumanMessage(content=letter_prompt)], max_tokens=800)
            )

            async def entry_task(entry):
                blocks = await generate_entry_blocks(entry, request.job_description)
                return entry["id"], blocks

            pending = {asyncio.create_task(entry_task(e)): e["id"] for e in entries}
            for coro in asyncio.as_completed(list(pending.keys())):
                try:
                    entry_id, blocks = await coro
                    yield sse("blocks", {
                        "entry_id": entry_id,
                        "blocks": [{**b, "chosen": clean_dashes(b["chosen"]),
                                    "alternates": [clean_dashes(a) for a in b["alternates"]]}
                                   for b in blocks],
                    })
                except Exception as exc:
                    yield sse("entry_error", {"detail": str(exc)[:200]})

            try:
                letter_raw = await letter_task
                yield sse("cover_letter", {"text": clean_dashes(letter_raw)})
            except Exception as exc:
                yield sse("entry_error", {"detail": f"Cover letter failed: {exc}"[:200]})

            if user_id is not None:
                increment_tailor_count(user_id)

            yield sse("done", {})
        except Exception as exc:
            yield sse("error", {"detail": str(exc)[:300]})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class RegenerateBlockRequest(BaseModel):
    section_title: str
    original_text: str
    current_text: str = ""
    job_description: str


class RegenerateBlockResponse(BaseModel):
    chosen: str
    alternates: List[str]
    score: float


@app.post("/regenerate-block", response_model=RegenerateBlockResponse)
async def regenerate_block_endpoint(
    request: RegenerateBlockRequest,
    authorization: Optional[str] = Header(default=None),
):
    """Regenerate a single block. Does not touch the free-tailor usage
    counter -- this is a refinement of an already-generated resume, not a
    new tailor."""
    verify_clerk_token(authorization)
    try:
        result = await regenerate_block(
            request.section_title, request.original_text,
            request.current_text, request.job_description,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM API error: {e}")

    return RegenerateBlockResponse(
        chosen=clean_dashes(result["chosen"]),
        alternates=[clean_dashes(a) for a in result["alternates"]],
        score=result["score"],
    )


class RenderLatexHeader(BaseModel):
    name: str = ""
    email: str = ""


class RenderLatexBlock(BaseModel):
    id: str
    chosen: str


class RenderLatexEntry(BaseModel):
    id: str
    title: str = ""
    company: str = ""
    dates: str = ""
    location: str = ""
    blocks: List[RenderLatexBlock] = []


class RenderLatexOtherSection(BaseModel):
    title: str
    content: str = ""


class RenderLatexRequest(BaseModel):
    header: RenderLatexHeader
    summary: str = ""
    entries: List[RenderLatexEntry]
    other_sections: List[RenderLatexOtherSection] = []
    linkedin_url: str = ""
    github_url: str = ""
    portfolio_url: str = ""


@app.post("/render-latex")
async def render_latex(request: RenderLatexRequest):
    """Compile the current block state (post drag-reorder/alternate-cycling/
    edits/regeneration -- whatever the frontend currently holds) into a PDF
    via the same LaTeX macro skeleton as MyExp/resume.tex. No usage gating
    -- this is a render of already-generated content, not a new tailor."""
    tex_source = blocks_to_tex(
        header=request.header.model_dump(),
        summary=request.summary,
        entries=[e.model_dump() for e in request.entries],
        other_sections=[s.model_dump() for s in request.other_sections],
        linkedin_url=request.linkedin_url,
        github_url=request.github_url,
        portfolio_url=request.portfolio_url,
    )
    try:
        pdf_bytes = await compile_tex_to_pdf(tex_source)
    except LatexCompileError as e:
        raise HTTPException(status_code=502, detail=f"LaTeX compile failed ({e.engine}): {str(e)[:1000]}")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return Response(content=pdf_bytes, media_type="application/pdf")


@app.post("/find-recruiters", response_model=RecruiterSearchResponse)
async def find_recruiters(request: RecruiterSearchRequest):
    try:
        search_queries = [
            f'{request.company_name} recruiter {request.job_title} site:linkedin.com/in',
            f'{request.company_name} hiring manager {request.job_title} site:linkedin.com',
            f'{request.company_name} talent acquisition manager site:linkedin.com',
        ]

        recruiters: List[Dict[str, str]] = []
        seen_names: set = set()

        for query in search_queries:
            if len(recruiters) >= 5:
                break
            try:
                results = internet_search.invoke({"query": query, "max_results": 5})
                for result in results:
                    if len(recruiters) >= 5:
                        break
                    title = result.get("title", "")
                    url = result.get("url", "")
                    content = result.get("content", "")

                    if any(s in title.lower() for s in ["hiring", "apply now", "job", "vacancy"]):
                        if "linkedin.com/in" not in url:
                            continue

                    name = role = ""
                    if " - " in title:
                        parts = title.split(" - ", 1)
                        name, role = parts[0].strip(), parts[1].strip()
                    elif "|" in title:
                        parts = title.split("|")
                        if " - " in parts[0]:
                            name = parts[0].split(" - ")[0].strip()
                            role = parts[0].split(" - ")[1].strip()
                        else:
                            name = parts[0].strip()
                    else:
                        name = title.strip()

                    if not name or name.lower() in seen_names or len(name) > 50:
                        continue

                    if not role:
                        cl = content.lower()
                        if "manager" in cl:
                            role = "Talent Acquisition Manager"
                        elif "recruiter" in cl or "talent" in cl:
                            role = "Recruiter"
                        else:
                            role = "Talent Acquisition Specialist"

                    recruiters.append({
                        "name": name,
                        "title": role or "Recruiter/Hiring Manager",
                        "company": request.company_name,
                        "linkedin_url": url if "linkedin.com" in url else "",
                        "connection_strategy": (
                            f"Contact regarding {request.job_title} opportunity"
                            if request.job_title else f"Talent at {request.company_name}"
                        ),
                    })
                    seen_names.add(name.lower())
            except Exception:
                continue

        return RecruiterSearchResponse(recruiters=recruiters, count=len(recruiters))

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        filename = file.filename or ""
        text = extract_text_from_bytes(contents, filename)

        combined = text
        if filename.lower().endswith(".pdf"):
            pdf_links = extract_links_from_pdf(contents)
            if pdf_links:
                combined = text + "\n" + "\n".join(pdf_links)

        profiles = extract_urls_from_resume(combined)
        return {
            "success": True,
            "text": text,
            "linkedin_url": profiles["linkedin"],
            "github_url": profiles["github"],
            "portfolio_url": profiles["portfolio"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/create-checkout-session")
async def create_checkout_session(authorization: Optional[str] = Header(default=None)):
    user_id = verify_clerk_token(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required to upgrade.")

    price_id = os.environ.get("STRIPE_PRO_PRICE_ID")
    if not price_id:
        raise HTTPException(status_code=500, detail="Stripe price not configured.")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{_frontend_url}?upgraded=true",
            cancel_url=f"{_frontend_url}?cancelled=true",
            client_reference_id=user_id,
            subscription_data={"metadata": {"clerk_user_id": user_id}},
        )
        return {"checkout_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")


@app.post("/stripe-webhook")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    try:
        event = stripe.Webhook.construct_event(body, sig, webhook_secret)
    except stripe.error.SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid Stripe signature: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    event_type = event["type"]

    if event_type == "checkout.session.completed":
        sess = event["data"]["object"]
        user_id = sess.get("client_reference_id", "")
        if user_id:
            mark_user_pro(
                clerk_user_id=user_id,
                stripe_customer_id=sess.get("customer", ""),
                stripe_sub_id=sess.get("subscription", ""),
            )

    elif event_type in ("customer.subscription.updated",):
        sub = event["data"]["object"]
        if sub.get("status") == "active":
            user_id = sub.get("metadata", {}).get("clerk_user_id", "")
            if not user_id:
                user_id = lookup_user_by_stripe_customer(sub.get("customer", "")) or ""
            if user_id:
                mark_user_pro(user_id, sub.get("customer", ""), sub.get("id", ""))

    elif event_type == "customer.subscription.deleted":
        sub = event["data"]["object"]
        user_id = sub.get("metadata", {}).get("clerk_user_id", "")
        if not user_id:
            user_id = lookup_user_by_stripe_customer(sub.get("customer", "")) or ""
        if user_id:
            mark_user_free(user_id)

    return {"received": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
