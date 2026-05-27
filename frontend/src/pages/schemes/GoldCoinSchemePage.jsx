// Gold Coin Scheme landing page.
// Sections:
//   1. Branch summary strip (total slots / held / won / collected / commission)
//   2. Room status filter chips
//   3. Room list — each card shows package, room number, status, fill progress
//   4. Packages reference (the 10 price points seeded in migration 031)
//
// Slot purchase + room activation + draw triggering are implemented as
// dedicated sub-pages/modals later; this page is the hub.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Loader2, Coins, Users, CheckCircle2, AlertTriangle, Clock, Plus, ShieldCheck } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetGoldCoinPackagesQuery,
  useGetGoldCoinRoomsQuery,
  useGetGoldCoinSummaryQuery,
} from '../../store/api/apiSlice';
import EmptyState from '../../components/EmptyState';
import { formatCurrency } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';

const WRITER_ROLES      = new Set(['branch_admin']);
const VIEWER_ROLES      = new Set(['branch_admin', 'md', 'director', 'gm']);
const HEAD_BRANCH_VIEW_ROLES = new Set(['md', 'director']);

const STATUS_FILTERS = [
  ['all',             'All'],
  ['filling',         'Filling'],
  ['pending_combine', 'Pending'],
  ['active',          'Active'],
  ['completed',       'Done'],
];

