import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MicOff, ExternalLink, RefreshCw, X, AlertTriangle, Lock } from 'lucide-react';
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

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-neutral-200 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <MicOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base font-['Syne']">
                  Microphone Access Required
                </h3>
                <p className="text-[11px] text-rose-400 font-mono">
                  {error.isInIframe ? 'Preview Iframe Restriction' : 'Browser Permission Blocked'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
              title="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Explanation content */}
          <div className="mt-4 space-y-3.5 text-xs leading-relaxed">
            {error.isInIframe ? (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Why this happens in Preview:</span>
                </div>
                <p className="text-neutral-300 leading-normal">
                  Mobile browsers (especially Chrome and Safari on mobile devices) strictly disallow microphone recording inside embedded preview frames.
                </p>
                <p className="text-neutral-400 leading-normal">
                  Opening the app in its own tab allows your browser to display the standard <strong className="text-neutral-200">"Allow microphone"</strong> permission prompt.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                <div className="flex items-center gap-2 text-rose-300 font-semibold">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>How to enable microphone:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-300">
                  <li>Tap the <strong className="text-white">lock / settings icon</strong> next to the URL in your browser address bar.</li>
                  <li>Locate <strong className="text-white">Permissions</strong> &gt; <strong className="text-white">Microphone</strong>.</li>
                  <li>Change setting to <strong className="text-white">Allow</strong>.</li>
                  <li>Tap <strong className="text-white">Try Again</strong> below to connect.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-col gap-2.5">
            {error.isInIframe ? (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-pink-500/25 transition-all"
              >
                <span>Open in New Tab &amp; Allow Mic</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : null}

            <button
              onClick={() => {
                onClose();
                onRetry();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors border border-neutral-700/60"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>

            <button
              onClick={onClose}
              className="w-full py-2 text-neutral-400 hover:text-neutral-200 text-xs font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
