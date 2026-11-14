import { describe, expect, it } from 'vitest';
import { DICTS, detectLang, translate } from '../src/lib/i18n.js';

describe('i18n', () => {
  it('ES y EN tienen las mismas claves y parámetros', () => {
    expect(Object.keys(DICTS.es).sort()).toEqual(Object.keys(DICTS.en).sort());
    const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(DICTS.es)) expect(params(DICTS.en[k]), k).toEqual(params(DICTS.es[k]));
  });
  it('nunca dice «más eficiente que NASA»', () => {
    expect(JSON.stringify(DICTS).toLowerCase()).not.toMatch(/más eficiente que (la )?nasa|more efficient than nasa/);
  });
  it('detecta idioma y sustituye parámetros', () => {
    expect(detectLang('?lang=en', { language: 'es-MX' })).toBe('en');
    expect(detectLang('', { language: 'es-MX' })).toBe('es');
    expect(translate('es', 'earth.age', { min: 14 })).toBe('dato de hace 14 min');
  });
});
