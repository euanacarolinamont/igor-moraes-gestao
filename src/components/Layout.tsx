import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard,
  Users,
  Kanban,
  CalendarDays,
  DollarSign,
  LogOut,
  ChevronRight,
} from 'lucide-react'

interface Props {
  session: Session | null
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/alunos', icon: Users, label: 'Alunos' },
  { to: '/crm', icon: Kanban, label: 'CRM' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/financeiro', icon: DollarSign, label: 'Financeiro' },
]

export default function Layout({ session }: Props) {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar */}
      <aside className="w-60 bg-surface border-r border-border flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-border">
          <div className="flex flex-col">
            <span className="font-heading text-2xl text-white tracking-widest leading-none">IGOR</span>
            <span className="font-heading text-2xl text-primary tracking-widest leading-none">MORAES</span>
            <span className="text-xs text-gray-500 tracking-widest mt-1 uppercase">Gestão</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:bg-surface-2 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={14} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info bottom */}
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-bold">
              {session?.user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">Igor Moraes</p>
              <p className="text-gray-500 text-xs truncate">{session?.user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-6 flex-shrink-0">
          <div />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <LogOut size={16} />
            Sair
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
