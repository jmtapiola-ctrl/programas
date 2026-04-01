import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { paso, contenido, contexto } = await req.json()

  let systemPrompt: string
  let userPrompt = ''

  if (paso === 1) {
    systemPrompt = `Sos un coach de planificación experto en metodología de gestión de programas. Tu función es evaluar si el contenido de cada paso del wizard cumple con los principios de la metodología. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional. Sé constructivo — el objetivo es ayudar a mejorar, no bloquear.`
    userPrompt = `Evaluá esta situación según los principios de gestión de programas.
Un programa debe manejar situaciones verdaderas — situaciones que reducen la producción o la prosperidad. Hacer cualquier otra cosa es omitir pasos en la secuencia.

Situación: ${contenido}

¿Es una situación real y concreta que justifica un programa? ¿O es vaga, abstracta, o demasiado general?
Devolvé: { "observaciones": string | null, "sugerencia": string | null }
Si está bien: observaciones null. Si se puede mejorar: texto corto de 1-2 oraciones.
NO generes observaciones si la situación es específica y concreta.`

  } else if (paso === 2) {
    systemPrompt = `Sos un coach de planificación estratégica. Evaluás si los propósitos de programas organizacionales tienen la fuerza motivacional suficiente para movilizar a un equipo a ejecutarlos. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`
    const situacion = typeof contexto === 'object' ? (contexto?.situacion ?? '') : (contexto ?? '')
    userPrompt = `Evaluá este propósito de programa:

Situación que origina el programa: ${situacion}
Propósito declarado: ${contenido}

Evaluá estas 4 dimensiones y devolvé el resultado:

{
  "fuerte": boolean,
  "dimensiones": {
    "concreto": boolean,
    "energico": boolean,
    "vale_la_pena": boolean,
    "movilizador": boolean
  },
  "observacion": string | null,
  "sugerencia": string | null
}

Las 4 dimensiones:

1. CONCRETO: ¿Se entiende claramente qué se quiere lograr? ¿O es vago y genérico? ("mejorar resultados" = no concreto)

2. ENERGICO: ¿Tiene fuerza y convicción en las palabras? ¿O suena tibio, burocrático o indiferente? ("optimizar procesos" = tibio / "que nadie en el equipo tenga que adivinar qué hacer" = enérgico)

3. VALE_LA_PENA: ¿El resultado que promete justifica el esfuerzo? ¿Es algo que realmente importa?

4. MOVILIZADOR: Si alguien leyera este propósito antes de empezar a trabajar en el programa, ¿sentiría que vale la pena? ¿O lo dejaría indiferente?

"fuerte": true solo si las 4 dimensiones son true.

"observacion": Si no es fuerte, UNA sola observación concisa (máximo 20 palabras) sobre el punto más débil.
  Ejemplos:
  - "Suena genérico — podría ser el propósito de cualquier empresa."
  - "Le falta energía. No transmite urgencia ni convicción."
  - "No queda claro qué cambia concretamente cuando se logre."
  Si es fuerte: null.

"sugerencia": Una versión mejorada del propósito que resuelve las debilidades encontradas. Misma intención, más fuerza y claridad. Si ya es fuerte: null.`

  } else if (paso === 3) {
    systemPrompt = `Sos un coach de planificación experto en metodología de gestión de programas. Tu función es evaluar si el contenido de cada paso del wizard cumple con los principios de la metodología. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional. Sé constructivo — el objetivo es ayudar a mejorar, no bloquear.`
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

  } else if (paso === 'generar_objetivo_mayor') {
    systemPrompt = `Sos un experto en planificación estratégica por objetivos. Generás Objetivos Mayores concretos, medibles y verificables a partir de una situación y un propósito dados. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`
    const situacion = typeof contexto === 'object' ? (contexto?.situacion ?? '') : (contexto ?? '')
    userPrompt = `Dada esta situación y propósito, generá un Objetivo Mayor:

Situación: ${situacion}
Propósito: ${contenido}

El Objetivo Mayor debe:
- Ser el resultado concreto y verificable que se logra cuando el programa esté completo
- Poder medirse o verificarse objetivamente
- Ser específico, no genérico
- Si aplica, incluir una cantidad o fecha aproximada
- Ser distinto del propósito — el propósito es el POR QUÉ, el Objetivo Mayor es el QUÉ concreto

Ejemplos:
  Propósito: "Que el equipo genere ingresos sin depender de nadie"
  Objetivo Mayor: "Facturar $500k mensuales de forma autónoma antes de diciembre"

  Propósito: "Que JMT tenga salud y energía óptima"
  Objetivo Mayor: "JMT pesando 79kg y completando 3 sesiones de ejercicio semanales sin excepción"

Devolvé: { "objetivoMayorSugerido": string }`

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
          generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
        }),
      }
    )
    const data = await response.json()
    const parts: any[] = data.candidates?.[0]?.content?.parts ?? []
    // gemini-2.5-flash may return thinking tokens as part[0] (thought:true) — skip them
    const textPart = parts.find((p: any) => p.text && !p.thought) ?? parts[0]
    const text = textPart?.text ?? '{}'
    const result = JSON.parse(text.replace(/```json|```/g, '').trim())

    if (paso === 'generar_objetivo_mayor') {
      return NextResponse.json({ objetivoMayorSugerido: result.objetivoMayorSugerido ?? '' })
    }

    if (paso === 2) {
      return NextResponse.json({
        fuerte: result.fuerte ?? false,
        dimensiones: result.dimensiones ?? { concreto: false, energico: false, vale_la_pena: false, movilizador: false },
        observacion: result.observacion ?? null,
        sugerencia: result.sugerencia ?? null,
      })
    }

    return NextResponse.json({
      observaciones: result.observaciones ?? null,
      sugerencia: result.sugerencia ?? null,
    })
  } catch {
    if (paso === 'generar_objetivo_mayor') {
      return NextResponse.json({ objetivoMayorSugerido: '' })
    }
    if (paso === 2) {
      return NextResponse.json({
        fuerte: true,
        dimensiones: { concreto: true, energico: true, vale_la_pena: true, movilizador: true },
        observacion: null,
        sugerencia: null,
      })
    }
    return NextResponse.json({ observaciones: null, sugerencia: null })
  }
}
