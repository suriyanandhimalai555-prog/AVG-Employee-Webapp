import { Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { page } from '../../lib/motion';
import { BottomNav } from '../attendance/BottomNav';
import { PageHeader } from '../attendance/PageHeader';
import { Sidebar } from './Sidebar';
import { ScrollManager } from './ScrollManager';

/**
 * Global authenticated shell.
 *
 *  Mobile (<md):   floating phone-card layout + bottom nav  (unchanged)
 *  Desktop (md+):  full-screen sidebar + content shell (no rounded card)
 *
 * The mobile experience is deliberately preserved as-is — only the desktop
 * presentation is upgraded to a proper responsive workspace.
 */
export const Layout = () => {
  const user = useSelector(selectCurrentUser);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-surface md:flex">
      <ScrollManager />

      {/* Desktop-only sidebar */}
      <Sidebar />

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen md:min-h-0">
        <PageHeader />

        <main className="flex-1 w-full mx-auto max-w-[480px] md:max-w-none pb-28 md:pb-10">
          <div className="md:px-8 lg:px-12 md:py-6 md:max-w-[1400px] md:mx-auto w-full">
            {/* Enter-only route fade, keyed by pathname. Deliberately NOT wrapped
                in AnimatePresence: an exiting wrapper would keep rendering the
                live <Outlet/>, which re-resolves to the new lazy route and
                suspends mid-exit — the Suspense boundary above Layout then eats
                the animation and the page never mounts.
                context={{}} prevents useOutletContext() crash in pages until migrated. */}
            <motion.div
              key={location.pathname}
              variants={page}
              initial="initial"
              animate="animate"
            >
              <Outlet context={{}} />
            </motion.div>
          </div>
        </main>
      </div>

      {/* Mobile-only bottom nav */}
      <BottomNav user={user} />
    </div>
  );
};
