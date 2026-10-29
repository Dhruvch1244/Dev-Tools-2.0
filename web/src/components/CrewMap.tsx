import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap } from 'maplibre-gl';
// TrackMap sets up the maplibre worker and stylesheet; we share its F1 re-colour of the street style.
import { STYLE_URL, carbonize } from './TrackMap';
import { CIRCLES } from '../core/people';
import type { PersonRow } from '../lib/types';

export type Pin = { city: string; lat: number; lon: number; people: PersonRow[]; weather?: { temp: number; code: number; day: boolean; max: number | null; min: number | null } | null };

// India, framed so the whole country fits a phone-width card.
const INDIA: [[number, number], [number, number]] = [[68, 7], [97.5, 35.5]];

/**
 * The crew on a map of India: one pin per city, showing who lives there (emoji avatars, coloured
 * by circle) and the live temperature. Tapping a pin selects the city; `me` marks your own city.
 */
export default function CrewMap({ pins, me, selected, onSelect, height = 420 }: { pins: Pin[]; me?: { lat: number; lon: number } | null; selected: string | null; onSelect: (key: string | null) => void; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!document.createElement('canvas').getContext('webgl2')) throw new Error('no webgl2');
        const style = carbonize(await (await fetch(STYLE_URL, { signal: AbortSignal.timeout(8000) })).json());
        if (cancelled || !host.current) return;
        const m = new maplibregl.Map({ container: host.current, style, bounds: INDIA, fitBoundsOptions: { padding: 16 }, attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false });
        m.touchZoomRotate.disableRotation();
        map.current = m;
        m.on('load', () => setReady(true));
        m.on('click', (e) => (e.originalEvent.target as HTMLElement).closest('.crew-pin') || select.current(null));
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Pins: rebuilt when people or weather change.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    for (const p of pins) {
      const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
      const el = document.createElement('button');
      el.className = `crew-pin${selected === key ? ' is-on' : ''}`;
      el.setAttribute('aria-label', `${p.city}: ${p.people.map((x) => x.name).join(', ')}`);
      const faces = p.people
        .slice(0, 3)
        .map((x) => `<span class="crew-face" style="border-color:${CIRCLES[x.circle ?? 'Other']?.color ?? '#9aa0ad'}">${x.emoji ?? x.name.slice(0, 1).toUpperCase()}</span>`)
        .join('');
      const more = p.people.length > 3 ? `<span class="crew-face crew-more">+${p.people.length - 3}</span>` : '';
      const temp = p.weather ? `<span class="crew-temp">${Math.round(p.weather.temp)}°</span>` : '';
      el.innerHTML = `<span class="crew-faces">${faces}${more}</span><span class="crew-city">${p.city}${temp}</span>`;
      el.onclick = (e) => (e.stopPropagation(), select.current(selected === key ? null : key));
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(m));
    }
    if (me) {
      const el = document.createElement('div');
      el.className = 'crew-me';
      el.innerHTML = '<span></span>';
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([me.lon, me.lat]).addTo(m));
    }
  }, [pins, me, ready, selected]);

  // Fly to the selected city, or back out to India.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const p = pins.find((x) => `${x.lat.toFixed(2)},${x.lon.toFixed(2)}` === selected);
    if (p) m.flyTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 6.5), duration: 1200 });
    else m.fitBounds(INDIA, { padding: 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

  if (failed) return <div className="grid place-items-center rounded-xl border border-line bg-surface text-sm text-ink-3" style={{ height }}>Map unavailable offline — the city list below still works.</div>;
  return <div ref={host} className="crew-map w-full overflow-hidden rounded-xl border border-line" style={{ height }} />;
}
