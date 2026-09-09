import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Brain, Search, Plus, Sparkles, Trash2, Tag, Check } from 'lucide-react';

export interface MemoryItem {
  id: string;
  category: 'USER PROFILE' | 'PREFERENCES' | 'CONVERSATION' | 'SYSTEM';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  retention: string;
  content: string;
  source: string;
  lastRecalled: string;
  isPermanent: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'mahiru_permanent_memories_v2';

interface PermanentMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermanentMemoryModal: React.FC<PermanentMemoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PERMANENT' | 'HISTORY'>('ALL');
  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('[PermanentMemory] Error loading from storage:', e);
    }
    return [];
  });

  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'USER PROFILE' | 'PREFERENCES' | 'CONVERSATION'>('PREFERENCES');
  const [newPriority, setNewPriority] = useState<'HIGH' | 'MEDIUM'>('HIGH');

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
    } catch (e) {
      console.warn('[PermanentMemory] Error saving to storage:', e);
    }
  }, [memories]);

  if (!isOpen) return null;

  const filtered = memories.filter((m) => {
    if (activeTab === 'PERMANENT' && !m.isPermanent) return false;
    if (activeTab === 'HISTORY' && m.isPermanent) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return m.content.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
  });

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    const newItem: MemoryItem = {
      id: Date.now().toString(),
      category: newCategory,
      priority: newPriority,
      retention: 'PERMANENT',
      content: newContent.trim(),
      source: 'ADDED BY USER',
      lastRecalled: 'Just now',
      isPermanent: true,
      createdAt: Date.now(),
    };

    setMemories([newItem, ...memories]);
    setNewContent('');
    setIsAdding(false);
  };

  const handleDeleteMemory = (id: string) => {
    setMemories(memories.filter((m) => m.id !== id));
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0c0d15] border border-white/10 rounded-2xl p-5 text-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)] custom-scrollbar flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Mahiru Permanent Memory
                </h2>
                <p className="text-[10px] tracking-wider text-purple-300 font-mono">
                  PERSISTENT MEMORIES ON GEMINI
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

          {/* Search bar */}
          <div className="mt-4 relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search persistent memories..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-purple-400/50"
            />
          </div>

          {/* Subheader Action Bar */}
          <div className="flex items-center justify-between mt-3 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto-consulted across chat sessions · {memories.length} active
            </span>
            <button
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center gap-1 text-purple-300 hover:text-white font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAdding ? 'CANCEL' : 'ADD MEMORY'}</span>
            </button>
          </div>

          {/* Add Memory Form */}
          {isAdding && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleAddMemory}
              className="mt-3 p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3"
            >
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What should Mahiru remember about you? (e.g., your hobbies, name, preferences, or special notes)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-400 resize-none"
              />

              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="px-2 py-1 rounded bg-black/60 border border-white/10 text-[11px] text-neutral-300 focus:outline-none"
                  >
                    <option value="PREFERENCES">Preferences</option>
                    <option value="USER PROFILE">User Profile</option>
                    <option value="CONVERSATION">Conversation</option>
                  </select>

                  <select
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="px-2 py-1 rounded bg-black/60 border border-white/10 text-[11px] text-neutral-300 focus:outline-none"
                  >
                    <option value="HIGH">High Priority</option>
                    <option value="MEDIUM">Medium</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!newContent.trim()}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors shadow-md shadow-purple-600/30"
                >
                  Save Memory
                </button>
              </div>
            </motion.form>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 mt-3 pb-2 border-b border-white/5">
            {[
              { id: 'ALL', label: `ALL MEMORIES (${memories.length})` },
              { id: 'PERMANENT', label: `PERMANENT (${memories.filter((m) => m.isPermanent).length})` },
              { id: 'HISTORY', label: `HISTORY (${memories.filter((m) => !m.isPermanent).length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider transition-all ${
                  activeTab === tab.id
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Memories List */}
          <div className="mt-3 space-y-2.5 flex-1">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-neutral-500">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-30 text-purple-400" />
                <p className="text-xs font-medium text-neutral-400">No persistent memories saved yet</p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Click "+ ADD MEMORY" or talk to Mahiru to teach her things about you.
                </p>
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all space-y-2 relative group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider ${
                          item.category === 'USER PROFILE'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        {item.category}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider ${
                          item.priority === 'HIGH'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/5 text-neutral-400 border border-white/10">
                        {item.retention}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteMemory(item.id)}
                      className="p-1 text-neutral-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete this memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs font-medium text-white leading-relaxed">
                    {item.content}
                  </p>

                  <div className="flex items-center justify-between text-[9px] text-neutral-500 font-mono pt-1 border-t border-white/5">
                    <span>{item.source}</span>
                    <span>LAST RECALLED: {item.lastRecalled}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Note */}
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              SHARES RECALL ENGINE · {memories.length} ACTIVE
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
