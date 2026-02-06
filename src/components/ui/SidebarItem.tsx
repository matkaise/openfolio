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
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${active
      ? 'bg-emerald-500/10 text-emerald-400 font-medium'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
  >
    <Icon size={20} />
    <span>{label}</span>
  </button>
);
