// Shared form error display. Returns null when error is falsy.
// Replaces three slightly different inline error patterns across scheme forms.
import { AlertCircle } from 'lucide-react';

export const FormError = ({ error }) => {
  if (!error) return null;
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2">
      <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-xs font-bold text-red-700">{error}</p>
    </div>
  );
};
