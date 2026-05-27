// Scheme contract.
//
// Every scheme module (gold, trading academy, future chit funds, insurance, …)
// has scheme-specific tables and a scheme-specific addMember signature — those
// genuinely differ per domain and live in the scheme's own files.
//
// What every scheme MUST share is:
//   1. A stable schemeCode that matches projects.code in the DB.
//   2. A getBranchSummary(db, branchId, scopedToUserId?, dateFilter?) method
//      so cross-scheme code (admin dashboards, branch-wide reports, total
//      commission across all schemes) can iterate the registry without
//      knowing each scheme's internal shape.
//
// Anything beyond that is the scheme's own business.

import type { Pool, PoolClient } from 'pg';

export interface SchemeDateFilter {
  startDate?: string;
  endDate?:   string;
}

// Stable per-branch row returned by every scheme's getOverviewByBranch().
// Keeping this stable (rather than scheme-specific) lets the aggregate route
// stitch together cards across schemes without per-scheme branching.
export interface SchemeBranchTotals {
  branchId:   string;
  branchName: string;
  count:      number;   // members / slots / enrollments — whatever a scheme counts
  collected:  number;   // money flowed in for this scheme in this branch (excl. refunds)
  commission: number;   // payouts to employees via employee_incentives.scheme_code
}

export interface SchemeService {
  // Matches projects.code; the registry is keyed by this.
  schemeCode: string;

  // Branch-scoped summary. scopedToUserId narrows results to one referrer
  // (Sales Officer / ABM / BM / GM personal view). Shape is scheme-specific.
  getBranchSummary(
    db: Pool | PoolClient,
    branchId: string,
    scopedToUserId?: string,
    dateFilter?: SchemeDateFilter,
  ): Promise<any>;

  // ─── Optional aggregate hooks (used by /api/schemes/* admin routes) ──────
  // Implemented by schemes that want to show up in the MD/Director Schemes
  // dashboard. A scheme without these stays invisible to the dashboard — no
  // forced upgrades, no shims.
  getOverviewByBranch?(
    db: Pool | PoolClient,
    dateFilter?: SchemeDateFilter,
  ): Promise<SchemeBranchTotals[]>;

  // Per-scheme, per-branch list of entries (members / rooms / slots — the
  // scheme picks). The shape is scheme-specific by design: the dashboard
  // renders a scheme-aware template, not a generic one.
  getEntriesByBranch?(
    db: Pool | PoolClient,
    branchId: string,
    dateFilter?: SchemeDateFilter,
  ): Promise<any[]>;
}
