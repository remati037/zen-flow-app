import type { AccessStatus } from '@/lib/access/status'
import { Badge } from '@/components/ui/badge'

const LABELS: Record<AccessStatus, string> = {
  vip: 'VIP',
  subscriber: 'Pretplatnik',
  inactive: 'Neaktivan',
}

const VARIANTS: Record<AccessStatus, 'default' | 'secondary' | 'outline'> = {
  vip: 'secondary',
  subscriber: 'default',
  inactive: 'outline',
}

/** Jedinstven prikaz `profiles.access_status` u admin panelu. */
export function AccessStatusBadge({ status }: { status: AccessStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className={status === 'vip' ? 'bg-lime text-ink' : undefined}>
      {LABELS[status]}
    </Badge>
  )
}
