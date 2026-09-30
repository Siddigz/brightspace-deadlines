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
