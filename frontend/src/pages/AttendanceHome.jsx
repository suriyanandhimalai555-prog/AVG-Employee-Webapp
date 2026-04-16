import { useAttendanceSocket } from './attendance/hooks/useAttendanceSocket';
import { HomeTab } from './attendance/HomeTab';

/**
 * Route component for "/".
 * Maintains the live Socket.io connection and renders the Home tab.
 * All view-switching state has been removed — each screen is now its own route.
 */
export const AttendanceHome = () => {
  // Maintains a live Socket.io connection — invalidates RTK Query cache when
  // the worker confirms attendance has been persisted to the database.
  useAttendanceSocket();

  return <HomeTab />;
};
