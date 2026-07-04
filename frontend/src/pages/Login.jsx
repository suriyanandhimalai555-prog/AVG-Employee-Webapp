import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
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
      setError(err?.data?.error?.message || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Ambient background */}
      <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] bg-indigo/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] bg-indigo/4 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[45%] right-[8%] w-[22%] h-[22%] bg-amber-400/5 rounded-full blur-[80px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px] relative z-10"
      >

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-[88px] h-[88px] rounded-2xl overflow-hidden shadow-2xl shadow-indigo/15 mb-5 ring-4 ring-white"
          >
            <img src="/AVGLOGO.jpeg" alt="AgilaVetri Groups" className="w-full h-full object-cover" />
          </motion.div>
          <h1 className="text-[22px] font-black text-navy tracking-tight leading-tight">AgilaVetri Groups</h1>
          <p className="text-[10px] font-bold text-navy/35 uppercase tracking-[0.28em] mt-1.5">
            Employee Management System
          </p>
        </div>

        {/* Login card */}
        <div className="glass p-8 rounded-2xl card-shadow">

          <div className="mb-7">
            <h2 className="text-xl font-bold text-navy tracking-tight">Welcome back</h2>
            <p className="text-[13px] text-navy/40 mt-1">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                Email Address
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/25 group-focus-within:text-indigo transition-colors duration-200">
                  <Mail size={17} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-4 bg-white/70 rounded-2xl text-navy font-semibold placeholder:text-navy/20 outline-none border border-navy/[0.07] focus:border-indigo/35 focus:ring-4 focus:ring-indigo/8 transition-all duration-200 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                Password
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/25 group-focus-within:text-indigo transition-colors duration-200">
                  <Lock size={17} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full pl-11 pr-4 py-4 bg-white/70 rounded-2xl text-navy font-semibold placeholder:text-navy/20 outline-none border border-navy/[0.07] focus:border-indigo/35 focus:ring-4 focus:ring-indigo/8 transition-all duration-200 text-sm"
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-600">
                    <AlertCircle size={16} className="shrink-0" />
                    <p className="text-xs font-semibold leading-snug">{error}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full gradient-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-indigo/25 tactile-press disabled:opacity-60 transition-opacity text-sm mt-2"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-[10px] font-medium text-navy/20 tracking-wide">
          © 2024 AgilaVetri Groups · All rights reserved
        </p>

      </motion.div>
    </div>
  );
};
