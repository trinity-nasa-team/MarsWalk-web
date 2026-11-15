import { describe, expect, it } from 'vitest';
import { cleanMember, crewVerdict, DEFAULT_CREW, noRescueMarkers, noSignalLines } from '../src/lib/crew.js';
import { initialState, reducer } from '../src/lib/sim.js';
import { translate } from '../src/lib/i18n.js';

const geom = (n) => ({ type: 'LineString', coordinates: Array.from({ length: n }, (_, i) => [77.45 - i * 0.001, 18.44]) });
const check = (status, extra = {}) => ({
  status,
  geometry: geom(10),
  stops_idx: [4],
  crew: [],
  rescue: { no_rescue_idx: null, no_rescue_pos: null, no_rescue_leg: null, distance_to_no_rescue_m: null, min_margin_l: 120 },
  signal: { no_signal_segments: [], no_signal_pct: 0, longest_no_signal_m: 0 },
  ...extra,
});

describe('EVA en pareja', () => {
  it('pareja por defecto: dos astronautas con el tanque del EMU', () => {
    expect(DEFAULT_CREW).toHaveLength(2);
    expect(DEFAULT_CREW.every((m) => m.o2_l === 380)).toBe(true);
  });

  it('limpia valores fuera de rango o vacíos', () => {
    expect(cleanMember({ mass_kg: 500, o2_l: '' })).toEqual({ mass_kg: 150, o2_l: 50 });
    expect(cleanMember({ mass_kg: 'x', o2_l: 300 })).toEqual({ mass_kg: 75, o2_l: 300 });
  });

  it('veredicto ok, sin rescate y sin retorno', () => {
    expect(crewVerdict(null, 1)).toBeNull();
    expect(crewVerdict(check('ok'), 1)).toMatchObject({ level: 'ok', key: 'crew.ok', params: { l: 120 } });
    const r = { no_rescue_idx: 6, no_rescue_pos: [77.444, 18.44], no_rescue_leg: 2, distance_to_no_rescue_m: 2190, min_margin_l: -40 };
    const v = crewVerdict(check('no_rescue', { rescue: r }), 1);
    expect(v).toMatchObject({ level: 'warn', key: 'crew.noRescue', where: 'back', params: { km: '2.2' } });
    expect(crewVerdict(check('no_return', { rescue: { ...r, no_rescue_leg: 1 } }), 2)).toMatchObject({ level: 'alert', where: 'first' });
    expect(crewVerdict(check('no_rescue', { rescue: { ...r, no_rescue_leg: 3 } }), 3)).toMatchObject({ where: 'between', params: { from: 2, to: 3 } });
  });

  it('el aviso se lee completo en los dos idiomas', () => {
    const v = crewVerdict(check('no_rescue', { rescue: { no_rescue_leg: 2, distance_to_no_rescue_m: 2190, min_margin_l: -40 } }), 3);
    const es = `${translate('es', v.key, v.params)} ${translate('es', `crew.where.${v.where}`, v.params)}`;
    expect(es).toContain('2.2 km');
    expect(es).toContain('entre la parada 1 y la 2');
    expect(translate('en', 'crew.advice')).toMatch(/safer mission/);
  });

  it('líneas sin señal y marcador del punto sin rescate para el mapa', () => {
    const c = check('no_rescue', {
      signal: { no_signal_segments: [{ from: 2, to: 4 }, { from: 9, to: 9 }] },
      rescue: { no_rescue_pos: [77.444, 18.44] },
    });
    const lines = noSignalLines(c);
    expect(lines).toHaveLength(2);
    expect(lines[0].coords).toHaveLength(5); // del punto anterior al siguiente: se ve unido a la ruta
    expect(lines.every((l) => l.dash)).toBe(true);
    expect(noRescueMarkers(c)).toEqual([{ id: 'norescue', pos: [77.444, 18.44], cls: 'marker-norescue' }]);
    expect(noRescueMarkers(check('ok'))).toEqual([]);
  });

  it('el plan guarda la revisión con los tramos y la borra si cambia algo', () => {
    let s = initialState();
    expect(s.plan.crew).toEqual(DEFAULT_CREW);
    expect(s.plan.avoidNoSignal).toBe(true);
    s = reducer(s, { type: 'PLAN_LEGS', legs: [], crewCheck: check('ok') });
    expect(s.plan.crewCheck.status).toBe('ok');
    s = reducer(s, { type: 'PLAN_SET', patch: { crew: [{ mass_kg: 60, o2_l: 300 }, DEFAULT_CREW[1]] } });
    expect(s.plan.crewCheck).toBeNull();
    expect(s.plan.legs).toBeNull();
  });
});
