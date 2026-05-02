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
