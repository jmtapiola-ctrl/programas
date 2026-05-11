# CLAUDE.md — Proyecto: Programas

## Descripción
App web para gestionar Programas, Objetivos y Planes de Batalla basada en la
Serie de Objetivos de L. Ronald Hubbard. Permite a equipos crear programas,
asignar objetivos, reportar cumplimientos y armar planes de batalla diarios/semanales.

## Stack
- **Framework**: Next.js 14 con App Router
- **Estilos**: Tailwind CSS (sin librerías de componentes externas)
- **Base de datos**: Airtable (fetch directo a REST API, sin SDK)
- **Auth**: NextAuth.js con CredentialsProvider
- **Deploy**: Vercel

## Variables de entorno
Crear archivo `.env.local` en la raíz con:
```
AIRTABLE_API_KEY=tu_api_key_aqui
AIRTABLE_BASE_ID=apprq0pL8aiCNMZvv
NEXTAUTH_SECRET=generar_con_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

## Airtable — Base ID: apprq0pL8aiCNMZvv

### Tablas y Field IDs

**Usuarios** — tblXhgSBuh0f1BNPV
| Campo | Field ID | Tipo |
|---|---|---|
| Nombre | fldFbWbFkhxmr7hRf | singleLineText [PRIMARY] |
| Email | fld0IIhsqQw2yny1Z | singleLineText |
| Rol | fldbVYb9q3OTbmlYR | singleSelect: Ejecutivo / Staff |
| Activo | fldtHzaYrxVt1e8q3 | checkbox |

**Programas** — tbld952MAM0ApHqT0
| Campo | Field ID | Tipo |
|---|---|---|
| Nombre | fldrTj1ggeu12uVKu | singleLineText [PRIMARY] |
| Descripcion | fldlv4tR7tMoMMFZC | multilineText |
| Objetivo Mayor | fldQuyth3IWcNzZ9g | multilineText |
| Estado | fldCNL2ZzxXfmM1KH | singleSelect: Borrador/Activo/Completado/Archivado |
| Responsable | fldHbc6OhAkKF1iMC | multipleRecordLinks → Usuarios |
| Fecha Inicio | fldxG2voOTeZGdXeM | date |
| Fecha Objetivo | fld8fgmt8NGWj21oe | date |
| Notas | fldjEen4uHIVABGPZ | multilineText |
| Objetivos | fldXxfiyv5DbvwTsZ | multipleRecordLinks → Objetivos |

**Objetivos** — tbl9ljCeFDMeCsbAT
| Campo | Field ID | Tipo |
|---|---|---|
| Nombre | fldoAaiHZ0wE8skdB | singleLineText [PRIMARY] |
| Tipo | fld3P1VeDX9ierG8i | singleSelect: Mayor/Primario/Condicional/Operativo/Producción |
| Programa | fldVwyD7NNocHhORP | multipleRecordLinks → Programas |
| Responsable | fldcG10p89bDRUU0X | multipleRecordLinks → Usuarios |
| Estado | flddQzgB28scsTuLu | singleSelect: Pendiente/En curso/Cumplido/Incumplido |
| Fecha Limite | fldU1Lo1GbvDrFDuF | date |
| Descripcion Doingness | fldPhw8QNJneQlJDV | multilineText |
| Es Repetible | fld0BCz0UMO7K5wCn | checkbox |
| Orden | fldxX3JXMRguaJD2Y | number |
| Notas | fldhlEJR4FBhXqC6D | multilineText |
| PB | fldYvTmZeYdS8HO0H | multipleRecordLinks → PB |
| Cumplimientos | fldrVW9e5WdhMpERq | multipleRecordLinks → Cumplimientos |

**Cumplimientos** — tblTbB0eYz3xsdyNk
| Campo | Field ID | Tipo |
|---|---|---|
| Cumplimiento | fldI9lmK5k3nRNeA5 | formula [PRIMARY] |
| Objetivo | fldXcu6A5QKwABMtf | multipleRecordLinks → Objetivos |
| Reportado Por | fldb3G45AIdA6YdZ7 | multipleRecordLinks → Usuarios |
| Fecha | fld8GA6aFyu09Ofp5 | date |
| Descripcion del Cumplimiento | fld1NMRnk5IEm0UGc | multilineText |
| Aprobado | fldGEkCdV9t2kxsky | checkbox |

**PB (Planes de Batalla)** — tbliUTM4zaoyztD6O
| Campo | Field ID | Tipo |
|---|---|---|
| Titulo | fldUdkIDSJ5bpkWQ1 | singleLineText [PRIMARY] |
| Responsable | fldyGJqVjj9gGYCY4 | multipleRecordLinks → Usuarios |
| Periodo | fldhCdfSUagl3qWvg | singleSelect: Día/Semana |
| Fecha | flduXU9YPEnp04XvA | date |
| Estado | fldyxNXiYbvSM1Ngb | singleSelect: Borrador/Activo/Completado |
| Objetivos Incluidos | fldi9AIteXA9P4gp4 | multipleRecordLinks → Objetivos |
| Notas | fldtZNjSntLLyPYlf | multilineText |

## Estructura del proyecto
```
/app
  /api
    /auth/[...nextauth]/route.ts
    /airtable/[table]/route.ts      ← proxy genérico (nunca exponer API key al cliente)
  /(auth)
    /login/page.tsx
  /(main)
    /layout.tsx                     ← sidebar + header
    /page.tsx                       ← dashboard
    /programas/page.tsx
    /programas/nuevo/page.tsx
    /programas/[id]/page.tsx
    /objetivos/[id]/page.tsx
    /objetivos/nuevo/page.tsx
    /plan-de-batalla/page.tsx
    /plan-de-batalla/nuevo/page.tsx
    /informes/page.tsx
    /admin/usuarios/page.tsx
