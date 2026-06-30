import { useState, useEffect } from 'react';
import {
  BarChart3, SplitSquareHorizontal, FileText, Zap,
  Shield, FlaskConical, Users, MessageSquare, Loader2,
  GitCompare,
} from 'lucide-react';

import { api } from './services/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './components/Toast';

import { Document, Attack, Defense, ChatMessage } from '../../shared/types';

import LoginPage from './components/LoginPage';
import AppShell from './components/AppShell';
import type { NavSection } from './components/AppShell';
import PageTransition from './components/PageTransition';
import ChatInterface from './components/ChatInterface';
import DocumentsPage from './components/DocumentsPage';
import AttacksPage from './components/AttacksPage';
import DefensesPage from './components/DefensesPage';
import ComparisonView from './components/ComparisonView';
import AnalyticsPage from './components/AnalyticsPage';
import LLMComparisonPage from './components/LLMComparisonPage';
import TestingPage from './components/TestingPage';
import TestTracesPage from './components/TestTracesPage';
import ComparisonSimulator from './components/ComparisonSimulator';
import UserManagementPage from './components/UserManagementPage';

type PageView =
  | 'analytics' | 'simulator' | 'documents' | 'attacks'
  | 'defenses' | 'testing' | 'test-traces' | 'users' | 'compare'
  | 'llm-compare' | 'chat';

