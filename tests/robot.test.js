import { describe, expect, it, vi } from 'vitest';
import { onRobotStatus, parseRobotCommand, robotAvailable, robotCommand } from '../src/lib/robot.js';

describe('parseRobotCommand (voz o texto → orden)', () => {
  const cases = {
    left: ['Gira a la izquierda', 'gira izquierda', 'izquierda', 'A la izquierda!', 'voltea a la izquierda', 'turn left', 'Robot, gira a la izquierda.'],
    right: ['Gira a la derecha', 'derecha', 'da vuelta a la derecha', 'turn right', 'go right'],
    forward: ['Avanza', 'adelante', 'avanza robot', 'sigue adelante', 'go forward', 'move ahead'],
    backward: ['Retrocede', 'reversa', 'hacia atrás', 'back up', 'go backward', 'reverse'],
    stop: ['Alto', 'alto!', 'detente', 'para', 'frena', 'stop', 'robot alto', 'detén el robot', 'para el robot', 'stop the robot', 'okay stop', 'hey stop', 'oye robot detente'],
  };
  for (const [cmd, phrases] of Object.entries(cases)) {
    it(`reconoce ${cmd}`, () => {
      for (const p of phrases) expect(parseRobotCommand(p), p).toBe(cmd);
    });
  }

  it('no mueve el robot con preguntas, frases largas ni otras órdenes', () => {
    for (const p of [
      // por voz casi nunca hay "?"
      'puedo seguir adelante',
      'qué hay a la izquierda',
      'A la izquierda está el cráter',
      'a la derecha de la ruta',
      'what is to the left',
      'what is ahead',
      'Show me what is ahead',
      'Gracias, sigue',
      'Back to the map',
      'go back home',
      // negaciones
      'no gires a la izquierda',
      "don't turn right",
      'no te detengas',
      // la ruta la decide el hábitat
      'Autoriza la ruta y avanza',
      'Adelante con la ruta',
      '¿Cuánto me falta para regresar?',
      '¿Puedo seguir adelante?',
      'Autoriza la nueva ruta',
      '¿Cómo está mi oxígeno?',
      'quiero que me digas si el camino de la izquierda tiene arena o no tiene arena',
      'para qué sirve el robot',
      '',
      null,
    ]) {
      expect(parseRobotCommand(p), String(p)).toBeNull();
    }
  });
});

describe('robotCommand (nunca lanza)', () => {
  it('manda la orden por POST al /robot/cmd del túnel y avisa a los suscriptores', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const seen = [];
    const off = onRobotStatus((s) => s && seen.push(s.state));
    expect(await robotCommand('left', { base: 'https://abc.trycloudflare.com', fetchImpl })).toEqual({ ok: true });
    off();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://abc.trycloudflare.com/robot/cmd');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ cmd: 'left' });
    expect(seen.slice(-2)).toEqual(['sending', 'done']);
  });

  it('la línea de estado no muestra una respuesta vieja si llegó una orden más nueva', async () => {
    let release;
    const slow = vi.fn(() => new Promise((r) => (release = () => r({ ok: true, status: 200 }))));
    const fast = vi.fn(async () => ({ ok: true, status: 200 }));
    const seen = [];
    const off = onRobotStatus((s) => s && seen.push(`${s.cmd}:${s.state}`));
    const p1 = robotCommand('left', { base: 'https://abc.trycloudflare.com', fetchImpl: slow });
    await robotCommand('forward', { base: 'https://abc.trycloudflare.com', fetchImpl: fast });
    release();
    await p1;
    off();
    const after = seen.slice(1); // el primero es el estado previo que se reenvía al suscribirse
    expect(after.at(-1)).toBe('forward:done');
    expect(after).not.toContain('left:done');
  });

  it('rechaza órdenes desconocidas, sin URL, demasiado rápidas o con la Raspberry caída', async () => {
    const never = vi.fn();
    expect(await robotCommand('bailar', { base: 'https://abc.trycloudflare.com', fetchImpl: never })).toEqual({ ok: false, error: 'invalid_cmd' });
    expect(await robotCommand('left', { base: '', fetchImpl: never })).toEqual({ ok: false, error: 'not_configured' });
    expect(never).not.toHaveBeenCalled();
    const fast = vi.fn(async () => ({ ok: false, status: 429 }));
    expect(await robotCommand('left', { base: 'https://abc.trycloudflare.com', fetchImpl: fast })).toEqual({ ok: false, error: 'too_fast' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await robotCommand('stop', { base: 'https://abc.trycloudflare.com', fetchImpl: down })).toEqual({ ok: false, error: 'unreachable' });
  });

  it('solo hay robot si hay cámara configurada', () => {
    expect(robotAvailable('', 'https://cam.example')).toBe(true);
    expect(robotAvailable('', '')).toBe(false);
    expect(robotAvailable('?cam=off', 'https://cam.example')).toBe(false);
  });
});
