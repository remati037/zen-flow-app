/**
 * Vercel build: migracije baze → `next build --webpack`.
 *
 * Vercel poziva `vercel-build` umesto `build` kad skripta postoji, pa CI
 * (`npm run build`, BEZ `DATABASE_URL`-a — vidi CLAUDE.md) ovo nikad ne izvršava.
 *
 * Zašto: kod i šema su se već dvaput razišli na produkciji (baza na `0000`, pa
 * `0005` posle merge-a „Moj stack"-a) — deploy je uspeo, a svaka stranica koja
 * dodiruje novu tabelu je 500-ovala. Ručni `drizzle-kit migrate` je korak koji se
 * zaboravlja; ovde je deo deploy-a.
 *
 * Pravila:
 *  - SAMO `VERCEL_ENV=production`. Preview deploy grane sa nemerge-ovanom
 *    migracijom ne sme da menja bazu koju možda deli sa produkcijom.
 *  - Pad migracije OBARA build → Vercel zadržava prethodni deploy. Bolje stari
 *    kod nad starom šemom nego nov kod nad šemom koja mu ne odgovara.
 *  - Unpooled URL kad postoji (Neon integracija ga daje kao
 *    `DATABASE_URL_UNPOOLED`): DDL preko pgbouncer-a u transaction modu je
 *    nepouzdan.
 *  - drizzle-kit vodi `__drizzle_migrations`, pa je ponovljen poziv no-op.
 */

import { spawnSync } from 'node:child_process'

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const vercelEnv = process.env.VERCEL_ENV ?? '(lokalno)'

if (vercelEnv === 'production') {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('[vercel-build] DATABASE_URL nije postavljen za Production — migracije ne mogu da se primene.')
    process.exit(1)
  }
  console.log('[vercel-build] Production → primenjujem migracije baze…')
  run('npx', ['drizzle-kit', 'migrate'], { DATABASE_URL: url })
} else {
  console.log(`[vercel-build] VERCEL_ENV=${vercelEnv} → migracije se preskaču (samo production).`)
}

run('npx', ['next', 'build', '--webpack'])
