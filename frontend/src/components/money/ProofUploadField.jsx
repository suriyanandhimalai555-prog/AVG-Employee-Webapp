// Shared payment proof upload field used across all scheme payment forms.
// Renders nothing when mode is 'cash'. For gpay/bank_receipt it shows a
// multi-image uploader: each file goes to S3 via /money/upload-url (same
// endpoint as MoneySubmitPage) and onChange is called with the full array
// of S3 keys accumulated so far.
//
// Props:
//   mode          - 'cash' | 'gpay' | 'bank_receipt'
//   proofKey      - current stored S3 keys (string[] or null/[])
//   onChange(keys) - called with the updated string[] after each upload/remove
//   showError     - true to highlight when no proof is uploaded after submit attempt

import { useRef } from 'react';
import { Image as ImageIcon, Loader2, X, Plus } from 'lucide-react';
import { useGetMoneyUploadUrlMutation } from '../../store/api/apiSlice';
import { useState } from 'react';

const MAX_SIZE = 6 * 1024 * 1024; // 6 MB
const MAX_IMAGES = 5;              // hard cap per payment event

export const ProofUploadField = ({ mode, proofKey, onChange, showError = false }) => {
  // Normalise: accept string (legacy), string[], null, or undefined → always work with []
  const keys = Array.isArray(proofKey) ? proofKey : (proofKey ? [proofKey] : []);

  const [previews,   setPreviews]   = useState([]); // local object-URLs for files added this session
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState(null);
  const fileRef = useRef(null);
  const [getUploadUrl] = useGetMoneyUploadUrlMutation();

  if (mode === 'cash') return null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (keys.length >= MAX_IMAGES) {
      setUploadErr(`Maximum ${MAX_IMAGES} images per payment.`);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadErr('File too large (max 6 MB).');
      e.target.value = '';
      return;
    }
    setUploadErr(null);
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    try {
      const fileType = file.type || 'image/jpeg';
      const { uploadUrl, photoKey } = await getUploadUrl({ mode, contentType: fileType }).unwrap();
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': fileType },
      });
      if (!res.ok) throw new Error('Upload failed.');
      setPreviews(prev => [...prev, { key: photoKey, url: localUrl }]);
      onChange([...keys, photoKey]);
    } catch (err) {
      setUploadErr(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeKey = (keyToRemove) => {
    setPreviews(prev => prev.filter(p => p.key !== keyToRemove));
    const next = keys.filter(k => k !== keyToRemove);
    onChange(next.length ? next : []);
  };

  const borderClass = showError && keys.length === 0
    ? 'border-red-400'
    : 'border-dashed border-indigo/20';

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block">
        Payment Proof <span className="text-red-400">*</span>
        {keys.length > 0 && (
          <span className="ml-2 text-emerald-500 normal-case font-medium">
            {keys.length} {keys.length === 1 ? 'image' : 'images'} uploaded
          </span>
        )}
      </label>

      {/* Thumbnails row */}
      {keys.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {keys.map((k) => {
            const preview = previews.find(p => p.key === k);
            return (
              <div key={k} className="relative w-20 h-20 rounded-xl overflow-hidden border border-navy/10 bg-navy/5 flex items-center justify-center">
                {preview ? (
                  <img src={preview.url} alt="Receipt" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-navy/30">
                    <ImageIcon size={18} />
                    <span className="text-[9px]">saved</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeKey(k)}
                  className="absolute top-1 right-1 bg-red-500 rounded-full p-0.5 text-white shadow"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}

          {/* Add another tile — hidden at MAX_IMAGES cap */}
          {keys.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-20 h-20 rounded-xl border border-dashed border-indigo/30 flex flex-col items-center justify-center gap-1 text-indigo hover:bg-indigo/5 transition-colors tactile-press disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Plus size={18} className="opacity-60" />
                  <span className="text-[9px] font-bold">Add</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Empty state — first upload tile */}
      {keys.length === 0 && (
        <div className={`bg-white rounded-2xl border ${borderClass} overflow-hidden`}>
          {uploading ? (
            <div className="flex items-center justify-center gap-2 py-5 text-xs text-navy/50">
              <Loader2 size={16} className="animate-spin text-indigo" />
              Uploading…
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-6 flex flex-col items-center justify-center gap-2 text-indigo hover:bg-indigo/5 transition-colors tactile-press"
            >
              <ImageIcon size={28} className="opacity-50" />
              <p className="text-xs font-bold tracking-wide">Upload Receipt / Screenshot</p>
              <p className="text-[10px] text-navy/30">You can add up to {MAX_IMAGES} images</p>
            </button>
          )}
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileRef}
        onChange={handleFile}
        className="hidden"
      />

      {uploadErr && (
        <p className="text-[10px] text-red-500 font-medium">{uploadErr}</p>
      )}
      {showError && keys.length === 0 && !uploading && (
        <p className="text-[10px] text-red-500 font-medium">
          Receipt required for {mode === 'gpay' ? 'GPay' : 'bank'} payments.
        </p>
      )}
    </div>
  );
};
