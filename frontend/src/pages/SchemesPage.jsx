import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Gem, Sparkles, Loader2,
  Building2, Landmark, Layers, CircleDollarSign,
  IndianRupee, ChevronDown, ChevronUp
} from 'lucide-react';
import { useGetMoneyProjectsQuery, useGetCommissionRulesQuery } from '../store/api/apiSlice';

// Projects that have a fully built data-entry flow → map name to route
const NAVIGABLE_SCHEMES = {
  'Monthly gold new':                   '/money/schemes/gold',
  'AGILAVETRI TRADING ACADEMY PVT LTD': '/money/schemes/trading-academy',
};

const SCHEME_STYLES = {
  gold:     { Icon: Gem,              gradient: 'bg-gradient-to-br from-amber-400 to-amber-500' },
  land:     { Icon: Landmark,         gradient: 'bg-gradient-to-br from-stone-500 to-stone-600' },
  builders: { Icon: Building2,        gradient: 'bg-gradient-to-br from-sky-500 to-sky-600' },
  chit:     { Icon: CircleDollarSign, gradient: 'bg-gradient-to-br from-violet-500 to-violet-600' },
  jewel:    { Icon: Gem,              gradient: 'bg-gradient-to-br from-rose-400 to-rose-500' },
  default:  { Icon: Layers,           gradient: 'bg-gradient-to-br from-indigo to-indigo/80' },
};

const getStyle = (name) => {
  const lower = name.toLowerCase();
  if (lower.includes('gold'))    return SCHEME_STYLES.gold;
  if (lower.includes('land'))    return SCHEME_STYLES.land;
  if (lower.includes('builder')) return SCHEME_STYLES.builders;
  if (lower.includes('chit'))    return SCHEME_STYLES.chit;
  if (lower.includes('jewel'))   return SCHEME_STYLES.jewel;
  return SCHEME_STYLES.default;
};

const ROLE_LABELS = {
  sales_officer:  'Sales Officer',
  abm:            'ABM',
  branch_manager: 'Branch Manager',
  gm:             'GM (Pillar)',
  branch_admin:   'Branch Admin',
};

const ROLE_ORDER = ['sales_officer', 'abm', 'branch_manager', 'gm', 'branch_admin'];

// Commission breakdown panel shown below a scheme card
const CommissionPanel = ({ projectId }) => {
  const { data: rules = [], isLoading } = useGetCommissionRulesQuery(projectId, { skip: !projectId });

  if (isLoading) return <div className="flex justify-center py-3"><Loader2 className="animate-spin text-navy/30" size={16} /></div>;
  if (rules.length === 0) return (
    <p className="text-xs text-navy/30 text-center py-2 italic">No commission rates configured yet</p>
  );

  const sorted = [...rules].sort((a, b) =>
    ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  return (
    <div className="space-y-1.5 pt-1">
      {sorted.map((rule) => (
        <div key={rule.role} className="flex items-center justify-between">
          <span className="text-xs font-medium text-navy/60">{ROLE_LABELS[rule.role] || rule.role}</span>
          <span className="text-xs font-bold text-navy flex items-center gap-0.5">
            <IndianRupee size={10} />{Number(rule.amount).toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  );
};

// Individual scheme card with expandable commission panel
const SchemeCard = ({ project, onNavigate }) => {
  const [expanded, setExpanded] = useState(false);
  const style     = getStyle(project.name);
  const Icon      = style.Icon;
  const route     = NAVIGABLE_SCHEMES[project.name];
  const showPanel = !!route || expanded;

  const handleClick = () => {
    if (route) {
      onNavigate(route);
    } else {
      setExpanded(e => !e);
    }
  };

  return (
    <div className="rounded-[32px] overflow-hidden card-shadow">
      {/* Main coloured card — all cards are clickable */}
      <button
        onClick={handleClick}
        className={`${style.gradient} p-6 w-full flex items-start justify-between relative overflow-hidden text-left tactile-press group`}
      >
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
        <div className="relative z-10 w-3/4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
            <Icon size={24} />
          </div>
          <p className="text-xl font-bold text-white mb-1">{project.name}</p>
          <p className="text-xs font-medium text-white/70">
            {route ? 'Tap to open' : 'Tap to see commission structure'}
          </p>
        </div>
        <div className="relative z-10 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mt-2 group-hover:bg-white/30 transition-colors">
          {route ? (
            <ArrowRight size={20} className="text-white" />
          ) : expanded ? (
            <ChevronUp size={18} className="text-white" />
          ) : (
            <ChevronDown size={18} className="text-white" />
          )}
        </div>
      </button>

      {/* Commission panel */}
      {showPanel && (
        <div className="bg-white border-t border-navy/5 px-5 py-4">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest mb-3">
            Commission per deal
          </p>
          <CommissionPanel projectId={project.id} />
        </div>
      )}
    </div>
  );
};

export const SchemesPage = () => {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useGetMoneyProjectsQuery({});
  const activeProjects = projects.filter((p) => p.is_active);

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
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-navy tracking-tight">Schemes</h2>
            <p className="text-xs font-medium text-navy/40 mt-0.5">All company schemes &amp; projects</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo" size={28} />
          </div>
        ) : (
          <div className="px-6 grid grid-cols-1 gap-4">
            {activeProjects.map((project) => (
              <SchemeCard
                key={project.id}
                project={project}
                onNavigate={navigate}
              />
            ))}

            {/* Incentive Wallet — common across all schemes */}
            <button
              onClick={() => navigate('/money/incentives')}
              className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left"
            >
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
              <div className="relative z-10 w-3/4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
                  <Sparkles size={24} />
                </div>
                <p className="text-xl font-bold text-white mb-1">Incentive Wallet</p>
                <p className="text-xs font-medium text-white/70">Commissions earned across all schemes</p>
              </div>
              <div className="relative z-10 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mt-2 group-hover:bg-white/30 transition-colors">
                <ArrowRight size={20} className="text-white" />
              </div>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
