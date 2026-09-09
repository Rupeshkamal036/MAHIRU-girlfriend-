import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactionState, ToolCallData } from '../types';
import { ExternalLink, Sparkles, Heart, Smile, CheckCircle2 } from 'lucide-react';

interface ReactionBannerProps {
  reaction: ReactionState | null;
  lastToolCall: ToolCallData | null;
  onClearReaction: () => void;
}

export const ReactionBanner: React.FC<ReactionBannerProps> = ({
  reaction,
  lastToolCall,
  onClearReaction,
}) => {
  const [visibleReaction, setVisibleReaction] = useState<ReactionState | null>(null);
  const [websitePrompt, setWebsitePrompt] = useState<{ url: string; siteName: string } | null>(null);

  useEffect(() => {
    if (reaction) {
      setVisibleReaction(reaction);
      const timer = setTimeout(() => {
        setVisibleReaction(null);
        onClearReaction();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [reaction, onClearReaction]);

  useEffect(() => {
    if (lastToolCall && lastToolCall.name === 'openWebsite') {
      const url = lastToolCall.args?.url;
      const siteName = lastToolCall.args?.siteName || 'Requested Link';
      if (url) {
        setWebsitePrompt({ url, siteName });
        const timer = setTimeout(() => {
          setWebsitePrompt(null);
        }, 8000);
        return () => clearTimeout(timer);
      }
    }
  }, [lastToolCall]);

  const getReactionIconAndStyle = (type: string) => {
    switch (type) {
      case 'love':
        return {
          emoji: '💖',
          title: 'Mahiru is smitten',
          glow: 'from-pink-500/20 to-rose-500/20 border-pink-500/50 text-pink-300',
        };
      case 'blush':
        return {
          emoji: '😳',
          title: 'Mahiru blushed',
          glow: 'from-rose-500/20 to-pink-500/20 border-rose-500/50 text-rose-300',
        };
      case 'smirk':
        return {
          emoji: '😏',
          title: 'Mahiru smirks',
          glow: 'from-purple-500/20 to-indigo-500/20 border-purple-500/50 text-purple-300',
        };
      case 'wink':
        return {
          emoji: '😉',
          title: 'Mahiru winks',
          glow: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/50 text-cyan-300',
        };
      case 'tease':
        return {
          emoji: '😜',
          title: 'Mahiru is teasing you',
          glow: 'from-amber-500/20 to-orange-500/20 border-amber-500/50 text-amber-300',
        };
      case 'laugh':
        return {
          emoji: '😆',
          title: 'Mahiru giggles',
          glow: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/50 text-yellow-300',
        };
      case 'pout':
        return {
          emoji: '🥺',
          title: 'Mahiru pouts',
          glow: 'from-indigo-500/20 to-pink-500/20 border-indigo-500/50 text-indigo-300',
        };
      case 'happy':
        return {
          emoji: '😊',
          title: 'Mahiru is happy',
          glow: 'from-pink-500/20 to-rose-500/20 border-pink-500/50 text-pink-300',
        };
      case 'excited':
        return {
          emoji: '✨',
          title: 'Mahiru is excited',
          glow: 'from-fuchsia-500/20 to-pink-500/20 border-fuchsia-500/50 text-fuchsia-300',
        };
      case 'shy':
        return {
          emoji: '🙈',
          title: 'Mahiru feels shy',
          glow: 'from-rose-500/20 to-pink-500/20 border-pink-400/40 text-rose-300',
        };
      case 'surprised':
        return {
          emoji: '😲',
          title: 'Mahiru is surprised',
          glow: 'from-cyan-500/20 to-sky-500/20 border-cyan-500/50 text-cyan-300',
        };
      case 'confused':
        return {
          emoji: '🤔',
          title: 'Mahiru is puzzled',
          glow: 'from-indigo-500/20 to-blue-500/20 border-indigo-500/50 text-indigo-300',
        };
      case 'relieved':
        return {
          emoji: '😌',
          title: 'Mahiru is relieved',
          glow: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/50 text-emerald-300',
        };
      case 'thankful':
        return {
          emoji: '🥰',
          title: 'Mahiru is thankful',
          glow: 'from-amber-500/20 to-orange-500/20 border-amber-500/50 text-amber-300',
        };
      case 'remembering':
        return {
          emoji: '💡',
          title: 'Mahiru remembered',
          glow: 'from-blue-500/20 to-indigo-500/20 border-blue-500/50 text-blue-300',
        };
      case 'sleepy':
        return {
          emoji: '🥱',
          title: 'Mahiru is sleepy',
          glow: 'from-slate-500/20 to-indigo-500/20 border-indigo-500/50 text-indigo-300',
        };
      case 'sigh':
        return {
          emoji: '😮‍💨',
          title: 'Mahiru took a breath',
          glow: 'from-purple-500/20 to-slate-500/20 border-purple-500/50 text-purple-300',
        };
      default:
        return {
          emoji: '✨',
          title: 'Mahiru reacts',
          glow: 'from-pink-500/20 to-purple-500/20 border-pink-500/50 text-pink-300',
        };
    }
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-40 pointer-events-none flex flex-col gap-2.5">
      {/* 1. Holographic girlfriend mood reaction */}
      <AnimatePresence>
        {visibleReaction && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className={`pointer-events-auto flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r ${getReactionIconAndStyle(visibleReaction.type).glow} border backdrop-blur-xl shadow-2xl shadow-black/60`}
          >
            <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-2xl shrink-0 shadow-inner">
              {getReactionIconAndStyle(visibleReaction.type).emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 opacity-80" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {getReactionIconAndStyle(visibleReaction.type).title}
                </span>
              </div>
              {visibleReaction.comment ? (
                <p className="text-xs text-white/90 italic font-medium mt-0.5 truncate">
                  "{visibleReaction.comment}"
                </p>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Tool action notification (e.g. openWebsite) */}
      <AnimatePresence>
        {websitePrompt && (
          <motion.div
            initial={{ opacity: 0, y: -15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-900/90 border border-cyan-500/40 backdrop-blur-xl shadow-2xl shadow-cyan-950/40 text-cyan-200"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-cyan-400 font-mono">
                  ACTION EXECUTED
                </div>
                <div className="text-xs font-semibold text-white truncate">
                  Opening {websitePrompt.siteName}
                </div>
              </div>
            </div>

            <a
              href={websitePrompt.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-neutral-950 text-xs font-bold transition-all shrink-0 active:scale-95"
            >
              <span>Visit</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
