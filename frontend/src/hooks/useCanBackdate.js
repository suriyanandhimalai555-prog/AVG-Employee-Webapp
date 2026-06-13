// Whether the current user may enter past business dates on scheme forms.
//
// Management can always backdate (it's the historical-data-entry account).
// Everyone else (branch admins) only while the management-controlled
// 'backdated entry' setting is on. The server enforces the same rule via
// assertBackdateAllowed — this hook only drives the date-input clamps.
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetBackdatedEntrySettingQuery } from '../store/api/apiSlice';

export const useCanBackdate = () => {
  const user = useSelector(selectCurrentUser);
  const isManagement = user?.role === 'management';
  // Skip the network call for management — they never need the flag.
  const { data } = useGetBackdatedEntrySettingQuery(undefined, { skip: isManagement });
  return isManagement || data?.enabled === true;
};
