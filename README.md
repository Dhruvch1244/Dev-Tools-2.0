# Dev Tools 2.0 — personal edition

Your own life OS, hosted on your laptop and installed on your phone as an app.
No accounts, no cloud, no restrictions: your data is one SQLite file in `data/`.

| | |
|---|---|
| **Today** | Greeting, live clock, rings for tasks / budget / habits / water, plus today's Gym · Fuel · DSA status |
| **Gym** | 232-exercise library (search / muscle filters, swap a machine mid-session), +/− steppers for one-handed logging, your 7-day split (Push › Pull › Legs › Rest › Upper › Lower › Rest), start-lights session start, set logging with last-session ghosts, F1 sector colours (purple = all-time best, green = beat last time, yellow = below), rest timer, weekly volume, PR board, editable templates, "skipped a day" shift with undo |
| **Fuel** | 422 foods — home Indian dishes per household serving, South Indian & regional (Bengali, Gujarati, Maharashtrian, Rajasthani, Kerala…), restaurant & fast food, packaged staples, drinks, and raw ingredients per 100 g — plus custom foods, meals, shift-light calorie gauge, macros, BMR/TDEE/target calculator (Mifflin–St Jeor), copy yesterday, 7-day chart |
| **DSA Season** | 13-week advanced roadmap (156 practice problems, 2/day), **full LeetCode statements in-app** (cached for offline), a **local judge** that runs your C++/Java/Python `Solution` against the official examples (215/219 problems; custom-`Node` ones defer to LeetCode), concept briefings with tables, weekly timed tests, 3 monthly Grand Prix mega tests + finale, spaced revision queue, points & streaks, live Codeforces / LeetCode / CodeChef contests with reminders, CF/LC rating sync |
| **Visualizer** | 15 animated algorithms (prefix sums, two pointers, sliding window, binary search, monotonic stack, backtracking tree, tree BFS, heap, grid BFS, topo sort, Dijkstra, union-find, coin-change DP, LCS table, KMP) with the executing line highlighted in C++ / Java / Python |
| **Code lab** | Write C++ / Java / Python, run it on this laptop (real g++ / javac / python3), and call `viz` helpers to replay your own run as an animation |
| **Sport** | Badminton (singles/doubles, games won, partner), runs, walks, rides & more; live GPS tracker with F1 circuit-map route, pace and per-km splits; MET/ACSM calorie estimates; auto-ticks matching habits |
| **Routines** | Recurring time blocks with steps, push reminders and linked habits; **two-way Google Calendar** (routines become weekly events; your events show on Today) |
| **Race report** | Weekly classification: gym, fuel, sport, DSA, habits/routines, health — vs the week before |
| **Briefs** | 08:00 morning brief + 21:30 evening debrief pushes (configurable), Sunday race-report push |
| **Pit radio (AI coach)** | Graduated hints, "why is it failing?" from the judge's failing case, solution review and notes drafts on every DSA problem; a meal planner on Fuel. Runs through the **local Claude Code CLI** (`claude -p`, your existing login — no API key), with all tools disabled. Silent during tests/mocks. `COACH_MODEL` env overrides the model (default `sonnet`). |
| **Tasks / Notes / Money / Drop / Life** | Tasks with reminders, notes, expenses & budgets & subscriptions, phone⇄laptop drop, habits/health/journal |

Everything syncs **live** between devices: a write on your phone shows up on your laptop instantly (Server-Sent Events).

## Stack

