// Pieza 1.3: re-estructurar SOLO las 6 resistencias en el shape extendido
// (actor + descripcion + mitigacion + tipo + criticidad).
//
// Reusa los strings originales del array `resistencias` que está en el plan
// (vienen del PANEL_UPDATE consolidado del script 21). NO inventa contenido —
// solo separa cada párrafo en sus 5 propiedades.
//
// NO persiste — guarda el JSON resultante para revisión humana.

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
  console.log('PIEZA 1.3 — Re-estructurar 6 resistencias en shape extendido')
  console.log('═'.repeat(72))

  const plan = await getPlanEstrategico(TARGET_PLAN_ID)
  const resistencias = (plan.situacion?.resistencias ?? []) as unknown as string[]

  // Verificar que sean strings (no objetos ya re-shapeados)
  if (typeof resistencias[0] !== 'string') {
    console.log('⚠ Las resistencias YA están como objetos, no strings. Abortando.')
    console.log('Si querés re-shapear, fuerza el script con datos crudos.')
    process.exit(1)
  }

  console.log(`Resistencias a re-shapear: ${resistencias.length} strings`)
  console.log()

  const prompt = `Tarea: re-estructurar 6 resistencias. Cada una hoy es un string que contiene varias partes mezcladas (descripción, datos, mitigación). Necesito separarlas en sus 5 propiedades correspondientes.

REGLAS ESTRICTAS:
1. NO inventes información que no esté en el string original. Si una propiedad no se puede inferir del texto, dejala como string vacía "" (excepto criticidad que tiene fallback "Media").
2. NO reformules ni resumas el contenido. Mantené las palabras del original tanto como sea posible — solo separá las partes lógicas en sus propiedades.
3. NO cambies la cantidad de items: 6 strings de entrada → 6 objetos de salida.
4. Emití SOLO el bloque JSON entre los marcadores <!--RESTRUCTURED-->...<!--/RESTRUCTURED--> abajo. Sin texto adicional fuera del bloque.
5. JSON válido estricto.

SCHEMA TARGET:

resistencias[i] = {
  "actor": "<frase corta: QUIÉN o QUÉ resiste, ej: 'Macro acomodándose', 'Reputación', 'Absorción cultural y operativa de ~750 personas nuevas en 7 meses'>",
  "descripcion": "<párrafo: POR QUÉ es resistencia, qué riesgo concreto plantea, datos cuantitativos si los hay. NO incluyas la mitigación acá.>",
  "mitigacion": "<CÓMO se maneja. Suele venir prefijado en el original con 'Mitigación:' o frases similares. Si no se nombra mitigación en el original, dejá string vacía.>",
  "tipo": "<'Interna' | 'Externa' | 'Riesgo crítico precondicional' (inferir del texto; si dice 'Resistencia interna #N' → Interna, 'Amenaza externa #N' → Externa, 'Riesgo crítico precondicional' → así literal)>",
  "criticidad": "<'Alta' | 'Media' | 'Baja' (inferir: si dice 'la más grande', '#1', 'la amenaza más grande' → Alta; reputacional/precondicional → Alta; sino Media. Baja solo si el texto lo indica explícitamente)>"
}

ESTRINGS A TRANSFORMAR:

${resistencias.map((s, i) => `[${i}]\n${s}`).join('\n\n---\n\n')}

FORMATO DE SALIDA:

<!--RESTRUCTURED-->
{
  "resistencias": [ ... ${resistencias.length} objetos en el orden de los inputs ... ]
}
<!--/RESTRUCTURED-->`

  console.log(`Prompt: ${prompt.length} chars`)
  console.log('Llamando a claude-opus-4-7 (max_tokens=8000)...')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })
  const latency = Date.now() - start
  console.log(`✔ ${(latency / 1000).toFixed(1)}s — input=${resp.usage.input_tokens} output=${resp.usage.output_tokens} costo aprox $${((resp.usage.input_tokens * 15 + resp.usage.output_tokens * 75) / 1_000_000).toFixed(2)}`)
  console.log(`stop_reason: ${resp.stop_reason}`)
  console.log()

  const fullText = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  const match = fullText.match(/<!--RESTRUCTURED-->([\s\S]*?)<!--\/RESTRUCTURED-->/)
  if (!match) {
    console.error('✗ No se encontró bloque <!--RESTRUCTURED-->')
    console.error(fullText.slice(0, 2000))
    process.exit(1)
  }

  let parsed: any
  try {
    parsed = JSON.parse(match[1].trim())
  } catch (e) {
    console.error('✗ JSON malformado:', e)
    console.error(match[1].slice(0, 2000))
    process.exit(1)
  }

  // Validar shape: 6 objetos, todos con las 5 props como strings
  console.log('Verificación de integridad:')
  let allOk = true
  if (!Array.isArray(parsed.resistencias)) {
    console.log('  ✗ resistencias no es array')
    allOk = false
  } else if (parsed.resistencias.length !== resistencias.length) {
    console.log(`  ✗ resistencias tiene ${parsed.resistencias.length}, esperado ${resistencias.length}`)
    allOk = false
  } else {
    for (let i = 0; i < parsed.resistencias.length; i++) {
      const r = parsed.resistencias[i]
      if (typeof r !== 'object' || r === null) {
        console.log(`  ✗ resistencias[${i}] no es objeto`); allOk = false; continue
      }
      const required = ['actor', 'descripcion', 'mitigacion', 'tipo', 'criticidad']
      for (const k of required) {
        if (typeof r[k] !== 'string') {
          console.log(`  ✗ resistencias[${i}].${k} no es string (es ${typeof r[k]})`); allOk = false
        }
      }
    }
    if (allOk) console.log(`  ✔ resistencias: ${parsed.resistencias.length} items, todos con 5 propiedades como strings`)
  }

  // Guardar
  const outPath = path.join(ROOT, 'output', '26-resistencias-restructured.json')
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
    cost_usd: (resp.usage.input_tokens * 15 + resp.usage.output_tokens * 75) / 1_000_000,
    integrity_ok: allOk,
    resistencias: parsed.resistencias,
  }, null, 2))
  console.log()
  console.log(`✔ Guardado: ${outPath}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
