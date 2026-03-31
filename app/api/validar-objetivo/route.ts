import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { nombre, descripcionDoingness, tipo } = await req.json()

  const systemPrompt = `Sos un validador de objetivos basado en la Serie de Objetivos de L. Ronald Hubbard. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional. Sé estricto pero conciso.`

  const userPrompt = `Evaluá este objetivo:

Nombre: ${nombre}
Tipo: ${tipo}
Doingness: ${descripcionDoingness}

Un objetivo válido según la Serie de Objetivos de LRH debe:
1. Describir una acción concreta con un resultado verificable
2. Tener UNA sola acción principal
3. Ser terminable — tener un punto de finalización claro
4. Tener un ciclo claro de comenzar-cambiar-parar
5. Ser ejecutable por una persona

Reglas para tu respuesta:
- Si el objetivo tiene problemas, identificá EL problema más importante (no todos) y devolvé una reescritura que lo resuelva
- El campo "problema" debe ser UNA frase corta y directa, máximo 15 palabras, sin tecnicismos
- El campo "reescritura" debe ser una versión mejorada del doingness original, lista para usar
- Si el objetivo es válido pero se puede mejorar levemente, usá el campo "sugerencia" con la versión mejorada
- Si el objetivo es válido y claro, todos los campos excepto "valido" deben ser null

Ejemplos de "problema" bien escrito:
  ✓ "Falta especificar cuándo exactamente está hecho."
  ✓ "No queda claro cuál es el resultado concreto."
  ✓ "Describe dos acciones distintas — mejor separarlo."
  ✗ "El doingness usa un verbo de proceso sin especificar un resultado observable" ← muy técnico y largo

Devolvé exactamente este JSON:
{
  "valido": boolean,
  "problema": string | null,
  "reescritura": string | null,
  "sugerencia": string | null
}`

  const promptCompleto = `${systemPrompt}\n\n${userPrompt}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    return NextResponse.json({ valido: true, problema: null, reescritura: null, sugerencia: null })
  }
}
