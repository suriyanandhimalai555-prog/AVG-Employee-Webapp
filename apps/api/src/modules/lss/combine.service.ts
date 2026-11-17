// LSS — combine / refund of under-filled rooms (head-branch admin only).
//
// The logic is shared with Gold Coin and lives in ../room-schemes/combine.service.ts;
// this file only binds it to LSS's tables and room rules. Rooms hold 20 slots, so a
// combine moves the first 20 held slots (paid_at ASC) into the new head-branch room.

import { createRoomCombineService } from '../room-schemes/combine.service';
import { LSS_FILL_WINDOW_DAYS, LSS_SLOTS_PER_ROOM } from './rooms.service';

export const CombineService = createRoomCombineService({
  roomsTable:     'lss_rooms',
  slotsTable:     'lss_slots',
  packageColumn:  'plan_id',
  errorPrefix:    'LSS',
  slotsPerRoom:   LSS_SLOTS_PER_ROOM,
  fillWindowDays: LSS_FILL_WINDOW_DAYS,
});
