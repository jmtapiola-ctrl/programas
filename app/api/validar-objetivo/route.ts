import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { nombre, descripcionDoingness, tipo } = await req.json()

  const systemPrompt = `Eres un validador de objetivos basado en la Serie de Objetivos de L. Ronald Hubbard. Tu única función es evaluar si un objetivo cumple con los principios de la Serie. Respondé ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin explicaciones fuera del JSON.`

  const userPrompt = `Evaluá este objetivo según los principios de la Serie de Objetivos de LRH:

Nombre del objetivo: ${nombre}
Tipo: ${tipo}
Descripción del Doingness (cómo se hace / cuándo está terminado): ${descripcionDoingness}

Verificá cada uno de estos principios y devolvé el resultado en JSON:

{
  "valido": boolean,
  "errores": [
    {
      "principio": string,
      "descripcion": string
    }
  ]
}

Los principios a verificar son EXACTAMENTE estos:

1. DOINGNESS: El objetivo debe describir una acción concreta y terminable. "¿Cuándo está HECHO?" debe tener respuesta clara. Si el doingness es vago, abstracto, o no describe una acción ejecutable, es un error.

2. UNA SOLA ACCIÓN: El objetivo debe tener UNA sola acción, no más de una. Si el doingness describe múltiples acciones conectadas por "y", "luego", "además", "también", es un error.

3. TERMINABLE: El objetivo debe ser realizable, acabable, completable. Si suena a algo continuo, sin un punto de finalización claro, es un error. Ejemplo de error: "Mantener relaciones amistosas con el entorno".

4. CICLO COMENZAR-CAMBIAR-PARAR: El doingness debe implicar un ciclo claro con inicio, desarrollo y fin. Si no hay un punto de parada definido, es un error.

5. FACTIBILIDAD: El objetivo debe ser algo que una persona pueda realmente ejecutar. Si es demasiado vago, demasiado amplio, o imposible de ejecutar por una sola persona, es un error. Ejemplo de error: "Mover la montaña".

Si el objetivo cumple todos los principios, devolvé:
  { "valido": true, "errores": [] }

Si tiene errores, devolvé:
  { "valido": false, "errores": [{ "principio": "...", "descripcion": "..." }] }

Sé conciso en las descripciones de error. Máximo 2 líneas por error.
No inventes errores si el objetivo es válido.`

  const promptCompleto = `${systemPrompt}\n\n${userPrompt}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptCompleto }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    )
    const data = await response.json()
    const texto = data.candidates[0].content.parts[0].text
    const resultado = JSON.parse(texto.replace(/```json|```/g, '').trim())
    return NextResponse.json(resultado)
  } catch {
    return NextResponse.json({ valido: true, errores: [] })
  }
}
