// SchemeCorrectionsPage — management super-admin correction centre.
//
// Fixes applied vs. original:
//   1. Payment queries now pass branchId as a query param so Management
//      (branch_id = NULL on the account) can actually fetch payment rows.
//   2. "Add Payment" form in every payments panel lets Management record
//      a missed payment for any date; incentives flow through the existing
//      add-payment service methods (one source of truth — no duplication).
//   3. Chit scheme now drills into individual members inside each group so
//      they are correctable; original only showed group-level rows.
//
// Audit, incentive clawback on void/unpay, and the correction write path
// are all unchanged — they were already production-correct on the backend.
//
// This file is the page shell only: filters, the paged + searchable entry list, and
// which card each scheme renders. The cards, forms and panels live in ./corrections/.

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Loader2, Search, X, ShieldAlert } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetSchemeBranchEntriesPagedInfiniteQuery } from '../../store/api/apiSlice';
import { isSchemeAdmin } from '../../lib/schemeAuth';
import { BranchPicker } from '../../components/BranchPicker';
import { usePagedList } from '../../hooks/usePagedList';
import LoadMoreFooter from '../../components/LoadMoreFooter';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { SCHEMES, SEARCH_PLACEHOLDER, SEARCH_DEBOUNCE_MS } from './corrections/constants';
import { useSchemeActions } from './corrections/useSchemeActions';
import { ChitGroupCard } from './corrections/ChitCards';
import { EntryCard } from './corrections/EntryCard';
import { LssRoomCorrectionsCard } from './corrections/RoomCards';
import { AuditHistory } from './corrections/AuditHistory';

