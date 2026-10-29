// 3D route map: the user's real neighbourhood (OpenFreeMap vector tiles, no API key) in the F1
// carbon palette, exaggerated terrain from open elevation tiles, the route as a glowing racing line
// with flowing dashes, and marks — start/finish, every km (fastest in purple), the summit, and
// named landmarks passed. Loaded lazily: maplibre is ~1 MB and only Sport needs it.
//
// Off-switches (dsgn motion.md): reduced-motion users get a still, fitted camera — no orbit, no
// flyover autoplay, no dash animation. All animation loops stop when the component unmounts.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre 6 runs tile parsing in a module worker; Vite ships the file as an asset and we point at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
import { bearing, climb, haversine, kmMarks, resample, type Pt } from '../core/sport';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Re-colour the "liberty" street style into the F1 carbon voice, layer by layer. */
function carbonize(style: StyleSpecification): StyleSpecification {
  const layers = style.layers
    // Bus-stop icons drown the map at running zoom; rail/metro stations stay via the poi_r* layers.
    .filter((l) => !['natural_earth', 'road_area_pattern', 'road_one_way_arrow', 'road_one_way_arrow_opposite', 'poi_transit'].includes(l.id))
    .map((l) => {
      const id = l.id;
      const p = { ...(('paint' in l && l.paint) || {}) } as Record<string, unknown>;
      if (l.type === 'background') p['background-color'] = '#0b0c10';
      else if (l.type === 'fill') {
        if (/water/.test(id)) p['fill-color'] = '#0c1824';
        else if (/park|wood|grass|landcover/.test(id)) (p['fill-color'] = '#12241a'), (p['fill-opacity'] = 0.75);
        else if (/building/.test(id)) (p['fill-color'] = '#17191f'), (p['fill-outline-color'] = '#22252d');
        else (p['fill-color'] = '#101216'), (p['fill-opacity'] = 0.6);
        delete p['fill-pattern'];
      } else if (l.type === 'fill-extrusion') (p['fill-extrusion-color'] = '#1b1e26'), (p['fill-extrusion-opacity'] = 0.85);
      else if (l.type === 'line') {
        if (/water/.test(id)) p['line-color'] = '#13283c';
        else if (/casing/.test(id)) p['line-color'] = '#07080b';
        else if (/motorway|trunk|primary/.test(id)) p['line-color'] = '#4a505e';
        else if (/secondary|tertiary/.test(id)) p['line-color'] = '#373b46';
        else if (/rail/.test(id)) p['line-color'] = '#2a2e38';
        else if (/path|pedestrian|track|service/.test(id)) (p['line-color'] = '#262a33'), delete p['line-dasharray'];
        else if (/road|highway|minor|link|bridge|tunnel/.test(id)) p['line-color'] = '#2c3039';
        else if (/boundary/.test(id)) p['line-color'] = '#2a2e38';
      } else if (l.type === 'symbol') {
        if ('layout' in l && l.layout && 'text-field' in l.layout) {
          p['text-color'] = /water/.test(id) ? '#4f7ea8' : /poi/.test(id) ? '#c9cdd6' : '#7d8392';
          p['text-halo-color'] = '#0b0c10';
          p['text-halo-width'] = 1.4;
        }
        if (/poi/.test(id)) p['icon-opacity'] = 0.9;
      }
      return { ...l, paint: p } as typeof l;
    });
  return { ...style, layers };
}

/** Landmark worth naming: temples, parks, stations, cafés, schools… with a name, near the route. */
const LANDMARK = /place_of_worship|temple|church|mosque|gurudwara|park|garden|railway|subway|station|cafe|school|college|university|hospital|stadium|sports|monument|attraction|museum|historic|castle|memorial|lake|marketplace|mall|zoo|playground/;

/** Resolves when every visible tile (streets + elevation) has loaded, or after 15 s regardless. */
function tilesLoaded(m: MLMap) {
  return new Promise<void>((resolve) => {
    const t0 = Date.now();
    const check = () => (m.areTilesLoaded() && m.isStyleLoaded() ? resolve() : Date.now() - t0 > 15_000 ? resolve() : setTimeout(check, 300));
    setTimeout(check, 600);
  });
}

export type MapInfo = { climb?: { up: number; down: number }; profile?: number[]; landmarks?: string[] };

