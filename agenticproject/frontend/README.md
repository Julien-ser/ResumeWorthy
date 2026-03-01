# ResumeWorthy Agentic - Frontend

A Next.js 14 frontend for the ResumeWorthy Agentic job search and resume optimization platform.

## Features

- **Job Search**: Search for jobs by keywords, location, and experience level
- **Resume Tailor**: Upload your resume and tailor it for specific job postings with AI-generated cover letters
- **Recruiter Finder**: Find recruiters at target companies for direct outreach

## Prerequisites

- Node.js 18+ 
- FastAPI backend running on `http://localhost:8000`
- OpenRouter API key set in environment variables (shared from parent project)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env.local` file:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Start FastAPI Backend

From the parent `agenticproject/` directory (with virtual environment activated):

```bash
uvicorn api:app --reload --port 8000
```

The backend should be running on `http://localhost:8000`

### 4. Start Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:3001`

## Project Structure

```
app/
├── page.tsx                    # Main page with tab navigation
├── layout.tsx                  # Root layout
├── globals.css                 # Global Tailwind styles
└── components/
    ├── Header.tsx             # App header with logo
    ├── JobSearch.tsx           # Job search form and results
    ├── ResumeTailor.tsx        # Resume upload and tailoring
    └── RecruiterFinder.tsx     # Recruiter search and results
```

## Building for Production

```bash
npm run build
npm start
```

## API Endpoints

The frontend connects to these FastAPI endpoints:

- `POST /search-jobs` - Search job postings
- `POST /tailor-resume` - Generate tailored resume and cover letter
- `POST /find-recruiters` - Find recruiters at company
- `POST /upload-resume` - Parse resume files

See `../api.py` for full endpoint documentation.

## Styling

This project uses Tailwind CSS with a color scheme matching the main ResumeWorthy brand:
- Primary: Indigo (`indigo-600`)
- Secondary: Blue (`blue-600`)
- Accent: Green (for success/tips)
- Danger: Red (for errors)

## Design System

The frontend inherits ResumeWorthy's design language:
- Logo: Gradient indigo-to-blue badge with "RW"
- Typography: Clean, professional sans-serif
- Spacing: Consistent padding and margins
- Components: Cards, buttons, forms with hover effects
