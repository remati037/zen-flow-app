import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton za `loading.tsx` — prikazuje se dok server renderuje stranicu.
 *
 * Bez njega je tap u donjoj navigaciji delovao „mrtvo" dok Neon ne odgovori
 * (stara stranica ostaje na ekranu bez ikakvog signala). Oblik prati tipičnu
 * stranicu app-a: naslov + kartice.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Učitavanje…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40 bg-white" />
        <Skeleton className="h-4 w-64 bg-white" />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl bg-white p-5 shadow-soft ring-1 ring-foreground/10">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  )
}
