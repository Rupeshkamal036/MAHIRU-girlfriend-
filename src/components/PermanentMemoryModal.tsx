import React, { useState, useEffect, useCallback } from 'react';
import { Brain, X, Shield, Trash2, Key, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { MemoryRecord } from '../types';

interface PermanentMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermanentMemoryModal: React.FC<PermanentMemoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [codewordPrompt, setCodewordPrompt] = useState<{ id: string; key: string } | null>(null);
  const [enteredCodeword, setEnteredCodeword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/memories');
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
      const secRes = await fetch('/api/security/status');
      if (secRes.ok) {
        const secData = await secRes.json();
        setSecurityStatus(secData);
      }
    } catch (err: any) {
      setErrorMsg('Failed to load memories from Firestore');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen, fetchMemories]);

  const handleDelete = async (id: string, codeword?: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/memories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeword }),
      });
      const data = await res.json();
      if (data.status === 'codeword_required' || data.status === 'codeword_required_for_name') {
        const target = memories.find((m) => m.id === id);
        setCodewordPrompt({ id, key: target?.key || 'memory' });
        return;
      }
      if (data.status === 'auth_failed' || !res.ok) {
        setErrorMsg(data.error || 'Security authorization failed. Incorrect codeword.');
        return;
      }
      setSuccessMsg('Memory deleted from Cloud Firestore');
      setCodewordPrompt(null);
      setEnteredCodeword('');
      fetchMemories();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg('Failed to delete memory');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl bg-neutral-900/95 border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base font-['Syne']">Permanent Memories</h3>
              <p className="text-[11px] text-neutral-400">Stored authoritatively in Cloud Firestore</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchMemories}
              disabled={loading}
              className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status / Notices */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Codeword prompt modal overlay */}
        {codewordPrompt && (
          <div className="mx-4 mt-3 p-4 rounded-2xl bg-neutral-800 border border-amber-500/40 space-y-3 shrink-0">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <Key className="w-4 h-4" />
              <span>Codeword Required: Delete "{codewordPrompt.key}"</span>
            </div>
            <input
              type="password"
              placeholder="Enter your secret Codeword"
              value={enteredCodeword}
              onChange={(e) => setEnteredCodeword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setCodewordPrompt(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(codewordPrompt.id, enteredCodeword)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}

        {/* Memory List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[160px]">
          {loading && memories.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-neutral-500 text-xs font-mono">
              Loading memories from Firestore...
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-500 space-y-2">
              <Brain className="w-8 h-8 text-neutral-600" />
              <p className="text-xs">No permanent memories stored yet.</p>
              <p className="text-[11px] text-neutral-600">Speak to Mahiru or tell her facts to remember!</p>
            </div>
          ) : (
            memories.map((mem) => (
              <div
                key={mem.id}
                className="group p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 uppercase">
                      {mem.category}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      {mem.key}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 break-words">{mem.value || mem.content}</p>
                </div>
                <button
                  onClick={() => handleDelete(mem.id)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-80 group-hover:opacity-100 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-black/30 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span>Security: {securityStatus?.enabled ? 'Active (Codeword Protected)' : 'Disabled'}</span>
          </div>
          <span>Total: {memories.length}</span>
        </div>
      </div>
    </div>
  );
};
