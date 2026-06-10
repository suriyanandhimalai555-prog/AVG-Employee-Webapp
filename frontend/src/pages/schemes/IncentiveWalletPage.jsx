import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { useGetIncentiveWalletQuery, useGetIncentivesQuery } from '../../store/api/apiSlice';
import { SchemeCalendar } from '../../components/SchemeCalendar';
import { getCurrentPeriod } from '../../lib/schemePeriod';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SOURCE_META } from '../../lib/schemeConstants';

export const IncentiveWalletPage = () => {
  const navigate        = useNavigate();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState(getCurrentPeriod);

  const { data: wallet,  isLoading: walletLoading }  = useGetIncentiveWalletQuery({ startDate: period.startDate, endDate: period.endDate });
  const { data: history, isLoading: historyLoading } = useGetIncentivesQuery({ page, limit: 20, startDate: period.startDate, endDate: period.endDate });

  const total   = wallet?.totalBalance ?? 0;
  const rows    = history?.data ?? [];
  const hasMore = history?.total > page * 20;

  return (
    <div className="relative">
      <motion.div
        key="incentive_wallet"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="flex-1 pb-10 pt-4"
      >
        {/* Header */}
        <div className="px-6 mb-8 flex items-center gap-3">
          <button
            onClick={() => navigate('/money')}
            className="w-10 h-10 rounded-2xl bg-navy/5 flex items-center justify-center text-navy tactile-press"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-navy tracking-tight">Incentive Wallet</h2>
            <p className="text-xs font-medium text-navy/40 mt-0.5">Rewards earned for business you brought</p>
          </div>
        </div>

        {/* Period picker */}
        <div className="px-6 mb-5">
          <SchemeCalendar compact allowFuture onPeriodChange={(p) => { setPeriod(p); setPage(1); }} />
        </div>

        <div className="px-6 space-y-5">
          {/* Balance card */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-[32px] card-shadow relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
                <Sparkles size={24} aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold text-white/70 mb-1 uppercase tracking-widest">Total Earned</p>
              {walletLoading ? (
                <Loader2 className="animate-spin text-white" size={28} aria-hidden="true" />
              ) : (
                <p className="text-4xl font-bold text-white">{formatCurrency(total, { decimals: true })}</p>
              )}
            </div>
          </div>

          {/* Breakdown by source */}
          {!walletLoading && wallet?.breakdown?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-navy/40 uppercase tracking-widest mb-3">Breakdown</p>
              <div className="grid grid-cols-2 gap-3">
                {wallet.breakdown.map((b) => {
                  // schemeCode is more specific than sourceType — prefer it so Gold and
                  // Trading Academy show as their own cards instead of one "Schemes" bucket.
                  const key       = b.schemeCode || b.sourceType;
                  const meta      = SOURCE_META[key] || SOURCE_META.other;
                  const { Icon }  = meta;
                  return (
                    <div key={key} className="bg-white p-4 rounded-2xl card-shadow border border-navy/5">
                      <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center mb-2`}>
                        <Icon size={18} className={meta.color} aria-hidden="true" />
                      </div>
                      <p className="text-xs font-medium text-navy/40">{meta.label}</p>
                      <p className="text-lg font-bold text-navy">{formatCurrency(b.subtotal, { decimals: true })}</p>
                      <p className="text-xs text-navy/30">{b.count} credit{b.count !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transaction history */}
          <div>
            <p className="text-xs font-semibold text-navy/40 uppercase tracking-widest mb-3">History</p>
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
              </div>
            ) : rows.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl card-shadow border border-navy/5 text-center">
                <Sparkles size={32} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-navy/40">No incentives yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((item) => {
                  const meta     = SOURCE_META[item.scheme_code] || SOURCE_META[item.source_type] || SOURCE_META.other;
                  const { Icon } = meta;
                  return (
                    <div key={item.id} className="bg-white p-4 rounded-2xl card-shadow border border-navy/5 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={18} className={meta.color} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">
                          {item.source_description || meta.label}
                        </p>
                        <p className="text-xs text-navy/40">
                          By {item.credited_by_name} · {formatDate(item.created_at)}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-navy/30 truncate mt-0.5">{item.notes}</p>
                        )}
                      </div>
                      <p className="text-base font-bold text-emerald-600 flex-shrink-0">
                        {formatCurrency(item.amount, { decimals: true })}
                      </p>
                    </div>
                  );
                })}
                {hasMore && (
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="w-full py-3 rounded-2xl border border-navy/10 text-sm font-medium text-navy/50 tactile-press"
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default IncentiveWalletPage;
