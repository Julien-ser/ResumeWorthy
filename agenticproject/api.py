"""
ResumeWorthy Job Application + Recruiter Finder Backend API
Serves as FastAPI backend for Next.js frontend
"""

import os
import json
import re
from typing import List, Dict, Any, Literal
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from ddgs import DDGS
import pypdf
import docx
import io
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

load_dotenv()

app = FastAPI(title="ResumeWorthy API", version="2.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== LLM Setup ====================
def get_llm():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    return ChatOpenAI(
        model="arcee-ai/trinity-large-preview:free",
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0.2
    )

# ==================== Tools ====================
@tool
def internet_search(
    query: str,
    max_results: int = 5,
) -> List[Dict[str, Any]]:
    """Search the internet using DuckDuckGo."""
    try:
        ddgs = DDGS()
        results = ddgs.text(query, max_results=max_results)
        formatted = []
        for r in results:
            formatted.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "content": r.get("body", "")
            })
        return formatted
    except Exception as e:
        raise RuntimeError(f"Search failed: {e}")


# ==================== Pydantic Models ====================
class JobSearchRequest(BaseModel):
    target_title: str
    target_location: str
    max_results: int = 5

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


# ==================== Helper Functions ====================
def extract_text_from_bytes(file_bytes: bytes, filename: str) -> str:
    """Extract text from uploaded file."""
    if filename.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf"):
        pdf = pypdf.PdfReader(io.BytesIO(file_bytes))
        return "\n".join((p.extract_text() or "") for p in pdf.pages)
    elif filename.endswith(".docx"):
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)
    else:
        raise ValueError("Unsupported file format")


