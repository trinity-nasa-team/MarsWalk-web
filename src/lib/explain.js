// Explicaciones del planificador v4 (el backend las manda en inglés) → texto en el idioma de la interfaz.
// Si una frase no coincide con ningún patrón (p. ej. las del A* legado, que vienen en español), se muestra tal cual.
const PATTERNS = [
  [/^(Astronaut|Rover) thresholds: risk from ([\d.]+)°, blocked from ([\d.]+)°/, (m) => ['exp.thresholds', { who: m[1].toLowerCase(), risk: m[2], blocked: m[3] }]],
  [/^(\d+) m over sand \(penalized\)/, (m) => ['exp.sand', { m: m[1] }]],
  [/^Avoids all mapped sand/, () => ['exp.noSand', {}]],
  [/^Steepest cell ([\d.]+)° \(risk zone\)/, (m) => ['exp.steep', { deg: m[1] }]],
];

/** Lista de explicaciones traducidas. Si la celda más empinada supera el umbral de bloqueo, es un extremo del tramo
 *  (parada o hábitat: el planificador nunca bloquea donde ya está el astronauta) y se dice así. */
export function explainList(list, t) {
  let blocked = Infinity;
  const parsed = (list || []).map((x) => {
    for (const [re, fn] of PATTERNS) {
      const m = re.exec(x);
      if (m) {
        const [key, params] = fn(m);
        if (key === 'exp.thresholds') blocked = Math.min(blocked, Number(params.blocked));
        return { key, params };
      }
    }
    return { raw: x };
  });
  const out = parsed.map(({ key, params, raw }) => {
    if (raw != null) return raw;
    if (key === 'exp.thresholds') return t(key, { ...params, who: t(`exp.who.${params.who}`) });
    if (key === 'exp.steep' && Number(params.deg) >= blocked) return t('exp.steepEnd', params);
    return t(key, params);
  });
  return [...new Set(out)]; // varios tramos repiten las mismas frases (umbrales, arena)
}
