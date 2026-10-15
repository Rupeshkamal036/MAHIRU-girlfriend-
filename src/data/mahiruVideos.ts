export interface MahiruVideoMeta {
  id: number;
  name: string;
  filename: string;
  isOneShot?: boolean;
  loop?: boolean;
  actionStart?: number;
  nextDefaultStateId?: number;
}

export const MAHIRU_VIDEOS: Record<number, MahiruVideoMeta> = {
  1: { id: 1, name: 'Thinking', filename: '1 Thinking.mp4', isOneShot: true, nextDefaultStateId: 6 },
  2: { id: 2, name: 'Explaining', filename: '2 Talking bcz&Explaining.mp4', loop: true },
  3: { id: 3, name: 'Asking Confused', filename: '3 asking, confused.mp4', isOneShot: true, nextDefaultStateId: 6 },
  4: { id: 4, name: 'Greeting', filename: '4 GREETING.mp4', isOneShot: true, nextDefaultStateId: 6 },
  5: { id: 5, name: 'Talking', filename: '5 Talking.mp4', loop: true },
  6: { id: 6, name: 'Listening', filename: '6 LISTENING.mp4', loop: true },
  7: { id: 7, name: 'Happy', filename: '7 happy.mp4', isOneShot: true, nextDefaultStateId: 6 },
  8: { id: 8, name: 'Excited', filename: '8 EXCITED.mp4', isOneShot: true, nextDefaultStateId: 6 },
  9: { id: 9, name: 'Goodbye', filename: '9 GOODBYE.mp4', isOneShot: true, nextDefaultStateId: 29 },
  10: { id: 10, name: 'Surprised', filename: '10 SURPRISED.mp4', isOneShot: true, nextDefaultStateId: 6 },
  11: { id: 11, name: 'Confused', filename: '11 CONFUSED.mp4', isOneShot: true, nextDefaultStateId: 6 },
  12: { id: 12, name: 'Relieved', filename: '12 RELIEVED.mp4', isOneShot: true, nextDefaultStateId: 6 },
  13: { id: 13, name: 'Thankful', filename: '13 THANKFUL.mp4', isOneShot: true, nextDefaultStateId: 6 },
  14: { id: 14, name: 'Laughing', filename: '14 LAUGHING.mp4', isOneShot: true, nextDefaultStateId: 6 },
  15: { id: 15, name: 'Remembering', filename: '15 REMEMBERING.mp4', isOneShot: true, nextDefaultStateId: 6 },
  16: { id: 16, name: 'Sleepy', filename: '16 SLEEPY.mp4', isOneShot: true, nextDefaultStateId: 6 },
  17: { id: 17, name: 'Looking Around', filename: '17 LOOKING AROUND.mp4', isOneShot: true, nextDefaultStateId: 6 },
  18: { id: 18, name: 'Excited Greeting', filename: '18 EXCITED GREETING.mp4', isOneShot: true, nextDefaultStateId: 6 },
  19: { id: 19, name: 'Sigh / Breath', filename: '19 SIGH , TAKING A BREATH.mp4', isOneShot: true, nextDefaultStateId: 6 },
  20: { id: 20, name: 'Shy / Embarrassed', filename: '20 SHY , EMBARRASSED.mp4', isOneShot: true, nextDefaultStateId: 6 },
  21: { id: 21, name: 'Walking', filename: '21 WALKING.mp4', isOneShot: true, nextDefaultStateId: 6 },
  22: { id: 22, name: 'Left Enter', filename: '22 left enter.mp4', isOneShot: true, nextDefaultStateId: 6 },
  23: { id: 23, name: 'Right Enter', filename: '23 Right enter.mp4', isOneShot: true, nextDefaultStateId: 6 },
  24: { id: 24, name: 'Right Exit', filename: '24 Right Exit.mp4', isOneShot: true, nextDefaultStateId: 22 },
  25: { id: 25, name: 'Left Exit', filename: '25 Left Exit.mp4', isOneShot: true, nextDefaultStateId: 23 },
  26: { id: 26, name: 'Turn Around', filename: '26 Turn Around.mp4', isOneShot: true, nextDefaultStateId: 6 },
  27: { id: 27, name: 'Step Aside Right', filename: '27 Step Aside Right.mp4', isOneShot: true, nextDefaultStateId: 6 },
  28: { id: 28, name: 'Step Aside Left', filename: '28 Step Aside Left.mp4', isOneShot: true, nextDefaultStateId: 6 },
  29: { id: 29, name: 'Idle Standby', filename: '29 idle.mp4', loop: true },
  30: { id: 30, name: 'Look Toward', filename: '30 Look TowardSomething.mp4', isOneShot: true, nextDefaultStateId: 6 },
};

export function resolveVideoUrl(animId: number, availableFiles: string[] = []): string {
  const meta = MAHIRU_VIDEOS[animId] || MAHIRU_VIDEOS[29] || MAHIRU_VIDEOS[5];
  const targetFilename = meta.filename;

  // Exact file match in available public files
  if (availableFiles.length > 0) {
    const matched = availableFiles.find(
      (f) =>
        f.toLowerCase() === targetFilename.toLowerCase() ||
        f.toLowerCase().includes(`${animId} `) ||
        f.toLowerCase().startsWith(`${animId} `)
    );
    if (matched) {
      return `/mahiru-videos/${encodeURIComponent(matched)}`;
    }
  }

  // Direct public path fallback
  return `/mahiru-videos/${encodeURIComponent(targetFilename)}`;
}
