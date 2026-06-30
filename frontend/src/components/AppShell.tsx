import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, LogOut,
  Sun, Moon, Trash2, Plus, Clock, MessageSquare, HelpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppSession } from '@/lib/auth-client';
import type { ChatSession } from './ChatInterface';
import ConfirmModal from './ConfirmModal';
import BottomNav from './BottomNav';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SessionFlyout } from '@/components/ui/session-flyout';
import { AccountSettingsModal } from './ui/account-settings-modal';
import { PreferencesModal } from './ui/preferences-modal';
import { ApiKeysModal } from './ui/api-keys-modal';
import HelpPanel from './HelpPanel';
import { motion, AnimatePresence } from 'motion/react';

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
  session: AppSession | null;
  sections: NavSection[];
  activePage: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  onRefreshSession?: () => void | Promise<void>;
  isConnected?: boolean;
  healthStatus?: any;
  theme: 'dark' | 'light' | 'system';
  setTheme?: (theme: 'dark' | 'light' | 'system') => void;
  onToggleTheme: () => void;
  children: React.ReactNode;
  /** Human-readable label for the currently active page — used in the breadcrumb. */
  currentPageLabel?: string;
  chatSessions?: ChatSession[];
  activeSessionId?: string;
  onSelectSession?: (id: string) => void;
  onCreateSession?: () => void;
  onDeleteSession?: (id: string) => void;
}