/lib
  /airtable.ts                      ← helpers por tabla
  /auth.ts                          ← config NextAuth
  /types.ts                         ← tipos TypeScript
/components
  /ui/                              ← Badge, Card, Button, Modal, etc.
  /objetivos/ObjetivoCard.tsx
  /programas/ProgramaCard.tsx
  /pb/PlanDeBatallaView.tsx
```

## Roles y permisos
- **Ejecutivo**: crea/edita programas y objetivos, ve todo, aprueba cumplimientos
- **Staff**: ve solo sus objetivos asignados, reporta cumplimientos, crea sus PBs

## Reglas de negocio clave
1. Objetivos agrupados por Tipo en orden: Primario → Condicional → Operativo → Producción → Mayor
2. Objetivo Condicional debe resolverse antes de crear Operativos en el mismo programa
3. Objetivo con Es Repetible=true: al cumplirse genera un Cumplimiento y vuelve a Pendiente
4. Advertencia visual cuando hay Objetivos Primarios en estado Incumplido (rompe la cadena)
5. Al marcar cumplido desde PB → crear registro automático en Cumplimientos
6. Staff no ve programas ni objetivos de otros usuarios

## Filosofía base (Serie de Objetivos — LRH)
- Un objetivo debe ser TERMINABLE: realizable, acabable, completable
- Un objetivo sin doingness no es un objetivo
- Detrás de cada paro hay un propósito fallido
- Los Objetivos Primarios son la base — si fallan, todo lo demás falla
- Un Programa = serie completa coordinada de todos los tipos de objetivos
- Un Plan de Batalla = objetivos del día/semana que implementan el plan estratégico

## Diseño
- Dashboard oscuro, profesional
- Sidebar fijo a la izquierda, colapsable en mobile
- Badges por tipo de objetivo:
  - Primario: azul
  - Condicional: amarillo
  - Operativo: naranja
  - Producción: verde
  - Mayor: púrpura
- Solo Tailwind, sin librerías externas de UI

## Comandos útiles
```bash
npm install          # instalar dependencias
npm run dev          # servidor local en http://localhost:3000
npm run build        # build de producción
npm run lint         # verificar errores
```

## Aprendizajes del proyecto

Lecciones operativas acumuladas que aplican a cualquier feature futuro. Los aprendizajes específicos a un feature van en su rama; acá solo lo que es transversal al proyecto.

### Cambios de schema "preparatorios" deployados antes que el feature consumidor

Cuando se mergean a `main` cambios de schema (campo nuevo en JSON estructurado, tabla nueva, columna nueva) **antes** de que el feature que los consume esté implementado:

- El código que introduce el campo **debe llevar un comentario `// TODO:` explícito** indicando dónde se va a consumir y en qué feature/branch.
- Formato sugerido: `// TODO: este campo se consume en feat/<branch> (Fase N) — descripción breve del flujo. Hasta que ese feature exista, el campo se emite/persiste sin uso visible.`
- Razón: futuros mantenedores que hagan cold-read del código no se confunden con código sin uso aparente, ni lo borran pensando que es legacy.
- Aplicar el TODO en TODOS los puntos del código donde el campo se introduce (definición de tipo, validación en parser, instrucciones al modelo, etc.), no solo en uno.

