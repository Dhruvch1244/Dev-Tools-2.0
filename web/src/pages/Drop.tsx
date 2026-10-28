import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check as CheckIcon, Copy, Download, ExternalLink, FileText, Laptop, Paperclip, Send, Smartphone, Tablet, Trash2, UploadCloud } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { sendDrop } from '../lib/drop';
import { listItem, spring } from '../lib/motion';
import { bytes, haptic, timeAgo } from '../lib/format';
import type { Drop } from '../lib/types';
import { useToast } from '../components/toast';
import { Button, Card, Empty, IconButton, Page, PageHeader, Rise, cx } from '../components/ui';

const DeviceIcon = ({ device }: { device: string | null }) => {
  const Icon = device === 'phone' ? Smartphone : device === 'tablet' ? Tablet : Laptop;
  return <Icon className="size-3.5" aria-label={`from ${device ?? 'device'}`} />;
};

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

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

function DropCard({ drop, onDelete }: { drop: Drop; onDelete: () => void }) {
  const isImage = drop.mime?.startsWith('image/');
  const fileUrl = `/api/drops/${drop.id}/file`;
  return (
    <motion.li layout {...listItem} className="glass group overflow-hidden rounded-3xl">
      {isImage && (
        <a href={`${fileUrl}?inline=1`} target="_blank" rel="noreferrer" className="block bg-surface-2">
          <motion.img initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} src={`${fileUrl}?inline=1`} alt={drop.filename ?? ''} loading="lazy" className="max-h-72 w-full object-cover" />
        </a>
      )}
      <div className="flex items-start gap-3 p-4">
        {drop.kind === 'file' && !isImage && (
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <FileText className="size-5" />
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
          ) : (
            <p className="truncate font-medium">{drop.filename}</p>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
            <DeviceIcon device={drop.device} /> {drop.device ?? 'device'} · {timeAgo(drop.created_at)}
            {drop.size != null && ` · ${bytes(drop.size)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          {drop.kind === 'text' ? (
            <CopyButton text={drop.text!} />
          ) : (
            <a href={fileUrl} download className="grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink" aria-label="Download">
              <Download className="size-4" />
            </a>
          )}
          <IconButton label="Delete" onClick={onDelete}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
    </motion.li>
  );
}

type Upload = { id: number; name: string; progress: number };

export function DropPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: drops = [] } = useQuery({ queryKey: ['drops'], queryFn: () => api<Drop[]>('/drops') });
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
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

  const sendText = async () => {
    if (!text.trim()) return;
    await sendDrop({ text });
    setText('');
    haptic(12);
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
        <PageHeader eyebrow="Phone ⇄ Laptop" title={<span className="text-gradient">Drop</span>} />
        <Card className="mb-6">
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
          <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              <Paperclip className="size-4" /> Files
            </Button>
            <span className="text-xs text-ink-3 max-sm:hidden">⌘/Ctrl + Enter to send</span>
            <Button className="ml-auto" size="sm" onClick={sendText} disabled={!text.trim()}>
              <Send className="size-4" /> Send
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

        <Rise>
          <ul className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {drops.map((d) => (
                <DropCard key={d.id} drop={d} onDelete={() => void remove(d)} />
              ))}
            </AnimatePresence>
          </ul>
          {drops.length === 0 && <Empty icon={<Send className="size-6" />} title="Nothing dropped yet" hint="Send something from your phone and it lands here instantly, and vice-versa." />}
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
