import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { BottomNav } from '../attendance/BottomNav';

export const AppLayout = () => {
  const user = useSelector(selectCurrentUser);
  const location = useLocation();
  const [activeTabOverride, setActiveTabOverride] = useState(null);
  const [onTabChangeOverride, setOnTabChangeOverride] = useState(null);

  // Reset overrides when navigating away from the base dashboard route
  // to ensure BottomNav logic relies on URL for standalone pages.
  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveTabOverride(null);
      setOnTabChangeOverride(null);
    }
  }, [location.pathname]);

  return (
    <div className="app-shell relative min-h-screen bg-surface">
      <div className="flex-1 w-full max-w-[480px] md:max-w-2xl lg:max-w-5xl mx-auto bg-white/40 md:shadow-2xl md:my-8 md:rounded-[40px] overflow-hidden relative border border-white/20 backdrop-blur-sm min-h-[100dvh] md:min-h-[850px] mb-24 md:mb-12">
        <Outlet context={{ setActiveTab: setActiveTabOverride, setOnTabChange: setOnTabChangeOverride }} />
      </div>
      <BottomNav 
        user={user} 
        activeTab={activeTabOverride} 
        onTabChange={onTabChangeOverride} 
      />
    </div>
  );
};
