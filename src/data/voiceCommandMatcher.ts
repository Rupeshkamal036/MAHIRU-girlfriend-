/**
 * Matches user verbal and textual requests to exact Mahiru animation IDs (1 to 30).
 * Handles Hindi, Hinglish, and English phrasing naturally and unambiguously.
 */

export interface VoiceMomentMatch {
  animId: number;
  isExit?: boolean;
  exitDirection?: 'left' | 'right';
  movementAction?: string;
  reactionType?: string;
}

/**
 * Clean and normalize spoken input text.
 */
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,?!/\\#@$%^&*()_=+~`":;<>'{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a specific moment is explicitly requested in text.
 * Strictly avoids confusing similar moments:
 * - #22 Left Enter vs #25 Left Exit
 * - #23 Right Enter vs #24 Right Exit
 * - #27 Step Aside Right vs #24 Right Exit
 * - #28 Step Aside Left vs #25 Left Exit
 * - #4 Greeting vs #18 Excited Greeting
 * - #5 Talking vs #2 Explaining
 * - #7 Happy vs #8 Excited
 * - #15 Remembering vs #1 Thinking
 * - #17 Looking Around vs #30 Look Toward
 * - #16 Sleepy vs #19 Sigh
 */
export function matchVoiceMomentCommand(rawText: string): VoiceMomentMatch | null {
  if (!rawText) return null;
  const text = normalizeText(rawText);

  // ==========================================
  // 1. DIRECTIONAL EXITS & ENTERS (HIGH PRIORITY FIRST)
  // ==========================================

  // #27 STEP ASIDE RIGHT (Side-step right, NOT exit)
  // "right side step karo", "right step karo", "right mein step karo", "step aside right"
  if (
    text.includes('right side step') ||
    text.includes('right step') ||
    text.includes('step aside right') ||
    text.includes('step right') ||
    text.includes('right mein step') ||
    text.includes('right side ho jao') ||
    text.includes('right ko step')
  ) {
    return { animId: 27, movementAction: 'step_aside_right' };
  }

  // #28 STEP ASIDE LEFT (Side-step left, NOT exit)
  // "left side step karo", "left step karo", "left mein step karo", "step aside left"
  if (
    text.includes('left side step') ||
    text.includes('left step') ||
    text.includes('step aside left') ||
    text.includes('step left') ||
    text.includes('left mein step') ||
    text.includes('left side ho jao') ||
    text.includes('left ko step')
  ) {
    return { animId: 28, movementAction: 'step_aside_left' };
  }

  // #24 RIGHT EXIT
  // "right exit karo", "right side se exit karo", "right side se bahar jao", "exit right"
  if (
    text.includes('right exit') ||
    text.includes('exit right') ||
    text.includes('right side se exit') ||
    text.includes('right se exit') ||
    text.includes('right side se bahar') ||
    text.includes('right taraf se exit') ||
    text.includes('right side exit')
  ) {
    return { animId: 24, isExit: true, exitDirection: 'right', movementAction: 'right_exit' };
  }

  // #25 LEFT EXIT
  // "left exit karo", "left side se exit karo", "left side se bahar jao", "exit left"
  if (
    text.includes('left exit') ||
    text.includes('exit left') ||
    text.includes('left side se exit') ||
    text.includes('left se exit') ||
    text.includes('left side se bahar') ||
    text.includes('left taraf se exit') ||
    text.includes('left side exit')
  ) {
    return { animId: 25, isExit: true, exitDirection: 'left', movementAction: 'left_exit' };
  }

  // #22 LEFT ENTER
  // "left enter karo", "left side se enter karo", "left entry karo", "left se aao"
  if (
    text.includes('left enter') ||
    text.includes('enter left') ||
    text.includes('left side se enter') ||
    text.includes('left se enter') ||
    text.includes('left entry') ||
    text.includes('left side entry') ||
    text.includes('left se aao') ||
    text.includes('left se andar aao')
  ) {
    return { animId: 22, movementAction: 'left_enter' };
  }

  // #23 RIGHT ENTER
  // "right enter karo", "right side se enter karo", "right entry karo", "right se aao"
  if (
    text.includes('right enter') ||
    text.includes('enter right') ||
    text.includes('right side se enter') ||
    text.includes('right se enter') ||
    text.includes('right entry') ||
    text.includes('right side entry') ||
    text.includes('right se aao') ||
    text.includes('right se andar aao')
  ) {
    return { animId: 23, movementAction: 'right_enter' };
  }

  // Generic Exit if not right/left specific
  if (
    text === 'exit karo' ||
    text === 'exit' ||
    text === 'leave karo' ||
    text === 'chali jao' ||
    text === 'nikal jao' ||
    text.includes('screen se bahar jao')
  ) {
    return { animId: 24, isExit: true, movementAction: 'exit' };
  }

  // ==========================================
  // 2. SPECIAL MOVEMENTS (#21, #26, #30)
  // ==========================================

  // #26 TURN AROUND
  // "turn around karo", "turn karo", "ghoom jao", "turn back karo", "turn around"
  if (
    text.includes('turn around') ||
    text.includes('turn back') ||
    text.includes('ghoom jao') ||
    text.includes('ghumo') ||
    text.includes('turn karo') ||
    text.includes('round turn') ||
    text === 'turn'
  ) {
    return { animId: 26, movementAction: 'turn_around' };
  }

  // #21 WALKING
  // "walking moment karo", "walk karo", "chalo walk karo", "tahlo", "chalo walk"
  if (
    text.includes('walking moment') ||
    text.includes('walk moment') ||
    text.includes('walk karo') ||
    text.includes('walking karo') ||
    text.includes('chalo walk') ||
    text.includes('thoda tahlo') ||
    text.includes('tahlo') ||
    text === 'walk' ||
    text === 'walking'
  ) {
    return { animId: 21, movementAction: 'walk' };
  }

  // #30 LOOK TOWARD SOMETHING
  // "look toward something", "udhar dekho", "wahan dekho", "look over there", "look toward"
  if (
    text.includes('look toward something') ||
    text.includes('look towards something') ||
    text.includes('look toward') ||
    text.includes('look towards') ||
    text.includes('udhar dekho') ||
    text.includes('wahan dekho') ||
    text.includes('vahan dekho') ||
    text.includes('look over there') ||
    text.includes('look there')
  ) {
    return { animId: 30, movementAction: 'look_toward' };
  }

  // ==========================================
  // 3. EMOTION & GESTURE MOMENTS (#7 to #20, #9)
  // ==========================================

  // #18 EXCITED GREETING (Distinct from #4 Greeting)
  // "excited greeting karo", "excited way mein greet karo", "enthusiastic greeting karo"
  if (
    text.includes('excited greeting') ||
    text.includes('enthusiastic greeting') ||
    text.includes('energetic greeting') ||
    text.includes('enthusiastic wave') ||
    text.includes('excited wave') ||
    text.includes('excited way mein greet')
  ) {
    return { animId: 18, reactionType: 'excited_greeting' };
  }

  // #4 GREETING (Regular friendly wave/greeting)
  // "greet karo", "greeting moment karo", "mujhe greet karo"
  if (
    text.includes('greeting moment') ||
    text.includes('greet karo') ||
    text.includes('greeting karo') ||
    text.includes('mujhe greet karo') ||
    text.includes('greet me')
  ) {
    return { animId: 4 };
  }

  // #17 LOOKING AROUND (Distinct from #30 Look Toward)
  // "looking around moment karo", "around dekho", "idhar udhar dekho", "look around karo"
  if (
    text.includes('looking around') ||
    text.includes('look around') ||
    text.includes('around dekho') ||
    text.includes('idhar udhar dekho') ||
    text.includes('charon taraf dekho')
  ) {
    return { animId: 17, reactionType: 'look_around' };
  }

  // #19 SIGH / TAKING A BREATH (Distinct from #16 Sleepy)
  // "sigh moment karo", "deep breath lo", "taking breath moment karo", "sigh karo", "saans lo"
  if (
    text.includes('sigh moment') ||
    text.includes('sigh karo') ||
    text.includes('taking a breath') ||
    text.includes('taking breath') ||
    text.includes('deep breath') ||
    text.includes('saans lo') ||
    text.includes('gehri saans') ||
    text === 'sigh'
  ) {
    return { animId: 19, reactionType: 'sigh' };
  }

  // #16 SLEEPY / TIRED
  // "sleepy moment karo", "tired moment karo", "sleepy/tired ho jao", "neend aa rahi hai"
  if (
    text.includes('sleepy moment') ||
    text.includes('tired moment') ||
    text.includes('sleepy tired') ||
    text.includes('sleepy ho jao') ||
    text.includes('tired ho jao') ||
    text.includes('sleepy karo') ||
    text.includes('tired karo') ||
    text.includes('neend aa rahi') ||
    text.includes('feeling sleepy') ||
    text.includes('feeling tired')
  ) {
    return { animId: 16, reactionType: 'sleepy' };
  }

  // #15 REMEMBERING (Distinct from #1 Thinking)
  // "remembering moment karo", "kuch yaad karo", "remember karo", "yaad karne wala moment"
  if (
    text.includes('remembering moment') ||
    text.includes('remember moment') ||
    text.includes('remember karo') ||
    text.includes('remembering karo') ||
    text.includes('kuch yaad karo') ||
    text.includes('yaad karo') ||
    text.includes('recall karo') ||
    text.includes('yaad karne wala')
  ) {
    return { animId: 15, reactionType: 'remembering' };
  }

  // #14 LAUGHING
  // "laughing moment karo", "hanso", "laugh karo", "hans ke dikhao"
  if (
    text.includes('laughing moment') ||
    text.includes('laugh moment') ||
    text.includes('laughing karo') ||
    text.includes('laugh karo') ||
    text.includes('hanso') ||
    text.includes('hans ke dikhao') ||
    text.includes('hansi wala moment')
  ) {
    return { animId: 14, reactionType: 'laughing' };
  }

  // #13 THANKFUL
  // "thankful moment karo", "thank me", "thankful reaction do", "shukriya karo"
  if (
    text.includes('thankful moment') ||
    text.includes('thankful reaction') ||
    text.includes('thankful karo') ||
    text.includes('thankful ho jao') ||
    text.includes('thank me') ||
    text.includes('shukriya bolo') ||
    text.includes('dhanyawad karo') ||
    text.includes('gratitude reaction')
  ) {
    return { animId: 13, reactionType: 'thankful' };
  }

  // #12 RELIEVED
  // "relieved moment karo", "relieved reaction do", "relaxed relieved moment karo", "sukoon mila"
  if (
    text.includes('relieved moment') ||
    text.includes('relieved reaction') ||
    text.includes('relieved karo') ||
    text.includes('relieved ho jao') ||
    text.includes('relief moment') ||
    text.includes('relief reaction') ||
    text.includes('sukoon mila')
  ) {
    return { animId: 12, reactionType: 'relieved' };
  }

  // #11 CONFUSED
  // "confused moment karo", "confused ho jao", "confused reaction do", "confusion wala moment"
  if (
    text.includes('confused moment') ||
    text.includes('confused reaction') ||
    text.includes('confused ho jao') ||
    text.includes('confused karo') ||
    text.includes('confusion moment') ||
    text.includes('confusion reaction')
  ) {
    return { animId: 11, reactionType: 'confused' };
  }

  // #10 SURPRISED
  // "surprised moment karo", "surprise ho jao", "surprised reaction do", "chauk jao"
  if (
    text.includes('surprised moment') ||
    text.includes('surprised reaction') ||
    text.includes('surprise ho jao') ||
    text.includes('surprised ho jao') ||
    text.includes('surprise karo') ||
    text.includes('shocked reaction') ||
    text.includes('chauk jao')
  ) {
    return { animId: 10, reactionType: 'surprised' };
  }

  // #20 SHY / EMBARRASSED
  // "shy moment karo", "embarrassed ho jao", "shy reaction do", "sharma jao", "blush karo"
  if (
    text.includes('shy moment') ||
    text.includes('shy reaction') ||
    text.includes('shy ho jao') ||
    text.includes('sharma jao') ||
    text.includes('embarrassed moment') ||
    text.includes('embarrassed ho jao') ||
    text.includes('embarrassed reaction') ||
    text.includes('blush karo') ||
    text.includes('sharm')
  ) {
    return { animId: 20, reactionType: 'shy' };
  }

  // #8 EXCITED (Distinct from #7 Happy)
  // "excited moment karo", "excited ho jao", "excited reaction do", "utsahit ho jao"
  if (
    text.includes('excited moment') ||
    text.includes('excited reaction') ||
    text.includes('excited ho jao') ||
    text.includes('excited karo') ||
    text.includes('excitement wala moment') ||
    text.includes('utsahit')
  ) {
    return { animId: 8, reactionType: 'excited' };
  }

  // #7 HAPPY (Distinct from #8 Excited)
  // "happy moment karo", "happy ho jao", "happy reaction do", "khush ho jao"
  if (
    text.includes('happy moment') ||
    text.includes('happy reaction') ||
    text.includes('happy ho jao') ||
    text.includes('happy karo') ||
    text.includes('khush ho jao') ||
    text.includes('khushi wala reaction')
  ) {
    return { animId: 7, reactionType: 'happy' };
  }

  // #9 GOODBYE
  // "goodbye moment karo", "bye bolo", "goodbye karo", "bye bye bolo"
  if (
    text.includes('goodbye moment') ||
    text.includes('goodbye karo') ||
    text.includes('bye bolo') ||
    text.includes('bye bye bolo') ||
    text.includes('alvida bolo')
  ) {
    return { animId: 9, reactionType: 'goodbye' };
  }

  // ==========================================
  // 4. CONVERSATION & IDLE STATES (#1, #2, #3, #5, #6, #29)
  // ==========================================

  // #1 THINKING (Distinct from #15 Remembering)
  // "thinking moment karo", "think karo", "mahiru think karo", "socho"
  if (
    text.includes('thinking moment') ||
    text.includes('think moment') ||
    text.includes('think karo') ||
    text.includes('thinking karo') ||
    text.includes('soch mein pad jao') ||
    text === 'think' ||
    text === 'thinking'
  ) {
    return { animId: 1 };
  }

  // #2 TALKING & EXPLAINING (Distinct from #5 Talking)
  // "explain karo", "talking and explaining moment karo", "mujhe explain karo", "samjhao"
  if (
    text.includes('talking and explaining') ||
    text.includes('explaining moment') ||
    text.includes('explain moment') ||
    text.includes('explain karo') ||
    text.includes('mujhe explain karo') ||
    text.includes('achhe se samjhao') ||
    text.includes('detail me explain')
  ) {
    return { animId: 2 };
  }

  // #3 ASKING QUESTION
  // "question poochho", "asking question wala moment karo", "sawal poochho", "ask a question"
  if (
    text.includes('asking question') ||
    text.includes('question moment') ||
    text.includes('question poochho') ||
    text.includes('sawal poochho') ||
    text.includes('question poocho') ||
    text.includes('sawal poocho') ||
    text.includes('ask a question') ||
    text.includes('ask question')
  ) {
    return { animId: 3 };
  }

  // #5 TALKING (Standard conversational speech)
  // "normal talking karo", "talking moment karo", "normally baat karo", "baat karo"
  if (
    text.includes('normal talking') ||
    text.includes('talking moment') ||
    text.includes('talking karo') ||
    text.includes('normally baat karo') ||
    text.includes('normal baat karo') ||
    text.includes('baat karo')
  ) {
    return { animId: 5 };
  }

  // #6 LISTENING
  // "listen karo", "listening moment karo", "meri baat suno", "listening karo", "dhyaan se suno"
  if (
    text.includes('listening moment') ||
    text.includes('listen moment') ||
    text.includes('listening karo') ||
    text.includes('listen karo') ||
    text.includes('meri baat suno') ||
    text.includes('suno mahiru') ||
    text.includes('dhyaan se suno') ||
    text === 'listen' ||
    text === 'listening'
  ) {
    return { animId: 6 };
  }

  // #29 IDLE / WAITING
  // "idle moment karo", "waiting moment karo", "idle mein raho", "wait karo", "stay idle"
  if (
    text.includes('idle moment') ||
    text.includes('waiting moment') ||
    text.includes('idle karo') ||
    text.includes('wait karo') ||
    text.includes('idle mein raho') ||
    text.includes('waiting mein raho') ||
    text.includes('stay idle') ||
    text === 'idle' ||
    text === 'wait'
  ) {
    return { animId: 29 };
  }

  return null;
}
