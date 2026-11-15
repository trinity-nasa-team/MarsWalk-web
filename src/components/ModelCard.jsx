// Métricas del modelo elegido (del informe de entrenamiento) frente al otro, y en qué es mejor.
const f2 = (v) => v.toFixed(2);
const range = (lo, hi) => (lo != null ? `${f2(lo)}–${f2(hi)}` : f2(hi));

export default function ModelCard({ meta, other, liveMs, t }) {
  const m = meta.metrics;
  const o = other?.metrics;
  const rows = [
    [t('vis.m.miou'), range(m.miou_strict, m.test_miou), o && range(o.miou_strict, o.test_miou)],
    [t('vis.m.acc'), range(m.acc_strict, m.acc), o && range(o.acc_strict, o.acc)],
    [t('vis.m.sand'), range(m.iou_sand_strict, m.iou_sand), o && range(o.iou_sand_strict, o.iou_sand)],
    [t('vis.m.classes'), String(meta.classes.length), other && String(other.classes.length)],
    [t('vis.m.speed'), liveMs != null ? `${liveMs} ms` : `~${m.cpu_ms_ref} ms`, o && `~${o.cpu_ms_ref} ms`],
  ];
  return (
    <div className="model-card">
      <table>
        <thead>
          <tr>
            <th />
            <th>{meta.name}</th>
            {other && <th>{other.name}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>
                <b>{a}</b>
              </td>
              {other && <td>{b}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t(`vis.best.${meta.id}`)}</p>
      <p className="note">{t('vis.m.note')}</p>
    </div>
  );
}
