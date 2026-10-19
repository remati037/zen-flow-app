/**
 * Refill link ka shopu — JEDAN izvor istine za sve CTA-ove „Dopuni zalihe".
 *
 * Čist modul (bez `server-only`), da ga koriste i stranice, i mejl šabloni, i QA.
 *
 * Svaki CTA nosi UTM tagove, da se u shop analitici vidi koji kanal je doveo
 * ponovnu kupovinu (retencioni loop je ceo smisao aplikacije — bez atribucije
 * ne znamo da li radi). Postojeći `utm_*` parametri iz env vrednosti se NE
 * pregaze: ako shop link već nosi kampanju, ona ima prednost.
 *
 * Bez `NEXT_PUBLIC_SHOP_REFILL_URL` (ili sa neispravnim URL-om) vraća `null` —
 * pozivaoci tada sakrivaju CTA, kao i do sada.
 */

export type RefillSource =
  | 'dashboard'
  | 'zalihe'
  | 'podesavanja'
  | 'email_low_stock'

const UTM_CAMPAIGN = 'refill'

export function refillUrl(source: RefillSource): string | null {
  const base = process.env.NEXT_PUBLIC_SHOP_REFILL_URL?.trim()
  if (!base) return null

  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const isEmail = source.startsWith('email_')
  const params: Record<string, string> = {
    utm_source: isEmail ? 'email' : 'app',
    utm_medium: isEmail ? 'email' : 'pwa',
    utm_campaign: UTM_CAMPAIGN,
    utm_content: source,
  }
  for (const [key, value] of Object.entries(params)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  }
  return url.toString()
}
