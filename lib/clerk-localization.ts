import { srRS } from '@clerk/localizations/sr-RS'

/**
 * Clerk lokalizacija — srpska LATINICA.
 *
 * Clerk-ov `srRS` je mešavina latinice i ćirilice (deo ključeva — npr. meni
 * naloga — preveden je ćirilicom), a ceo app je latinica. Zato ga
 * transliterujemo pri učitavanju modula: pokrivamo SVE ključeve, uključujući i
 * one koje Clerk doda u budućim verzijama, bez ručnog održavanja prevoda.
 * Placeholder-i (`{{applicationName}}`) su ASCII i prolaze netaknuti.
 *
 * Preko toga idu naši tekstovi za ekrane koje kupac vidi prvi: sign-in i
 * sign-up nose ZenFlow ton i — najvažnije — uputstvo da se registruje mejlom
 * sa kupovine (najčešći razlog za `/nemas-pristup`).
 */

const CYR_TO_LAT: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z', И: 'I',
  Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'Č', Џ: 'Dž', Ш: 'Š',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
}

function toLatin(text: string): string {
  return text.replace(/[Ѐ-ӿ]/g, (ch) => CYR_TO_LAT[ch] ?? ch)
}

function transliterate<T>(value: T): T {
  if (typeof value === 'string') return toLatin(value) as T
  if (Array.isArray(value)) return value.map(transliterate) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, transliterate(inner)]),
    ) as T
  }
  return value
}

const base = transliterate(srRS)

const PURCHASE_EMAIL_HINT = 'Koristi isti mejl kao pri kupovini na nurolab.rs.'

export const clerkLocalization: typeof srRS = {
  ...base,
  // `srRS` nema placeholder-e polja — bez ovoga forma prikazuje engleski fallback.
  formFieldInputPlaceholder__emailAddress: 'Unesi mejl adresu',
  formFieldInputPlaceholder__emailAddress_username: 'Unesi mejl ili korisničko ime',
  formFieldInputPlaceholder__password: 'Unesi lozinku',
  formFieldInputPlaceholder__signUpPassword: 'Napravi lozinku',
  formFieldInputPlaceholder__firstName: 'Ime',
  formFieldInputPlaceholder__lastName: 'Prezime',
  formFieldInputPlaceholder__username: 'Unesi korisničko ime',
  formFieldInputPlaceholder__phoneNumber: 'Unesi broj telefona',
  formFieldInputPlaceholder__backupCode: 'Unesi rezervni kod',
  formFieldInput__emailAddress_format: 'Primer: ime@primer.rs',
  signIn: {
    ...base.signIn,
    start: {
      ...base.signIn?.start,
      title: 'Prijavi se na ZenFlow',
      subtitle: 'Dobro došli nazad — tvoj niz te čeka.',
    },
  },
  signUp: {
    ...base.signUp,
    start: {
      ...base.signUp?.start,
      title: 'Napravi ZenFlow nalog',
      subtitle: PURCHASE_EMAIL_HINT,
      titleCombined: 'Napravi ZenFlow nalog',
      subtitleCombined: PURCHASE_EMAIL_HINT,
    },
  },
}
