import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { CircleDot, Settings, WifiOff } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { isOnline } from '../../store/offlineCache'
import { useEffect, useState } from 'react'

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline())
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslation()
  const online = useOnlineStatus()

  const navItems = [
    { to: '/', label: t.nav.eclipses, icon: CircleDot, end: true },
    { to: '/settings', label: t.nav.settings, icon: Settings, end: true },
  ]

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight" end>
          <CircleDot className="text-[var(--color-accent)]" size={22} aria-hidden />
          <span>{t.appName}</span>
        </NavLink>
        {!online && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] rounded-full border border-[var(--color-border)] px-2.5 py-1">
            <WifiOff size={14} aria-hidden />
            {t.map.offline}
          </span>
        )}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                    : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]'
                }`
              }
            >
              <Icon size={18} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur flex justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 px-4 min-w-[44px] min-h-[44px] text-xs font-medium transition-colors ${
                isActive
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-fg-muted)]'
              }`
            }
          >
            <Icon size={20} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
