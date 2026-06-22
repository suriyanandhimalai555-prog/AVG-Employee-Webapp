// Read-only display of stored transaction IDs on scheme detail pages.
// Mirrors the normalization pattern of PhotoProof (string|string[]|null → []).
// Renders nothing when the stored value is empty/null.
//
// Props:
//   transactionId  - the stored value (string[] after migration, or legacy string, or null)
//   label          - override label text (default "Transaction ID(s)")

export const TransactionIdList = ({ transactionId, label }) => {
  // Normalize: string[] (normal), single string (legacy pre-migration), null/undefined → []
  const ids = Array.isArray(transactionId)
    ? transactionId.filter(Boolean)
    : transactionId
    ? [transactionId]
    : [];

  if (ids.length === 0) return null;

  const displayLabel = label ?? (ids.length === 1 ? 'Transaction ID' : 'Transaction IDs');

  return (
    <div className="space-y-1">
      <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40">
        {displayLabel}
      </p>
      {ids.map((id, i) => (
        <div key={i} className="flex items-center gap-2 bg-navy/3 rounded-xl px-3 py-2">
          {ids.length > 1 && (
            <span className="text-[9px] font-bold text-navy/30 w-4 flex-shrink-0">{i + 1}.</span>
          )}
          <span className="text-xs font-mono font-medium text-navy break-all">{id}</span>
        </div>
      ))}
    </div>
  );
};
