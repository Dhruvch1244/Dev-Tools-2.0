import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Check as CheckIcon, ClipboardPaste, Copy, Download, ExternalLink, FileText, Film, Image as ImageIcon, Laptop, ListTodo, Mic as MicIcon, Music, Paperclip, Pin, PinOff, Search, Send, Share2, Smartphone, Square, Tablet, Trash2, UploadCloud } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useResource } from '../lib/api';
import { sendDrop } from '../lib/drop';
import { listItem, spring } from '../lib/motion';
import { bytes, haptic, timeAgo, today } from '../lib/format';
import type { Drop, Task } from '../lib/types';
import { useToast } from '../components/toast';
import { Button, Card, Empty, IconButton, Page, PageHeader, Rise, cx } from '../components/ui';

const DeviceIcon = ({ device }: { device: string | null }) => {
  const Icon = device === 'phone' ? Smartphone : device === 'tablet' ? Tablet : Laptop;
  return <Icon className="size-3.5" aria-label={`from ${device ?? 'device'}`} />;
};

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());
type Kind = 'all' | 'pinned' | 'links' | 'text' | 'images' | 'videos' | 'audio' | 'docs';
const kindOf = (d: Drop): Exclude<Kind, 'all' | 'pinned'> =>
  d.kind === 'text' ? (isUrl(d.text ?? '') ? 'links' : 'text') : d.mime?.startsWith('image/') ? 'images' : d.mime?.startsWith('video/') ? 'videos' : d.mime?.startsWith('audio/') ? 'audio' : 'docs';
