import React from 'react';
import { cn } from '@/lib/utils';
import type { NavSection } from './AppShell';

interface BottomNavProps {
  sections: NavSection[];
  activePage: string;
  onNavigate: (id: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ sections, activePage, onNavigate }) => {
  const items = sections.flatMap((s) => s.items).slice(0, 5);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden flex items-center justify-around bg-card border-t border-border h-14 z-50"
      role="navigation"
      aria-label="Mobile navigation"
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={cn(
            'flex flex-col items-center gap-0.5 py-1 px-2 text-[0.65rem] transition-colors',
            activePage === item.id
              ? 'text-primary font-semibold'
              : 'text-muted-foreground',
          )}
          onClick={() => onNavigate(item.id)}
          aria-label={item.label}
          aria-current={activePage === item.id ? 'page' : undefined}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
