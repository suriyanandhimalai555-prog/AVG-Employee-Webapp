import { useState } from 'react';
import { Image as ImageIcon, Loader2, ExternalLink } from 'lucide-react';
import { useGetMoneyPhotoUrlQuery } from '../../store/api/apiSlice';

// Lazy-loads the S3 presigned download URL only when the user taps "View Proof".
// Avoids firing N API calls for a list of cards on mount.
export const PhotoProof = ({ photoKey }) => {
  const [requested, setRequested] = useState(false);
  const { data, isLoading } = useGetMoneyPhotoUrlQuery(photoKey, {
    skip: !requested || !photoKey,
  });

  if (!photoKey) return null;

  if (!requested) {
    return (
      <button
        onClick={() => setRequested(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-indigo/20 text-indigo bg-indigo/2 text-[10px] font-bold uppercase tracking-wider hover:bg-indigo/5 transition-colors"
      >
        <ImageIcon size={13} />
        View Proof
      </button>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 size={20} className="animate-spin text-indigo/40" />
      </div>
    );
  }

  if (!data?.url) {
    return (
      <p className="text-center text-[10px] text-navy/30 py-2">Proof not available</p>
    );
  }

  return (
    <a href={data.url} target="_blank" rel="noreferrer" className="block relative rounded-2xl overflow-hidden border border-navy/10 group">
      <img
        src={data.url}
        alt="Payment proof"
        className="w-full object-contain max-h-64 bg-navy/2"
      />
      <div className="absolute inset-0 bg-navy/0 group-hover:bg-navy/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <div className="bg-white rounded-xl px-3 py-2 flex items-center gap-1.5 text-[10px] font-bold text-navy shadow-lg">
          <ExternalLink size={12} /> Open full size
        </div>
      </div>
    </a>
  );
};
