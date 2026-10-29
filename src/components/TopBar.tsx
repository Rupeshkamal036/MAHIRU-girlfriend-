import React from 'react';
import { Compass, Sliders, Atom, Monitor } from 'lucide-react';
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
    <header className="w-full px-4 sm:px-6 pt-3.5 pb-2 flex items-center justify-between z-30 select-none max-w-5xl mx-auto">
      {/* Left: M A H I R U • matching Reference 1 */}
      <button
        onClick={onOpenInfo}
        className="flex items-center gap-2 text-white/90 hover:text-white transition-colors group cursor-pointer"
        title="Mahiru Core Info"
      >
        <span className="text-xs sm:text-sm font-semibold tracking-[0.3em] font-['Outfit'] uppercase text-neutral-200 group-hover:text-white">
          MAHIRU
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
      </button>

      {/* Right: Sleek unbordered text buttons matching Reference 1 (TOPICS, AUDIO, RECALLS, SHARE SCREEN) */}
      <div className="flex items-center gap-3.5 sm:gap-6">
        {/* TOPICS */}
        <button
          onClick={onOpenTopics}
          className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium tracking-wider text-neutral-400 hover:text-neutral-100 uppercase transition-colors"
          title="Open Conversation Topics"
        >
          <Compass className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-200" />
          <span>TOPICS</span>
        </button>

        {/* AUDIO */}
        <button
          onClick={onOpenAudio}
          className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium tracking-wider text-neutral-400 hover:text-neutral-100 uppercase transition-colors"
          title="Audio Hardware & Settings"
        >
          <Sliders className="w-3.5 h-3.5 text-neutral-400 group-hover:text-cyan-300" />
          <span>AUDIO</span>
        </button>

        {/* RECALLS */}
        <button
          onClick={onOpenRecalls}
          className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium tracking-wider text-neutral-400 hover:text-neutral-100 uppercase transition-colors"
          title="Permanent Memory & Recalls"
        >
          <Atom className="w-3.5 h-3.5 text-neutral-400 group-hover:text-purple-300" />
          <span>RECALLS</span>
        </button>

        {/* SHARE SCREEN */}
        <button
          onClick={onOpenScreenShare}
          className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium tracking-wider text-neutral-400 hover:text-neutral-100 uppercase transition-colors"
          title="Share Screen Vision Link"
        >
          <Monitor className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-300" />
          <span>SHARE SCREEN</span>
        </button>
      </div>
    </header>
  );
};

