# Caricature Practice Trainer

A minimal, distraction-free web app that shows one random reference face at a
time on a timer, for caricature drawing practice. Runs entirely as static
files — no backend, no API calls during a practice session.

## How it works

- `tools/download_pexels.py` is a one-time (or occasional) local script that
  downloads a pool of portrait photos from Pexels to `faces/`, along with a
  `faces/images.json` manifest.
- `index.html` / `app.js` / `style.css` are the trainer itself. They only
  ever read the local `faces/` folder — **no API key is ever used, stored,
  or exposed in the web app, even after it's deployed publicly.**

## 1. Build your face pool (one-time setup)

Get a free API key at https://www.pexels.com/api/ (no cost, generous limits).

```bash
cd caricature-trainer
pip install -r tools/requirements.txt
export PEXELS_API_KEY="your-key-here"
python3 tools/download_pexels.py --count 300
```

This downloads ~300 portrait photos into `faces/` and writes
`faces/images.json` (filenames + photographer credit) and `faces/CREDITS.md`.
Re-running the script later is safe — it resumes and only adds new photos.

Useful flags:
- `--count 500` — pool size
- `--queries "portrait,headshot,elderly portrait"` — customize search terms
- `--size medium` — Pexels image size to download (`medium` keeps files small
  and the repo lightweight; use `large` for higher resolution)

**Never commit your API key.** It's only ever passed as an env var or CLI
flag when you run the script yourself; nothing in the deployed app needs it.

## 2. Run it locally

Browsers block `fetch()` on `file://` pages, so serve the folder instead of
double-clicking `index.html`:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## 3. Using it

- Pick an interval (1/2/3/5 min, or a custom number of seconds) and a total
  session length (defaults to 60 min).
- Hit **Start Session**. Faces rotate automatically on the timer, drawn from
  the pool without repeats until the whole pool has been shown once, then it
  reshuffles.
- **Pause/Resume** and **Next** work anytime. **Fullscreen** requests
  browser fullscreen for a distraction-free canvas. The session auto-ends
  and shows a summary when time runs out, or hit **End** to stop early.
- Keyboard shortcuts: `Space` = pause/resume, `→` or `N` = next face.

## 4. Deploying to GitHub Pages (so it works on iPhone/iPad without a local server)

Since everything is static files (including the already-downloaded images),
GitHub Pages works with zero changes:

```bash
git init
git add .
git commit -m "Caricature practice trainer"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

Then in the repo's Settings → Pages, set the source to the `main` branch,
root folder. Your API key is never involved in this step — it only lived on
your machine during the one-time download.

On iPhone/iPad, open the GitHub Pages URL in Safari, tap Share → **Add to
Home Screen** for a fullscreen, app-like experience (no browser chrome).

## Alternative / additional photo sources

All of these follow the same pattern — download once locally, ship static
files, no key ever reaches the browser:

- **Unsplash API** — same free-tier / offline-download approach as Pexels;
  good for topping up diversity if Pexels searches feel repetitive.
- **Pixabay API** — another free, permissively-licensed stock photo API,
  easy to add as a second `tools/download_pixabay.py` using the same shape.
- **AI-generated synthetic faces** (e.g. StyleGAN-based generators like
  thispersondoesnotexist.com) — no real person is depicted at all, so there
  are zero licensing or likeness concerns and no rate limits; good for
  padding out the pool with extra variety. Worth trying if you want faces
  with more exaggerated/varied features to practice on.
- **Wikimedia Commons** — mostly public domain, but skews toward photos of
  notable/recognizable people, which is usually *less* ideal for anonymous
  gesture-drawing practice than anonymous stock-model portraits.

Pexels' own license already permits downloading, modifying, and using
photos without attribution, but `faces/images.json` and `faces/CREDITS.md`
keep photographer credit on hand in case you ever want to display it.
