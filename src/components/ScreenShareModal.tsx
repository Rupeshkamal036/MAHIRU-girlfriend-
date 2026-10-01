import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, X, Check, ShieldAlert, Sparkles } from 'lucide-react';

interface ScreenShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartShare?: () => void;
}

export const ScreenShareModal: React.FC<ScreenShareModalProps> = ({
  isOpen,
  onClose,
  onStartShare,
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartCapture = async () => {
    setStreamError(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsSharing(true);
        if (onStartShare) onStartShare();
        // Listen for user stopping screen share from browser chrome
        stream.getVideoTracks()[0].onended = () => {
          setIsSharing(false);
        };
      } else {
        setStreamError('Screen sharing API is not supported in this browser window. Try opening in a full tab.');
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setStreamError(err.message || 'Screen sharing was cancelled or denied.');
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-sm bg-[#0d0e17] border border-white/10 rounded-2xl p-5 text-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Share Screen
                </h2>
                <p className="text-[10px] text-cyan-300 font-mono">VISION STREAM LINK</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-xs text-neutral-300 leading-relaxed">
              Share your browser tab, code editor, or video stream with Mahiru so she can see what you are doing in real time.
            </p>

            {streamError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{streamError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-neutral-300">
                <Check className="w-3.5 h-3.5 text-cyan-400" />
                <span>Real-time visual comprehension</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-300">
                <Check className="w-3.5 h-3.5 text-cyan-400" />
                <span>Contextual voice commentary</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-300">
                <Check className="w-3.5 h-3.5 text-cyan-400" />
                <span>Instant code & slide review</span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-white/10 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartCapture}
              className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-colors shadow-md shadow-cyan-500/20 flex items-center gap-1.5"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>{isSharing ? 'Sharing Active' : 'Start Sharing'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
