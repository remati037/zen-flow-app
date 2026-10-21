'use client'

import { RefreshCw } from 'lucide-react'

/**
 * „Pokušaj ponovo" na `/~offline`.
 *
 * Ovu stranicu servira service worker kao fallback kad navigacija padne. U
 * standalone PWA režimu nema adresne trake ni pull-to-refresh-a, pa je bez ovog
 * dugmeta jedini izlaz gašenje i ponovno otvaranje aplikacije.
 *
 * `location.reload()`, ne `router.refresh()`: RSC refresh bi opet prošao kroz
 * mrežu koje nema i tiho pao nazad na isti fallback, bez ijedne poruke. Pun
 * reload vraća korisnika na rutu koju je tražio čim se veza vrati.
 *
 * Stranica ostaje statična — klijentska komponenta ne sprečava precache.
 */
export function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-lime-deep"
    >
      <RefreshCw className="size-4" />
      Pokušaj ponovo
    </button>
  )
}
