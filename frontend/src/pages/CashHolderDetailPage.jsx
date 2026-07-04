import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Wallet, Loader2, MapPin,
  Calendar, Banknote, AlertCircle, User2, Briefcase,
} from 'lucide-react';
import { useGetCashHolderDetailQuery } from '../store/api/apiSlice';
import { PhotoProof } from '../components/money/PhotoProof';

const MODE_META = {
  cash:          { label: 'Cash in Hand',  cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  cash_transfer: { label: 'Cash Transfer', cls: 'bg-orange-50 text-orange-600 border-orange-100' },
  gpay:          { label: 'Google Pay',    cls: 'bg-indigo/5 text-indigo border-indigo/10' },
  bank_receipt:  { label: 'Bank Receipt',  cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
};

export const CashHolderDetailPage = () => {
  const { holderId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useGetCashHolderDetailQuery(holderId, {
    skip: !holderId,
  });

  const holder = data?.holder;
  const collections = data?.collections ?? [];

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 left-4 z-[200] flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-2xl shadow-xl text-[10px] font-bold text-navy uppercase tracking-widest tactile-press"
      >
        <ArrowRight className="rotate-180" size={14} /> Back
      </button>

      <div className="max-w-lg mx-auto px-4 pt-20 space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-[10px] font-bold text-navy/25 uppercase tracking-[0.3em] font-mono mb-1">Cash Holdings</p>
          <h1 className="text-3xl font-bold text-navy tracking-tight leading-tight">
            {holder?.name ?? (isLoading ? '…' : 'Unknown')}
          </h1>
          {holder && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-[10px] font-bold text-navy/30 uppercase tracking-widest capitalize">
                {holder.role?.replace(/_/g, ' ')}
              </span>
              {holder.branch_name && (
                <span className="flex items-center gap-1 text-[10px] text-navy/25 font-medium">
                  <MapPin size={9} />{holder.branch_name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Total held hero card */}
        {holder && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl p-6 shadow-lg shadow-amber-200/60"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-bold text-white/60 uppercase tracking-[0.25em] mb-1">Total Holding</p>
                <p className="text-4xl font-bold text-white tracking-tight">
                  ₹{parseFloat(holder.amount_held).toLocaleString()}
                </p>
                <p className="text-[10px] font-medium text-white/50 mt-2">
                  {collections.length} {collections.length === 1 ? 'entry' : 'entries'} · pending forwarding
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <Wallet size={22} className="text-white" />
              </div>
            </div>
          </motion.div>
        )}

        {/* Loading / Error */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-navy/20" />
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-medium">
            <AlertCircle size={16} className="shrink-0" />
            Failed to load cash details.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && collections.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-navy/[0.03] flex items-center justify-center mx-auto">
              <Banknote size={28} className="text-navy/10" />
            </div>
            <p className="text-sm font-bold text-navy/30 uppercase tracking-widest">No cash held</p>
          </div>
        )}

        {/* Section label */}
        {collections.length > 0 && (
          <p className="text-[10px] font-bold text-navy/25 uppercase tracking-[0.25em] font-mono px-1">
            Cash Entries
          </p>
        )}

        {/* Collection cards */}
        <div className="space-y-3">
          {collections.map((col, idx) => {
            const meta = MODE_META[col.mode] ?? { label: col.mode, cls: 'bg-navy/5 text-navy/40 border-navy/10' };
            return (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white rounded-xl card-shadow border border-border overflow-hidden"
              >
                {/* Top strip: amount + mode badge */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <p className="text-2xl font-bold text-navy tracking-tight">
                    ₹{parseFloat(col.amount).toLocaleString()}
                  </p>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl border ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Divider */}
                <div className="mx-5 h-px bg-navy/5" />

                {/* Detail rows */}
                <div className="px-5 py-4 space-y-2.5">

                  {/* Client name — prominent */}
                  {col.client_name && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-indigo/5 flex items-center justify-center shrink-0 mt-0.5">
                        <User2 size={11} className="text-indigo" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-navy/25 uppercase tracking-wider">
                          {col.mode === 'cash_transfer' ? 'Clients (bundled)' : 'Client'}
                        </p>
                        <p className="text-sm font-bold text-navy leading-snug">{col.client_name}</p>
                      </div>
                    </div>
                  )}

                  {/* Project */}
                  {col.project_name && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <Briefcase size={11} className="text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-navy/25 uppercase tracking-wider">Project</p>
                        <p className="text-sm font-bold text-navy leading-tight">{col.project_name}</p>
                      </div>
                    </div>
                  )}

                  {/* Submitted by + date row */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-medium text-navy/40">
                      From <span className="font-bold text-navy/60">{col.submitter_name}</span>
                      <span className="text-navy/30 capitalize"> · {col.submitter_role?.replace(/_/g, ' ')}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-medium text-navy/30">
                      <Calendar size={9} />
                      {new Date(col.submitted_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Proof photo — full bleed at bottom */}
                {col.photo_key && (
                  <div className="px-5 pb-5">
                    <PhotoProof photoKey={col.photo_key} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
