import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mic, Volume2, Radio, Check, Sliders, ShieldCheck } from 'lucide-react';

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
  const [inputDevice, setInputDevice] = useState('auto');
  const [outputDevice, setOutputDevice] = useState('auto');
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [sensitivity, setSensitivity] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-[#0d0e15] border border-white/10 rounded-2xl p-5 text-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)] custom-scrollbar"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Audio & Voice Settings
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  NATIVE LIVE
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Microphone routing, hardware devices & bidirectional audio processing
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 space-y-4 text-xs">
            {/* Top Status Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <Mic className="w-3 h-3 text-cyan-400" />
                    Microphone Input
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ACTIVE
                  </span>
                </div>
                <p className="text-sm font-medium text-white mt-1">Default</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  Sensitivity: <span className="text-cyan-300 font-medium">{sensitivity}</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <Volume2 className="w-3 h-3 text-purple-400" />
                    Audio Output
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    AUTO
                  </span>
                </div>
                <p className="text-sm font-medium text-white mt-1">Default Speaker</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  Bluetooth: <span className="text-neutral-300">Auto-connected</span>
                </p>
              </div>
            </div>

            {/* Microphone Input Device */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  Microphone Input Device
                </label>
                <span className="text-[10px] text-neutral-500">2 available</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { id: 'auto', name: 'Auto (System Default)', desc: 'Recommended / Built-in mic' },
                  { id: 'speakerphone', name: 'Speakerphone', desc: 'Noise-cancelling array' },
                  { id: 'headset', name: 'Headset earpiece', desc: 'Close-talk voice pickup' },
                  { id: 'bluetooth', name: 'Bluetooth headset', desc: 'Handsfree wireless' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setInputDevice(item.id)}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all border ${
                      inputDevice === item.id
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                        : 'bg-white/[0.02] border-white/5 text-neutral-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-xs">{item.name}</p>
                      <p className="text-[10px] text-neutral-500">{item.desc}</p>
                    </div>
                    {inputDevice === item.id && (
                      <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Output Device */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                  Audio Output Device
                </label>
                <span className="text-[10px] text-neutral-500">3 available</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { id: 'auto', name: 'Auto (System Default)', desc: 'Optimal device router' },
                  { id: 'speakerphone', name: 'Speakerphone', desc: 'Device loud speaker' },
                  { id: 'bluetooth', name: 'Bluetooth headset', desc: 'Handsfree connected' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setOutputDevice(item.id)}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all border ${
                      outputDevice === item.id
                        ? 'bg-purple-500/10 border-purple-500/40 text-white'
                        : 'bg-white/[0.02] border-white/5 text-neutral-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-xs">{item.name}</p>
                      <p className="text-[10px] text-neutral-500">{item.desc}</p>
                    </div>
                    {outputDevice === item.id && (
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Processing & VAD Pipeline */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Audio Processing & VAD Pipeline
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Noise Suppression */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-xs font-medium text-white">Noise Suppression</p>
                    <p className="text-[9px] text-neutral-400">Deep learning voice isolation</p>
                  </div>
                  <button
                    onClick={() => setNoiseSuppression(!noiseSuppression)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                      noiseSuppression ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        noiseSuppression ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Echo Cancellation */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-xs font-medium text-white">Echo Cancellation</p>
                    <p className="text-[9px] text-neutral-400">Prevents feedback loop</p>
                  </div>
                  <button
                    onClick={() => setEchoCancellation(!echoCancellation)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                      echoCancellation ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        echoCancellation ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Sensitivity Selector */}
              <div>
                <div className="flex justify-between items-center text-[10px] text-neutral-400 mb-1.5">
                  <span>Microphone Sensitivity (Gain)</span>
                  <span className="text-cyan-300 font-semibold">{sensitivity} (1.0x)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setSensitivity(lvl)}
                      className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                        sensitivity === lvl
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                          : 'bg-white/[0.02] border-white/5 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mahiru Voice Audio Commands */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Mahiru Voice Audio Commands
              </p>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-neutral-300">
                <div className="p-1.5 rounded bg-black/40 border border-white/5">
                  <span className="text-cyan-300">"Bluetooth switch karo"</span>
                  <p className="text-neutral-500 mt-0.5">Transfers audio to BT</p>
                </div>
                <div className="p-1.5 rounded bg-black/40 border border-white/5">
                  <span className="text-cyan-300">"Aawaz thoda tez karo"</span>
                  <p className="text-neutral-500 mt-0.5">Volume level +20%</p>
                </div>
                <div className="p-1.5 rounded bg-black/40 border border-white/5">
                  <span className="text-cyan-300">"Light blue kar do"</span>
                  <p className="text-neutral-500 mt-0.5">Changes ambient glow</p>
                </div>
                <div className="p-1.5 rounded bg-black/40 border border-white/5">
                  <span className="text-cyan-300">"Speaker pe baat karo"</span>
                  <p className="text-neutral-500 mt-0.5">Forces speaker in UI</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-neutral-500">
              Tip: Press & hold audio button to reopen
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-colors shadow-md shadow-cyan-500/20"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