function AppContent() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { toast } = useToast();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [defenses, setDefenses] = useState<Defense[]>([]);
  const [activeDefenses, setActiveDefenses] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  );
  const [comparisonMessages, setComparisonMessages] = useState<{
    before: ChatMessage | null;
    after: ChatMessage | null;
  }>({ before: null, after: null });
  const [currentPage, setCurrentPage] = useState<PageView>(() =>
    user?.role === 'admin' || user?.role === 'super_admin' ? 'analytics' : 'chat',
  );

  // --- Effects ---

  useEffect(() => {
    if (user) {
      setCurrentPage(user.role === 'admin' || user.role === 'super_admin' ? 'analytics' : 'chat');
      loadInitialData();
    }
  }, [user]);

  // Keep stress-test document IDs in sync with the server when opening the page (in-memory store).
  useEffect(() => {
    if (!user || currentPage !== 'testing') return;
    if (user.role !== 'admin' && user.role !== 'super_admin') return;
    api.getDocuments().then((d) => setDocuments(d.documents)).catch(() => {});
  }, [currentPage, user]);

  useEffect(() => {
    if (!user) return;
    const titles: Record<string, string> = {
      analytics: 'Analytics Dashboard',
      simulator: 'Attack Simulator',
      documents: 'Document Management',
      attacks: 'Attack Library',
      defenses: 'Defense Mechanisms',
      'llm-compare': 'AI Comparison',
      testing: 'Stress Test',
      'test-traces': 'Test Traces',
      users: 'User Management',
      compare: 'Response Comparison',
      chat: 'Chat Interface',
    };
    document.title = `${titles[currentPage] ?? 'Lab'} — Prompt Injection Defense Lab`;
  }, [currentPage, user]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // --- Data loading ---

  const loadInitialData = async () => {
    try {
      const isAdminUsr = user?.role === 'admin' || user?.role === 'super_admin';
      
      const [health, docsData, attacksData, defensesData] = await Promise.all([
        api.checkHealth(),
        api.getDocuments(),
        isAdminUsr ? api.getAttacks() : Promise.resolve([]),
        isAdminUsr ? api.getDefenses() : Promise.resolve([]),
      ]);
      
      setIsConnected(health.llmConfigured);
      setDocuments(docsData.documents);
      
      if (isAdminUsr) {
        setAttacks(attacksData);
        setDefenses(defensesData);
        setActiveDefenses(defensesData.filter((d: Defense) => d.enabled).map((d: Defense) => d.id));
      }
    } catch {
      toast.error('Could not reach the backend. Is the server running?');
    }
  };

  // --- Handlers ---

  const handleUploadDocument = async (file: File) => {
    try {
      const result = await api.uploadDocument(file, false);
      setDocuments((prev) => [...prev, result.document]);
      toast.success('Document uploaded successfully');
    } catch {
      toast.error('Upload failed. Check the file and try again.');
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error('Could not delete document — please try again.');
    }
  };

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
      toast.success(`Attack "${attack.name}" created`);
    } catch {
      toast.error('Failed to create attack.');
      throw new Error('Failed');
    }
  };

  const handleDeleteAttack = async (attackId: string) => {
    try {
      await api.deleteAttack(attackId);
      setAttacks((prev) => prev.filter((a) => a.id !== attackId));
      toast.info('Attack deleted');
    } catch {
      toast.error('Failed to delete attack. Built-in attacks cannot be deleted.');
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
      toast.info(`${updatedDefense.name} ${updatedDefense.enabled ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to toggle defense.');
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
    setMessages((prev) => [...prev, userMsg]);
    try {
      const response = await api.query({
        prompt,
        documentIds: documents.map((d) => d.id),
        activeDefenses,
      });
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        defenseState: response.defenseState,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      toast.error('No response from AI. Is the backend running?');
    }
  };

  const handleSetComparison = (before: ChatMessage | null, after: ChatMessage | null) => {
    setComparisonMessages({ before, after });
    if ((before || after) && (user?.role === 'admin' || user?.role === 'super_admin')) {
      setCurrentPage('compare');
    }
  };

  const handleLogout = () => {
    logout();
    toast.info('You have been signed out.');
  };

  // --- Auth loading ---

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // --- Nav sections ---

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  const adminSections: NavSection[] = [
    {
      label: 'OVERVIEW',
      items: [
        { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
      ],
    },
    {
      label: 'LAB',
      items: [
        { id: 'simulator', label: 'Simulator', icon: <SplitSquareHorizontal size={18} /> },
        { id: 'defenses', label: 'Defenses', icon: <Shield size={18} />, badge: activeDefenses.length || null },
        { id: 'attacks', label: 'Attacks', icon: <Zap size={18} /> },
        { id: 'llm-compare', label: 'AI Compare', icon: <GitCompare size={18} /> },
        { id: 'documents', label: 'Documents', icon: <FileText size={18} />, badge: documents.length || null },
      ],
    },
    {
      label: 'RESEARCH',
      items: [
        { id: 'testing', label: 'Stress Test', icon: <FlaskConical size={18} /> },
        { id: 'test-traces', label: 'Test Traces', icon: <FileText size={18} /> },
      ],
    },
    {
      label: 'ADMIN',
      labelColor: user.role === 'super_admin' ? '#f59e0b' : '#8b5cf6',
      items: [
        { id: 'users', label: 'Users', icon: <Users size={18} /> },
      ],
    },
  ];

  if (comparisonMessages.before || comparisonMessages.after) {
    adminSections[1].items.push({
      id: 'compare',
      label: 'Compare',
      icon: <FileText size={18} />,
    });
  }

  const userSections: NavSection[] = [
    {
      items: [
        { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} />, badge: messages.length || null },
        { id: 'documents', label: 'Documents', icon: <FileText size={18} />, badge: documents.length || null },
      ],
    },
  ];

  const sections = isAdmin ? adminSections : userSections;
  const defaultPage = isAdmin ? 'analytics' : 'chat';

  const renderPage = () => {
    switch (currentPage) {
      case 'analytics':
        return <AnalyticsPage />;
      case 'simulator':
        return (
          <ComparisonSimulator attacks={attacks} defenses={defenses} documents={documents} />
        );
      case 'chat':
        return (
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            onSetComparison={handleSetComparison}
            onUploadDocument={handleUploadDocument}
          />
        );
      case 'documents':
        return (
          <DocumentsPage
            documents={documents}
            onUpload={handleUploadDocument}
            onDelete={handleDeleteDocument}
          />
        );
      case 'attacks':
        return (
          <AttacksPage
            attacks={attacks}
            onCreateAttack={handleCreateAttack}
            onDeleteAttack={handleDeleteAttack}
          />
        );
      case 'defenses':
        return (
          <DefensesPage
            defenses={defenses}
            activeDefenses={activeDefenses}
            onToggle={handleToggleDefense}
          />
        );
      case 'compare':
        return (
          <ComparisonView before={comparisonMessages.before} after={comparisonMessages.after} />
        );
      case 'llm-compare':
        return <LLMComparisonPage />;
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
      sections={sections}
      activePage={currentPage || defaultPage}
      onNavigate={(p) => setCurrentPage(p as PageView)}
      onLogout={handleLogout}
      isConnected={isConnected}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    >
      <PageTransition key={currentPage}>
        {renderPage()}
      </PageTransition>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
