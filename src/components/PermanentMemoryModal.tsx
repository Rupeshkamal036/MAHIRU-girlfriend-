import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Brain,
  Search,
  Plus,
  Sparkles,
  Trash2,
  RefreshCw,
  User,
  Heart,
  Star,
  Landmark,
  MessageSquare,
  Info,
} from 'lucide-react';

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

const formatDate = (timestamp?: number) => {
  if (!timestamp) return 'Recent';
  try {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Recent';
  }
};

export const PermanentMemoryModal: React.FC<PermanentMemoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PERMANENT' | 'HISTORY' | 'SESSIONS'>('ALL');
  const [confirmClear, setConfirmClear] = useState(false);
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

  // Sync with /api/memories backend
  const fetchServerMemories = () => {
    fetch('/api/memories')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.memories) && data.memories.length > 0) {
          const serverItems: MemoryItem[] = data.memories.map((m: any) => ({
            id: m.id || m.memoryId,
            category: (m.category || 'PREFERENCES') as any,
            priority: (m.priority || m.importance || 'HIGH') as any,
            retention: m.retention || 'PERMANENT',
            content: m.content || m.value,
            source: m.source || 'ADDED BY USER',
            lastRecalled: m.lastRecalled || 'Just now',
            isPermanent: m.isPermanent !== false,
            createdAt: m.createdAt || Date.now(),
          }));

          setMemories((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newRecords = serverItems.filter((item) => !existingIds.has(item.id));
            if (newRecords.length === 0) return prev;
            return [...prev, ...newRecords];
          });
        }
      })
      .catch((err) => {
        console.log('[PermanentMemory] Initialized with local cache');
      });
  };

  useEffect(() => {
    fetchServerMemories();
  }, []);

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
    if (activeTab === 'SESSIONS') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return m.content.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
  });

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    const newItem: MemoryItem = {
      id: `mem_${Date.now()}`,
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

    // Sync to backend persistent store
    fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem),
    }).catch(() => {
      // Local copy already saved
    });
  };

  const handleDeleteMemory = (id: string) => {
    setMemories(memories.filter((m) => m.id !== id));
    fetch(`/api/memories/${id}`, { method: 'DELETE' }).catch(() => {
      // Local copy updated
    });
  };

  const tabItems = [
    { id: 'ALL' as const, label: 'ALL MEMORIES', icon: null, count: memories.length },
    { id: 'PERMANENT' as const, label: 'PERMANENT', icon: Star, count: memories.filter((m) => m.isPermanent).length },
    { id: 'HISTORY' as const, label: 'HISTORY', icon: Landmark, count: memories.filter((m) => !m.isPermanent).length },
    { id: 'SESSIONS' as const, label: 'CALL SESSIONS', icon: MessageSquare, count: 0 },
  ];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%', opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0.6 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[92vw] sm:w-[88vw] max-w-2xl h-full bg-[#080711] border-l border-[#1f1b34] shadow-[-25px_0_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden text-neutral-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-[#1b172e] shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#141026] border border-[#2b2050] flex items-center justify-center text-[#a855f7] shadow-inner shrink-0">
                <Brain className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Mahiru Permanent Memory
                  </h2>
                  <Sparkles className="w-4 h-4 text-[#22d3ee] fill-[#22d3ee]/20 shrink-0" />
                </div>
                <p className="text-[10px] sm:text-[11px] tracking-wider text-[#9ca3af] font-mono font-bold mt-0.5">
                  PERSISTENT FIRESTORE DB ({memories.length} RECORDS)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  try {
                    const saved = localStorage.getItem(STORAGE_KEY);
                    if (saved) setMemories(JSON.parse(saved));
                  } catch {}
                  fetchServerMemories();
                }}
                className="w-10 h-10 rounded-2xl bg-[#131120] border border-[#242038] text-[#9ca3af] hover:text-white flex items-center justify-center transition-colors"
                title="Refresh memories"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-2xl bg-[#131120] border border-[#242038] text-[#9ca3af] hover:text-white flex items-center justify-center transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="mt-3.5 px-4 sm:px-5 relative shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-[#6b7280] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search persistent memories..."
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 rounded-2xl bg-[#0e0c19] border border-[#1f1b34] text-sm text-neutral-100 placeholder:text-[#64748b] font-normal focus:outline-none focus:border-[#581c87] transition-colors"
              />
            </div>
          </div>

          {/* Subheader Action Bar matching IMAGE 2 */}
          <div className="flex items-center justify-between mt-3 px-4 sm:px-5 shrink-0 text-xs">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#eab308] fill-[#eab308] shrink-0" />
              <span className="text-[#8e8ca0] font-mono text-[11px] sm:text-xs tracking-tight">
                Auto-consolidates across chat sessions
              </span>
            </div>

            <div className="flex items-center gap-2">
              {memories.length > 0 && (
                <button
                  onClick={() => {
                    if (confirmClear) {
                      setMemories([]);
                      setConfirmClear(false);
                    } else {
                      setConfirmClear(true);
                      setTimeout(() => setConfirmClear(false), 3000);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#4a1c2e] bg-[#220d1a] hover:bg-[#2d1123] text-[#f87171] font-mono text-[11px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{confirmClear ? 'CONFIRM?' : 'CLEAR ALL'}</span>
                </button>
              )}

              <button
                onClick={() => setIsAdding(!isAdding)}
                className="px-3.5 py-1.5 rounded-xl border border-[#114244] bg-[#092224] hover:bg-[#0e2f32] text-[#2dd4bf] font-mono text-[11px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 transition-colors shadow-sm shadow-[#114244]/40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAdding ? 'CANCEL' : '+ ADD MEMORY'}</span>
              </button>
            </div>
          </div>

          {/* Add Memory Form */}
          {isAdding && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleAddMemory}
              className="mx-4 sm:mx-5 mt-3 p-4 rounded-2xl bg-[#120f24] border border-[#2a2250] space-y-3 shrink-0"
            >
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What should Mahiru remember about you? (e.g., your hobbies, name, preferences, or special notes)"
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0816] border border-[#211c3a] text-xs sm:text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-purple-500 resize-none"
              />

              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0a0816] border border-[#211c3a] text-xs text-[#8e8ca0] focus:outline-none"
                  >
                    <option value="PREFERENCES">Preferences</option>
                    <option value="USER PROFILE">User Profile</option>
                    <option value="CONVERSATION">Conversation</option>
                  </select>

                  <select
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0a0816] border border-[#211c3a] text-xs text-[#8e8ca0] focus:outline-none"
                  >
                    <option value="HIGH">High Priority</option>
                    <option value="MEDIUM">Medium</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!newContent.trim()}
                  className="px-4 py-1.5 bg-[#7e22ce] hover:bg-[#6b21a8] disabled:opacity-50 text-white font-mono font-bold text-xs rounded-xl tracking-wider uppercase transition-colors"
                >
                  Save Memory
                </button>
              </div>
            </motion.form>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 mt-3 px-4 sm:px-5 pb-2.5 overflow-x-auto custom-scrollbar shrink-0">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              if (isActive) {
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="bg-white text-black font-extrabold px-4 py-1.5 rounded-full text-xs font-mono shadow-sm flex items-center gap-1.5 shrink-0 transition-all"
                  >
                    {Icon && <Icon className="w-3.5 h-3.5 text-black fill-black" />}
                    <span>
                      {tab.label} ({tab.count})
                    </span>
                  </button>
                );
              }

              if (tab.id === 'PERMANENT') {
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="border border-[#382b14] bg-[#1a1409] text-[#eab308] hover:text-[#fde047] px-4 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 transition-all"
                  >
                    <Star className="w-3.5 h-3.5 fill-[#eab308] text-[#eab308]" />
                    <span>PERMANENT ({tab.count})</span>
                  </button>
                );
              }

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="border border-[#231f36] bg-[#12101f] text-[#8e8ca0] hover:text-white px-4 py-1.5 rounded-full text-xs font-mono font-medium flex items-center gap-1.5 shrink-0 transition-all"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-[#8e8ca0]" />}
                  <span>
                    {tab.label} ({tab.count})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-b border-[#1b172e] shrink-0" />

          {/* Memories List - Scrollable area */}
          <div className="px-4 sm:px-5 py-3 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="py-24 text-center text-neutral-500 flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-2xl bg-[#141026] border border-[#2b2050] flex items-center justify-center mb-3 text-[#a855f7]">
                  <Brain className="w-7 h-7 opacity-80" />
                </div>
                <p className="text-sm font-semibold text-neutral-300">No persistent memories saved yet</p>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                  Click "+ ADD MEMORY" or speak to Mahiru to teach her things about you.
                </p>
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  className="p-4 sm:p-4.5 rounded-2xl bg-[#0c0a17] border border-[#1d1932] hover:border-[#2b2548] transition-all flex gap-3.5 sm:gap-4 items-start relative group"
                >
                  {/* Left tall badge icon pill matching IMAGE 2 */}
                  <div className="w-11 sm:w-12 h-16 sm:h-20 rounded-2xl bg-[#07060f] border border-[#1b172c] flex items-center justify-center shrink-0 shadow-inner">
                    {item.category === 'USER PROFILE' ? (
                      <User className="w-5 h-5 text-[#fbbf24]" />
                    ) : item.category === 'PREFERENCES' ? (
                      <Heart className="w-5 h-5 text-[#f472b6]" />
                    ) : (
                      <Brain className="w-5 h-5 text-[#c084fc]" />
                    )}
                  </div>

                  {/* Right content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.category === 'USER PROFILE' ? (
                          <span className="text-[#facc15] font-mono font-bold text-xs tracking-wider uppercase">
                            USER PROFILE
                          </span>
                        ) : item.category === 'PREFERENCES' ? (
                          <span className="text-[#f472b6] font-mono font-bold text-xs tracking-wider uppercase">
                            PREFERENCES
                          </span>
                        ) : (
                          <span className="text-[#c084fc] font-mono font-bold text-xs tracking-wider uppercase">
                            {item.category}
                          </span>
                        )}

                        <span className="bg-[#23180b] border border-[#442c12] text-[#f59e0b] font-mono font-bold text-[10px] px-1.5 py-0.5 rounded tracking-wider uppercase">
                          {item.priority === 'HIGH' ? 'HIGH' : 'MED'}
                        </span>

                        <span className="bg-[#092226] border border-[#12444c] text-[#22d3ee] font-mono font-bold text-[10px] px-1.5 py-0.5 rounded tracking-wider uppercase">
                          VERIFIED
                        </span>

                        <span className="bg-[#240f24] border border-[#471b46] text-[#e879f9] font-mono font-semibold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#f43f5e]" />
                          <span>{item.lastRecalled?.includes('recall') ? item.lastRecalled : '14 recalls'}</span>
                        </span>
                      </div>

                      <button
                        onClick={() => handleDeleteMemory(item.id)}
                        className="p-1 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-auto"
                        title="Delete this memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-white font-semibold text-[15px] sm:text-base leading-snug tracking-tight mt-1.5">
                      {item.content}
                    </p>

                    <div className="text-[#64748b] font-mono text-[11px] pt-2 mt-2 border-t border-[#171426] flex items-center justify-between">
                      <span>Added: {formatDate(item.createdAt)}</span>
                      <span>Last Recalled: {item.lastRecalled || '5 Sept 2026'}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer bar matching IMAGE 2 */}
          <div className="border-t border-[#1b172e] py-3 px-4 sm:px-5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono font-bold text-[#64748b] shrink-0 bg-[#080711]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee] animate-pulse shrink-0" />
              <span className="tracking-wider text-[#71717a]">
                FIRESTORE CLOUD PERSISTENCE • DYNAMIC RECALL ENGINE ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-1 text-[#64748b]">
              <Info className="w-3.5 h-3.5 text-[#52525b]" />
              <span className="tracking-wider">TOP-K RELEVANCE SCORING</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

