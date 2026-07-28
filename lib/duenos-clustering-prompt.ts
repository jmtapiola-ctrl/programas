// System + user message para clustering de variantes de dueños del inventario.
// El modelo central del wizard recibe la lista de strings únicos del campo
// `m.dueno` y propone
// clusters de variantes que probablemente sean la MISMA persona (typos,
// abreviaturas, mayúsculas/minúsculas, full name vs nickname).
//
// Output JSON-only:
//   { "clusters": [{ "variantes": [...], "canonico_sugerido": "..." }, ...] }
//
// Si no hay duplicados sospechosos, devuelve `clusters: []`. Clusters de 1
// variante (sin duplicados) NUNCA se incluyen — solo grupos de 2+ variantes.

import type { PlanEstrategico } from './types'

export function buildDuenosClusteringSystemPrompt(): string {
  return `Sos un analista de datos. Recibís una lista de strings que son nombres de dueños/responsables de movimientos estratégicos de un plan empresarial. Tu tarea: agrupar TODAS las variantes que plausiblemente sean la MISMA persona o el MISMO rol.

IMPORTANTE: el usuario revisa y confirma cada cluster antes de aplicar. Preferí REPORTAR DUDAS a callarlas. Si dos strings se parecen mucho, agrupalos como cluster sospechoso — el user decide. Falsos positivos son baratos (el user los descarta con un click); falsos negativos quedan invisibles y rompen el análisis downstream.

CRITERIOS PARA AGRUPAR (sumar señales — alcanza con UNA fuerte o varias débiles):

1. **Sufijos descriptivos agregados/quitados**: la misma entidad con o sin paréntesis explicativos.
   - "Dir Div 6 Oficina Fundador" ≈ "Dir Div 6 Oficina Fundador (Vacancia)" → SÍ agrupar.
   - "Romi" ≈ "Romi (Ventas)" → SÍ agrupar.
   - "[vacancia]" ≈ "[vacancia: Director Comercial]" → SÍ agrupar (mismo rol, distinto detalle).
   - "Equipo Marketing" ≈ "Equipo Marketing (en construcción)" → SÍ agrupar.

2. **Nombres casi-idénticos** (typos plausibles, 1-2 chars de diferencia, MISMO contexto si tiene sufijo).
   - "Emilio (Sucursales)" ≈ "Emiliano (Sucursales)" → SÍ agrupar (typo plausible, mismo contexto).
   - "Lukas" ≈ "Lucas" → SÍ agrupar.
   - "JMT" ≈ "JTM" → SÍ agrupar (typo en orden de letras).

3. **Nicknames/abreviaturas de nombres conocidos**: "Lu" ≈ "Lucas" ≈ "Lucas Mercado"; "JMT" ≈ "Juan Manuel Tapiola"; "Mar" ≈ "María"; "Vicky" ≈ "Victoria".

4. **Mayúsculas/minúsculas/espacios**: "lu" ≈ "Lu" ≈ " Lu " → SÍ agrupar.

5. **Variantes ortográficas**: "Maria" ≈ "María", "Sebastian" ≈ "Sebastián" → SÍ agrupar.

CUÁNDO NO AGRUPAR:

- Dos nombres claramente distintos del mismo grupo aparente. Ej: "Lucas Mercado" y "Lucas Pereda" son personas distintas (apellido diferente, sin typo plausible).
- Roles genéricos sin contexto compartido: "CEO" y "CFO" son distintos cargos.
- Sufijos de contexto IRRECONCILIABLES: "Romi (Ventas)" y "Romi (Marketing)" probablemente son distintos roles o personas, salvo que sea super obvio.
- **PERSONA REAL vs PUESTO VACANTE**: si un string parece nombre de persona ("Lucas Mercado") y otro parece descripción de rol vacante ("Director Comercial" o cualquier string que contenga "vacancia"/"vacante"/"a cubrir"/"a contratar"), NO los agrupes. Son conceptos distintos: uno tiene a alguien, el otro es un puesto a llenar. Sí podés agrupar **variantes de la MISMA vacancia** (ej: "Director Comercial" + "Director Comercial (Vacancia)" + "Dir Comercial").

CANÓNICO SUGERIDO:

Para cada cluster, sugerí UN canónico (string):
- Preferí la versión MÁS COMPLETA/FORMAL: "Lucas Mercado" > "Lucas" > "Lu".
- Si las variantes son equivalentes en formalidad, usá la PRIMERA del cluster (mantener convención del user).
- El canónico debe estar bien capitalizado (Title Case para nombres propios).
- Para "[vacancia]" + "[vacancia: Director X]" → usar la versión más informativa: "[vacancia: Director X]".

REGLAS DURAS:

1. **Output JSON-only.** Empezá con "{" y terminá con "}". Sin conversación, markdown, ni explicaciones fuera del JSON.

2. **Clusters de 1 variante (sin duplicados detectados) NO se incluyen.** Solo grupos de 2+ variantes.

3. **Cada variante aparece en a lo sumo UN cluster.** No duplicar strings entre clusters.

4. **Si NO hay duplicados sospechosos en toda la lista, output \`{ "clusters": [] }\`.**

5. **Sesgo: tendiente a agrupar cuando hay duda razonable.** El usuario confirma — preferimos sobre-detectar y dejarlo decidir.

SCHEMA EXACTO DEL OUTPUT:

{
  "clusters": [
    {
      "variantes": ["Lu", "lucas mercado", "Lucas M."],
      "canonico_sugerido": "Lucas Mercado"
    },
    {
      "variantes": ["Dir Div 6 Oficina Fundador", "Dir Div 6 Oficina Fundador (Vacancia)"],
      "canonico_sugerido": "Dir Div 6 Oficina Fundador (Vacancia)"
    },
    {
      "variantes": ["Emilio (Sucursales)", "Emiliano (Sucursales)"],
      "canonico_sugerido": "Emiliano (Sucursales)"
    }
  ]
}

Si no hay duplicados: { "clusters": [] }

NO incluyas NADA fuera del JSON. Empezá con "{" y terminá con "}".`
}

export function buildDuenosClusteringUserMessage(
  duenosUnicos: string[],
  plan: PlanEstrategico,
): string {
  const proposito = plan.proposito
    ? `Propósito del plan: ${plan.proposito.escena}`
    : ''

  const listaJson = JSON.stringify(duenosUnicos, null, 2)

  return `Analizá la siguiente lista de dueños del inventario y agrupá las variantes que probablemente sean la misma persona.

## Contexto

Plan: ${plan.nombre ?? '(sin nombre)'}
${proposito}

## Lista de dueños únicos del inventario (${duenosUnicos.length} strings)

${listaJson}

# Tarea

Devolveme los clusters de variantes que pensás que son la misma persona, con un nombre canónico sugerido para cada cluster. Output JSON-only siguiendo el schema del system prompt.

Si no detectás duplicados sospechosos, devolvé \`{ "clusters": [] }\`.`
}
