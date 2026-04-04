import React from 'react';
import { twMerge } from 'tailwind-merge';

export const Card = ({
  children,
  variant = 'base',
  className
}) => {
  const variants = {
    base: "bg-surface-container-lowest",
    low: "bg-surface-container-low",
    container: "bg-surface-container",
  };

  return (
    <div className={twMerge(
      "rounded-2xl p-6 transition-all duration-300",
      variants[variant],
      className
    )}>
      {children}
    </div>
  );
};

export const CardHeader = ({ title, subtitle, icon: Icon }) => (
  <div className="flex items-center gap-4 mb-6">
    {Icon && (
      <div className="p-3 rounded-xl bg-surface-container text-indigo shrink-0">
        <Icon size={24} />
      </div>
    )}
    <div className="min-w-0">
      <h3 className="text-xl font-bold font-sans text-navy tracking-tight truncate">{title}</h3>
      {subtitle && <p className="text-sm text-navy/55 font-medium mt-0.5">{subtitle}</p>}
    </div>
  </div>
);
