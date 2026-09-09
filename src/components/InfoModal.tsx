import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Mic, Globe, Zap, Heart, Shield } from 'lucide-react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-neutral-200 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base font-['Syne']">About Mahiru</h3>
                  <p className="text-[11px] text-neutral-400">Your AI Girlfriend Companion</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Persona Traits */}
            <div className="mt-4 space-y-3.5 text-xs leading-relaxed">
              <div className="p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-pink-400 font-semibold">
                  <Heart className="w-3.5 h-3.5" />
                  <span>Sweet & Caring AI Girlfriend</span>
                </div>
                <p className="text-neutral-400">
                  Warm, playful, emotionally expressive, and naturally conversational. Mahiru speaks fluently in Hindi, Hinglish, and English with genuine girlfriend warmth.
                </p>
              </div>

              {/* Real-Time Ambient Lighting */}
              <div className="p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Voice-Controlled Ambient Lighting</span>
                </div>
                <p className="text-neutral-400">
                  Control the atmosphere by voice: <em>"Mahiru, background blue kar do"</em>, <em>"purple light kar do"</em>, <em>"light dim kar do"</em>, or <em>"light normal kar do"</em>.
                </p>
              </div>

              {/* Voice-only Interaction */}
              <div className="p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                  <Mic className="w-3.5 h-3.5" />
                  <span>Real-time Voice-to-Voice (Gemini 3.1 Live)</span>
                </div>
                <p className="text-neutral-400">
                  Pure real-time bidirectional audio. Streams 16kHz PCM from your microphone and responds in natural 24kHz HD speech with low latency.
                </p>
              </div>

              {/* Tools & Browser Actions */}
              <div className="p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Live Function Calling</span>
                </div>
                <p className="text-neutral-400">
                  Ask her to browse or open any site: <em>"Can you open YouTube for us?"</em> or <em>"Open Spotify"</em>. She executes browser actions and reacts dynamically.
                </p>
              </div>

              {/* Suggested conversation topics */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                  Try Saying:
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <div className="px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-300 italic">
                    "Hey Mahiru, why did you take so long to pick up?"
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-300 italic">
                    "You know, you're looking extra cute today."
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-300 italic">
                    "Can you open Spotify so we can listen to something?"
                  </div>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="mt-5 pt-3 border-t border-neutral-800">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold tracking-wider transition-colors"
              >
                Close & Return to Call
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
