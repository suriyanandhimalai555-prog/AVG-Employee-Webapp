// Gold Coin — combine / refund of under-filled rooms (head-branch admin only).
//
// The logic is shared with LSS and lives in ../room-schemes/combine.service.ts; this
// file only binds it to Gold Coin's tables and room rules. Rooms hold 16 slots, so a
// combine moves the first 16 held slots (paid_at ASC) into the new head-branch room.

import { createRoomCombineService } from '../room-schemes/combine.service';
import { GC_FILL_WINDOW_DAYS, GC_SLOTS_PER_ROOM } from './rooms.service';

export const CombineService = createRoomCombineService({
  roomsTable:     'gold_coin_rooms',
  slotsTable:     'gold_coin_slots',
  packageColumn:  'package_id',
  errorPrefix:    'GC',
  slotsPerRoom:   GC_SLOTS_PER_ROOM,
  fillWindowDays: GC_FILL_WINDOW_DAYS,
});
