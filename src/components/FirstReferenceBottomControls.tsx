import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Power, Mic, MicOff, Monitor, Send, Paperclip } from 'lucide-react';
import { SessionState } from '../types';

interface FirstReferenceBottomControlsProps {
  state: SessionState;
  isMuted: boolean;
  isMicAvailable: boolean;
  onTogglePower: () => void;
  onToggleMute: () => void;
  onRequestMic?: () => void;
  onSendText: (text: string) => void;
  onOpenScreenShare: () => void;
  onOpenAttach: () => void;
  currentAnimId: number;
}

export const FirstReferenceBottomControls: React.FC<FirstReferenceBottomControlsProps> = ({
  state,
  isMuted,
  isMicAvailable,
  onTogglePower,
  onToggleMute,
  onRequestMic,
  onSendText,
  onOpenScreenShare,
  onOpenAttach,
  currentAnimId,
}) => {
  const [inputText, setInputText] = useState('');

  const isConnected = state !== 'disconnected' && state !== 'connecting';
  const isConnecting = state === 'connecting';

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendText(inputText.trim());
    setInputText('');
  };

  // Status message corresponding strictly to the FIRST reference recording
  let statusMessage = 'CONNECT MEMORY CORE TO AWAKEN MY VOICE.';
  let statusColor = 'text-neutral-400';

  if (isConnecting) {
    statusMessage = 'MATERIALIZING PRESENCE LINKS...';
    statusColor = 'text-amber-300 animate-pulse';
  } else if (isConnected) {
    if (isMuted) {
      statusMessage = 'MICROPHONE MUTED (MAHIRU CAN STILL SPEAK TO YOU)';
      statusColor = 'text-rose-300';
    } else if (state === 'speaking' || currentAnimId === 5 || currentAnimId === 2 || currentAnimId === 3) {
      statusMessage = 'MAHIRU IS SPEAKING...';
      statusColor = 'text-cyan-300';
    } else if (currentAnimId === 1) {
      statusMessage = 'THINKING... COMMUNICATING WITH CORE';
      statusColor = 'text-cyan-400 animate-pulse';
    } else {
      statusMessage = 'I AM LISTENING. SPEAK FREELY...';
      statusColor = 'text-cyan-300';
    }
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 flex flex-col items-center select-none z-30">
      {/* 1. Status Text directly above controls matching Reference 1 */}
      <div className="mb-3 text-center transition-all duration-300">
        <p
          className={`text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase font-['Outfit'] ${statusColor}`}
        >
          {statusMessage}
        </p>
      </div>

      {/* 2. Text Input Bar & Waveform (ONLY when connected) */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 15, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="w-full flex flex-col items-center mb-3"
          >
            {/* Input Bar */}
            <form
              onSubmit={handleFormSubmit}
              className="w-full relative flex items-center bg-neutral-900/80 hover:bg-neutral-900/90 border border-white/10 hover:border-white/20 rounded-full px-3.5 py-2 backdrop-blur-md shadow-lg shadow-black/50 transition-all focus-within:border-cyan-500/50"
            >
              <button
                type="button"
                onClick={onOpenAttach}
                className="p-1 text-neutral-400 hover:text-cyan-300 transition-colors shrink-0"
                title="Attach media (Camera, Gallery, Documents)"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message or instruction to Mahiru..."
                className="flex-1 bg-transparent px-2.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none"
              />

              <button
                type="submit"
                disabled={!inputText.trim()}
                className={`p-1.5 rounded-full transition-all shrink-0 ${
                  inputText.trim()
                    ? 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                    : 'text-neutral-600 cursor-not-allowed'
                }`}
                title="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Subtle Audio Waveform Indicator matching Reference 1 */}
            <div className="flex items-center gap-1.5 mt-2 opacity-80 text-cyan-400">
              <span className="text-[10px] text-cyan-500 font-mono tracking-tighter">&lt;&lt;</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse [animation-delay:300ms]" />
              </div>
              <span className="text-[10px] text-cyan-500 font-mono tracking-tighter">&gt;&gt;</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Circular Buttons Area matching Reference 1: Mic | Power | Screen */}
      <div className="flex items-center justify-center gap-6 sm:gap-8 pb-4">
        {/* Left Button: Mic toggle (Shown when connected) */}
        <AnimatePresence>
          {isConnected && (
            <motion.button
              id="mahiru-mic-button"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={onToggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg cursor-pointer ${
                isMuted
                  ? 'bg-rose-950/40 border border-rose-500/50 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.35)] hover:bg-rose-900/60 hover:border-rose-400'
                  : 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:bg-cyan-900/50 hover:border-cyan-400 hover:text-cyan-300'
              }`}
              title={isMuted ? 'Microphone is muted - Click to unmute' : 'Microphone active - Click to mute'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Center Button: Main Power Awakening / Disconnect button */}
        <div className="relative flex items-center justify-center">
          {/* Pulsing ring during connecting */}
          {isConnecting && (
            <div className="absolute -inset-2 rounded-full border-2 border-amber-400/60 border-t-amber-300 animate-spin" />
          )}

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onTogglePower}
            className={`transition-all duration-300 flex items-center justify-center rounded-full ${
              isConnected
                ? 'w-14 h-14 sm:w-16 sm:h-16 bg-cyan-500/20 border-2 border-cyan-400 text-cyan-300 shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:bg-cyan-500/30'
                : isConnecting
                ? 'w-14 h-14 sm:w-16 sm:h-16 bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.5)]'
                : 'w-14 h-14 sm:w-16 sm:h-16 bg-white/[0.07] hover:bg-white/[0.14] border border-white/20 hover:border-white/40 text-neutral-400 hover:text-white shadow-[0_0_20px_rgba(0,0,0,0.6)]'
            }`}
            title={isConnected ? 'Disconnect Mahiru' : 'Connect Memory Core & Awaken Voice'}
          >
            <Power className="w-6 h-6 sm:w-7 sm:h-7" />
          </motion.button>
        </div>

        {/* Right Button: Share Screen Button matching Reference 1 (Shown when connected) */}
        <AnimatePresence>
          {isConnected && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              whileTap={{ scale: 0.92 }}
              onClick={onOpenScreenShare}
              className="w-12 h-12 rounded-full bg-cyan-950/40 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-900/50 hover:border-cyan-400 flex items-center justify-center transition-all duration-300 shadow-lg"
              title="Share Screen Vision Link"
            >
              <Monitor className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
