import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Hash, MessageCircle, Sparkles, Heart, Film, Moon, BookOpen } from 'lucide-react';

interface TopicsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic: (topicPrompt: string) => void;
}

const TOPICS = [
  {
    icon: Film,
    title: 'Anime & Romance K-Dramas',
    desc: 'Talk about romantic love stories, favorite anime episodes, and wholesome series.',
    prompt: 'Mahiru, let us talk about romantic anime and our favorite K-dramas with love stories!',
    tag: 'FAVORITE',
  },
  {
    icon: Heart,
    title: 'How was your day?',
    desc: 'Share your daily thoughts, stress, moments of joy, or just unwind together.',
    prompt: 'Mahiru, how was your day? I missed talking to you!',
    tag: 'DAILY',
  },
  {
    icon: Moon,
    title: 'Late Night Chill & Calm',
    desc: 'Soft bedtime talks, soothing presence, and quiet comfortable moments.',
    prompt: 'Mahiru, let us have a peaceful late-night chat. Tell me something calming.',
    tag: 'NIGHT',
  },
  {
    icon: BookOpen,
    title: 'Study & Coding Companionship',
    desc: 'Keep each other company while working, studying, or building software.',
    prompt: 'Mahiru, keep me company while I work and study today.',
    tag: 'FOCUS',
  },
  {
    icon: Sparkles,
    title: 'Tell Me a Cute Story',
    desc: 'Let Mahiru narrate a sweet whimsical story with expressive reactions.',
    prompt: 'Mahiru, can you tell me a sweet and cute story?',
    tag: 'STORY',
  },
  {
    icon: MessageCircle,
    title: 'Hindi & Hinglish Chit-Chat',
    desc: 'Speak naturally in Hindi and Hinglish like cute everyday banter.',
    prompt: 'Mahiru, thodi der Hindi aur Hinglish me baat karte hain, batao kya haal chaal hai?',
    tag: 'BILINGUAL',
  },
];

export const TopicsModal: React.FC<TopicsModalProps> = ({
  isOpen,
  onClose,
  onSelectTopic,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#0d0e16] border border-white/10 rounded-2xl p-5 text-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)] custom-scrollbar"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                <Hash className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Conversation Topics
                </h2>
                <p className="text-[11px] text-neutral-400">
                  Select a topic to start talking with Mahiru
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* List */}
          <div className="mt-4 space-y-2.5">
            {TOPICS.map((topic, i) => {
              const Icon = topic.icon;
              return (
                <button
                  key={i}
                  onClick={() => {
                    onSelectTopic(topic.prompt);
                    onClose();
                  }}
                  className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/40 hover:bg-cyan-500/5 text-left transition-all flex items-start gap-3 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 shrink-0 group-hover:border-cyan-500/40 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                        {topic.title}
                      </p>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5 text-neutral-400 border border-white/10">
                        {topic.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                      {topic.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-5 pt-3 border-t border-white/10 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
