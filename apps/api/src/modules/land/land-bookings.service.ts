// Bookings, payments, buyback schedule — branch_admin (and Management) write operations.
//
// Who does what:
//   Management  — creates sites/layouts/plots via land-sites.service
//   Branch Admin — creates bookings and records payments here
//   MD / all roles — read-only views
//
// Booking lifecycle:
//   booked       → after customer signs up (no money yet)
//   advance_paid → advance amount recorded (advance_full_payment mode only)
//   full_paid    → full payment recorded; 60 buyback payout rows auto-created
//   completed    → all 60 customer buyback payouts marked paid
//   cancelled    → booking voided; plot returns to 'available'
//   voided       → Management/MD correction; incentives clawed back
//
// Commission flow:
//   createBooking       → distributeSpot (one-time credit to referrer chain)
//   markPayoutPaid      → distributeMonthly (per buyback month, per-role cap)
//   voidBooking         → IncentiveService.reverseIncentives (claw back all)
//
// LandBookingsService is a facade: the methods live in focused sub-services, one per concern,
// and are spread back into this single object so routes, the scheme registry and
// other callers keep one import and one API. Add a method to the sub-service that
// owns its concern; add a new sub-service by importing and spreading it below.

import { LandBookingsReadService } from './land-bookings-read.service';
import { LandBookingsLifecycleService } from './land-bookings-lifecycle.service';
import { LandBuybackService } from './land-buyback.service';
import { LandBookingsCorrectionsService } from './land-bookings-corrections.service';

export const LandBookingsService = {
  // Reads: list (paged), detail, dashboard, booking-ref picker
  ...LandBookingsReadService,
  // Lifecycle: create, advance, full payment, extend, cancel
  ...LandBookingsLifecycleService,
  // Buyback schedule: read payouts, mark a month paid
  ...LandBuybackService,
  // MD / Management corrections (audited, incentives clawed back)
  ...LandBookingsCorrectionsService,
};
