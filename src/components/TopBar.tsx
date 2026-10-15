import React from 'react';
import { Volume2, Sparkles, Brain, Monitor, ChevronDown } from 'lucide-react';
import { SessionState } from '../types';

interface TopBarProps {
  state: SessionState;
  onOpenInfo: () => void;
  onOpenTopics: () => void;
  onOpenAudio: () => void;
  onOpenRecalls: () => void;
  onOpenScreenShare: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  state,
  onOpenInfo,
  onOpenTopics,
  onOpenAudio,
  onOpenRecalls,
  onOpenScreenShare,
}) => {
  return (
    <header className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-3 pb-2 flex items-center justify-between z-20 shrink-0">
      {/* Brand title button */}
      <button
        onClick={onOpenInfo}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all active:scale-95 group text-left"
      >
        <span className="text-xs sm:text-sm font-bold tracking-wider text-white uppercase font-['Syne']">
          MAHIRU
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white transition-colors" />
      </button>

      {/* Action links */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onOpenTopics}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-neutral-300 hover:text-white transition-all active:scale-95"
        >
          <Sparkles className="w-3 h-3 text-pink-400" />
          <span className="hidden sm:inline">TOPICS</span>
        </button>

        <button
          onClick={onOpenAudio}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-neutral-300 hover:text-white transition-all active:scale-95"
        >
          <Volume2 className="w-3 h-3 text-cyan-400" />
          <span className="hidden sm:inline">AUDIO</span>
        </button>

        <button
          onClick={onOpenRecalls}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-neutral-300 hover:text-white transition-all active:scale-95"
        >
          <Brain className="w-3 h-3 text-purple-400" />
          <span className="hidden sm:inline">RECALLS</span>
        </button>

        <button
          onClick={onOpenScreenShare}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-neutral-300 hover:text-white transition-all active:scale-95"
        >
          <Monitor className="w-3 h-3 text-amber-400" />
          <span className="hidden sm:inline">SHARE</span>
        </button>
      </div>
    </header>
  );
};
