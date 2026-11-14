// Mapa por capas (MapLibre): imagen real de Marte (ortomosaico CTX + ventana HiRISE de NASA Mars Trek),
// capas derivadas del DEM y capas vivas de la EVA.
// Colores con significado [RS69]: azul = ruta de datos orbitales · ámbar = suelo/robot · blanco = Perseverance.
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { easePan, easeView } from '../lib/ease.js';
import { circle } from '../lib/geo.js';
import { registerMarsProtocol } from '../lib/marsTiles.js';

// MapLibre 6 corre su worker como módulo: Vite lo empaqueta y aquí se le da la URL final.
maplibregl.setWorkerUrl(workerUrl);
// Todo Marte en vivo (NASA/USGS reproyectado al vuelo): mars://capa/z/x/y.
registerMarsProtocol(maplibregl);

const GLOBAL = [
  { id: 'mars', layer: 'color', maxzoom: 14, opacity: 1 },
  { id: 'mola', layer: 'mola', maxzoom: 8, opacity: 0.55 },
  { id: 'themis', layer: 'themis', maxzoom: 10, opacity: 0.75 },
  { id: 'geology', layer: 'geology', maxzoom: 12, opacity: 0.5 },
];

const EMPTY = { type: 'FeatureCollection', features: [] };
let introDone = false; // el vuelo de entrada solo la primera vez por sesión (017)
const RASTERS = ['hillshade', 'slope', 'traversability'];
const RASTER_OPACITY = { hillshade: 1, slope: 0.6, traversability: 0.45 };
const FADE = { duration: 600, delay: 0 }; // [CoM] .6s
const C = {
  orbit: 'rgb(150,210,255)',
  orbitMid: 'rgb(70,150,240)',
  ground: 'rgb(255,210,140)',
  groundMid: 'rgb(240,150,70)',
  white: '#faf9f5',
  ui: '#87867f',
};

const line = (coords) => (coords && coords.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } : null);
const fc = (features) => ({ type: 'FeatureCollection', features: features.filter(Boolean) });
const corners = ([w, s, e, n]) => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
];

// MapLibre controla el `transform` del marcador: el estilo (rotación, pulso) va en un hijo.
function markerEl(cls, text) {
  const el = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = cls;
  if (text != null) inner.textContent = text;
  el.appendChild(inner);
  return el;
}

/** Ids de las capas raster del ortomosaico, de abajo (CTX) hacia arriba (HiRISE). */
function orthoLayerIds(ortho) {
  return (ortho?.layers || []).filter((l) => l.layer_id === 'ortho_hirise').flatMap((l) => l.chunks.map((c) => `o-${c.id}`));
}

