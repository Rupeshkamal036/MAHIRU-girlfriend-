import { MahiruVideoMeta } from '../types';

/**
 * Global configuration for Mahiru's greeting message.
 * Editable in this single clearly named location.
 * Handled naturally through the voice conversation system, without separate robotic forced speech.
 */
export const GREETING_TEXT = "Hello Baby, kaise ho?";

export const MAHIRU_VIDEOS: Record<number, MahiruVideoMeta> = {
  1: {
    id: 1,
    filename: ' 1 thinking.mp4',
    title: 'Thinking',
    description: 'Character thinks while looking upward, hand near chin, then realization.',
    category: 'conversation',
    isOneShot: false,
    loop: true,
    priority: 5,
    actionStart: 0.21,
  },
  2: {
    id: 2,
    filename: ' 2 Talking bcz&Explaining.mp4',
    title: 'Talking & Explaining',
    description: 'Natural talking with hand gestures for detailed explanations.',
    category: 'conversation',
    isOneShot: false,
    loop: true,
    priority: 6,
    actionStart: 0.21,
  },
  3: {
    id: 3,
    filename: ' 3 Asking Question.mp4',
    title: 'Asking Question',
    description: 'Questioning expression and gesture when Mahiru asks something.',
    category: 'conversation',
    isOneShot: true,
    loop: false,
    priority: 6,
    nextDefaultStateId: 5,
    actionStart: 0.25,
  },
  4: {
    id: 4,
    filename: ' 4 greeting.mp4',
    title: 'Greeting',
    description: 'Looks toward user and gives a friendly wave upon power on.',
    category: 'conversation',
    isOneShot: true,
    loop: false,
    priority: 8,
    nextDefaultStateId: 6, // Power On: #4 Greeting -> then #6 Listening
    actionStart: 0.25,
  },
  5: {
    id: 5,
    filename: ' 5 Talking.mp4',
    title: 'Talking',
    description: 'Front-facing natural talking with light gestures.',
    category: 'conversation',
    isOneShot: false,
    loop: true,
    priority: 5,
    actionStart: 0.25,
  },
  6: {
    id: 6,
    filename: ' 6 Listening.mp4',
    title: 'Listening',
    description: 'Silent attentive listening with slight nods.',
    category: 'conversation',
    isOneShot: false,
    loop: true,
    priority: 4,
    actionStart: 0.83,
  },
  7: {
    id: 7,
    filename: ' 7 happy.mp4',
    title: 'Happy',
    description: 'Soft smile and cheerful movement.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 1.21,
  },
  8: {
    id: 8,
    filename: ' 8 EXCITED.mp4',
    title: 'Excited',
    description: 'Energetic happy expression and movement.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 1.08,
  },
  9: {
    id: 9,
    filename: ' 9 GOODBYE.mp4',
    title: 'Goodbye',
    description: 'Wave goodbye with a light nod.',
    category: 'conversation',
    isOneShot: true,
    loop: false,
    priority: 9,
    nextDefaultStateId: 29,
    actionStart: 0.25,
  },
  10: {
    id: 10,
    filename: ' 10 Surprised.mp4',
    title: 'Surprised',
    description: 'Eyes widen, eyebrows rise, mouth slightly open.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 1.17,
  },
  11: {
    id: 11,
    filename: ' 11 Confused.mp4',
    title: 'Confused',
    description: 'Head tilt and puzzled expression.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.88,
  },
  12: {
    id: 12,
    filename: ' 12 RELIEVED.mp4',
    title: 'Relieved',
    description: 'Relaxation, exhale and relieved smile.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.92,
  },
  13: {
    id: 13,
    filename: ' 13 THANKFUL.mp4',
    title: 'Thankful',
    description: 'Hands near chest, gentle nod and warm smile.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.0,
  },
  14: {
    id: 14,
    filename: ' 14 LAUGHING.mp4',
    title: 'Laughing',
    description: 'Natural laugh with shoulder/body movement and smiling finish.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.46,
  },
  15: {
    id: 15,
    filename: ' 15 REMEMBERING.mp4',
    title: 'Remembering',
    description: 'Trying to remember, looking upward and realization.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.79,
  },
  16: {
    id: 16,
    filename: ' 16 SLEEPY ,TIRED .mp4',
    title: 'Sleepy & Tired',
    description: 'Slow blinking, heavy eyelids, slight yawn and tired posture.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.21,
  },
  17: {
    id: 17,
    filename: ' 17 LOOKING AROUND.mp4',
    title: 'Looking Around',
    description: 'Looks one side, other side, slightly upward, then back to user.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 6,
    nextDefaultStateId: 5,
    actionStart: 0.38,
  },
  18: {
    id: 18,
    filename: ' 18 EXCITED GREETING , ENTHUSIASTIC WAVE.mp4',
    title: 'Excited Greeting',
    description: 'Energetic greeting and wave.',
    category: 'conversation',
    isOneShot: true,
    loop: false,
    priority: 8,
    nextDefaultStateId: 6,
    actionStart: 0.21,
  },
  19: {
    id: 19,
    filename: ' 19 SIGH , TAKING A BREATH.mp4',
    title: 'Sigh / Taking Breath',
    description: 'Inhale, chest/shoulders rise and slow exhale.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.21,
  },
  20: {
    id: 20,
    filename: ' 20 SHY , EMBARRASSED.mp4',
    title: 'Shy / Embarrassed',
    description: 'Cute shy/embarrassed expression.',
    category: 'emotion',
    isOneShot: true,
    loop: false,
    priority: 7,
    nextDefaultStateId: 5,
    actionStart: 0.38,
  },
  21: {
    id: 21,
    filename: ' 21 WALKING.mp4',
    title: 'Walking',
    description: 'Natural walking cycle.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    actionStart: 0.0,
  },
  22: {
    id: 22,
    filename: ' 22 left enter.mp4',
    title: 'Left Enter',
    description: 'Mahiru enters from the left and stops at reference position.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    actionStart: 0.21,
  },
  23: {
    id: 23,
    filename: ' 23 Right enter.mp4',
    title: 'Right Enter',
    description: 'Mahiru enters from the right and stops.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    actionStart: 0.25,
  },
  24: {
    id: 24,
    filename: ' 24 Right Exit.mp4',
    title: 'Right Exit',
    description: 'Mahiru walks out toward the right.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    actionStart: 0.21,
  },
  25: {
    id: 25,
    filename: ' 25 LEFT EXIT.mp4',
    title: 'Left Exit',
    description: 'Mahiru moves toward the left and exits.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    actionStart: 0.83,
  },
  26: {
    id: 26,
    filename: ' 26 Turn Around.mp4',
    title: 'Turn Around',
    description: 'Smooth turn/rotation and returns front-facing.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    actionStart: 0.21,
  },
  27: {
    id: 27,
    filename: ' 27 Step Aside Right.mp4',
    title: 'Step Aside Right',
    description: 'Mahiru moves a moderate distance toward the right.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    nextDefaultStateId: 29,
    actionStart: 0.25,
  },
  28: {
    id: 28,
    filename: ' 28 Step Aside Left.mp4',
    title: 'Step Aside Left',
    description: 'Small right movement followed by weight shift toward the left.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    nextDefaultStateId: 29,
    actionStart: 1.33,
  },
  29: {
    id: 29,
    filename: ' 29 Idle , Waiting.mp4',
    title: 'Idle / Waiting',
    description: 'Natural standing, breathing, blinking and subtle posture/hand/hair movement.',
    category: 'idle',
    isOneShot: false,
    loop: true,
    priority: 1,
    actionStart: 0.0,
  },
  30: {
    id: 30,
    filename: ' 30 Look TowardSomething.mp4',
    title: 'Look Toward Something',
    description: 'Quickly looks toward a specific direction, focuses, then returns attention to user.',
    category: 'movement',
    isOneShot: true,
    loop: false,
    priority: 6,
    actionStart: 0.71,
  },
};

