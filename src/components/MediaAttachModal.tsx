import React, { useRef } from 'react';
import { Image, FileText, X, Upload } from 'lucide-react';

interface MediaAttachModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (file: File, type: string) => void;
}

export const MediaAttachModal: React.FC<MediaAttachModalProps> = ({
  isOpen,
  onClose,
  onFileSelect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file, type);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-neutral-900/90 border border-white/10 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-pink-400" />
            <h3 className="font-bold text-white text-base font-['Syne']">Attach Media</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-3">
          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/5 hover:border-pink-500/30 hover:bg-pink-500/5 cursor-pointer transition-all">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'image')}
            />
            <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-400">
              <Image className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Attach Photo / Image</p>
              <p className="text-[11px] text-neutral-400">Mahiru will analyze the photo visually</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 cursor-pointer transition-all">
            <input
              type="file"
              accept=".txt,.md,.json,.csv"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'document')}
            />
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Attach Text / Notes</p>
              <p className="text-[11px] text-neutral-400">Read and discuss text documents</p>
            </div>
          </label>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
