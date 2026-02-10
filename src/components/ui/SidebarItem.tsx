import React from 'react';
import type { LucideIcon } from 'lucide-react';

export const SidebarItem = ({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group relative flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left transition-all duration-200 ${active ? 'md3-nav-active' : 'md3-nav-inactive'}`}
  >
    <span
      className="flex h-8 w-12 items-center justify-center rounded-full transition-colors"
      style={active ? { background: 'color-mix(in srgb, var(--md3-primary) 22%, transparent 78%)' } : undefined}
    >
      <Icon size={20} strokeWidth={active ? 2.4 : 2} />
    </span>
    <span className={`text-sm tracking-wide ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
  </button>
);
