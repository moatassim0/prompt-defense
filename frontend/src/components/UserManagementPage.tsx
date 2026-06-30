import { useState, useEffect } from 'react';
import {
  Users, UserPlus, X, Trash2, ShieldCheck, Crown,
  User as UserIcon, Loader2, AlertCircle, KeyRound,
  Mail, Calendar, Search, Shield,
} from 'lucide-react';
import { api } from '../services/api';
import { User } from '../../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Password reset
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Create form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'super_admin' | 'admin' | 'user'>('user');

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (!resetTarget && !showDrawer) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setResetTarget(null);
      setShowDrawer(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [resetTarget, showDrawer]);

  async function fetchUsers() {
    setLoading(true); setError('');
    try { const data = await api.getUsers(); setUsers(data.users); }
    catch { setError('Failed to load users.'); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!newEmail.trim() || !newPassword.trim()) return;
    setCreating(true); setCreateErr('');
    try {
      await api.createUser({ email: newEmail.trim(), password: newPassword, role: newRole });
      setNewEmail(''); setNewPassword(''); setNewRole('user'); setShowDrawer(false);
      await fetchUsers();
      toast.success('User created successfully');
    } catch (err: any) { setCreateErr(err?.response?.data?.error ?? 'Failed to create user.'); }
    finally { setCreating(false); }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success(`${deleteTarget.email} has been deleted.`);
    } catch (err: any) { toast.error(err?.response?.data?.error ?? 'Failed to delete user.'); }
    finally { setDeleting(false); setDeleteTarget(null); }
  }

  async function handleResetPassword() {
    if (!resetTarget || !resetPassword.trim()) return;
    setResetting(true);
    try {
      await api.resetPassword(resetTarget.id, resetPassword);
      toast.success(`Password reset for ${resetTarget.email}`);
      setResetTarget(null); setResetPassword('');
    } catch (err: any) { toast.error(err?.response?.data?.error ?? 'Password reset failed.'); }
    finally { setResetting(false); }
  }

  const initials = (email: string) => email.split('@')[0].slice(0, 2).toUpperCase();

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const roleConfig = {
    super_admin: { icon: Crown, label: 'SUPER ADMIN', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', avatar: 'bg-amber-500/10 text-amber-400' },
    admin: { icon: ShieldCheck, label: 'ADMIN', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', avatar: 'bg-purple-500/10 text-purple-400' },
    user: { icon: UserIcon, label: 'USER', bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', avatar: 'bg-primary/10 text-primary' },
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <Shield size={14} />
              User Management
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Manage access across the workspace</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Review roles, search the current user base, create new accounts, and handle resets from one consistent admin workspace.
              </p>
            </div>
          </div>
          <Button onClick={() => { setShowDrawer(true); setCreateErr(''); }}>
            <UserPlus size={16} />
            Create user
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Manage</p>
          <h3 className="text-lg font-semibold text-foreground">Monitor and administer accounts</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Users', value: users.length, icon: Users, cls: 'text-foreground' },
          { label: 'Super Admins', value: users.filter(u => u.role === 'super_admin').length, icon: Crown, cls: 'text-amber-400' },
          { label: 'Admins', value: users.filter(u => u.role === 'admin').length, icon: ShieldCheck, cls: 'text-purple-400' },
          { label: 'Users', value: users.filter(u => u.role === 'user').length, icon: UserIcon, cls: 'text-primary' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="rounded-xl">
            <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={cls} />
              <span className="text-muted-foreground text-xs">{label}</span>
            </div>
            <div className={cn('text-2xl font-bold', cls)}>{value}</div>
            </CardContent>
          </Card>
        ))}
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search size={16} className="text-primary" />
              User Directory
            </CardTitle>
            <CardDescription>Search the current user base and manage user actions from the table below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by email..."
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={48} className="text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-foreground text-lg font-semibold mb-1">{searchQuery ? 'No matches' : 'No users yet'}</h3>
          <p className="text-muted-foreground text-sm mb-4">{searchQuery ? 'Try a different search term.' : 'Create the first user account.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {['User', 'Role', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u, i) => {
                const rc = roleConfig[u.role] || roleConfig.user;
                const RoleIcon = rc.icon;
                return (
                  <tr key={u.id} className={cn('border-b border-border transition-colors hover:bg-accent/30', i % 2 === 1 && 'bg-muted/10')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold', rc.avatar)}>
                          {initials(u.email)}
                        </div>
                        <div>
                          <div className="text-foreground font-medium flex items-center gap-1.5">
                            {u.email.split('@')[0]}
                            {u.id === currentUser?.id && (
                              <span className="text-[0.6rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded">You</span>
                            )}
                          </div>
                          <div className="text-muted-foreground text-xs flex items-center gap-1">
                            <Mail size={10} /> {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold border', rc.bg, rc.text, rc.border)}>
                        <RoleIcon size={10} />
                        {rc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <div className="flex items-center gap-1">
                        <Calendar size={10} />
                        {new Intl.DateTimeFormat(navigator.language).format(new Date(u.created_at))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* Reset password: super_admin can reset for admin + user; admin can reset for user only */}
                        {u.id !== currentUser?.id && (
                          (isSuperAdmin && u.role !== 'super_admin') ||
                          (!isSuperAdmin && u.role === 'user')
                        ) && (
                          <button
                            onClick={() => { setResetTarget(u); setResetPassword(''); }}
                            className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md hover:bg-amber-500/10 transition-colors"
                            title="Reset password"
                          >
                            <KeyRound size={14} />
                          </button>
                        )}
                        {/* Delete: super_admin can delete admin + user; admin can delete user only; super_admin accounts cannot be deleted */}
                        {u.id !== currentUser?.id && u.role !== 'super_admin' && (
                          isSuperAdmin || u.role === 'user'
                        ) && (
                          <button onClick={() => setDeleteTarget(u)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors" aria-label={`Delete ${u.email}`}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
          </CardContent>
        </Card>
      </section>

      {/* Delete modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete user?"
        message={`${deleteTarget?.email} will be permanently removed.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Password reset modal (super_admin only) */}
      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => setResetTarget(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setResetTarget(null); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 animate-slide-in cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-foreground font-semibold flex items-center gap-2">
                <KeyRound size={18} className="text-amber-400" /> Reset Password
              </h3>
              <button onClick={() => setResetTarget(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold', roleConfig[resetTarget.role]?.avatar || roleConfig.user.avatar)}>
                  {initials(resetTarget.email)}
                </div>
                <div>
                  <div className="text-foreground text-sm font-medium">{resetTarget.email}</div>
                  <div className="text-muted-foreground text-xs capitalize">{resetTarget.role.replace('_', ' ')}</div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">New Password <span className="text-destructive">*</span></label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  disabled={resetting}
                />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <AlertCircle size={14} />
                This will revoke all active sessions for this user.
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <Button onClick={() => setResetTarget(null)} variant="outline">Cancel</Button>
              <Button
                onClick={handleResetPassword}
                disabled={resetting || resetPassword.length < 8}
                className="bg-amber-500 text-white hover:bg-amber-500/90"
              >
                {resetting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                {resetting ? 'Resetting…' : 'Reset Password'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create drawer */}
      {showDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in transition-opacity"
          onClick={() => setShowDrawer(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowDrawer(false); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 animate-slide-in cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-foreground font-semibold">Create user</h3>
              <button onClick={() => setShowDrawer(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {createErr && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle size={14} /> {createErr}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Email address <span className="text-destructive">*</span></label>
                <input className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@example.com" disabled={creating} />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Role</label>
                <select className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground" value={newRole} onChange={(e) => setNewRole(e.target.value as 'super_admin' | 'admin' | 'user')} disabled={creating}>
                  <option value="user">User</option>
                  {isSuperAdmin && <option value="admin">Admin</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Password <span className="text-destructive">*</span></label>
                <input className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" disabled={creating} />
                <span className="text-muted-foreground text-xs mt-1 block">User will log in with this password.</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <Button onClick={() => setShowDrawer(false)} disabled={creating} variant="outline">Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !newEmail.trim() || !newPassword.trim()}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                {creating ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
