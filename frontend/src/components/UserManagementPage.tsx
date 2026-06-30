import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Users, UserPlus, X, ShieldCheck, Crown,
  User as UserIcon, Loader2, XCircle, AlertTriangle, KeyRound,
  Search, Shield,
} from 'lucide-react';
import { api } from '../services/api';
import { User } from '../../../shared/types';
import { useAuth } from '../context/AuthContext';
import { notify } from '../lib/notify';
import ConfirmModal from './ConfirmModal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { PageHeader } from './ui/page-header';
import { DataTable } from './ui/data-table';
import { userColumns } from './users/columns';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { TableSkeleton } from './ui/skeletons';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Needs uppercase')
    .regex(/[0-9]/, 'Needs a number'),
  role: z.enum(['user', 'admin', 'super_admin']),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

const SPECIAL_RE = /[^A-Za-z0-9]/;

function passwordStrengthPercent(password: string): number {
  let rules = 0;
  if (password.length >= 8) rules += 1;
  if (/[A-Z]/.test(password)) rules += 1;
  if (/[0-9]/.test(password)) rules += 1;
  if (SPECIAL_RE.test(password)) rules += 1;
  return rules * 25;
}

function strengthIndicatorClass(percent: number): string {
  if (percent <= 25) return 'bg-threat';
  if (percent <= 50) return 'bg-warn';
  return 'bg-safe';
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [resetTarget, setResetTarget] = useState<User | null>(null);

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', password: '', role: 'user' },
    mode: 'onTouched',
  });

  const resetForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const createPassword = createForm.watch('password');
  const strengthPct = useMemo(() => passwordStrengthPercent(createPassword ?? ''), [createPassword]);
  const strengthLabelClass = useMemo(() => {
    if (!createPassword) return 'text-muted-foreground';
    if (strengthPct <= 25) return 'text-threat';
    if (strengthPct <= 50) return 'text-warn';
    return 'text-safe';
  }, [createPassword, strengthPct]);

  const { isSubmitting: isCreateSubmitting } = createForm.formState;
  const { isSubmitting: isResetSubmitting } = resetForm.formState;

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (!showDrawer) return;
    createForm.reset({ email: '', password: '', role: 'user' });
  }, [showDrawer]);

  useEffect(() => {
    if (!resetTarget) return;
    resetForm.reset({ newPassword: '', confirmPassword: '' });
  }, [resetTarget]);

  useEffect(() => {
    if (!resetTarget && !showDrawer) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isResetSubmitting) setResetTarget(null);
      if (!isCreateSubmitting) setShowDrawer(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [resetTarget, showDrawer, isResetSubmitting, isCreateSubmitting]);

  async function fetchUsers() {
    setLoading(true); setError('');
    try { const data = await api.getUsers(); setUsers(data.users); }
    catch { setError('Failed to load users.'); }
    finally { setLoading(false); }
  }

  async function onSubmitCreate(values: CreateUserFormValues) {
    try {
      await api.createUser({
        email: values.email.trim(),
        password: values.password,
        role: values.role,
      });
      createForm.reset({ email: '', password: '', role: 'user' });
      setShowDrawer(false);
      await fetchUsers();
      notify.success('User created successfully');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      const msg = e?.response?.data?.error ?? 'Failed to create user.';
      createForm.setError('root', { type: 'server', message: msg });
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      notify.success(`${deleteTarget.email} has been deleted.`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      notify.error(e?.response?.data?.error ?? 'Failed to delete user.');
    }
    finally { setDeleting(false); setDeleteTarget(null); }
  }

  async function onSubmitReset(values: ResetPasswordFormValues) {
    if (!resetTarget) return;
    try {
      await api.resetPassword(resetTarget.id, values.newPassword);
      notify.success(`Password reset for ${resetTarget.email}`);
      setResetTarget(null);
      resetForm.reset({ newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      notify.error(e?.response?.data?.error ?? 'Password reset failed.');
    }
  }

  const initials = (email: string) => email.split('@')[0].slice(0, 2).toUpperCase();

  const roleConfig = {
    super_admin: { icon: Crown, label: 'SUPER ADMIN', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', avatar: 'bg-amber-500/10 text-amber-400' },
    admin: { icon: ShieldCheck, label: 'ADMIN', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', avatar: 'bg-purple-500/10 text-purple-400' },
    user: { icon: UserIcon, label: 'USER', bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', avatar: 'bg-primary/10 text-primary' },
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <PageHeader
        icon={<Shield size={14} />}
        badgeLabel="User Management"
        title="Manage access across the workspace"
        description="Review roles, search the current user base, create new accounts, and handle resets from one consistent admin workspace."
        actions={
          <Button onClick={() => { createForm.clearErrors('root'); setShowDrawer(true); }}>
            <UserPlus size={16} />
            Create user
          </Button>
        }
      />

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


      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm" role="alert">
          <XCircle size={16} /> {error}
        </div>
      )}

      <AnimatePresence mode="wait">
      {loading ? (
        <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <TableSkeleton rows={5} cols={4} />
        </motion.div>
      ) : (
        <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No users found</p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Create a new user account to get started
          </p>
          <Button onClick={() => { createForm.clearErrors('root'); setShowDrawer(true); }} variant="outline" size="sm">
            <UserPlus size={16} />
            Create User
          </Button>
        </div>
      ) : (
        <DataTable
          columns={userColumns(
            (id) => setDeleteTarget(users.find((u) => u.id === id) || null),
            (user) => { setResetTarget(user); },
            currentUser
          )}
          data={users}
          searchKey="email"
          searchPlaceholder="Search users by email..."
        />
      )}
        </motion.div>
      )}
      </AnimatePresence>
          </CardContent>
        </Card>
      </section>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete user?"
        message={`${deleteTarget?.email} will be permanently removed.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />

      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => { if (!isResetSubmitting) setResetTarget(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape' && !isResetSubmitting) setResetTarget(null); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 animate-slide-in cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-foreground font-semibold flex items-center gap-2">
                <KeyRound size={18} className="text-amber-400" /> Reset Password
              </h3>
              <button type="button" aria-label="Close password reset dialog" onClick={() => { if (!isResetSubmitting) setResetTarget(null); }} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <Form {...resetForm}>
              <form onSubmit={resetForm.handleSubmit(onSubmitReset)}>
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
                  <FormField
                    control={resetForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          New Password <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                            disabled={isResetSubmitting}
                            placeholder="Min. 8 characters"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={resetForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          Confirm Password <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                            disabled={isResetSubmitting}
                            placeholder="Re-enter new password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-warn/10 border border-warn/20 text-warn text-xs">
                    <AlertTriangle size={14} />
                    This will revoke all active sessions for this user.
                  </div>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t border-border">
                  <Button type="button" onClick={() => setResetTarget(null)} variant="outline" disabled={isResetSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isResetSubmitting}
                    className="gap-2 bg-amber-500 text-white hover:bg-amber-500/90"
                  >
                    {isResetSubmitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Resetting…
                      </>
                    ) : (
                      <>
                        <KeyRound size={14} />
                        Reset Password
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      )}

      {showDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in transition-opacity"
          onClick={() => { if (!isCreateSubmitting) setShowDrawer(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape' && !isCreateSubmitting) setShowDrawer(false); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 animate-slide-in cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-foreground font-semibold">Create user</h3>
              <button type="button" aria-label="Close create user form" onClick={() => { if (!isCreateSubmitting) setShowDrawer(false); }} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onSubmitCreate)}>
                <div className="p-5 space-y-4">
                  {createForm.formState.errors.root && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm" role="alert">
                      <XCircle size={14} />
                      {createForm.formState.errors.root.message}
                    </div>
                  )}
                  <FormField
                    control={createForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          Email address <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            disabled={isCreateSubmitting}
                            placeholder="jane@example.com"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Role</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isCreateSubmitting}
                            {...field}
                          >
                            <option value="user">User</option>
                            {isSuperAdmin && <option value="admin">Admin</option>}
                            {isSuperAdmin && <option value="super_admin">Super admin</option>}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          Password <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            disabled={isCreateSubmitting}
                            placeholder="Min. 8 chars, uppercase, number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-1.5">
                    <p className={cn('text-xs', strengthLabelClass)}>Password strength</p>
                    <Progress
                      value={strengthPct}
                      indicatorClassName={strengthIndicatorClass(strengthPct)}
                      className="h-2"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t border-border">
                  <Button type="button" onClick={() => setShowDrawer(false)} disabled={isCreateSubmitting} variant="outline">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreateSubmitting} className="gap-2">
                    {isCreateSubmitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Creating user…
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} />
                        Create user
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}
