import { motion } from 'framer-motion';
import { X, Loader2, Info } from 'lucide-react';
import { useGetMoneySourcesQuery } from '../../store/api/apiSlice';

export const SourceInspector = ({ transferId, onClose }) => {
  const { data: sources = [], isLoading } = useGetMoneySourcesQuery(transferId, { skip: !transferId });

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-navy/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-6 border-b border-navy/5 flex justify-between items-center">
          <h4 className="font-bold text-navy">Origin Details</h4>
          <button onClick={onClose} className="p-2 hover:bg-navy/5 rounded-full">
            <X size={20}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[60vh] p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="animate-spin text-navy/20" size={32} />
            </div>
          ) : sources.length === 0 ? (
            <p className="text-center text-sm text-navy/40 py-8">No source records found.</p>
          ) : (
            sources.map(s => (
              <div key={s.id} className="p-4 bg-navy/2 rounded-2xl border border-navy/5">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm font-bold text-navy">₹{parseFloat(s.amount).toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-indigo bg-indigo/5 px-2 py-1 rounded-lg uppercase">
                    {s.mode.replace('_', ' ')}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-navy/20"/>
                    <p className="text-[10px] font-bold text-navy/60">{s.submitter_name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-navy/40">
                    <Info size={10}/>
                    <p className="text-[9px] font-medium tracking-tight truncate">
                      {s.client_name || 'Grouped Transfer'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-navy/[0.02] border-t border-navy/5">
          <button 
            onClick={onClose} 
            className="w-full py-3 bg-navy text-white text-sm font-bold rounded-xl tactile-press"
          >
            Close Inspector
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