Origen: feat/audit-reviewer (Fase 0) merged a `main` con el campo `cierre_sugerido` en `PanelUpdatePE` antes de que la UI/endpoint que lo consume estuvieran implementados.

### El filtro `paso_actual ≤ N` no es confiable como corte histórico

El campo `paso_actual` de las entrevistas PE se actualiza con el `PANEL_UPDATE` del modelo y tiene **lag**: a veces el modelo discute material del Paso N+1 con `paso_actual=N`, o vuelve a Paso N con `paso_actual=N+1`.

- Para tests sintéticos sobre datos históricos del Plan Sr de Terravinci, usar **cortes manuales hardcoded** validados por contenido del último turno (ej: turno declara explícitamente "Paso N — completo").
- En el feature de auditoría, este problema se resuelve usando la marca explícita `rol=snapshot` que se crea al cerrar definitivamente un Paso. Ese snapshot **es** el corte real.
- Origen: smoke 0.2 del feat/audit-reviewer falló en run 1 por contaminación del input (filtro `paso ≤ 1` devolvió turnos del Paso 2).

### Antes de recomendar correr un smoke/script existente, verificar QUÉ TOCA

Scripts en `diagnostico/scripts/` pueden tener side effects destructivos: escribir en Airtable de producción, mutar datos curados (ej: `proposito` o `situacion` del Plan Sr de Terravinci), insertar turnos sintéticos al historial real. **"Costo monetario bajo" no implica "seguro".**

- **Verificación obligatoria antes de recomendar un script:** `grep -nE "update[A-Z]|append[A-Z]|delete[A-Z]" path/to/script.ts` para ver qué helpers de mutación usa, y leer las llamadas concretas para confirmar qué tabla/registro tocan.
- **Para validar cambios al parser, schema, o lógica pura:** preferir **unit-tests** (`32-parser-unit.ts` y similares) — sin red, sin Airtable, sin LLM. $0 USD, segundos de runtime, 100% reproducibles.
- **Si un smoke destructivo es genuinamente necesario:** crear plan de testing dedicado (no usar el del piloto), o snapshot + restore explícito antes/después.
- Origen: en el merge pre-Fase 1 de feat/audit-reviewer, casi corrimos `27-smoke-test-final.ts` para validar el cambio aditivo al parser. El script escribe en `recFMWxoE5gTQQrf7` (Plan Sr real). Pivote a unit-test `32-parser-unit.ts` evitó contaminación del piloto curado.

### Reads de Airtable: usar nombres de campos, no field IDs

Cuando se hace `fetchAll(table)` sin `returnFieldsByFieldId=true`, Airtable devuelve `r.fields` con los **NOMBRES** como keys (no field IDs). Escribir con field IDs en `r.fields?.['fldXXX']` devuelve `undefined` silenciosamente.

