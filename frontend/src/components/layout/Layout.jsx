import { Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { BottomNav } from '../attendance/BottomNav';

export const Layout = () => {
  const user = useSelector(selectCurrentUser);

  return (
    <div className="app-shell relative min-h-screen bg-surface md:bg-navy transition-colors duration-700">
      <div className="flex-1 w-full max-w-[480px] md:max-w-2xl lg:max-w-5xl xl:max-w-[1360px] mx-auto bg-white md:shadow-[0_20px_50px_rgba(0,0,0,0.3)] md:my-10 md:rounded-[48px] overflow-hidden relative border border-white/10 backdrop-blur-md min-h-[100dvh] md:min-h-[90vh] mb-24 md:mb-12 transition-all duration-500">
        {/* context={{}} prevents useOutletContext() crash in AttendanceHome until it is migrated */}
        <Outlet context={{}} />
      </div>
      <BottomNav user={user} />
    </div>
  );
};
