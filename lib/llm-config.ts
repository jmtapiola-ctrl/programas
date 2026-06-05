// Switch central del modelo Anthropic que usa el wizard PE.
//
// Motivo: abaratar costos durante la etapa de pruebas (sobre todo el wizard del
// Plan Jr). En vez de hardcodear 'claude-opus-4-7' en cada endpoint, todos
// importan PE_MODEL de acá. Para cambiar de modelo, hay dos formas:
//
//   1. Variable de entorno (sin tocar código, requiere reiniciar dev):
//        PE_WIZARD_MODEL=opus     → vuelve a Opus
//        PE_WIZARD_MODEL=haiku    → Haiku (barato)
//        PE_WIZARD_MODEL=sonnet   → Sonnet (intermedio)
//        PE_WIZARD_MODEL=<model-id-completo>  → cualquier otro id
//
//   2. Cambiando el DEFAULT de una línea acá abajo (DEFAULT_MODELO).
//
// Default actual: HAIKU (etapa de pruebas). Volver a Opus = setear la env o
// cambiar DEFAULT_MODELO a MODELOS_ANTHROPIC.opus.
//
// CAVEAT de costos: los endpoints loguean costo estimado con constantes de
// precio de Opus ($15/$75 por M tokens). Bajo Haiku el costo REAL es mucho menor
// (~$1/$5 por M), así que esos logs SOBREESTIMAN el gasto. Es solo telemetría,
// no afecta el funcionamiento. Recalibrar si se necesita exactitud.
//
// Fuera de alcance de este switch: el reviewer/validador (lib/openai-client.ts)
// usa un modelo de OpenAI (gpt), no Anthropic — no entra acá.

export const MODELOS_ANTHROPIC = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const

const DEFAULT_MODELO: string = MODELOS_ANTHROPIC.haiku

function resolverModelo(): string {
  const raw = (process.env.PE_WIZARD_MODEL || '').trim().toLowerCase()
  if (!raw) return DEFAULT_MODELO
  if (raw in MODELOS_ANTHROPIC) return (MODELOS_ANTHROPIC as Record<string, string>)[raw]
  // Si no es un alias conocido, se asume que es un model id completo.
  return process.env.PE_WIZARD_MODEL!.trim()
}

// Modelo que usan TODOS los endpoints Anthropic del wizard PE.
export const PE_MODEL: string = resolverModelo()
