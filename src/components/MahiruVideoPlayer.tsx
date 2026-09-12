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
      if (activeEl) {
        const targetStartTime = currentMeta.actionStart && currentMeta.actionStart > 0 ? currentMeta.actionStart : 0;
        // If ended or stuck at EOF, rewind to starting position before playing
        if (activeEl.ended || (activeEl.duration && activeEl.currentTime >= activeEl.duration - 0.1)) {
          try {
            activeEl.currentTime = targetStartTime;
          } catch {}
        }
        if (activeEl.paused || activeEl.ended) {
          activeEl.play().catch(() => {});
        }
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

    // Set src on target slot in React state
    if (targetSlot === 'A') {
      setSrcA(nextUrl);
    } else {
      setSrcB(nextUrl);
    }

    if (!targetEl) return;

    // Directly synchronize DOM element src if different to prevent stale buffer checks
    const currentTargetSrc = targetEl.getAttribute('src') || targetEl.src || '';
    if (!currentTargetSrc.endsWith(nextUrl)) {
      targetEl.src = nextUrl;
    }

    // Target action start timestamp (in seconds)
    const targetActionStart = currentMeta.actionStart && currentMeta.actionStart > 0 ? currentMeta.actionStart : 0;

    let switched = false;
    let cancelled = false;
    let playStarted = false;
    let rfcId: number | null = null;
    let rafId1: number | null = null;
    let rafId2: number | null = null;
    let frameTimeout: NodeJS.Timeout | null = null;
    let seekTimeout: NodeJS.Timeout | null = null;
    let safetyTimer: NodeJS.Timeout | null = null;

    // Guarantee that a decoded frame has actually been delivered before switching activeSlot visibility
    const confirmFrameAndSwitch = () => {
      if (cancelled || switched || transitionRequestIdRef.current !== requestId) return;

      const onFrameReady = () => {
        if (cancelled || switched || transitionRequestIdRef.current !== requestId) return;
        switched = true;

        if (frameTimeout) {
          clearTimeout(frameTimeout);
          frameTimeout = null;
        }
        if (rfcId !== null && typeof (targetEl as any).cancelVideoFrameCallback === 'function') {
          try {
            (targetEl as any).cancelVideoFrameCallback(rfcId);
          } catch {}
          rfcId = null;
        }
        if (rafId1 !== null) {
          cancelAnimationFrame(rafId1);
          rafId1 = null;
        }
        if (rafId2 !== null) {
          cancelAnimationFrame(rafId2);
          rafId2 = null;
        }

        // Perform the visual activeSlot switch now that the target video frame is composited!
        setActiveSlot(targetSlot);

        // Schedule previousEl pause after crossfade completes (320ms)
        setTimeout(() => {
          if (transitionRequestIdRef.current === requestId && activeSlotRef.current === targetSlot) {
            if (previousEl && !previousEl.paused) {
              previousEl.pause();
            }
          }
        }, 320);
      };

      // 1. Parallel: native requestVideoFrameCallback (standard in modern Chromium, Firefox, Safari)
      if ('requestVideoFrameCallback' in targetEl && typeof (targetEl as any).requestVideoFrameCallback === 'function') {
        try {
          rfcId = (targetEl as any).requestVideoFrameCallback(() => {
            onFrameReady();
          });
        } catch {}
      }

      // 2. Parallel: Double requestAnimationFrame guarantees the browser paint loop has ticked
      // (Ensures rapid switch without hanging when opacity: 0 suppresses compositor video frame callbacks)
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          onFrameReady();
        });
      });

      // 3. Fast fallback timer: 50ms ensures transitions never stall under any GPU condition
      frameTimeout = setTimeout(() => {
        onFrameReady();
      }, 50);
    };

    // Start playback once target is at the correct playhead and has buffered data
    const startPlaybackAndSwitch = () => {
      if (cancelled || switched || playStarted || transitionRequestIdRef.current !== requestId) return;
      playStarted = true;

      if (seekTimeout) {
        clearTimeout(seekTimeout);
        seekTimeout = null;
      }

      // Synchronize loop property before playback
      targetEl.loop = shouldLoop;

      targetEl
        .play()
        .then(() => {
          if (cancelled || transitionRequestIdRef.current !== requestId) return;
          confirmFrameAndSwitch();
        })
        .catch((err: any) => {
          if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return;
          console.debug('[VideoPlayer] Target play interrupted or failed:', err?.message);
          // Graceful error fallback: keep previous visible video playing without black flash
          if (previousEl && previousEl.paused) {
            previousEl.play().catch(() => {});
          }
        });
    };

    // When seek completes, proceed to start playback
    const handleSeeked = () => {
      targetEl.removeEventListener('seeked', handleSeeked);
      if (cancelled || transitionRequestIdRef.current !== requestId) return;

      if (targetEl.readyState >= 2) {
        startPlaybackAndSwitch();
      } else {
        targetEl.addEventListener('canplay', () => startPlaybackAndSwitch(), { once: true });
      }
    };

    // Check if seek is needed and perform seek, or proceed directly
    const preparePlayheadAndPlay = () => {
      if (cancelled || switched || playStarted || transitionRequestIdRef.current !== requestId) return;

      // If metadata is not loaded yet (readyState < 1), wait for loadedmetadata
      if (targetEl.readyState < 1) {
        targetEl.addEventListener(
          'loadedmetadata',
          () => {
            if (!cancelled && transitionRequestIdRef.current === requestId) {
              preparePlayheadAndPlay();
            }
          },
          { once: true }
        );
        return;
      }

      const needsSeek = Math.abs(targetEl.currentTime - targetActionStart) > 0.05;
      if (needsSeek) {
        targetEl.addEventListener('seeked', handleSeeked, { once: true });
        // 200ms seek safety timeout prevents indefinite waiting if browser skips event
        seekTimeout = setTimeout(() => {
          if (!playStarted && !cancelled && transitionRequestIdRef.current === requestId) {
            targetEl.removeEventListener('seeked', handleSeeked);
            startPlaybackAndSwitch();
          }
        }, 200);

        try {
          targetEl.currentTime = targetActionStart;
        } catch {
          targetEl.removeEventListener('seeked', handleSeeked);
          if (seekTimeout) clearTimeout(seekTimeout);
          startPlaybackAndSwitch();
        }
      } else if (targetEl.seeking) {
        targetEl.addEventListener('seeked', handleSeeked, { once: true });
        seekTimeout = setTimeout(() => {
          if (!playStarted && !cancelled && transitionRequestIdRef.current === requestId) {
            targetEl.removeEventListener('seeked', handleSeeked);
            startPlaybackAndSwitch();
          }
        }, 200);
      } else {
        startPlaybackAndSwitch();
      }
    };

    const handleCanPlay = () => {
      if (cancelled || switched || playStarted || transitionRequestIdRef.current !== requestId) return;
      preparePlayheadAndPlay();
    };

    // Error fallback handler: retain current visible video, never flash black
    const handleTargetError = () => {
      if (cancelled || switched || transitionRequestIdRef.current !== requestId) return;
      console.warn('[VideoPlayer] Target video error, retaining current visible video:', nextUrl);
      cleanup();
      if (previousEl && previousEl.paused) {
        previousEl.play().catch(() => {});
      }
    };

    // Cleanup all listeners, pending animation frames, and timers
    const cleanup = () => {
      cancelled = true;
      targetEl.removeEventListener('loadedmetadata', handleCanPlay);
      targetEl.removeEventListener('loadeddata', handleCanPlay);
      targetEl.removeEventListener('canplay', handleCanPlay);
      targetEl.removeEventListener('seeked', handleSeeked);
      targetEl.removeEventListener('error', handleTargetError);
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (seekTimeout) {
        clearTimeout(seekTimeout);
        seekTimeout = null;
      }
      if (frameTimeout) {
        clearTimeout(frameTimeout);
        frameTimeout = null;
      }
      if (rfcId !== null && typeof (targetEl as any).cancelVideoFrameCallback === 'function') {
        try {
          (targetEl as any).cancelVideoFrameCallback(rfcId);
        } catch {}
        rfcId = null;
      }
      if (rafId1 !== null) {
        cancelAnimationFrame(rafId1);
        rafId1 = null;
      }
      if (rafId2 !== null) {
        cancelAnimationFrame(rafId2);
        rafId2 = null;
      }
    };

    targetEl.addEventListener('loadedmetadata', handleCanPlay, { once: true });
    targetEl.addEventListener('loadeddata', handleCanPlay, { once: true });
    targetEl.addEventListener('canplay', handleCanPlay, { once: true });
    targetEl.addEventListener('error', handleTargetError, { once: true });

    // If target element is already ready (readyState >= 2 HAVE_CURRENT_DATA)
    if (targetEl.readyState >= 2) {
      preparePlayheadAndPlay();
    }

    // Safety fallback: if transition is delayed, safely confirm switch once ready
    safetyTimer = setTimeout(() => {
      if (!switched && !cancelled && transitionRequestIdRef.current === requestId) {
        if (targetEl.readyState >= 2) {
          confirmFrameAndSwitch();
        } else if (previousEl && previousEl.paused) {
          previousEl.play().catch(() => {});
        }
      }
    }, 1500);

    return () => {
      cleanup();
    };
  }, [currentAnimId, availableFiles]);

  // Initial playback of slot A with actionStart alignment
  useEffect(() => {
    const elA = videoRefA.current;
    if (elA) {
      const initMeta = MAHIRU_VIDEOS[currentAnimId] || MAHIRU_VIDEOS[29];
      const start = initMeta?.actionStart && initMeta.actionStart > 0 ? initMeta.actionStart : 0;
      if (start > 0) {
        try {
          elA.currentTime = start;
        } catch {}
      }
      if (elA.paused) {
        elA.play().catch(() => {});
      }
    }
  }, []);

  const handleEndedSlotA = useCallback(() => {
    if (activeSlotRef.current === 'A') {
      const activeEl = videoRefA.current;
      const meta = MAHIRU_VIDEOS[currentAnimId] || MAHIRU_VIDEOS[29];
      const isLooping = Boolean(meta.loop && !meta.isOneShot);
      if (isLooping && activeEl) {
        const start = meta.actionStart && meta.actionStart > 0 ? meta.actionStart : 0;
        try {
          activeEl.currentTime = start;
          activeEl.play().catch(() => {});
        } catch {}
      }
      if (onVideoEnded) {
        onVideoEnded();
      }
    }
  }, [currentAnimId, onVideoEnded]);

  const handleEndedSlotB = useCallback(() => {
    if (activeSlotRef.current === 'B') {
      const activeEl = videoRefB.current;
      const meta = MAHIRU_VIDEOS[currentAnimId] || MAHIRU_VIDEOS[29];
      const isLooping = Boolean(meta.loop && !meta.isOneShot);
      if (isLooping && activeEl) {
        const start = meta.actionStart && meta.actionStart > 0 ? meta.actionStart : 0;
        try {
          activeEl.currentTime = start;
          activeEl.play().catch(() => {});
        } catch {}
      }
      if (onVideoEnded) {
        onVideoEnded();
      }
    }
  }, [currentAnimId, onVideoEnded]);

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
        loop={shouldLoop}
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
        loop={shouldLoop}
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
