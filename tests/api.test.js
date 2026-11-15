import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('apiUrl', () => {
  it('sin VITE_API_URL deja las rutas /api relativas', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { apiUrl } = await import('../src/lib/api.js');
    expect(apiUrl('/api/regions/jezero/ortho/overview')).toBe('/api/regions/jezero/ortho/overview');
  });

  it('con VITE_API_URL apunta las rutas /api al backend', async () => {
    vi.stubEnv('VITE_API_URL', 'https://back.example.app/api/');
    const { apiUrl } = await import('../src/lib/api.js');
    expect(apiUrl('/api/regions/jezero/layers/slope/image')).toBe('https://back.example.app/api/regions/jezero/layers/slope/image');
    expect(apiUrl('mars://ctx/1/2/3')).toBe('mars://ctx/1/2/3');
    expect(apiUrl(undefined)).toBe(undefined);
  });
});
