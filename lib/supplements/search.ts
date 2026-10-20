import { SUPPLEMENT_CATALOG, type CatalogItem, type SupplementCategory } from './catalog'

/**
 * Pretraga kataloga — čist modul, radi na klijentu nad statičnom listom.
 *
 * Normalizacija: mala slova, `đ` → `dj`, uklanjanje dijakritika (č ć š ž),
 * brisanje apostrofa, sve ostalo što nije [a-z0-9] postaje razmak.
 */
export function normalizeSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Ispod ove dužine upita podstring poklapanje je preširoko („mg" bi pogodilo pola kataloga). */
const MIN_SUBSTRING_LEN = 3

interface Indexed {
  item: CatalogItem
  label: string
  aliases: string[]
}

const INDEX: Indexed[] = SUPPLEMENT_CATALOG.map((item) => ({
  item,
  label: normalizeSearch(item.label),
  aliases: item.aliases.map(normalizeSearch),
}))

/** Upit poklapa početak neke reči (ili više reči zaredom). */
function wordStart(haystack: string, q: string): boolean {
  return ` ${haystack}`.includes(` ${q}`)
}

/** Manje je bolje: 0 = početak reči u nazivu … 3 = podstring u aliasu. */
function score(e: Indexed, q: string): number | null {
  if (wordStart(e.label, q)) return 0
  if (q.length >= MIN_SUBSTRING_LEN && e.label.includes(q)) return 1
  if (e.aliases.some((a) => wordStart(a, q))) return 2
  if (q.length >= MIN_SUBSTRING_LEN && e.aliases.some((a) => a.includes(q))) return 3
  return null
}

/**
 * Rezultati rangirani: početak reči u nazivu, podstring u nazivu, početak reči u
 * aliasu, podstring u aliasu; unutar ranga redosled kataloga. Prazan upit vraća
 * celu (opciono kategorijom filtriranu) listu.
 */
export function searchCatalog(query: string, category?: SupplementCategory): CatalogItem[] {
  const q = normalizeSearch(query)
  const pool = category ? INDEX.filter((e) => e.item.category === category) : INDEX
  if (q === '') return pool.map((e) => e.item)

  const scored: Array<{ item: CatalogItem; s: number; i: number }> = []
  pool.forEach((e, i) => {
    const s = score(e, q)
    if (s !== null) scored.push({ item: e.item, s, i })
  })
  scored.sort((a, b) => a.s - b.s || a.i - b.i)
  return scored.map((x) => x.item)
}

/**
 * Tačno poklapanje (posle normalizacije) sa nazivom ili aliasom — za „Drugo" koje je
 * zapravo kataloška stavka ("Magnezijum", "mg"). Čuva se pod ključem kataloga.
 */
export function matchCatalogExact(name: string): CatalogItem | undefined {
  const q = normalizeSearch(name)
  if (q === '') return undefined
  return INDEX.find((e) => e.label === q || e.aliases.includes(q))?.item
}
