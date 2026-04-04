import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Button = ({
  children,
  variant = 'primary',
  className,
  ...props
}) => {
  const baseStyles = "px-6 py-3 rounded-xl font-semibold transition-all duration-200 outline-none tactile-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "gradient-primary text-white shadow-lg shadow-indigo/20 hover:shadow-xl hover:shadow-indigo/30 hover:brightness-110",
    secondary: "bg-surface-container text-navy hover:bg-surface-container-low",
    tonal: "bg-surface-container-low text-navy hover:bg-surface-container transition-colors",
    outline: "border border-navy/10 text-navy hover:bg-surface-container-low hover:border-navy/20",
    ghost: "text-navy hover:bg-surface-container-low",
  };

  return (
    <button
      className={twMerge(baseStyles, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
};
