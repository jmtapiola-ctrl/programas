import { NextRequest, NextResponse } from 'next/server'
import {
  K_SITUACION,
  K_PORQUE,
  K_PUNTOS_FUERA,
  K_PROPOSITO,
  K_TIPOS_OBJETIVOS,
  K_FALLAS_PROGRAMAS,
} from '@/lib/knowledge'

function conPrincipios(fragmentos: string, tareaEspecifica: string): string {
  return `Basate PRINCIPALMENTE en los principios de gestión de programas que se detallan a continuación. Si algo no puede evaluarse con estos principios, usá criterios generales de planificación organizacional. Nunca ignorés estos principios en favor de convenciones genéricas.

${fragmentos}

Tu tarea específica: ${tareaEspecifica}`
}

export async function POST(req: NextRequest) {
  const { paso, contenido, contexto } = await req.json()

  let systemPrompt: string
  let userPrompt = ''

  if (paso === 1) {
    systemPrompt = conPrincipios(
      `${K_SITUACION}\n\n${K_PORQUE}\n\n${K_PUNTOS_FUERA}`,
      `Sos un coach de planificación experto en metodología de gestión de programas. Tu función es evaluar si el contenido de cada paso del wizard cumple con los principios de la metodología. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional. Sé constructivo — el objetivo es ayudar a mejorar, no bloquear.`
    )
    userPrompt = `Evaluá esta situación según los principios de gestión de programas.
Un programa debe manejar situaciones verdaderas — situaciones que reducen la producción o la prosperidad. Hacer cualquier otra cosa es omitir pasos en la secuencia.

Situación: ${contenido}

¿Es una situación real y concreta que justifica un programa? ¿O es vaga, abstracta, o demasiado general?
Devolvé: { "observaciones": string | null, "sugerencia": string | null }
Si está bien: observaciones null. Si se puede mejorar: texto corto de 1-2 oraciones.
NO generes observaciones si la situación es específica y concreta.`

  } else if (paso === 2) {
    systemPrompt = conPrincipios(
      K_PROPOSITO,
      `Sos un coach de planificación estratégica. Evaluás si los propósitos de programas organizacionales tienen la fuerza motivacional suficiente para movilizar a un equipo a ejecutarlos. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`
    )
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
    systemPrompt = conPrincipios(
      K_PROPOSITO,
      `Sos un coach de planificación experto en metodología de gestión de programas. Tu función es evaluar si el contenido de cada paso del wizard cumple con los principios de la metodología. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional. Sé constructivo — el objetivo es ayudar a mejorar, no bloquear.`
    )
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

  } else if (paso === 'generar_nombre') {
    systemPrompt = `Sos un experto en planificación estratégica. Generás nombres cortos y descriptivos para programas organizacionales. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`
    const ctx = typeof contexto === 'object' ? contexto : {}
    userPrompt = `Generá un nombre corto y descriptivo para este programa.

Situación: ${ctx.situacion ?? ''}
Propósito: ${contenido}
Objetivo Mayor: ${ctx.objetivoMayor ?? ''}

El nombre debe:
- Ser corto: máximo 5-6 palabras
- Ser descriptivo: que se entienda de qué trata
- No usar gerundios ("Implementando", "Mejorando")
- Empezar con mayúscula
- No ser genérico ("Programa de mejora", "Plan estratégico")

Ejemplos buenos:
  "Expansión Zona Norte 2026"
  "JMT 79kg"
  "Onboarding Terravinci"
  "Sistema de Organigramas Grupales"
  "Autonomía Comercial Q3"

Respondé ÚNICAMENTE con este JSON sin markdown:
{"nombreSugerido": "nombre aquí"}`

  } else if (paso === 'generar_objetivo_mayor') {
    systemPrompt = conPrincipios(
      `${K_PROPOSITO}\n\n${K_TIPOS_OBJETIVOS}`,
      `Sos un experto en planificación estratégica por objetivos. Generás Objetivos Mayores concretos, medibles y verificables a partir de una situación y un propósito dados. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`
    )
    const situacion = typeof contexto === 'object' ? (contexto?.situacion ?? '') : (contexto ?? '')
    userPrompt = `Dada esta situación y propósito, generá un Objetivo Mayor:

Situación: ${situacion}
Propósito: ${contenido}

El Objetivo Mayor debe ser:
- CORTO: máximo 2 líneas o 30 palabras
- SIMPLE: sin métricas, sin porcentajes, sin detalles de implementación — esos van en los objetivos operativos
- ASPIRACIONAL pero VERIFICABLE: describe el estado final deseado, no el cómo llegar ahí
- Empieza con "Que [sujeto] [verbo]..." o "[resultado concreto]"
- Ser distinto del propósito — el propósito es el POR QUÉ, el Objetivo Mayor es el QUÉ concreto

NO incluir:
- Porcentajes ni métricas específicas
- Metodologías de implementación
- Detalles técnicos
- Múltiples condiciones encadenadas

Ejemplos de lo que NO hacer:
  ✗ "Implementar un modelo interactivo que permita al 100% de los miembros comprender sus roles con 90% de precisión antes del 30 de junio."

Ejemplos de lo que SÍ hacer:
  Propósito: "Que el equipo genere ingresos sin depender de nadie"
  ✓ Objetivo Mayor: "Que el equipo cierre ventas de forma autónoma, sin necesitar dirección externa para operar."

  Propósito: "Que JMT tenga salud y energía óptima"
  ✓ Objetivo Mayor: "JMT en su peso ideal de 79kg, con energía y físico sostenidos."

  Propósito: "Que cada miembro entienda su función"
  ✓ Objetivo Mayor: "Que cada miembro del equipo entienda su función y sepa exactamente qué tiene que entregar de valor."

Devolvé: { "objetivoMayorSugerido": string }`

  } else if (paso === 'analizar_secuencia') {
    systemPrompt = conPrincipios(
      `${K_TIPOS_OBJETIVOS}\n\n${K_FALLAS_PROGRAMAS}`,
      `Sos un experto en planificación de proyectos. Analizás secuencias de objetivos operativos para detectar gaps lógicos y pasos faltantes. Respondé ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`
    )
    const ctx = typeof contexto === 'object' ? contexto : {}
    const objetivosCtx: any[] = ctx.objetivos ?? []
    const listaObjetivos = objetivosCtx.map((o: any, i: number) => {
      const modoLabel = i === 0 ? '(inicio)' :
        o.modo === 'Paralelo' ? '(paralelo con anterior)' :
        '(después del anterior)'
      return `${i + 1}. ${modoLabel} "${o.nombre}": ${o.doingness || '(sin descripción)'}`
    }).join('\n')
    userPrompt = `Analizá esta secuencia de objetivos operativos:

Propósito: ${ctx.proposito ?? ''}
Objetivo Mayor: ${ctx.objetivoMayor ?? ''}

Secuencia (con relaciones entre objetivos):
${listaObjetivos}

Analizá tres cosas:

1. LÓGICA DE SECUENCIA: ¿Cada objetivo secuencial tiene sentido después del anterior? ¿Los paralelos realmente se pueden ejecutar simultáneamente?

2. GAPS OBVIOS: ¿Hay pasos que claramente faltan entre dos objetivos? Por ejemplo, si hay "Contratar cocinero" y luego "Empezar la dieta", falta "Comprar insumos". Detectá gaps de este tipo.

3. OBJETIVOS INTERMEDIOS POSIBLES: ¿Hay transiciones donde probablemente se está omitiendo algo? Si la brecha entre dos objetivos es grande o poco clara, señalalo como posible omisión. Usar lenguaje de advertencia: "Puede estar faltando...", "Considerá si...".

Respondé ÚNICAMENTE con este JSON sin markdown:
{
  "secuenciaOk": boolean,
  "observaciones": "problema principal, máx 2 líneas. null si todo bien" | null,
  "gapsDetectados": [
    {
      "entre": "nombre objetivo A y nombre objetivo B",
      "descripcion": "qué paso falta claramente",
      "despuesDeIndice": 0
    }
  ] | null,
  "posiblesOmisiones": [
    {
      "entre": "nombre objetivo A y nombre objetivo B",
      "advertencia": "Puede estar faltando... / Considerá si..."
    }
  ] | null,
  "sugerenciasAdicionales": ["nombre corto de objetivo faltante"] | null
}

"despuesDeIndice" es el índice base 0 del objetivo ANTES del gap (ej: si falta algo entre obj 1 y 2, despuesDeIndice=0).`

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
          generationConfig: (paso === 'generar_objetivo_mayor' || paso === 'generar_nombre')
            ? { temperature: 0.4, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
            : paso === 'analizar_secuencia'
            ? { temperature: 0.3, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 1024 } }
            : { temperature: 0.1, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 1024 } },
        }),
      }
    )
    const data = await response.json()
    const parts: any[] = data.candidates?.[0]?.content?.parts ?? []
    // gemini-2.5-flash may return thinking tokens as part[0] (thought:true) — skip them
    const textPart = parts.find((p: any) => p.text && !p.thought) ?? parts[0]
    const text = textPart?.text ?? '{}'
    const result = JSON.parse(text.replace(/```json|```/g, '').trim())

    if (paso === 'generar_nombre') {
      return NextResponse.json({ nombreSugerido: result.nombreSugerido ?? '' })
    }

    if (paso === 'generar_objetivo_mayor') {
      return NextResponse.json({ objetivoMayorSugerido: result.objetivoMayorSugerido ?? '' })
    }

    if (paso === 'analizar_secuencia') {
      return NextResponse.json({
        secuenciaOk: result.secuenciaOk ?? true,
        observaciones: result.observaciones ?? null,
        gapsDetectados: result.gapsDetectados ?? null,
        posiblesOmisiones: result.posiblesOmisiones ?? null,
        sugerenciasAdicionales: result.sugerenciasAdicionales ?? null,
      })
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
    if (paso === 'generar_nombre') {
      return NextResponse.json({ nombreSugerido: '' })
    }
    if (paso === 'generar_objetivo_mayor') {
      return NextResponse.json({ objetivoMayorSugerido: '' })
    }
    if (paso === 'analizar_secuencia') {
      return NextResponse.json({ secuenciaOk: true, observaciones: null, gapsDetectados: null, posiblesOmisiones: null, sugerenciasAdicionales: null })
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
