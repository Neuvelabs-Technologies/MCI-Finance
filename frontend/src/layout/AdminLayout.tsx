import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Building2,
  ChevronsUpDown,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { MciBrand, MciLogo } from '@/components/common/MciLogo';
import { Button } from '@/components/ui/button';
import { DialogTitle, Sheet, SheetContent } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu';
import { useAdmin } from '@/context/AdminContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const MAIN: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/entities', label: 'Our entities', icon: Building2 },
  { to: '/admin/activity', label: 'Activity', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

const FOOTER: NavItem[] = [{ to: '/admin/guide', label: 'Guide', icon: BookOpen }];

const navItemClass =
  'flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[0.9375rem] font-medium text-foreground transition-colors hover:bg-muted';
const navItemActive = 'bg-primary-soft font-bold text-primary-soft-foreground hover:bg-primary-soft';

function SideLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => cn(navItemClass, isActive && navItemActive)}>
      {({ isActive }) => (
        <>
          <Icon size={20} aria-hidden strokeWidth={isActive ? 2.2 : 1.8} />
          <span className="flex-1 truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function UserMenu({ compact = false }: { compact?: boolean }) {
  const { admin, signOut, version } = useAdmin();
  const { isDark, toggleTheme } = useTheme();
  const name = admin.name || admin.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn('flex items-center gap-3 rounded-xl text-left transition-colors hover:bg-muted', compact ? 'p-1' : 'w-full px-2 py-2')}
          aria-label="Your account"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-foreground">
            {initials(name)}
          </span>
          {compact ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-bold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">Finance admin</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : 'top'} className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-bold text-foreground">{name}</span>
          <span className="truncate text-xs font-normal">{admin.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggleTheme}>
          {isDark ? <Sun /> : <Moon />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/settings?tab=users">
            <Settings />
            Users and password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuLabel className="pt-1 text-[11px] font-normal">Version {version}</DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Main">
      <Link to="/admin" onClick={onNavigate} className="rounded-xl px-2 py-1">
        <MciBrand title="MCI e-Invoicing" subtitle="Finance · UAE" />
      </Link>
      <div className="flex flex-col gap-1">
        {MAIN.map((item) => (
          <SideLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-1">
        {FOOTER.map((item) => (
          <SideLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
        <div className="mt-2 border-t border-border pt-3">
          <UserMenu />
        </div>
      </div>
    </nav>
  );
}

/** Shown on every page while sample customers are loaded, so nobody mistakes them for real data. */
function DemoBanner() {
  const { demo } = useAdmin();
  if (!demo.count) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/25 bg-warning-soft px-4 py-2 text-sm text-foreground md:px-8">
      <FlaskConical size={16} className="shrink-0 text-warning" aria-hidden />
      <span>
        <b>Demo data is loaded</b> — {demo.count} sample customers marked <span className="font-mono text-xs">DEMO-</span>. They are never emailed.
      </span>
      <Link to="/admin/settings?tab=system" className="font-semibold text-warning underline-offset-2 hover:underline">
        Remove before go-live
      </Link>
    </div>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:block">
        <Sidebar />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <Link to="/admin" className="flex items-center gap-2 font-extrabold">
            <MciLogo size="xs" />
            MCI e-Invoicing
          </Link>
          <div className="ml-auto">
            <UserMenu compact />
          </div>
        </header>
        <DemoBanner />
        <main className="flex-1 overflow-y-auto" id="main-content" tabIndex={-1}>
          <div className="page-enter mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8" key={pathname}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
