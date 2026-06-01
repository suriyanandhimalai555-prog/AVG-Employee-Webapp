// LSS room status machine.
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

const ALLOWED: Record<RoomStatus, RoomStatus[]> = {
  filling:         ['pending_combine', 'active'],
  pending_combine: ['filling', 'combined_into', 'expired'],
  combined_into:   [],
  expired:         [],
  active:          ['completed'],
  completed:       [],
};

export function assertTransition(from: RoomStatus, to: RoomStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new ValidationError(
      `Illegal room status transition: ${from} → ${to}`,
      'ROOM_INVALID_TRANSITION',
    );
  }
}

export function isStaleFilling(status: RoomStatus, deadline: Date): boolean {
  return status === 'filling' && deadline.getTime() <= Date.now();
}

export function nextDrawDate(from: Date = new Date()): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  if (d <= 12) return new Date(Date.UTC(y, m, 12));
  return new Date(Date.UTC(y, m + 1, 12));
}
