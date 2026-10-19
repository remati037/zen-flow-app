'use client'

import { TIMES_OF_DAY, TIME_LABELS, type TimeOfDay } from '@/lib/supplements/time-of-day'
import { cn } from '@/lib/utils'

export function TimeOfDayPicker({
  value,
  onChange,
}: {
  value: TimeOfDay
  onChange: (next: TimeOfDay) => void
}) {
  return (
    <div role="radiogroup" aria-label="Doba dana" className="grid grid-cols-3 gap-2">
      {TIMES_OF_DAY.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={cn(
            'min-h-11 rounded-full text-sm font-medium ring-1 ring-ink/10 transition-colors',
            value === t ? 'bg-ink text-paper' : 'bg-white text-ink hover:bg-paper',
          )}
        >
          {TIME_LABELS[t]}
        </button>
      ))}
    </div>
  )
}
