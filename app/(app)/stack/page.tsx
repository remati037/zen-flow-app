import { AddSupplementDialog } from '@/components/stack/add-supplement-dialog'
import { ClearStackButton } from '@/components/stack/clear-stack-button'
import { StackConfirmCard } from '@/components/stack/stack-confirm-card'
import { StackManager } from '@/components/stack/stack-manager'
import { requireAppAccess } from '@/lib/access/app-gate'
import { belgradeToday } from '@/lib/dates'
import { needsConfirmation } from '@/lib/supplements/confirm-rules'
import { getStackSummary, listActiveSupplements } from '@/lib/supplements/store'

export default async function StackPage() {
  const { profile } = await requireAppAccess()

  const [rows, summary] = await Promise.all([
    listActiveSupplements(profile.id),
    getStackSummary(profile.id),
  ])
  const confirmDue = needsConfirmation(summary.oldestConfirmedOn, belgradeToday())

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-[-0.03em] text-ink">Moj stack</h1>
          <p className="text-slate-mid">Suplementi koje piješ uz ZenFlow.</p>
        </div>
        <AddSupplementDialog />
      </header>

      {confirmDue && <StackConfirmCard showEditLink={false} />}

      {rows.length === 0 ? (
        <div className="rounded-[24px] bg-white p-6 text-center ring-1 ring-ink/[0.06]">
          <p className="font-medium text-ink">Još ništa nije dodato</p>
          <p className="mt-1 text-sm text-slate-mid">
            Dodaj ono što piješ, pa ćeš sve da imaš na jednom mestu.
          </p>
        </div>
      ) : (
        <>
          <StackManager rows={rows} />
          <div className="flex justify-center">
            <ClearStackButton />
          </div>
        </>
      )}
    </div>
  )
}
