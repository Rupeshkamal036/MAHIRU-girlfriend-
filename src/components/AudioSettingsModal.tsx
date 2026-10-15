import React from 'react';
import { Volume2, VolumeX, X, Mic } from 'lucide-react';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  isOpen,
  onClose,
  isMuted,
  onToggleMute,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-neutral-900/90 border border-white/10 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-base font-['Syne']">Audio Controls</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isMuted ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Microphone Input</p>
                <p className="text-xs text-neutral-400">{isMuted ? 'Microphone is muted' : 'Microphone is active'}</p>
              </div>
            </div>
            <button
              onClick={onToggleMute}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isMuted
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              }`}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1">
            <p className="text-xs font-semibold text-white">Live Voice Pipeline</p>
            <p className="text-[11px] text-neutral-400">
              Low-latency 16kHz input audio streaming to Gemini 3.1 Live with 24kHz Aoede voice playback.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
