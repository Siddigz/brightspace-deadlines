# Course Tracker

A Chrome extension that pulls deadlines, grades and announcements from Carleton's Brightspace
into one dashboard. It uses the Brightspace session you're already signed in with, so it never
sees your password.

## Install

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this folder.
3. Pin the extension and click its icon to open the dashboard.

The dashboard syncs when you open it (if the last sync is older than 10 minutes), every 3 hours in the
background, and whenever you press **Sync now**. The icon badge counts unfinished items due in the
next 48 hours.

If sync says you're not signed in, open Brightspace, sign in, and sync again.

## What it tracks

- **Courses:** the ones you've pinned on the Brightspace homepage, in the order set in `src/config.js`.
- **Deadlines:**
  - quizzes and assignment folders with dates
  - standalone calendar events (e.g. Zoom discussions)
  - deadlines from the course outlines that Brightspace doesn't have (`EXTRA_DEADLINES`, `DUE_OVERRIDES`), such as COMP 3000's assignments and tutorial sign-offs and the COMP 2406 in-person tests
  - deadlines you add yourself

  An item counts as done when Brightspace shows a submission or grade, or when you tick it.
  Missed work that the outline still accepts late (`LATE_POLICIES`, e.g. CLCV 2305 papers until
  Apr 10, COMP 2406 assignments for 12 hours) stays at the top in red, with the penalty, until the
  late window closes. Anything else counts as a hard deadline and only shows under Overdue for two weeks.
  Anything worth bonus marks gets a **bonus** tag and a note saying what the bonus is (`BONUS_DEADLINES`,
  plus anything Brightspace grades into a bonus category).
- **Grades:** the Brightspace gradebook, reshaped to match each course outline (`OUTLINES`): "best N of M"
  rules, weights Brightspace is missing or has wrong, and graded work it doesn't list yet. Each course card
  shows your current average, the average you'd need on the rest for each letter grade, and the key rules
  from the outline.

Your ticks and hidden items are stored in `chrome.storage.local` on this computer.

## Editing

- `src/config.js`: course order, colours, labels, and everything taken from the course outlines.
- `src/sync.js`: what gets pulled from the Brightspace API.
- `src/coursesite.js`: reads the COMP 3000 course wiki on each sync (tutorial release dates, assignment due dates).
- `src/grades.js`: the grade math.
- `src/dashboard.js`: the UI.

After editing, click the reload icon on the extension's card in `chrome://extensions`.

## Tests and preview

```bash
npm test
```

```bash
npm run preview
```

Then open http://127.0.0.1:5510/dev/preview.html to see the dashboard with sample data (no extension needed).

## Phone

The phone page is the same dashboard, reading your data from the `data` branch of this (private)
repo. After every sync the extension writes your data there, plus the phone page's own code, and ticks made on either
side are merged (`src/prefs.js`). The phone never talks to Brightspace; it shows what your laptop
last synced.

The public part is only a sign-in box (`phone-public/`): a repo field, a token field and a script
that fetches the real page from your private repo. Nothing in it names this project.

1. Right-click the extension icon, choose **Options**, and follow the steps there: make a
   fine-grained token that can only read and write this repo's contents. The `data` branch must
   exist; it's an empty branch with no history in common with `main`. To make it again:

   ```bash
   git push origin $(git commit-tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904 -m "Phone data"):refs/heads/data
   ```
2. Build the public page:

   ```bash
   npm run build:phone
   ```

   Push `phone-dist/` to your **public** Pages repo (`you/your-pages-repo`; `phone-dist/` is already a clone
   of it), and turn on GitHub Pages for it (Settings → Pages → Deploy from branch → `main`, root).
   You only need to do this again if `phone-public/` changes; the dashboard code itself reaches the
   phone through the private repo.
3. Open `https://you.github.io/your-pages-repo/` on your phone, enter `you/brightspace-data` and the token, then use **Add to Home Screen**.

To try it without GitHub, run `npm run preview` and open http://127.0.0.1:5510/dev/phone-preview.html
(sign in as `me/private` with token `good`).
