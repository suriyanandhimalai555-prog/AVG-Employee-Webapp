import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, XCircle, CheckCircle2, DollarSign, ArrowUpRight, Check, ChevronRight, Loader2
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetMoneyWalletQuery,
  useGetUserSuperiorsQuery,
  useTransferMoneyMutation,
} from '../store/api/apiSlice';

export const MoneyWalletPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const { data: walletItems = [], isLoading: isWalletLoading } = useGetMoneyWalletQuery();
  const { data: superiors = [] } = useGetUserSuperiorsQuery(undefined, { skip: user?.role === 'md' });
  const [transferMoney, { isLoading: isTransferring }] = useTransferMoneyMutation();

  const [selectedForTransfer, setSelectedForTransfer] = useState([]);
  const [transferTarget, setTransferTarget] = useState('');
  const [formError, setFormError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const toggleSelection = (id) => {
    setSelectedForTransfer(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleTransfer = async () => {
    if (!transferTarget || selectedForTransfer.length === 0) return;
    try {
      await transferMoney({
        targetUserId: transferTarget,
        collectionIds: selectedForTransfer
      }).unwrap();
      setSuccessMsg('Cash transferred successfully!');
      setSelectedForTransfer([]);
      setTransferTarget('');
      setTimeout(() => navigate('/money'), 1500);
    } catch (err) {
      setFormError(err.data?.error?.message || 'Transfer failed');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="pb-32 pt-4"
    >
      <div className="px-4 flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button onClick={() => navigate('/money')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press">
            <ArrowRight className="rotate-180" size={20} />
          </button>
          <h3 className="text-lg font-bold text-navy ml-4">My Wallet</h3>
        </div>
        {selectedForTransfer.length > 0 && (
          <div className="bg-indigo text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg flex items-center gap-2">
            ₹{walletItems.filter(i => selectedForTransfer.includes(i.id)).reduce((s, i) => s + parseFloat(i.amount), 0).toLocaleString()}
          </div>
        )}
      </div>

      {(formError || successMsg) && (
        <div className={`mx-6 mb-6 p-4 rounded-2xl border flex items-center gap-3 ${formError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          {formError ? <XCircle size={18} className="text-red-500"/> : <CheckCircle2 size={18} className="text-emerald-500" />}
          <p className={`text-xs font-bold ${formError ? 'text-red-700' : 'text-emerald-700'}`}>{formError || successMsg}</p>
        </div>
      )}

      <div className="px-6 space-y-4">
        {selectedForTransfer.length > 0 && (
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-indigo/10 space-y-4 mb-6">
            <p className="text-[10px] uppercase tracking-widest font-bold text-navy/30">Transfer to Manager</p>
            <div className="flex flex-col gap-4">
              <div className="relative">
                <select
                  className="w-full p-4 bg-navy/2 rounded-2xl text-sm font-bold text-navy outline-none appearance-none border border-transparent focus:border-indigo/20 transition-all"
                  value={transferTarget}
                  onChange={e => setTransferTarget(e.target.value)}
                >
                  <option value="">Select receiver...</option>
                  {superiors.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role.replace('_', ' ')})</option>
                  ))}
                </select>
                <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-navy/20 pointer-events-none" />
              </div>
              <button
                onClick={handleTransfer}
                disabled={!transferTarget || isTransferring}
                className="w-full bg-indigo text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo/20 disabled:opacity-50 transition-all"
              >
                {isTransferring ? <Loader2 className="animate-spin" size={18} /> : <ArrowUpRight size={18} />}
                Transfer {selectedForTransfer.length} items
              </button>
            </div>
          </div>
        )}

        <p className="text-[10px] uppercase tracking-widest font-bold text-navy/30 mb-2">Approved Funds</p>

        {isWalletLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-navy/20" size={32} /></div>
        ) : walletItems.length === 0 ? (
          <div className="bg-white/50 border border-dashed border-navy/10 rounded-3xl p-10 text-center">
            <p className="text-sm font-medium text-navy/30">Your wallet is empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {walletItems.map(item => (
              <button
                key={item.id}
                onClick={() => toggleSelection(item.id)}
                className={`bg-white p-4 rounded-[28px] border transition-all text-left flex items-center justify-between ${selectedForTransfer.includes(item.id) ? 'border-indigo shadow-md shadow-indigo/5 ring-1 ring-indigo/20' : 'border-navy/5 hover:border-navy/10 shadow-sm'}`}
              >
                <div className="flex gap-4 items-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selectedForTransfer.includes(item.id) ? 'bg-indigo text-white' : 'bg-navy/5 text-navy/30'}`}>
                    {selectedForTransfer.includes(item.id) ? <Check size={20} /> : <DollarSign size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy">₹{parseFloat(item.amount).toLocaleString()}</p>
                    <p className="text-[10px] font-medium text-navy/40 truncate w-32">
                      {item.mode === 'cash' ? `From ${item.client_name}` : `Transfer from ${item.submitter_name}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-indigo bg-indigo/5 px-2 py-1 rounded-lg uppercase tracking-tighter">
                    {item.project_name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MoneyWalletPage;
