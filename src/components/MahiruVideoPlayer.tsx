import React, { useRef, useEffect, useState, useCallback } from 'react';
import { resolveVideoUrl, MAHIRU_VIDEOS } from '../data/mahiruVideos';
import { SessionState } from '../types';

interface MahiruVideoPlayerProps {
  currentAnimId: number;
  availableFiles: string[];
  sessionState: SessionState;
  onVideoEnded?: () => void;
  onClick?: () => void;
}

// Smart predictive preloading for likely next video state based on current animation and session state
function getPredictivePreloadId(currentId: number, sessionState: SessionState): number | null {
  if (sessionState === 'disconnected') {
    // When disconnected in #29, likely next is entry (#22 or #23)
    return 22;
  }
  if (sessionState === 'listening') {
    // When user is speaking or listening, likely next state is #5 Talking
    return 5;
  }
  if (sessionState === 'speaking') {
    // If speaking, likely next return state is #6 Listening
    return 6;
  }
  // If exit video is playing, next video is deterministically the opposite-side entry
  if (currentId === 24) {
    return 22; // #24 Right Exit -> #22 Left Enter
  }
  if (currentId === 25) {
    return 23; // #25 Left Exit -> #23 Right Enter
  }
  // If one-shot action (#4 greeting, #3 asking, etc.)
  const meta = MAHIRU_VIDEOS[currentId];
  if (meta?.nextDefaultStateId) {
    return meta.nextDefaultStateId;
  }
  return 6;
}

