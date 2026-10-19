import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      {/*
        Najčešći razlog za /nemas-pristup je registracija drugim mejlom od onog sa
        kupovine — pristup se dodeljuje poklapanjem mejla sa Woo porudžbinom. Zato
        uputstvo stoji IZNAD forme, vidljivo pre nego što se mejl unese.
      */}
      <div className="w-full rounded-2xl bg-lime-soft px-5 py-4 text-center text-sm text-ink ring-1 ring-lime">
        <p className="font-medium">Registruj se istim mejlom kao pri kupovini</p>
        <p className="mt-1 text-slate-mid">
          Pristup se otvara sam kad se mejl poklopi sa porudžbinom na nurolab.rs.
        </p>
      </div>
      <SignUp />
    </div>
  )
}