export const SchemeCorrectionsPage = () => {
  const user = useSelector(selectCurrentUser);

  const [schemeCode, setSchemeCode] = useState('gold_scheme');
  const [branchId,   setBranchId]   = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [search,     setSearch]     = useState('');
  const [filterError, setFilterError] = useState('');
  // The filter set last confirmed with "Load Entries". The list, its cards and every
  // correction action use THESE values — not the live form fields — so changing the
  // scheme/branch dropdown without reloading can never mis-route a correction.
  const [loaded, setLoaded] = useState(null);
  // Search term actually sent to the server (debounced copy of `search`).
  const [appliedSearch, setAppliedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // Paged list ("Load more"). Filters and search are applied by the server, so every
  // entry in the branch is reachable — by paging or by searching.
  const paged = usePagedList(
    useGetSchemeBranchEntriesPagedInfiniteQuery,
    { ...loaded, search: appliedSearch || undefined },
    { skip: !loaded },
  );
  const { isFetching, refetch } = paged;
  // RTK Query keeps the previous response while new args load. Only show it when it
  // belongs to the loaded scheme + branch; otherwise old-scheme rows would render
  // inside the new scheme's cards for a moment.
  const data = loaded
    && paged.firstPage?.schemeCode === loaded.code
    && paged.firstPage?.branchId === loaded.branchId
    ? paged
    : undefined;

  const actions     = useSchemeActions();
  const chitActions = actions.agila_chit_scheme;

  if (!isSchemeAdmin(user?.role)) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/control-center" title="Corrections" />
        <div className="px-4 pt-8 text-center">
          <ShieldAlert size={28} className="text-navy/20 mx-auto mb-2" />
          <p className="text-sm font-bold text-navy">Access restricted</p>
          <p className="text-xs text-navy/40 mt-1">Only MD or Management can access the corrections center.</p>
        </div>
      </SchemePageWrapper>
    );
  }

  const handleApply = () => {
    setFilterError('');
    if (!branchId) { setFilterError('Please select a branch.'); return; }
    if (startDate && endDate && startDate > endDate) { setFilterError('"From" date must be on or before the "To" date.'); return; }
    const next = { code: schemeCode, branchId, startDate: startDate || undefined, endDate: endDate || undefined };
    const unchanged = loaded
      && loaded.code === next.code && loaded.branchId === next.branchId
      && loaded.startDate === next.startDate && loaded.endDate === next.endDate
      && !appliedSearch;
    // Reset the search together with the filters so the new list starts unfiltered.
    setSearch('');
    setAppliedSearch('');
    setLoaded(next);
    // Same filters again = the user wants fresh data, not the cached response.
    if (unchanged) refetch();
  };

  // Everything below renders from the LOADED filter set (see `loaded` above).
  const activeCode     = loaded?.code;
  const activeBranchId = loaded?.branchId;
  const entries        = data?.rows ?? [];
  const total          = data?.total ?? entries.length;
  const schemeActions  = actions[activeCode];
  const isChit         = activeCode === 'agila_chit_scheme';
  const isRoomScheme   = activeCode === 'gold_coin_scheme' || activeCode === 'lss_scheme';

  // `q` is the term the visible list was fetched with; `searchPending` covers the
  // debounce gap + the request, so we never show "No matches" for a half-typed term.
  const q = appliedSearch;
  const searchPending = search.trim() !== appliedSearch || (isFetching && !paged.isLoadingMore);

  return (
    <SchemePageWrapper>
      <SchemePageHeader backTo="/control-center" title="Corrections" subtitle="Edit or void scheme entries" />

      <div className="px-4 space-y-3 mb-4">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Scheme</label>
          <select value={schemeCode} onChange={(e) => setSchemeCode(e.target.value)}
            className="w-full px-4 py-3 bg-navy/3 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 appearance-none">
            {SCHEMES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Branch *</label>
          <BranchPicker value={branchId} onChange={setBranchId} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-navy/3 rounded-xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20" />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-navy/3 rounded-xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20" />
          </div>
        </div>

        {filterError && <p className="text-xs text-red-600 font-medium">{filterError}</p>}

        <button type="button" onClick={handleApply} disabled={isFetching && !appliedSearch}
          className="w-full py-3.5 rounded-2xl bg-stone-700 text-white text-sm font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-2">
          {isFetching && !appliedSearch
            ? <><Loader2 size={16} className="animate-spin" /> Loading…</>
            : <><Search size={16} /> Load Entries</>}
        </button>
      </div>

      {data && (
        <div className="px-4 space-y-3">
          {/* Server-side search across EVERY entry of the loaded scheme + branch (+ dates).
              Always visible once loaded — a search with zero hits must stay editable. */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/30 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); }}
              placeholder={SEARCH_PLACEHOLDER[activeCode] || 'Search…'}
              aria-label="Search entries"
              className="w-full pl-8 pr-9 py-2.5 bg-navy/3 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20"
            />
            {search && searchPending ? (
              <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/30 animate-spin" aria-hidden="true" />
            ) : search ? (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/30 hover:text-navy/60">
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {entries.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-border card-shadow text-center">
              {searchPending ? (
                <Loader2 size={18} className="animate-spin text-navy/30 mx-auto" aria-hidden="true" />
              ) : (
                <>
                  <p className="text-sm font-bold text-navy">{q ? 'No matches' : 'No entries found'}</p>
                  <p className="text-xs text-navy/40 mt-1">
                    {q
                      ? `Nothing in this branch matches "${q}"${loaded?.startDate || loaded?.endDate ? ' within the selected dates' : ''}.`
                      : 'Try different filters.'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40">
                {/* total = every match in the branch, not just the pages loaded so far */}
                {`${total} ${q ? (total === 1 ? 'match' : 'matches') : (total === 1 ? 'entry' : 'entries')}`}
                {data?.hasMore ? ` · newest ${entries.length} shown` : ''}
              </p>
              {entries.map((entry) =>
                isChit ? (
                  // Chit shows groups; drill into members for individual corrections.
                  <ChitGroupCard
                    key={entry.id}
                    entry={entry}
                    branchId={activeBranchId}
                    chitActions={chitActions}
                  />
                ) : isRoomScheme ? (
                  // Gold-coin / LSS show rooms; slot-level actions live in RoomSlotsPanel.
                  // For LSS rooms, a delete-room action is also available here.
                  <LssRoomCorrectionsCard
                    key={entry.id}
                    entry={entry}
                    branchId={activeBranchId}
                    schemeCode={activeCode}
                    schemeActions={schemeActions}
                  />
                ) : (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    schemeCode={activeCode}
                    branchId={activeBranchId}
                    actions={schemeActions}
                  />
                )
              )}
              {/* Older entries: load the next page here, or search to jump straight to one. */}
              <LoadMoreFooter
                shown={entries.length}
                total={total}
                hasMore={Boolean(data?.hasMore)}
                onLoadMore={data?.loadMore}
                loading={paged.isLoadingMore}
                noun={q ? 'matches' : 'entries'}
              />
            </>
          )}
          <AuditHistory schemeCode={activeCode} />
        </div>
      )}
    </SchemePageWrapper>
  );
};

export default SchemeCorrectionsPage;
