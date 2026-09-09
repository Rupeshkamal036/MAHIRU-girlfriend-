import React from 'react';
import { motion } from 'motion/react';
import { SessionState } from '../types';
import { Radio, Mic, Volume2, PowerOff } from 'lucide-react';

interface StatusIndicatorProps {
  state: SessionState;
  isMuted: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ state, isMuted }) => {
  const getBadgeConfig = () => {
    switch (state) {
      case 'speaking':
        return {
          label: 'MAHIRU IS SPEAKING',
          subtext: 'Audio Response · 24kHz HD',
          color: 'text-pink-400 border-pink-500/40 bg-pink-950/40 shadow-pink-500/20',
          dot: 'bg-pink-400 shadow-[0_0_10px_#f472b6]',
          icon: <Volume2 className="w-3.5 h-3.5 text-pink-400 animate-pulse" />,
        };
      case 'listening':
        return {
          label: isMuted ? 'MIC MUTED' : 'MAHIRU IS LISTENING',
          subtext: isMuted ? 'Tap mic to unmute' : 'Speak naturally · 16kHz PCM',
          color: isMuted
            ? 'text-amber-400 border-amber-500/40 bg-amber-950/40 shadow-amber-500/20'
            : 'text-cyan-400 border-cyan-500/40 bg-cyan-950/40 shadow-cyan-500/20',
          dot: isMuted ? 'bg-amber-400' : 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]',
          icon: <Mic className={`w-3.5 h-3.5 ${isMuted ? 'text-amber-400' : 'text-cyan-400 animate-pulse'}`} />,
        };
      case 'connecting':
        return {
          label: 'SYNCING NEURAL LINK...',
          subtext: 'Connecting to Gemini 3.1 Live API',
          color: 'text-amber-400 border-amber-500/40 bg-amber-950/40 shadow-amber-500/20',
          dot: 'bg-amber-400 shadow-[0_0_10px_#fbbf24] animate-ping',
          icon: <Radio className="w-3.5 h-3.5 text-amber-400 animate-spin" />,
        };
      case 'disconnected':
      default:
        return {
          label: 'MAHIRU IS OFFLINE',
          subtext: 'Tap central orb or button to connect',
          color: 'text-neutral-400 border-neutral-800 bg-neutral-900/60 shadow-black',
          dot: 'bg-neutral-600',
          icon: <PowerOff className="w-3.5 h-3.5 text-neutral-500" />,
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div className="flex flex-col items-center gap-1.5 z-10 select-none">
      <motion.div
        key={state + (isMuted ? '-muted' : '')}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border backdrop-blur-md shadow-lg ${config.color}`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        <span className="text-xs font-semibold tracking-wider uppercase font-mono">{config.label}</span>
        {config.icon}
      </motion.div>
      <span className="text-[11px] text-neutral-400 font-medium tracking-wide">{config.subtext}</span>
    </div>
  );
};
