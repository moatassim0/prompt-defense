import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3, SplitSquareHorizontal, FileText, Bug,
  Shield, FlaskConical, Users, MessageSquare, Loader2,
} from 'lucide-react';

import { api, isSuppressedAuth401Error } from './services/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { notify } from './lib/notify';

import { Document, Attack, Defense, ChatMessage } from '../../shared/types';
import type { ChatSession } from './components/ChatInterface';

import LoginPage from './components/LoginPage';
import AppShell from './components/AppShell';
import type { NavSection } from './components/AppShell';
import { pageTransitionProps } from './components/ui/page-transition';
import ChatInterface from './components/ChatInterface';
import DocumentsPage from './components/DocumentsPage';
import AttacksPage from './components/AttacksPage';
import DefensesPage from './components/DefensesPage';
import AnalyticsPage from './components/AnalyticsPage';
import TestingPage from './components/TestingPage';
import TestTracesPage from './components/TestTracesPage';
import Simulator from './components/Simulator';
import UserManagementPage from './components/UserManagementPage';
import { shouldSuppressAuth401Toast } from './lib/auth-toast-suppress';
import { describeApiError, formatDescribedApiError } from './lib/describe-api-error';

type PageView =
  | 'analytics' | 'simulator' | 'documents' | 'attacks'
  | 'defenses' | 'testing' | 'test-traces' | 'users' | 'chat';

/** Human-readable labels used in the breadcrumb. */
const PAGE_LABELS: Record<string, string> = {
  analytics: 'Analytics',
  simulator: 'Simulator',
  documents: 'Documents',
  attacks: 'Attacks',
  defenses: 'Defenses',
  testing: 'Stress Test',
  'test-traces': 'Test Traces',
  users: 'User Management',
  chat: 'Chat',
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString() + Math.random().toString(36).substring(2);
};

const LEGACY_CHAT_SESSIONS_KEY = 'thrax_chat_sessions';
const CHAT_SESSION_TTL_MS = 86400000;

function chatStorageKey(userId: string): string {
  return `thrax_chat_sessions_${userId}`;
}

function pruneStaleChatSessions(sessions: ChatSession[]): ChatSession[] {
  const now = Date.now();
  return sessions.filter((s) => now - s.updatedAt < CHAT_SESSION_TTL_MS);
}

