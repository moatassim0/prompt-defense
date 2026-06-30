import React, { useState } from 'react';
import {
  ChevronLeft, ChevronRight, LogOut, Wifi, WifiOff,
  Sun, Moon, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ConfirmModal from './ConfirmModal';
import BottomNav from './BottomNav';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | null;
}

export interface NavSection {
  label?: string;
  labelColor?: string;
  items: NavItem[];
}

interface AppShellProps {
  user: { id: string; email: string; role: 'super_admin' | 'admin' | 'user' };
  sections: NavSection[];
  activePage: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  isConnected?: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({
  user, sections, activePage, onNavigate, onLogout,
  isConnected, theme, onToggleTheme, children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const isSuperAdmin = user.role === 'super_admin';
  const initial = (user.email?.[0] || '?').toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-card transition-all duration-200 flex-shrink-0',
          collapsed ? 'w-[72px]' : 'w-[240px]',
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="h-14 flex items-center border-b border-border gap-2.5 px-4">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center flex-shrink-0">
            <Shield size={16} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-foreground font-semibold text-sm whitespace-nowrap">
              Defense Lab
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {sections.map((section, si) => (
            <div key={si}>
              {section.label && !collapsed && (
                <div
                  className="text-[0.7rem] tracking-wider uppercase font-semibold px-4 pt-3 pb-1"
                  style={{ color: section.labelColor || undefined }}
                >
                  {!section.labelColor && (
                    <span className="text-muted-foreground">{section.label}</span>
                  )}
                  {section.labelColor && section.label}
                </div>
              )}
              {section.items.map((item) => {
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 text-sm transition-all duration-150 border-l-[3px]',
                      collapsed ? 'justify-center px-0 py-2.5' : 'px-4 py-2.5 justify-start',
                      active
                        ? 'border-l-primary bg-accent text-primary font-semibold'
                        : 'border-l-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className="flex-shrink-0 flex">{item.icon}</span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                          <span className="bg-primary text-primary-foreground text-[0.7rem] font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'h-10 flex items-center border-t border-border text-muted-foreground hover:text-foreground transition-colors',
            collapsed ? 'justify-center' : 'justify-end px-4',
          )}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center justify-end px-4 md:px-6 border-b border-border bg-card gap-3">
          {isAdmin && (
            <div className="flex items-center gap-1.5 mr-auto text-xs font-medium">
              {isConnected ? (
                <>
                  <Wifi size={14} className="text-green-500" />
                  <span className="text-green-500">LLM Connected</span>
                </>
              ) : (
                <>
                  <WifiOff size={14} className="text-destructive" />
                  <span className="text-destructive">LLM Offline</span>
                </>
              )}
            </div>
          )}

          <button
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {isAdmin && (
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.7rem] font-semibold border',
              isSuperAdmin
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-purple-500/10 text-purple-400 border-purple-500/20',
            )}>
              {isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}
            </span>
          )}

          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
              isAdmin ? 'bg-purple-500/10 text-purple-400' : 'bg-teal-500/10 text-teal-400',
            )}
          >
            {initial}
          </div>

          <button
            onClick={() => setLogoutOpen(true)}
            aria-label="Sign out"
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <LogOut size={16} />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 pb-24 md:p-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav sections={sections} activePage={activePage} onNavigate={onNavigate} />

      <ConfirmModal
        isOpen={logoutOpen}
        title="Sign out?"
        message="You will be returned to the login screen."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        variant="primary"
        onConfirm={() => { setLogoutOpen(false); onLogout(); }}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
};

export default AppShell;