export default function MapView({
  region,
  layersOn = { ortho: true, hillshade: false, slope: false, traversability: false, traverse: true },
  habitat,
  walkbackM,
  pois,
  selectedPois,
  outOfRange,
  stops = [],
  route,
  routeOrigin = 'orbit',
  done,
  pending,
  hazards = [],
  astro,
  robot,
  follow,
  onClick,
  fitTo,
  flyTo,
  extraLines = [],
  extraMarkers = [],
  intro = false,
  apiRef,
}) {
  const box = useRef(null);
  const mapRef = useRef(null);
  const ready = useRef(false);
  const markers = useRef({});
  const stopMarkers = useRef([]);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const lastFollow = useRef(null);
  const regionRef = useRef(region);
  regionRef.current = region;

  // Crear el mapa una vez (la región puede ganar datos después, p. ej. los POIs globales, sin recrearlo).
  useEffect(() => {
    const region = regionRef.current;
    const [w, s, e, n] = region.bbox;
    const map = new maplibregl.Map({
      container: box.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#4a3328' } }] }, // tono medio de Marte: sin cuadros negros mientras cargan
      fadeDuration: 120,
      bounds: [
        [w, s],
        [e, n],
      ],
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
      dragRotate: false,
      maxZoom: 17,
      minZoom: 1,
      renderWorldCopies: true,
    });
    mapRef.current = map;
    if (apiRef) apiRef.current = map;
    map.on('load', () => {
      // Todo Marte: imagen real + capas científicas globales, pedidas al vuelo según la vista.
      // Base de baja resolución (z <= 4, pocas teselas y en caché): cubre al instante mientras llega el detalle.
      const marsOn0 = layersRef.current.ortho !== false;
      map.addSource('g-base', { type: 'raster', tiles: ['mars://color/{z}/{x}/{y}'], tileSize: 256, maxzoom: 4 });
      map.addLayer({ id: 'g-base', type: 'raster', source: 'g-base', paint: { 'raster-opacity': marsOn0 ? 1 : 0, 'raster-fade-duration': 0 } });
      for (const g of GLOBAL) {
        const on0 = g.id === 'mars' ? marsOn0 : !!layersRef.current[g.id];
        map.addSource(`g-${g.id}`, { type: 'raster', tiles: [`mars://${g.layer}/{z}/{x}/{y}`], tileSize: 256, maxzoom: g.maxzoom });
        map.addLayer({
          id: `g-${g.id}`,
          type: 'raster',
          source: `g-${g.id}`,
          // opacidad inicial ya correcta (antes arrancaba en 0 y se fundía desde negro)
          paint: { 'raster-opacity': on0 ? g.opacity : 0, 'raster-opacity-transition': FADE, 'raster-fade-duration': g.id === 'mars' ? 0 : 150 },
        });
      }
      // Detalle HiRISE (ventana procesada alrededor del hábitat), solo de cerca.
      for (const layer of (region.ortho?.layers || []).filter((l) => l.layer_id === 'ortho_hirise')) {
        for (const c of layer.chunks) {
          map.addSource(`o-${c.id}`, { type: 'image', url: c.url, coordinates: corners(c.bbox) });
          map.addLayer({
            id: `o-${c.id}`,
            type: 'raster',
            source: `o-${c.id}`,
            minzoom: 11,
            paint: {
              'raster-opacity': 0,
              'raster-opacity-transition': FADE,
              'raster-fade-duration': 150,
              'raster-resampling': 'linear',
            },
          });
        }
      }
      const byId = Object.fromEntries(region.layers.map((l) => [l.layer_id, l]));
      for (const id of RASTERS) {
        const l = byId[id];
        if (!l) continue;
        map.addSource(`r-${id}`, { type: 'image', url: l.image_url, coordinates: corners(l.bbox) });
        map.addLayer({
          id: `r-${id}`,
          type: 'raster',
          source: `r-${id}`,
          paint: { 'raster-opacity': 0, 'raster-opacity-transition': FADE, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
        });
      }
      for (const id of ['iau', 'ez', 'traverse', 'walkback', 'pois', 'route', 'done', 'pending', 'hazards', 'extra']) {
        map.addSource(id, { type: 'geojson', data: EMPTY });
      }
      // Todo Marte: nombres IAU (puntos) y Zonas de Exploración para humanos (NASA 2015).
      map.addLayer({
        id: 'iau',
        type: 'circle',
        source: 'iau',
        minzoom: 3,
        paint: { 'circle-radius': 2.5, 'circle-color': C.white, 'circle-opacity': 0.75, 'circle-stroke-color': '#000', 'circle-stroke-width': 1 },
      });
      map.addLayer({
        id: 'ez',
        type: 'circle',
        source: 'ez',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 6, 7],
          'circle-color': 'rgba(240,150,70,0.25)',
          'circle-stroke-color': C.ground,
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({ id: 'traverse', type: 'line', source: 'traverse', paint: { 'line-color': C.white, 'line-width': 1.2, 'line-opacity': 0.8 } });
      map.addLayer({
        id: 'walkback',
        type: 'line',
        source: 'walkback',
        paint: { 'line-color': C.orbitMid, 'line-width': 1.2, 'line-dasharray': [4, 3] },
      });
      map.addLayer({ id: 'hazards-fill', type: 'fill', source: 'hazards', paint: { 'fill-color': C.groundMid, 'fill-opacity': 0.28 } });
      map.addLayer({ id: 'hazards-line', type: 'line', source: 'hazards', paint: { 'line-color': C.ground, 'line-width': 1.5 } });
      map.addLayer({ id: 'done', type: 'line', source: 'done', paint: { 'line-color': C.ui, 'line-width': 3, 'line-opacity': 0.85 } });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: { 'line-color': C.orbit, 'line-color-transition': FADE, 'line-width': 12, 'line-opacity': 0.2, 'line-blur': 5 },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.orbit, 'line-color-transition': FADE, 'line-width': 3 },
      });
      map.addLayer({
        id: 'pending',
        type: 'line',
        source: 'pending',
        paint: { 'line-color': C.ground, 'line-width': 3, 'line-dasharray': [2, 1.5] },
      });
      // Líneas extra (modo comparar): color y ancho por línea; punteadas aparte.
      map.addLayer({
        id: 'extra',
        type: 'line',
        source: 'extra',
        filter: ['!', ['get', 'dash']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'extra-dash',
        type: 'line',
        source: 'extra',
        filter: ['get', 'dash'],
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-dasharray': [2, 1.6] },
      });
      map.addLayer({
        id: 'pois',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 0, 4],
          'circle-color': ['case', ['get', 'out'], '#3d3d3a', '#000'],
          'circle-stroke-color': ['case', ['get', 'out'], '#3d3d3a', C.white],
          'circle-stroke-width': 1.5,
          'circle-radius-transition': { duration: 200, delay: 0 }, // [CoM] .2s
        },
      });
      ready.current = true;
      map.fire('marswalk:ready');

      // Entrada: de órbita al cráter, 3 s con la curva de cambio de vista [CoM].
      if (intro && !fitTo && !introDone) {
        introDone = true;
        const cam = map.cameraForBounds(
          [
            [w, s],
            [e, n],
          ],
          { padding: 20 },
        );
        if (cam && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          // Desde el planeta completo hasta el cráter.
          map.jumpTo({ center: cam.center, zoom: 1.6 });
          map.flyTo({ center: cam.center, zoom: cam.zoom, duration: 2200, easing: easeView, essential: true });
        }
      }
    });
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'map-tip', offset: 10 });
    const hitAt = (pt) => (map.getLayer('pois') ? map.queryRenderedFeatures(pt, { layers: ['pois', 'ez', 'iau'] }) : []);
    map.on('click', (ev) => {
      const hit = hitAt(ev.point);
      const poi = hit.find((f) => f.layer.id === 'pois');
      const named = hit.find((f) => f.layer.id === 'ez' || f.layer.id === 'iau');
      const pos = named ? named.geometry.coordinates : [ev.lngLat.lng, ev.lngLat.lat];
      clickRef.current?.({
        pos,
        poiId: poi?.properties?.poi_id ?? null,
        feature: named ? { name: named.properties.name, kind: named.layer.id, type: named.properties.type || '' } : null,
      });
    });
    map.on('mousemove', (ev) => {
      const hit = hitAt(ev.point);
      map.getCanvas().style.cursor = hit.length ? 'pointer' : clickRef.current ? 'crosshair' : '';
      const f = hit.find((x) => x.layer.id === 'ez' || x.layer.id === 'iau' || x.layer.id === 'pois');
      if (!f) return hover.remove();
      const el = document.createElement('div');
      const b = document.createElement('strong');
      b.textContent = f.properties.name;
      const s = document.createElement('span');
      s.textContent = f.layer.id === 'ez' ? ' · Zona de Exploración (NASA 2015)' : f.layer.id === 'iau' ? ` · ${f.properties.type || 'IAU'}` : ' · muestra de Perseverance';
      el.append(b, s);
      hover.setLngLat(f.geometry.coordinates).setDOMContent(el).addTo(map);
    });
    map.on('mouseout', () => hover.remove());
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      ready.current = false;
      stopMarkers.current = [];
      markers.current = {};
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Volar a un lugar (buscador).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    const go = () => map.flyTo({ center: flyTo.center, zoom: flyTo.zoom ?? 9, duration: 1600, easing: easeView, essential: true });
    if (ready.current) go();
    else map.once('marswalk:ready', go);
  }, [flyTo]);

  // Las actualizaciones van en tres grupos para que cada tick de la EVA (10/s) no vuelva a cargar
  // lo estático (1 783 nombres IAU, zonas, recorrido real, capas raster).
  const onReady = (fn) => {
    const map = mapRef.current;
    if (!map) return undefined;
    const run = () => ready.current && fn(map);
    run();
    map.on('marswalk:ready', run);
    return () => map.off('marswalk:ready', run);
  };
  const layersKey = JSON.stringify(layersOn); // los objetos `layersOn` llegan nuevos en cada render
  const layersRef = useRef(layersOn);
  layersRef.current = layersOn;

  // 1) Capas y datos estáticos: solo cuando cambian las capas activas o llegan datos nuevos.
  useEffect(
    () =>
      onReady((map) => {
        const lo = layersRef.current;
        const marsOn = lo.ortho !== false;
        if (map.getLayer('g-base')) map.setPaintProperty('g-base', 'raster-opacity', marsOn ? 1 : 0);
        for (const g of GLOBAL) {
          const on = g.id === 'mars' ? marsOn : !!lo[g.id];
          map.setPaintProperty(`g-${g.id}`, 'raster-opacity', on ? g.opacity : 0);
        }
        const hiriseOn = marsOn && lo.hirise !== false;
        for (const id of orthoLayerIds(region.ortho)) {
          if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', hiriseOn ? 1 : 0);
        }
        for (const id of RASTERS) {
          if (!map.getLayer(`r-${id}`)) continue;
          map.setPaintProperty(`r-${id}`, 'raster-opacity', lo[id] ? RASTER_OPACITY[id] : 0);
        }
        map.getSource('traverse').setData(lo.traverse && region.traverse ? region.traverse : EMPTY);
        const pt = (q, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [q.lon, q.lat] }, properties: props });
        const places = lo.places !== false && region.mars;
        map.getSource('ez').setData(places ? fc(region.mars.exploration_zones.map((z) => pt(z, { name: z.name }))) : EMPTY);
        map.getSource('iau').setData(places ? fc(region.mars.nomenclature.map((x) => pt(x, { name: x.name, type: x.type }))) : EMPTY);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layersKey, region],
  );

  // 2) Plan: hábitat, radio de regreso y sitios.
  useEffect(
    () =>
      onReady((map) => {
        map.getSource('walkback').setData(
          habitat && walkbackM ? fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: circle(habitat, walkbackM) }, properties: {} }]) : EMPTY,
        );
        map.getSource('pois').setData(
          pois
            ? {
                type: 'FeatureCollection',
                features: pois.features.map((f) => ({
                  ...f,
                  properties: { ...f.properties, selected: !!selectedPois?.has(f.properties.poi_id), out: !!outOfRange?.has(f.properties.poi_id) },
                })),
              }
            : EMPTY,
        );
        setMarker(map, markers, 'habitat', habitat, 'marker-habitat');
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habitat?.[0], habitat?.[1], walkbackM, pois, selectedPois, outOfRange],
  );

  // 3) Lo que se mueve en cada tick: ruta, astronauta, robot, peligros, líneas del modo comparar.
  useEffect(
    () =>
      onReady((map) => {
        const color = routeOrigin === 'ground' ? C.ground : C.orbit;
        map.setPaintProperty('route', 'line-color', color); // transición de color .6s al aprobar
        map.setPaintProperty('route-glow', 'line-color', color);
        map.getSource('route').setData(fc([line(route)]));
        map.getSource('done').setData(fc([line(done)]));
        map.getSource('pending').setData(fc([line(pending)]));
        map.getSource('hazards').setData(
          fc(hazards.map((h) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle(h.pos, h.radius_m, 48)] }, properties: {} }))),
        );
        map.getSource('extra').setData(
          fc(extraLines.map((l) => (l.coords?.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: l.coords }, properties: { color: l.color, width: l.width ?? 3, dash: !!l.dash } } : null))),
        );
        const keep = new Set(extraMarkers.map((m) => `x-${m.id}`));
        for (const k of Object.keys(markers.current)) if (k.startsWith('x-') && !keep.has(k)) setMarker(map, markers, k, null);
        for (const m of extraMarkers) setMarker(map, markers, `x-${m.id}`, m.pos, m.cls);
        setMarker(map, markers, 'robot', robot, 'marker-robot');
        setMarker(map, markers, 'astro', astro, 'marker-astro');
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, routeOrigin, done, pending, hazards, astro, robot, extraLines, extraMarkers],
  );

  // Paradas numeradas (solo cuando cambian).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of stopMarkers.current) m.remove();
    stopMarkers.current = stops.map((s, i) =>
      new maplibregl.Marker({ element: markerEl('marker-stop', i + 1) }).setLngLat(s.pos).addTo(map),
    );
  }, [stops]);

  // Encuadre a la ruta cuando cambia (paneo .6s [CoM]).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitTo || fitTo.length < 2) return;
    const lons = fitTo.map((p) => p[0]);
    const lats = fitTo.map((p) => p[1]);
    const go = () =>
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 90, duration: 700, maxZoom: 14, easing: easeView },
      );
    if (ready.current) go();
    else map.once('marswalk:ready', go);
  }, [fitTo]);

  // Seguir al astronauta (HUD): track-up con paneo suave [CoM].
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow || !follow.center) return;
    if (!ready.current) {
      lastFollow.current = follow;
      map.once('marswalk:ready', () => map.jumpTo({ center: follow.center, zoom: follow.zoom ?? 13.2, bearing: follow.bearing }));
      return;
    }
    const prev = lastFollow.current;
    lastFollow.current = follow;
    const turn = prev ? Math.abs(((follow.bearing - map.getBearing() + 540) % 360) - 180) : 0;
    if (!prev || follow.recenter !== prev.recenter) {
      map.easeTo({ center: follow.center, zoom: follow.zoom ?? 13.2, bearing: follow.bearing, duration: 600, easing: easePan });
    } else if (turn > 8) {
      map.easeTo({ center: follow.center, bearing: follow.bearing, duration: 600, easing: easePan });
    } else {
      map.jumpTo({ center: follow.center });
    }
  }, [follow]);

  return <div ref={box} className="map" />;
}

function setMarker(map, markers, key, pos, cls) {
  const cur = markers.current[key];
  if (!pos) {
    if (cur) {
      cur.remove();
      delete markers.current[key];
    }
    return;
  }
  if (cur) cur.setLngLat(pos);
  else markers.current[key] = new maplibregl.Marker({ element: markerEl(cls) }).setLngLat(pos).addTo(map);
}
