import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Send, Sparkles, MicOff, ExternalLink } from 'lucide-react';
import { SessionState } from '../types';

interface VoiceChatBarProps {
  state: SessionState;
  isMicAvailable: boolean;
  isOpen?: boolean;
  onSendText: (text: string) => void;
  onRequestMic: () => void;
  onClose?: () => void;
}

const QUICK_PROMPTS = [
  'Aap kaise ho Mahiru? 💕',
  'Mahiru, background blue kar do 💙',
  'Purple light kar do 💜',
  'Pink glow chahiye 🌸',
  'Light normal kar do ✨',
  'Can you open YouTube for me? 🎵',
];

export const VoiceChatBar: React.FC<VoiceChatBarProps> = ({
  state,
  isMicAvailable,
  isOpen = true,
  onSendText,
  onRequestMic,
  onClose,
}) => {
  const [text, setText] = useState('');
  const isConnected = state !== 'disconnected';

  if (!isConnected || !isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendText(text.trim());
    setText('');
  };

  const handlePromptClick = (prompt: string) => {
    onSendText(prompt);
  };

  return (
    <div className="w-full max-w-md px-4 mt-2 mb-2 flex flex-col gap-2 z-30">
      {/* If microphone is unavailable, show a helpful alert banner */}
      {!isMicAvailable && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
        >
          <div className="flex items-center gap-1.5">
            <MicOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>Mic blocked · Hearing voice responses via text input</span>
          </div>
          <button
            onClick={onRequestMic}
            className="font-bold underline text-amber-200 hover:text-white shrink-0 ml-2"
          >
            Enable Mic
          </button>
        </motion.div>
      )}

      {/* Quick Prompt Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-[11px]">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handlePromptClick(prompt)}
            className="px-2.5 py-1 rounded-full bg-neutral-900/80 border border-neutral-800 hover:border-pink-500/40 text-neutral-300 hover:text-pink-300 shrink-0 whitespace-nowrap transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Text Message Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isMicAvailable ? 'Type or talk to Mahiru...' : 'Type a message for Mahiru to speak...'}
            className="w-full px-4 py-2.5 pr-10 rounded-2xl bg-neutral-900/90 border border-neutral-800 focus:border-pink-500/60 focus:outline-none text-xs text-white placeholder-neutral-500 transition-colors shadow-inner"
          />
        </div>
        <button
          type="submit"
          disabled={!text.trim()}
          className="w-10 h-10 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 disabled:opacity-40 disabled:pointer-events-none hover:from-pink-400 hover:to-purple-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-pink-500/20 transition-all active:scale-95"
          title="Send message to Mahiru"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
