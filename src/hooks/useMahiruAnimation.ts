import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionState, ConversationStyle } from '../types';
import { MAHIRU_VIDEOS } from '../data/mahiruVideos';

export interface UseMahiruAnimationOptions {
  sessionState: SessionState;
  userVolume: number;
  aiVolume: number;
  onAnimationChange?: (animId: number) => void;
}

export function useMahiruAnimation({
  sessionState,
  userVolume,
  aiVolume,
  onAnimationChange,
}: UseMahiruAnimationOptions) {
  // Current active video ID: defaults to #29 Idle / Waiting when disconnected
  const [currentAnimId, setCurrentAnimId] = useState<number>(29);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);

  const currentAnimIdRef = useRef<number>(29);
  const isPowerOnRef = useRef<boolean>(sessionState !== 'disconnected');
  const prevSessionStateRef = useRef<SessionState>(sessionState);

  // Conversation response mode: 'greeting' -> #4, 'explaining' -> #2, 'talking' -> #5
  const conversationModeRef = useRef<ConversationStyle>('talking');

  // Behavioral state locks (NO hard-coded timers; resolved strictly via onEnded events)
  const isEntryActiveRef = useRef<boolean>(false);
  const isExitActiveRef = useRef<boolean>(false);
  const isExitReentryRef = useRef<boolean>(false); // Tracks if entry (#22/#23) is returning from an exit sequence
  const isMovementActiveRef = useRef<boolean>(false);
  const isOneShotActiveRef = useRef<boolean>(false);

  // Audio / Turn state tracking
  const wasUserSpeakingRef = useRef<boolean>(false);
  const isAiSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    currentAnimIdRef.current = currentAnimId;
  }, [currentAnimId]);

  // Fetch available files from server
  useEffect(() => {
    let mounted = true;
    fetch('/api/mahiru-videos')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data?.files) {
          setAvailableFiles(data.files);
        }
      })
      .catch((err) => {
        console.warn('[MahiruAnimation] Error fetching video list:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Safe changeAnimation function.
   * Modifies the current animation state without arbitrary fixed timers.
   * One-shot actions are allowed to complete naturally and report via handleVideoEnded.
   * Supports optional force parameter to re-affirm/recover playback when ID matches.
   */
  const changeAnimation = useCallback(
    (id: number, isOneShot: boolean = false, force: boolean = false) => {
      if (currentAnimIdRef.current === id && !isOneShot && !force) {
        return;
      }

      currentAnimIdRef.current = id;
      setCurrentAnimId(id);
      if (onAnimationChange) onAnimationChange(id);

      const meta = MAHIRU_VIDEOS[id] || MAHIRU_VIDEOS[29];
      const oneShot = isOneShot || Boolean(meta.isOneShot);
      isOneShotActiveRef.current = oneShot;
    },
    [onAnimationChange]
  );

  /**
   * Power ON / OFF Lifecycle
   * 1. POWER OFF:
   *    - Always default to #29 Idle / Waiting.
   *    - #29 loops continuously in standby/waiting.
   *    - Do not randomly switch to other videos.
   * 2. POWER ON:
   *    - Choose randomly between ONLY: #22 Left Enter OR #23 Right Enter.
   *    - True random choice independently on each actual Power ON event.
   *    - Allowed to complete naturally (no hard-coded timer cutoffs).
   *    - Do not loop #22 or #23.
   */
  useEffect(() => {
    const prev = prevSessionStateRef.current;
    prevSessionStateRef.current = sessionState;
    isPowerOnRef.current = sessionState !== 'disconnected';

    // 1. POWER OFF (disconnected)
    if (sessionState === 'disconnected') {
      isEntryActiveRef.current = false;
      isExitActiveRef.current = false;
      isExitReentryRef.current = false;
      isMovementActiveRef.current = false;
      isOneShotActiveRef.current = false;
      wasUserSpeakingRef.current = false;
      isAiSpeakingRef.current = false;
      conversationModeRef.current = 'talking';

      // Default standby state #29 Idle / Waiting
      changeAnimation(29, false, true);
      return;
    }

    // 2. POWER ON TRANSITION (from disconnected -> active/connecting/listening)
    if (prev === 'disconnected') {
      isExitActiveRef.current = false;
      isMovementActiveRef.current = false;
      wasUserSpeakingRef.current = false;
      isAiSpeakingRef.current = false;
      conversationModeRef.current = 'talking';

      // True random independent selection between ONLY #22 Left Enter and #23 Right Enter
      const enterAnim = Math.random() < 0.5 ? 22 : 23;
      isEntryActiveRef.current = true;
      isOneShotActiveRef.current = true;

      // Play entry video as a one-shot movement action that completes naturally
      changeAnimation(enterAnim, true);
    }
  }, [sessionState, changeAnimation]);

  // Trigger Interrupt -> Immediately stop speaking and switch to #6 Listening
  const triggerInterrupt = useCallback(() => {
    if (!isPowerOnRef.current || isEntryActiveRef.current || isExitActiveRef.current) return;
    isOneShotActiveRef.current = false;
    isAiSpeakingRef.current = false;
    wasUserSpeakingRef.current = true;
    conversationModeRef.current = 'talking';
    changeAnimation(6, false); // #6 Listening immediately
  }, [changeAnimation]);

  /**
   * Audio / Speech State Synchronization
   * Blocked while an entry or exit animation is actively playing.
   */
  useEffect(() => {
    // If not powered on, or entry/exit animation is actively completing, do not interrupt
    if (!isPowerOnRef.current || isEntryActiveRef.current || isExitActiveRef.current) return;

    // A. MAHIRU SPEECH (sessionState === 'speaking')
    if (sessionState === 'speaking') {
      // If user volume indicates interruption while Mahiru is speaking, interrupt immediately
      if (userVolume > 0.06) {
        triggerInterrupt();
        return;
      }

      isAiSpeakingRef.current = true;
      wasUserSpeakingRef.current = false;

      // If a one-shot emotion or one-shot action is actively playing, let it play naturally until it ends.
      // Do NOT overwrite active emotions with standard talking.
      if (isOneShotActiveRef.current) {
        return;
      }

      // Select target animation based on conversation state:
      // 'greeting' -> #4 Greeting
      // 'explaining' -> #2 Talking & Explaining
      // 'talking' (default) -> #5 Talking
      const mode = conversationModeRef.current;
      const targetAnim = mode === 'greeting' ? 4 : mode === 'explaining' ? 2 : 5;
      const current = currentAnimIdRef.current;

      if (current !== targetAnim) {
        changeAnimation(targetAnim, targetAnim === 4);
      }
      return;
    }

    // B. MAHIRU FINISHED SPEAKING (was speaking, now sessionState is listening)
    if (isAiSpeakingRef.current && sessionState === 'listening') {
      isAiSpeakingRef.current = false;
      conversationModeRef.current = 'talking'; // reset for next turn
      // If an emotion video is currently playing, let it complete naturally; handleVideoEnded will return to #6
      if (!isOneShotActiveRef.current && currentAnimIdRef.current !== 6) {
        changeAnimation(6, false); // Return to #6 Listening (conversation-ready state)
      }
      return;
    }

    // C. USER SPEAKING (Mic input active while in listening session) -> #6 Listening
    const isUserTalking = sessionState === 'listening' && userVolume > 0.06;
    if (isUserTalking) {
      wasUserSpeakingRef.current = true;
      if (isOneShotActiveRef.current) {
        isOneShotActiveRef.current = false;
      }
      if (currentAnimIdRef.current !== 6) {
        changeAnimation(6, false); // Attentive #6 Listening
      }
      return;
    }
  }, [sessionState, userVolume, changeAnimation, triggerInterrupt]);

  /**
   * Handle Video Ended (Natural completion callback from <video onEnded>)
   * Replaces all hard-coded timers with real video playback completion.
   */
  const handleVideoEnded = useCallback(() => {
    const currentId = currentAnimIdRef.current;

    // 1. ENTRY ANIMATIONS (#22 or #23) COMPLETED NATURALLY
    if (currentId === 22 || currentId === 23) {
      isEntryActiveRef.current = false;
      isOneShotActiveRef.current = false;

      // STEP 1: If this entry was triggered as part of an exit -> re-entry sequence,
      // it MUST settle into #29 Idle / Waiting.
      if (isExitReentryRef.current) {
        isExitReentryRef.current = false;
        isExitActiveRef.current = false;
        changeAnimation(29, false, true); // Settle into #29 Idle / Waiting
        return;
      }

      // Normal Power-On Entry completion:
      // Mahiru has reached the center reference position and remains conversation-ready.
      // - Do NOT automatically play #29.
      // - Do NOT automatically play #4 Greeting.
      // - Do NOT automatically play #1 Thinking.
      // - Do NOT automatically start another random animation.
      // - Do not force a prerecorded greeting voice.
      // - Wait for the actual conversation/state system to decide the next animation.

      // If AI is already speaking, transition to appropriate response animation
      if (sessionState === 'speaking' || isAiSpeakingRef.current) {
        const mode = conversationModeRef.current;
        const target = mode === 'greeting' ? 4 : mode === 'explaining' ? 2 : 5;
        changeAnimation(target, target === 4);
      }
      // If user is already speaking, transition to #6 Listening
      else if (wasUserSpeakingRef.current) {
        changeAnimation(6, false);
      }
      // Otherwise settle smoothly into continuous active #29 Idle / Waiting
      else {
        changeAnimation(29, false, true);
      }
      return;
    }

    // 2. #4 GREETING COMPLETED NATURALLY
    if (currentId === 4) {
      isOneShotActiveRef.current = false;
      // If AI voice is still speaking, seamlessly continue speaking with #5 Talking
      if (sessionState === 'speaking' || isAiSpeakingRef.current) {
        changeAnimation(5, false);
      } else {
        // AI greeting speech completed, return to #6 Listening (conversation-ready)
        changeAnimation(6, false);
      }
      return;
    }

    // 2b. #9 GOODBYE COMPLETED NATURALLY
    if (currentId === 9) {
      isOneShotActiveRef.current = false;
      isMovementActiveRef.current = false;

      // Power state must be evaluated during Goodbye flow:
      // If power is turned OFF during/after Goodbye:
      // - DO NOT perform exit or re-entry animation.
      // - Preserve existing Power OFF / standby behavior on #29.
      if (!isPowerOnRef.current || sessionState === 'disconnected') {
        isExitActiveRef.current = false;
        isExitReentryRef.current = false;
        changeAnimation(29, false, true);
        return;
      }

      // If power remains ON after #9 finishes naturally:
      // Randomly choose ONE exit side: #24 RIGHT EXIT or #25 LEFT EXIT
      const exitAnimId = Math.random() < 0.5 ? 24 : 25;
      isExitActiveRef.current = true;
      isExitReentryRef.current = false;
      changeAnimation(exitAnimId, true);
      return;
    }

    // 3. EXIT ANIMATIONS (#24 Right Exit or #25 Left Exit) COMPLETED NATURALLY
    if (currentId === 24 || currentId === 25) {
      isExitActiveRef.current = false;

      // Power state evaluation:
      // If the power/session is turned OFF before the post-exit re-entry should occur:
      // - DO NOT perform the re-entry animation.
      // - Preserve existing Power OFF / standby behavior on #29.
      if (!isPowerOnRef.current || sessionState === 'disconnected') {
        isExitReentryRef.current = false;
        isEntryActiveRef.current = false;
        isOneShotActiveRef.current = false;
        changeAnimation(29, false, true);
        return;
      }

      // If power remains ON: deterministic opposite-side re-entry flow:
      // #24 Right Exit ALWAYS pairs with #22 Left Enter
      // #25 Left Exit ALWAYS pairs with #23 Right Enter
      const oppositeEnterId = currentId === 24 ? 22 : 23;
      isExitActiveRef.current = true;
      isExitReentryRef.current = true;
      isEntryActiveRef.current = true;
      isOneShotActiveRef.current = true;

      // Trigger the opposite-side entry animation as a one-shot movement action
      changeAnimation(oppositeEnterId, true);
      return;
    }

    // 4. STEP ASIDE ANIMATIONS (#27 Step Aside Right or #28 Step Aside Left)
    if (currentId === 27 || currentId === 28) {
      isMovementActiveRef.current = false;
      isOneShotActiveRef.current = false;
      // After side-step movement completes naturally via onEnded:
      // Mahiru remains completely visible inside the locked frame.
      // Final state settles strictly into #29 Idle/Waiting.
      // Does NOT trigger #24 Right Exit, #25 Left Exit, #22 Left Enter, #23 Right Enter,
      // nor #1 Thinking, #4 Greeting, #5 Talking, #6 Listening, or any emotion video.
      changeAnimation(29, false, true);
      return;
    }

    // 5. #30 LOOK TOWARD SOMETHING
    if (currentId === 30) {
      isMovementActiveRef.current = false;
      isOneShotActiveRef.current = false;
      // One-shot action completes and returns to appropriate state
      if (!isPowerOnRef.current) {
        changeAnimation(29, false, true);
      } else if (sessionState === 'speaking' || isAiSpeakingRef.current) {
        changeAnimation(5, false);
      } else {
        changeAnimation(6, false);
      }
      return;
    }

    // 6. OTHER ONE-SHOT ACTIONS / EMOTIONS (#7–#20)
    const currentMeta = MAHIRU_VIDEOS[currentId];
    if (currentMeta?.isOneShot || isOneShotActiveRef.current) {
      isOneShotActiveRef.current = false;
      isMovementActiveRef.current = false;
      if (!isPowerOnRef.current) {
        changeAnimation(29, false, true);
      } else if (sessionState === 'speaking' || isAiSpeakingRef.current) {
        // Return to active conversation state: #2 if explaining, #5 if talking
        const mode = conversationModeRef.current;
        const returnAnim = mode === 'explaining' ? 2 : 5;
        changeAnimation(returnAnim, false);
      } else {
        // Response complete: return to waiting/conversation-ready state #6 Listening
        changeAnimation(6, false);
      }
      return;
    }

    // 7. #29 IDLE / WAITING OR LOOPING ANIMATION REACHED END (Media ended event fallback)
    // If browser fired 'ended' on looping idle #29, re-affirm continuous playback immediately.
    if (currentId === 29 || currentMeta?.loop) {
      changeAnimation(currentId, false, true);
      return;
    }
  }, [changeAnimation, sessionState]);

  // Trigger Thinking manually (e.g. when text message is sent)
  const triggerThinking = useCallback(() => {
    if (!isPowerOnRef.current || isEntryActiveRef.current || isExitActiveRef.current) return;
    isOneShotActiveRef.current = false;
    changeAnimation(1, false); // #1 Thinking
  }, [changeAnimation]);

  // Set conversation response style ('greeting' -> #4, 'explaining' -> #2, 'talking' -> #5)
  const setConversationStyle = useCallback(
    (style: ConversationStyle) => {
      conversationModeRef.current = style;
      if (isPowerOnRef.current && !isEntryActiveRef.current && !isExitActiveRef.current) {
        if (!isOneShotActiveRef.current && (sessionState === 'speaking' || isAiSpeakingRef.current)) {
          const target = style === 'greeting' ? 4 : style === 'explaining' ? 2 : 5;
          if (currentAnimIdRef.current !== target) {
            changeAnimation(target, target === 4);
          }
        }
      }
    },
    [changeAnimation, sessionState]
  );

  // Emotional Reactions across all 30 videos (only triggered by explicit reaction events)
  const triggerEmotion = useCallback(
    (emotion: string) => {
      if (!isPowerOnRef.current || isEntryActiveRef.current || isExitActiveRef.current) return;
      const em = (emotion || '').toLowerCase().trim();
      let animId: number | null = null;

      // 1. Specific multi-word or compound emotion checks first
      if (
        em.includes('excited_greeting') ||
        em.includes('excited greeting') ||
        em.includes('enthusiastic_wave') ||
        em.includes('enthusiastic wave')
      ) {
        animId = 18; // #18 Excited Greeting / Enthusiastic Wave
      } else if (
        em.includes('look_around') ||
        em.includes('looking_around') ||
        em.includes('look around') ||
        em.includes('looking around')
      ) {
        animId = 17; // #17 Looking Around (situational one-shot action)
      } else if (
        em.includes('sigh') ||
        em.includes('taking_a_breath') ||
        em.includes('taking a breath') ||
        em.includes('deep_breath') ||
        em.includes('deep breath')
      ) {
        animId = 19; // #19 Sigh / Taking a Breath (emotional exhale)
      } else if (
        em.includes('sleepy') ||
        em.includes('tired') ||
        em.includes('drowsy') ||
        em.includes('neend') ||
        em.includes('exhausted')
      ) {
        animId = 16; // #16 Sleepy & Tired
      } else if (
        em.includes('remember') ||
        em.includes('recall') ||
        em.includes('yaad') ||
        em.includes('realization')
      ) {
        animId = 15; // #15 Remembering
      } else if (
        em.includes('laugh') ||
        em.includes('giggle') ||
        em.includes('hansi') ||
        em.includes('haha') ||
        em.includes('funny')
      ) {
        animId = 14; // #14 Laughing
      } else if (
        em.includes('thank') ||
        em.includes('grateful') ||
        em.includes('gratitude') ||
        em.includes('shukriya') ||
        em.includes('dhanyawad')
      ) {
        animId = 13; // #13 Thankful
      } else if (
        em.includes('relieved') ||
        em.includes('relief') ||
        em.includes('sukoon')
      ) {
        animId = 12; // #12 Relieved
      } else if (
        em.includes('confused') ||
        em.includes('puzzled') ||
        em.includes('confusion')
      ) {
        animId = 11; // #11 Confused
      } else if (
        em.includes('surprised') ||
        em.includes('surprise') ||
        em.includes('shock') ||
        em.includes('chauk') ||
        em.includes('astonished')
      ) {
        animId = 10; // #10 Surprised
      } else if (
        em.includes('excited') ||
        em.includes('energetic') ||
        em.includes('enthusiastic') ||
        em.includes('utsahit')
      ) {
        animId = 8; // #8 Excited
      } else if (
        em.includes('shy') ||
        em.includes('embarrass') ||
        em.includes('blush') ||
        em.includes('sharm') ||
        em.includes('flustered')
      ) {
        animId = 20; // #20 Shy / Embarrassed
      } else if (
        em.includes('happy') ||
        em.includes('khush') ||
        em.includes('cheerful') ||
        em.includes('pleased') ||
        em.includes('love')
      ) {
        animId = 7; // #7 Happy
      } else if (em.includes('question') || em.includes('ask')) {
        animId = 3; // #3 Asking Question
      } else if (em.includes('explain') || em.includes('bcz')) {
        animId = 2; // #2 Explaining
      } else if (em.includes('goodbye') || em.includes('bye')) {
        animId = 9; // #9 Goodbye
      }

      // If no recognized emotion is present, DO NOT trigger a random emotion!
      // Fall back to normal Step 2 conversation state (#5 Talking or #2 Explaining).
      if (animId === null) {
        const mode = conversationModeRef.current;
        const target = mode === 'explaining' ? 2 : 5;
        if (sessionState === 'speaking' || isAiSpeakingRef.current) {
          changeAnimation(target, false);
        }
        return;
      }

      changeAnimation(animId, true);
    },
    [changeAnimation, sessionState]
  );

  /**
   * Movement Actions (#21-28, #30)
   * Only triggered on genuine, real movement events.
   * Never triggered randomly.
   */
  const triggerMovement = useCallback(
    (action: string) => {
      if (!isPowerOnRef.current || isEntryActiveRef.current) return;
      const act = action.toLowerCase().trim();
      let animId = 21; // #21 Walking default

      // #27 Step Aside Right (only on real event to move Mahiru right)
      if (
        act.includes('step_right') ||
        act.includes('aside_right') ||
        act.includes('step_aside_right') ||
        (act.includes('step') && act.includes('right'))
      ) {
        animId = 27; // #27 Step aside right
        isMovementActiveRef.current = true;
      }
      // #28 Step Aside Left (only on real event to move Mahiru left)
      else if (
        act.includes('step_left') ||
        act.includes('aside_left') ||
        act.includes('step_aside_left') ||
        (act.includes('step') && act.includes('left'))
      ) {
        animId = 28; // #28 Step aside left
        isMovementActiveRef.current = true;
      }
      // Genuine Exit Right
      else if (
        act.includes('right_exit') ||
        act.includes('exit_right') ||
        (act.includes('exit') && act.includes('right'))
      ) {
        if (isExitActiveRef.current) return;
        animId = 24; // #24 Right exit
        isExitActiveRef.current = true;
        isExitReentryRef.current = false;
      }
      // Genuine Exit Left
      else if (
        act.includes('left_exit') ||
        act.includes('exit_left') ||
        (act.includes('exit') && act.includes('left'))
      ) {
        if (isExitActiveRef.current) return;
        animId = 25; // #25 Left exit
        isExitActiveRef.current = true;
        isExitReentryRef.current = false;
      }
      // Goodbye / Bye / General Exit (direction unspecified):
      // MUST play #9 GOODBYE animation first, then naturally exit on ended
      else if (
        act.includes('goodbye') ||
        act.includes('bye') ||
        act.includes('alvida') ||
        act.includes('exit') ||
        act.includes('leave') ||
        act.includes('chali jao') ||
        act.includes('nikal')
      ) {
        if (isExitActiveRef.current) return;
        isExitActiveRef.current = false;
        isExitReentryRef.current = false;
        // #9 GOODBYE animation MUST play first
        changeAnimation(9, true);
        return;
      }
      // #23 Right Enter (direct entry from right)
      else if (act.includes('right_enter') || act.includes('enter_right')) {
        animId = 23;
        isEntryActiveRef.current = true;
        isOneShotActiveRef.current = true;
      }
      // #22 Left Enter (direct entry from left)
      else if (act.includes('left_enter') || act.includes('enter_left')) {
        animId = 22;
        isEntryActiveRef.current = true;
        isOneShotActiveRef.current = true;
      }
      // #30 Look Toward Something (only on real event/reason)
      else if (act.includes('look_toward') || act.includes('toward')) {
        animId = 30; // #30 Look toward something
        isMovementActiveRef.current = true;
      }
      // Other physical movements
      else if (act.includes('walk') || act.includes('chalo') || act.includes('tahlo')) {
        animId = 21; // #21 Walking
        isMovementActiveRef.current = true;
      } else if (act.includes('turn') || act.includes('ghumo')) {
        animId = 26; // #26 Turn around
        isMovementActiveRef.current = true;
      } else if (act.includes('look_around') || act.includes('around') || act.includes('dekho')) {
        animId = 17; // #17 Looking Around
        isMovementActiveRef.current = true;
      } else {
        return;
      }

      // Allowed to complete naturally via onEnded event
      changeAnimation(animId, true);
    },
    [changeAnimation]
  );

  /**
   * Explicit Exit Action
   * Choose randomly between ONLY #24 Right Exit and #25 Left Exit
   */
  const triggerExit = useCallback(
    (direction?: 'left' | 'right') => {
      if (!isPowerOnRef.current || isEntryActiveRef.current || isExitActiveRef.current) return;
      let exitAnim = Math.random() < 0.5 ? 24 : 25;
      if (direction === 'right') exitAnim = 24;
      if (direction === 'left') exitAnim = 25;
      isExitActiveRef.current = true;
      isExitReentryRef.current = false;
      changeAnimation(exitAnim, true);
    },
    [changeAnimation]
  );

  /**
   * Explicit direct moment trigger for any of the 30 Mahiru video moments (#1–#30).
   * Prioritizes explicit requested moments over background/random animations.
   */
  const triggerDirectMoment = useCallback(
    (momentId: number) => {
      if (!isPowerOnRef.current) return;
      if (momentId < 1 || momentId > 30) return;

      // Handle exits specifically to ensure proper exit flags and opposite-side entry flow
      if (momentId === 24) {
        triggerExit('right');
        return;
      }
      if (momentId === 25) {
        triggerExit('left');
        return;
      }

      // Handle side-steps (#27 and #28)
      if (momentId === 27) {
        triggerMovement('step_aside_right');
        return;
      }
      if (momentId === 28) {
        triggerMovement('step_aside_left');
        return;
      }

      // Handle direct entries (#22 and #23)
      if (momentId === 22) {
        triggerMovement('left_enter');
        return;
      }
      if (momentId === 23) {
        triggerMovement('right_enter');
        return;
      }

      // Reset active one-shot / movement flags
      isExitActiveRef.current = false;
      isExitReentryRef.current = false;
      isEntryActiveRef.current = false;
      isMovementActiveRef.current = false;

      const meta = MAHIRU_VIDEOS[momentId];
      const isOneShot = meta ? meta.isOneShot : false;
      isOneShotActiveRef.current = isOneShot;

      // Direct change animation with explicit moment priority
      changeAnimation(momentId, isOneShot);
    },
    [changeAnimation, triggerExit, triggerMovement]
  );

  return {
    currentAnimId,
    currentMeta: MAHIRU_VIDEOS[currentAnimId] || MAHIRU_VIDEOS[29],
    availableFiles,
    changeAnimation,
    handleVideoEnded,
    triggerThinking,
    triggerInterrupt,
    triggerEmotion,
    triggerMovement,
    triggerExit,
    triggerDirectMoment,
    setConversationStyle,
  };
}
