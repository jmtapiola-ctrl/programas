// GET /api/pe-model
//
// Devuelve el modelo Anthropic que el wizard PE está usando EN ESTE proceso de
// server (PE_MODEL, resuelto desde env PE_WIZARD_MODEL o el default de
// llm-config). Sirve para mostrarlo en el header del wizard y confirmar a simple
// vista qué modelo quedó activo tras un reinicio/deploy.
//
// Es server-side a propósito: PE_MODEL se resuelve con process.env, que NO está
// disponible en el bundle del cliente. Por eso el header lo pide por fetch.

import { NextResponse } from 'next/server'
import { PE_MODEL } from '@/lib/llm-config'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ model: PE_MODEL })
}
