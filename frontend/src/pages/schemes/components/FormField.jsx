// Shared form field wrapper — label + children slot.
// Extracted from GoldSchemeAddPage's inline `Field` component.
export const FormField = ({ label, required, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold uppercase tracking-widest text-navy/40">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);
