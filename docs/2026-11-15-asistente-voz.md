# 2026-11-15 — Asistente de voz del HUD (tipo «Cortana»)

## Qué se hizo
- El micrófono del chat del HUD **graba audio** (clic para empezar, clic para terminar o 8 s) y lo manda a
  `POST /api/assistant/voice` (backend MarsWalk-v3, Groq Whisper → inglés + LLM). El texto escrito va a
  `POST /api/assistant/text`.
- El chat muestra **siempre en inglés** la frase del usuario (traducida) y la respuesta; la voz del HUD responde en inglés.
- Si el asistente devuelve una orden (`forward|backward|left|right|stop`) se manda al robot real (pulso de 0.6 s).
  El robot sigue moviéndose SOLO con órdenes explícitas, nunca con la ruta simulada.
- «Authorize the route» (en cualquier idioma) gana siempre; ahora exige mencionar la ruta o ser una frase corta.
- Respaldo: si el asistente no está disponible, reglas locales del robot y la IA del hábitat anterior.
- `src/lib/voice.js` (formato de grabación compatible y audio → base64) con pruebas.

## Pruebas
- `pnpm test` 66 ✅ · `pnpm build` ✅ · probado en local con Groq real (texto y voz) y el robot.
