# Dev Tools 2.0 — personal edition

Your own life OS, hosted on your laptop and installed on your phone as an app.
No accounts, no cloud, no restrictions: your data is one SQLite file in `data/`.

| | |
|---|---|
| **Today** | Greeting, live clock, rings for tasks / budget / habits / water, plus today's Gym · Fuel · DSA status |
| **Gym** | Your 7-day split (Push › Pull › Legs › Rest › Upper › Lower › Rest), start-lights session start, set logging with last-session ghosts, F1 sector colours (purple = all-time best, green = beat last time, yellow = below), rest timer, weekly volume, PR board, editable templates, "skipped a day" shift with undo |
| **Fuel** | 146 common Indian dishes per household serving (roti, dal, sabzi, poha, idli…) + custom foods, meals, shift-light calorie gauge, macros, BMR/TDEE/target calculator (Mifflin–St Jeor), copy yesterday, 7-day chart |
| **DSA Season** | 13-week advanced roadmap (156 practice problems, 2/day), concept briefings with tables, weekly timed tests, 3 monthly Grand Prix mega tests + finale, spaced revision queue, points & streaks, live Codeforces / LeetCode / CodeChef contests with reminders, CF/LC rating sync |
| **Visualizer** | 15 animated algorithms (prefix sums, two pointers, sliding window, binary search, monotonic stack, backtracking tree, tree BFS, heap, grid BFS, topo sort, Dijkstra, union-find, coin-change DP, LCS table, KMP) with the executing line highlighted in C++ / Java / Python |
| **Code lab** | Write C++ / Java / Python, run it on this laptop (real g++ / javac / python3), and call `viz` helpers to replay your own run as an animation |
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
systemctl --user enable --now dev-tools-2
sudo loginctl enable-linger $USER   # keep running when logged out
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

## Data & backup

- Database: `data/life.db` · Dropped files: `data/files/`
- Back up by copying the `data/` folder. Set `DATA_DIR=/some/path` to store it elsewhere (e.g. a synced drive).

## Shortcuts

- `⌘K` / `Ctrl+K` — quick add (task, money, note, drop) from anywhere
- `⌘/Ctrl + Enter` — send in Drop
- Phone: swipe rows left to delete, drag sheets down to close

## Ideas for next

- Web Push so reminders arrive even when the app is closed
- Recurring tasks, CSV import of bank statements, weight/sleep trend charts
- Optional passcode lock for when the phone is unlocked by someone else
