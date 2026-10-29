import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, ExternalLink, Play, RotateCcw } from 'lucide-react';
import { useSeason } from '../../lib/dsa';
import { ALGOS, algoById } from '../../core/dsa/viz';
import { PLAYGROUND_STARTER, VIZ_CODE, parseMarked, type Lang } from '../../core/dsa/vizCode';
import { CodeView } from '../../components/CodeView';
import { FrameView, PlayerBar, usePlayer } from '../../components/VizStage';
import { Button, Card, Input, Page, PageHeader, Rise, SectionTitle, Segmented } from '../../components/ui';
import { LANGS, RunPanel } from './Problem';

export function VizGallery() {
  return (
    <Page>
      <Rise className="mb-3">
        <Link to="/dsa" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Season HQ
        </Link>
      </Rise>
      <PageHeader eyebrow="Telemetry replays" title="Visualizer" action={<Link to="/dsa/lab"><Button variant="soft">Animate my own code</Button></Link>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ALGOS.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 18, skewX: -6 }} animate={{ opacity: 1, y: 0, skewX: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 }}>
            <Link to={`/dsa/viz/${a.id}`} className="group relative block h-full overflow-hidden rounded-lg border border-line bg-surface p-4 transition hover:border-accent">
              <span className="pointer-events-none absolute -right-3 -top-5 text-[90px] font-black italic leading-none text-white/[0.03]">{String(i + 1).padStart(2, '0')}</span>
              <p className="text-micro font-black uppercase tracking-[0.2em] text-accent-2">{a.pattern}</p>
              <p className="mt-1 text-lg font-black italic uppercase leading-tight">{a.title}</p>
              <p className="mt-1.5 text-sm text-ink-2">{a.blurb}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 transition group-hover:text-ink">
                <Play className="size-3.5 fill-current" /> Replay
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </Page>
  );
}

export function VizPlayer() {
  const id = useParams().id ?? '';
  const algo = algoById(id) ?? ALGOS[0];
  const { lang, setLang } = useSeason();
  const [inputs, setInputs] = useState(() => Object.fromEntries(algo.inputs.map((i) => [i.key, i.value])));
  const [applied, setApplied] = useState(inputs);
  const frames = useMemo(() => {
    try {
      return algo.run(applied);
    } catch {
      return [];
    }
  }, [algo, applied]);
  const p = usePlayer(frames.length);
  const frame = frames[p.i];
  const { code, lines } = useMemo(() => parseMarked(VIZ_CODE[algo.id][lang]), [algo.id, lang]);

  return (
    <Page>
      <Rise className="mb-3">
        <Link to="/dsa/viz" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> All visualizers
        </Link>
      </Rise>
      <PageHeader
        eyebrow={algo.pattern}
        title={algo.title}
        action={
          <a href={`https://leetcode.com/problems/${algo.problem}/`} target="_blank" rel="noreferrer">
            <Button variant="ghost">
              Practice it <ExternalLink className="size-4" />
            </Button>
          </a>
        }
      />
      <Rise className="-mt-4 mb-5 max-w-3xl text-ink-2">{algo.blurb}</Rise>

      <Rise className="mb-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(inputs);
          }}
        >
          {algo.inputs.map((inp) => (
            <label key={inp.key} className="min-w-[160px] flex-1 text-micro font-black uppercase tracking-[0.15em] text-ink-3">
              {inp.label}
              <Input autoCorrect="off" autoCapitalize="off" spellCheck={false} value={inputs[inp.key]} onChange={(e) => setInputs({ ...inputs, [inp.key]: e.target.value })} className="mt-1 font-mono text-label normal-case tracking-normal" />
            </label>
          ))}
          <Button type="submit">
            <RotateCcw className="size-4" /> Re-run
          </Button>
        </form>
      </Rise>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="space-y-5">
          {frame ? <FrameView frame={frame} id={algo.id} /> : <p className="text-sm text-warn">That input couldn't be parsed.</p>}
          <PlayerBar p={p} count={frames.length} msg={frame?.msg} />
        </Card>
        <Card>
          <SectionTitle action={<Segmented value={lang} onChange={setLang} options={LANGS} />}>Code</SectionTitle>
          <CodeView value={code} lang={lang} readOnly highlightLine={frame?.line ? lines[frame.line] : null} minHeight={200} />
          <p className="mt-2 text-tiny text-ink-3">The highlighted line is the one the current frame is executing. Space = play/pause · ← → = step.</p>
        </Card>
      </div>
    </Page>
  );
}

export function CodeLab() {
  const { lang, setLang } = useSeason();
  const [codes, setCodes] = useState<Record<Lang, string>>(() => {
    try {
      return { ...PLAYGROUND_STARTER, ...JSON.parse(localStorage.getItem('lab-code') ?? '{}') };
    } catch {
      return PLAYGROUND_STARTER;
    }
  });
  const setCode = (v: string) => {
    const next = { ...codes, [lang]: v };
    setCodes(next);
    try {
      localStorage.setItem('lab-code', JSON.stringify(next));
    } catch {}
  };
  return (
    <Page>
      <Rise className="mb-3">
        <Link to="/dsa" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Season HQ
        </Link>
      </Rise>
      <PageHeader eyebrow="Simulator" title="Code lab" action={<Segmented value={lang} onChange={setLang} options={LANGS} />} />
      <Rise className="-mt-4 mb-5 max-w-3xl text-sm text-ink-2">
        Write a full program in C++, Java or Python. It compiles and runs on this laptop. Call <code className="font-mono text-accent-2">array</code>, <code className="font-mono text-accent-2">ptr</code>, <code className="font-mono text-accent-2">table</code>, <code className="font-mono text-accent-2">cell</code>, <code className="font-mono text-accent-2">var</code> and{' '}
        <code className="font-mono text-accent-2">step</code> on <code className="font-mono">viz</code> ({lang === 'cpp' ? 'viz::' : lang === 'java' ? 'Viz.' : 'viz.'}) and your run is replayed as an animation — each <code className="font-mono">step</code> is one frame.
      </Rise>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <SectionTitle action={<button onClick={() => setCode(PLAYGROUND_STARTER[lang])} className="text-xs font-bold uppercase text-ink-3 hover:text-ink">Reset</button>}>Program</SectionTitle>
          <CodeView value={codes[lang]} lang={lang} onChange={setCode} minHeight={420} maxHeight={640} />
        </Card>
        <Card>
          <SectionTitle>Run & replay</SectionTitle>
          <RunPanel lang={lang} code={codes[lang]} />
        </Card>
      </div>
    </Page>
  );
}
