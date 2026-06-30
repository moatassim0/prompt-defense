import { useState, useEffect } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notify } from '@/lib/notify';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
}

export function PreferencesModal({ isOpen, onClose, theme, setTheme }: PreferencesModalProps) {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [desktopNotifs, setDesktopNotifs] = useState(true);
  const [localTheme, setLocalTheme] = useState(theme);

  useEffect(() => {
    if (isOpen) {
      setEmailAlerts(localStorage.getItem('thrax_email_alerts') !== 'false');
      setDesktopNotifs(localStorage.getItem('thrax_desktop_notifs') !== 'false');
      setLocalTheme(theme);
    }
  }, [isOpen, theme]);

  const handleSave = () => {
    localStorage.setItem('thrax_email_alerts', String(emailAlerts));
    localStorage.setItem('thrax_desktop_notifs', String(desktopNotifs));
    setTheme(localTheme);
    notify.success('Preferences saved successfully');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl">Preferences</DialogTitle>
          <DialogDescription>
            Customize your THRAX experience.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Theme</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <button 
                onClick={() => setLocalTheme('light')}
                className={`flex flex-col items-center justify-center p-4 border rounded-lg bg-background transition-colors ${localTheme === 'light' ? 'border-[#f97316] ring-1 ring-[#f97316]' : 'border-border hover:border-[#f97316]/50'}`}
              >
                <Sun className={`h-6 w-6 mb-2 ${localTheme === 'light' ? 'text-[#f97316]' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium text-foreground">Light</span>
              </button>
              <button 
                onClick={() => setLocalTheme('dark')}
                className={`flex flex-col items-center justify-center p-4 border rounded-lg bg-background transition-colors ${localTheme === 'dark' ? 'border-[#f97316] ring-1 ring-[#f97316]' : 'border-border hover:border-[#f97316]/50'}`}
              >
                <Moon className={`h-6 w-6 mb-2 ${localTheme === 'dark' ? 'text-[#f97316]' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium text-foreground">Dark</span>
              </button>
              <button 
                onClick={() => setLocalTheme('system')}
                className={`flex flex-col items-center justify-center p-4 border rounded-lg bg-background transition-colors ${localTheme === 'system' ? 'border-[#f97316] ring-1 ring-[#f97316]' : 'border-border hover:border-[#f97316]/50'}`}
              >
                <Monitor className={`h-6 w-6 mb-2 ${localTheme === 'system' ? 'text-[#f97316]' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium text-foreground">System</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border space-y-4">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Email Alerts</p>
                <p className="text-xs text-muted-foreground">Receive emails about system health and security events.</p>
              </div>
              <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">Desktop Notifications</p>
                <p className="text-xs text-muted-foreground">Show popup notifications for background tasks.</p>
              </div>
              <Switch checked={desktopNotifs} onCheckedChange={setDesktopNotifs} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" className="border-border hover:bg-white/5" onClick={onClose}>
            Cancel
          </Button>
          <Button className="bg-[#f97316] hover:bg-[#ea580c] text-white border-transparent" onClick={handleSave}>
            Save Preferences
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}