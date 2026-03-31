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

CRITERIOS SEGÚN EL TIPO DE OBJETIVO:

Tipo PRIMARIO y VITAL:
  Son acciones de establecimiento y organización.
  DEBEN ser terminables con punto de parada claro.
  NO pueden ser estados de mantenimiento continuo.
  Palabras que indican estado (SIEMPRE fallar para estos tipos):
  "tener", "mantener", "asegurarse de que", "que haya", "que funcione", "que exista", "que esté disponible"
  a menos que incluyan una acción concreta + fecha/condición de finalización explícita.

Tipo CONDICIONAL:
  Son acciones de verificación o investigación.
  Deben terminar en un resultado concreto (informe, decisión, dato verificado).
  "Verificar si X" es válido si tiene un entregable claro.

Tipo OPERATIVO:
  Establecen direcciones, acciones e itinerario.
  Deben tener fecha o condición de finalización.
  Son terminables pero pueden ser más amplios en su descripción.

Tipo PRODUCCIÓN:
  Establecen cantidades como estadísticas.
  PUEDEN ser repetibles — expresados como cuota periódica.
  "Pesar a JMT todas las mañanas y registrar el resultado" es VÁLIDO como Producción aunque sea continuo,
  porque tiene una acción concreta y un resultado medible.
  "Tener una balanza en el baño todos los días" sigue siendo INVÁLIDO porque no tiene acción ni resultado medible.

Tipo MAYOR:
  Son aspiraciones generales de largo plazo.
  Más tolerante — pueden ser amplios y no tener fecha exacta.
  Solo fallar si son completamente vagos o sin doingness.

EJEMPLOS DE OBJETIVOS QUE DEBEN FALLAR:

❌ "Buscar una persona que haga de controlador diario"
   problema: "Falta especificar cuándo está hecho: ¿persona confirmada, contratada, o asignada?"
   reescritura: "Identificar y confirmar una persona como controlador diario antes del [fecha]"

❌ "Mejorar las ventas del equipo"
   problema: "No tiene resultado concreto ni fecha."
   reescritura: "Incrementar las ventas del equipo a $X para el [fecha]"

❌ "Supervisar al equipo de ventas"
   problema: "Es una responsabilidad continua, no un objetivo terminable."
   reescritura: "Realizar reunión semanal de seguimiento con el equipo de ventas todos los lunes a las 9hs"

❌ "Diseñar un método de control diario"
   problema: "Falta el entregable concreto del diseño."
   reescritura: "Redactar y aprobar con JMT el método de control diario en un documento antes del [fecha]"

❌ Tipo VITAL: "Tener una balanza en el baño todos los días y que funcione"
   problema: "Es un estado de mantenimiento, no una acción terminable. Para un Vital usá la acción de establecimiento."
   reescritura: "Comprar e instalar una balanza en el baño antes del [fecha]"

❌ Tipo PRIMARIO: "Mantener al equipo informado"
   problema: "Es una responsabilidad continua sin punto de finalización. Convertilo en una acción concreta."
   reescritura: "Establecer reunión semanal de seguimiento con el equipo todos los lunes a las 9hs"

EJEMPLOS DE OBJETIVOS QUE DEBEN PASAR:

✓ "Enviar el informe Q1 al cliente Acme por email antes del viernes 4 y registrar confirmación de recepción"
✓ "Realizar 3 llamadas de seguimiento a prospectos esta semana y registrar el resultado de cada una"
✓ "Completar los 50 registros en la planilla compartida y notificar al responsable"
✓ Tipo PRODUCCIÓN: "Pesar a JMT todas las mañanas y registrar el resultado en la planilla de seguimiento"
   → Válido: tiene acción concreta y resultado medible, apropiado para objetivos repetibles de Producción
✓ Tipo PRODUCCIÓN: "Realizar 3 llamadas de seguimiento a prospectos por semana y registrar el resultado"
   → Válido: cuota periódica con acción y medición claras

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
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
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
