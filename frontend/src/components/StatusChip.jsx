import React from 'react';
import { twMerge } from 'tailwind-merge';

export const StatusChip = ({ status, label, className }) => {
  const variants = {
    present:        "bg-emerald/8  text-emerald  border border-emerald/20",
    late:           "bg-amber-500/8 text-amber-600 border border-amber-500/20",
    absent:         "bg-red-500/8   text-red-600   border border-red-500/20",
    pending:        "bg-indigo/8    text-indigo    border border-indigo/20",
    director:       "bg-indigo/8    text-indigo    border border-indigo/15",
    gm:             "bg-indigo/6    text-indigo    border border-indigo/15",
    branch_manager: "bg-navy/6      text-navy/70   border border-navy/10",
    branch_admin:   "bg-emerald/8   text-emerald   border border-emerald/20",
    abm:            "bg-navy/6      text-navy/70   border border-navy/10",
    sales_officer:  "bg-navy/4      text-navy/60   border border-navy/8",
    client:         "bg-navy/4      text-navy/50   border border-navy/8",
  };

  return (
    <span className={twMerge(
      "inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
      variants[status] || variants.pending,
      className
    )}>
      {label || status}
    </span>
  );
};