- **Convención del proyecto:** **reads usan nombres** (ej: `r.fields?.['Reviewer Decisiones JSON']`), **writes (POST/PATCH bodies) usan field IDs** (más estable contra renombres del field).
- Mantener consistencia con `mapTurnoPE`, `mapEntrevistaPE`, `mapPlanEstrategico`, etc.
- Origen: smoke real end-to-end de Fase 4 reportó "data loss aparente" (`snapshotPreApply: false`, `decisiones: 0` post-write exitoso). El bug era que `getReviewerTurnos` y `getSnapshotPaso` usaban field IDs en el read. GET directo a Airtable confirmó que los datos SÍ estaban persistidos.

### Smoke real end-to-end del feature de auditoría — checklist de release

Antes de declarar release del feature audit-reviewer (o de cualquier cambio significativo a sus libs/endpoints/UI), correr en orden:

1. **Tipo-check:** `npx tsc --noEmit`. Cero errores.
2. **Unit tests:** `npx tsx diagnostico/scripts/32-parser-unit.ts && npx tsx diagnostico/scripts/34-fase2-unit.ts && npx tsx diagnostico/scripts/37-fase4-unit.ts`. **135/135** verde.
3. **Verificación visual** (UI sin tocar producción):
   - `npx tsx --env-file=.env.local diagnostico/scripts/35-seed-test-audit-state.mjs --with-report` → Pantalla 3 con report mock + decisiones interactivas.
   - `npx tsx --env-file=.env.local diagnostico/scripts/35-seed-test-audit-state.mjs --with-report-applied` → Pantalla 4 con diff visible y 3 botones.
4. **Smoke real end-to-end** (toca OpenAI + Anthropic + Airtable plan dummy `recEsoKMENVQI8NUb`, **NO** el Plan Sr de Terravinci):
   - `REVIEWER_TIMEOUT_MS=300000 npx tsx --env-file=.env.local diagnostico/scripts/36-smoke-end-to-end.ts`.
   - Costo esperado: $0.20-0.50 USD para plan dummy chico; $1-2 para plan con contenido real.
   - Valida: cierre → audit gpt-5.5 → split decisiones → apply errors det + Opus questions → snapshot pre-apply → estado final.
   - Verificar al final que `sub_estado_paso=esperando_aprobacion_final` y `decisiones+snapshotPreApply` persistidos en Airtable.
5. **Verificación manual del usuario** sobre Pantalla 4 con datos reales del smoke:
   - Toggle "Solo cambios | Plan completo" funciona.
   - Indicador visual (badge MODIFICADO) en campos cambiados.
   - Click "Aceptar y avanzar" crea snapshot inmutable + transición a Paso N+1.

Si algún step falla, parar antes del release. Documentar el bug y arreglar antes de continuar.

### Sistema tipográfico del wizard PE — mínimo absoluto 12px

Auditoría 2026-05-11 encontró 121 ocurrencias de tipografía bajo 12px (10/11/9px en caps labels, metadata, captions) distribuidas en 21 archivos del wizard PE. Eran ilegibles para humanos sin esfuerzo. Migradas todas a `text-[12px]` mínimo.

**Regla operativa**: **ninguna tipografía bajo 12px en componentes del wizard PE** (`components/planes-estrategicos/`, `components/audit/`, `app/(main)/planes-estrategicos/`). Aplicable a desarrollos futuros del wizard.

Sistema canónico de 6 niveles:

| Nivel | Tailwind | Uso |
|---|---|---|
| **display** | `text-2xl` (24px) | Títulos de página/modal principales |
| **heading-1** | `text-[18px]` / `text-lg` | Título de sección dentro de modal/panel |
| **heading-2** | `text-[15-16px]` | Subtítulo de sección |
| **body-strong** | `text-sm` / `text-[14px]` | Items destacados, contenido principal |
| **body** | `text-[13px]` | Texto normal (mayoría del wizard) |
| **small** | `text-[12px]` o `text-xs` | Labels, metadata, captions, hints, badges |

Si necesitás MENOR prominencia para un texto:
- Bajar `font-weight` (a `font-normal` o `font-light`).
- Usar color más muted (`text-muted-foreground/70`, opacidad).
- NUNCA bajar tamaño.

