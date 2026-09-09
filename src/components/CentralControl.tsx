import React from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, PhoneOff, Power, HandMetal, Sparkles } from 'lucide-react';
import { SessionState } from '../types';

interface CentralControlProps {
  state: SessionState;
  isMuted: boolean;
  isMicAvailable?: boolean;
  onTogglePower: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onRequestMic?: () => void;
}

export const CentralControl: React.FC<CentralControlProps> = ({
  state,
  isMuted,
  isMicAvailable = true,
  onTogglePower,
  onToggleMute,
  onInterrupt,
  onRequestMic,
}) => {
  const isConnected = state !== 'disconnected';

  return (
    <div className="relative flex flex-col items-center gap-4 w-full max-w-sm px-6">
      {/* Secondary Controls Row (when active) */}
      <div className="flex items-center justify-center gap-5 h-12">
        {isConnected ? (
          <>
            {/* Mic Toggle or Enable Button */}
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              onClick={!isMicAvailable && onRequestMic ? onRequestMic : onToggleMute}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                !isMicAvailable
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse'
                  : isMuted
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  : 'bg-neutral-900/80 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
              }`}
              title={
                !isMicAvailable
                  ? 'Microphone blocked - Tap to enable mic or unblock'
                  : isMuted
                  ? 'Unmute microphone'
                  : 'Mute microphone'
              }
            >
              {!isMicAvailable || isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </motion.button>

            {/* Central Main Power/Mic Button */}
            <div className="relative flex items-center justify-center">
              {/* Outer pulsing ring */}
              {state === 'speaking' || state === 'listening' ? (
                <motion.div
                  animate={{
                    scale: [1, 1.25, 1],
                    opacity: [0.6, 0.15, 0.6],
                  }}
                  transition={{
                    duration: state === 'speaking' ? 1.4 : 2.0,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className={`absolute -inset-3 rounded-full border ${
                    state === 'speaking' ? 'border-pink-500/50' : 'border-cyan-500/50'
                  }`}
                />
              ) : null}

              <motion.button
                whileTap={{ scale: 0.92 }}
                whileHover={{ scale: 1.04 }}
                onClick={onTogglePower}
                className={`relative w-20 h-20 rounded-full border-2 flex items-center justify-center shadow-2xl transition-all duration-300 ${
                  state === 'speaking'
                    ? 'bg-gradient-to-br from-pink-500 to-rose-600 border-pink-300 text-white shadow-[0_0_35px_rgba(244,63,94,0.6)]'
                    : state === 'listening'
                    ? isMuted
                      ? 'bg-gradient-to-br from-neutral-800 to-neutral-900 border-neutral-700 text-neutral-400 shadow-none'
                      : 'bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-300 text-white shadow-[0_0_35px_rgba(6,182,212,0.6)]'
                    : state === 'connecting'
                    ? 'bg-gradient-to-br from-amber-500 to-yellow-600 border-amber-300 text-white shadow-[0_0_25px_rgba(245,158,11,0.5)]'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                }`}
                title="Disconnect voice session"
              >
                <PhoneOff className="w-8 h-8 drop-shadow-md" />
              </motion.button>
            </div>

            {/* Interrupt / Cut-in Button */}
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              onClick={onInterrupt}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                state === 'speaking'
                  ? 'bg-pink-500/20 border-pink-500/60 text-pink-300 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                  : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
              }`}
              title="Interrupt Mahiru / Cut in"
            >
              <HandMetal className="w-5 h-5" />
            </motion.button>
          </>
        ) : (
          /* Disconnected State: Large prominent Start button */
          <div className="relative flex items-center justify-center">
            {/* Ambient Idle Glow Ring */}
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.4, 0.8, 0.4],
              }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute -inset-2.5 rounded-full bg-gradient-to-r from-pink-500/30 via-purple-500/30 to-cyan-500/30 blur-md pointer-events-none"
            />

            <motion.button
              whileTap={{ scale: 0.94 }}
              whileHover={{ scale: 1.05 }}
              onClick={onTogglePower}
              className="relative px-8 py-4 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 text-white font-semibold text-sm tracking-wider uppercase flex items-center gap-3 shadow-[0_0_30px_rgba(236,72,153,0.5)] border border-pink-300/40 active:shadow-none"
            >
              <Power className="w-5 h-5" />
              <span>Connect with Mahiru</span>
            </motion.button>
          </div>
        )}
      </div>

      {/* Helper label */}
      <div className="text-[11px] text-neutral-400 font-mono tracking-widest text-center">
        {isConnected ? (
          <span className="flex items-center gap-1.5 justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            VOICE LINK ACTIVE · TAP DISCONNECT TO END
          </span>
        ) : (
          'AUDIO-TO-AUDIO ONLY · GEMINI 3.1 LIVE'
        )}
      </div>
    </div>
  );
};
