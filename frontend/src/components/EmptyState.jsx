// frontend/src/components/EmptyState.jsx
// Standard zero-data placeholder. Pages render this when a list query returns
// an empty array — replaces ad-hoc "No data" divs scattered across the app.
import { Inbox } from 'lucide-react';

const EmptyState = ({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  message = '',
  action = null,
  className = '',
}) => (
  <div
    className={`w-full flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
  >
    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
      <Icon className="w-7 h-7 text-slate-500" aria-hidden="true" />
    </div>
    <h3 className="text-base font-semibold text-navy">{title}</h3>
    {message ? (
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
    ) : null}
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

export default EmptyState;
