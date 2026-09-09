import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Image as ImageIcon, FileText, Sparkles, X } from 'lucide-react';

interface MediaAttachModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect?: (file: File, type: string) => void;
}

export const MediaAttachModal: React.FC<MediaAttachModalProps> = ({
  isOpen,
  onClose,
  onFileSelect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleTriggerUpload = (isCamera: boolean) => {
    if (isCamera && cameraInputRef.current) {
      cameraInputRef.current.click();
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) {
      onFileSelect(file, type);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-xs bg-[#0f111a] border border-cyan-500/30 rounded-2xl p-4 text-neutral-100 shadow-[0_15px_40px_rgba(0,0,0,0.8)]"
        >
          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'camera')}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,text/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'gallery')}
          />

          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-cyan-300 uppercase">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              ATTACH CONTENT
            </div>
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Options */}
          <div className="space-y-1.5">
            <button
              onClick={() => handleTriggerUpload(true)}
              className="w-full p-2.5 rounded-xl bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30 flex items-center gap-3 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  Camera
                </p>
                <p className="text-[10px] text-neutral-400">Take a photo to analyze</p>
              </div>
            </button>

            <button
              onClick={() => handleTriggerUpload(false)}
              className="w-full p-2.5 rounded-xl bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30 flex items-center gap-3 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  Gallery
                </p>
                <p className="text-[10px] text-neutral-400">Choose photo or screenshot</p>
              </div>
            </button>

            <button
              onClick={() => handleTriggerUpload(false)}
              className="w-full p-2.5 rounded-xl bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30 flex items-center gap-3 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  Documents
                </p>
                <p className="text-[10px] text-neutral-400">PDF, text & files</p>
              </div>
            </button>
          </div>

          {/* Bottom helper text */}
          <p className="mt-3 text-[10px] text-neutral-400 text-center font-mono">
            Mahiru will analyze via voice or vision
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
