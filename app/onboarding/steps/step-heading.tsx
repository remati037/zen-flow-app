/**
 * Naslov jednog koraka wizarda. Svaki korak nosi svoj heading (a ne
 * `CardHeader`) da bi ulazio i izlazio zajedno sa sadržajem kroz AnimatePresence.
 */
export function StepHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      {eyebrow && (
        <p className="text-[11px] font-medium tracking-wide text-slate-soft uppercase">{eyebrow}</p>
      )}
      <h2 className="font-heading text-lg leading-snug font-medium text-ink">{title}</h2>
      {description && <p className="text-sm text-slate-mid">{description}</p>}
    </div>
  )
}
