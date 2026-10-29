// AI coach ("pit radio") backed by the local Claude Code CLI in print mode — it uses the owner's
// existing Claude login, so no API key is involved.
//
// Isolation: the CLI runs with every tool disabled (--tools ""), no MCP servers, no session
// persistence, from an empty working directory — it can only read the prompt we send and write
// text back. It can't read files or run commands on the laptop.
// One request at a time (dsgn pillar #2): a second ask waits for the first instead of spawning
// a parallel CLI that would compete for the same plan limits.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CWD = mkdtempSync(join(tmpdir(), 'dt2-coach-'));
const MODEL = process.env.COACH_MODEL ?? 'sonnet';

let busy: Promise<unknown> = Promise.resolve();

export type CoachEvents = { onDelta: (text: string) => void; signal: AbortSignal };

/** Stream a reply. Resolves with the full text; rejects with a readable message. */
export function ask(system: string, prompt: string, ev: CoachEvents): Promise<string> {
  const job = busy.then(() => run(system, prompt, ev));
  busy = job.catch(() => {});
  return job;
}

function run(system: string, prompt: string, { onDelta, signal }: CoachEvents) {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('cancelled'));
    const child = spawn(
      'claude',
      ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--model', MODEL, '--system-prompt', system],
      { cwd: CWD, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let text = '';
    let buf = '';
    let err = '';
    let final: { is_error?: boolean; result?: string } | null = null;
    const timer = setTimeout(() => child.kill('SIGTERM'), 180_000);
    const abort = () => child.kill('SIGTERM');
    signal.addEventListener('abort', abort);
    child.stdout.on('data', (d) => {
      buf += d;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try {
          const j = JSON.parse(line);
          if (j.type === 'stream_event' && j.event?.delta?.type === 'text_delta') {
            text += j.event.delta.text;
            onDelta(j.event.delta.text);
          } else if (j.type === 'result') final = j;
        } catch {}
      }
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(e.message.includes('ENOENT') ? 'Claude Code CLI not found — install it and run `claude` once to log in' : e.message)));
    child.on('close', () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (signal.aborted) return reject(new Error('cancelled'));
      if (final?.is_error) return reject(new Error(final.result || 'Claude returned an error'));
      if (!text && final?.result) (text = final.result), onDelta(text);
      if (!text) return reject(new Error(err.trim().split('\n').pop() || 'No reply — is `claude` logged in? Run `claude` once in a terminal.'));
      resolve(text);
    });
    child.stdin.end(prompt);
  });
}

// ---------------------------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------------------------
export const DSA_SYSTEM = `You are "Pit Radio", a sharp, encouraging DSA coach for a strong engineer preparing for top-tier interviews (Indian product companies / FAANG). They practise in C++, Java and Python on LeetCode problems.
Rules:
- Teach, don't hand over answers. Never output a complete working solution unless the user explicitly asks for the full solution in a chat message.
- Be concrete about THEIR code: quote the exact line/expression when pointing at a bug.
- Use Markdown. Prefer short paragraphs, bullet points and small tables (complexity tables are welcome). Keep code snippets to a few lines.
- Name the pattern (two pointers, monotonic stack, DP on intervals, …) when useful.
- Be brief: aim for under 220 words unless reviewing or explaining.`;

export const FUEL_SYSTEM = `You are a practical sports nutritionist who knows Indian home cooking well. Suggest realistic Indian meals (home-style, common ingredients, approximate portions in katori/roti/pieces) that fit the remaining macros. Use Markdown with a short table per option (item, portion, ~kcal, ~protein). Give 2–3 options, each under ~10% off the remaining calories, prioritise hitting protein. Be brief.`;

const strip = (html: string) =>
  html
    .replace(/<(pre|code)[^>]*>/g, '\n')
    .replace(/<\/(p|pre|li|div|h\d)>/g, '\n')
    .replace(/<li[^>]*>/g, '- ')
    .replace(/<sup>(.*?)<\/sup>/g, '^$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export type DsaAsk = {
  mode: 'hint' | 'debug' | 'review' | 'explain' | 'chat';
  level?: number;
  title: string;
  statementHtml?: string;
  lang: string;
  code: string;
  judge?: { passed: number; total: number; compileError?: string; failing?: { input: string[]; expected?: string; output?: string } | null; stderr?: string };
  message?: string;
  history?: { role: 'user' | 'coach'; text: string }[];
};

const LANG = { cpp: 'C++', java: 'Java', py: 'Python' } as Record<string, string>;

export function dsaPrompt(a: DsaAsk) {
  const parts = [`# Problem: ${a.title}`, a.statementHtml ? strip(a.statementHtml).slice(0, 6000) : '(statement unavailable)', `# My ${LANG[a.lang] ?? a.lang} code`, '```', a.code.slice(0, 12000), '```'];
  if (a.judge) {
    parts.push('# Local judge result');
    if (a.judge.compileError) parts.push('Compile error:', '```', a.judge.compileError.slice(0, 3000), '```');
    else parts.push(`${a.judge.passed}/${a.judge.total} examples passed.`);
    if (a.judge.failing) parts.push(`First failing case — input: ${a.judge.failing.input.join(' | ')}; expected: ${a.judge.failing.expected ?? '?'}; my output: ${a.judge.failing.output ?? '(none — crashed or timed out)'}`);
    if (a.judge.stderr) parts.push('stderr:', '```', a.judge.stderr.slice(0, 1500), '```');
  }
  if (a.history?.length) parts.push('# Conversation so far', ...a.history.slice(-6).map((h) => `${h.role === 'user' ? 'Me' : 'Coach'}: ${h.text.slice(0, 1500)}`));
  const task = {
    hint: [
      'Give me hint level 1 of 3: only the key observation or the pattern to think about. No algorithm steps, no code.',
      'Give me hint level 2 of 3: the approach in 2–4 steps (data structures + what to track), still no code.',
      'Give me hint level 3 of 3: detailed pseudocode-level steps including edge cases — but not compilable code in my language.',
    ][Math.min(2, Math.max(0, (a.level ?? 1) - 1))],
    debug: 'Why does my code fail? Point at the exact line(s) and explain the bug with the failing case traced by hand. Suggest the fix in words (a one-line snippet is fine). Do not rewrite the whole solution.',
    review: 'Review my solution: a table with time and space complexity; is it optimal (and if not, which pattern gets the optimal bound)? List edge cases it might miss, and 1–2 code-quality notes. Be direct.',
    explain: 'Explain the approach my code uses, as concise notes I can save: the key insight, the algorithm in steps, a complexity table, and pitfalls. Use Markdown headings "## Insight", "## Approach", "## Complexity", "## Pitfalls".',
    chat: a.message ?? '',
  }[a.mode];
  parts.push('# Request', task);
  return parts.join('\n\n');
}
