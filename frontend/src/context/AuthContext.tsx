import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { User, UserRole } from '../../../shared/types';
import { authClient, type AppSession } from '../lib/auth-client';
import { markIntentionalSignOut, clearIntentionalSignOut } from '../lib/auth-toast-suppress';
import { formatBetterAuthClientError } from '../lib/better-auth-client-error';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuthUser = User;

interface AuthContextValue {
  user:      AuthUser | null;
  session:   AppSession | null;
  isLoading: boolean;
  login:     (email: string, password: string) => Promise<void>;
  register:  (name: string, email: string, password: string) => Promise<void>;
  logout:    () => void;
  refetchSession: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: isLoading, refetch: refetchSession } = authClient.useSession();
  const appSession: AppSession | null = session ?? null;

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await authClient.signIn.email({
      email,
      password,
    });
    if (error) {
      throw new Error(formatBetterAuthClientError(error, 'Login failed'));
    }
    clearIntentionalSignOut();
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { error } = await authClient.signUp.email({
      email,
      password,
      name,
    });
    if (error) {
      throw new Error(formatBetterAuthClientError(error, 'Registration failed'));
    }
    clearIntentionalSignOut();
  }, []);

  const logout = useCallback(() => {
    markIntentionalSignOut();
    authClient.signOut().catch(console.error);
  }, []);

  const refreshSession = useCallback(async () => {
    await refetchSession();
  }, [refetchSession]);

  interface SessionUserExtended {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
    role: UserRole;
    is_active?: boolean;
  }
  const extUser = session?.user as SessionUserExtended | undefined;
  const user: AuthUser | null = extUser ? {
    id: extUser.id,
    email: extUser.email,
    role: extUser.role ?? 'user',
    created_at: extUser.createdAt,
    display_name: extUser.name,
    is_active: extUser.is_active ?? true,
  } : null;

  useEffect(() => {
    if (extUser?.id) {
      clearIntentionalSignOut();
    }
  }, [extUser?.id]);

  return (
    <AuthContext.Provider value={{ user, session: appSession, isLoading, login, register, logout, refetchSession: refreshSession }}>
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
