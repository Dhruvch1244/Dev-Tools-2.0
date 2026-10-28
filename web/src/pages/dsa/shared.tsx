import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ExternalLink } from 'lucide-react';
import type { Diff, Problem } from '../../core/dsa/plan';
import type { DsaProgress } from '../../lib/types';
import { cx } from '../../components/ui';

export const DIFF_META: Record<Diff, { label: string; color: string }> = {
  E: { label: 'Easy', color: 'var(--green)' },
  M: { label: 'Med', color: 'var(--yellow)' },
  H: { label: 'Hard', color: 'var(--accent)' },
};

export function DiffChip({ d }: { d: Diff }) {
  return (
    <span className="slant inline-block w-12 text-center text-[10px] font-black italic uppercase text-black" style={{ background: DIFF_META[d].color }}>
      {DIFF_META[d].label}
    </span>
  );
}

export const STATUS: { value: DsaProgress['status']; label: string; color: string }[] = [
  { value: 'todo', label: 'To do', color: 'var(--line-strong)' },
  { value: 'attempted', label: 'Tried', color: 'var(--yellow)' },
  { value: 'solved', label: 'Solved', color: 'var(--green)' },
  { value: 'revisit', label: 'Revisit', color: 'var(--purple)' },
];

export function StatusDot({ s }: { s: DsaProgress['status'] }) {
  const m = STATUS.find((x) => x.value === s)!;
  return <span className="inline-block size-2.5 -skew-x-12" style={{ background: m.color }} title={m.label} />;
}

export function ProblemRow({ p, prog, i, extra }: { p: Problem; prog?: DsaProgress; i?: number; extra?: React.ReactNode }) {
  const status = prog?.status ?? 'todo';
  return (
    <motion.li initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (i ?? 0) * 0.03 }} className="group flex items-center gap-3 rounded-md bg-bg px-3 py-2.5">
      <StatusDot s={status} />
      <DiffChip d={p.diff} />
      <Link to={`/dsa/p/${p.id}`} className={cx('min-w-0 flex-1 truncate text-[14px] font-semibold hover:text-accent-2', status === 'solved' && 'text-ink-2')}>
        {p.title}
      </Link>
      {extra}
      <a href={p.url} target="_blank" rel="noreferrer" className="text-ink-3 transition hover:text-ink" aria-label={`Open ${p.title} on LeetCode`}>
        <ExternalLink className="size-4" />
      </a>
    </motion.li>
  );
}

export const PLATFORM: Record<string, { label: string; color: string }> = {
  codeforces: { label: 'CF', color: '#4fb3ff' },
  leetcode: { label: 'LC', color: '#ffa116' },
  codechef: { label: 'CC', color: '#b26bff' },
};

export function countdown(iso: string, now = Date.now()) {
  const s = Math.max(0, (Date.parse(iso) - now) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
