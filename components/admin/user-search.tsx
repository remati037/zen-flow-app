import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Pretraga korisnika. Namerno običan GET form (server component, bez client JS):
 * `?q=` ide u searchParams, a filtriranje radi SQL u `listAdminUsers` — nikad se
 * ne učitava cela lista pa filtrira na klijentu.
 */
export function UserSearch({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/admin/korisnici" method="get" className="flex gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-soft" />
        <Input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Pretraži po mejlu ili imenu…"
          aria-label="Pretraga korisnika"
          className="pl-9"
        />
      </div>
      <Button type="submit" variant="dark">
        Traži
      </Button>
      {defaultValue ? (
        <Button type="submit" name="q" value="" variant="ghost">
          Poništi
        </Button>
      ) : null}
    </form>
  )
}
