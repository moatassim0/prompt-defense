import React, { useState } from 'react';
import { User, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authClient } from '@/lib/auth-client';
import { notify } from '@/lib/notify';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountSettingsModal({ isOpen, onClose }: AccountSettingsModalProps) {
  const { user } = useAuth();
  
  const [name, setName] = useState(user?.display_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state when user loads or modal opens
  React.useEffect(() => {
    if (isOpen && user) {
      setName(user.display_name || '');
      setCurrentPassword('');
      setNewPassword('');
    }
  }, [isOpen, user]);

  const handleSave = async () => {
    setIsSubmitting(true);
    let nameChanged = false;
    let pwdChanged = false;
    
    try {
      if (name !== user?.display_name) {
        const { error } = await authClient.updateUser({ name });
        if (error) throw error;
        nameChanged = true;
      }

      if (user?.role === 'super_admin' && currentPassword && newPassword) {
        const { error } = await authClient.changePassword({ newPassword, currentPassword });
        if (error) throw error;
        pwdChanged = true;
      }

      if (nameChanged && pwdChanged) notify.success('Profile and password updated successfully');
      else if (nameChanged) notify.success('Profile updated successfully');
      else if (pwdChanged) notify.success('Password updated successfully');
      else notify.info('No changes made');

      onClose();
    } catch (err: any) {
      notify.error(err.message || 'Failed to update account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl">Account Settings</DialogTitle>
          <DialogDescription>
            Manage your account details and security preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Profile</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    className="pl-10 bg-background border-border text-sm" 
                    placeholder="Your name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    className="pl-10 bg-background border-border text-sm text-muted-foreground" 
                    placeholder="Your email" 
                    value={user?.email || ''} 
                    disabled 
                  />
                </div>
              </div>
            </div>
          </div>

          {user?.role === 'super_admin' && (
            <div className="pt-4 border-t border-border space-y-4">
              <h3 className="text-sm font-semibold text-white">Change Password</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Current Password</label>
                  <Input 
                    type="password" 
                    className="bg-background border-border text-sm" 
                    placeholder="••••••••" 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">New Password</label>
                  <Input 
                    type="password" 
                    className="bg-background border-border text-sm" 
                    placeholder="••••••••" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" className="border-border hover:bg-white/5" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            className="bg-[#f97316] hover:bg-[#ea580c] text-white border-transparent" 
            onClick={handleSave} 
            disabled={isSubmitting || (user?.role === 'super_admin' && ((!currentPassword && newPassword.length > 0) || (currentPassword.length > 0 && !newPassword)))}
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}