// The iPhone home/lock-screen widget: a script for the free Scriptable app that reads
// /api/hook/widget over Tailscale and draws it in the app's F1 look. Small, medium and large home
// widgets plus the three lock-screen shapes. The last good snapshot is kept, so the widget still
// shows something when the laptop is asleep. Pure: builds the script text only.

export function widgetScript(origin: string) {
  return `// Pit Wall widget — Dev Tools 2.0 (${origin})
// Scriptable: long-press home screen → + → Scriptable → pick a size → Edit Widget → Script: this one.
const BASE = ${JSON.stringify(origin)};
const RED = new Color("#e10600"), BG = new Color("#0b0b0d"), CARD = new Color("#17171b"), INK = Color.white(), DIM = new Color("#8b8f98"), GREEN = new Color("#2bd46b"), SKY = new Color("#4fb3ff"), AMBER = new Color("#ffb547");
const HEAVY = (n) => new Font("AvenirNextCondensed-HeavyItalic", n);
const BOLD = (n) => Font.boldSystemFont(n);
const KEY = "pitwall-widget";

let d = null, stale = false;
try {
  const r = new Request(BASE + "/api/hook/widget");
  r.timeoutInterval = 12;
  d = await r.loadJSON();
  if (!d || !d.date) throw new Error("bad data");
  d._at = Date.now();
  Keychain.set(KEY, JSON.stringify(d));
} catch (e) {
  if (Keychain.contains(KEY)) { d = JSON.parse(Keychain.get(KEY)); stale = true; }
}

const fam = config.widgetFamily || (args.widgetParameter || "medium");
const w = new ListWidget();
w.url = BASE + "/";
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

const left = (x) => Math.max(0, x.target - x.eaten);
const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
const hm = (s) => s ? s : "";
const isToday = d && d.date === new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function bar(frac, color, wpx, hpx) {
  const c = new DrawContext();
  c.size = new Size(wpx, hpx); c.opaque = false; c.respectScreenScale = true;
  const p = new Path(); p.addRoundedRect(new Rect(0, 0, wpx, hpx), hpx / 2, hpx / 2);
  c.addPath(p); c.setFillColor(new Color("#ffffff", 0.12)); c.fillPath();
  const f = Math.max(0, Math.min(1, frac || 0));
  if (f > 0) {
    const q = new Path(); q.addRoundedRect(new Rect(0, 0, Math.max(hpx, wpx * f), hpx), hpx / 2, hpx / 2);
    c.addPath(q); c.setFillColor(color); c.fillPath();
  }
  return c.getImage();
}
function text(stack, s, font, color, lines) {
  const t = stack.addText(String(s)); t.font = font; t.textColor = color || INK; if (lines) t.lineLimit = lines; t.minimumScaleFactor = 0.7;
  return t;
}
function meter(stack, label, value, frac, color, wpx) {
  const row = stack.addStack(); row.layoutHorizontally(); row.centerAlignContent();
  text(row, label, BOLD(10), DIM); row.addSpacer(); text(row, value, BOLD(10), INK);
  stack.addSpacer(3);
  stack.addImage(bar(frac, color, wpx, 5)).imageSize = new Size(wpx, 5);
}
function gymLine() {
  return d.gym.type === "rest" ? "REST DAY" : d.gym.label.toUpperCase() + " DAY";
}
function workLine() {
  if (d.work.mode === "office") return "🏢 Leave " + hm(d.work.leaveBy) + " · out " + hm(d.work.logout);
  if (d.work.mode === "wfh") return "🏠 WFH " + hm(d.work.login) + "–" + hm(d.work.logout);
  if (d.work.mode === "leave") return "🌴 On leave";
  return "🛋️ Day off";
}
function nextLine() {
  if (!d.next) return null;
  const icon = d.next.kind === "bill" ? "🧾" : d.next.kind === "plan" ? "📍" : "⏰";
  const when = d.next.day === d.date ? d.next.at : d.next.day.slice(5).replace("-", "/") + " " + d.next.at;
  return icon + " " + when + " " + d.next.title;
}

function left_col(stack, wpx) {
  const head = stack.addStack(); head.layoutHorizontally(); head.centerAlignContent();
  const dot = head.addText("▌"); dot.font = HEAVY(14); dot.textColor = RED;
  text(head, gymLine(), HEAVY(15), INK, 1);
  stack.addSpacer(4);
  const big = stack.addStack(); big.layoutHorizontally(); big.bottomAlignContent();
  text(big, fmt(left(d.kcal)), HEAVY(30), INK, 1); big.addSpacer(3); text(big, "kcal left", BOLD(9), DIM);
  stack.addSpacer(6);
  meter(stack, "PROTEIN", d.protein.eaten + "/" + d.protein.target + "g", d.protein.eaten / d.protein.target, GREEN, wpx);
  stack.addSpacer(5);
  meter(stack, "WATER", d.water.glasses + "/" + d.water.goal, d.water.glasses / d.water.goal, SKY, wpx);
}

if (!d) {
  w.backgroundColor = BG;
  text(w, "PIT WALL", HEAVY(16), RED);
  w.addSpacer(4);
  text(w, "Can't reach the laptop. Is Tailscale on?", BOLD(11), DIM, 3);
} else if (fam === "accessoryInline") {
  text(w, (d.gym.type === "rest" ? "Rest" : d.gym.label) + " · " + fmt(left(d.kcal)) + " kcal · " + left(d.protein) + "g P", BOLD(12));
} else if (fam === "accessoryCircular") {
  w.addAccessoryWidgetBackground = true;
  const s = w.addStack(); s.layoutVertically(); s.centerAlignContent();
  text(s, left(d.protein) + "g", HEAVY(15)).centerAlignText();
  text(s, "protein", BOLD(8)).centerAlignText();
} else if (fam === "accessoryRectangular") {
  text(w, gymLine() + " · " + fmt(left(d.kcal)) + " kcal", HEAVY(13), INK, 1);
  text(w, "🥛 " + left(d.protein) + "g  💧 " + d.water.glasses + "/" + d.water.goal + "  🔥 " + d.habits.done + "/" + d.habits.total, BOLD(11), INK, 1);
  text(w, d.story.answered < d.story.total ? "✍️ Daily 3: " + d.story.answered + "/3" : (nextLine() || workLine()), BOLD(11), INK, 1);
} else {
  w.backgroundColor = BG;
  w.setPadding(12, 14, 12, 14);
  const small = fam === "small";
  const row = w.addStack(); row.layoutHorizontally(); row.topAlignContent();
  const l = row.addStack(); l.layoutVertically();
  left_col(l, small ? 120 : 130);
  if (!small) {
    row.addSpacer(14);
    const r = row.addStack(); r.layoutVertically();
    text(r, workLine(), BOLD(11), INK, 1);
    r.addSpacer(5);
    const n = nextLine(); if (n) { text(r, n, BOLD(11), INK, 2); r.addSpacer(5); }
    text(r, "🔥 Habits " + d.habits.done + "/" + d.habits.total, BOLD(11), d.habits.total && d.habits.done === d.habits.total ? GREEN : INK, 1);
    r.addSpacer(5);
    text(r, d.story.answered >= d.story.total ? "✍️ Daily 3 done" : "✍️ Daily 3 · " + d.story.answered + "/3", BOLD(11), d.story.answered >= d.story.total ? GREEN : AMBER, 1);
    r.addSpacer(5);
    text(r, d.shutdown ? "🏁 Day closed" : (new Date().getHours() >= 17 ? "🏁 Shutdown waiting" : (d.gym.sets ? "💪 " + d.gym.sets + " sets logged" : d.gym.focus)), BOLD(11), d.shutdown ? GREEN : DIM, 1);
  }
  if (fam === "large") {
    w.addSpacer(12);
    text(w, "TODAY'S TOP 3", HEAVY(13), RED);
    w.addSpacer(4);
    if (!d.top || !d.top.length) text(w, "Set them in the morning card.", BOLD(11), DIM);
    for (const t of (d.top || [])) { text(w, (t.done ? "✓ " : "○ ") + t.t, BOLD(12), t.done ? DIM : INK, 1); w.addSpacer(3); }
  }
  w.addSpacer();
  const foot = w.addStack(); foot.layoutHorizontally();
  text(foot, stale || !isToday ? "offline · last sync" : "updated", BOLD(8), DIM);
  foot.addSpacer(3);
  const time = foot.addDate(new Date(d._at || Date.now())); time.applyTimeStyle(); time.font = BOLD(8); time.textColor = DIM;
}

if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(w);
else if (fam === "small") await w.presentSmall();
else if (fam === "large") await w.presentLarge();
else await w.presentMedium();
Script.complete();
`;
}
