// Shared "matched customers" line rendered beneath a container card (room or group)
// when a search term is active.
//
// All three room/group schemes (Gold Coin, LSS, Chit) share the same shape:
//   { customer_name, customer_phone, slot_number? }
// The slot_number segment is omitted when absent (Chit has no per-member slot).
//
// Keep the indigo tint and 10px size so this fits seamlessly into the existing
// room/group card layout without changing surrounding spacing.

export const SchemeMatchLine = ({ matches }) => {
  if (!matches?.length) return null;

  return (
    <p className="text-[10px] font-medium text-indigo mt-1.5 leading-relaxed">
      {/* Prefix label */}
      <span className="font-bold">Matched: </span>
      {matches.map((m, i) => (
        <span key={i}>
          {i > 0 && <span className="text-indigo/40"> · </span>}
          <span className="font-semibold">{m.customer_name}</span>
          {m.customer_phone && (
            <span className="text-indigo/60"> · {m.customer_phone}</span>
          )}
          {m.slot_number != null && (
            <span className="text-indigo/50"> · Slot {m.slot_number}</span>
          )}
        </span>
      ))}
    </p>
  );
};

export default SchemeMatchLine;
