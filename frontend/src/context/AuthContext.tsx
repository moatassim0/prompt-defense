import {
  createContext,
  useContext,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { User } from '../../../shared/types';
import { authClient } from '../lib/auth-client';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuthUser = User;

interface AuthContextValue {
  user:      AuthUser | null;
  isLoading: boolean;
  login:     (email: string, password: string) => Promise<void>;
  logout:    () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: isLoading } = authClient.useSession();

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message || 'Login failed');
    }
  }, []);

  const logout = useCallback(() => {
    authClient.signOut().catch(console.error);
  }, []);

  const user: AuthUser | null = session?.user ? {
    id: session.user.id,
    email: session.user.email,
    role: (session.user as any).role as "user" | "admin" | "super_admin",
    created_at: session.user.createdAt,
    display_name: session.user.name,
    password_hash: '',
    is_active: (session.user as any).is_active ?? true,
    failed_login_count: (session.user as any).failed_login_count ?? 0,
    updated_at: session.user.updatedAt,
  } : null;

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