**Scope NO incluido**: Dashboard, Programas, Login, etc. Esas secciones tienen su propio pase pendiente cuando se priorice. La regla aplica solo a wizard PE por ahora.

### Apply Opus: max_tokens y patch semantics obligatorios

Llamadas a Opus desde endpoints `/apply` y `/comentar`:
- **`max_tokens` mínimo: 32000.** Con menos, el JSON output trunca mid-string en planes de tamaño realista (Opus reasoning interno consume tokens significativos).
- **`messages.stream()` obligatorio.** El SDK Anthropic rechaza `messages.create()` cuando `max_tokens` puede llevar a runtime > 10 min.
- **Patch semantics en el system prompt:** Opus debe emitir SOLO las top-level keys (`proposito` / `situacion` / `datos_faltantes`) que cambian. Si nada cambia, devolver `{}`. El código merge: si Opus emite key X, usar; si no, mantener valor anterior.
  - Sin patch semantics, Opus reescribe el plan ENTERO en cada call → desperdicia tokens, propenso a truncar.
- Origen: smoke real end-to-end Fase 4 detectó las 3 issues secuencialmente.

### Triage de bugs reportados: pedir ID exacto del registro antes de declarar bug

Cuando el usuario reporta un bug observando datos en Airtable / Vercel / cualquier sistema externo (ej: "el campo X quedó vacío", "no se persistió Y"), **pedirle el ID exacto del registro antes de declarar el bug confirmado**.

- **Por qué:** la tabla puede tener múltiples registros similares (ej: varios reviewer turnos de un mismo Paso, algunos procesados y otros no). Sin ID exacto, es fácil confundirse de fila y declarar un bug que no existe.
- **Caso real:** en feat/audit-reviewer post-Fase 4, el usuario reportó "Reviewer Decisiones JSON quedó vacío" + "Apply Changes Latency MS vacío". Verificación directa contra el reviewer turno que efectivamente había procesado (`reclIHtEwJfdmdffZ`) mostró que ambos campos SÍ estaban poblados. La tabla tenía otros 3 reviewer turnos del Bloque 1 que efectivamente tenían esos campos vacíos (audits que se generaron pero NO se procesaron — falta de apply). El usuario probablemente miró uno de esos por error.
- **Cómo aplicar:** antes de aceptar el bug, pedir "¿qué ID de registro miraste?" o verificar el ID a partir del flow del user (ej: el último audit que procesó). Verificar con `fetch` directo a Airtable contra ese ID antes de implementar fix.
- **Coherente con:** "verificar QUÉ TOCA antes de recomendar correr un script" y el pattern general de spot-check con citas verificables.

### Stale reads de Airtable post-PATCH (eventual consistency en list endpoints)

`getEntrevistaPE(planId)` usa `fetchAll(TABLA_ENTREVISTAS_PE, ...)` (list endpoint). Cuando se hace un PATCH a la entrevista y se lee inmediatamente después con un list endpoint, **Airtable puede devolver el valor anterior por eventual consistency**. Reads por ID directo (`fetchOne`) tienen strong consistency; reads por list (`fetchAll`) no.