function ChatCountdown({ updatedAt }: { updatedAt: number }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const diff = (updatedAt + 86400000) - now;
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${hours}h ${minutes}m left`);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 60000); // update every minute
    return () => clearInterval(interval);
  }, [updatedAt]);

  return <span>{timeLeft}</span>;
}

const AppShell: React.FC<AppShellProps> = ({
  user, session, sections, activePage, onNavigate, onLogout, onRefreshSession,
  isConnected, healthStatus, theme, setTheme, onToggleTheme, children,
  currentPageLabel, chatSessions, activeSessionId, onSelectSession, onCreateSession, onDeleteSession
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('thrax_sidebar_collapsed');
      return JSON.parse(raw ?? 'false') === true;
    } catch {
      return false;
    }
  });
  const [logoutOpen, setLogoutOpen] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!userMenuOpen || !onRefreshSession) return;
    void onRefreshSession();
  }, [userMenuOpen, onRefreshSession]);

  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('thrax_sidebar_collapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  const llmState = isConnected ? 'configured' : (healthStatus ? 'not-configured' : 'unknown');

  const handleSignOut = () => {
    setLogoutOpen(true);
  };

  return (
    <>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen overflow-hidden',
          'sticky top-0 shrink-0 z-30',
          'bg-[hsl(var(--sidebar-background))] border-r border-[hsl(var(--sidebar-border))]',
          'transition-all duration-300 ease-in-out',
          collapsed ? 'w-[80px]' : 'w-[260px]',
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div
          className={cn(
            'shrink-0 h-14 flex items-center border-b border-[hsl(var(--sidebar-border))] gap-2 min-h-[56px]',
            collapsed ? 'justify-center px-0' : 'px-4',
          )}
        >
          <img src="/logo-rami.png" alt="Logo" className="h-10 w-auto shrink-0 object-contain" />
          <span
            className={cn(
              'text-white font-black tracking-widest text-lg uppercase whitespace-nowrap overflow-hidden transition-all duration-300 mt-1',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] opacity-100',
            )}
          >
            THRAX
          </span>
        </div>

        <nav className="flex-1 min-h-0 py-2 overflow-y-auto overflow-x-hidden scrollbar-thin flex flex-col">
          <div className="shrink-0">
            {sections.map((section, si) => (
              <div key={si}>
                {section.label && (
                  <span
                    className={cn(
                      'block px-4 text-[10px] font-semibold tracking-widest uppercase text-[hsl(var(--sidebar-muted))] pt-3 pb-1',
                      collapsed && 'invisible h-0 overflow-hidden py-0 pt-0 pb-0',
                    )}
                    style={!collapsed && section.labelColor ? { color: section.labelColor } : undefined}
                  >
                    {section.label}
                  </span>
                )}
                {section.items.map((item) => {
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 w-full px-4 py-2.5 rounded-none',
                        'text-sm font-medium transition-all duration-200',
                        'hover:bg-white/5 hover:text-white',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-primary))] border-l-[3px] border-[hsl(var(--sidebar-primary))]'
                          : 'text-[hsl(var(--sidebar-muted))] border-l-[3px] border-transparent',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex shrink-0 transition-transform duration-200',
                          'group-hover:scale-110',
                          active && 'text-[hsl(var(--sidebar-primary))]',
                        )}
                      >
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <span className="truncate transition-all duration-300 flex-1 text-left">
                          {item.label}
                        </span>
                      )}
                      {!collapsed && item.badge != null && item.badge > 0 && (
                        <motion.span
                          key={item.badge}
                          initial={{ scale: 1 }}
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                          className="bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] text-[0.7rem] font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center shrink-0"
                        >
                          {item.badge}
                        </motion.span>
                      )}
                      {collapsed && (
                        <span className="absolute left-full ml-2 z-50 hidden group-hover:flex items-center px-2 py-1 text-xs font-medium text-white bg-black/80 rounded whitespace-nowrap pointer-events-none">
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {activePage === 'chat' && chatSessions && (
            <div className={cn("mt-6 px-3 shrink-0 pb-4", collapsed && "px-2")}>
              
              {/* Prominent New Chat Button */}
              <button 
                onClick={onCreateSession}
                className={cn(
                  "w-full flex items-center justify-center gap-2 mb-6 p-2 rounded-lg bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] hover:opacity-90 transition-all font-medium text-sm shadow-sm",
                  collapsed && "p-2 w-10 h-10 mx-auto"
                )}
                title="New Chat"
              >
                <Plus size={16} />
                {!collapsed && <span>New Chat</span>}
              </button>

              <div className={cn("flex items-center justify-between mb-2 px-1", collapsed && "justify-center")}>
                {!collapsed && <h3 className="text-[10px] font-semibold tracking-widest uppercase text-[hsl(var(--sidebar-muted))]">Chat History</h3>}
              </div>
              <div className={cn("space-y-1", collapsed && "flex flex-col items-center")}>
                {chatSessions.map(session => (
                  <div 
                    key={session.id}
                    className={cn(
                      "group relative flex flex-col rounded-lg cursor-pointer transition-all",
                      collapsed ? "p-2 w-10 h-10 items-center justify-center" : "p-2.5",
                      activeSessionId === session.id 
                        ? "bg-[hsl(var(--sidebar-active-bg))] border-l-[3px] border-[hsl(var(--sidebar-primary))]" 
                        : "hover:bg-white/5 border-l-[3px] border-transparent"
                    )}
                    onClick={() => onSelectSession?.(session.id)}
                  >
                    {collapsed ? (
                      <>
                        <MessageSquare size={16} className={activeSessionId === session.id ? "text-[hsl(var(--sidebar-primary))]" : "text-[hsl(var(--sidebar-muted))]"} />
                        <span className="absolute left-full ml-2 z-50 hidden group-hover:flex items-center px-2 py-1 text-xs font-medium text-white bg-black/80 rounded whitespace-nowrap pointer-events-none">
                          {session.title || "New Chat"}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn(
                            "text-xs truncate font-medium flex-1",
                            activeSessionId === session.id ? "text-white" : "text-[hsl(var(--sidebar-muted))]"
                          )}>
                            {session.title || "New Chat"}
                          </span>
                          {chatSessions.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteSession?.(session.id); }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-[hsl(var(--sidebar-muted))] hover:text-destructive transition-all"
                              title="Delete Chat"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-[9px] text-[hsl(var(--sidebar-muted))] opacity-70">
                          <Clock size={9} />
                          <ChatCountdown updatedAt={session.updatedAt} />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="shrink-0 mt-auto border-t border-[hsl(var(--sidebar-border))] py-2">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'group flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[hsl(var(--sidebar-muted))] hover:bg-white/5 hover:text-white transition-all duration-200',
              collapsed && 'justify-center px-0',
            )}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 shrink-0 group-hover:scale-110 transition-transform duration-200" />
            ) : (
              <Moon className="h-5 w-5 shrink-0 group-hover:scale-110 transition-transform duration-200" />
            )}
            {!collapsed && <span>Theme</span>}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className={cn(
              'group flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[hsl(var(--sidebar-muted))] hover:bg-white/5 hover:text-white transition-all duration-200',
              collapsed && 'justify-center px-0',
            )}
          >
            <LogOut className="h-5 w-5 shrink-0 group-hover:scale-110 transition-transform duration-200" />
            {!collapsed && <span>Sign Out</span>}
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'group flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[hsl(var(--sidebar-muted))] hover:bg-white/5 hover:text-white transition-all duration-200',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5 shrink-0 mx-auto" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5 shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-y-auto overflow-x-hidden">
        <header className="sticky top-0 z-20 shrink-0 h-14 flex items-center px-4 md:px-6 border-b border-border bg-card gap-4">
          <div className="flex flex-col gap-0.5 min-w-0 mr-auto">
            {currentPageLabel && (
              <h1 className="text-lg font-semibold text-foreground truncate leading-tight">
                {currentPageLabel}
              </h1>
            )}
            {currentPageLabel && (
              <Breadcrumb className="hidden md:flex">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <span className="text-sm text-muted-foreground">THRAX</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={activePage}
                          initial={{ opacity: 0, x: 6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -6 }}
                          transition={{ duration: 0.15 }}
                          className="inline-block text-sm text-muted-foreground"
                        >
                          {currentPageLabel}
                        </motion.span>
                      </AnimatePresence>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setIsHelpOpen(true)}
                    aria-label="Open help guide"
                    className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  <p>How to use this page</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {isAdmin && (
              <div className="flex items-center text-xs font-medium cursor-default">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <AnimatePresence mode="wait">
                          {llmState === 'configured' && (
                            <motion.div
                              key="configured"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="flex items-center gap-1.5 text-safe"
                            >
                              <div className="w-[6px] h-[6px] rounded-full bg-safe animate-pulse-slow" />
                              <span className="hidden sm:inline">LLM configured</span>
                            </motion.div>
                          )}
                          {llmState === 'not-configured' && (
                            <motion.div
                              key="not-configured"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="flex items-center gap-1.5 text-threat"
                            >
                              <div className="w-[6px] h-[6px] rounded-full bg-threat animate-pulse" />
                              <span className="hidden sm:inline">LLM not configured</span>
                            </motion.div>
                          )}
                          {llmState === 'unknown' && (
                            <motion.div
                              key="unknown"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="flex items-center gap-1.5 text-warn"
                            >
                              <div className="w-[6px] h-[6px] rounded-full bg-warn animate-pulse" />
                              <span className="hidden sm:inline">Connecting...</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {healthStatus ? (
                        <p>
                          Model: {healthStatus.model || 'Unknown'} &middot;{' '}
                          {isConnected ? 'API key set' : 'API key missing'} &middot; Last checked:{' '}
                          {new Date(healthStatus.timestamp).toLocaleTimeString()}
                        </p>
                      ) : (
                        <p>Checking LLM configuration...</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            <Popover open={userMenuOpen} onOpenChange={setUserMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="rounded-full ring-2 ring-transparent hover:ring-[hsl(var(--sidebar-primary)/0.5)] transition-all duration-200"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session?.user?.image ?? undefined} alt="" />
                    <AvatarFallback className="bg-[hsl(var(--sidebar-primary))] text-sm font-bold text-white">
                      {(session?.user?.name ?? session?.user?.email ?? user.email ?? 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <SessionFlyout 
                  session={session}
                  isOpen={userMenuOpen}
                  onSignOut={handleSignOut}
                  onOpenAccountSettings={() => {
                    setUserMenuOpen(false);
                    setIsAccountSettingsOpen(true);
                  }}
                  onOpenPreferences={() => {
                    setUserMenuOpen(false);
                    setIsPreferencesOpen(true);
                  }}
                  onOpenApiKeys={() => {
                    setUserMenuOpen(false);
                    setIsApiKeysOpen(true);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <main className="flex-1 p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>
      </div>

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

      <AccountSettingsModal isOpen={isAccountSettingsOpen} onClose={() => setIsAccountSettingsOpen(false)} />
      <PreferencesModal isOpen={isPreferencesOpen} onClose={() => setIsPreferencesOpen(false)} theme={theme} setTheme={setTheme!} />
      <ApiKeysModal isOpen={isApiKeysOpen} onClose={() => setIsApiKeysOpen(false)} />
      <HelpPanel
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        activePage={activePage}
        userRole={user.role}
      />
    </>
  );
};

export default AppShell;
