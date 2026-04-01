import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { paso, contenido, contexto } = await req.json()

  const systemPrompt = `Sos un coach de planificación experto en metodología de gestión de programas. Tu función es evaluar si el contenido de cada paso del wizard cumple con los principios de la metodología. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional. Sé constructivo — el objetivo es ayudar a mejorar, no bloquear.`

  let userPrompt = ''

  if (paso === 1) {
    userPrompt = `Evaluá esta situación según los principios de gestión de programas.
Un programa debe manejar situaciones verdaderas — situaciones que reducen la producción o la prosperidad. Hacer cualquier otra cosa es omitir pasos en la secuencia.

Situación: ${contenido}

¿Es una situación real y concreta que justifica un programa? ¿O es vaga, abstracta, o demasiado general?
Devolvé: { "observaciones": string | null, "sugerencia": string | null }
Si está bien: observaciones null. Si se puede mejorar: texto corto de 1-2 oraciones.
NO generes observaciones si la situación es específica y concreta.`
  } else if (paso === 2) {
    userPrompt = `Evaluá este propósito según los principios de gestión de programas.
El propósito tiene que ejecutarse — es algo que HACER. Detrás de cada paro hay un propósito fallido.

Situación del programa: ${contexto}
Propósito: ${contenido}

¿Es un propósito que moviliza a la acción? ¿Está conectado con la situación? ¿O es genérico y desconectado?
Devolvé: { "observaciones": string | null, "sugerencia": string | null }
Si está bien: observaciones null. Si se puede mejorar: texto corto de 1-2 oraciones.`
  } else if (paso === 3) {
    const ctx = typeof contexto === 'object' ? contexto : {}
    userPrompt = `Evaluá el nombre y objetivo mayor de este programa según los principios de gestión de programas.
El Objetivo Mayor es la aspiración general y amplia que posiblemente abarca un período de tiempo largo y aproximado.

Situación: ${ctx.situacion ?? ''}
Propósito: ${ctx.proposito ?? ''}
Nombre del programa: ${typeof contenido === 'object' ? contenido.nombre : contenido}
Objetivo Mayor: ${typeof contenido === 'object' ? contenido.objetivoMayor : ''}

¿El Objetivo Mayor está alineado con la Situación y el Propósito? ¿Es suficientemente concreto sin ser demasiado detallado?
Devolvé: { "observaciones": string | null, "sugerencia": string | null }
Si está bien: observaciones null. Si se puede mejorar: texto corto de 1-2 oraciones.`
  } else {
    return NextResponse.json({ observaciones: null, sugerencia: null })
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
      }
    )
    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const result = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({
      observaciones: result.observaciones ?? null,
      sugerencia: result.sugerencia ?? null,
    })
  } catch {
    return NextResponse.json({ observaciones: null, sugerencia: null })
  }
}
