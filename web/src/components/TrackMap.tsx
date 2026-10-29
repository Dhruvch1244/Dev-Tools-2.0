// 3D route map: the user's real neighbourhood (OpenFreeMap vector tiles, no API key) in the F1
// carbon palette, exaggerated terrain from open elevation tiles, the route as a glowing racing line
// with flowing dashes, and marks — start/finish, every km (fastest in purple), the summit, and
// named landmarks passed. Loaded lazily: maplibre is ~1 MB and only Sport needs it.
//
// Off-switches (dsgn motion.md): reduced-motion users get a still, fitted camera — no orbit, no
// flyover autoplay, no dash animation. All animation loops stop when the component unmounts.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre 6 runs tile parsing in a module worker; Vite ships the file as an asset and we point at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
import { bearing, climb, haversine, kmMarks, resample, type Pt } from '../core/sport';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
// Route paint. The flyover reveals the line by swapping these for a cut-off step — a paint change
// lands the same frame, where re-sending the geometry goes through the worker and trails the camera.
const LINE: ExpressionSpecification = ['interpolate', ['linear'], ['line-progress'], 0, '#ff5747', 1, '#e10600'];
const GLOW: ExpressionSpecification = ['interpolate', ['linear'], ['line-progress'], 0, '#e10600', 1, '#e10600'];
const upTo = (color: string, f: number): ExpressionSpecification => ['step', ['line-progress'], color, Math.max(1e-4, f), 'rgba(0,0,0,0)'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Line widths for the small streets: liberty only draws service lanes from z15.5 and keeps
// colony streets hairline-thin, so the gali you actually run down vanished. Wider and earlier.
const LANE_WIDTH: Record<string, unknown> = {
  minor: ['interpolate', ['exponential', 1.2], ['zoom'], 12.5, 0.6, 14, 2.6, 16, 5, 20, 20],
  service: ['interpolate', ['exponential', 1.2], ['zoom'], 13, 0.4, 15, 1.8, 17, 4, 20, 10],
  path: ['interpolate', ['exponential', 1.2], ['zoom'], 13.5, 0.6, 16, 1.8, 20, 8],
};

/**
 * Re-colour the "liberty" street style into the F1 voice — night asphalt rather than pitch black,
 * so every street down to the inner lanes reads at a glance and the red racing line still pops.
 */
export function carbonize(style: StyleSpecification): StyleSpecification {
  const layers = style.layers
    // Bus-stop icons drown the map at running zoom; rail/metro stations stay via the poi_r* layers.
    .filter((l) => !['natural_earth', 'road_area_pattern', 'road_one_way_arrow', 'road_one_way_arrow_opposite', 'poi_transit'].includes(l.id))
    .map((l) => {
      const id = l.id;
      const p = { ...(('paint' in l && l.paint) || {}) } as Record<string, unknown>;
      let minzoom = l.minzoom;
      if (l.type === 'background') p['background-color'] = '#1c1f26';
      else if (l.type === 'fill') {
        if (/water/.test(id)) p['fill-color'] = '#1c3a56';
        else if (/park|wood|grass|landcover/.test(id)) (p['fill-color'] = '#1f3a2a'), (p['fill-opacity'] = 0.9);
        else if (/building/.test(id)) (p['fill-color'] = '#2b2f39'), (p['fill-outline-color'] = '#3a3f4b');
        else if (/residential/.test(id)) (p['fill-color'] = '#21242c'), (p['fill-opacity'] = 1);
        else (p['fill-color'] = '#23262e'), (p['fill-opacity'] = 0.8);
        delete p['fill-pattern'];
      } else if (l.type === 'fill-extrusion') {
        // Low and see-through: full-height blocks at this pitch hide the lanes between them.
        p['fill-extrusion-color'] = '#30343f';
        p['fill-extrusion-opacity'] = 0.55;
        p['fill-extrusion-height'] = ['*', ['coalesce', ['get', 'render_height'], 0], 0.45];
        p['fill-extrusion-base'] = ['*', ['coalesce', ['get', 'render_min_height'], 0], 0.45];
      } else if (l.type === 'line') {
        const lane = /path|pedestrian/.test(id) ? 'path' : /service|track/.test(id) ? 'service' : /minor|street/.test(id) ? 'minor' : null;
        if (/water/.test(id)) p['line-color'] = '#24507a';
        else if (/casing/.test(id)) (p['line-color'] = '#121419'), lane === 'service' && (minzoom = 13);
        else if (/motorway|trunk|primary/.test(id)) p['line-color'] = '#a3a9b6';
        else if (/secondary|tertiary/.test(id)) p['line-color'] = '#868c99';
        else if (/rail/.test(id)) p['line-color'] = '#4a4f5c';
        else if (lane === 'path') (p['line-color'] = '#6f7686'), (p['line-dasharray'] = [1.5, 1]), (minzoom = 13.5);
        else if (lane === 'service') p['line-color'] = '#626875';
        else if (/road|highway|minor|link|bridge|tunnel/.test(id)) p['line-color'] = '#6e7482';
        else if (/boundary/.test(id)) p['line-color'] = '#3a3f4b';
        if (lane && !/casing/.test(id)) {
          p['line-width'] = LANE_WIDTH[lane];
          if (lane === 'service') minzoom = 13;
        }
      } else if (l.type === 'symbol') {
        if ('layout' in l && l.layout && 'text-field' in l.layout) {
          p['text-color'] = /water/.test(id) ? '#7fb0dc' : /poi/.test(id) ? '#dfe2e8' : /highway-name/.test(id) ? '#c3c8d2' : '#a7adb9';
          p['text-halo-color'] = '#15171c';
          p['text-halo-width'] = 1.4;
        }
        // Lane names a bit sooner, so the colony's streets are labelled at running zoom.
        if (/highway-name-(minor|path)/.test(id)) minzoom = 14.5;
        if (/poi/.test(id)) p['icon-opacity'] = 0.9;
      }
      return { ...l, paint: p, ...(minzoom !== undefined && { minzoom }) } as typeof l;
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
  const summit = useRef<maplibregl.Marker | null>(null);
  const orbiting = useRef(false);
  const flying = useRef(false);
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
          m.addLayer({ id: 'hills', type: 'hillshade', source: 'dem', paint: { 'hillshade-shadow-color': '#0b0c10', 'hillshade-highlight-color': '#4a505e', 'hillshade-accent-color': '#2a2e38', 'hillshade-exaggeration': 0.35 } }, firstRoad);
          m.setSky({ 'sky-color': '#14161c', 'horizon-color': '#3a1a1c', 'fog-color': '#1c1f26', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.75 });

          m.addSource('route', { type: 'geojson', data: lineData(pts), lineMetrics: true });
          m.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-gradient': GLOW, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.55 } });
          m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 5, 'line-gradient': LINE } });
          m.addLayer({ id: 'route-flow', type: 'line', source: 'route', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.85, 'line-dasharray': [0, 4, 3] } });
          ready.current = true;
          render(true);
          if (!reduced()) flow();
          if (pendingFly.current) flyover();
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
      summit.current?.remove();
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
    const nearFinish = (p: Pt) => mode === 'replay' && pts.length > 1 && haversine(p, pts.at(-1)!) < 150;
    if (pts.length) {
      markers.current.push(new maplibregl.Marker({ opacityWhenCovered: '1', element: el(`tm-flag ${loop && mode === 'replay' ? 'tm-finish' : 'tm-start'}`, `<span>${loop && mode === 'replay' ? 'START · FINISH' : 'START'}</span>`), anchor: 'bottom' }).setLngLat([pts[0][1], pts[0][0]]).addTo(m));
      for (const k of kmMarks(pts).filter((k) => !nearFinish(k.at))) markers.current.push(new maplibregl.Marker({ opacityWhenCovered: '1', element: el(`tm-km${k.fastest ? ' tm-fast' : ''}`, `KM${k.km}<small>${Math.floor(k.minutes)}:${String(Math.round((k.minutes % 1) * 60)).padStart(2, '0')}</small>`), anchor: 'bottom' }).setLngLat([k.at[1], k.at[0]]).addTo(m));
    }
    const head = pts.at(-1);
    if (mode === 'live' && head) {
      if (!me.current) me.current = new maplibregl.Marker({ opacityWhenCovered: '1', element: el('tm-me', '<i></i>') }).setLngLat([head[1], head[0]]).addTo(m);
      me.current.setLngLat([head[1], head[0]]);
      // Onboard camera: follow, tilted, facing the direction of travel.
      const prev = pts.at(-4) ?? pts[0];
      m.easeTo({ center: [head[1], head[0]], bearing: pts.length > 3 ? bearing(prev, head) : m.getBearing(), pitch: 62, zoom: 17.5, duration: first || reduced() ? 0 : 900 });
    } else if (mode === 'replay' && pts.length > 1) {
      if (!loop) markers.current.push(new maplibregl.Marker({ opacityWhenCovered: '1', element: el('tm-flag tm-finish', '<span>FINISH</span>'), anchor: 'bottom' }).setLngLat([pts.at(-1)![1], pts.at(-1)![0]]).addTo(m));
      const b = new maplibregl.LngLatBounds();
      pts.forEach(([la, ln]) => b.extend([ln, la]));
      // fitBounds ignores pitch for its framing, so fit flat, then tilt for the 3D look.
      m.fitBounds(b, { padding: 60, duration: 0 });
      m.easeTo({ pitch: 62, bearing: -28, zoom: m.getZoom() - 0.3, duration: first ? 0 : 1200 });
    }
  };

  // Slow broadcast-style orbit around a finished route. Paused by the flyover (they'd fight over
  // the camera every frame) and stopped for good the moment you touch the map.
  // One rAF loop nudging the bearing — no rotateTo/moveend chains, which raced the flyover's
  // camera and crashed maplibre mid-ease.
  const orbit = () => {
    const m = map.current;
    if (!m) return;
    orbiting.current = true;
    const stop = () => (orbiting.current = false);
    m.on('dragstart', stop);
    m.on('touchstart', stop);
    m.on('wheel', stop);
    let last = 0;
    const tick = (t: number) => {
      if (!map.current) return;
      if (last && orbiting.current && !flying.current && !map.current.isMoving()) map.current.setBearing((map.current.getBearing() + ((t - last) * 25) / 9000) % 360);
      last = t;
      frames.current.push(requestAnimationFrame(tick));
    };
    frames.current.push(requestAnimationFrame(tick));
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
      // Skip it when it would sit on a flag or km mark — a pile of labels reads as noise.
      const taken = markers.current.map((k) => k.getLngLat());
      if (!taken.some((c) => haversine([c.lat, c.lng, 0], [la, ln, 0]) < 150)) {
        const el = Object.assign(document.createElement('div'), { className: 'tm-summit', innerHTML: `▲ ${Math.round(profile[hi])} m` });
        summit.current?.remove();
        summit.current = new maplibregl.Marker({ opacityWhenCovered: '1', element: el, anchor: 'bottom' }).setLngLat([ln, la]).addTo(m);
      }
    }
    info.current?.({ climb: climb(profile), profile, landmarks });
  };

  // ---- follow live updates ----
  useEffect(() => {
    if (mode === 'live') render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.length]);

  // ---- flyover replay: draw the route progressively with a chase camera ----
  // A tap before the map has loaded is remembered and flown as soon as it's ready.
  const pendingFly = useRef(false);
  const stopFly = useRef<() => void>(() => {});
  const flyover = () => {
    const m = map.current;
    if (!m || pts.length < 2) return;
    if (!ready.current) return void (pendingFly.current = true);
    pendingFly.current = false;
    stopFly.current();
    flying.current = true;
    m.stop();
    // Marks pop back in at the end; mid-flight they'd just float across the chase camera.
    const hidden = [...markers.current, ...(summit.current ? [summit.current] : [])];
    hidden.forEach((k) => (k.getElement().style.visibility = 'hidden'));
    (m.getSource('route') as GeoJSONSource).setData(lineData(pts));
    m.setPaintProperty('route-flow', 'line-opacity', 0);
    // Distance along the route at each point, so the reveal matches line-progress exactly.
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
    const length = cum.at(-1) || 1;
    const done = () => {
      m.setPaintProperty('route-line', 'line-gradient', LINE);
      m.setPaintProperty('route-glow', 'line-gradient', GLOW);
      m.setPaintProperty('route-flow', 'line-opacity', 0.85);
      hidden.forEach((x) => (x.getElement().style.visibility = ''));
      flying.current = false;
    };
    const total = Math.min(16_000, 5000 + pts.length * 12);
    // Heading from a point well behind, eased toward each frame: GPS wobble no longer whips the camera.
    const look = Math.max(4, Math.round(pts.length / 60));
    let heading = bearing(pts[0], pts[Math.min(pts.length - 1, look)]);
    let center: [number, number] = [pts[0][1], pts[0][0]];
    const t0 = performance.now();
    let prevT = t0;
    let id = 0;
    const step = (t: number) => {
      // Time-based easing, so a slow phone lags no further behind than a fast one.
      const dt = Math.min(500, t - prevT);
      prevT = t;
      const ease = (tau: number) => 1 - Math.exp(-dt / tau);
      const k = Math.min(1, (t - t0) / total);
      const n = Math.max(2, Math.floor(k * pts.length));
      const slice = pts.slice(0, n);
      const f = cum[n - 1] / length;
      m.setPaintProperty('route-line', 'line-gradient', upTo('#ff5747', f));
      m.setPaintProperty('route-glow', 'line-gradient', upTo('#e10600', f));
      const head = slice.at(-1)!;
      const prev = slice.at(-look - 1) ?? slice[0];
      const want = bearing(prev, head);
      heading += ((((want - heading) % 360) + 540) % 360 - 180) * ease(400);
      const a = ease(90);
      center = [center[0] + (head[1] - center[0]) * a, center[1] + (head[0] - center[1]) * a];
      m.jumpTo({ center, bearing: heading, pitch: 60, zoom: 16.3 });
      if (k < 1) id = requestAnimationFrame(step);
      else {
        done();
        render();
      }
    };
    id = requestAnimationFrame(step);
    frames.current.push(id);
    stopFly.current = () => {
      cancelAnimationFrame(id);
      if (map.current) done();
    };
  };
  useEffect(() => {
    if (flyKey) flyover();
    return () => stopFly.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  // No tiles (offline / blocked) or no WebGL → the plain circuit outline still shows the route.
  if (failed) return <>{fallback ?? null}</>;
  return <div ref={host} className="track-map w-full overflow-hidden rounded-xl border border-line" style={{ height }} />;
}
