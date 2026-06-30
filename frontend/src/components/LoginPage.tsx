import { useState, FormEvent } from 'react';
import { Shield, Zap, BarChart3, AlertCircle, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Email address is required.'); return; }
    if (!password) { setError('Password is required.'); return; }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-card border-r border-border p-10" aria-hidden="true">
        <div className="flex-1 flex flex-col justify-center">
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mb-8">
            <Shield size={40} className="text-white" />
          </div>
          <h1 className="text-foreground text-3xl font-bold leading-tight mb-3">
            Prompt Injection<br />Defense Lab
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8">
            A research tool for studying LLM security
          </p>
          <ul className="space-y-3">
            {[
              { icon: Zap, text: 'Real-world attack types with tiered severity' },
              { icon: Shield, text: 'Measurable defense mechanisms' },
              { icon: BarChart3, text: 'Live analytics & effectiveness scoring' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-muted-foreground text-sm">
                <Icon size={16} className="text-primary flex-shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <span className="text-muted-foreground/50 text-xs">v1.0 — thesis build</span>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <Shield size={28} className="text-white" />
            </div>
          </div>

          <h2 className="text-foreground text-2xl font-bold mb-1">Sign in</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Use the credentials provided by your administrator.
          </p>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 mb-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm" role="alert">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                className={cn(
                  'w-full px-3 py-2.5 rounded-md border bg-background text-foreground text-sm outline-none transition-colors',
                  'focus:ring-2 focus:ring-primary/30 focus:border-primary',
                  error && !email ? 'border-destructive' : 'border-input',
                )}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                disabled={loading}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-password"
                  type="password"
                  className={cn(
                    'w-full pl-9 pr-3 py-2.5 rounded-md border bg-background text-foreground text-sm outline-none transition-colors',
                    'focus:ring-2 focus:ring-primary/30 focus:border-primary',
                    error && !password ? 'border-destructive' : 'border-input',
                  )}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
