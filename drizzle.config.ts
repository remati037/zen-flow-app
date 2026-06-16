import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Next.js drži env u .env.local; drizzle-kit ga ne učitava sam.
config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL nije postavljen. Dodaj ga u .env.local')
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
