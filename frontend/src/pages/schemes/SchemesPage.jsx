import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
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

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
          </div>
        ) : (
          <div className="px-6 grid grid-cols-1 gap-4">
            {activeProjects.map(project => (
              <SchemeCard key={project.id} project={project} onNavigate={navigate} />
            ))}

            {/* Incentive Wallet — shared across all schemes */}
            <button
              onClick={() => navigate('/money/incentives')}
              className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left"
            >
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
              <div className="relative z-10 w-3/4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
                  <Sparkles size={24} aria-hidden="true" />
                </div>
                <p className="text-xl font-bold text-white mb-1">Incentive Wallet</p>
                <p className="text-xs font-medium text-white/70">Commissions earned across all schemes</p>
              </div>
              <div className="relative z-10 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mt-2 group-hover:bg-white/30 transition-colors">
                <ArrowRight size={20} className="text-white" aria-hidden="true" />
              </div>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SchemesPage;
