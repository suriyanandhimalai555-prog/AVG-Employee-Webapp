import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { PageHeader } from '../attendance/PageHeader';

/**
 * Navbar — wraps PageHeader with Redux user state injected.
 * Used once pages stop embedding PageHeader directly.
 */
export const Navbar = ({ title }) => {
  const user = useSelector(selectCurrentUser);
  return <PageHeader user={user} title={title || 'Workforce'} />;
};
