// Gold Coin room status machine.
//
// Centralises the legal transitions so every service uses the same rules.
// If a transition isn't in ALLOWED, the assert helper throws ValidationError.

import { ValidationError } from '../../shared/errors';

export type RoomStatus =
  | 'filling'
  | 'pending_combine'
  | 'combined_into'
  | 'expired'
  | 'active'
  | 'completed';

// from → set of valid `to` statuses
const ALLOWED: Record<RoomStatus, RoomStatus[]> = {
  filling:         ['pending_combine', 'active'],
  pending_combine: ['filling', 'combined_into', 'expired'],
  combined_into:   [],            // terminal
  expired:         [],            // terminal
  active:          ['completed'],
  completed:       [],            // terminal
};

export function assertTransition(from: RoomStatus, to: RoomStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new ValidationError(
      `Illegal room status transition: ${from} → ${to}`,
      'ROOM_INVALID_TRANSITION',
    );
  }
}

// True when a room's deadline has passed and it's still 'filling' — the
// caller should promote it to 'pending_combine' on read.
export function isStaleFilling(status: RoomStatus, deadline: Date): boolean {
  return status === 'filling' && deadline.getTime() <= Date.now();
}

// The next 12th-of-the-month on or after `from`. If `from` is the 12th, returns
// the same date. If `from` is the 13th, returns the next month's 12th.
export function nextDrawDate(from: Date = new Date()): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  if (d <= 12) return new Date(Date.UTC(y, m, 12));
  return new Date(Date.UTC(y, m + 1, 12));
}
