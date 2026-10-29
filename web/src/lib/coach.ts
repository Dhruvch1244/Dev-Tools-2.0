/** POST to a coach endpoint and stream the SSE reply. Resolves when the reply is complete. */
export async function streamCoach(path: string, body: unknown, onDelta: (t: string) => void, signal: AbortSignal) {
  const res = await fetch(`/api/coach/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new Error(`Coach unavailable (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
      if (event === 'delta') onDelta(JSON.parse(data));
      else if (event === 'error') throw new Error(data);
      else if (event === 'done') return;
    }
  }
}
