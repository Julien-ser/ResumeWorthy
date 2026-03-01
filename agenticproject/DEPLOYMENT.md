# ResumeWorthy Agentic - Deployment Guide

Deploy the ResumeWorthy Agentic platform (Next.js frontend + FastAPI backend) to the cloud for free.

## Option 1: Vercel + Render (Recommended)

### Frontend: Deploy on Vercel (Free)

Vercel is optimized for Next.js and offers a generous free tier.

**Steps:**

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select the `agenticproject/frontend` directory as root
   - Add environment variable: `NEXT_PUBLIC_API_URL=https://resumeworthy.onrender.com`
   - Click "Deploy"

3. **Your frontend is live** at `your-project.vercel.app`

### Backend: Deploy on Render (Free)

Render offers a free tier for Python web services (with 15-min auto-sleep).

**Steps:**

1. **Create Render account** at [render.com](https://render.com)

2. **Create Web Service**
   - Click "New +"
   - Select "Web Service"
   - Connect GitHub repo
   - Set configurations:
     - Root Directory: `agenticproject`
     - Build Command: `pip install -r requirements.txt`
     - Start Command: `uvicorn api:app --host 0.0.0.0 --port 8000`

3. **Add Environment Variables**
   - `OPENROUTER_API_KEY`: Your OpenRouter API key
   - `https://resumeworthy.onrender.com`: `1`

4. **Deploy** - Click "Create Web Service"

5. **Update Vercel env var** with your Render URL: `https://resumeworthy.onrender.com`

6. **Your backend is live** at `https://resumeworthy.onrender.com`

---

## Option 2: Fly.io (All-in-One)

Fly.io offers 3 shared-cpu VMs up to 3GB RAM for free with no cold-start delays. Note: Requires adding a payment method to activate free tier.

### Frontend on Fly.io

1. **Install Fly CLI** 
   ```bash
   # macOS
   brew install flyctl
   # Windows: iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **In frontend directory:**
   ```bash
   cd agenticproject/frontend
   flyctl launch
   ```
   - Choose a name
   - Select Node.js
   - Accept postgres? No
   - Deploy? Yes

3. **Add environment variable:**
   ```bash
   flyctl secrets set NEXT_PUBLIC_API_URL=https://your-backend.fly.dev
   ```

4. **Deploy frontend:**
   ```bash
   flyctl deploy
   ```

### Backend on Fly.io

1. **In backend directory:**
   ```bash
   cd agenticproject
   flyctl launch
   ```
   - Choose a name
   - Select Python 3.10
   - Accept postgres? No
   - Deploy? Yes

2. **Create `Dockerfile`:**
   ```dockerfile
   FROM python:3.10

   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   COPY api.py .
   
   CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8080"]
   ```

3. **Create `requirements.txt`:**
   ```
   fastapi==0.104.1
   uvicorn==0.24.0
   langchain-openai==0.0.5
   langchain-core==0.1.0
   ddgs==3.9.2
   python-docx==0.8.11
   pypdf==3.17.1
   pydantic==2.5.0
   python-dotenv==1.0.0
   requests==2.31.0
   beautifulsoup4==4.12.2
   ```

4. **Add secrets:**
   ```bash
   flyctl secrets set OPENROUTER_API_KEY=sk-...
   ```

5. **Deploy:**
   ```bash
   flyctl deploy
   ```

---

## Option 3: Railway (All-in-One, Free)

Railway offers free credits monthly (~$5 worth) for both frontend and backend.

**Steps:**

1. **Create Railway account** at [railway.app](https://railway.app)

2. **Link GitHub**
   - Create new project from GitHub

3. **Deploy Frontend**
   - Select `agenticproject/frontend` directory
   - Build: `npm run build`
   - Start: `npm start`

4. **Deploy Backend**
   - Select `agenticproject` directory  
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn api:app --host 0.0.0.0 --port $PORT`
   - Add env vars (OPENROUTER_API_KEY)

5. **Railway provides public URLs automacally**

---

## Requirements File

Create `agenticproject/requirements.txt`:

```
fastapi==0.104.1
uvicorn==0.24.0
langchain-openai==0.0.5
langchain-core==0.1.0
ddgs==3.9.2
python-docx==0.8.11
pypdf==3.17.1
pydantic==2.5.0
python-dotenv==1.0.0
requests==2.31.0
beautifulsoup4==4.12.2
```

---

## Testing Your Deployment

Once deployed:

1. **Check backend health:**
   ```bash
   curl https://your-backend-url.com/health
   ```
   Expected response: `{"status":"ok"}`

2. **Visit frontend:**
   - `https://your-frontend.vercel.app`
   - Try searching for jobs
   - Tailor a resume
   - Find recruiters

---

## Important Notes

- **Free tier limitations:**
  - Vercel: Up to 100GB bandwidth/month
  - Render: Services sleep after 15 mins of inactivity (cold starts)
  - Fly.io: 3 shared VMs, 15GB disk space (no cold starts, requires payment method)
  - Railway: Free credits limit (~$5/month)

- **Environment variables:**
  - Always set `OPENROUTER_API_KEY` in production
  - Update `NEXT_PUBLIC_API_URL` to your deployed backend

- **Cold starts:**
  - On Render/Railway, first request may be slow (30 secs) after inactivity
  - Upgrade to paid tiers for instant responses

---

## Custom Domain

Once deployed, you can add a custom domain:

1. **Vercel:** Go to Project Settings → Domains, add your domain
2. **Render:** Similar process in Dashboard
3. **Fly.io:** `flyctl certs create your-domain.com`

---

## Troubleshooting

**"Can't resolve API URL"** - Update `NEXT_PUBLIC_API_URL` in frontend deployment settings

**"502 Bad Gateway"** - Backend may be sleeping; send request to wake it, then retry

**"OpenRouter API error"** - Check that `OPENROUTER_API_KEY` is set in backend secrets

