import React from 'react';

export const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`md3-card p-6 ${className}`}>
    {children}
  </div>
);
