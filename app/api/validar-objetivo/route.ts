import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { nombre, descripcionDoingness, tipo } = await req.json()

  const systemPrompt = `Eres un validador estricto de objetivos basado en la Serie de Objetivos de L. Ronald Hubbard. Tu única función es evaluar si un objetivo cumple con los principios de la Serie. Respondé ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin explicaciones fuera del JSON. Sé ESTRICTO. Ante la duda, marcá el error. Es mejor rechazar un objetivo impreciso que aprobar uno que no se va a poder ejecutar correctamente.`

  const userPrompt = `Evaluá este objetivo según los principios de la Serie de Objetivos de LRH.

Nombre del objetivo: ${nombre}
Tipo: ${tipo}
Descripción del Doingness: ${descripcionDoingness}

La pregunta central que debés hacerte para cada principio es:
"Si yo recibiera este objetivo, ¿sabría exactamente qué hacer y cuándo está terminado?"

Verificá cada principio y devolvé el resultado en JSON:
{
  "valido": boolean,
  "errores": [{ "principio": string, "descripcion": string }]
}

PRINCIPIOS A VERIFICAR:

1. DOINGNESS CONCRETO Y VERIFICABLE
   El doingness debe describir UNA acción física o mental específica, con un resultado observable y verificable.
   FALLO: "Empezar a saltar", "Mejorar ventas", "Supervisar al equipo", "Gestionar el proyecto", "Hacer seguimiento"
   APROBADO: "Enviar el informe Q1 al cliente por email antes del viernes", "Llamar a los 10 clientes de la lista y registrar respuestas"
   ERROR SI: el doingness usa verbos de proceso sin resultado final ("empezar", "mejorar", "supervisar", "gestionar", "apoyar", "coordinar", "trabajar en"), o si no se puede verificar si está hecho o no.

2. UNA SOLA ACCIÓN
   El objetivo debe tener UNA acción principal, no una cadena de pasos.
   FALLO: "Llamar al cliente Y enviar propuesta Y esperar respuesta"
   APROBADO: "Enviar propuesta al cliente Acme" (una sola acción con resultado claro)
   ERROR SI: hay más de una acción independiente conectada por "y", "luego", "además", "también", "después".
   EXCEPCIÓN: "enviar X y recibir confirmación" es UNA acción si la confirmación es el criterio de completitud.

3. TERMINABLE Y COMPLETABLE
   Debe existir un momento claro en que el objetivo esté 100% terminado y no haya más que hacer.
   FALLO: "Saltar" (¿cuándo terminó?), "Mejorar ventas" (¿cuánto es suficiente?), "Supervisar equipo" (nunca termina)
   APROBADO: "Completar el reporte de ventas de marzo y enviarlo al director"
   ERROR SI: el objetivo describe un estado continuo, una actividad sin fin, o un proceso sin punto de llegada.

4. CICLO COMENZAR-CAMBIAR-PARAR
   El doingness debe tener un inicio claro, una ejecución concreta, y un PARAR definido.
   FALLO: "Empezar a saltar" (no tiene parar), "Seguir mejorando el proceso" (no tiene parar)
   APROBADO: "Presentar el plan de ventas Q2 en la reunión del lunes"
   ERROR SI: el objetivo usa "empezar a", "seguir", "continuar", "mantener" — estos indican que el ciclo no tiene cierre.

5. FACTIBILIDAD POR UNA SOLA PERSONA
   El objetivo debe poder ser ejecutado y completado por una sola persona sin depender de acciones de terceros no controlables.
   FALLO: "Lograr que el equipo mejore su rendimiento" (depende de otros), "Conseguir 10 nuevos clientes" (resultado no 100% controlable)
   APROBADO: "Enviar 10 propuestas comerciales a la lista de prospectos del CRM"
   EXCEPCIÓN: Si la acción principal es controlable (enviar, entregar, presentar) y "recibir confirmación/respuesta" es solo el criterio de completitud, NO es un error de factibilidad. El responsable controla la acción; la confirmación valida que se completó.
   ERROR SI: el resultado final depende PRINCIPALMENTE de la voluntad o acción de otras personas fuera del control del responsable.

Si el objetivo cumple todos los principios: { "valido": true, "errores": [] }
Si tiene errores: { "valido": false, "errores": [...] }

IMPORTANTE: Sé MUY conciso. Máximo 1 oración por descripción de error. El JSON total no debe superar los 500 caracteres.
NO inventes errores si el objetivo genuinamente es válido y claro.`

  const promptCompleto = `${systemPrompt}\n\n${userPrompt}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptCompleto }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
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
