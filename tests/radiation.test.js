import { describe, expect, it } from 'vitest';
import { parseDonki } from '../src/lib/radiation.js';

const live = {
  status: 'live',
  as_of: '2026-11-14T21:00Z',
  sep: [{ id: 's1', time: '2026-11-13T05:00Z' }],
  mars_cme: { id: 'B', start: '2026-11-09T18:15Z', arrival: '2026-11-13T12:00Z', glancing: true },
  mars_cme_30d: 10,
};

describe('parseDonki (resumen del backend → panel de radiación)', () => {
  it('en vivo → ok, con SEP, CME y conteo', () => {
    const d = parseDonki(live);
    expect(d.status).toBe('ok');
    expect(d.events).toEqual([{ id: 's1', time: '2026-11-13T05:00Z' }]);
    expect(d.marsCme).toMatchObject({ id: 'B', glancing: true, pending: false });
    expect(d.marsCme30d).toBe(10);
    expect(d.asOf).toBe('2026-11-14T21:00Z');
  });

  it('copia de respaldo → snapshot (la alerta donkiSep solo se dispara con ok)', () => {
    expect(parseDonki({ ...live, status: 'snapshot' }).status).toBe('snapshot');
  });

  it('llegada modelada posterior a as_of → pendiente (se muestra como prevista)', () => {
    const d = parseDonki({ ...live, mars_cme: { ...live.mars_cme, arrival: '2026-11-16T00:00Z' } });
    expect(d.marsCme.pending).toBe(true);
  });

  it('sin CME y sep con forma rara no rompe', () => {
    const d = parseDonki({ status: 'live', as_of: '2026-11-14T21:00Z', sep: { bad: 1 }, mars_cme: null });
    expect(d.marsCme).toBeNull();
    expect(d.events).toEqual([]);
    expect(d.marsCme30d).toBe(0);
  });
});
