import { Award, CheckCircle2, Home, Package, Timer, type LucideIcon } from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

/**
 * Jedinstveni izvor navigacije za korisnički shell.
 * Koriste ga i bottom-nav (mobilni) i sidebar (desktop).
 * Maks. 5 stavki u tab baru radi čistine — Podešavanja idu u header.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Početna', icon: Home },
  { href: '/protokol', label: 'Protokol', icon: CheckCircle2 },
  { href: '/zalihe', label: 'Zalihe', icon: Package },
  { href: '/fokus', label: 'Fokus', icon: Timer },
  { href: '/bedzevi', label: 'Bedževi', icon: Award },
]
