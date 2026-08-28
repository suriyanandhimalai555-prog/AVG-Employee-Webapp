import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Password input with a built-in show/hide eye toggle.
 *
 * Drop-in replacement for <input type="password" value={...} onChange={...} />.
 * All extra props (placeholder, autoComplete, name, id, …) are forwarded to the
 * underlying <input>, so this component is transparent to forms.
 *
 * Optional `leftIcon` prop accepts a ReactNode (e.g. <Lock size={17} />).
 * When provided it is rendered absolutely on the left edge — the caller is
 * responsible for adding a matching `pl-*` class to keep text clear of the icon.
 * The component always adds padding on the right for the eye button; callers
 * should NOT add their own `pr-*` to `className`.
 *
 * Example usage:
 *   <PasswordInput
 *     value={password}
 *     onChange={(e) => setPassword(e.target.value)}
 *     leftIcon={<Lock size={17} />}
 *     placeholder="Enter your password"
 *     autoComplete="current-password"
 *     className="w-full pl-11 py-4 bg-white/70 rounded-2xl …"
 *   />
 */
export const PasswordInput = ({ value, onChange, className, wrapperClassName, leftIcon, required, ...rest }) => {
  // Track whether the password characters are currently visible.
  const [visible, setVisible] = useState(false);

  return (
    // wrapperClassName lets callers add Tailwind groups (e.g. "group") so that
    // group-focus-within utilities on leftIcon children activate on input focus.
    <div className={`relative${wrapperClassName ? ' ' + wrapperClassName : ''}`}>
      {/* Optional leading icon — pointer-events-none so it never steals focus */}
      {leftIcon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          {leftIcon}
        </div>
      )}

      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required={required}
        // pr-11 reserves space for the eye toggle button on the right.
        className={`${className ?? ''} pr-11`}
        {...rest}
      />

      {/* Eye toggle — type="button" prevents accidental form submission */}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/30 hover:text-navy/60 transition-colors"
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
};
