import React from 'react';
import { twMerge } from 'tailwind-merge';

export const StatusChip = ({ status, label }) => {
  const variants = {
    present: "bg-emerald/10 text-emerald border border-emerald/20",
    late: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
    absent: "bg-red-500/10 text-red-600 border border-red-500/20",
    pending: "bg-indigo/10 text-indigo border border-indigo/20",
  };

  return (
    <span className={twMerge(
      "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
      variants[status] || variants.pending
    )}>
      {label || status}
    </span>
  );
};
