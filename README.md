# 📧 Auto Job Applicator

One-click bulk job application sender. Upload your CV once, add company emails, hit **Send** — GitHub Actions handles the rest. **$0 cost.**

---

## How It Works

```
Your Dashboard (GitHub Pages)
        ↓ reads/writes data via GitHub API
Your Private GitHub Repo  ──→  GitHub Actions  ──→  Gmail SMTP
(companies.json, template.txt, cv/resume.pdf)         ↓
                                               ✅/❌ per company
```

Every email gets the same cover letter, but **"your company"** is automatically replaced with the real company name extracted from the email domain (e.g. `hr@google.com` → `Google`).

---

## One-Time Setup (5 minutes)

### Step 1 — Fork / push this repo to GitHub
Create a **private** GitHub repository and push this folder to it.

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/job-applicator.git
git push -u origin main
```

### Step 2 — Enable GitHub Pages
1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/docs`
4. Save → note your Pages URL (e.g. `https://your-username.github.io/job-applicator`)

### Step 3 — Add Gmail App Password
1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (if not already)
3. Search **"App Passwords"** → Create one (name it "Job Applicator")
4. Copy the 16-character password

### Step 4 — Add GitHub Secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name          | Value                     |
|----------------------|---------------------------|
| `GMAIL_USER`         | your Gmail address        |
| `GMAIL_APP_PASSWORD` | the 16-char App Password  |

### Step 5 — Open the Dashboard
1. Go to your GitHub Pages URL
2. A setup modal appears — enter:
   - Your **GitHub PAT** (generate at [github.com/settings/tokens/new](https://github.com/settings/tokens/new) → Classic → `repo` + `workflow` scopes)
   - Your **GitHub username**
   - Your **repository name** (e.g. `job-applicator`)
3. Click **Connect** — done!

---

## Using the Dashboard

| Section | What to do |
|---|---|
| **Companies** | Paste hundreds of emails at once, or add one by one. Edit/delete anytime. |
| **Cover Letter** | Edit your template. `your company` gets replaced automatically. |
| **My CV** | Upload your PDF once. Stored in the repo, attached to every email. |
| **Send** | Check the readiness list, then click Send. A link to the GitHub Actions log appears. |

### Test before bulk sending
Click **"Send a test to yourself"** on the Send page — it runs the workflow in test mode, sending one email only to **your own Gmail** so you can check formatting.

---

## File Structure

```
job-applicator/
├── .github/workflows/send-applications.yml   ← GitHub Actions workflow
├── docs/                                      ← GitHub Pages dashboard
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   ├── companies.json                         ← your company email list
│   ├── template.txt                           ← your cover letter
│   └── profile.json                           ← your name & subject
├── cv/
│   └── resume.pdf                             ← your CV (uploaded via dashboard)
├── scripts/
│   └── send.js                                ← email sending script
└── package.json
```

---

## Cost Breakdown — $0

| Service | Free limit |
|---|---|
| GitHub Actions | 2,000 min/month (private repos) |
| GitHub Pages | Unlimited |
| Gmail SMTP | ~500 emails/day |

Sending 500 companies = ~12 minutes of Actions time = well within free limits.

---

## Troubleshooting

**"Repository not found" on setup** — Check your username and repo name. Make sure the repo is not empty (has at least one commit).

**"Invalid token"** — Regenerate your PAT with `repo` + `workflow` scopes.

**Emails not sending** — Check the GitHub Actions log. Common causes:
- Wrong Gmail App Password (regenerate it)
- Gmail blocking SMTP (enable App Passwords in Google account)

**"cv/resume.pdf not found"** — Upload your CV via the dashboard first.