/**
 * Resolves the URL for a given animation video.
 * Handles:
 * 1. Matching existing files discovered on disk (with or without leading space, e.g. " 10 Surprised.mp4" vs "10 Surprised.mp4")
 * 2. Proper URI encoding for spaces, commas, ampersands, and quotes
 * 3. Graceful fallback if video is still being uploaded
 */
export function resolveVideoUrl(id: number, availableFiles: string[] = []): string {
  const meta = MAHIRU_VIDEOS[id] || MAHIRU_VIDEOS[29];

  // 1. Search available files for matches by exact name or number prefix
  if (availableFiles && availableFiles.length > 0) {
    // Check exact match (ignoring leading/trailing whitespace)
    const exactMatch = availableFiles.find(
      (f) => f.trim().toLowerCase() === meta.filename.trim().toLowerCase()
    );
    if (exactMatch) {
      return `/mahiru-videos/${encodeURIComponent(exactMatch)}`;
    }

    // Check match by leading number prefix (e.g. "10 " or " 10 ")
    const prefixMatch = availableFiles.find((f) => {
      const clean = f.trim();
      const numMatch = clean.match(/^(\d+)\b/);
      return numMatch && parseInt(numMatch[1], 10) === id;
    });
    if (prefixMatch) {
      return `/mahiru-videos/${encodeURIComponent(prefixMatch)}`;
    }

    // 2. Requested ID is not yet on disk: check if idle #29 exists
    const idleMatch = availableFiles.find((f) => {
      const clean = f.trim();
      const numMatch = clean.match(/^(\d+)\b/);
      return numMatch && parseInt(numMatch[1], 10) === 29;
    });
    if (idleMatch) {
      return `/mahiru-videos/${encodeURIComponent(idleMatch)}`;
    }

    // 3. Otherwise fall back to any available video (e.g. " 10 Surprised.mp4")
    return `/mahiru-videos/${encodeURIComponent(availableFiles[0])}`;
  }

  // Default standard path with proper URI encoding
  return `/mahiru-videos/${encodeURIComponent(meta.filename)}`;
}

/**
 * Fallback URL in case a specific video fails to load (e.g. if #29 is not yet on disk, use available #10)
 */
export function getSafeFallbackUrl(availableFiles: string[] = []): string {
  if (availableFiles.length > 0) {
    // Prefer idle #29 if present
    const idleFile = availableFiles.find((f) => f.trim().startsWith('29'));
    if (idleFile) return `/mahiru-videos/${encodeURIComponent(idleFile)}`;
    // Otherwise use any available video (like 10 Surprised)
    return `/mahiru-videos/${encodeURIComponent(availableFiles[0])}`;
  }
  return `/mahiru-videos/${encodeURIComponent(' 29 Idle , Waiting.mp4')}`;
}