- **Síntoma:** server component carga inmediatamente después de un POST que hizo PATCH a `sub_estado_paso`, lee stale, y aplica un guard de redirect basado en estado viejo. Resultado: usuario termina en pantalla incorrecta.
- **Caso real:** Pantalla 4 (`cierre/[paso]/final/page.tsx`) post-apply leía `auditoria_completa` stale en vez de `esperando_aprobacion_final`, redirigía a Pantalla 1.
- **Fix patrón:** cuando un endpoint hace PATCH a la entrevista y luego devuelve un redirect a server component que lee la entrevista, agregar query param sentinel (ej: `?from_apply=1`) en el redirect. El server component reconoce el sentinel y, si lee un estado pre-transición, **no redirige** — muestra la página igual (los datos del PATCH ya están persistidos, solo el flag stale).
- **Checklist obligatorio cuando se sume nueva transición de `sub_estado_paso`:** ejecutar `Grep "getEntrevistaPE"` y, para cada match en server components que aplique guards de redirect basados en sub_estado, decidir explícitamente si el flow nuevo requiere el sentinel `?from_apply=1` (o equivalente). Es el chequeo que evita reintroducir el bug de stale read en flows futuros — más barato que descubrirlo en producción.
- **Call sites a auditar (lista actual al 2026-05-03):** server components que leen `getEntrevistaPE` después de un PATCH del client.
  - `app/(main)/planes-estrategicos/[id]/cierre/[paso]/page.tsx` (Pantalla 1) — lee post `/cerrar-paso` POST. Si redirige basado en sub_estado y hay stale read, riesgo.
  - `app/(main)/planes-estrategicos/[id]/cierre/[paso]/final/page.tsx` (Pantalla 4) — **YA FIXEADO** con `?from_apply=1`.
  - `app/(main)/planes-estrategicos/[id]/vista/page.tsx` — lee al cargar vista de prestigio. Sin guards estrictos, riesgo bajo.
- **Alternativa más radical (no aplicada):** refactorizar `getEntrevistaPE` para usar `fetchOne` cuando el plan tiene el linked `entrevistas_pe` ID. Cambiaría el read pattern de list a single-record (strong consistency). Mejora estructural pero invasiva.

## Principio operativo: minimizar trabajo de Juan

Juan es el arquitecto del proyecto pero NO quiere ser el operador. Su tiempo
es para decisiones estratégicas, de scope, de criterio de negocio. NO para
correr scripts, copiar tokens, armar curls, validar outputs técnicos rutinarios.

### Hacé vos siempre que se pueda:
- Smoke tests y validaciones técnicas (creá scripts que no requieran credenciales
  del usuario, corrélos vos, reportá resultados interpretados).
- Verificaciones de estado en Airtable (leé directo, no pidas a Juan que mire).
- Reset de dummies después de tus implementaciones.
- Type-checks, lint, compilación.
- Búsquedas en el repo cuando necesités contexto.
- Cualquier paso operativo intermedio entre "decisión tomada" y "feature funcionando".

### Involucrá a Juan SOLO cuando:
- Es decisión de scope, prioridad o criterio de negocio (no técnica).
- Hay trade-off real con consecuencias no obvias.
- Riesgo de divergir del diseño aprobado y necesitás confirmación.
- Bloqueante crítico que requiere su input.
- Terminaste un feature/fase y querés que valide el resultado funcional.

### Reportá siempre:
- Resultados ya interpretados, no logs crudos.
- Qué funcionó / qué no / qué hiciste para arreglar.
- Decisiones que tomaste vos (con razón breve).
- Cronómetro real de cada fase.
- Issues residuales o deuda técnica detectada.

### Excepción:
Juan es el único que puede probar UX/UI en navegador real con criterio humano.
Cuando la validación requiera "mirar pantalla y dar feedback de diseño/usabilidad",
ahí sí pedile que pruebe. No es tarea operativa — es criterio que solo él tiene.

## Backlog activo — features pausados

### Split de CLAUDE.md en docs/ — pendiente post-Paso 3+4

**Decidido 2026-05-03:** CLAUDE.md creció a ~280 líneas. Split aprobado pero postergado hasta terminar Paso 3 + Paso 4 (esos van a generar aprendizajes nuevos que conviene incorporar de una sola vez).

**Plan del split:**
- `CLAUDE.md` queda en ~80 líneas: stack + env + reglas de negocio + diseño + tabla "Antes de empezar tarea X".
- `docs/AIRTABLE.md`: schemas con field IDs de las 5 tablas.
- `docs/LEARNINGS.md`: los 7 aprendizajes operativos actuales + nueva sección "Patrones recurrentes del proyecto" (eventual consistency en Airtable list reads, PANEL_UPDATE se silencia si turnos previos no lo emitieron, apply determinístico requiere cita textual exacta, etc. — capturar patrones generales, no eventos puntuales).
- `docs/BACKLOG.md`: este backlog actual (Organigrama + cualquier otro pausado).

