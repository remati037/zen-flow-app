import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Javne rute — dostupne bez logina. Webhook MORA biti javan.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/style-guide',
  '/api/webhooks(.*)',
  // PWA: manifest dohvata browser anonimno, offline fallback mora biti dostupan bez logina.
  '/manifest.webmanifest',
  '/~offline',
])

// Admin rute — zaštićene rolom (page + admin API).
const isAdminRoute = createRouteMatcher(['/admin(.*)', '/api/admin(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // Sve sem javnih ruta zahteva login.
  if (!isPublicRoute(req)) {
    await auth.protect()
  }

  // Admin gating: role iz session claim-a (bez DB poziva, Edge-safe).
  if (isAdminRoute(req)) {
    const { sessionClaims } = await auth()
    if (sessionClaims?.metadata?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }
})

export const config = {
  matcher: [
    // Preskoči Next interne fajlove i statiku, osim u query parametrima.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|map)).*)',
    // Uvek pokreni za API rute.
    '/(api|trpc)(.*)',
  ],
}