- **Server:** [Hono](https://hono.dev) on Node 26, built-in `node:sqlite` (no native modules), SSE for live sync
- **Web:** React 19, Vite, TypeScript, Tailwind CSS v4, [Motion](https://motion.dev), TanStack Query, installable PWA (works offline with last-known data)
- **Design:** the dsgn philosophy in an F1 race voice — carbon-black surfaces, racing red, Titillium Web italic display type, skewed colour-wipe transitions, start lights, timing-screen colours; spring physics throughout; honours *Reduce motion*
- **Code runner:** `POST /api/run` compiles/runs with time + memory limits, one queue for all runs. Disable with `RUNNER=off`.

## Run it

```bash
npm install
npm run dev          # http://localhost:5300 (hot reload; API on :4300)

npm run build
npm start            # production: http://localhost:4300
```

Keep it always on with the bundled systemd user service:

```bash
cp deploy/dev-tools-2.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now dev-tools-2
sudo loginctl enable-linger $USER   # start at boot, even before you log in

# after pulling changes / rebuilding:
npm run build && systemctl --user restart dev-tools-2
journalctl --user -u dev-tools-2 -f # logs
```

## Use it from your phone (Tailscale)

The server only listens on `127.0.0.1`, so nothing on your Wi-Fi or the internet can reach it.
Tailscale gives your phone a private, encrypted path to it from anywhere (home, office, mobile data).

1. **Laptop:** install and log in
   ```bash
   sudo pacman -S tailscale            # CachyOS / Arch
   sudo systemctl enable --now tailscaled
   sudo tailscale up
   ```
2. **Phone:** install the Tailscale app and sign in with the same account.
3. **Laptop:** expose the app to your tailnet over HTTPS:
   ```bash
   sudo tailscale serve --bg 4300
   tailscale serve status              # shows https://<laptop>.<tailnet>.ts.net
   ```
   (Enable *HTTPS certificates* in the Tailscale admin console → DNS, if prompted.)
4. **Phone:** open that `https://…ts.net` URL, then **Add to Home Screen** (Safari share sheet / Chrome menu).
   It launches full-screen like a native app.

HTTPS matters: it's what allows the service worker (offline mode) and notifications on the phone.

## Push reminders

Tasks with a due **time** (and contest reminders from DSA Season) send a push notification to every
device that opted in — even when the app is closed. The laptop runs the scheduler (checks every 20 s),
so it has to be awake; reminders more than 6 h late are skipped instead of arriving stale.

1. Open the app through HTTPS (`https://<laptop>.<tailnet>.ts.net`, or `localhost` on the laptop) — push
   needs a secure context and the built app (`npm start`), not `npm run dev`.
2. On iPhone, **Add to Home Screen first** and open it from there — iOS only allows push for installed web apps.
3. Settings (⚙) → **Push reminders → Enable**, then **Send test**.

Notifications have **Mark done** and **Snooze 10 min** buttons (Android/desktop; iOS shows the notification only).
VAPID keys are generated once into `data/vapid.json` (owner-only permissions) — back it up with `data/`,
or every device has to re-enable push.

## Google Calendar (two-way)

Routines → Google Calendar card walks you through it. In short: create a Google Cloud project, enable the
Calendar API, set up the OAuth consent screen (External) and **Publish** it (unpublished apps lose access
every 7 days), create a *Web application* OAuth client with the redirect URI the card shows
(`http://localhost:4300/api/google/callback`), paste the ID/secret, then **Connect** — from the laptop.
Credentials and tokens live in `data/google.json` (0600).

## Data & backup

- Database: `data/life.db` · Dropped files: `data/files/`
- Nightly backups at 03:00 to `data/backups/<date>/` (last 14 kept; database + key files — dropped files aren't included). Settings → Back up now for an extra one.
- Back up by copying the `data/` folder. Set `DATA_DIR=/some/path` to store it elsewhere (e.g. a synced drive).

## Shortcuts

- `⌘K` / `Ctrl+K` — quick add (task, money, note, drop) from anywhere
- `⌘/Ctrl + Enter` — send in Drop
- Phone: swipe rows left to delete, drag sheets down to close

## Ideas for next

- Web Push so reminders arrive even when the app is closed
- Recurring tasks, CSV import of bank statements, weight/sleep trend charts
- Optional passcode lock for when the phone is unlocked by someone else
