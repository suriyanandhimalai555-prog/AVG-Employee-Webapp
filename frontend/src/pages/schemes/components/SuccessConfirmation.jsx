// Shared success screen shown after a scheme enrollment is saved.
// Used by GoldSchemeAddPage and AddMemberSheet (TradingAcademy).
// `children` is the optional commission/incentive info slot between the
// member details and the Done button.
import { CheckCircle2 } from 'lucide-react';

export const SuccessConfirmation = ({
  title = 'Member Added',
  subtitle,
  code,
  children,
  buttonLabel = 'Done',
  onDone,
}) => (
  <div className="p-6 flex flex-col items-center text-center gap-4">
    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
      <CheckCircle2 size={32} className="text-emerald-500" aria-hidden="true" />
    </div>
    <div>
      <p className="text-lg font-bold text-navy">{title}</p>
      {subtitle && <p className="text-sm text-navy/40 mt-1">{subtitle}</p>}
      {code && <p className="text-xs font-bold text-indigo mt-0.5">{code}</p>}
    </div>
    {children}
    <button
      onClick={onDone}
      className="w-full py-3 bg-indigo text-white rounded-2xl font-bold tactile-press"
    >
      {buttonLabel}
    </button>
  </div>
);
