import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { apiSlice, useLoginMutation } from '../store/api/apiSlice';
import { setCredentials } from '../store/slices/authSlice';

export const Login = () => {
  const dispatch = useDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [login, { isLoading }] = useLoginMutation();
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const data = await login({ email, password }).unwrap();
      dispatch(apiSlice.util.resetApiState());
      dispatch(setCredentials({ user: data.user, token: data.token }));
    } catch (err) {
      setError(err?.data?.error?.message || 'Authentication failed. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] bg-indigo/6 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-indigo/4 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-[40%] right-[10%] w-[20%] h-[20%] bg-yellow/6 rounded-full blur-[80px] animate-pulse pointer-events-none" style={{ animationDelay: '3s' }} />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[400px] relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="p-4 rounded-3xl bg-indigo/10 text-indigo mb-6 shadow-xl shadow-indigo/5 border border-indigo/20">
            <ShieldCheck size={40} />
          </div>
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.3em] mb-1 font-mono">Operations Platform</p>
          <h1 className="text-4xl font-bold text-navy tracking-tight">Workforce</h1>
        </div>

        <div className="glass p-8 rounded-[40px] card-shadow border border-white/60 backdrop-blur-2xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-navy tracking-tight">Secure Login</h2>
            <div className="w-12 h-1 bg-indigo rounded-full mt-2 opacity-20"></div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Terminal Identity</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20 group-focus-within:text-indigo transition-colors">
                  <Mail size={18} />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email" 
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/60 rounded-2xl text-navy font-bold placeholder:text-navy/20 outline-none border border-navy/8 focus:border-indigo/40 focus:ring-4 focus:ring-indigo/8 transition-all duration-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Access Protocol</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20 group-focus-within:text-indigo transition-colors duration-200">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/60 rounded-2xl text-navy font-bold placeholder:text-navy/20 outline-none border border-navy/8 focus:border-indigo/40 focus:ring-4 focus:ring-indigo/8 transition-all duration-200"
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-600"
                >
                  <AlertCircle size={18} className="shrink-0" />
                  <p className="text-xs font-bold">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-70"
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>Initialize Access <ArrowRight size={20} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-10 text-[10px] font-bold text-navy/20 uppercase tracking-[0.2em] px-8 leading-relaxed">
          Authorized monitoring system. Unofficial access is logged and traced.
        </p>
      </motion.div>
    </div>
  );
};
