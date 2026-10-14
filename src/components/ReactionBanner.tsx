import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactionState, ToolCallData } from '../types';
import { ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react';

interface ReactionBannerProps {
  reaction: ReactionState | null;
  lastToolCall: ToolCallData | null;
  onClearReaction: () => void;
}

interface ActiveReactionItem extends ReactionState {
  instanceId: number;
}

interface ReactionStyleInfo {
  emoji: string;
  title: string;
  accentColor: string;
  glowGradient: string;
  borderColor: string;
  glowShadow: string;
}

export const ReactionBanner: React.FC<ReactionBannerProps> = ({
  reaction,
  lastToolCall,
  onClearReaction,
}) => {
  const [currentReaction, setCurrentReaction] = useState<ActiveReactionItem | null>(null);
  const [websitePrompt, setWebsitePrompt] = useState<{ url: string; siteName: string } | null>(null);

  const reactionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const websiteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onClearReactionRef = useRef(onClearReaction);

  useEffect(() => {
    onClearReactionRef.current = onClearReaction;
  });

  // Handle single active reaction with safe rapid consecutive replacement
  useEffect(() => {
    // If incoming reaction is null, dismiss active banner cleanly
    if (!reaction) {
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current);
        reactionTimerRef.current = null;
      }
      setCurrentReaction(null);
      return;
    }

    // Cancel any existing timer so previous reactions cannot hide the new one
    if (reactionTimerRef.current) {
      clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = null;
    }

    // Assign unique instanceId to ensure AnimatePresence mode="wait" transitions smoothly
    const instanceId = Date.now() + Math.random();
    setCurrentReaction({
      ...reaction,
      instanceId,
    });

    // Keep visible for exactly 3 seconds (3000ms) as specified in requirements
    reactionTimerRef.current = setTimeout(() => {
      setCurrentReaction(null);
      reactionTimerRef.current = null;
      onClearReactionRef.current?.();
    }, 3000);

    return () => {
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current);
        reactionTimerRef.current = null;
      }
    };
  }, [reaction]);

  // Handle tool action prompt (e.g. openWebsite)
  useEffect(() => {
    if (lastToolCall && lastToolCall.name === 'openWebsite') {
      const url = lastToolCall.args?.url;
      const siteName = lastToolCall.args?.siteName || 'Requested Link';
      if (url) {
        if (websiteTimerRef.current) {
          clearTimeout(websiteTimerRef.current);
        }
        setWebsitePrompt({ url, siteName });
        websiteTimerRef.current = setTimeout(() => {
          setWebsitePrompt(null);
          websiteTimerRef.current = null;
        }, 8000);
        return () => {
          if (websiteTimerRef.current) {
            clearTimeout(websiteTimerRef.current);
            websiteTimerRef.current = null;
          }
        };
      }
    }
  }, [lastToolCall]);

  const getReactionIconAndStyle = (type: string): ReactionStyleInfo => {
    switch (type) {
      case 'love':
        return {
          emoji: '💖',
          title: 'Mahiru is smitten',
          accentColor: 'text-pink-300',
          glowGradient: 'from-pink-500/15 via-rose-500/10 to-transparent',
          borderColor: 'border-pink-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
      case 'blush':
        return {
          emoji: '😳',
          title: 'Mahiru blushed',
          accentColor: 'text-rose-300',
          glowGradient: 'from-rose-500/15 via-pink-500/10 to-transparent',
          borderColor: 'border-rose-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
      case 'smirk':
        return {
          emoji: '😏',
          title: 'Mahiru smirks',
          accentColor: 'text-purple-300',
          glowGradient: 'from-purple-500/15 via-indigo-500/10 to-transparent',
          borderColor: 'border-purple-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(168,85,247,0.18)]',
        };
      case 'wink':
        return {
          emoji: '😉',
          title: 'Mahiru winks',
          accentColor: 'text-cyan-300',
          glowGradient: 'from-cyan-500/15 via-blue-500/10 to-transparent',
          borderColor: 'border-cyan-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(6,182,212,0.18)]',
        };
      case 'tease':
        return {
          emoji: '😜',
          title: 'Mahiru is teasing you',
          accentColor: 'text-amber-300',
          glowGradient: 'from-amber-500/15 via-orange-500/10 to-transparent',
          borderColor: 'border-amber-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(245,158,11,0.18)]',
        };
      case 'laugh':
      case 'laughing':
        return {
          emoji: '😆',
          title: 'Mahiru giggles',
          accentColor: 'text-yellow-300',
          glowGradient: 'from-yellow-500/15 via-amber-500/10 to-transparent',
          borderColor: 'border-yellow-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(234,179,8,0.18)]',
        };
      case 'pout':
        return {
          emoji: '🥺',
          title: 'Mahiru pouts',
          accentColor: 'text-indigo-300',
          glowGradient: 'from-indigo-500/15 via-pink-500/10 to-transparent',
          borderColor: 'border-indigo-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(99,102,241,0.18)]',
        };
      case 'happy':
        return {
          emoji: '😊',
          title: 'Mahiru is happy',
          accentColor: 'text-pink-300',
          glowGradient: 'from-pink-500/15 via-rose-500/10 to-transparent',
          borderColor: 'border-pink-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
      case 'excited':
        return {
          emoji: '✨',
          title: 'Mahiru is excited',
          accentColor: 'text-fuchsia-300',
          glowGradient: 'from-fuchsia-500/15 via-pink-500/10 to-transparent',
          borderColor: 'border-fuchsia-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(217,70,239,0.18)]',
        };
      case 'excited_greeting':
        return {
          emoji: '✨',
          title: 'Mahiru is thrilled',
          accentColor: 'text-pink-300',
          glowGradient: 'from-pink-500/15 via-cyan-500/10 to-transparent',
          borderColor: 'border-pink-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
      case 'shy':
        return {
          emoji: '🙈',
          title: 'Mahiru feels shy',
          accentColor: 'text-rose-300',
          glowGradient: 'from-rose-500/15 via-pink-500/10 to-transparent',
          borderColor: 'border-rose-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
      case 'embarrassed':
        return {
          emoji: '🙈',
          title: 'Mahiru is embarrassed',
          accentColor: 'text-rose-300',
          glowGradient: 'from-rose-500/15 via-pink-500/10 to-transparent',
          borderColor: 'border-rose-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
      case 'surprised':
        return {
          emoji: '😲',
          title: 'Mahiru is surprised',
          accentColor: 'text-cyan-300',
          glowGradient: 'from-cyan-500/15 via-sky-500/10 to-transparent',
          borderColor: 'border-cyan-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(6,182,212,0.18)]',
        };
      case 'confused':
        return {
          emoji: '🤔',
          title: 'Mahiru is puzzled',
          accentColor: 'text-indigo-300',
          glowGradient: 'from-indigo-500/15 via-blue-500/10 to-transparent',
          borderColor: 'border-indigo-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(99,102,241,0.18)]',
        };
      case 'relieved':
        return {
          emoji: '😌',
          title: 'Mahiru is relieved',
          accentColor: 'text-emerald-300',
          glowGradient: 'from-emerald-500/15 via-teal-500/10 to-transparent',
          borderColor: 'border-emerald-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(16,185,129,0.18)]',
        };
      case 'thankful':
        return {
          emoji: '🥰',
          title: 'Mahiru is thankful',
          accentColor: 'text-amber-300',
          glowGradient: 'from-amber-500/15 via-orange-500/10 to-transparent',
          borderColor: 'border-amber-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(245,158,11,0.18)]',
        };
      case 'remembering':
        return {
          emoji: '💡',
          title: 'Mahiru remembered',
          accentColor: 'text-blue-300',
          glowGradient: 'from-blue-500/15 via-indigo-500/10 to-transparent',
          borderColor: 'border-blue-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(59,130,246,0.18)]',
        };
      case 'sleepy':
      case 'tired':
        return {
          emoji: '🥱',
          title: 'Mahiru is sleepy',
          accentColor: 'text-indigo-300',
          glowGradient: 'from-slate-500/15 via-indigo-500/10 to-transparent',
          borderColor: 'border-indigo-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(99,102,241,0.18)]',
        };
      case 'sigh':
      case 'taking_a_breath':
        return {
          emoji: '😮‍💨',
          title: 'Mahiru took a breath',
          accentColor: 'text-purple-300',
          glowGradient: 'from-purple-500/15 via-slate-500/10 to-transparent',
          borderColor: 'border-purple-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(168,85,247,0.18)]',
        };
      case 'looking_around':
        return {
          emoji: '👀',
          title: 'Mahiru looks around',
          accentColor: 'text-sky-300',
          glowGradient: 'from-sky-500/15 via-blue-500/10 to-transparent',
          borderColor: 'border-sky-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(14,165,233,0.18)]',
        };
      case 'goodbye':
        return {
          emoji: '👋',
          title: 'Mahiru says goodbye',
          accentColor: 'text-pink-300',
          glowGradient: 'from-pink-500/15 via-rose-500/10 to-transparent',
          borderColor: 'border-pink-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
      default:
        return {
          emoji: '✨',
          title: 'Mahiru reacts',
          accentColor: 'text-pink-300',
          glowGradient: 'from-pink-500/15 via-purple-500/10 to-transparent',
          borderColor: 'border-pink-400/35',
          glowShadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_rgba(244,63,94,0.18)]',
        };
    }
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-40 pointer-events-none flex flex-col gap-2.5">
      {/* 1. Holographic girlfriend mood reaction with subtle frosted glass */}
      <AnimatePresence mode="wait">
        {currentReaction && (() => {
          const style = getReactionIconAndStyle(currentReaction.type);
          return (
            <motion.div
              key={`reaction-${currentReaction.instanceId}`}
              initial={{ opacity: 0, y: -14, scale: 0.96, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{
                opacity: 0,
                y: -14,
                scale: 0.97,
                filter: 'blur(4px)',
                transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] },
              }}
              transition={{
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={`pointer-events-auto flex items-center gap-3.5 p-3 sm:p-3.5 rounded-2xl bg-slate-950/45 bg-gradient-to-r ${style.glowGradient} border ${style.borderColor} backdrop-blur-xl ${style.glowShadow} ring-1 ring-white/10`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/15 backdrop-blur-sm flex items-center justify-center text-2xl shrink-0 shadow-inner">
                {style.emoji}
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <div className={`flex items-center gap-1.5 ${style.accentColor}`}>
                  <Sparkles className="w-3.5 h-3.5 opacity-90 shrink-0" />
                  <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider font-['Outfit'] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {style.title}
                  </span>
                </div>
                {currentReaction.comment ? (
                  <p className="text-xs text-neutral-200/95 italic font-medium mt-0.5 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    &ldquo;{currentReaction.comment}&rdquo;
                  </p>
                ) : null}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* 2. Tool action notification (e.g. openWebsite) */}
      <AnimatePresence mode="wait">
        {websitePrompt && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.96, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{
              opacity: 0,
              y: -14,
              scale: 0.97,
              filter: 'blur(4px)',
              transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] },
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-950/45 border border-cyan-400/35 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_20px_rgba(6,182,212,0.18)] ring-1 ring-white/10 text-cyan-200"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-400/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-cyan-400 font-mono">
                  ACTION EXECUTED
                </div>
                <div className="text-xs font-semibold text-white truncate drop-shadow-sm">
                  Opening {websitePrompt.siteName}
                </div>
              </div>
            </div>

            <a
              href={websitePrompt.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-neutral-950 text-xs font-bold transition-all shrink-0 active:scale-95 shadow-md"
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
