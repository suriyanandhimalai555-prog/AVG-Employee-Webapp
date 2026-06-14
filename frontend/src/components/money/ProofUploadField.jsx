// Shared payment proof upload field used across all scheme payment forms.
// Renders nothing when mode is 'cash'. For gpay/bank_receipt it shows a
// file input that uploads to S3 via /money/upload-url (same endpoint as
// MoneySubmitPage) and calls onChange with the returned S3 key.
//
// Props:
//   mode        - 'cash' | 'gpay' | 'bank_receipt'
//   proofKey    - current stored S3 key (null if not yet uploaded)
//   onChange(key) - called with the uploaded S3 key
//   showError   - true to highlight when proof is missing after submit attempt

import { useState, useRef } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useGetMoneyUploadUrlMutation } from '../../store/api/apiSlice';

const MAX_SIZE = 6 * 1024 * 1024; // 6 MB

export const ProofUploadField = ({ mode, proofKey, onChange, showError = false }) => {
  const [preview, setPreview]   = useState(null);
  const [uploading, setUploading] = useState(null);
  const [uploadErr, setUploadErr] = useState(null);
  const fileRef = useRef(null);
  const [getUploadUrl] = useGetMoneyUploadUrlMutation();

  if (mode === 'cash') return null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      setUploadErr('File too large (max 6 MB).');
      e.target.value = '';
      return;
    }
    setUploadErr(null);
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const fileType = file.type || 'image/jpeg';
      const { uploadUrl, photoKey } = await getUploadUrl({ mode, contentType: fileType }).unwrap();
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': fileType },
      });
      if (!res.ok) throw new Error('Upload failed.');
      onChange(photoKey);
    } catch (err) {
      setUploadErr(err.message || 'Upload failed. Please try again.');
      setPreview(null);
      onChange(null);
    } finally {
      setUploading(false);
    }
  };

  const borderClass = showError && !proofKey
    ? 'border-red-400'
    : 'border-dashed border-indigo/20';

  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block">
        Payment Proof <span className="text-red-400">*</span>
      </label>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileRef}
        onChange={handleFile}
        className="hidden"
      />

      <div className={`bg-white rounded-2xl border ${borderClass} overflow-hidden`}>
        {uploading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-xs text-navy/50">
            <Loader2 size={16} className="animate-spin text-indigo" />
            Uploading…
          </div>
        ) : preview || proofKey ? (
          <div className="relative aspect-video bg-navy/5">
            {preview && (
              <img src={preview} alt="Receipt" className="w-full h-full object-contain" />
            )}
            {!preview && proofKey && (
              <div className="flex items-center justify-center h-full text-xs text-navy/40 gap-2">
                <ImageIcon size={14} />
                Proof uploaded
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 bg-navy/40 flex items-center justify-center"
            >
              <p className="text-white text-[10px] font-bold uppercase tracking-[0.2em] bg-navy/40 px-3 py-1.5 rounded-lg border border-white/20 backdrop-blur-md">
                Retake Photo
              </p>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full py-6 flex flex-col items-center justify-center gap-2 text-indigo hover:bg-indigo/5 transition-colors tactile-press"
          >
            <ImageIcon size={28} className="opacity-50" />
            <p className="text-xs font-bold tracking-wide">Upload Receipt / Screenshot</p>
          </button>
        )}
      </div>

      {uploadErr && (
        <p className="text-[10px] text-red-500 font-medium">{uploadErr}</p>
      )}
      {showError && !proofKey && !uploading && (
        <p className="text-[10px] text-red-500 font-medium">
          Receipt required for {mode === 'gpay' ? 'GPay' : 'bank'} payments.
        </p>
      )}
    </div>
  );
};
