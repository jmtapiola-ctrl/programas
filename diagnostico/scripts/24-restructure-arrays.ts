// Pieza 1 de Fase 3.5: re-estructurar los 4 arrays del plan curado.
//
// Llamada focalizada a Opus 4.7 que recibe SOLO los strings actuales de los
// 4 arrays + el schema target. Pide transformar cada string en su objeto con
// las propiedades correspondientes, SIN inventar contenido.
//
// NO persiste — solo guarda el JSON regenerado en disco para revisión humana.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { getPlanEstrategico } from '@/lib/airtable'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'

async function main() {
  console.log('═'.repeat(72))
  console.log('PIEZA 1 — Re-estructurar 4 arrays del plan curado')
  console.log('═'.repeat(72))

  const plan = await getPlanEstrategico(TARGET_PLAN_ID)
  console.log(`Plan: ${plan.nombre}`)

  // Sacar los 4 arrays (vienen como string[] desde el mapper)
  const metricas = (plan.proposito?.metricas ?? []) as unknown as string[]
  const fuera = (plan.proposito?.fuera ?? []) as unknown as string[]
  const desviosSec = (plan.situacion?.desvios_secundarios ?? []) as unknown as string[]
  const resistencias = (plan.situacion?.resistencias ?? []) as unknown as string[]

  console.log(`Arrays a re-estructurar:`)
  console.log(`  metricas: ${metricas.length} strings`)
  console.log(`  fuera: ${fuera.length} strings`)
  console.log(`  desvios_secundarios: ${desviosSec.length} strings`)
  console.log(`  resistencias: ${resistencias.length} strings`)
  console.log()

  // Verificar que efectivamente son strings (no objetos ya)
  const sample = metricas[0]
  if (typeof sample !== 'string') {
    console.log(`⚠ El primer item de metricas NO es string (es ${typeof sample}).`)
    console.log(`  Posiblemente los datos ya están bien estructurados — abortando.`)
    process.exit(1)
  }

  const prompt = `Tarea: re-estructurar 4 arrays. Cada uno hoy contiene strings concatenados; necesito que los transformes en arrays de objetos con propiedades específicas.

REGLAS ESTRICTAS:
1. NO inventes información que no esté en el string original. Si una propiedad no se puede inferir del texto, dejala como string vacía "".
2. NO reformules ni resumas el contenido. Mantené las palabras del original tanto como sea posible — solo separá las partes lógicas en sus propiedades.
3. NO cambies la cantidad de items en cada array. Si el array de entrada tiene 9 ítems, el de salida tiene 9 ítems.
4. Emití SOLO el bloque JSON entre los marcadores <!--RESTRUCTURED-->...<!--/RESTRUCTURED--> abajo definidos. Sin texto adicional fuera del bloque.
5. JSON válido estricto: comillas dobles, sin trailing commas, escape correcto de caracteres especiales en strings.

SCHEMA TARGET POR ARRAY:

metricas[i] = {
  "metrica": "<nombre corto/dimensión de la métrica, ej: 'Volumen / capacidad instalada'>",
  "valor_objetivo": "<valor o descripción de la meta, ej: '1.000+ dueños/mes sostenido hacia fin de 2026'>",
  "valor_actual": "<valor actual o baseline si se menciona, sino string vacía>"
}

fuera[i] = {
  "item": "<qué cosa queda afuera, una frase corta, ej: 'Adquirir constructoras'>",
  "razon": "<la justificación, el resto del texto del original>"
}

desvios_secundarios[i] = {
  "descripcion": "<el nombre/título del desvío, ej: 'Marca Más Dueños como vehículo masivo + máquina de medios pagos'>",
  "datos": "<los datos cuantitativos y descripción concreta del desvío, el resto del texto>"
}

resistencias[i] = {
  "actor": "<quién o qué resiste, ej: 'Absorción cultural y operativa de ~750 personas nuevas en 7 meses' o 'Macro acomodándose'>",
  "tipo": "<'Interna' | 'Externa' | 'Riesgo crítico precondicional' (inferir del texto)>",
  "criticidad": "<'Alta' | 'Media' | 'Baja' (inferir del texto del original; si dice '#1' o 'la más grande' → Alta; sino Media o Alta según severidad descrita)>"
}

ARRAYS A TRANSFORMAR:

metricas (${metricas.length} items):
${metricas.map((s, i) => `[${i}] ${s}`).join('\n\n')}

fuera (${fuera.length} items):
${fuera.map((s, i) => `[${i}] ${s}`).join('\n\n')}

desvios_secundarios (${desviosSec.length} items):
${desviosSec.map((s, i) => `[${i}] ${s}`).join('\n\n')}

resistencias (${resistencias.length} items):
${resistencias.map((s, i) => `[${i}] ${s}`).join('\n\n')}

FORMATO DE SALIDA — un único bloque exactamente así:

<!--RESTRUCTURED-->
{
  "metricas": [ ... ${metricas.length} objetos ... ],
  "fuera": [ ... ${fuera.length} objetos ... ],
  "desvios_secundarios": [ ... ${desviosSec.length} objetos ... ],
  "resistencias": [ ... ${resistencias.length} objetos ... ]
}
<!--/RESTRUCTURED-->`

  console.log(`Prompt: ${prompt.length} chars`)
  console.log()
  console.log('Llamando a claude-opus-4-7 (max_tokens=8000, sin system prompt para mantener foco)...')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })
  const latency = Date.now() - start
  console.log(`✔ Respuesta en ${(latency / 1000).toFixed(1)}s — input=${resp.usage.input_tokens} output=${resp.usage.output_tokens} costo aprox $${((resp.usage.input_tokens * 15 + resp.usage.output_tokens * 75) / 1_000_000).toFixed(2)}`)
  console.log(`stop_reason: ${resp.stop_reason}`)
  console.log()

  const fullText = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  // Extraer el bloque <!--RESTRUCTURED-->
  const match = fullText.match(/<!--RESTRUCTURED-->([\s\S]*?)<!--\/RESTRUCTURED-->/)
  if (!match) {
    console.error('✗ No se encontró bloque <!--RESTRUCTURED--> en la respuesta')
    console.error('Respuesta completa:')
    console.error(fullText.slice(0, 2000))
    process.exit(1)
  }

  let parsed: any
  try {
    parsed = JSON.parse(match[1].trim())
  } catch (e) {
    console.error('✗ JSON malformado:', e)
    console.error('Bloque extraído:')
    console.error(match[1].slice(0, 2000))
    process.exit(1)
  }

  // Verificaciones de integridad
  console.log('Verificación de integridad:')
  let allOk = true
  function checkArray(name: string, arr: any[], expectedLen: number, requiredKeys: string[]): boolean {
    if (!Array.isArray(arr)) {
      console.log(`  ✗ ${name}: no es array (es ${typeof arr})`)
      return false
    }
    if (arr.length !== expectedLen) {
      console.log(`  ✗ ${name}: ${arr.length} items, esperado ${expectedLen}`)
      return false
    }
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'object' || arr[i] === null || Array.isArray(arr[i])) {
        console.log(`  ✗ ${name}[${i}]: no es objeto`)
        return false
      }
      for (const k of requiredKeys) {
        if (typeof arr[i][k] !== 'string') {
          console.log(`  ✗ ${name}[${i}].${k}: no es string (es ${typeof arr[i][k]})`)
          return false
        }
      }
    }
    console.log(`  ✔ ${name}: ${arr.length} items, todos con propiedades correctas`)
    return true
  }
  allOk = checkArray('metricas', parsed.metricas, metricas.length, ['metrica', 'valor_objetivo', 'valor_actual']) && allOk
  allOk = checkArray('fuera', parsed.fuera, fuera.length, ['item', 'razon']) && allOk
  allOk = checkArray('desvios_secundarios', parsed.desvios_secundarios, desviosSec.length, ['descripcion', 'datos']) && allOk
  allOk = checkArray('resistencias', parsed.resistencias, resistencias.length, ['actor', 'tipo', 'criticidad']) && allOk

  if (!allOk) {
    console.error('\n⚠ Hay problemas de integridad. Revisar antes de persistir.')
  }

  // Guardar el resultado
  const outPath = path.join(ROOT, 'output', '24-arrays-restructured.json')
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
    cost_usd: (resp.usage.input_tokens * 15 + resp.usage.output_tokens * 75) / 1_000_000,
    integrity_ok: allOk,
    restructured: parsed,
    full_response: fullText,
  }, null, 2))
  console.log()
  console.log(`✔ Guardado: ${outPath}`)
  console.log()
  console.log('SIGUIENTE PASO:')
  console.log('  Mostrar al usuario el JSON re-estructurado para que revise divergencia de contenido.')
  console.log('  NO correr el persist (script 25) hasta tener aprobación explícita.')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