export default function TrackMap({ pts, mode, height = 340, onInfo, flyKey, fallback }: { pts: Pt[]; mode: 'live' | 'replay'; height?: number | string; onInfo?: (i: MapInfo) => void; flyKey?: number; fallback?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const frames = useRef<number[]>([]);
  const markers = useRef<maplibregl.Marker[]>([]);
  const me = useRef<maplibregl.Marker | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const info = useRef(onInfo);
  info.current = onInfo;
  const lineData = (p: Pt[]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: p.map(([la, ln]) => [ln, la]) } });

  // ---- create once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!document.createElement('canvas').getContext('webgl2')) throw new Error('no webgl2');
        const style = carbonize(await (await fetch(STYLE_URL, { signal: AbortSignal.timeout(8000) })).json());
        if (cancelled || !host.current) return;
        const start = pts.at(-1) ?? pts[0];
        const m = new maplibregl.Map({
          container: host.current,
          style,
          center: start ? [start[1], start[0]] : [77.209, 28.6139],
          zoom: start ? 16 : 11,
          pitch: 58,
          bearing: -20,
          attributionControl: { compact: true },
          maxPitch: 75,
          canvasContextAttributes: { antialias: true },
        });
        map.current = m;
        m.on('load', () => {
          m.addSource('dem', { type: 'raster-dem', tiles: [DEM], tileSize: 256, encoding: 'terrarium', maxzoom: 15 });
          // Exaggerated so a city's gentle slopes actually read as terrain.
          m.setTerrain({ source: 'dem', exaggeration: 2.2 });
          const firstRoad = m.getStyle().layers.find((l: { id: string }) => /road|highway/.test(l.id))?.id;
          m.addLayer({ id: 'hills', type: 'hillshade', source: 'dem', paint: { 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#3a3f4c', 'hillshade-accent-color': '#1b1e26', 'hillshade-exaggeration': 0.55 } }, firstRoad);
          m.setSky({ 'sky-color': '#0b0c10', 'horizon-color': '#2a1214', 'fog-color': '#0b0c10', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.5 });

          m.addSource('route', { type: 'geojson', data: lineData(pts), lineMetrics: true });
          m.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e10600', 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.55 } });
          m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 5, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#ff5747', 1, '#e10600'] } });
          m.addLayer({ id: 'route-flow', type: 'line', source: 'route', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.85, 'line-dasharray': [0, 4, 3] } });
          ready.current = true;
          render(true);
          if (!reduced()) flow();
          // Measure once tiles are in, *then* start any orbit. Not the 'idle' event: the flowing dashes
          // repaint every frame, so the map may never report idle.
          void tilesLoaded(m).then(() => {
            if (!map.current) return;
            describe().catch((e) => console.error('track map describe failed', e));
            if (mode === 'replay' && !reduced()) orbit();
          });
        });
        m.on('error', (e) => {
          // A single missing tile is normal at the edges; only a style/source failure is fatal.
          const msg = String((e as unknown as { error?: Error }).error?.message ?? '');
          if (msg.includes('style')) setFailed('Map tiles unavailable offline');
        });
      } catch {
        if (!cancelled) setFailed('Map tiles unavailable offline');
      }
    })();
    return () => {
      cancelled = true;
      frames.current.forEach(cancelAnimationFrame);
      map.current?.remove();
      map.current = null;
    };
    // created once; route updates go through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flowing white dashes — the classic "ant path", by stepping the dash pattern each frame.
  const flow = () => {
    const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
    let step = -1;
    let last = 0;
    const tick = (t: number) => {
      const m = map.current;
      if (!m) return;
      if (t - last > 55) {
        step = (step + 1) % seq.length;
        last = t;
        if (m.getLayer('route-flow')) m.setPaintProperty('route-flow', 'line-dasharray', seq[step]);
      }
      frames.current.push(requestAnimationFrame(tick));
    };
    frames.current.push(requestAnimationFrame(tick));
  };

  /** Draw marks and point the camera. */
  const render = (first = false) => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('route') as GeoJSONSource | undefined)?.setData(lineData(pts));
    markers.current.forEach((k) => k.remove());
    markers.current = [];
    const el = (cls: string, html: string) => Object.assign(document.createElement('div'), { className: cls, innerHTML: html });
    // A loop ends where it started: one combined flag, and no km mark buried under it.
    const loop = pts.length > 2 && haversine(pts[0], pts.at(-1)!) < 60;
    const nearFinish = (p: Pt) => mode === 'replay' && pts.length > 1 && haversine(p, pts.at(-1)!) < 80;
    if (pts.length) {
      markers.current.push(new maplibregl.Marker({ element: el(`tm-flag ${loop && mode === 'replay' ? 'tm-finish' : 'tm-start'}`, `<span>${loop && mode === 'replay' ? 'START · FINISH' : 'START'}</span>`), anchor: 'bottom' }).setLngLat([pts[0][1], pts[0][0]]).addTo(m));
      for (const k of kmMarks(pts).filter((k) => !nearFinish(k.at))) markers.current.push(new maplibregl.Marker({ element: el(`tm-km${k.fastest ? ' tm-fast' : ''}`, `KM${k.km}<small>${Math.floor(k.minutes)}:${String(Math.round((k.minutes % 1) * 60)).padStart(2, '0')}</small>`), anchor: 'bottom' }).setLngLat([k.at[1], k.at[0]]).addTo(m));
    }
    const head = pts.at(-1);
    if (mode === 'live' && head) {
      if (!me.current) me.current = new maplibregl.Marker({ element: el('tm-me', '<i></i>') }).setLngLat([head[1], head[0]]).addTo(m);
      me.current.setLngLat([head[1], head[0]]);
      // Onboard camera: follow, tilted, facing the direction of travel.
      const prev = pts.at(-4) ?? pts[0];
      m.easeTo({ center: [head[1], head[0]], bearing: pts.length > 3 ? bearing(prev, head) : m.getBearing(), pitch: 62, zoom: 17, duration: first || reduced() ? 0 : 900 });
    } else if (mode === 'replay' && pts.length > 1) {
      if (!loop) markers.current.push(new maplibregl.Marker({ element: el('tm-flag tm-finish', '<span>FINISH</span>'), anchor: 'bottom' }).setLngLat([pts.at(-1)![1], pts.at(-1)![0]]).addTo(m));
      const b = new maplibregl.LngLatBounds();
      pts.forEach(([la, ln]) => b.extend([ln, la]));
      // fitBounds ignores pitch for its framing, so fit flat, then tilt for the 3D look.
      m.fitBounds(b, { padding: 60, duration: 0 });
      m.easeTo({ pitch: 62, bearing: -28, zoom: m.getZoom() - 0.3, duration: first ? 0 : 1200 });
    }
  };

  // Slow broadcast-style orbit around a finished route.
  const orbit = () => {
    const m = map.current;
    if (!m) return;
    const spin = () => {
      if (!map.current || map.current.isMoving()) return;
      map.current.rotateTo((map.current.getBearing() + 25) % 360, { duration: 9000, easing: (t) => t });
    };
    m.on('moveend', spin);
    spin();
  };

  /** Elevation profile from the DEM + named landmarks near the route, once tiles are in. */
  const describe = async () => {
    const m = map.current;
    if (!m || pts.length < 2) return;
    const samples = resample(pts, 25);
    const raw = samples.map(([la, ln]) => (m.queryTerrainElevation([ln, la]) ?? 0) / 2.2); // undo exaggeration
    // DEM tiles interpolate in ~5 m steps; a 5-point moving average keeps real hills and drops the stairs.
    const profile = raw.map((_, i) => {
      const w = raw.slice(Math.max(0, i - 2), i + 3);
      return w.reduce((a, b) => a + b, 0) / w.length;
    });
    const metres = (la: number, ln: number, gla: number, gln: number) => Math.hypot((la - gla) * 111_000, (ln - gln) * 111_000 * Math.cos((la * Math.PI) / 180));
    const near = new Set<string>();
    for (const f of m.queryRenderedFeatures()) {
      const name = f.properties?.name;
      if (!name || !/poi|park|landuse|landcover|water_name/.test(f.layer.id)) continue;
      const cls = `${f.properties.class ?? ''} ${f.properties.subclass ?? ''} ${f.layer.id}`;
      if (!LANDMARK.test(cls)) continue;
      if (f.geometry.type === 'Point') {
        const [gln, gla] = f.geometry.coordinates;
        if (samples.some(([la, ln]) => metres(la, ln, gla, gln) < 120)) near.add(String(name));
      } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
        // Areas (gardens, parks): count it if the route enters the area's bounding box.
        const ring = (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]) as number[][];
        const lns = ring.map((c) => c[0]);
        const las = ring.map((c) => c[1]);
        const [w, e, so, no] = [Math.min(...lns), Math.max(...lns), Math.min(...las), Math.max(...las)];
        if (samples.some(([la, ln]) => ln >= w && ln <= e && la >= so && la <= no)) near.add(String(name));
      }
    }
    const landmarks = [...near].slice(0, 8);
    // Summit mark at the highest sampled point.
    const hi = profile.indexOf(Math.max(...profile));
    if (hi > 0 && Math.max(...profile) - Math.min(...profile) >= 3) {
      const [la, ln] = samples[hi];
      const el = Object.assign(document.createElement('div'), { className: 'tm-summit', innerHTML: `▲ ${Math.round(profile[hi])} m` });
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([ln, la]).addTo(m));
    }
    info.current?.({ climb: climb(profile), profile, landmarks });
  };

  // ---- follow live updates ----
  useEffect(() => {
    if (mode === 'live') render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.length]);

  // ---- flyover replay: draw the route progressively with a chase camera ----
  useEffect(() => {
    const m = map.current;
    if (!flyKey || !m || !ready.current || pts.length < 2) return;
    m.stop();
    const src = m.getSource('route') as GeoJSONSource;
    const total = Math.min(14_000, 4000 + pts.length * 12);
    const t0 = performance.now();
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / total);
      const n = Math.max(2, Math.floor(k * pts.length));
      const slice = pts.slice(0, n);
      src.setData(lineData(slice));
      const head = slice.at(-1)!;
      const prev = slice.at(-8) ?? slice[0];
      m.jumpTo({ center: [head[1], head[0]], bearing: bearing(prev, head), pitch: 64, zoom: 16.6 });
      if (k < 1) id = requestAnimationFrame(step);
      else render();
    };
    id = requestAnimationFrame(step);
    frames.current.push(id);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  // No tiles (offline / blocked) or no WebGL → the plain circuit outline still shows the route.
  if (failed) return <>{fallback ?? null}</>;
  return <div ref={host} className="track-map w-full overflow-hidden rounded-xl border border-line" style={{ height }} />;
}
