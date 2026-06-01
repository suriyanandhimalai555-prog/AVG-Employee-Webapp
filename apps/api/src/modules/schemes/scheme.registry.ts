// Scheme registry.
//
// Maps schemeCode (matches projects.code in the DB) to the SchemeService
// implementation. Used by cross-scheme code that needs to iterate over every
// scheme without hard-coding which schemes exist.
//
// Adding a new scheme:
//   1. Implement SchemeService in your scheme's service file (set schemeCode,
//      add getBranchSummary).
//   2. Import the service here and add one line to SCHEME_REGISTRY.
//   3. Done — cross-scheme dashboards, reports, etc. pick it up automatically.

import type { SchemeService } from './scheme.contract';
import { GoldService }            from '../gold/gold.service';
import { TradingAcademyService }  from '../trading-academy/trading-academy.service';
import { GoldCoinService }        from '../gold-coin/gold-coin.service';
import { LSSService }             from '../lss/lss.service';

export const SCHEME_REGISTRY: Record<string, SchemeService> = {
  gold_scheme:      GoldService,
  trading_academy:  TradingAcademyService,
  gold_coin_scheme: GoldCoinService,
  lss_scheme:       LSSService,
};

export function getScheme(code: string): SchemeService | undefined {
  return SCHEME_REGISTRY[code];
}

export function listSchemes(): SchemeService[] {
  return Object.values(SCHEME_REGISTRY);
}
