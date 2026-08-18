import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Jedna metrika u admin gridu: velika vrednost + kratak kontekst ispod.
 * Namerno bez Card wrappera — grid gustina je veća od standardne kartice.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  /** Istakni karticu (lime) — za metriku dana. */
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-4 shadow-soft ring-1 ring-foreground/10',
        accent ? 'bg-lime' : 'bg-white',
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-soft" strokeWidth={2} />}
        <p className="text-xs font-medium tracking-wide text-slate-soft uppercase">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-medium text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-mid">{hint}</p>}
    </div>
  )
}
