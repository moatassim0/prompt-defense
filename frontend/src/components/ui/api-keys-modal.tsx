import { useState } from 'react';
import { Key, Plus, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notify } from '@/lib/notify';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeysModal({ isOpen, onClose }: ApiKeysModalProps) {
  const [keys, setKeys] = useState([
    { id: '1', name: 'Production CI', prefix: 'thrax_live_8f92...', created: 'Oct 12, 2025', lastUsed: '2 hours ago' },
    { id: '2', name: 'Local Dev', prefix: 'thrax_test_11a4...', created: 'Nov 04, 2025', lastUsed: 'Never' },
  ]);

  const handleGenerate = () => {
    notify.success('New API Key generated successfully (Simulated)');
    setKeys([
      { id: Date.now().toString(), name: 'New Key', prefix: 'thrax_live_' + Math.random().toString(36).substring(2, 6) + '...', created: 'Just now', lastUsed: 'Never' },
      ...keys
    ]);
  };

  const handleDelete = (id: string) => {
    setKeys(keys.filter(k => k.id !== id));
    notify.info('API Key revoked');
  };

  const handleCopy = () => {
    notify.success('API Key copied to clipboard');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex justify-between items-start mr-6">
            <div>
              <DialogTitle className="text-xl">API Keys</DialogTitle>
              <DialogDescription className="mt-1.5">
                Manage API keys for programmatic access to THRAX.
              </DialogDescription>
            </div>
            <Button onClick={handleGenerate} className="bg-[#f97316] hover:bg-[#ea580c] text-white gap-2 h-9">
              <Plus className="h-4 w-4" /> Generate New Key
            </Button>
          </div>
        </DialogHeader>

        <div className="py-2">
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-card border-b border-border text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Key Prefix</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keys.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        No API keys found.
                      </td>
                    </tr>
                  ) : (
                    keys.map((key) => (
                      <tr key={key.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{key.name}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{key.prefix}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{key.created}</td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" onClick={handleCopy}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(key.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex gap-3">
            <Key className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-blue-400">Keep your keys secure</p>
              <p className="text-xs text-blue-400/80">API keys grant full access to your environment. Never expose them in client-side code.</p>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}