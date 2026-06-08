// Individual scheme card with expandable commission panel.
// Navigable schemes (gold, trading academy) show their commission panel always visible
// and navigate on tap. Non-navigable schemes expand inline to show commission info.
import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { CommissionPanel } from './CommissionPanel';
import { BuildersCommissionSummary } from './BuildersCommissionSummary';
import { NAVIGABLE_SCHEMES, getSchemeStyle } from '../../../lib/schemeConstants';

export const SchemeCard = ({ project, onNavigate }) => {
  const [expanded, setExpanded] = useState(false);
  const { Icon, gradient } = getSchemeStyle(project.name, project.code);
  const route      = NAVIGABLE_SCHEMES[project.code];
  const showPanel  = !!route || expanded;

  const handleClick = () => {
    if (route) {
      onNavigate(route);
    } else {
      setExpanded(e => !e);
    }
  };

  return (
    <div className="rounded-[32px] overflow-hidden card-shadow">
      <button
        onClick={handleClick}
        className={`${gradient} p-6 w-full flex items-start justify-between relative overflow-hidden text-left tactile-press group`}
      >
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
        <div className="relative z-10 w-3/4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
            <Icon size={24} aria-hidden="true" />
          </div>
          <p className="text-xl font-bold text-white mb-1">{project.name}</p>
          <p className="text-xs font-medium text-white/70">
            {route ? 'Tap to open' : 'Tap to see commission structure'}
          </p>
        </div>
        <div className="relative z-10 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mt-2 group-hover:bg-white/30 transition-colors">
          {route ? (
            <ArrowRight size={20} className="text-white" aria-hidden="true" />
          ) : expanded ? (
            <ChevronUp size={18} className="text-white" aria-hidden="true" />
          ) : (
            <ChevronDown size={18} className="text-white" aria-hidden="true" />
          )}
        </div>
      </button>

      {showPanel && (
        <div className="bg-white border-t border-navy/5 px-5 py-4">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest mb-3">
            Commission per deal
          </p>
          {project.code === 'builders_scheme'
            ? <BuildersCommissionSummary />
            : <CommissionPanel projectId={project.id} />
          }
        </div>
      )}
    </div>
  );
};
