import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, ChevronRight, Users } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetUsersQuery } from '../store/api/apiSlice';


export const LeadershipListPage = () => {
  const { kind } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);

  const targetRole = kind === 'directors' ? 'director' : 'gm';
  const { data: usersResult = {}, isLoading } = useGetUsersQuery(
    { viewerId: user?.id, role: targetRole, limit: 500 },
    { skip: !user?.id }
  );

  const members = (usersResult.data ?? []).filter((u) =>
    user?.role === 'director' ? u.managerId === user.id : true
  );

  const title = kind === 'directors' ? 'Directors' : 'General Managers';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen bg-surface"
    >
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-navy/5 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-xl text-navy/40 hover:text-navy hover:bg-navy/5 transition-all tactile-press shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className={`w-9 h-9 rounded-xl ${kind === 'directors' ? 'gradient-directors border-l-2 border-rose-500 shadow-rose/10' : 'gradient-gms border-l-2 border-sky-500 shadow-sky/10'} flex items-center justify-center text-white shrink-0 shadow-lg`}>
          <Users size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate leading-tight">{title}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">{members.length} total</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-24">
        <div className="bg-white rounded-3xl card-shadow divide-y divide-navy/5 overflow-hidden">
          {members.map((member) => (
            <button
              key={member.id}
              onClick={() => navigate(`/people/${member.id}`)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-navy/3 transition-all duration-200 text-left tactile-press group"
            >
              <div className="w-8 h-8 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8">
                <Avatar url={member?.profilePhotoUrl} name={member.name} size={32} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-navy truncate">{member.name}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-navy/35 mt-0.5">
                  {(member.role ?? '').replace(/_/g, ' ')}
                </p>
              </div>
              <ChevronRight size={14} className="text-navy/15 transition-all duration-200 group-hover:text-navy/35 group-hover:translate-x-0.5 shrink-0" />
            </button>
          ))}
          {!isLoading && members.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">No records found</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default LeadershipListPage;
