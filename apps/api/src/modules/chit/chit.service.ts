// ChitService is a facade: the methods live in focused sub-services, one per concern,
// and are spread back into this single object so routes, the scheme registry and
// other callers keep one import and one API. Add a method to the sub-service that
// owns its concern; add a new sub-service by importing and spreading it below.

import { ChitPackagesService } from './packages.service';
import { ChitGroupsService } from './groups.service';
import { ChitMembersService } from './members.service';
import { ChitPaymentsService } from './payments.service';
import { ChitWinnersService } from './winners.service';
import { ChitCorrectionsService } from './corrections.service';
import { ChitCombineService } from './combine.service';
import { ChitReportsService } from './reports.service';
import { SCHEME_CODE } from './chit.shared';

export const ChitService = {
  schemeCode: SCHEME_CODE,
  // Package catalogue (read + config edit)
  ...ChitPackagesService,
  // Groups: create, list (paged + search), detail
  ...ChitGroupsService,
  // Member cards: add, cancel, reinstate, refund
  ...ChitMembersService,
  // Monthly instalments
  ...ChitPaymentsService,
  // Monthly winner selection
  ...ChitWinnersService,
  // MD / Management corrections (audited)
  ...ChitCorrectionsService,
  // Head-branch combine / expire of under-filled groups
  ...ChitCombineService,
  // SchemeService contract: summaries and per-branch reports
  ...ChitReportsService,
};
