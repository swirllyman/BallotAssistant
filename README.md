# 🗳️ U.S. Ballot Assistant (Guided Ballot Guide)

A lightweight, 0-API-cost, privacy-first web application that helps voters navigate their local U.S. ballots step-by-step.

> **Data rule:** a ZIP file in `public/data/zips/` is only shown to voters if it has an `election` block (`name`, `date`, `type`) saying which election it covers. Files without it are treated as unverified, and the app points voters to vote.gov / Vote411 instead. If the election date has passed, the app warns that the guide is out of date.

## 🚀 Architecture & Overview

- **Frontend:** Single-Page Web Application built with HTML5, CSS3 (Vanilla Glassmorphism), and JavaScript.
- **Static Data Engine:** On-demand fetching of ZIP-indexed JSON files (`public/data/zips/{zip}.json`). **0 server or DB overhead.**
- **AI Integration (Hybrid):**
  - *Pre-Rendered:* Candidate bios and race overviews are batch-summarized via Google Gemini API in a GitHub Action and stored as static JSON.
  - *On-Device:* Automatically detects Chrome `window.ai` (Gemini Nano) for local, private candidate comparisons.
- **Automated Pipeline:** GitHub Actions automatically fetch, summarize, and commit updated ballot JSON files on a schedule.

---

## 📂 Repository Structure

```
BallotAssistant/
├── .github/
│   └── workflows/
│       ├── update_election_data.yml # Scheduled AI batch summarization & data generation
│       └── deploy_site.yml          # GitHub Pages deployment workflow
├── public/
│   ├── index.html                    # Production Web App
│   └── data/
│       ├── manifest.json             # Available ZIP codes index
│       └── zips/                     # ZIP-indexed election JSON files
│           ├── 98116.json            # Seattle, WA (LD 34 / CD 7)
│           ├── 94102.json            # San Francisco, CA (CD 11 / AD 17)
│           └── 78701.json            # Austin, TX (CD 35 / HD 49)
├── scripts/
│   ├── build_ballot_data.py          # Python data build & AI summarization script
│   └── seed_election_data.json       # Raw seed election database
├── .gitignore
└── README.md
```

---

## ⚡ Setup & GitHub Actions Instructions

### 1. Initializing Git
```bash
git init
git add .
git commit -m "Initial commit of BallotAssistant"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/BallotAssistant.git
git push -u origin main
```

### 2. Setting Up GitHub Actions AI Summarization
To enable automatic AI summarization of candidate filings via GitHub Actions:
1. Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Click **New repository secret**.
3. Name: `GEMINI_API_KEY`
4. Value: Paste your Google Gemini API key.

Whenever `update_election_data.yml` triggers (or when manually dispatched under the **Actions** tab), GitHub Actions will run the Python script, query Gemini to summarize candidates, and commit updated JSON files back to `main`.

### 3. Enabling GitHub Pages
1. Go to Repository **Settings** -> **Pages**.
2. Under **Build and deployment**, select **GitHub Actions**.
3. Your site will automatically deploy to `https://YOUR_USERNAME.github.io/BallotAssistant/`.

---

## 🛠️ Running Locally

Run a simple local HTTP server from the root folder:
```bash
python -m http.server 8080 --directory public
```
Open [http://localhost:8080](http://localhost:8080) in your browser.
