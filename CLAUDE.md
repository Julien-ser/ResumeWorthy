# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ResumeWorthy is an AI-powered job search and resume optimization platform. It has two active components:

- **`agenticproject/`** — the live product (FastAPI backend + Next.js 14 frontend)
- **`resumeworthy (defunct)/`** — an older Next.js/Supabase prototype, superseded and unused

## Commands

### Backend (FastAPI)
```bash
cd agenticproject
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

### Frontend (Next.js)
```bash
cd agenticproject/frontend
npm install
npm run dev        # port 3001
npm run build
npm run lint
```

## Architecture

The backend (`agenticproject/api.py`) is a single-file FastAPI app. The frontend (`agenticproject/frontend/`) is a Next.js 14 App Router app that calls the backend at `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

**Backend API endpoints:**
- `POST /search-jobs` — runs up to 5 sequential DuckDuckGo searches and parses job listings
- `POST /tailor-resume` — fetches LinkedIn/GitHub/portfolio URLs, then makes 2 sequential LLM calls (resume + cover letter)
- `POST /find-recruiters` — runs 3 sequential DuckDuckGo searches for LinkedIn profiles
- `POST /upload-resume` — parses PDF/DOCX/TXT into plain text

**LLM:** OpenRouter via `langchain_openai.ChatOpenAI`, model `minimax/minimax-m2.5:free`. The `get_llm()` helper is called per-request.

**Frontend routing:** Tab-based (not URL-based). `app/page.tsx` manages the active tab and passes state down. The three tabs render `<JobSearch>`, `<ResumeTailor>`, and `<RecruiterFinder>` components from `app/components/`.

**Path alias:** `@/*` maps to `./app/*` in the frontend.

## Environment Variables

Backend (`agenticproject/.env`):
```
OPENROUTER_API_KEY=...
```

Frontend (`agenticproject/frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_POSTHOG_KEY=...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## Key Design Notes

- The backend uses the synchronous `requests` library inside async FastAPI route handlers — this blocks the event loop. Use `httpx.AsyncClient` or `asyncio.to_thread` when modifying fetch logic.
- DuckDuckGo searches (`DDGS`) and URL fetches in `/search-jobs`, `/find-recruiters`, and `/tailor-resume` are all sequential — they are the primary latency bottleneck.
- The two LLM calls in `/tailor-resume` (resume + cover letter) are sequential and can be parallelized with `asyncio.gather`.
- `agent.py` is a legacy Streamlit prototype — do not modify or reference it for new features.
