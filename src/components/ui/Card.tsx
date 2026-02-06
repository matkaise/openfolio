import React from 'react';

export const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 ${className}`}>
    {children}
  </div>
);