**Mitigaciones para evitar que el split rompa contexto:**
1. **Cross-references inline en CLAUDE.md**, no solo tabla. Cada sección que cita un doc debe linkear ("para detalles de cierre de Pasos: ver `docs/LEARNINGS.md` sección Cierres"). Patrón: la sección queda corta en CLAUDE.md, el detalle vive en el doc.
2. **Sección "Antes de empezar tarea X"** organizada por trigger concreto (no tabla genérica): "antes de tocar Airtable schema → AIRTABLE.md", "antes de cierres de Paso → LEARNINGS.md sección cierres", "si triagéas bug del usuario → LEARNINGS.md sección triage", "antes de retomar Organigrama → BACKLOG.md sección Organigrama". Cada trigger debe ser específico, no "cuando sea relevante".

**Cuándo retomar:** después de Paso 3+4 implementados, antes de retomar Organigrama (Hito 2).

### Feature Organigrama integrado al wizard PE — pausado 2026-05-03

Pausa decidida porque Lu (asistente de Juan) está completando el organigrama esta semana, incluyendo decisiones estructurales pendientes (si Studio Terravinci, Más Dueños, División Hacedora son entidades nuevas o áreas dentro de Terravinci). Implementar ahora y migrar después sería más caro que postergar.

**V1 de la app avanza sin Organigrama integrado:** Paso 3 con sub-bloque 3.0.A en texto libre + dueños del Inventario como strings.

**Hitos pendientes cuando se retome (post-V1):**
- Hito 2: integración básica (modal "jugadores" + @mention de áreas + sub-bloque 3.0.A estructurado).
- Hito 3: vinculación automática sugerida por el modelo durante la entrevista, usando datos ricos del organigrama (PFV, Propósito, Descripción Breve, Funciones).

**Trabajo de investigación ya hecho (no re-investigar):**
- Airtable canónico identificado: base `appQNQlrJweag2J1U` (DISTINTA de Programas `apprq0pL8aiCNMZvv`). Tablas Areas (`tblUSk7Lcwt6z4ozE`), Personas (`tblLcCXARSg76fYvo`), Entidades, Niveles. Filtro real de archivado es checkbox `Inactiva`, NO `Status='Archivada'`.
- App vive en `c:\Proyectos\organigrama-app`. Auth Clerk multi-app vía `publicMetadata.apps.<app>.role` — Programas podría usar el mismo Clerk con `apps.programas.role`. Endpoints existentes consumibles: `GET /api/areas|/personas|/entities|/niveles`, todos con `verifyViewer` (cualquier user logueado pasa).
- 4 decisiones técnicas cerradas: snapshot híbrido (live read durante entrevista, snapshot embebido al cerrar Paso), áreas pendientes como "vacancia pendiente de validación" (no auto-create), endpoint dedicado `/api/areas/active-summary` a sumar a Organigrama, token compartido como mecanismo de auth entre apps.
- 5 áreas a crear identificadas para Lu: División Hacedora de Dueños, Área de Tierras (Carozza), Equipo de AI organizativa, Studio Terravinci (viralidad JMT), Marca Más Dueños.
- 3 entidades pendientes de aclarar (decisión de Lu): Studio Terravinci, Más Dueños, División Hacedora — ¿entidad nueva o área?
- Excel de mapping de Juan: 14 personas + 40 áreas, 12 con `recXXX` ya identificados.

**Caveat técnico clave para cualquier integración futura:**
El Plan Sr usa **nicknames informales** ("Randy", "Charly", "Vicky", "Lu", "Nico", "Romi", "Gus Grispo") mientras que el organigrama tiene **nombres formales completos** ("Santiago Tosco", "Lucas Mercado", "Juan Manuel Tapiola"). Cross-check directo de nombres no resuelve el match — varios nicknames tienen 0 matches o múltiples candidatos ambiguos. Cualquier integración requiere **mapeo manual** (Excel de Juan / Lu) o un campo nuevo "Aliases" en Personas. NO asumir que se puede auto-resolver con fuzzy match.
