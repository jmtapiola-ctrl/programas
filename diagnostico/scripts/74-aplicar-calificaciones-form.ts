// Recupera las calificaciones de supuestos que el usuario envió por el form
// y persiste directo a plan.preparativos.supuestos_exogenos.
//
// Fuente: el último turno user que contenga "[Respuestas a supuestos exógenos]".
// Formato esperado:
//   S-N: probabilidad=alta · impacto=favorable·baja · estrategia=aceptar
//   Razón: ... (opcional, próxima línea)

import {
  getEntrevistaPE,
  getTurnosPE,
  getPlanEstrategico,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE, SupuestoExogenoPE, Probabilidad, EstrategiaSupuesto } from '@/lib/types'

const PLAN_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

interface Respuesta {
  numero: number
  probabilidad: Probabilidad
  impacto_signo: 'favorable' | 'desfavorable'
  impacto_magnitud: 'alta' | 'media' | 'baja'
  estrategia: EstrategiaSupuesto
  razon: string
}

function parseRespuestas(texto: string): Respuesta[] {
  const respuestas: Respuesta[] = []
  // Patrón: "S-N: probabilidad=X · impacto=Y·Z · estrategia=W"
  // El separador puede ser · (middle dot) o un punto normal.
  const lineas = texto.split('\n')
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    const m = linea.match(/^S-(\d+):\s*probabilidad=(\w+)\s*[·.]\s*impacto=(\w+)[·.](\w+)\s*[·.]\s*estrategia=(\w+)/i)
    if (!m) continue
    const numero = parseInt(m[1], 10)
    const probabilidad = m[2].toLowerCase() as Probabilidad
    const impacto_signo = m[3].toLowerCase() as 'favorable' | 'desfavorable'
    const impacto_magnitud = m[4].toLowerCase() as 'alta' | 'media' | 'baja'
    const estrategia = m[5].toLowerCase() as EstrategiaSupuesto

    // Buscar línea "Razón: ..." en próximos 1-2 lineas
    let razon = ''
    for (let j = i + 1; j < Math.min(i + 3, lineas.length); j++) {
      const r = lineas[j].match(/^Razón:\s*(.+)/)
      if (r) { razon = r[1].trim(); break }
      if (lineas[j].match(/^S-\d+:/)) break
    }

    respuestas.push({ numero, probabilidad, impacto_signo, impacto_magnitud, estrategia, razon })
  }
  return respuestas
}

async function main() {
  if ((PLAN_ID as string) === (PLAN_DUMMY_ID as string)) throw new Error('Sanity check')

  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)

  // Buscar último turno user con "[Respuestas a supuestos exógenos]"
  const candidatos = [...turnos].reverse().filter(t =>
    t.rol === 'user' && t.contenido?.includes('[Respuestas a supuestos exógenos]')
  )
  if (candidatos.length === 0) {
    console.log('❌ Ningún turno user con "[Respuestas a supuestos exógenos]"')
    process.exit(1)
  }

  const turno = candidatos[0]
  const ts = (turno as any).timestamp ? new Date((turno as any).timestamp).toLocaleString('es-AR') : '?'
  console.log(`[recup] Turno fuente: [${ts}] len=${(turno.contenido ?? '').length}`)

  const respuestas = parseRespuestas(turno.contenido ?? '')
  console.log(`\n[recup] Parseé ${respuestas.length} respuestas:`)
  for (const r of respuestas) {
    console.log(`  S-${r.numero}: prob=${r.probabilidad}, imp=${r.impacto_signo}/${r.impacto_magnitud}, est=${r.estrategia}${r.razon ? ' (con razón)' : ''}`)
  }

  if (respuestas.length === 0) {
    console.log('\n[recup] ❌ No se pudo parsear ninguna respuesta. Texto del turno:')
    console.log((turno.contenido ?? '').slice(0, 1500))
    process.exit(1)
  }

  // Leer plan + actualizar supuestos
  const plan = await getPlanEstrategico(PLAN_ID)
  const supuestosActuales = plan.plan?.preparativos?.supuestos_exogenos
  if (!supuestosActuales || supuestosActuales.length === 0) {
    console.log('❌ plan.preparativos.supuestos_exogenos no existe o vacío en Airtable')
    process.exit(1)
  }
  console.log(`\n[recup] Supuestos actuales en Airtable: ${supuestosActuales.length}`)

  // Aplicar respuestas (matching por S-N → indice N-1)
  const nuevos: SupuestoExogenoPE[] = supuestosActuales.map((s, idx) => {
    const numero = idx + 1
    const r = respuestas.find(x => x.numero === numero)
    if (!r) {
      console.log(`  ⚠ S-${numero} sin respuesta — queda con calificación vacía`)
      return s
    }
    return {
      ...s,
      probabilidad: r.probabilidad,
      impacto_signo: r.impacto_signo,
      impacto_magnitud: r.impacto_magnitud,
      estrategia: r.estrategia,
      razon: r.razon,
    }
  })

  const planExistente: PlanoPE = plan.plan ?? {}
  const preparativosExistentes = planExistente.preparativos ?? {
    areas_afectadas: [],
    supuestos_exogenos: [],
    priorizacion_inicial: { desvio_elegido: '', razon: '' },
    criterio_exito: { por_metrica: [], zona_fracaso: '' },
  }
  const planActualizado: PlanoPE = {
    ...planExistente,
    preparativos: { ...preparativosExistentes, supuestos_exogenos: nuevos },
  }

  await updatePlanEstrategico(PLAN_ID, { plan: planActualizado })
  console.log(`\n[recup] ✓ Persistido. Recargá la entrevista — el panel debería mostrar los 8 supuestos calificados.`)
}

main().catch(e => { console.error('[recup] FATAL:', e); process.exit(1) })