const STATUS_STYLES = {
  filling:         { label: 'Filling',         className: 'bg-blue-50 text-blue-600',       Icon: Clock },
  pending_combine: { label: 'Pending combine', className: 'bg-amber-50 text-amber-700',     Icon: AlertTriangle },
  combined_into:   { label: 'Combined',        className: 'bg-navy/5 text-navy/60',         Icon: Users },
  expired:         { label: 'Expired',         className: 'bg-red-50 text-red-600',         Icon: AlertTriangle },
  active:          { label: 'Active',          className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  completed:       { label: 'Completed',       className: 'bg-indigo/10 text-indigo',       Icon: CheckCircle2 },
};

export const GoldCoinSchemePage = () => {
  const navigate = useNavigate();
  const user         = useSelector(selectCurrentUser);
  const canSell      = WRITER_ROLES.has(user?.role);
  const canViewRooms = VIEWER_ROLES.has(user?.role);
  // Head-branch admin gets the action page; MD / Director get the read-only audit view.
  const canSeeHeadBranch =
    (user?.role === 'branch_admin' && user?.isHeadBranch === true)
    || HEAD_BRANCH_VIEW_ROLES.has(user?.role);
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: summary } = useGetGoldCoinSummaryQuery();
  const { data: packages = [], isLoading: pkgLoading } = useGetGoldCoinPackagesQuery();
  const { data: roomsResult, isLoading: roomsLoading } = useGetGoldCoinRoomsQuery(
    { status: statusFilter === 'all' ? undefined : statusFilter, limit: 100 },
    { skip: !canViewRooms },
  );
  const rooms = roomsResult?.data || [];

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes"
        title="Gold Coin Scheme"
        subtitle="One-time investment · 16-slot rooms · monthly draws on the 12th"
        action={(canSell || canSeeHeadBranch) ? (
          <div className="flex items-center gap-2">
            {canSeeHeadBranch && (
              <button
                type="button"
                onClick={() => navigate('/money/schemes/gold-coin/head')}
                aria-label="Head branch console"
                className="w-10 h-10 rounded-2xl bg-white border border-navy/10 flex items-center justify-center text-navy/70 shadow-sm tactile-press"
              >
                <ShieldCheck size={18} aria-hidden="true" />
              </button>
            )}
            {canSell && (
              <button
                type="button"
                onClick={() => navigate('/money/schemes/gold-coin/add')}
                aria-label="Sell a gold-coin slot"
                className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-white shadow-md tactile-press"
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : null}
      />

      {/* Summary strip */}
      {summary && (
        <div className="px-4 mb-5">
          <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5 grid grid-cols-4 divide-x divide-navy/5">
            {[
              { label: 'Slots',      val: summary.totalSlots },
              { label: 'Held',       val: summary.heldSlots },
              { label: 'Won',        val: summary.wonSlots },
              { label: 'Refunded',   val: summary.refundedSlots },
            ].map((s) => (
              <div key={s.label} className="px-2 text-center">
                <p className="text-2xl font-bold text-navy">{s.val ?? 0}</p>
                <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-3 card-shadow border border-navy/5">
              <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">Total collected</p>
              <p className="text-xl font-bold text-navy mt-1">{formatCurrency(summary.totalCollected || 0)}</p>
            </div>
            <div className="bg-white rounded-2xl p-3 card-shadow border border-navy/5">
              <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">Commission paid</p>
              <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(summary.totalCommission || 0)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Status filter chips — only for roles that can see rooms */}
      {canViewRooms && (
        <div className="px-4 mb-4 flex gap-2 overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap tactile-press ${
                statusFilter === key
                  ? 'bg-navy text-white'
                  : 'bg-white text-navy/60 border border-navy/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Rooms list */}
      <div className="px-4 mb-8">
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-3">Rooms</p>
        {!canViewRooms ? (
          <EmptyState
            icon={Coins}
            title="Room view not available"
            message="Your role can only see your own scheme summary."
          />
        ) : roomsLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-indigo" size={24} aria-hidden="true" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 card-shadow border border-navy/5 text-center">
            <Coins size={32} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-navy/40">No rooms yet</p>
            <p className="text-xs text-navy/30 mt-1">Sell a slot to open the first room.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => {
              const style = STATUS_STYLES[room.status] || STATUS_STYLES.filling;
              const { Icon } = style;
              const filled = room.slots_filled ?? 0;
              const draws  = room.draws_done   ?? 0;
              const progressPct = room.status === 'active' || room.status === 'completed'
                ? (draws / 16) * 100
                : (filled / 16) * 100;

              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => navigate(`/money/schemes/gold-coin/${room.id}`)}
                  className="w-full bg-white rounded-2xl p-4 card-shadow border border-navy/5 text-left tactile-press"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-bold text-navy">
                        {room.package_name} · Room #{room.room_number}
                        {room.is_combined && (
                          <span className="ml-2 text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                            COMBINED
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-navy/40 mt-0.5">
                        {room.branch_name} · {formatCurrency(parseFloat(room.package_price))} · {room.package_gold_grams}GM
                      </p>
                    </div>
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${style.className}`}>
                      <Icon size={11} aria-hidden="true" />
                      {style.label}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-navy/50 font-medium mb-1.5">
                    <span>
                      {room.status === 'active' || room.status === 'completed'
                        ? `${draws}/16 draws done`
                        : `${filled}/16 slots filled`}
                    </span>
                    <span>{Math.round(progressPct)}%</span>
                  </div>
                  <div className="h-1.5 bg-navy/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Packages reference — mirrors the One Time Investment chart */}
      <div className="px-4 mb-8">
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-3">Packages</p>
        {pkgLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-indigo" size={20} aria-hidden="true" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-navy/5 text-[9px] font-bold text-navy/50 uppercase tracking-widest">
              <span>Package</span>
              <span className="text-right">Gold coin</span>
              <span className="text-right">Full room</span>
              <span className="text-right">Total coins</span>
            </div>
            <div className="divide-y divide-navy/5">
              {packages.map((pkg) => (
                <div key={pkg.id} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-4 py-2.5 items-center">
                  <span className="text-sm font-bold text-amber-700">{formatCurrency(pkg.price)}</span>
                  <span className="text-xs font-semibold text-navy text-right">{pkg.goldGrams} GM</span>
                  <span className="text-sm font-bold text-navy text-right">{formatCurrency(pkg.price * 16)}</span>
                  <span className="text-xs font-semibold text-navy text-right">{pkg.goldGrams * 16} GM</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SchemePageWrapper>
  );
};

export default GoldCoinSchemePage;
