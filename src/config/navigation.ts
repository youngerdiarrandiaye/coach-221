import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CreditCard,
  TrendingUp,
  BarChart3,
  Download,
} from 'lucide-react'

export const navItems = [
  { href: '/dashboard',  label: 'Accueil',        icon: LayoutDashboard },
  { href: '/clients',    label: 'Clients',         icon: Users           },
  { href: '/sessions',   label: 'Séances',         icon: CalendarDays    },
  { href: '/payments',   label: 'Paiements',       icon: CreditCard      },
  { href: '/stats',      label: 'Statistiques',    icon: BarChart3       },
  { href: '/progress',   label: 'Progression',     icon: TrendingUp      },
  { href: '/export',     label: 'Export',          icon: Download        },
] as const

export type NavItem = typeof navItems[number]
