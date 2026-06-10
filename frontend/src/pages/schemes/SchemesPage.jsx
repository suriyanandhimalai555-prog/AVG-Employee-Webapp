import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
