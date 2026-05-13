// frontend/src/components/LoadingSpinner.jsx
// Single spinner component used everywhere instead of inline `<Loader2 className=... />`
// snippets. Keeps tone/size consistent and lets us swap the icon library in one place.
import { Loader2 } from 'lucide-react';

const TONES = {
  indigo: 'text-indigo-600',
  navy:   'text-navy',
  white:  'text-white',
  slate:  'text-slate-500',
};

const SIZES = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
};

const LoadingSpinner = ({
  tone = 'indigo',
  size = 'md',
  label = 'Loading',
  inline = false,
  className = '',
}) => {
  const toneClass = TONES[tone] ?? TONES.indigo;
  const sizeClass = SIZES[size] ?? SIZES.md;
  const Icon = (
    <Loader2
      className={`animate-spin ${sizeClass} ${toneClass} ${className}`}
      aria-hidden="true"
    />
  );
  if (inline) {
    return (
      <span role="status" aria-label={label} className="inline-flex items-center">
        {Icon}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <div
      role="status"
      aria-label={label}
      className="w-full flex items-center justify-center py-8"
    >
      {Icon}
      <span className="sr-only">{label}</span>
    </div>
  );
};

export default LoadingSpinner;
