import React from 'react';
import { MicOff, ExternalLink, X, RefreshCw } from 'lucide-react';
import { PermissionErrorState } from '../types';

interface PermissionModalProps {
  error: PermissionErrorState | null;
  onClose: () => void;
  onRetry: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  error,
  onClose,
  onRetry,
}) => {
  if (!error) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-neutral-900/95 border border-rose-500/30 p-5 shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2 text-rose-400">
            <MicOff className="w-5 h-5" />
            <h3 className="font-bold text-white text-base font-['Syne']">Microphone Access</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-neutral-200 font-medium">
            {error.message || 'Microphone access was denied or restricted by your browser.'}
          </p>
          {error.isInIframe && (
            <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
              Preview frame detected: You can open Mahiru in a full browser tab for direct microphone hardware access.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => {
              onClose();
              onRetry();
            }}
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Grant & Retry</span>
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold transition-colors"
          >
            Continue in Voice-Output Only Mode
          </button>
        </div>
      </div>
    </div>
  );
};
