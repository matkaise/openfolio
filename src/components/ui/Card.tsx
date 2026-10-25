import React from 'react';

/** Legacy wrapper; renders the design v2 glass card. Prefer GlassCard with CardHeader. */
export const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`ui-card glass ${className}`}>
    {children}
  </div>
);