def fetch_url_content(url: str, timeout: int = 5) -> str:
    """Fetch and extract text content from a URL."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, timeout=timeout, headers=headers, allow_redirects=True)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, "html.parser")
        
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
        
        # Get text
        text = soup.get_text(separator="\n", strip=True)
        
        # Clean up whitespace
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        return "\n".join(lines[:1000])  # Limit to first 1000 lines
    except Exception as e:
        return ""


def extract_linkedin_info(url: str) -> str:
    """Extract key info from LinkedIn profile URL."""
    if not url or "linkedin.com" not in url:
        return ""
    
    content = fetch_url_content(url)
    
    # Extract key sections (headline, about, experience)
    sections = []
    lines = content.split("\n")
    
    for line in lines:
        if any(keyword in line.lower() for keyword in ["experience", "education", "skills", "about", "summary", "headline"]):
            sections.append(line)
    
    return "\n".join(sections[:500])


def extract_github_info(url: str) -> str:
    """Extract key info from GitHub profile URL."""
    if not url or "github.com" not in url:
        return ""
    
    try:
        # Extract username from URL
        username = url.rstrip("/").split("/")[-1]
        
        # Fetch GitHub API data (public data, no auth required)
        api_url = f"https://api.github.com/users/{username}"
        headers = {"User-Agent": "ResumeWorthy"}
        
        response = requests.get(api_url, timeout=5, headers=headers)
        response.raise_for_status()
        
        user_data = response.json()
        
        # Extract relevant info
        info_parts = []
        if user_data.get("bio"):
            info_parts.append(f"Bio: {user_data['bio']}")
        if user_data.get("company"):
            info_parts.append(f"Company: {user_data['company']}")
        if user_data.get("blog"):
            info_parts.append(f"Website: {user_data['blog']}")
        if user_data.get("location"):
            info_parts.append(f"Location: {user_data['location']}")
        if user_data.get("public_repos"):
            info_parts.append(f"Public Repos: {user_data['public_repos']}")
        
        # Fetch top repositories
        repos_url = f"https://api.github.com/users/{username}/repos?sort=stars&per_page=5"
        repos_response = requests.get(repos_url, timeout=5, headers=headers)
        repos_response.raise_for_status()
        repos = repos_response.json()
        
        if repos:
            info_parts.append("\nTop Projects:")
            for repo in repos[:5]:
                if repo.get("description"):
                    info_parts.append(f"- {repo['name']}: {repo['description']}")
                else:
                    info_parts.append(f"- {repo['name']}")
        
        return "\n".join(info_parts)
    except Exception as e:
        return ""


def extract_portfolio_info(url: str) -> str:
    """Extract key info from portfolio website."""
    if not url:
        return ""
    
    content = fetch_url_content(url)
    
    # Look for key sections
    sections = []
    lines = content.split("\n")
    
    for line in lines[:300]:  # Focus on header/intro
        if line.strip() and len(line.strip()) > 10:
            sections.append(line)
    
    return "\n".join(sections[:200])


def clean_dashes(text: str) -> str:
    """Replace em dashes and en dashes with hyphens."""
    text = text.replace("—", "-")  # em dash
    text = text.replace("–", "-")  # en dash
    text = text.replace("\u2014", "-")  # unicode em dash
    text = text.replace("\u2013", "-")  # unicode en dash
    return text


# ==================== API Endpoints ====================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/search-jobs", response_model=JobSearchResponse)
async def search_jobs(request: JobSearchRequest):
    """Search for job postings based on title and location."""
    try:
        # Targeted search queries for actual job postings
        search_queries = [
            f'{request.target_title} {request.target_location} site:linkedin.com/jobs/view',
            f'{request.target_title} {request.target_location} site:greenhouse.io',
            f'{request.target_title} {request.target_location} site:lever.co',
            f'{request.target_title} {request.target_location} "apply now"',
            f'{request.target_title} {request.target_location} site:careers',
        ]
        
        raw_jobs = []
        seen_urls = set()
        
        for search_query in search_queries:
            if len(raw_jobs) >= request.max_results:
                break
            
            try:
                search_results = internet_search.invoke({"query": search_query, "max_results": 8})
                
                for result in search_results:
                    if len(raw_jobs) >= request.max_results:
                        break
                    
                    url = result.get("url", "").strip()
                    title = result.get("title", "").strip()
                    content = result.get("content", "").strip()
                    
                    if not url.startswith("http") or url in seen_urls:
                        continue
                    
                    # Skip generic landing pages and search pages
                    skip_patterns = [
                        "linkedin.com/feed",
                        "linkedin.com/jobs/search",
                        "linkedin.com/jobs/?",
                        "indeed.com/jobs",
                        "glassdoor.com/jobs",
                        "glassdoor.com/job-search",
                        "/search?",
                        "/browse/",
                        "/explore/",
                        "apply.workable/jobs",
                    ]
                    
                    if any(pattern in url.lower() for pattern in skip_patterns):
                        continue
                    
                    company = "Unknown Company"
                    job_title = request.target_title
                    
                    # Parse title to extract company and job title
                    if " at " in title:
                        parts = title.split(" at ")
                        job_title = parts[0].strip()
                        company = parts[1].split("|")[0].split("-")[0].strip()
                    elif " - " in title:
                        parts = title.split(" - ", 1)
                        if len(parts[0]) < 50:  # Company name usually shorter
                            company = parts[0].strip()
                            job_title = parts[1].strip()
                        else:
                            job_title = parts[0].strip()
                            company = parts[1].strip()
                    elif "|" in title:
                        parts = title.split("|")
                        job_title = parts[0].strip()
                        company = parts[1].strip() if len(parts) > 1 else company
                    
                    # Extract company from URL patterns
                    if company == "Unknown Company":
                        if "-at-" in url.lower():
                            match = re.search(r"-at-([a-z0-9-]+)", url, re.I)
                            if match:
                                company = match.group(1).replace("-", " ").title()
                        elif "greenhouse" in url or "lever" in url:
                            domain_part = url.split("//")[1].split(".")[0]
                            if domain_part and domain_part != "www":
                                company = domain_part.replace("-", " ").title()
                    
                    if company == "Unknown Company" or len(company) > 60:
                        company = "To be determined"
                    
                    location = request.target_location.split(" OR ")[0] if request.target_location else "Remote"
                    
                    job = {
                        "company": company,
                        "title": job_title,
                        "location": location,
                        "link": url,
                        "description": content[:120] if content else "Job posting"
                    }
                    
                    raw_jobs.append(job)
                    seen_urls.add(url)
                    
            except Exception as e:
                continue
        
        return JobSearchResponse(jobs=raw_jobs, count=len(raw_jobs))

    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/tailor-resume", response_model=ResumeTailorResponse)
async def tailor_resume(request: ResumeTailorRequest):
    """Tailor resume and generate cover letter for a specific job."""
    try:
        llm = get_llm()
        
        # Fetch additional profile information
        linkedin_info = ""
        github_info = ""
        portfolio_info = ""
        
        if request.linkedin_url:
            try:
                linkedin_info = extract_linkedin_info(request.linkedin_url)
            except:
                pass
        
        if request.github_url:
            try:
                github_info = extract_github_info(request.github_url)
            except:
                pass
        
        if request.portfolio_url:
            try:
                portfolio_info = extract_portfolio_info(request.portfolio_url)
            except:
                pass
        
        # Build comprehensive context
        context_parts = [f"Original Resume:\n{request.resume_text[:2500]}"]
        
        if linkedin_info:
            context_parts.append(f"LinkedIn Profile Info:\n{linkedin_info[:500]}")
        
        if github_info:
            context_parts.append(f"GitHub Profile Info:\n{github_info[:500]}")
        
        if portfolio_info:
            context_parts.append(f"Portfolio Info:\n{portfolio_info[:300]}")
        
        candidate_context = "\n\n".join(context_parts)
        
        # Build resume prompt with enhanced context
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
        
        resume_response = llm.invoke([HumanMessage(content=resume_prompt)])
        tailored_resume = resume_response.content if hasattr(resume_response, 'content') else str(resume_response)
        tailored_resume = clean_dashes(tailored_resume)
        
        # Generate cover letter with rich context
        letter_prompt = (
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
        
        letter_response = llm.invoke([HumanMessage(content=letter_prompt)])
        cover_letter = letter_response.content if hasattr(letter_response, 'content') else str(letter_response)
        cover_letter = clean_dashes(cover_letter)
        
        return ResumeTailorResponse(
            tailored_resume=tailored_resume,
            cover_letter=cover_letter
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/find-recruiters", response_model=RecruiterSearchResponse)
async def find_recruiters(request: RecruiterSearchRequest):
    """Find recruiters at a company for a specific job title."""
    try:
        # Search for recruiters on LinkedIn and other platforms
        search_queries = [
            f'{request.company_name} recruiter {request.job_title} site:linkedin.com/in',
            f'{request.company_name} hiring manager {request.job_title} site:linkedin.com',
            f'{request.company_name} talent acquisition manager site:linkedin.com',
        ]
        
        recruiters = []
        seen_names = set()  # Track to avoid duplicates
        
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
                    
                    # Skip job listings, keep only LinkedIn profiles
                    if any(skip in title.lower() for skip in ["hiring", "apply now", "job", "vacancy"]):
                        if "linkedin.com/in" not in url:
                            continue
                    
                    # Extract name and role from title
                    # Pattern: "Name - Title at Company" or "Name - Title | Company"
                    name = ""
                    role = ""
                    
                    if " - " in title:
                        parts = title.split(" - ", 1)
                        name = parts[0].strip()
                        role = parts[1].strip() if len(parts) > 1 else ""
                    elif "|" in title:
                        parts = title.split("|")
                        if " - " in parts[0]:
                            name = parts[0].split(" - ")[0].strip()
                            role = parts[0].split(" - ")[1].strip()
                        else:
                            name = parts[0].strip()
                            role = ""
                    else:
                        name = title.strip()
                    
                    # Skip if no name extracted or already seen
                    if not name or name.lower() in seen_names or len(name) > 50:
                        continue
                    
                    # Improve role extraction
                    if not role:
                        if any(word in content.lower() for word in ["recruiter", "talent", "hiring"]):
                            if "manager" in content.lower():
                                role = "Talent Acquisition Manager"
                            elif "recruiter" in content.lower():
                                role = "Recruiter"
                            else:
                                role = "Talent Acquisition Specialist"
                    
                    if role and request.job_title and request.job_title.lower() in role.lower():
                        role = role  # Keep it if it matches job title
                    
                    recruiter = {
                        "name": name,
                        "title": role or "Recruiter/Hiring Manager",
                        "company": request.company_name,
                        "linkedin_url": url if "linkedin.com" in url else "",
                        "connection_strategy": f"Contact regarding {request.job_title} opportunity" if request.job_title else f"Talent at {request.company_name}"
                    }
                    recruiters.append(recruiter)
                    seen_names.add(name.lower())
            except:
                continue
        
        return RecruiterSearchResponse(recruiters=recruiters, count=len(recruiters))
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """Upload and parse a resume file."""
    try:
        contents = await file.read()
        text = extract_text_from_bytes(contents, file.filename or "")
        return {"success": True, "text": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
