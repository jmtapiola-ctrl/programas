import { getEntrevistaPE, getTurnosPE, getPlanEstrategico } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')

  // Estado actual en Airtable
  const plan = await getPlanEstrategico(PLAN_ID)
  const supuestos = plan.plan?.preparativos?.supuestos_exogenos
  console.log(`${'═'.repeat(72)}`)
  console.log(`ESTADO ACTUAL EN AIRTABLE: plan.preparativos.supuestos_exogenos`)
  console.log('═'.repeat(72))
  if (!supuestos) {
    console.log(`❌ NO EXISTE: plan.preparativos no tiene supuestos_exogenos.`)
    console.log(`plan.preparativos:`, JSON.stringify(plan.plan?.preparativos, null, 2))
  } else if (supuestos.length === 0) {
    console.log(`⚠ ARRAY VACÍO: el modelo no pobló supuestos_exogenos.`)
  } else {
    console.log(`Cantidad: ${supuestos.length}`)
    for (const s of supuestos) {
      const calificado = !!(s.probabilidad && s.impacto_signo && s.impacto_magnitud && s.estrategia)
      const flag = calificado ? '✓ calificado' : '○ pendiente'
      console.log(`\n${flag}: ${s.descripcion?.slice(0, 80)}`)
      console.log(`  tipo=${s.tipo}, prob='${s.probabilidad}', signo='${s.impacto_signo}', mag='${s.impacto_magnitud}', estrategia='${s.estrategia}'`)
    }
  }

  // Último turno modelo
  const turnos = await getTurnosPE(ent.id!)
  const ultimoModelo = [...turnos].reverse().find(t => t.rol === 'model')
  if (!ultimoModelo) { console.log('Sin turnos modelo'); return }

  const contenido = ultimoModelo.contenido ?? ''
  const ts = (ultimoModelo as any).timestamp ? new Date((ultimoModelo as any).timestamp).toLocaleString('es-AR') : '?'

  console.log(`\n${'═'.repeat(72)}`)
  console.log(`ÚLTIMO TURNO MODELO`)
  console.log('═'.repeat(72))
  console.log(`Timestamp: ${ts}`)
  console.log(`Length: ${contenido.length} chars`)

  const puMatch = contenido.match(/<!--\s*PANEL_UPDATE\s*-->([\s\S]*?)<!--\s*\/PANEL_UPDATE\s*-->/)
  if (!puMatch) {
    console.log(`\n❌ NO HAY BLOQUE PANEL_UPDATE`)
    console.log(`\nPrimeros 500 chars del contenido:`)
    console.log(contenido.slice(0, 500))
    return
  }

  let parsed: any = null
  try {
    parsed = JSON.parse(puMatch[1].trim())
  } catch (e: any) {
    console.log(`\n❌ PANEL_UPDATE no parsea: ${e.message}`)
    console.log(`Primeros 1000 chars del bloque:`)
    console.log(puMatch[1].slice(0, 1000))
    return
  }

  console.log(`\nKeys: ${Object.keys(parsed).join(', ')}`)
  console.log(`paso_actual=${parsed.paso_actual}, sub_bloque_actual=${parsed.sub_bloque_actual}`)
  console.log(`plan emitido?: ${parsed.plan !== undefined ? 'SÍ' : 'NO'}`)
  if (parsed.plan?.preparativos) {
    console.log(`plan.preparativos keys: ${Object.keys(parsed.plan.preparativos).join(', ')}`)
    const sup = parsed.plan.preparativos.supuestos_exogenos
    if (sup === undefined) {
      console.log(`❌ plan.preparativos.supuestos_exogenos NO EMITIDO en PANEL_UPDATE`)
    } else if (!Array.isArray(sup)) {
      console.log(`❌ supuestos_exogenos no es array: ${typeof sup}`)
    } else if (sup.length === 0) {
      console.log(`⚠ supuestos_exogenos array vacío`)
    } else {
      console.log(`✓ supuestos_exogenos: ${sup.length} items emitidos`)
      for (const s of sup.slice(0, 3)) {
        console.log(`  - ${s.descripcion?.slice(0, 80)} (tipo=${s.tipo}, prob='${s.probabilidad}')`)
      }
    }
  } else {
    console.log(`❌ plan.preparativos NO EMITIDO`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
