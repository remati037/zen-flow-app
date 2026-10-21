'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Send, X } from 'lucide-react'
import { toast } from 'sonner'

import { resendInvitation, revokeInvitation } from '@/app/(admin)/admin/korisnici/actions'
import { copyInviteLink } from '@/components/admin/invite-user-dialog'
import { Button } from '@/components/ui/button'

export function InvitationRowActions({ id, url }: { id: string; url: string | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function resend() {
    startTransition(async () => {
      const res = await resendInvitation({ invitationId: id })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.data.emailSent) toast.success(`Nov link poslat na ${res.data.email}. Stari više ne važi.`)
      else toast.warning('Nov link je napravljen, ali mejl nije poslat — kopiraj link ručno.')
      router.refresh()
    })
  }

  function revoke() {
    startTransition(async () => {
      const res = await revokeInvitation({ invitationId: id })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Pozivnica opozvana — link više ne radi.')
      router.refresh()
    })
  }

  return (
    <div className="flex justify-end gap-1">
      {url && (
        <Button variant="ghost" size="icon-sm" onClick={() => copyInviteLink(url)} title="Kopiraj link" aria-label="Kopiraj link">
          <Copy />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={resend} disabled={isPending} title="Pošalji ponovo" aria-label="Pošalji ponovo">
        <Send />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={revoke} disabled={isPending} title="Opozovi" aria-label="Opozovi pozivnicu">
        <X />
      </Button>
    </div>
  )
}
