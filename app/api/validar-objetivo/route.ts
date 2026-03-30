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
  "errores": [{ "principio": string, "descripcion": string }],
  "sugerencia": string | null
}

PRINCIPIOS A VERIFICAR:

1. DOINGNESS CONCRETO Y VERIFICABLE
   El doingness debe describir UNA acción física o mental específica, con un resultado observable y verificable.
   FALLO: "Empezar a saltar", "Mejorar ventas", "Supervisar al equipo", "Gestionar el proyecto", "Hacer seguimiento"
   APROBADO: "Enviar el informe Q1 al cliente por email antes del viernes", "Llamar a los 10 clientes de la lista y registrar respuestas"
   ERROR SI: el doingness usa verbos de proceso sin resultado final ("empezar", "mejorar", "supervisar", "gestionar", "apoyar", "coordinar", "trabajar en"), o si no se puede verificar si está hecho o no.

2. UNA SOLA ACCIÓN
   El objetivo debe tener UN SOLO PROPÓSITO, no múltiples propósitos independientes. Está permitido que la descripción mencione pasos físicamente inseparables que forman parte de una misma acción coherente.

   Es un ERROR cuando hay propósitos claramente independientes:
   - "Contratar dos vendedores Y diseñar el proceso de onboarding"
   - "Hacer el informe Y presentarlo Y conseguir la firma"

   NO es un error cuando los pasos son inseparables o cuando el segundo paso es la verificación/registro del primero:
   - "Agarrar el trampolín y saltar 5 minutos"
   - "Imprimir el documento y archivarlo"
   - "Enviar el email y confirmar recepción"
   - "Saltar 5 minutos y registrar el resultado" → registrar es la verificación, no una acción independiente
   - "Ejecutar X y anotar/registrar/verificar si funcionó" → el registro es parte del mismo ciclo

   La pregunta clave: ¿El segundo paso es un resultado independiente o simplemente cierra/verifica el primero?

3. TERMINABLE Y COMPLETABLE
   El objetivo debe tener un punto de finalización claro. Evaluá ÚNICAMENTE el doingness, no el propósito implícito.

   Si el doingness tiene una duración definida (ej: "5 minutos", "3 veces", "hasta completar los 10 registros"), es terminable.

   Es un ERROR solo cuando el doingness describe un estado continuo SIN ningún punto de parada:
   - "Mantener relaciones con el cliente" → sin punto de parada
   - "Supervisar al equipo" → continuo, sin fin definido
   - "Gestionar el proceso" → sin punto de parada

   NO es un error cuando hay una duración, cantidad o resultado concreto aunque sea simple:
   - "Saltar 5 minutos" → terminable en 5 minutos ✓
   - "Completar 50 registros" → terminable al completarlos ✓

4. CICLO COMENZAR-CAMBIAR-PARAR
   Verificá que haya un punto de inicio y un punto de parada identificables en el DOINGNESS, no en el propósito.

   Si el doingness tiene una duración, cantidad o condición de finalización explícita, el ciclo está completo. Frases como "para asegurarte de X" o "para verificar Y" son el PROPÓSITO del objetivo, no el doingness — no las uses para evaluar el ciclo.

   Es un ERROR solo si no hay ningún punto de parada identificable en la acción misma:
   - "Hablar con el cliente" → ¿cuándo termina?
   - "Revisar el proceso" → sin fin definido

   NO es un error:
   - "Saltar 5 minutos" → para en 5 minutos ✓
   - "Enviar el informe antes del viernes" → para al enviarlo ✓

5. FACTIBILIDAD POR UNA SOLA PERSONA
   El doingness debe ser ejecutable por una persona. Evaluá la ACCIÓN, no el resultado implícito.

   Si la acción en sí es ejecutable por una persona, es factible, aunque el resultado no esté 100% garantizado.

   Es un ERROR solo cuando la acción en sí es imposible o demasiado vaga para ejecutar:
   - "Mover la montaña" → imposible
   - "Mejorar la economía" → fuera del alcance de una persona

   NO es un error:
   - "Saltar en el trampolín 5 minutos" → una persona puede hacerlo ✓
   - "Enviar el informe" → una persona puede hacerlo ✓

IMPORTANTE: El objetivo puede tener un propósito implícito ("para verificar X", "para asegurarte de Y"). Ignorá ese propósito al evaluar los principios — evaluá ÚNICAMENTE la acción descrita en el doingness.

Si el objetivo cumple todos los principios: { "valido": true, "errores": [] }
Si tiene errores: { "valido": false, "errores": [...] }

SUGERENCIA DE MEJORA:
Si el objetivo es válido pero el doingness podría ser más preciso o más claro, generá una versión mejorada en el campo "sugerencia".

Criterios para generar sugerencia:
- El resultado verificable no está explícito (se puede deducir pero no está escrito)
- El punto de parada podría estar más definido
- La acción podría describirse con más precisión sin cambiar el sentido

Si el objetivo ya es preciso y claro, devolvé sugerencia: null.
Si generás una sugerencia, debe mantener el mismo propósito y alcance del original — solo mejorar la precisión del doingness.
La sugerencia debe ser concisa, en el mismo idioma del original.
NO generar sugerencia si hay errores — sugerencia debe ser null cuando valido es false.

Ejemplos:
  Original: "Agarrar el trampolín y saltar por 5 minutos para asegurarte que el trampolín no se rompa"
  Sugerencia: "Saltar en el trampolín durante 5 minutos y registrar si resistió sin daños visibles"

  Original: "Enviar el informe Q1 al cliente antes del viernes y recibir confirmación de recepción"
  Sugerencia: null

IMPORTANTE: Sé MUY conciso. Máximo 1 oración por descripción de error.
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
    return NextResponse.json({ valido: true, errores: [], sugerencia: null })
  }
}