function loadChatSessionsForUser(userId: string): ChatSession[] {
  try {
    let raw = localStorage.getItem(chatStorageKey(userId));
    if (!raw) {
      raw = localStorage.getItem(LEGACY_CHAT_SESSIONS_KEY);
      if (raw) {
        localStorage.setItem(chatStorageKey(userId), raw);
        localStorage.removeItem(LEGACY_CHAT_SESSIONS_KEY);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(parsed)) return [];
    return pruneStaleChatSessions(parsed);
  } catch {
    return [];
  }
}

function saveChatSessionsForUser(userId: string, sessions: ChatSession[]): void {
  try {
    localStorage.setItem(chatStorageKey(userId), JSON.stringify(sessions));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Remove unused empty "New Chat" rows from the top so sign-out does not stack blanks. */
function stripLeadingBlankStarters(sessions: ChatSession[]): ChatSession[] {
  let i = 0;
  while (i < sessions.length) {
    const s = sessions[i];
    const isBlankStarter =
      s.messages.length === 0 && (!s.title || s.title === 'New Chat');
    if (!isBlankStarter) break;
    i += 1;
  }
  return sessions.slice(i);
}

/** Persist a brand-new empty chat first; prior sessions stay below for the next sign-in. */
function prependFreshChatForNextSignIn(userId: string): void {
  let sessions = loadChatSessionsForUser(userId);
  sessions = pruneStaleChatSessions(sessions);
  sessions = stripLeadingBlankStarters(sessions);
  const fresh: ChatSession = {
    id: generateId(),
    title: 'New Chat',
    messages: [],
    updatedAt: Date.now(),
  };
  saveChatSessionsForUser(userId, [fresh, ...sessions]);
}

function ensureStarterChatSession(sessions: ChatSession[]): ChatSession[] {
  const now = Date.now();
  if (sessions.length === 0) {
    return [{ id: generateId(), title: 'New Chat', messages: [], updatedAt: now }];
  }
  const top = sessions[0];
  if (top.messages.length === 0 && (!top.title || top.title === 'New Chat')) {
    return sessions;
  }
  return [{ id: generateId(), title: 'New Chat', messages: [], updatedAt: now }, ...sessions];
}

/** Legacy global key — migrated once into per-user storage when an account has no saved preference yet */
const LEGACY_THEME_STORAGE_KEY = 'theme';

function themeStorageKey(userId: string): string {
  return `thrax_theme_${userId}`;
}

function parseStoredTheme(raw: string | null): 'dark' | 'light' | 'system' | null {
  if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  return null;
}

function loadThemeForUser(userId: string): 'dark' | 'light' | 'system' {
  const stored = parseStoredTheme(localStorage.getItem(themeStorageKey(userId)));
  if (stored) return stored;
  const legacy = parseStoredTheme(localStorage.getItem(LEGACY_THEME_STORAGE_KEY));
  if (legacy) {
    try {
      localStorage.setItem(themeStorageKey(userId), legacy);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return legacy;
  }
  return 'dark';
}

function saveThemeForUser(userId: string, value: 'dark' | 'light' | 'system'): void {
  try {
    localStorage.setItem(themeStorageKey(userId), value);
  } catch {
    /* ignore */
  }
}

const ADMIN_ONLY_PAGES = new Set([
  'analytics',
  'simulator',
  'attacks',
  'defenses',
  'testing',
  'test-traces',
  'users',
]);

const HEALTH_POLL_MS = 5 * 60 * 1000;

/**
 * True when a bootstrap request should fail silently (no toast / no further handling).
 *
 * - `signal?.aborted` — AbortController aborted before the request settled.
 * - `axios.isCancel(error)` — legacy CancelToken-style rejections (compat with older callers).
 * - `error.code === 'ERR_CANCELED'` — Axios when the request was aborted via `AbortSignal`.
 * - `isSuppressedAuth401Error(error)` — tagged rejection from `api.ts` interceptor during intentional sign-out.
 */
function isBootstrapLoadAborted(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (axios.isCancel(error)) return true;
  if (isSuppressedAuth401Error(error)) return true;
  if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') return true;
  return false;
}

// AUTHCHECK: no mock session found — real auth already active

function AppContent() {
  const { user, session, isLoading: authLoading, logout, refetchSession } = useAuth();
  /** AuthProvider maps session → a new `user` object each render; ref avoids bootstrap loops in loadInitialData. */
  const userRef = useRef(user);
  userRef.current = user;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [defenses, setDefenses] = useState<Defense[]>([]);
  const [activeDefenses, setActiveDefenses] = useState<string[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** Chat hydration from localStorage is keyed by user; avoid rendering shell until loaded. */
  const [chatBootstrap, setChatBootstrap] = useState<'idle' | 'ready'>('idle');
  const [dataLoading, setDataLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  /** Hydrated per `user.id`; resets when signed out so the login screen does not leak another account’s preference. */
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  const [currentPage, setCurrentPage] = useState<PageView>(() =>
    user?.role === 'admin' || user?.role === 'super_admin' ? 'analytics' : 'chat',
  );
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const defaultPage: PageView = isAdmin ? 'analytics' : 'chat';
  const effectivePage: PageView = !isAdmin && ADMIN_ONLY_PAGES.has(currentPage)
    ? 'chat'
    : currentPage;

  useEffect(() => {
    if (!user?.id) {
      setChatBootstrap('idle');
      setChatSessions([]);
      setActiveSessionId(null);
      return;
    }
    let list = loadChatSessionsForUser(user.id);
    list = pruneStaleChatSessions(list);
    list = ensureStarterChatSession(list);
    setChatSessions(list);
    setActiveSessionId(list[0].id);
    setChatBootstrap('ready');
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || chatBootstrap !== 'ready') return;
    saveChatSessionsForUser(user.id, chatSessions);
  }, [chatSessions, user?.id, chatBootstrap]);

  useEffect(() => {
    if (chatBootstrap !== 'ready') return;
    const pruneExpiredChats = () => {
      setChatSessions((prev) => {
        const now = Date.now();
        const valid = prev.filter(s => now - s.updatedAt < 86400000); // 24 hours
        
        if (valid.length === prev.length) return prev; // no change
        
        if (valid.length === 0) {
          const newSession = { id: generateId(), title: 'New Chat', messages: [], updatedAt: Date.now() };
          setActiveSessionId(newSession.id);
          return [newSession];
        }

        if (!valid.find(s => s.id === activeSessionId)) {
          setActiveSessionId(valid[0].id);
        }
        
        return valid;
      });
    };

    const intervalId = setInterval(pruneExpiredChats, 60000); // check every minute
    return () => clearInterval(intervalId);
  }, [activeSessionId, chatBootstrap]);

  const activeSession =
    chatSessions.find((s) => s.id === activeSessionId) || chatSessions[0] || null;
  const messages = activeSession?.messages || [];

  // --- Effects ---

  // Keep stress-test document IDs in sync with the server when opening the page (in-memory store).
  useEffect(() => {
    if (!user || effectivePage !== 'testing') return;
    if (user.role !== 'admin' && user.role !== 'super_admin') return;
    api.getDocuments().then((d) => setDocuments(d.documents)).catch(() => {});
  }, [effectivePage, user?.id, user?.role]);

  useEffect(() => {
    if (!user) return;
    document.title = 'THRAX';
  }, [effectivePage, user?.id, user?.role]);

  useLayoutEffect(() => {
    if (!user?.id) {
      setTheme('dark');
      document.documentElement.classList.toggle('dark', true);
      return;
    }
    setTheme(loadThemeForUser(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const existing = parseStoredTheme(localStorage.getItem(themeStorageKey(user.id)));
    if (existing === theme) return;
    saveThemeForUser(user.id, theme);
  }, [theme, user?.id]);

  // --- Data loading ---

  const handleBootstrapError = useCallback((error: unknown) => {
    if (axios.isCancel(error)) return;
    if (shouldSuppressAuth401Toast()) return;
    if (isSuppressedAuth401Error(error)) return;
    const d = describeApiError(error);
    if (d.title === 'Signing out…') return;
    notify.error(d.title, d.detail);
  }, []);

  const applyHealthStatus = useCallback((health: Awaited<ReturnType<typeof api.checkHealth>>) => {
    setHealthStatus(health);
    setIsConnected(health.llmConfigured);
  }, []);

  const refreshHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      const health = await api.checkHealth({ signal });
      if (signal?.aborted) return;
      applyHealthStatus(health);
    } catch {
      /* background poll — ignore transient failures */
    }
  }, [applyHealthStatus]);

  const loadInitialData = useCallback(async (signal?: AbortSignal) => {
    const u = userRef.current;
    const isAdminUsr = u?.role === 'admin' || u?.role === 'super_admin';

    try {
      const [health, docsData] = await Promise.all([
        api.checkHealth({ signal }),
        api.getDocuments({ signal }),
      ]);

      if (signal?.aborted) return;
      applyHealthStatus(health);
      setDocuments(docsData.documents);
    } catch (error) {
      if (isBootstrapLoadAborted(error, signal)) return;
      handleBootstrapError(error);
      return;
    }

    if (!isAdminUsr) {
      setAttacks([]);
      setDefenses([]);
      setActiveDefenses([]);
      return;
    }

    if (signal?.aborted) return;

    try {
      const [attacksData, defensesData] = await Promise.all([
        api.getAttacks({ signal }),
        api.getDefenses({ signal }),
      ]);
      if (signal?.aborted) return;
      setAttacks(attacksData);
      setDefenses(defensesData);
      setActiveDefenses(defensesData.filter((d: Defense) => d.enabled).map((d: Defense) => d.id));
    } catch (error) {
      if (isBootstrapLoadAborted(error, signal)) return;
      handleBootstrapError(error);
    }
  }, [handleBootstrapError, applyHealthStatus]); // `user.role` via userRef — AuthProvider recreates `user` each render; ref tracks latest without churning this callback.

  useEffect(() => {
    if (!user) return;

    const ac = new AbortController();
    const poll = () => void refreshHealth(ac.signal);
    const interval = window.setInterval(poll, HEALTH_POLL_MS);
    const onFocus = () => { void refreshHealth(); };
    window.addEventListener('focus', onFocus);

    return () => {
      ac.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, refreshHealth]);

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      setAttacks([]);
      setDefenses([]);
      setActiveDefenses([]);
      setDataLoading(false);
      return;
    }

    setDocuments([]);
    setCurrentPage(user.role === 'admin' || user.role === 'super_admin' ? 'analytics' : 'chat');
    const ac = new AbortController();
    setDataLoading(true);
    void loadInitialData(ac.signal).finally(() => {
      if (!ac.signal.aborted) setDataLoading(false);
    });
    return () => ac.abort();
  }, [user?.id, user?.role, loadInitialData]);

  // --- Handlers ---

  const handleUploadDocument = async (file: File) => {
    try {
      const result = await api.uploadDocument(file, false);
      setDocuments((prev) => {
        // Only add if not already exists
        if (!prev.find(d => d.id === result.document.id)) {
          return [...prev, result.document];
        }
        return prev;
      });
      
      // Associate with current active chat session
      setChatSessions((prev) => prev.map(s => {
        if (s.id === activeSessionId) {
          const currentDocIds = s.documentIds || [];
          if (!currentDocIds.includes(result.document.id)) {
            return { ...s, documentIds: [...currentDocIds, result.document.id], updatedAt: Date.now() };
          }
        }
        return s;
      }));

      notify.success(
        'Document uploaded and attached to current chat',
        'Untrusted source: uploaded .txt files are treated as potentially malicious and excluded from Simulator clean baselines.',
      );
      if (result.scanResult?.isPoisonSuspect) {
        notify.warn(
          'Heuristic scan flagged possible injection patterns',
          result.scanResult.indicators.slice(0, 4).join(' · '),
        );
      }
    } catch {
      notify.error('Upload failed. Check the file and try again.');
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      notify.error('Could not delete document — please try again.');
    }
  };

  const handleRefreshDocuments = useCallback(async () => {
    const data = await api.getDocuments();
    setDocuments(data.documents);
  }, []);

  const handleToggleDocumentInChat = useCallback((docId: string) => {
    setChatSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      const current = s.documentIds || [];
      const next = current.includes(docId)
        ? current.filter(id => id !== docId)
        : [...current, docId];
      return { ...s, documentIds: next, updatedAt: Date.now() };
    }));
  }, [activeSessionId]);

  const handleCreateAttack = async (data: {
    name: string;
    description: string;
    injectionText: string;
    category: string;
    tier: string;
    howItWorks?: string;
    mechanism?: string;
    impact?: string;
    example?: string;
  }) => {
    try {
      const attack = await api.createAttack(data);
      setAttacks((prev) => [...prev, attack]);
      notify.success(`Attack "${attack.name}" created`);
    } catch {
      notify.error('Failed to create attack.');
      throw new Error('Failed');
    }
  };

  const handleDeleteAttack = async (attackId: string) => {
    try {
      await api.deleteAttack(attackId);
      setAttacks((prev) => prev.filter((a) => a.id !== attackId));
      notify.info('Attack deleted');
    } catch {
      notify.error('Failed to delete attack. Built-in attacks cannot be deleted.');
    }
  };

  const handleToggleDefense = async (defenseId: string) => {
    try {
      const updatedDefense = await api.toggleDefense(defenseId);
      setDefenses((prev) =>
        prev.map((d) => (d.id === defenseId ? updatedDefense : d)),
      );
      setActiveDefenses((prev) =>
        updatedDefense.enabled
          ? [...prev.filter((id) => id !== defenseId), defenseId]
          : prev.filter((id) => id !== defenseId),
      );
      notify.info(`${updatedDefense.name} ${updatedDefense.enabled ? 'enabled' : 'disabled'}`);
    } catch {
      notify.error('Failed to toggle defense.');
    }
  };

  const handleSendMessage = async (prompt: string) => {
    if (!prompt.trim()) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    
    setChatSessions((prev) => prev.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() };
      }
      return s;
    }));

    try {
      // Use documents attached to this chat, or default to empty if none.
      // We also filter by `documents` in state to ensure they haven't been deleted globally.
      const currentChatDocIds = chatSessions.find(s => s.id === activeSessionId)?.documentIds || [];
      const activeDocumentIds = documents.filter(d => currentChatDocIds.includes(d.id)).map(d => d.id);

      const response = await api.query({
        prompt,
        documentIds: activeDocumentIds,
        activeDefenses,
      });
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        defenseState: response.defenseState,
      };
      
      setChatSessions((prev) => prev.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, messages: [...s.messages, assistantMsg], updatedAt: Date.now() };
        }
        return s;
      }));
    } catch (error) {
      const d = describeApiError(error);
      if (d.title === 'Cancelled' || d.title === 'Signing out…') {
        return;
      }
      notify.error(d.title, d.detail);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Could not reach the assistant.\n\n${formatDescribedApiError(d)}`,
        timestamp: new Date(),
      };

      setChatSessions((prev) => prev.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, messages: [...s.messages, errorMsg], updatedAt: Date.now() };
        }
        return s;
      }));
    }
  };

  const handleNavigate = useCallback((pageId: string) => {
    const requested = pageId as PageView;
    if (!isAdmin && ADMIN_ONLY_PAGES.has(requested)) {
      setCurrentPage('chat');
      return;
    }
    setCurrentPage(requested);
  }, [isAdmin]);

  const handleLogout = () => {
    if (user?.id) {
      prependFreshChatForNextSignIn(user.id);
    }
    logout();
    notify.info('You have been signed out.');
  };

  // --- Auth loading ---

  if (authLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background">
        <span role="status" aria-label="Loading application">
          <span className="sr-only">Loading…</span>
          <Loader2 size={32} className="animate-spin text-primary" aria-hidden="true" />
        </span>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (chatBootstrap !== 'ready' || !activeSessionId) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background">
        <span role="status" aria-label="Loading chats">
          <span className="sr-only">Loading chats…</span>
          <Loader2 size={32} className="animate-spin text-primary" aria-hidden="true" />
        </span>
      </div>
    );
  }

  // --- Nav sections ---

  const adminSections: NavSection[] = [
    {
      label: 'OVERVIEW',
      items: [
        { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" /> },
      ],
    },
    {
      label: 'LAB',
      items: [
        { id: 'simulator', label: 'Simulator', icon: <SplitSquareHorizontal className="h-5 w-5" /> },
        { id: 'defenses', label: 'Defenses', icon: <Shield className="h-5 w-5" />, badge: activeDefenses.length || null },
        { id: 'attacks', label: 'Attacks', icon: <Bug className="h-5 w-5" /> },
        { id: 'documents', label: 'Documents', icon: <FileText className="h-5 w-5" />, badge: documents.length || null },
      ],
    },
    {
      label: 'RESEARCH',
      items: [
        { id: 'testing', label: 'Stress Test', icon: <FlaskConical className="h-5 w-5" /> },
        { id: 'test-traces', label: 'Test Traces', icon: <FileText className="h-5 w-5" /> },
      ],
    },
    {
      label: 'ADMIN',
      labelColor: user.role === 'super_admin' ? '#f59e0b' : '#8b5cf6',
      items: [
        { id: 'users', label: 'Users', icon: <Users className="h-5 w-5" /> },
      ],
    },
  ];

  const userSections: NavSection[] = [
    {
      items: [
        { id: 'chat', label: 'Chat', icon: <MessageSquare className="h-5 w-5" />, badge: messages.length || null },
        { id: 'documents', label: 'Documents', icon: <FileText className="h-5 w-5" />, badge: documents.length || null },
      ],
    },
  ];

  const sections = isAdmin ? adminSections : userSections;

  const renderPage = () => {
    switch (effectivePage) {
      case 'analytics':
        return <AnalyticsPage />;
      case 'simulator':
        return (
          <Simulator attacks={attacks} defenses={defenses} documents={documents} />
        );
      case 'chat':
        return (
          <ChatInterface
            messages={messages}
            sessionTitle={activeSession?.title}
            documents={documents}
            activeDocumentIds={(activeSession?.documentIds || []).filter(id => documents.some(d => d.id === id))}
            activeDocumentCount={(activeSession?.documentIds || []).filter(id => documents.some(d => d.id === id)).length}
            chatMode={isAdmin ? 'lab' : 'participant'}
            onSendMessage={(prompt) => {
              handleSendMessage(prompt);
              setChatSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                  let newTitle = s.title;
                  if (!s.title || s.title === 'New Chat') {
                    newTitle = prompt.substring(0, 30);
                    if (prompt.length > 30) newTitle += '...';
                  }
                  return { ...s, title: newTitle, updatedAt: Date.now() };
                }
                return s;
              }));
            }}
            onUploadDocument={handleUploadDocument}
            onToggleDocument={handleToggleDocumentInChat}
          />
        );
      case 'documents':
        return (
          <DocumentsPage
            documents={documents}
            isLoading={dataLoading}
            variant={isAdmin ? 'lab' : 'participant'}
            onUpload={handleUploadDocument}
            onDelete={handleDeleteDocument}
            onRefresh={handleRefreshDocuments}
            onAttachToChat={handleToggleDocumentInChat}
          />
        );
      case 'attacks':
        return (
          <AttacksPage
            attacks={attacks}
            isLoading={dataLoading}
            onCreateAttack={handleCreateAttack}
            onDeleteAttack={handleDeleteAttack}
          />
        );
      case 'defenses':
        return (
          <DefensesPage
            defenses={defenses}
            activeDefenses={activeDefenses}
            isLoading={dataLoading}
            onToggle={handleToggleDefense}
          />
        );
      case 'testing':
        return <TestingPage documents={documents} />;
      case 'test-traces':
        return <TestTracesPage />;
      case 'users':
        return <UserManagementPage />;
      default:
        return (
          <div className="flex items-center justify-center min-h-[300px]">
            <p className="text-muted-foreground text-sm">Page not found.</p>
          </div>
        );
    }
  };

  return (
    <AppShell
      user={user}
      session={session}
      sections={sections}
      activePage={effectivePage || defaultPage}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
      onRefreshSession={refetchSession}
      isConnected={isConnected}
      healthStatus={healthStatus}
      theme={theme}
      setTheme={setTheme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      currentPageLabel={PAGE_LABELS[effectivePage] ?? 'THRAX'}
      chatSessions={chatSessions}
      activeSessionId={activeSessionId}
      onSelectSession={setActiveSessionId}
      onCreateSession={() => {
        const newSession = { id: generateId(), title: 'New Chat', messages: [], updatedAt: Date.now() };
        setChatSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
      }}
      onDeleteSession={(id) => {
        setChatSessions(prev => {
          const filtered = prev.filter(s => s.id !== id);
          if (filtered.length === 0) {
            const newSession = { id: generateId(), title: 'New Chat', messages: [], updatedAt: Date.now() };
            setActiveSessionId(newSession.id);
            return [newSession];
          }
          if (activeSessionId === id) setActiveSessionId(filtered[0].id);
          return filtered;
        });
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div key={effectivePage} {...pageTransitionProps}>
          {renderPage()}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
