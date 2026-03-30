import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Camera, ClipboardCheck, ArrowRight, Home, Fingerprint, 
  Wallet, Bell, User, Settings, AlertCircle, CheckCircle2, 
  Clock, X, ChevronRight, Briefcase, Fuel, DollarSign
} from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusChip } from '../components/StatusChip';

// --- Sub-components for Precision ---

const PageHeader = ({ title, showBack, onBack }) => (
  <header className="px-6 pt-12 pb-6 flex items-center justify-between">
    <div className="flex items-center gap-3">
      {showBack ? (
        <button onClick={onBack} className="p-2 -ml-2 text-navy opacity-60"><ArrowRight className="rotate-180" size={20} /></button>
      ) : (
        <div className="w-10 h-10 rounded-full bg-navy/10 overflow-hidden border border-white">
          <img src="https://ui-avatars.com/api/?name=Alex+Rivera&background=0B1C30&color=fff" alt="Profile" />
        </div>
      )}
      <h1 className="text-lg font-bold text-navy tracking-tight">Workforce</h1>
    </div>
    <button className="p-2 text-navy/40 hover:text-navy transition-colors"><Settings size={20} /></button>
  </header>
);

const SectionTitle = ({ date, title }) => (
  <div className="px-6 mb-6">
    {date && <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-1 font-mono">{date}</p>}
    <h2 className="text-3xl font-bold text-navy tracking-tight">{title}</h2>
  </div>
);

const AlertCard = ({ onAction }) => (
  <div className="mx-6 mb-8 p-6 rounded-3xl gradient-yellow flex flex-col items-center text-center shadow-xl shadow-yellow/20">
    <div className="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center mb-4">
      <AlertCircle size={24} className="text-navy" />
    </div>
    <h4 className="text-sm font-bold text-navy uppercase tracking-widest mb-1 leading-tight">Not Marked Yet</h4>
    <p className="text-xs text-navy/60 font-medium mb-6">You haven't checked in for today's shift.</p>
    <button 
      onClick={onAction}
      className="bg-navy text-white px-8 py-3 rounded-xl text-xs font-bold flex items-center gap-2 tactile-press shadow-lg shadow-navy/20"
    >
      <Fingerprint size={16} /> Mark Attendance
    </button>
  </div>
);

const StatsGrid = () => (
  <div className="px-6 mb-8">
    <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-4 font-mono flex justify-between items-center">
      Your Month at a Glance <span>OCT 2023</span>
    </p>
    <Card className="p-0 border-none shadow-none bg-white rounded-3xl overflow-hidden card-shadow">
      <div className="flex divide-x divide-navy/5">
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-navy font-mono">18</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Present</p>
        </div>
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-red-500 font-mono">02</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Absent</p>
        </div>
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-navy font-mono">12</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Field Days</p>
        </div>
      </div>
      {/* Calendar Dot Mock */}
      <div className="px-6 pb-6 pt-2 flex justify-between">
        {[24, 25, 26, 27, 28, 29, 30, 1, 2, 3, 4, 5, 6, 7].map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${i === 12 ? 'bg-indigo border border-indigo/20 ring-2 ring-indigo/10' : (i < 4 ? 'bg-indigo' : 'bg-navy/10')}`}></div>
            <p className="text-[7px] font-bold text-navy/20 uppercase font-mono">{String(d).padStart(2, '0')}</p>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

const SubmissionList = () => (
  <div className="px-6 pb-32">
    <div className="flex items-center justify-between mb-4">
      <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">Recent Money Submissions</p>
      <button className="text-[10px] font-bold text-indigo uppercase tracking-wider">View All</button>
    </div>
    <div className="space-y-3">
      {[
        { title: 'Client Collection', subtitle: 'TEX-CM', amount: '$450.00', status: 'APPROVED', icon: Briefcase, color: 'emerald' },
        { title: 'Fuel Reimbursement', subtitle: 'TEX-CM', amount: '$32.50', status: 'PENDING', icon: Fuel, color: 'indigo' },
        { title: 'Field Allowance', subtitle: 'TEX-CM', amount: '$120.00', status: 'APPROVED', icon: DollarSign, color: 'emerald' }
      ].map((item, i) => (
        <Card key={i} className="p-4 flex items-center justify-between border-none card-shadow">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.color === 'emerald' ? 'bg-emerald/10 text-emerald' : 'bg-indigo/10 text-indigo'}`}>
              <item.icon size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-navy">{item.title}</p>
              <p className="text-[10px] font-medium text-navy/30">{item.subtitle}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-navy">{item.amount}</p>
            <p className={`text-[8px] font-bold uppercase tracking-widest ${item.color === 'emerald' ? 'text-emerald' : 'text-indigo'}`}>{item.status}</p>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

// --- Main Page Component ---

export const AttendanceHome = () => {
  const [view, setView] = useState('dashboard'); // 'dashboard', 'office', 'field'
  const [fieldStep, setFieldStep] = useState(1);
  const [currentTime, setCurrentTime] = useState('08:42:15');
  
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-surface flex flex-col max-w-[390px] mx-auto relative shadow-2xl overflow-x-hidden">
      
      <AnimatePresence mode="wait">
        {view === 'dashboard' && (
          <motion.div 
            key="dashboard" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="flex-1"
          >
            <PageHeader title="Workforce" />
            <SectionTitle date="Monday, October 23" title="Dashboard" />
            <AlertCard onAction={() => setView('office')} />
            <StatsGrid />
            <SubmissionList />
          </motion.div>
        )}

        {view === 'office' && (
          <motion.div 
            key="office" 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="flex-1"
          >
            <PageHeader title="Workforce" showBack onBack={() => setView('dashboard')} />
            <div className="px-6 mb-8 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">Step 01 of 02</p>
                <h2 className="text-2xl font-bold text-navy tracking-tight">Mark Attendance</h2>
              </div>
              <div className="w-16 h-1 rounded-full bg-navy/5 overflow-hidden">
                <div className="w-1/2 h-full bg-indigo"></div>
              </div>
            </div>

            <main className="px-6 space-y-8">
              <Card className="p-0 overflow-hidden bg-white border-none card-shadow relative">
                <div className="aspect-video bg-navy/5 relative flex items-center justify-center overflow-hidden">
                   {/* Mock Map Snippet */}
                   <div className="absolute inset-0 opacity-20 bg-[url('https://api.dicebear.com/7.x/shapes/svg?seed=map')] bg-repeat"></div>
                   <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-indigo/10 flex items-center justify-center relative">
                        <div className="w-3 h-3 rounded-full bg-indigo absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ring-4 ring-indigo/20"></div>
                        <MapPin size={24} className="text-indigo/40" />
                      </div>
                   </div>
                   <div className="absolute bottom-4 left-4 right-4 p-4 glass rounded-2xl flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald ring-4 ring-emerald/10"></div>
                      <div>
                        <p className="text-xs font-bold text-navy">Headquarters • Building 4</p>
                        <p className="text-[9px] font-medium text-navy/40 font-mono">LAT: 37.7749 | LONG: -122.4194</p>
                      </div>
                   </div>
                </div>
              </Card>

              <div className="text-center py-8 space-y-2">
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">Current Time</p>
                <p className="text-5xl font-bold text-navy font-mono tracking-tight">{currentTime}</p>
                <p className="text-sm font-bold text-navy/40 uppercase tracking-widest pt-1">Thursday, Oct 24</p>
              </div>

              <div className="space-y-6">
                <button 
                  onClick={() => { alert('Success!'); setView('dashboard'); }}
                  className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press"
                >
                  <CheckCircle2 size={22} /> Check In
                </button>
                <p className="text-center text-[10px] leading-relaxed text-navy/40 px-8 font-medium">
                  By checking in, you agree to your location being verified for office compliance.
                </p>
              </div>

              <div className="pt-8 grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-2xl card-shadow">
                  <p className="text-[9px] font-bold text-navy/30 uppercase mb-1">Shift Start</p>
                  <p className="text-sm font-bold text-navy">09:00 AM</p>
                </div>
                <div className="p-4 bg-white rounded-2xl card-shadow">
                  <p className="text-[9px] font-bold text-navy/30 uppercase mb-1">Today's Goal</p>
                  <p className="text-sm font-bold text-navy">08:00 HRS</p>
                </div>
              </div>
            </main>

            <footer className="h-32"></footer>
          </motion.div>
        )}

        {view === 'field' && (
          <motion.div 
            key="field" 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col"
          >
             <PageHeader title="Workforce" showBack onBack={() => setView('dashboard')} />
             
             {fieldStep === 1 && (
               <div className="flex-1 flex flex-col px-6">
                  <div className="mb-10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">Step 01 of 03</p>
                      <h2 className="text-2xl font-bold text-navy tracking-tight">Take a Photo</h2>
                    </div>
                  </div>
                  <p className="text-sm text-navy/50 font-medium mb-12 max-w-[280px]">Please capture a clear photo of yourself at the site entrance to verify your check-in.</p>
                  
                  <div className="relative flex-1 rounded-3xl border-2 border-dashed border-navy/10 flex flex-col items-center justify-center group overflow-hidden mb-8">
                     {/* Floating brackets mock */}
                     <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-navy/10 rounded-tl-xl"></div>
                     <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-navy/10 rounded-tr-xl"></div>
                     <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-navy/10 rounded-bl-xl"></div>
                     <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-navy/10 rounded-br-xl"></div>
                     
                     <div className="w-16 h-16 rounded-3xl bg-indigo flex items-center justify-center text-white shadow-xl shadow-indigo/20">
                        <Camera size={32} />
                     </div>
                     <p className="mt-6 text-sm font-bold text-navy">Camera Preview</p>
                     <p className="text-[10px] font-bold text-navy/20 uppercase tracking-widest mt-1">Awaiting Capture</p>
                  </div>

                  <div className="pb-32 space-y-6">
                    <button onClick={() => setFieldStep(2)} className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press">
                      <Camera size={20} /> Take Photo
                    </button>
                    <p className="text-center text-[10px] font-bold text-navy/20 uppercase tracking-[0.2em]">Secure Biometric Processing Active</p>
                  </div>
               </div>
             )}

             {fieldStep === 2 && (
               <div className="px-6 flex-1 flex flex-col">
                  <div className="mb-10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">Step 02 of 03</p>
                      <h2 className="text-2xl font-bold text-navy tracking-tight">Mark Attendance</h2>
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-navy mb-4">Write a Note</h3>
                  <p className="text-sm text-navy/50 font-medium mb-8">Provide context for your current shift or site visit to help the ops team coordinate better.</p>
                  
                  <Card className="flex-1 max-h-[300px] p-6 bg-white flex flex-col border-none card-shadow">
                    <div className="flex gap-2 text-indigo mb-4 opacity-40">
                      <ChevronRight size={18} />
                    </div>
                    <textarea 
                      placeholder="Where are you? What are you doing today?"
                      className="w-full flex-1 bg-transparent border-none outline-none text-navy font-medium placeholder:text-navy/20 resize-none text-base"
                    />
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo"></div>
                        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Status: Draft</p>
                      </div>
                      <p className="text-[10px] font-bold text-navy/20 font-mono">0 / 250</p>
                    </div>
                  </Card>

                  <div className="py-8 grid grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white card-shadow flex flex-col items-center gap-3 border-2 border-indigo">
                      <MapPin size={24} className="text-indigo" />
                      <p className="text-[10px] font-bold text-navy uppercase tracking-widest">On-Site</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-white card-shadow flex flex-col items-center gap-3 opacity-30">
                      <Clock size={24} className="text-navy" />
                      <p className="text-[10px] font-bold text-navy uppercase tracking-widest">Transit</p>
                    </div>
                  </div>

                  <div className="pb-32 flex gap-4">
                    <button onClick={() => setFieldStep(1)} className="p-5 rounded-2xl bg-white text-navy font-bold flex items-center gap-2 tactile-press card-shadow"><ArrowRight size={20} className="rotate-180" /> Back</button>
                    <button onClick={() => setFieldStep(3)} className="flex-1 gradient-primary text-white p-5 rounded-2xl font-bold flex items-center justify-center gap-3 tactile-press shadow-xl shadow-indigo/20">Next Step <ArrowRight size={20} /></button>
                  </div>
               </div>
             )}

             {fieldStep === 3 && (
               <div className="px-6 flex-1 flex flex-col overflow-y-auto">
                  <div className="flex items-center justify-between mb-8">
                     <button onClick={() => setFieldStep(2)} className="p-2 -ml-2 text-navy/60"><ArrowRight className="rotate-180" size={20} /></button>
                     <h3 className="text-base font-bold text-navy">Confirm Submission</h3>
                     <p className="text-[9px] font-extrabold bg-indigo/10 text-indigo px-3 py-1 rounded-full uppercase tracking-widest">Step 03/03</p>
                  </div>

                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-emerald/10 text-emerald rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald/20 shadow-xl shadow-emerald/5">
                      <CheckCircle2 size={32} />
                    </div>
                    <h4 className="text-xl font-bold text-navy mb-2">Review & Finalize Attendance</h4>
                    <p className="text-xs text-navy/40 font-medium px-8">Please verify your field entry details before final submission.</p>
                  </div>

                  <div className="space-y-4 mb-32">
                    <Card className="p-4 bg-white border-none card-shadow flex items-center gap-5">
                       <div className="w-12 h-12 rounded-xl bg-navy/5 overflow-hidden">
                          <img src="https://ui-avatars.com/api/?name=Alex+Rivera&background=0B1C30&color=fff" alt="Selfie" />
                       </div>
                       <div>
                          <p className="text-[8px] font-bold text-navy/30 uppercase tracking-widest mb-1 font-mono">Activity Note</p>
                          <p className="text-xs font-semibold text-navy italic">"Completed site inspection of Tower A. Foundation pouring underway."</p>
                       </div>
                    </Card>

                    <Card className="p-5 bg-white border-none card-shadow">
                       <div className="flex items-center gap-3 mb-4">
                          <MapPin size={18} className="text-indigo" />
                          <div>
                            <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Verified Location</p>
                            <p className="text-xs font-bold text-navy">1234 Construction Way, Sector 4</p>
                          </div>
                       </div>
                       <div className="aspect-[4/1.5] w-full bg-navy/5 rounded-xl flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 opacity-20 bg-[url('https://api.dicebear.com/7.x/shapes/svg?seed=map_small')] bg-repeat"></div>
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-indigo/10 flex items-center justify-center relative">
                              <div className="w-2 h-2 rounded-full bg-indigo ring-2 ring-indigo/20"></div>
                            </div>
                          </div>
                       </div>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                       <Card className="p-4 bg-white border-none card-shadow">
                          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mb-1 font-mono">Entry Time</p>
                          <p className="text-sm font-bold text-navy">08:42:15</p>
                       </Card>
                       <Card className="p-4 bg-white border-none card-shadow">
                          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mb-1 font-mono">Status</p>
                          <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald"></div>
                             <p className="text-sm font-bold text-navy">On-Site</p>
                          </div>
                       </Card>
                    </div>

                    <div className="py-8 space-y-6">
                      <p className="text-[9px] text-center text-navy/40 px-12 leading-relaxed">By submitting, you certify that your location data and photo are accurate and represent your current workplace status.</p>
                      <button onClick={() => { alert('Field Attendance Submitted!'); setView('dashboard'); setFieldStep(1); }} className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press">
                        Submit Field Attendance <ArrowRight size={20} />
                      </button>
                    </div>
                  </div>
               </div>
             )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav for Bottom */}
      <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-8 pb-6 z-50">
        <nav className="p-2 sm:p-3 flex items-center justify-between glass rounded-[28px] card-shadow">
          <NavItem icon={Home} label="Home" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavItem icon={Fingerprint} label="Attendance" active={view === 'office' || view === 'field'} onClick={() => setView('office')} />
          <NavItem icon={Wallet} label="Money" />
          <NavItem icon={Bell} label="Alerts" />
          <NavItem icon={User} label="Profile" />
        </nav>
      </footer>
    </div>
  );
};

const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 p-3 rounded-[20px] transition-all duration-300 ${active ? 'bg-indigo/10 text-indigo' : 'text-navy/30 hover:text-navy/60'}`}
  >
    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
    <span className={`text-[8px] font-extrabold uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
  </button>
);
