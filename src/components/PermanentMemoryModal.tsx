import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getAppSessionId } from '../utils/session';
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
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Delete as BackspaceIcon,
  RotateCcw,
  Check,
} from 'lucide-react';

export interface MemoryItem {
  id: string;
  category: string;
  semanticCategory?: string;
  key?: string;
  semanticKey?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  retention: string;
  content: string;
  source: string;
  lastRecalled: string;
  isPermanent: boolean;
  createdAt: number;
}

export interface SecurityActivityItem {
  timestamp: number;
  action: string;
  success: boolean;
  details?: string;
}

export interface SecurityStatus {
  isEnabled: boolean;
  hasPin: boolean;
  hasCodeword: boolean;
  failedAttempts: number;
  isLocked: boolean;
  lockRemainingSeconds: number;
  lastAttemptAt: number | null;
  updatedAt: number;
  recentActivity: SecurityActivityItem[];
}

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

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const PermanentMemoryModal: React.FC<PermanentMemoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PERMANENT' | 'HISTORY' | 'SESSIONS' | 'SECURITY'>('ALL');
  // Firestore is the sole authoritative source of truth:
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'USER PROFILE' | 'PREFERENCES' | 'CONVERSATION'>('PREFERENCES');
  const [newPriority, setNewPriority] = useState<'HIGH' | 'MEDIUM'>('HIGH');

  // --- Security State ---
  // Application sessions authoritatively initialize with Security ON
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(() => ({
    isEnabled: true,
    hasPin: false,
    hasCodeword: false,
    failedAttempts: 0,
    isLocked: false,
    lockRemainingSeconds: 0,
    lastAttemptAt: null,
    updatedAt: Date.now(),
    recentActivity: [],
  }));
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);

  type SecurityViewMode =
    | 'OVERVIEW'
    | 'SETUP_PIN'
    | 'CHANGE_PIN'
    | 'SETUP_CODEWORD'
    | 'CHANGE_CODEWORD'
    | 'CONFIRM_TOGGLE';

  const [securityView, setSecurityView] = useState<SecurityViewMode>('OVERVIEW');

  // Keypad & PIN form state
  const [pinKeypadStage, setPinKeypadStage] = useState<'INITIAL' | 'CONFIRM' | 'CURRENT'>('INITIAL');
  const [pinTempCurrent, setPinTempCurrent] = useState('');
  const [pinTempNew, setPinTempNew] = useState('');
  const [pinTempConfirm, setPinTempConfirm] = useState('');

  // Codeword form state
  const [showCodewordInput, setShowCodewordInput] = useState(false);
  const [codewordCurrentAuth, setCodewordCurrentAuth] = useState('');
  const [codewordNew, setCodewordNew] = useState('');
  const [codewordConfirm, setCodewordConfirm] = useState('');

  // Toggle authentication
  const [toggleAuthPin, setToggleAuthPin] = useState('');
  const [toggleAuthCodeword, setToggleAuthCodeword] = useState('');

  // Codeword authorization dialog for single memory delete when Security is ON
  const [memoryToDelete, setMemoryToDelete] = useState<MemoryItem | null>(null);
  const [deleteAuthCodeword, setDeleteAuthCodeword] = useState('');
  const [deleteAuthError, setDeleteAuthError] = useState<string | null>(null);
  const [isDeletingWithAuth, setIsDeletingWithAuth] = useState(false);

  // Automatic Memory Saving Master Switch status (session-level, defaults to ON)
  const [isAutoMemorySaving, setIsAutoMemorySaving] = useState<boolean>(true);
  const [isTogglingMemorySaving, setIsTogglingMemorySaving] = useState(false);

  const fetchAutomaticMemorySavingStatus = async () => {
    try {
      const res = await fetch('/api/memory/automatic-saving', {
        headers: {
          'x-session-id': getAppSessionId(),
        },
      });
      const data = await res.json();
      if (data.success && typeof data.automaticMemorySaving === 'boolean') {
        setIsAutoMemorySaving(data.automaticMemorySaving);
      }
    } catch (err) {
      console.warn('[PermanentMemoryModal] Automatic memory saving status fetch failed:', err);
    }
  };

  const toggleAutoMemorySaving = async () => {
    try {
      setIsTogglingMemorySaving(true);
      const nextState = !isAutoMemorySaving;
      const res = await fetch('/api/memory/automatic-saving', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getAppSessionId(),
        },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (data.success && typeof data.automaticMemorySaving === 'boolean') {
        setIsAutoMemorySaving(data.automaticMemorySaving);
      }
    } catch (err) {
      console.warn('[PermanentMemoryModal] Toggle automatic memory saving failed:', err);
    } finally {
      setIsTogglingMemorySaving(false);
    }
  };

  const fetchSecurityStatus = async () => {
    try {
      setSecurityLoading(true);
      const res = await fetch('/api/memory-security/status', {
        headers: {
          'x-session-id': getAppSessionId(),
        },
      });
      const data = await res.json();
      if (data.success && data.status) {
        setSecurityStatus(data.status);
      }
    } catch (err) {
      console.warn('[PermanentMemoryModal] Security status fetch failed:', err);
    } finally {
      setSecurityLoading(false);
    }
  };

  const clearSecurityForms = () => {
    setPinTempCurrent('');
    setPinTempNew('');
    setPinTempConfirm('');
    setPinKeypadStage('INITIAL');
    setCodewordCurrentAuth('');
    setCodewordNew('');
    setCodewordConfirm('');
    setToggleAuthPin('');
    setToggleAuthCodeword('');
    setSecurityError(null);
    setSecuritySuccess(null);
  };

  const resetSecurityView = (successMsg?: string) => {
    clearSecurityForms();
    setSecurityView('OVERVIEW');
    if (successMsg) {
      setSecuritySuccess(successMsg);
      setTimeout(() => setSecuritySuccess(null), 4000);
    }
    fetchSecurityStatus();
  };

  // Sync with /api/memories backend (single authoritative source of truth in Cloud Firestore)
  const fetchServerMemories = async () => {
    try {
      setIsLoadingMemories(true);
      setMemoryError(null);
      const res = await fetch('/api/memories');
      const data = await res.json();
      if (data.success && Array.isArray(data.memories)) {
        const serverItems: MemoryItem[] = data.memories.map((m: any) => ({
          id: m.id || m.memoryId,
          category: m.category || 'favorites',
          semanticCategory: m.semanticCategory || m.category,
          key: m.key,
          semanticKey: m.semanticKey,
          priority: (m.priority || m.importance || 'HIGH') as any,
          retention: m.retention || 'PERMANENT',
          content: m.content || m.value,
          source: m.source || 'ADDED BY USER',
          lastRecalled: m.lastRecalled || 'Just now',
          isPermanent: m.isPermanent !== false,
          createdAt: m.createdAt || Date.now(),
        }));

        setMemories(serverItems);
      } else {
        setMemoryError(data.error || 'Failed to load memories from Firestore');
      }
    } catch (err: any) {
      console.warn('[PermanentMemory] Error loading memories from Firestore:', err);
      setMemoryError('Could not connect to persistent memory database');
    } finally {
      setIsLoadingMemories(false);
    }
  };

  // Fetch fresh Firestore memories whenever the modal opens or mounts
  useEffect(() => {
    if (isOpen) {
      fetchServerMemories();
      fetchSecurityStatus();
      fetchAutomaticMemorySavingStatus();
    }
  }, [isOpen]);

  // Live synchronization: listen for live memory, security, and automatic memory saving events
  useEffect(() => {
    fetchServerMemories();
    fetchSecurityStatus();
    fetchAutomaticMemorySavingStatus();

    const handleMemoryChanged = () => {
      fetchServerMemories();
    };

    const handleSecurityChanged = (e: any) => {
      if (e?.detail?.status) {
        setSecurityStatus(e.detail.status);
      } else {
        fetchSecurityStatus();
      }
    };

    const handleMemorySavingChanged = (e: any) => {
      if (typeof e?.detail?.enabled === 'boolean') {
        setIsAutoMemorySaving(e.detail.enabled);
      } else if (typeof e?.detail?.automaticMemorySaving === 'boolean') {
        setIsAutoMemorySaving(e.detail.automaticMemorySaving);
      } else {
        fetchAutomaticMemorySavingStatus();
      }
    };

    window.addEventListener('mahiru:memory-changed', handleMemoryChanged);
    window.addEventListener('mahiru:security-changed', handleSecurityChanged);
    window.addEventListener('mahiru:memory-saving-changed', handleMemorySavingChanged);
    return () => {
      window.removeEventListener('mahiru:memory-changed', handleMemoryChanged);
      window.removeEventListener('mahiru:security-changed', handleSecurityChanged);
      window.removeEventListener('mahiru:memory-saving-changed', handleMemorySavingChanged);
    };
  }, []);

  if (!isOpen) return null;

  const filtered = memories.filter((m) => {
    if (activeTab === 'PERMANENT' && !m.isPermanent) return false;
    if (activeTab === 'HISTORY' && m.isPermanent) return false;
    if (activeTab === 'SESSIONS') return false;
    if (activeTab === 'SECURITY') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return m.content.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
  });

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || isSavingMemory) return;

    setIsSavingMemory(true);
    setMemoryError(null);

    const payload = {
      category: newCategory,
      priority: newPriority,
      retention: 'PERMANENT',
      content: newContent.trim(),
      source: 'ADDED BY USER',
      isPermanent: true,
    };

    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success || data.status === 'error') {
        const errMsg = data.error || data.message || 'Failed to persist memory in Firestore';
        setMemoryError(errMsg);
        setIsSavingMemory(false);
        return;
      }

      if (data.status === 'duplicate') {
        setMemoryError(data.message || 'Ye memory pehle se saved hai.');
        setIsSavingMemory(false);
        return;
      }

      if (data.status === 'similar_requires_decision') {
        setMemoryError(data.message || data.clarificationPrompt || 'Similar memory exists.');
        setIsSavingMemory(false);
        return;
      }

      // Success confirmed by Firestore backend
      setNewContent('');
      setIsAdding(false);
      setIsSavingMemory(false);
      await fetchServerMemories();
      window.dispatchEvent(new CustomEvent('mahiru:memory-changed'));
    } catch (err: any) {
      setMemoryError(err?.message || 'Network error saving memory');
      setIsSavingMemory(false);
    }
  };

  const handleDeleteMemory = (item: MemoryItem) => {
    // If security is enabled, prompt for secret codeword
    if (securityStatus?.isEnabled) {
      setMemoryToDelete(item);
      setDeleteAuthCodeword('');
      setDeleteAuthError(null);
      return;
    }

    // Direct deletion when security is OFF
    executeDirectDelete(item.id);
  };

  const executeDirectDelete = (id: string, codeword?: string) => {
    fetch(`/api/memories/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': getAppSessionId(),
      },
      body: JSON.stringify(codeword ? { codeword } : {}),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMemories((prev) => prev.filter((m) => m.id !== id));
          fetchServerMemories();
          window.dispatchEvent(new CustomEvent('mahiru:memory-changed'));
        } else if (data.status === 'codeword_required' || data.requiresCodeword) {
          const target = memories.find((m) => m.id === id);
          if (target) {
            setMemoryToDelete(target);
            setDeleteAuthCodeword('');
            setDeleteAuthError(null);
          }
        }
      })
      .catch((err) => {
        console.warn('[PermanentMemory] Delete request error:', err);
      });
  };

  const handleConfirmAuthorizedDelete = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!memoryToDelete || memoryToDelete.id === 'ALL_MEMORIES') {
      setMemoryToDelete(null);
      return;
    }
    if (!deleteAuthCodeword.trim()) {
      setDeleteAuthError('Secret Codeword is required to delete this memory.');
      return;
    }

    setIsDeletingWithAuth(true);
    setDeleteAuthError(null);

    try {
      const res = await fetch(`/api/memories/${memoryToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getAppSessionId(),
        },
        body: JSON.stringify({ codeword: deleteAuthCodeword.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setDeleteAuthError(data.error || 'Incorrect Codeword. Memory deletion rejected.');
        setIsDeletingWithAuth(false);
        return;
      }

      // Successfully deleted single memory
      setMemories((prev) => prev.filter((m) => m.id !== memoryToDelete.id));
      setMemoryToDelete(null);
      setDeleteAuthCodeword('');
      fetchServerMemories();
      fetchSecurityStatus();
      window.dispatchEvent(new CustomEvent('mahiru:memory-changed'));
    } catch (err: any) {
      setDeleteAuthError(err?.message || 'Failed to delete memory.');
    } finally {
      setIsDeletingWithAuth(false);
    }
  };

  // --- Security Handlers ---
  const handleKeypadPress = (digit: string) => {
    setSecurityError(null);
    if (securityView === 'SETUP_PIN') {
      if (pinKeypadStage === 'INITIAL') {
        if (pinTempNew.length < 8) setPinTempNew((prev) => prev + digit);
      } else {
        if (pinTempConfirm.length < 8) setPinTempConfirm((prev) => prev + digit);
      }
    } else if (securityView === 'CHANGE_PIN') {
      if (pinKeypadStage === 'CURRENT') {
        if (pinTempCurrent.length < 8) setPinTempCurrent((prev) => prev + digit);
      } else if (pinKeypadStage === 'INITIAL') {
        if (pinTempNew.length < 8) setPinTempNew((prev) => prev + digit);
      } else {
        if (pinTempConfirm.length < 8) setPinTempConfirm((prev) => prev + digit);
      }
    } else if (securityView === 'CONFIRM_TOGGLE') {
      if (toggleAuthPin.length < 8) setToggleAuthPin((prev) => prev + digit);
    }
  };

  const handleKeypadBackspace = () => {
    setSecurityError(null);
    if (securityView === 'SETUP_PIN') {
      if (pinKeypadStage === 'INITIAL') setPinTempNew((prev) => prev.slice(0, -1));
      else setPinTempConfirm((prev) => prev.slice(0, -1));
    } else if (securityView === 'CHANGE_PIN') {
      if (pinKeypadStage === 'CURRENT') setPinTempCurrent((prev) => prev.slice(0, -1));
      else if (pinKeypadStage === 'INITIAL') setPinTempNew((prev) => prev.slice(0, -1));
      else setPinTempConfirm((prev) => prev.slice(0, -1));
    } else if (securityView === 'CONFIRM_TOGGLE') {
      setToggleAuthPin((prev) => prev.slice(0, -1));
    }
  };

  const handleKeypadClear = () => {
    setSecurityError(null);
    if (securityView === 'SETUP_PIN') {
      if (pinKeypadStage === 'INITIAL') setPinTempNew('');
      else setPinTempConfirm('');
    } else if (securityView === 'CHANGE_PIN') {
      if (pinKeypadStage === 'CURRENT') setPinTempCurrent('');
      else if (pinKeypadStage === 'INITIAL') setPinTempNew('');
      else setPinTempConfirm('');
    } else if (securityView === 'CONFIRM_TOGGLE') {
      setToggleAuthPin('');
    }
  };

  const submitInitialPin = async () => {
    if (pinTempNew.length < 4) {
      setSecurityError('PIN must be at least 4 digits');
      return;
    }
    if (pinTempNew !== pinTempConfirm) {
      setSecurityError('PIN confirmation does not match');
      setPinKeypadStage('INITIAL');
      setPinTempConfirm('');
      return;
    }

    try {
      setSecurityLoading(true);
      const res = await fetch('/api/memory-security/setup-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getAppSessionId(),
        },
        body: JSON.stringify({ pin: pinTempNew, confirmPin: pinTempConfirm }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to setup PIN');
      }
      resetSecurityView('PIN created securely!');
    } catch (err: any) {
      setSecurityError(err.message || 'Error configuring PIN');
    } finally {
      setSecurityLoading(false);
    }
  };

  const submitChangePin = async () => {
    if (pinTempNew.length < 4) {
      setSecurityError('New PIN must be at least 4 digits');
      return;
    }
    if (pinTempNew !== pinTempConfirm) {
      setSecurityError('New PIN confirmation does not match');
      setPinKeypadStage('INITIAL');
      setPinTempConfirm('');
      return;
    }

    try {
      setSecurityLoading(true);
      const res = await fetch('/api/memory-security/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getAppSessionId(),
        },
        body: JSON.stringify({
          currentPin: pinTempCurrent,
          newPin: pinTempNew,
          confirmNewPin: pinTempConfirm,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update PIN');
      }
      resetSecurityView('PIN updated successfully!');
    } catch (err: any) {
      setSecurityError(err.message || 'Error updating PIN');
    } finally {
      setSecurityLoading(false);
    }
  };

  const submitInitialCodeword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codewordNew.trim() || codewordNew.trim().length < 3) {
      setSecurityError('Codeword must be at least 3 characters');
      return;
    }
    if (codewordNew.trim().toLowerCase() !== codewordConfirm.trim().toLowerCase()) {
      setSecurityError('Codeword confirmation does not match');
      return;
    }

    try {
      setSecurityLoading(true);
      const res = await fetch('/api/memory-security/setup-codeword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getAppSessionId(),
        },
        body: JSON.stringify({
          codeword: codewordNew.trim(),
          confirmCodeword: codewordConfirm.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to setup Codeword');
      }
      resetSecurityView('Voice codeword established securely!');
    } catch (err: any) {
      setSecurityError(err.message || 'Error configuring codeword');
    } finally {
      setSecurityLoading(false);
    }
  };

  const submitChangeCodeword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codewordCurrentAuth.trim()) {
      setSecurityError('Current PIN is required to change codeword');
      return;
    }
    if (!codewordNew.trim() || codewordNew.trim().length < 3) {
      setSecurityError('New Codeword must be at least 3 characters');
      return;
    }
    if (codewordNew.trim().toLowerCase() !== codewordConfirm.trim().toLowerCase()) {
      setSecurityError('New Codeword confirmation does not match');
      return;
    }

    try {
      setSecurityLoading(true);
      const res = await fetch('/api/memory-security/change-codeword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getAppSessionId(),
        },
        body: JSON.stringify({
          currentPin: codewordCurrentAuth.trim(),
          newCodeword: codewordNew.trim(),
          confirmNewCodeword: codewordConfirm.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update Codeword');
      }
      resetSecurityView('Voice codeword updated successfully!');
    } catch (err: any) {
      setSecurityError(err.message || 'Error updating codeword');
    } finally {
      setSecurityLoading(false);
    }
  };

  const submitToggleSecurity = async () => {
    const targetState = !securityStatus?.isEnabled;
    try {
      setSecurityLoading(true);
      const payload: any = { enabled: targetState, sessionId: getAppSessionId() };
      if (!targetState) {
        // Turning Security OFF: strictly requires Codeword ONLY!
        if (!toggleAuthCodeword.trim()) {
          setSecurityError('Voice Codeword is required to turn Security OFF.');
          setSecurityLoading(false);
          return;
        }
        payload.codeword = toggleAuthCodeword.trim();
      } else {
        // Turning Security ON: PIN
        payload.pin = toggleAuthPin.trim() || undefined;
      }

      const res = await fetch('/api/memory-security/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getAppSessionId(),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to toggle security');
      }
      resetSecurityView(`Memory security turned ${targetState ? 'ON' : 'OFF'}!`);
    } catch (err: any) {
      setSecurityError(err.message || 'Error changing security state');
    } finally {
      setSecurityLoading(false);
    }
  };

  const tabItems = [
    { id: 'ALL' as const, label: 'ALL MEMORIES', icon: null, count: memories.length },
    { id: 'PERMANENT' as const, label: 'PERMANENT', icon: Star, count: memories.filter((m) => m.isPermanent).length },
    { id: 'HISTORY' as const, label: 'HISTORY', icon: Landmark, count: memories.filter((m) => !m.isPermanent).length },
    { id: 'SESSIONS' as const, label: 'CALL SESSIONS', icon: MessageSquare, count: 0 },
    {
      id: 'SECURITY' as const,
      label: 'SECURITY',
      icon: Shield,
      count: securityStatus ? (securityStatus.isEnabled ? 'ON' : 'OFF') : 'ON',
    },
  ];

  const currentPinLength =
    securityView === 'SETUP_PIN'
      ? pinKeypadStage === 'INITIAL'
        ? pinTempNew.length
        : pinTempConfirm.length
      : securityView === 'CHANGE_PIN'
      ? pinKeypadStage === 'CURRENT'
        ? pinTempCurrent.length
        : pinKeypadStage === 'INITIAL'
        ? pinTempNew.length
        : pinTempConfirm.length
      : toggleAuthPin.length;

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
                  fetchServerMemories();
                  fetchSecurityStatus();
                  fetchAutomaticMemorySavingStatus();
                }}
                disabled={isLoadingMemories}
                className="w-10 h-10 rounded-2xl bg-[#131120] border border-[#242038] text-[#9ca3af] hover:text-white disabled:opacity-50 flex items-center justify-center transition-colors"
                title="Refresh memories from Firestore"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingMemories ? 'animate-spin text-purple-400' : ''}`} />
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

          {/* Search bar (only on memory lists) */}
          {activeTab !== 'SECURITY' && (
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
          )}

          {/* Subheader Action Bar (only on memory lists) */}
          {activeTab !== 'SECURITY' && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-4 sm:px-5 shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#eab308] fill-[#eab308] shrink-0" />
                  <span className="text-[#8e8ca0] font-mono text-[11px] sm:text-xs tracking-tight">
                    Auto-consolidates across chat sessions
                  </span>
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider border select-none ${
                    isAutoMemorySaving
                      ? 'bg-[#064e3b]/50 border-[#059669]/60 text-[#34d399]'
                      : 'bg-[#18122a] border-[#382b60] text-[#9ca3af]'
                  }`}
                  title={isAutoMemorySaving ? 'Automatic memory saving is ON' : 'Automatic memory saving is OFF'}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isAutoMemorySaving ? 'bg-[#34d399] shadow-[0_0_6px_#34d399] animate-pulse' : 'bg-[#6b7280]'}`} />
                  <span>MEMORY SAVING: {isAutoMemorySaving ? 'ON' : 'OFF'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {memories.length > 0 && (
                  <button
                    type="button"
                    disabled={true}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-[#2e1d28] bg-[#170e16] text-[#71717a] font-mono text-[11px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 cursor-not-allowed opacity-60 select-none transition-colors"
                    title="Permanent memories cannot be deleted via UI Clear All. Bulk deletion is strictly reserved for authorized voice commands."
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#71717a]" />
                    <span>CLEAR ALL</span>
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
          )}

          {/* Add Memory Form */}
          {activeTab !== 'SECURITY' && isAdding && (
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

              {memoryError && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                  <span>{memoryError}</span>
                </div>
              )}

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
                  disabled={!newContent.trim() || isSavingMemory}
                  className="px-4 py-1.5 bg-[#7e22ce] hover:bg-[#6b21a8] disabled:opacity-50 text-white font-mono font-bold text-xs rounded-xl tracking-wider uppercase transition-colors"
                >
                  {isSavingMemory ? 'Saving...' : 'Save Memory'}
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
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === 'SECURITY') resetSecurityView();
                    }}
                    className={`font-extrabold px-4 py-1.5 rounded-full text-xs font-mono shadow-sm flex items-center gap-1.5 shrink-0 transition-all ${
                      tab.id === 'SECURITY'
                        ? 'bg-[#06b6d4] text-black shadow-[#06b6d4]/30'
                        : 'bg-white text-black'
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5 fill-current" />}
                    <span>
                      {tab.label} ({tab.count})
                    </span>
                  </button>
                );
              }

              if (tab.id === 'SECURITY') {
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      resetSecurityView();
                    }}
                    className={`border px-4 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                      securityStatus?.isEnabled
                        ? 'border-[#0e7490] bg-[#083344] text-[#22d3ee] hover:text-[#67e8f9]'
                        : 'border-[#2d2448] bg-[#140f28] text-[#a855f7] hover:text-white'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>SECURITY ({tab.count})</span>
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

            {/* Memory Saving Status Badge next to Security */}
            <div
              className={`border px-3.5 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 transition-all select-none ${
                isAutoMemorySaving
                  ? 'border-[#065f46] bg-[#064e3b]/30 text-[#34d399]'
                  : 'border-[#2d2448] bg-[#140f28] text-[#9ca3af]'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-current" />
              <span>MEMORY SAVING:</span>
              <span className={`font-extrabold ${isAutoMemorySaving ? 'text-[#34d399]' : 'text-neutral-400'}`}>
                {isAutoMemorySaving ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          <div className="border-b border-[#1b172e] shrink-0" />

          {/* Main Content Area */}
          {activeTab === 'SECURITY' ? (
            /* ========================================================================= */
            /* =================== MEMORY SECURITY SUBSECTION (STEP 2) ================= */
            /* ========================================================================= */
            <div className="px-4 sm:px-5 py-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
              {/* Notifications */}
              {securityError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{securityError}</span>
                </div>
              )}
              {securitySuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{securitySuccess}</span>
                </div>
              )}

              {/* ========================================================================= */}
              {/* =================== MEMORY SAVING STATUS SECTION ======================== */}
              {/* ========================================================================= */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0c0a19] border border-[#221b3f] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
                      isAutoMemorySaving
                        ? 'bg-[#062d22] border-[#059669] text-[#34d399] shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                        : 'bg-[#18122a] border-[#382b60] text-[#9ca3af]'
                    }`}
                  >
                    <Brain className={`w-6 h-6 ${isAutoMemorySaving ? 'text-[#34d399]' : 'text-[#9ca3af]'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-base">Memory Saving</h3>
                      <span
                        className={`text-[10px] font-mono font-extrabold px-2.5 py-0.5 rounded-full tracking-wider uppercase flex items-center gap-1.5 ${
                          isAutoMemorySaving
                            ? 'bg-[#064e3b] text-[#34d399] border border-[#059669]'
                            : 'bg-[#211a36] text-[#9ca3af] border border-[#3b2e5c]'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isAutoMemorySaving ? 'bg-[#34d399] shadow-[0_0_6px_#34d399] animate-pulse' : 'bg-[#6b7280]'}`} />
                        {isAutoMemorySaving ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-xs text-[#8e8ca0] mt-0.5">
                      Automatic conversation memory extraction & learning (Voice command: &quot;Memory saving band/ON karo&quot;)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAutoMemorySaving()}
                    disabled={isTogglingMemorySaving}
                    className={`px-4 py-2 rounded-xl font-mono font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 ${
                      isAutoMemorySaving
                        ? 'border border-[#065f46] bg-[#064e3b]/50 hover:bg-[#064e3b]/70 text-[#34d399]'
                        : 'border border-[#382b60] bg-[#140f28] hover:bg-[#1a1435] text-[#9ca3af]'
                    }`}
                    title={isAutoMemorySaving ? 'Click to turn memory saving OFF' : 'Click to turn memory saving ON'}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>MEMORY SAVING {isAutoMemorySaving ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>

              {/* Status Header Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0c0a19] border border-[#221b3f] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
                      securityStatus?.isEnabled
                        ? 'bg-[#082f3c] border-[#0891b2] text-[#22d3ee] shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                        : 'bg-[#18122a] border-[#382b60] text-[#9ca3af]'
                    }`}
                  >
                    {securityStatus?.isEnabled ? (
                      <ShieldCheck className="w-6 h-6 text-[#22d3ee]" />
                    ) : (
                      <ShieldAlert className="w-6 h-6 text-[#9ca3af]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-base">Memory Vault Security</h3>
                      <span
                        className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full tracking-wider uppercase ${
                          securityStatus?.isEnabled
                            ? 'bg-[#09353e] text-[#22d3ee] border border-[#0e7490]'
                            : 'bg-[#211a36] text-[#9ca3af] border border-[#3b2e5c]'
                        }`}
                      >
                        {securityStatus?.isEnabled ? 'PROTECTED' : 'DISABLED'}
                      </span>
                    </div>
                    <p className="text-xs text-[#8e8ca0] mt-0.5">
                      Independent numeric PIN and voice codeword authentication
                    </p>
                  </div>
                </div>

                {/* Turn Security ON/OFF button */}
                <button
                  onClick={() => {
                    setSecurityError(null);
                    if (securityStatus?.isEnabled) {
                      // Turning Security OFF: strictly requires Codeword ONLY
                      setSecurityView('CONFIRM_TOGGLE');
                      setToggleAuthCodeword('');
                    } else {
                      // Turning Security ON: directly turns ON without asking for Codeword or PIN
                      submitToggleSecurity();
                    }
                  }}
                  className={`px-4 py-2 rounded-xl font-mono font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 ${
                    securityStatus?.isEnabled
                      ? 'border border-[#4c1d2e] bg-[#220d18] hover:bg-[#301122] text-[#fb7185]'
                      : 'border border-[#0e7490] bg-[#063342] hover:bg-[#094254] text-[#22d3ee]'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{securityStatus?.isEnabled ? 'TURN SECURITY OFF' : 'ACTIVATE SECURITY'}</span>
                </button>
              </div>

              {/* Lockout / Attempt Status Alert */}
              {securityStatus?.isLocked && (
                <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
                  <div>
                    <div className="font-bold uppercase tracking-wider">Security Temporarily Locked</div>
                    <div className="text-[11px] text-rose-300">
                      Rate limit reached. Unlocks in {securityStatus.lockRemainingSeconds} seconds.
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive View Router */}
              {securityView === 'OVERVIEW' && (
                <div className="space-y-4">
                  {/* Two Credential Cards: PIN and CODEWORD */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* PIN Card */}
                    <div className="p-4 rounded-2xl bg-[#0d0b1a] border border-[#1f1a36] flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-[#a855f7]" />
                            <span className="font-mono font-bold text-xs tracking-wider uppercase text-white">
                              Numeric PIN
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                              securityStatus?.hasPin
                                ? 'bg-[#09352e] text-[#34d399] border border-[#065f46]'
                                : 'bg-[#2d1b1f] text-[#fb7185] border border-[#501c27]'
                            }`}
                          >
                            {securityStatus?.hasPin ? 'CONFIGURED' : 'NOT SET'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8e8ca0] mt-2 leading-relaxed">
                          4–8 digit numeric security code. Never stored as plaintext, never spoken back by Mahiru.
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[#19152b] flex items-center justify-end">
                        {securityStatus?.hasPin ? (
                          <button
                            onClick={() => {
                              clearSecurityForms();
                              setPinKeypadStage('CURRENT');
                              setSecurityView('CHANGE_PIN');
                            }}
                            className="px-3 py-1.5 rounded-xl border border-[#2b244d] bg-[#16122c] hover:bg-[#1f193d] text-white font-mono text-xs font-semibold tracking-wider transition-colors"
                          >
                            CHANGE PIN
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              clearSecurityForms();
                              setPinKeypadStage('INITIAL');
                              setSecurityView('SETUP_PIN');
                            }}
                            className="px-3.5 py-1.5 rounded-xl border border-[#4c1d95] bg-[#3b0764] hover:bg-[#581c87] text-white font-mono text-xs font-bold tracking-wider transition-colors"
                          >
                            + SET UP PIN
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Codeword Card */}
                    <div className="p-4 rounded-2xl bg-[#0d0b1a] border border-[#1f1a36] flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-[#38bdf8]" />
                            <span className="font-mono font-bold text-xs tracking-wider uppercase text-white">
                              Voice Codeword
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                              securityStatus?.hasCodeword
                                ? 'bg-[#09352e] text-[#34d399] border border-[#065f46]'
                                : 'bg-[#2d1b1f] text-[#fb7185] border border-[#501c27]'
                            }`}
                          >
                            {securityStatus?.hasCodeword ? 'CONFIGURED' : 'NOT SET'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8e8ca0] mt-2 leading-relaxed">
                          Voice-verifiable phrase (Hindi/Hinglish/English). Never revealed or spoken back by Mahiru.
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[#19152b] flex items-center justify-end">
                        {securityStatus?.hasCodeword ? (
                          <button
                            onClick={() => {
                              clearSecurityForms();
                              setSecurityView('CHANGE_CODEWORD');
                            }}
                            className="px-3 py-1.5 rounded-xl border border-[#2b244d] bg-[#16122c] hover:bg-[#1f193d] text-white font-mono text-xs font-semibold tracking-wider transition-colors"
                          >
                            CHANGE CODEWORD
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              clearSecurityForms();
                              setSecurityView('SETUP_CODEWORD');
                            }}
                            className="px-3.5 py-1.5 rounded-xl border border-[#0e7490] bg-[#083344] hover:bg-[#0c4a6e] text-[#38bdf8] font-mono text-xs font-bold tracking-wider transition-colors"
                          >
                            + SET UP CODEWORD
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Security Activity & Attempt Status Log */}
                  <div className="p-4 rounded-2xl bg-[#0c0a18] border border-[#1b1730] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-[#a855f7]" />
                        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                          Security Audit Log & Activity
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono text-[#64748b]">
                        FAILED ATTEMPTS: {securityStatus?.failedAttempts || 0} / 5
                      </span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {securityStatus?.recentActivity && securityStatus.recentActivity.length > 0 ? (
                        securityStatus.recentActivity.map((act, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-2 rounded-xl bg-[#07060f] border border-[#18142b] flex items-center justify-between text-xs font-mono"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  act.success ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}
                              />
                              <span className="text-neutral-200 font-semibold">{act.action}</span>
                              {act.details && (
                                <span className="text-neutral-500 text-[10px] hidden sm:inline">
                                  — {act.details}
                                </span>
                              )}
                            </div>
                            <span className="text-neutral-500 text-[10px]">
                              {formatDate(act.timestamp)} {formatTime(act.timestamp)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="py-6 text-center text-xs text-neutral-500 font-mono">
                          No security events recorded yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ================= PIN KEYPAD ENTRY PANEL ================= */}
              {(securityView === 'SETUP_PIN' || securityView === 'CHANGE_PIN') && (
                <div className="p-5 rounded-2xl bg-[#0c0a1a] border border-[#251e44] max-w-md mx-auto space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1b1633] pb-3">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-[#a855f7]" />
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                        {securityView === 'SETUP_PIN' ? 'Set Up Initial PIN' : 'Change Security PIN'}
                      </h3>
                    </div>
                    <button
                      onClick={() => resetSecurityView()}
                      className="p-1 rounded-lg text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Stage description */}
                  <div className="text-center space-y-1">
                    <p className="text-xs text-[#9ca3af] font-mono">
                      {securityView === 'CHANGE_PIN' && pinKeypadStage === 'CURRENT'
                        ? 'Enter your CURRENT PIN:'
                        : pinKeypadStage === 'INITIAL'
                        ? 'Enter NEW 4-8 digit numeric PIN:'
                        : 'Confirm your NEW PIN:'}
                    </p>

                    {/* Masked dots display */}
                    <div className="flex items-center justify-center gap-2.5 py-3">
                      {Array.from({ length: Math.max(4, currentPinLength) }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                            idx < currentPinLength
                              ? 'bg-[#a855f7] border-[#c084fc] shadow-[0_0_8px_#a855f7]'
                              : 'bg-[#15102a] border-[#2f2450]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Numeric Keypad Grid */}
                  <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleKeypadPress(num)}
                        className="h-12 rounded-xl bg-[#130f28] hover:bg-[#201844] border border-[#271d47] text-white font-mono font-bold text-lg active:scale-95 transition-all shadow-inner"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleKeypadClear}
                      className="h-12 rounded-xl bg-[#1b1122] hover:bg-[#2c1533] border border-[#401b3a] text-rose-300 font-mono text-xs font-bold active:scale-95 transition-all"
                    >
                      CLEAR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      className="h-12 rounded-xl bg-[#130f28] hover:bg-[#201844] border border-[#271d47] text-white font-mono font-bold text-lg active:scale-95 transition-all shadow-inner"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleKeypadBackspace}
                      className="h-12 rounded-xl bg-[#161226] hover:bg-[#251d3e] border border-[#2c234b] text-neutral-300 flex items-center justify-center active:scale-95 transition-all"
                    >
                      <BackspaceIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Actions for Keypad Navigation */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => resetSecurityView()}
                      className="px-3 py-1.5 rounded-xl border border-[#251e44] text-xs font-mono text-neutral-400 hover:text-white"
                    >
                      CANCEL
                    </button>

                    {securityView === 'SETUP_PIN' ? (
                      pinKeypadStage === 'INITIAL' ? (
                        <button
                          type="button"
                          disabled={pinTempNew.length < 4}
                          onClick={() => {
                            if (pinTempNew.length >= 4) {
                              setPinKeypadStage('CONFIRM');
                              setSecurityError(null);
                            }
                          }}
                          className="px-4 py-1.5 rounded-xl bg-[#7e22ce] hover:bg-[#6b21a8] disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                        >
                          NEXT →
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPinKeypadStage('INITIAL');
                              setPinTempConfirm('');
                            }}
                            className="px-2.5 py-1.5 rounded-xl border border-[#2a2250] text-xs font-mono text-neutral-400"
                          >
                            BACK
                          </button>
                          <button
                            type="button"
                            disabled={securityLoading || pinTempConfirm.length < 4}
                            onClick={submitInitialPin}
                            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                          >
                            {securityLoading ? 'SAVING...' : 'SAVE PIN'}
                          </button>
                        </div>
                      )
                    ) : (
                      /* CHANGE PIN STAGES */
                      pinKeypadStage === 'CURRENT' ? (
                        <button
                          type="button"
                          disabled={pinTempCurrent.length < 4}
                          onClick={() => {
                            if (pinTempCurrent.length >= 4) {
                              setPinKeypadStage('INITIAL');
                              setSecurityError(null);
                            }
                          }}
                          className="px-4 py-1.5 rounded-xl bg-[#7e22ce] hover:bg-[#6b21a8] disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                        >
                          NEXT →
                        </button>
                      ) : pinKeypadStage === 'INITIAL' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPinKeypadStage('CURRENT')}
                            className="px-2.5 py-1.5 rounded-xl border border-[#2a2250] text-xs font-mono text-neutral-400"
                          >
                            BACK
                          </button>
                          <button
                            type="button"
                            disabled={pinTempNew.length < 4}
                            onClick={() => {
                              if (pinTempNew.length >= 4) {
                                setPinKeypadStage('CONFIRM');
                                setSecurityError(null);
                              }
                            }}
                            className="px-4 py-1.5 rounded-xl bg-[#7e22ce] hover:bg-[#6b21a8] disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                          >
                            NEXT →
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPinKeypadStage('INITIAL');
                              setPinTempConfirm('');
                            }}
                            className="px-2.5 py-1.5 rounded-xl border border-[#2a2250] text-xs font-mono text-neutral-400"
                          >
                            BACK
                          </button>
                          <button
                            type="button"
                            disabled={securityLoading || pinTempConfirm.length < 4}
                            onClick={submitChangePin}
                            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                          >
                            {securityLoading ? 'UPDATING...' : 'UPDATE PIN'}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* ================= CODEWORD FORM PANEL ================= */}
              {(securityView === 'SETUP_CODEWORD' || securityView === 'CHANGE_CODEWORD') && (
                <div className="p-5 rounded-2xl bg-[#0c0a1a] border border-[#251e44] max-w-md mx-auto space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1b1633] pb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#38bdf8]" />
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                        {securityView === 'SETUP_CODEWORD' ? 'Set Up Voice Codeword' : 'Change Voice Codeword'}
                      </h3>
                    </div>
                    <button
                      onClick={() => resetSecurityView()}
                      className="p-1 rounded-lg text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form
                    onSubmit={securityView === 'SETUP_CODEWORD' ? submitInitialCodeword : submitChangeCodeword}
                    className="space-y-3"
                  >
                    {/* If changing codeword, require current PIN ONLY */}
                    {securityView === 'CHANGE_CODEWORD' && (
                      <div>
                        <label className="block text-xs font-mono text-neutral-400 mb-1">
                          Current Numeric PIN (required):
                        </label>
                        <input
                          type="password"
                          value={codewordCurrentAuth}
                          onChange={(e) => setCodewordCurrentAuth(e.target.value)}
                          placeholder="Enter current numeric PIN"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#070611] border border-[#271d47] text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                        />
                        <p className="text-[10px] text-[#64748b] mt-1 font-mono">
                          * Codeword changes require current PIN. Codeword is not accepted.
                        </p>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-mono text-neutral-400">
                          {securityView === 'SETUP_CODEWORD' ? 'Secret Codeword Phrase:' : 'New Codeword Phrase:'}
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCodewordInput(!showCodewordInput)}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                        >
                          {showCodewordInput ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showCodewordInput ? 'Hide' : 'Peek'}</span>
                        </button>
                      </div>
                      <input
                        type={showCodewordInput ? 'text' : 'password'}
                        value={codewordNew}
                        onChange={(e) => setCodewordNew(e.target.value)}
                        placeholder="e.g. Mahiru meri jaan, Blue cherry, etc."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#070611] border border-[#271d47] text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                      />
                      <p className="text-[10px] text-[#64748b] mt-1 font-mono">
                        Hindi, Hinglish, or English phrase. Normalized securely without case/space sensitivity.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-neutral-400 mb-1">
                        Confirm Codeword Phrase:
                      </label>
                      <input
                        type={showCodewordInput ? 'text' : 'password'}
                        value={codewordConfirm}
                        onChange={(e) => setCodewordConfirm(e.target.value)}
                        placeholder="Re-enter secret codeword phrase"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#070611] border border-[#271d47] text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-3">
                      <button
                        type="button"
                        onClick={() => resetSecurityView()}
                        className="px-3.5 py-1.5 rounded-xl border border-[#251e44] text-xs font-mono text-neutral-400 hover:text-white"
                      >
                        CANCEL
                      </button>

                      <button
                        type="submit"
                        disabled={securityLoading || !codewordNew.trim() || !codewordConfirm.trim()}
                        className="px-4 py-2 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                      >
                        {securityLoading
                          ? 'SAVING...'
                          : securityView === 'SETUP_CODEWORD'
                          ? 'SAVE CODEWORD'
                          : 'UPDATE CODEWORD'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ================= CONFIRM SECURITY TOGGLE MODAL ================= */}
              {securityView === 'CONFIRM_TOGGLE' && (
                <div className="p-5 rounded-2xl bg-[#0c0a1a] border border-[#251e44] max-w-md mx-auto space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1b1633] pb-3">
                    <div className="flex items-center gap-2">
                      <Lock className={`w-4 h-4 ${securityStatus?.isEnabled ? 'text-rose-400' : 'text-amber-400'}`} />
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                        {securityStatus?.isEnabled ? 'Turn Security OFF' : 'Activate Memory Security'}
                      </h3>
                    </div>
                    <button
                      onClick={() => resetSecurityView()}
                      className="p-1 rounded-lg text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {securityStatus?.isEnabled ? (
                    /* FIX 2: TURN SECURITY OFF MUST REQUIRE CODEWORD ONLY */
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitToggleSecurity();
                      }}
                      className="space-y-3"
                    >
                      <p className="text-xs text-[#9ca3af] font-mono">
                        Enter your secret voice <strong className="text-cyan-400 font-bold">Codeword</strong> phrase to turn Security OFF:
                      </p>

                      <div className="relative">
                        <input
                          type={showCodewordInput ? 'text' : 'password'}
                          value={toggleAuthCodeword}
                          onChange={(e) => setToggleAuthCodeword(e.target.value)}
                          placeholder="Enter secret voice codeword"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#070611] border border-[#271d47] text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCodewordInput(!showCodewordInput)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                        >
                          {showCodewordInput ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-300 font-mono">
                        Notice: PIN cannot turn security off. Codeword verification is strictly required.
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => resetSecurityView()}
                          className="px-3.5 py-1.5 rounded-xl border border-[#251e44] text-xs font-mono text-neutral-400 hover:text-white"
                        >
                          CANCEL
                        </button>

                        <button
                          type="submit"
                          disabled={securityLoading || !toggleAuthCodeword.trim()}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                        >
                          {securityLoading ? 'VERIFYING...' : 'TURN SECURITY OFF'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* TURNING SECURITY ON WITH PIN */
                    <div>
                      <p className="text-xs text-[#9ca3af] font-mono text-center">
                        Enter your PIN to activate security:
                      </p>

                      <div className="flex items-center justify-center gap-2.5 py-2">
                        {Array.from({ length: Math.max(4, toggleAuthPin.length) }).map((_, idx) => (
                          <div
                            key={idx}
                            className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                              idx < toggleAuthPin.length
                                ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                                : 'bg-[#15102a] border-[#2f2450]'
                            }`}
                          />
                        ))}
                      </div>

                      {/* Keypad */}
                      <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleKeypadPress(num)}
                            className="h-11 rounded-xl bg-[#130f28] hover:bg-[#201844] border border-[#271d47] text-white font-mono font-bold text-lg active:scale-95 transition-all shadow-inner"
                          >
                            {num}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleKeypadClear}
                          className="h-11 rounded-xl bg-[#1b1122] hover:bg-[#2c1533] border border-[#401b3a] text-rose-300 font-mono text-xs font-bold active:scale-95 transition-all"
                        >
                          CLEAR
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('0')}
                          className="h-11 rounded-xl bg-[#130f28] hover:bg-[#201844] border border-[#271d47] text-white font-mono font-bold text-lg active:scale-95 transition-all shadow-inner"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={handleKeypadBackspace}
                          className="h-11 rounded-xl bg-[#161226] hover:bg-[#251d3e] border border-[#2c234b] text-neutral-300 flex items-center justify-center active:scale-95 transition-all"
                        >
                          <BackspaceIcon className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => resetSecurityView()}
                          className="px-3.5 py-1.5 rounded-xl border border-[#251e44] text-xs font-mono text-neutral-400 hover:text-white"
                        >
                          CANCEL
                        </button>

                        <button
                          type="button"
                          disabled={securityLoading || toggleAuthPin.length < 4}
                          onClick={submitToggleSecurity}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-black font-mono text-xs font-bold tracking-wider uppercase transition-colors"
                        >
                          {securityLoading ? 'VERIFYING...' : 'CONFIRM'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* ======================= REGULAR MEMORIES LIST =========================== */
            /* ========================================================================= */
            <div className="px-4 sm:px-5 py-3 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
              {isLoadingMemories && memories.length === 0 ? (
                <div className="py-24 text-center text-neutral-500 flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mb-3" />
                  <p className="text-sm font-semibold text-neutral-300">Loading persistent memories from Firestore...</p>
                </div>
              ) : filtered.length === 0 ? (
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
                          <span className="text-[#c084fc] font-mono font-bold text-xs tracking-wider uppercase">
                            {item.category.replace(/_/g, ' ')}
                          </span>

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
                          onClick={() => handleDeleteMemory(item)}
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
          )}

          {/* Secret Codeword Authorization Modal for Memory Deletion */}
          <AnimatePresence>
            {memoryToDelete && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  className="bg-[#0e0a1a] border border-rose-500/30 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl relative"
                >
                  <button
                    onClick={() => {
                      setMemoryToDelete(null);
                      setDeleteAuthCodeword('');
                      setDeleteAuthError(null);
                    }}
                    className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-base tracking-tight">Security Authorization Required</h4>
                      <p className="text-neutral-400 text-xs font-mono">Memory Security is active</p>
                    </div>
                  </div>

                  <p className="text-neutral-300 text-xs sm:text-sm mb-3">
                    Secret Codeword is required to permanently delete this memory from Cloud Firestore:
                  </p>

                  <div className="bg-[#181126] border border-[#2a1e42] rounded-xl p-3 mb-4">
                    <span className="text-rose-400/80 font-mono text-[10px] uppercase font-bold tracking-wider block mb-1">
                      Target Memory ({memoryToDelete.category})
                    </span>
                    <p className="text-white text-xs sm:text-sm line-clamp-2 italic">
                      "{memoryToDelete.content}"
                    </p>
                  </div>

                  {deleteAuthError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 flex items-start gap-2.5 text-rose-200 text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{deleteAuthError}</span>
                    </div>
                  )}

                  <form onSubmit={handleConfirmAuthorizedDelete}>
                    <div className="mb-4">
                      <label className="block text-xs font-mono font-bold text-neutral-400 mb-1.5 uppercase tracking-wider">
                        Enter Secret Codeword
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={deleteAuthCodeword}
                        onChange={(e) => {
                          setDeleteAuthCodeword(e.target.value);
                          if (deleteAuthError) setDeleteAuthError(null);
                        }}
                        placeholder="e.g. sunflower"
                        className="w-full bg-[#151025] border border-rose-500/40 focus:border-rose-400 rounded-xl px-3.5 py-2.5 text-white placeholder-neutral-500 font-mono text-sm outline-none transition-colors"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMemoryToDelete(null);
                          setDeleteAuthCodeword('');
                          setDeleteAuthError(null);
                        }}
                        className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-xs font-mono font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isDeletingWithAuth || !deleteAuthCodeword.trim()}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-mono font-bold tracking-wider uppercase transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-900/40"
                      >
                        {isDeletingWithAuth ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Verify & Delete</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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
              <span className="tracking-wider">
                {activeTab === 'SECURITY' ? 'CRYPTOGRAPHIC SCRYPT SALTED VAULT' : 'TOP-K RELEVANCE SCORING'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