export const MahiruVideoPlayer: React.FC<MahiruVideoPlayerProps> = ({
  currentAnimId,
  availableFiles,
  sessionState,
  onVideoEnded,
  onClick,
}) => {
  // Dual-buffered slots: 'A' or 'B'
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [srcA, setSrcA] = useState<string | null>(() => {
    return resolveVideoUrl(currentAnimId, availableFiles) || null;
  });
  const [srcB, setSrcB] = useState<string | null>(null);

  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);

  const activeSlotRef = useRef<'A' | 'B'>('A');
  const currentUrlRef = useRef<string>(resolveVideoUrl(currentAnimId, availableFiles));
  const transitionRequestIdRef = useRef<number>(0);
  const preloadedSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  // Predictive & Targeted Preloading: Only preloads core standby (#29, #6) and likely next video
  useEffect(() => {
    if (!availableFiles || availableFiles.length === 0) return;

    const idsToPreload: number[] = [29, 6];
    const predictedNext = getPredictivePreloadId(currentAnimId, sessionState);
    if (predictedNext && !idsToPreload.includes(predictedNext)) {
      idsToPreload.push(predictedNext);
    }

    idsToPreload.forEach((id) => {
      const url = resolveVideoUrl(id, availableFiles);
      if (url && !preloadedSetRef.current.has(url)) {
        preloadedSetRef.current.add(url);
        try {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'video';
          link.href = url;
          document.head.appendChild(link);
        } catch {
          // Preload hint optional in older/restricted environments
        }
      }
    });
  }, [availableFiles, currentAnimId, sessionState]);

  const currentMeta = MAHIRU_VIDEOS[currentAnimId] || MAHIRU_VIDEOS[29];
  const shouldLoop = Boolean(currentMeta.loop && !currentMeta.isOneShot);

  // Seamless Dual-Buffered Video Transition with Rapid-Change Protection & Error Fallback
  useEffect(() => {
    const nextUrl = resolveVideoUrl(currentAnimId, availableFiles);
    if (!nextUrl) return;

    // 1. NO UNNECESSARY RESTARTS: If active video is already displaying this exact URL, keep playing seamlessly
    if (currentUrlRef.current === nextUrl) {
      const activeEl = activeSlotRef.current === 'A' ? videoRefA.current : videoRefB.current;
      if (activeEl && activeEl.paused) {
        activeEl.play().catch(() => {});
      }
      return;
    }

    // Assign incrementing request id to cancel any in-flight / obsolete transitions
    const requestId = ++transitionRequestIdRef.current;
    currentUrlRef.current = nextUrl;

    const currentActive = activeSlotRef.current;
    const targetSlot = currentActive === 'A' ? 'B' : 'A';
    const targetEl = targetSlot === 'A' ? videoRefA.current : videoRefB.current;
    const previousEl = currentActive === 'A' ? videoRefA.current : videoRefB.current;

    // Set src on target slot only
    if (targetSlot === 'A') {
      setSrcA(nextUrl);
    } else {
      setSrcB(nextUrl);
    }

    if (!targetEl) return;

    let switched = false;
    let cleanupListeners: (() => void) | null = null;

    const performCrossfade = () => {
      // Reject stale or obsolete transition requests
      if (switched || transitionRequestIdRef.current !== requestId) return;
      switched = true;

      if (cleanupListeners) {
        cleanupListeners();
        cleanupListeners = null;
      }

      targetEl
        .play()
        .then(() => {
          if (transitionRequestIdRef.current !== requestId) return;
          setActiveSlot(targetSlot);

          // Gracefully pause and reset the previous buffer after crossfade completes (320ms)
          setTimeout(() => {
            if (transitionRequestIdRef.current === requestId && activeSlotRef.current === targetSlot) {
              if (previousEl) {
                previousEl.pause();
              }
            }
          }, 320);
        })
        .catch((err: any) => {
          if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return;
          console.debug('[VideoPlayer] Play interrupted or failed:', err?.message);
          // Graceful error fallback: keep previous visible video instead of black screen
          if (previousEl && previousEl.paused) {
            previousEl.play().catch(() => {});
          }
        });
    };

    // Error fallback handler: If target video errors, keep current active video
    const handleTargetError = () => {
      if (switched || transitionRequestIdRef.current !== requestId) return;
      console.warn('[VideoPlayer] Target video failed to load, retaining current video:', nextUrl);
      if (cleanupListeners) {
        cleanupListeners();
        cleanupListeners = null;
      }
      // Keep previous video alive and playing
      if (previousEl && previousEl.paused) {
        previousEl.play().catch(() => {});
      }
    };

    // Attach listeners with clean teardown
    const onLoadedData = () => performCrossfade();
    const onCanPlay = () => performCrossfade();

    targetEl.addEventListener('loadeddata', onLoadedData, { once: true });
    targetEl.addEventListener('canplay', onCanPlay, { once: true });
    targetEl.addEventListener('error', handleTargetError, { once: true });

    cleanupListeners = () => {
      targetEl.removeEventListener('loadeddata', onLoadedData);
      targetEl.removeEventListener('canplay', onCanPlay);
      targetEl.removeEventListener('error', handleTargetError);
    };

    // If target element already has buffered data ready to play, crossfade immediately
    if (targetEl.readyState >= 2) {
      performCrossfade();
    } else {
      // Safety timeout (max 350ms) to ensure transition never permanently hangs
      const safetyTimer = setTimeout(() => {
        if (!switched && transitionRequestIdRef.current === requestId) {
          performCrossfade();
        }
      }, 350);

      const origCleanup = cleanupListeners;
      cleanupListeners = () => {
        clearTimeout(safetyTimer);
        origCleanup();
      };
    }

    return () => {
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
  }, [currentAnimId, availableFiles]);

  // Initial playback of slot A
  useEffect(() => {
    const elA = videoRefA.current;
    if (elA && elA.paused) {
      elA.play().catch(() => {});
    }
  }, []);

  const handleEndedSlotA = useCallback(() => {
    if (activeSlotRef.current === 'A' && onVideoEnded) {
      onVideoEnded();
    }
  }, [onVideoEnded]);

  const handleEndedSlotB = useCallback(() => {
    if (activeSlotRef.current === 'B' && onVideoEnded) {
      onVideoEnded();
    }
  }, [onVideoEnded]);

  return (
    <div
      onClick={onClick}
      className={`relative w-full max-w-full max-h-full flex items-center justify-center select-none mx-auto transition-all duration-300 ease-out overflow-hidden bg-transparent rounded-none aspect-[16/9] isolate ${
        sessionState === 'disconnected' ? 'cursor-pointer' : ''
      }`}
    >
      {/* Video Element A: Edge-to-edge framing with zero character cropping */}
      <video
        ref={videoRefA}
        src={srcA || undefined}
        playsInline
        muted
        autoPlay
        controls={false}
        loop={activeSlot === 'A' && shouldLoop}
        onEnded={handleEndedSlotA}
        className={`absolute inset-0 w-full h-full object-contain scale-[1.055] origin-[50%_38%] pointer-events-none transition-opacity duration-300 ease-in-out ${
          activeSlot === 'A' ? 'opacity-100 z-10' : 'opacity-0 z-0'
        }`}
      />

      {/* Video Element B: Dual buffer with identical gentle framing */}
      <video
        ref={videoRefB}
        src={srcB || undefined}
        playsInline
        muted
        autoPlay
        controls={false}
        loop={activeSlot === 'B' && shouldLoop}
        onEnded={handleEndedSlotB}
        className={`absolute inset-0 w-full h-full object-contain scale-[1.055] origin-[50%_38%] pointer-events-none transition-opacity duration-300 ease-in-out ${
          activeSlot === 'B' ? 'opacity-100 z-10' : 'opacity-0 z-0'
        }`}
      />

      {/* Subtle bottom vignette blending with application floor */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#05060b]/40 via-transparent to-transparent z-20" />
    </div>
  );
};
