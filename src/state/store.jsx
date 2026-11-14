// Estado global de la EVA + reloj + sincronización entre pestañas (HUD en una, hábitat en otra).
// La pestaña que inicia la EVA es la líder: corre el reloj y las llamadas a la API, y difunde el estado.
// Las demás reflejan el estado y le mandan sus acciones (aprobar, reportar peligro…).
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { detectLang, translate } from '../lib/i18n.js';
import { initialState, reducer, routeFromApi, WALKBACK_M } from '../lib/sim.js';

const Ctx = createContext(null);
const TAB_ID = Math.random().toString(36).slice(2, 10);
const LOCAL_ONLY = new Set(['SNAPSHOT']);

export function StoreProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState);
  const [lang, setLang] = useState(() => detectLang(window.location.search, navigator));
  const [presetLabels, setPresetLabels] = useState({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const chanRef = useRef(null);

  const isLeader = state.leader === null || state.leader === TAB_ID;

  // Canal entre pestañas del mismo navegador.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel('marswalk');
    chanRef.current = ch;
    ch.onmessage = ({ data }) => {
      const s = stateRef.current;
      if (data.type === 'snapshot' && data.from !== TAB_ID) {
        if (s.leader === TAB_ID && data.state.leader !== TAB_ID) return; // ya soy líder
        rawDispatch({ type: 'SNAPSHOT', state: data.state });
      } else if (data.type === 'hello' && s.leader === TAB_ID) {
        ch.postMessage({ type: 'snapshot', from: TAB_ID, state: s });
      } else if (data.type === 'action' && s.leader === TAB_ID) {
        rawDispatch(data.action);
      }
    };
    ch.postMessage({ type: 'hello', from: TAB_ID });
    return () => ch.close();
  }, []);

  // La líder difunde cada cambio de estado.
  useEffect(() => {
    if (state.leader === TAB_ID && chanRef.current) {
      chanRef.current.postMessage({ type: 'snapshot', from: TAB_ID, state });
    }
  }, [state]);

  const dispatch = useCallback((action) => {
    const s = stateRef.current;
    if (s.leader && s.leader !== TAB_ID && !LOCAL_ONLY.has(action.type) && chanRef.current) {
      chanRef.current.postMessage({ type: 'action', action });
      return;
    }
    rawDispatch(action.type === 'EVA_START' ? { ...action, tabId: TAB_ID } : action);
  }, []);

  // Reloj de simulación (solo la líder).
  useEffect(() => {
    if (!(state.phase === 'eva' && state.running && state.leader === TAB_ID)) return undefined;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      rawDispatch({ type: 'TICK', dt: Math.min(0.5, (now - last) / 1000) });
      last = now;
    }, 100);
    return () => clearInterval(id);
  }, [state.phase, state.running, state.leader]);

  // Controlador: atiende las peticiones de ruta del reducer (solo la líder).
  const handled = useRef(0);
  useEffect(() => {
    const req = state.eva && state.eva.request;
    if (!req || state.leader !== TAB_ID || handled.current === req.id) return;
    handled.current = req.id;
    api
      .route({
        from: req.from,
        to: req.to,
        habitat: state.plan.habitat,
        preset: state.plan.preset,
        hazards: req.hazards,
        maxRadius: WALKBACK_M,
        region: state.plan.regionId,
      })
      .then((res) => {
        const ok = res.ok && res.data.status === 'ok';
        rawDispatch({
          type: 'ROUTE_RESULT',
          requestId: req.id,
          route: ok ? routeFromApi(res.data) : null,
          reason: ok ? '' : res.ok ? res.data.reason : res.error.error,
        });
      });
  }, [state.eva, state.leader, state.plan]);

  useEffect(() => {
    api.presets().then((r) => {
      if (r.ok) setPresetLabels(Object.fromEntries(r.data.map((p) => [p.preset, p.label])));
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      lang,
      setLang,
      isLeader,
      presetLabels,
      t: (key, params) => translate(lang, key, params),
    }),
    [state, dispatch, lang, isLeader, presetLabels],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  return useContext(Ctx);
}

/** Datos estáticos de la región (capas, sitios, recorrido real), cargados una vez. */
const RegionCtx = createContext(null);

export function RegionProvider({ children }) {
  const [region, setRegion] = useState({ status: 'loading' });
  useEffect(() => {
    Promise.all([api.regions(), api.layers(), api.pois(), api.traverse(), api.ortho(), api.sandLayer()]).then(([reg, layers, pois, trav, ortho, sand]) => {
      if (!reg.ok || !layers.ok || !pois.ok) {
        setRegion({ status: 'error' });
        return;
      }
      const jezero = reg.data.find((r) => r.region_id === 'jezero') || reg.data[0];
      setRegion({
        status: 'ready',
        bbox: jezero.bbox,
        // Capa de arena del planificador v4 (si la API la ofrece): se dibuja como un ráster más.
        layers: sand.ok ? [...layers.data, { ...sand.data, instrument: 'MRO HiRISE', resolution_m: 20 }] : layers.data,
        pois: pois.data,
        // Hábitat por defecto: sitio de aterrizaje de Perseverance = primer waypoint del recorrido real (NASA/JPL).
        landing: pois.data.landing_site
          ? [pois.data.landing_site.lon, pois.data.landing_site.lat]
          : trav.ok && trav.data.geometry.coordinates.length
            ? trav.data.geometry.coordinates[0]
            : null,
        traverse: trav.ok ? trav.data : null,
        ortho: ortho.ok ? ortho.data : null, // imagen real (NASA Mars Trek); opcional
        mars: null,
      });
      // POIs de todo Marte (Zonas de Exploración + IAU): no bloquean la carga.
      api.marsPois().then((m) => m && setRegion((r) => ({ ...r, mars: m })));
    });
  }, []);
  return <RegionCtx.Provider value={region}>{children}</RegionCtx.Provider>;
}

export function useRegion() {
  return useContext(RegionCtx);
}
