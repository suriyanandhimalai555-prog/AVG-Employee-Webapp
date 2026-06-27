import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Clock, ChevronRight } from 'lucide-react';
import { useGetMoneyProjectsQuery } from '../../store/api/apiSlice';
import { SchemeCard } from './components/SchemeCard';

export const SchemesPage = () => {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useGetMoneyProjectsQuery({});
  const activeProjects = projects.filter(p => p.is_active);

  return (
    <div className="relative">
      <motion.div
        key="schemes_page"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="flex-1 pb-10 pt-4"
      >
        {/* Header */}
        <div className="px-6 mb-8 flex items-center gap-3">
          <button
            onClick={() => navigate('/money')}
            className="w-10 h-10 rounded-2xl bg-navy/5 flex items-center justify-center text-navy tactile-press"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-navy tracking-tight">Schemes</h2>
            <p className="text-xs font-medium text-navy/40 mt-0.5">All company schemes &amp; projects</p>
          </div>
        </div>

        {/* Pending enrollments (deposits awaiting their balance) */}
        <div className="px-6 mb-4">
          <button
            type="button"
            onClick={() => navigate('/money/schemes/pending')}
            className="w-full flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-2xl p-4 tactile-press"
          >
            <span className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Clock size={18} className="text-orange-600" aria-hidden="true" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-bold text-navy">Pending Enrollments</span>
              <span className="block text-[11px] font-medium text-navy/40">Deposits awaiting their balance</span>
            </span>
            <ChevronRight size={18} className="text-navy/30" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
          </div>
        ) : (
          <div className="px-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeProjects.map(project => (
              <SchemeCard key={project.id} project={project} onNavigate={navigate} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SchemesPage;
