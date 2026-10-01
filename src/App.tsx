import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { SessionState, ReactionState, ToolCallData, PermissionErrorState } from './types';
import { LiveSession } from './audio/LiveSession';
import { useMahiruAnimation } from './hooks/useMahiruAnimation';
import { AmbientLightingProvider, useAmbientLighting } from './context/AmbientLightingContext';
import { matchVoiceMomentCommand } from './data/voiceCommandMatcher';
import { getAppSessionId } from './utils/session';

// Components faithfully matching FIRST Screen Recording Blueprint
import { AmbientBackground } from './components/AmbientBackground';
import { TopBar } from './components/TopBar';
import { MahiruVideoPlayer } from './components/MahiruVideoPlayer';
import { FirstReferenceBottomControls } from './components/FirstReferenceBottomControls';
import { ReactionBanner } from './components/ReactionBanner';
import { InfoModal } from './components/InfoModal';
import { PermissionModal } from './components/PermissionModal';
import { AudioSettingsModal } from './components/AudioSettingsModal';
import { PermanentMemoryModal } from './components/PermanentMemoryModal';
import { TopicsModal } from './components/TopicsModal';
import { MediaAttachModal } from './components/MediaAttachModal';
import { ScreenShareModal } from './components/ScreenShareModal';

function MahiruCompanionApp() {
  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isMicAvailable, setIsMicAvailable] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<PermissionErrorState | null>(null);

  // Modals state
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  const [isAudioOpen, setIsAudioOpen] = useState<boolean>(false);
  const [isRecallsOpen, setIsRecallsOpen] = useState<boolean>(false);
  const [isTopicsOpen, setIsTopicsOpen] = useState<boolean>(false);
  const [isAttachOpen, setIsAttachOpen] = useState<boolean>(false);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState<boolean>(false);

  // Audio Telemetry & Visualizer
  const [userVolume, setUserVolume] = useState<number>(0);
  const [aiVolume, setAiVolume] = useState<number>(0);

  // Reactions & Tools
  const [reaction, setReaction] = useState<ReactionState | null>(null);
  const [lastToolCall, setLastToolCall] = useState<ToolCallData | null>(null);

  // Ambient lighting controller
  const { updateActiveState, resetToAuto, setBrightness, setColor, handleVoiceCommand } =
    useAmbientLighting();

  const liveSessionRef = useRef<LiveSession | null>(null);

  // Animation controller for all 30 Mahiru videos
  const {
    currentAnimId,
    currentMeta,
    availableFiles,
    changeAnimation,
    handleVideoEnded,
    triggerThinking,
    triggerInterrupt,
    triggerEmotion,
    triggerMovement,
    triggerDirectMoment,
    setConversationStyle,
  } = useMahiruAnimation({
    sessionState,
    userVolume,
    aiVolume,
  });

  // Keep ambient lighting synchronized with active state and video
  useEffect(() => {
    updateActiveState(sessionState, currentAnimId);
  }, [sessionState, currentAnimId, updateActiveState]);

  // Authoritatively initialize memory security as ON for this application session
  useEffect(() => {
    fetch('/api/memory-security/init-session', {
      method: 'POST',
      headers: {
        'x-session-id': getAppSessionId(),
      },
    }).catch((err) => {
      console.warn('[App] Session security initialization note:', err);
    });
  }, []);

  // Stable callback ref to prevent teardown of LiveSession on reactive re-renders
  const callbacksRef = useRef({
    onStateChange: (newState: SessionState) => setSessionState(newState),
    onReaction: (newReaction: ReactionState) => {
      setReaction(newReaction);
      triggerEmotion(newReaction.type);
    },
    onError: (errorMsg: string, details?: { isPermissionError?: boolean; isInIframe?: boolean }) => {
      if (details?.isPermissionError) {
        setPermissionError({
          isPermissionError: true,
          isInIframe: Boolean(details.isInIframe),
          message: errorMsg,
        });
      } else {
        setErrorMessage(errorMsg);
      }
    },
    onMicStatusChange: (available: boolean) => {
      setIsMicAvailable(available);
    },
    onToolAction: (tool: ToolCallData) => {
      setLastToolCall(tool);
    },
    onVisualizerUpdate: (uVol: number, aVol: number) => {
      setUserVolume(uVol);
      setAiVolume(aVol);
    },
    onAmbientLightCommand: (color: string, mode?: string) => {
      if (mode === 'normal' || color === 'normal') {
        resetToAuto();
      } else if (mode === 'dim') {
        setBrightness(0.4);
      } else if (mode === 'bright') {
        setBrightness(1.3);
      } else {
        setColor(color);
      }
    },
    onMovementCommand: (action: string) => {
      triggerMovement(action);
    },
    onInterrupted: () => {
      triggerInterrupt();
    },
    onConversationStyle: (style: 'greeting' | 'explaining' | 'talking') => {
      setConversationStyle(style);
    },
  });

  // Always update latest handlers without recreating the session
  callbacksRef.current = {
    onStateChange: (newState) => setSessionState(newState),
    onReaction: (newReaction) => {
      setReaction(newReaction);
      triggerEmotion(newReaction.type);
    },
    onError: (errorMsg, details) => {
      if (details?.isPermissionError) {
        setPermissionError({
          isPermissionError: true,
          isInIframe: Boolean(details.isInIframe),
          message: errorMsg,
        });
      } else {
        setErrorMessage(errorMsg);
      }
    },
    onMicStatusChange: (available) => {
      setIsMicAvailable(available);
    },
    onToolAction: (tool) => {
      setLastToolCall(tool);
    },
    onVisualizerUpdate: (uVol, aVol) => {
      setUserVolume(uVol);
      setAiVolume(aVol);
    },
    onAmbientLightCommand: (color, mode) => {
      if (mode === 'normal' || color === 'normal' || color === 'auto' || mode === 'auto') {
        resetToAuto();
      } else if (mode === 'dim' || color === 'dim') {
        setBrightness(0.45);
      } else if (mode === 'bright' || color === 'bright') {
        setBrightness(1.35);
      } else {
        setColor(color);
      }
    },
    onMovementCommand: (action) => {
      triggerMovement(action);
    },
    onInterrupted: () => {
      triggerInterrupt();
    },
    onConversationStyle: (style) => {
      setConversationStyle(style);
    },
    onMemoryPersisted: (data: any) => {
      console.log('[Mahiru Live] Memory automatically persisted:', data);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mahiru:memory-changed', { detail: data }));
      }
    },
  };

  // Initialize LiveSession once per component mount
  useEffect(() => {
    const session = new LiveSession({
      onStateChange: (newState) => callbacksRef.current.onStateChange(newState),
      onReaction: (newReaction) => callbacksRef.current.onReaction(newReaction),
      onError: (errorMsg, details) => callbacksRef.current.onError(errorMsg, details),
      onMicStatusChange: (available) => callbacksRef.current.onMicStatusChange(available),
      onToolAction: (tool) => callbacksRef.current.onToolAction(tool),
      onVisualizerUpdate: (uVol, aVol) => callbacksRef.current.onVisualizerUpdate(uVol, aVol),
      onAmbientLightCommand: (color, mode) => callbacksRef.current.onAmbientLightCommand(color, mode),
      onMovementCommand: (action) => callbacksRef.current.onMovementCommand(action),
      onInterrupted: () => callbacksRef.current.onInterrupted(),
      onConversationStyle: (style) => callbacksRef.current.onConversationStyle?.(style),
      onMemoryPersisted: (data) => callbacksRef.current.onMemoryPersisted?.(data),
    });

    liveSessionRef.current = session;

    return () => {
      session.disconnect();
    };
  }, []);

  const handleTogglePower = useCallback(async () => {
    setErrorMessage(null);
    setPermissionError(null);
    if (!liveSessionRef.current) return;

    if (sessionState === 'disconnected') {
      await liveSessionRef.current.connect();
    } else {
      liveSessionRef.current.disconnect();
    }
  }, [sessionState]);

  const handleToggleMute = useCallback(() => {
    if (!liveSessionRef.current) return;
    const muted = liveSessionRef.current.toggleMute();
    setIsMuted(muted);
  }, []);

  const handleRequestMic = useCallback(async () => {
    if (liveSessionRef.current && sessionState !== 'disconnected') {
      const res = await liveSessionRef.current.enableMicrophone();
      if (res.success) {
        setIsMicAvailable(true);
        setPermissionError(null);
        return;
      }
    }
    setPermissionError({
      isPermissionError: true,
      isInIframe: typeof window !== 'undefined' && window.self !== window.top,
      message: 'Microphone permission was denied by your browser or frame.',
    });
  }, [sessionState]);

  const handleSendText = useCallback(
    (text: string) => {
      // 1. Check voice / light command
      handleVoiceCommand(text);

      // 2. Direct voice command matching for all 30 Mahiru video moments
      const momentMatch = matchVoiceMomentCommand(text);
      if (momentMatch) {
        if (momentMatch.isExit) {
          triggerMovement(momentMatch.movementAction || 'exit');
        } else if (momentMatch.movementAction) {
          triggerMovement(momentMatch.movementAction);
        } else if (momentMatch.reactionType) {
          triggerEmotion(momentMatch.reactionType);
        } else {
          triggerDirectMoment(momentMatch.animId);
        }
      } else {
        // Fallback checks for simple movement or exit keywords
        const lower = text.toLowerCase().trim();
        if (
          lower === 'exit' ||
          lower === 'leave' ||
          lower === 'bye' ||
          lower === 'goodbye' ||
          lower.startsWith('exit ') ||
          lower.includes('chali jao') ||
          lower.includes('nikal')
        ) {
          triggerMovement('exit');
        } else if (lower.includes('step right') || lower.includes('step aside right')) {
          triggerMovement('step_aside_right');
        } else if (lower.includes('step left') || lower.includes('step aside left')) {
          triggerMovement('step_aside_left');
        } else if (lower.includes('turn around') || lower.includes('turn back') || lower.includes('ghumo')) {
          triggerMovement('turn_around');
        } else if (lower.includes('walk') || lower.includes('walking') || lower.includes('chalo') || lower.includes('tahlo')) {
          triggerMovement('walk');
        } else if (lower.includes('look toward') || lower.includes('look there')) {
          triggerMovement('look_toward');
        }
      }

      // 3. Conversation intent detection
      const lowerText = text.toLowerCase().trim();
      const isGreeting = /\b(hello|hi|hey|heya|hlo|greetings|namaste|salaam|good morning|good afternoon|good evening|kaise ho|kaisa hai)\b/i.test(lowerText);
      const isExplaining = /\b(explain|samjhao|batao kaise|bataiye kaise|how to|how do|how does|why is|why does|difference between|teach me|guide me|detail me|step by step)\b/i.test(lowerText);

      if (isGreeting) {
        setConversationStyle('greeting');
      } else if (isExplaining) {
        setConversationStyle('explaining');
      } else {
        setConversationStyle('talking');
      }

      // 4. Forward text to Live Gateway
      if (liveSessionRef.current) {
        liveSessionRef.current.sendTextMessage(text);
      }
    },
    [handleVoiceCommand, setConversationStyle, triggerMovement, triggerEmotion, triggerDirectMoment]
  );

  const handleClearReaction = useCallback(() => {
    setReaction(null);
  }, []);

  // Stable ref for voice command handlers to prevent SpeechRecognition churn
  const speechHandlersRef = useRef({
    handleVoiceCommand,
    setConversationStyle,
    triggerMovement,
    triggerEmotion,
    triggerDirectMoment,
  });

  speechHandlersRef.current = {
    handleVoiceCommand,
    setConversationStyle,
    triggerMovement,
    triggerEmotion,
    triggerDirectMoment,
  };

  // Passive speech recognition for real-time speech intent matching
  useEffect(() => {
    if (sessionState === 'disconnected' || isMuted || !isMicAvailable) return;
    if (typeof window === 'undefined') return;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    let recognizer: any = null;
    let isActive = true;

    try {
      recognizer = new SpeechRec();
      recognizer.continuous = true;
      recognizer.interimResults = true;

      recognizer.onresult = (event: any) => {
        if (!isActive) return;
        const handlers = speechHandlersRef.current;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const isFinal = Boolean(event.results[i]?.isFinal);
          const transcript = event.results[i][0]?.transcript || '';
          if (!transcript.trim()) continue;

          // When speech recognition finalizes a turn, send to Live Gateway for automatic memory pipeline
          if (isFinal) {
            const finalUtterance = transcript.trim();
            if (finalUtterance.length >= 4 && liveSessionRef.current) {
              liveSessionRef.current.sendUserTurn(finalUtterance);
            }
          }

          // Direct voice moment trigger on spoken speech
          const match = matchVoiceMomentCommand(transcript);
          if (match) {
            if (match.isExit) {
              handlers.triggerMovement(match.movementAction || 'exit');
            } else if (match.movementAction) {
              handlers.triggerMovement(match.movementAction);
            } else if (match.reactionType) {
              handlers.triggerEmotion(match.reactionType);
            } else {
              handlers.triggerDirectMoment(match.animId);
            }
          }

          // Ambient lighting voice commands
          handlers.handleVoiceCommand(transcript);

          const lowerTranscript = transcript.toLowerCase();
          if (/\b(hello|hi\b|hey\b|namaste|salaam|kaise ho|kaisa hai)\b/i.test(lowerTranscript)) {
            handlers.setConversationStyle('greeting');
          } else if (/\b(explain|how to|why|samjhao|batao|guide)\b/i.test(lowerTranscript)) {
            handlers.setConversationStyle('explaining');
          }
        }
      };

      recognizer.onerror = () => {};
      recognizer.onend = () => {
        if (isActive && sessionState !== 'disconnected') {
          try {
            recognizer.start();
          } catch {}
        }
      };

      recognizer.start();
    } catch {}

    return () => {
      isActive = false;
      if (recognizer) {
        try {
          recognizer.stop();
        } catch {}
      }
    };
  }, [sessionState, isMuted, isMicAvailable]);

  const handleHeartClick = useCallback(() => {
    triggerEmotion('love');
    setReaction({
      type: 'love',
      comment: 'Maine aapko bohot miss kiya! ❤️',
      timestamp: Date.now(),
    });
    if (liveSessionRef.current && sessionState !== 'disconnected') {
      liveSessionRef.current.sendTextMessage(
        '[Action: User pressed the heart reaction button to express sweet affection. Give a cute, heartfelt girlfriend reaction in Hindi/English.]'
      );
    }
  }, [triggerEmotion, sessionState]);

  const handleSelectTopic = useCallback(
    (topicPrompt: string) => {
      if (sessionState === 'disconnected') {
        handleTogglePower().then(() => {
          setTimeout(() => handleSendText(topicPrompt), 1500);
        });
      } else {
        handleSendText(topicPrompt);
      }
    },
    [sessionState, handleTogglePower, handleSendText]
  );

  return (
    <main className="relative h-screen h-[100dvh] max-h-[100dvh] w-full bg-[#05060b] text-neutral-100 flex flex-col justify-between items-center overflow-hidden select-none font-['Outfit']">
      {/* 1. Ambient Lighting & Starfield Canvas */}
      <AmbientBackground />

      {/* 2. Top Bar matching First Reference: MAHIRU ▾ | # TOPICS | AUDIO | RECALLS | SHARE SCREEN */}
      <TopBar
        state={sessionState}
        onOpenInfo={() => setIsInfoOpen(true)}
        onOpenTopics={() => setIsTopicsOpen(true)}
        onOpenAudio={() => setIsAudioOpen(true)}
        onOpenRecalls={() => setIsRecallsOpen(true)}
        onOpenScreenShare={() => setIsScreenShareOpen(true)}
      />

      {/* Floating Reaction & Tool Banners */}
      <ReactionBanner
        reaction={reaction}
        lastToolCall={lastToolCall}
        onClearReaction={handleClearReaction}
      />

      {/* Error alert toast */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-14 z-50 max-w-sm mx-4 p-3.5 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-2.5 shadow-xl shadow-rose-950/40 backdrop-blur-md"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-[11px] font-bold underline shrink-0 hover:text-white"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Center Stage: Edge-to-edge Mahiru Video Area */}
      <div className="flex-1 w-full min-h-0 relative flex items-center justify-center overflow-hidden z-10 px-0">
        <MahiruVideoPlayer
          currentAnimId={currentAnimId}
          availableFiles={availableFiles}
          sessionState={sessionState}
          onVideoEnded={handleVideoEnded}
          onClick={sessionState === 'disconnected' ? handleTogglePower : undefined}
        />
      </div>

      {/* 4. Bottom Controls matching First Reference: Mic | Power | Screen */}
      <FirstReferenceBottomControls
        state={sessionState}
        isMuted={isMuted}
        isMicAvailable={isMicAvailable}
        onTogglePower={handleTogglePower}
        onToggleMute={handleToggleMute}
        onRequestMic={handleRequestMic}
        onSendText={handleSendText}
        onOpenScreenShare={() => setIsScreenShareOpen(true)}
        onOpenAttach={() => setIsAttachOpen(true)}
        currentAnimId={currentAnimId}
      />

      {/* 5. Modals & Drawers faithfully restored */}
      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />

      <AudioSettingsModal
        isOpen={isAudioOpen}
        onClose={() => setIsAudioOpen(false)}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />

      <PermanentMemoryModal
        isOpen={isRecallsOpen}
        onClose={() => setIsRecallsOpen(false)}
      />

      <TopicsModal
        isOpen={isTopicsOpen}
        onClose={() => setIsTopicsOpen(false)}
        onSelectTopic={handleSelectTopic}
      />

      <MediaAttachModal
        isOpen={isAttachOpen}
        onClose={() => setIsAttachOpen(false)}
        onFileSelect={(file, type) => {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              const base64Data = res.split(',')[1];
              if (liveSessionRef.current) {
                liveSessionRef.current.sendMediaAttachment(base64Data, file.type, file.name);
              }
              handleSendText(`[Attached ${type} image: ${file.name}. Mahiru, please see this and tell me what you notice!]`);
            };
            reader.readAsDataURL(file);
          } else {
            const reader = new FileReader();
            reader.onload = () => {
              const text = (reader.result as string || '').slice(0, 1500);
              handleSendText(`[Attached document: ${file.name}]\n${text}`);
            };
            reader.readAsText(file);
          }
        }}
      />

      <ScreenShareModal
        isOpen={isScreenShareOpen}
        onClose={() => setIsScreenShareOpen(false)}
      />

      <PermissionModal
        error={permissionError}
        onClose={() => setPermissionError(null)}
        onRetry={sessionState === 'disconnected' ? handleTogglePower : handleRequestMic}
      />
    </main>
  );
}

export default function App() {
  return (
    <AmbientLightingProvider>
      <MahiruCompanionApp />
    </AmbientLightingProvider>
  );
}