const FILTERS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pinned', label: '📌 Pinned' },
  { id: 'links', label: 'Links' },
  { id: 'text', label: 'Text' },
  { id: 'images', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
  { id: 'audio', label: 'Voice' },
  { id: 'docs', label: 'Files' },
];

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label="Copy"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        haptic(10);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={String(done)} initial={{ scale: 0.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
          {done ? <CheckIcon className="size-4 text-good" /> : <Copy className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}

/**
 * The share sheet is how an iPhone saves a dropped photo to Photos or a PDF to Files, so file drops
 * share the actual file, not a link. Falls back to download where sharing files isn't supported.
 */
async function shareDrop(d: Drop, toast: ReturnType<typeof useToast>) {
  try {
    if (d.kind === 'text') {
      if (navigator.share) return void (await navigator.share(isUrl(d.text!) ? { url: d.text!.trim() } : { text: d.text! }));
      await navigator.clipboard.writeText(d.text!);
      return toast({ message: 'Copied' });
    }
    const blob = await fetch(`/api/drops/${d.id}/file?inline=1`).then((r) => r.blob());
    const file = new File([blob], d.filename ?? 'file', { type: d.mime ?? blob.type });
    if (navigator.canShare?.({ files: [file] })) return void (await navigator.share({ files: [file] }));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: d.filename ?? 'file' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast({ message: `Couldn't share: ${(e as Error).message}` });
  }
}

function DropCard({ drop, onDelete, onPin }: { drop: Drop; onDelete: () => void; onPin: () => void }) {
  const toast = useToast();
  const { create } = useResource<Task>('tasks');
  const k = kindOf(drop);
  const fileUrl = `/api/drops/${drop.id}/file`;
  const Icon = k === 'videos' ? Film : k === 'audio' ? Music : k === 'images' ? ImageIcon : FileText;
  return (
    <motion.li layout {...listItem} className={cx('glass group overflow-hidden rounded-3xl', drop.pinned ? 'ring-1 ring-yellow/60' : '')}>
      {k === 'images' && (
        <a href={`${fileUrl}?inline=1`} target="_blank" rel="noreferrer" className="block bg-surface-2">
          <motion.img initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} src={`${fileUrl}?inline=1`} alt={drop.filename ?? ''} loading="lazy" className="max-h-72 w-full object-cover" />
        </a>
      )}
      {k === 'videos' && <video src={`${fileUrl}?inline=1`} controls playsInline preload="metadata" className="max-h-72 w-full bg-black" />}
      <div className="flex items-start gap-3 p-4">
        {drop.kind === 'file' && k !== 'images' && k !== 'videos' && (
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {drop.kind === 'text' ? (
            isUrl(drop.text!) ? (
              <a href={drop.text!.trim()} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 break-all font-medium text-accent hover:underline">
                {drop.text} <ExternalLink className="size-3.5 shrink-0" />
              </a>
            ) : (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{drop.text}</p>
            )
          ) : k === 'docs' && drop.mime === 'application/pdf' ? (
            <a href={`${fileUrl}?inline=1`} target="_blank" rel="noreferrer" className="block truncate font-medium text-accent hover:underline">
              {drop.filename}
            </a>
          ) : (
            <p className="truncate font-medium">{drop.filename}</p>
          )}
          {k === 'audio' && <audio src={`${fileUrl}?inline=1`} controls preload="metadata" className="mt-2 h-10 w-full" />}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
            {!!drop.pinned && <Pin className="size-3 text-yellow" />}
            <DeviceIcon device={drop.device} /> {drop.device ?? 'device'} · {timeAgo(drop.created_at)}
            {drop.size != null && ` · ${bytes(drop.size)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-0.5 border-t border-line px-2 py-1">
        {drop.kind === 'text' ? (
          <>
            <CopyButton text={drop.text!} />
            <IconButton
              label="Make it a task"
              onClick={async () => {
                await create({ title: drop.text!.trim().split('\n')[0].slice(0, 120), notes: isUrl(drop.text!) ? drop.text!.trim() : drop.text!.includes('\n') ? drop.text : null, due: today(), priority: 0, done: 0 });
                toast({ message: 'Added to today’s tasks' });
              }}
            >
              <ListTodo className="size-4" />
            </IconButton>
          </>
        ) : (
          <a href={fileUrl} download className="grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink" aria-label="Download">
            <Download className="size-4" />
          </a>
        )}
        <IconButton label={drop.kind === 'file' ? 'Share / save to Photos or Files' : 'Share'} onClick={() => void shareDrop(drop, toast)}>
          <Share2 className="size-4" />
        </IconButton>
        <IconButton label={drop.pinned ? 'Unpin' : 'Pin'} onClick={onPin}>
          {drop.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </IconButton>
        <span className="flex-1" />
        <IconButton label="Delete" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </motion.li>
  );
}

type Upload = { id: number; name: string; progress: number };

/** Tap to record a voice note (MediaRecorder), tap again to stop and send it. */
function useVoiceNote(onDone: (f: File) => void) {
  const toast = useToast();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = r.mimeType || type || 'audio/webm';
        const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
        const stamp = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }).replace(':', '');
        onDone(new File(chunks, `Voice note ${stamp}.${ext}`, { type: mime }));
        setRec(null);
      };
      r.start();
      setSecs(0);
      setRec(r);
      haptic(15);
    } catch {
      toast({ message: 'Microphone not available — allow it in Settings' });
    }
  };
  return { recording: !!rec, secs, toggle: () => (rec ? rec.stop() : void start()) };
}

export function DropPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: drops = [] } = useQuery({ queryKey: ['drops'], queryFn: () => api<Drop[]>('/drops') });
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [filter, setFilter] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const uploadFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const id = Math.random();
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
      sendDrop({ file }, (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))))
        .then(() => toast({ message: `Sent ${file.name}` }))
        .catch(() => toast({ message: `Couldn't send ${file.name}` }))
        .finally(() => setUploads((u) => u.filter((x) => x.id !== id)));
    }
  };
  const voice = useVoiceNote((f) => uploadFiles([f]));

  const sendText = async (t = text) => {
    if (!t.trim()) return;
    await sendDrop({ text: t });
    if (t === text) setText('');
    haptic(12);
  };

  /** One tap: whatever is on the clipboard (image or text) gets dropped. */
  const pasteClipboard = async () => {
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const img = it.types.find((t) => t.startsWith('image/'));
          if (img) {
            const blob = await it.getType(img);
            return uploadFiles([new File([blob], `Pasted ${new Date().toLocaleTimeString()}.${img.split('/')[1]}`, { type: img })]);
          }
        }
      }
      const t = await navigator.clipboard.readText();
      if (t.trim()) (await sendText(t), toast({ message: 'Clipboard dropped' }));
      else toast({ message: 'Clipboard is empty' });
    } catch {
      toast({ message: 'Clipboard blocked — long-press the box and Paste instead' });
    }
  };

  // Paste files/images anywhere on the page (text pastes go to the box as normal).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length) {
        e.preventDefault();
        uploadFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const remove = async (d: Drop) => {
    qc.setQueryData<Drop[]>(['drops'], (old) => old?.filter((x) => x.id !== d.id));
    await api(`/drops/${d.id}`, { method: 'DELETE' });
  };
  const pin = async (d: Drop) => {
    qc.setQueryData<Drop[]>(['drops'], (old) => old?.map((x) => (x.id === d.id ? { ...x, pinned: d.pinned ? 0 : 1 } : x)));
    await api(`/drops/${d.id}`, { method: 'PATCH', body: JSON.stringify({ pinned: !d.pinned }) });
  };
  const clearOld = async () => {
    if (!confirm('Delete unpinned drops older than 7 days?')) return;
    const r = await api<{ removed: number }>('/drops/clear', { method: 'POST', body: JSON.stringify({ days: 7 }) });
    void qc.invalidateQueries({ queryKey: ['drops'] });
    toast({ message: `Cleared ${r.removed} old drop${r.removed === 1 ? '' : 's'}` });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: drops.length, pinned: drops.filter((d) => d.pinned).length };
    for (const d of drops) c[kindOf(d)] = (c[kindOf(d)] ?? 0) + 1;
    return c;
  }, [drops]);
  const shown = drops.filter((d) => (filter === 'all' || (filter === 'pinned' ? d.pinned : kindOf(d) === filter)) && (!search.trim() || `${d.text ?? ''} ${d.filename ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const used = drops.reduce((a, d) => a + (d.size ?? 0), 0);

  const SOURCES = [
    { label: 'Camera', icon: Camera, onClick: () => cameraInput.current?.click() },
    { label: 'Photos', icon: ImageIcon, onClick: () => mediaInput.current?.click() },
    { label: 'Files', icon: Paperclip, onClick: () => fileInput.current?.click() },
    { label: 'Paste', icon: ClipboardPaste, onClick: () => void pasteClipboard() },
  ];

  return (
    <div
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => --dragDepth.current <= 0 && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
      }}
    >
      <Page>
        <PageHeader eyebrow={`Phone ⇄ Laptop · ${drops.length} items · ${bytes(used)}`} title={<span className="text-gradient">Drop</span>} />
        <Card className="mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendText();
            }}
            rows={3}
            placeholder="Paste a link, OTP, address, snippet… or drop/paste a file anywhere on this page."
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-ink-3"
          />
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => (e.target.files && uploadFiles(e.target.files), (e.target.value = ''))} />
          <input ref={mediaInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (e.target.files && uploadFiles(e.target.files), (e.target.value = ''))} />
          <input ref={cameraInput} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => (e.target.files && uploadFiles(e.target.files), (e.target.value = ''))} />
          <div className="mt-2 grid grid-cols-5 gap-1.5 border-t border-line pt-3">
            {SOURCES.map((s) => (
              <motion.button key={s.label} whileTap={{ scale: 0.92 }} onClick={s.onClick} className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 text-micro font-bold uppercase text-ink-2">
                <s.icon className="size-5" />
                {s.label}
              </motion.button>
            ))}
            <motion.button whileTap={{ scale: 0.92 }} onClick={voice.toggle} className={cx('relative flex h-14 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-micro font-bold uppercase', voice.recording ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
              {voice.recording && <motion.span className="absolute inset-0 bg-white/20" animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
              {voice.recording ? <Square className="relative size-5" fill="currentColor" /> : <MicIcon className="size-5" />}
              <span className="relative">{voice.recording ? `${Math.floor(voice.secs / 60)}:${String(voice.secs % 60).padStart(2, '0')}` : 'Voice'}</span>
            </motion.button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-ink-3 max-sm:hidden">⌘/Ctrl + Enter to send · drag files anywhere</span>
            <Button className="ml-auto" size="sm" onClick={() => void sendText()} disabled={!text.trim()}>
              <Send className="size-4" /> Send text
            </Button>
          </div>
          <AnimatePresence>
            {uploads.map((u) => (
              <motion.div key={u.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-2">{u.name}</span>
                  <span className="tabular-nums text-ink-3">{Math.round(u.progress * 100)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${u.progress * 100}%` }} transition={{ ease: 'easeOut' }} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </Card>

        {drops.length > 0 && (
          <Rise className="mb-4 space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
              <Search className="size-4 text-ink-3" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drops" autoCorrect="off" autoCapitalize="off" spellCheck={false} className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3" />
            </div>
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
              {FILTERS.filter((f) => f.id === 'all' || counts[f.id]).map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} className={cx('h-9 shrink-0 rounded-md px-3 text-mini font-bold uppercase', filter === f.id ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                  {f.label} <span className="opacity-60">{counts[f.id] ?? 0}</span>
                </button>
              ))}
              <button onClick={() => void clearOld()} className="ml-auto h-9 shrink-0 rounded-md px-3 text-mini font-bold uppercase text-ink-3 underline">
                Clear old
              </button>
            </div>
          </Rise>
        )}

        <Rise>
          <ul className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {shown.map((d) => (
                <DropCard key={d.id} drop={d} onDelete={() => void remove(d)} onPin={() => void pin(d)} />
              ))}
            </AnimatePresence>
          </ul>
          {drops.length === 0 && <Empty icon={<Send className="size-6" />} title="Nothing dropped yet" hint="Send something from your phone and it lands here instantly, and vice-versa. Share → Dev Tools works from other apps too." />}
          {drops.length > 0 && shown.length === 0 && <p className="py-8 text-center text-sm text-ink-3">Nothing matches.</p>}
        </Rise>
      </Page>

      <AnimatePresence>
        {dragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-bg/70 p-6 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95 }}
              transition={spring}
              className={cx('grid w-full max-w-xl place-items-center rounded-[36px] border-2 border-dashed border-accent bg-accent-soft px-8 py-20 text-center')}
            >
              <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}>
                <UploadCloud className="size-14 text-accent" />
              </motion.div>
              <p className="mt-4 font-display text-2xl font-semibold">Drop to send</p>
              <p className="mt-1 text-sm text-ink-2">Lands on all your devices</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
