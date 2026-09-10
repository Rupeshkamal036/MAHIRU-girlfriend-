import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { AmbientLightState, SessionState } from '../types';

interface AmbientLightingContextType {
  lightState: AmbientLightState;
  setColor: (color: string) => void;
  setBrightness: (brightness: number) => void;
  setMode: (mode: 'auto' | 'manual') => void;
  resetToAuto: () => void;
  handleVoiceCommand: (text: string) => boolean;
  updateActiveState: (sessionState: SessionState, animId: number) => void;
}

const DEFAULT_LIGHT_STATE: AmbientLightState = {
  mode: 'auto',
  colorName: 'soft-violet',
  primaryGlow: 'rgba(124, 58, 237, 0.22)',
  secondaryGlow: 'rgba(59, 130, 246, 0.18)',
  accentGlow: 'rgba(236, 72, 153, 0.15)',
  brightness: 1.0,
  intensityClass: 'opacity-100',
  isBreathing: true,
};

const AmbientLightingContext = createContext<AmbientLightingContextType | null>(null);

export const AmbientLightingProvider: React.FC<{
  children: React.ReactNode;
  initialSessionState?: SessionState;
  initialAnimationId?: number;
}> = ({ children, initialSessionState = 'disconnected', initialAnimationId = 29 }) => {
  const [activeSessionState, setActiveSessionState] = useState<SessionState>(initialSessionState);
  const [activeAnimId, setActiveAnimId] = useState<number>(initialAnimationId);

  const [manualState, setManualState] = useState<{
    isManual: boolean;
    colorName: string;
    primary: string;
    secondary: string;
    accent: string;
    brightness: number;
  }>({
    isManual: false,
    colorName: 'blue',
    primary: 'rgba(59, 130, 246, 0.3)',
    secondary: 'rgba(147, 51, 234, 0.25)',
    accent: 'rgba(6, 182, 212, 0.2)',
    brightness: 1.0,
  });

  const updateActiveState = useCallback((sState: SessionState, aId: number) => {
    setActiveSessionState(sState);
    setActiveAnimId(aId);
  }, []);

  // Calculate emotion-based lighting when in auto mode
  const emotionLight = useMemo<AmbientLightState>(() => {
    // 1. Power OFF (disconnected)
    if (activeSessionState === 'disconnected') {
      return {
        mode: 'auto',
        colorName: 'off-idle',
        primaryGlow: 'rgba(99, 102, 241, 0.12)',
        secondaryGlow: 'rgba(147, 51, 234, 0.08)',
        accentGlow: 'rgba(30, 27, 75, 0.05)',
        brightness: 0.7,
        intensityClass: 'opacity-70',
        isBreathing: false,
      };
    }

    // 2. Based on current animation ID
    switch (activeAnimId) {
      case 1: // Thinking: soft blue/purple, approximately 0.85 brightness
        return {
          mode: 'auto',
          colorName: 'thinking',
          primaryGlow: 'rgba(59, 130, 246, 0.25)',
          secondaryGlow: 'rgba(139, 92, 246, 0.22)',
          accentGlow: 'rgba(14, 165, 233, 0.18)',
          brightness: 0.85,
          intensityClass: 'opacity-85',
          isBreathing: true,
        };

      case 4: // #4 Greeting: friendly soft blue/purple glow, approx 1.0
      case 5: // #5 Talking: normal blue/purple glow, approx 1.0
      case 2: // #2 Talking & Explaining: normal blue/purple glow, approx 1.0
      case 3: // #3 Asking question
        return {
          mode: 'auto',
          colorName: 'talking',
          primaryGlow: 'rgba(147, 51, 234, 0.32)',
          secondaryGlow: 'rgba(59, 130, 246, 0.28)',
          accentGlow: 'rgba(236, 72, 153, 0.22)',
          brightness: 1.0,
          intensityClass: 'opacity-100',
          isBreathing: true,
        };

      case 7: // #7 Happy: warm/pink, approx 1.1 brightness
        return {
          mode: 'auto',
          colorName: 'happy',
          primaryGlow: 'rgba(236, 72, 153, 0.35)',
          secondaryGlow: 'rgba(244, 114, 182, 0.28)',
          accentGlow: 'rgba(251, 146, 60, 0.2)',
          brightness: 1.1,
          intensityClass: 'opacity-100',
          isBreathing: true,
        };

      case 18: // #18 Excited Greeting: bright energetic lighting, approx 1.25 brightness
      case 8: // #8 Excited: brighter energetic lighting, approx 1.25 brightness
        return {
          mode: 'auto',
          colorName: 'excited',
          primaryGlow: 'rgba(244, 63, 94, 0.42)',
          secondaryGlow: 'rgba(168, 85, 247, 0.38)',
          accentGlow: 'rgba(251, 191, 36, 0.25)',
          brightness: 1.25,
          intensityClass: 'opacity-100',
          isBreathing: true,
        };

      case 20: // Shy / Embarrassed: soft pink, approx 0.9 brightness
        return {
          mode: 'auto',
          colorName: 'shy',
          primaryGlow: 'rgba(244, 114, 182, 0.24)',
          secondaryGlow: 'rgba(251, 113, 133, 0.2)',
          accentGlow: 'rgba(253, 164, 175, 0.15)',
          brightness: 0.9,
          intensityClass: 'opacity-90',
          isBreathing: true,
        };

      case 14: // Laughing: warm/brighter lighting, approx 1.15 brightness
        return {
          mode: 'auto',
          colorName: 'laughing',
          primaryGlow: 'rgba(236, 72, 153, 0.38)',
          secondaryGlow: 'rgba(245, 158, 11, 0.25)',
          accentGlow: 'rgba(168, 85, 247, 0.28)',
          brightness: 1.15,
          intensityClass: 'opacity-100',
          isBreathing: true,
        };

      case 10: // Surprised: brighter energetic lighting, approx 1.2 brightness
        return {
          mode: 'auto',
          colorName: 'surprised',
          primaryGlow: 'rgba(56, 189, 248, 0.4)',
          secondaryGlow: 'rgba(192, 132, 252, 0.35)',
          accentGlow: 'rgba(250, 204, 21, 0.2)',
          brightness: 1.2,
          intensityClass: 'opacity-100',
          isBreathing: false,
        };

      case 11: // Confused: cool blue, approx 0.9 brightness
        return {
          mode: 'auto',
          colorName: 'confused',
          primaryGlow: 'rgba(14, 165, 233, 0.28)',
          secondaryGlow: 'rgba(99, 102, 241, 0.24)',
          accentGlow: 'rgba(45, 212, 191, 0.18)',
          brightness: 0.9,
          intensityClass: 'opacity-90',
          isBreathing: true,
        };

      case 12: // Relieved: soft calm lighting, approx 0.95 brightness
        return {
          mode: 'auto',
          colorName: 'relieved',
          primaryGlow: 'rgba(52, 211, 153, 0.26)',
          secondaryGlow: 'rgba(59, 130, 246, 0.22)',
          accentGlow: 'rgba(147, 51, 234, 0.16)',
          brightness: 0.95,
          intensityClass: 'opacity-90',
          isBreathing: true,
        };

      case 13: // Thankful: warm soft lighting, approx 1.05 brightness
        return {
          mode: 'auto',
          colorName: 'thankful',
          primaryGlow: 'rgba(251, 146, 60, 0.32)',
          secondaryGlow: 'rgba(244, 63, 94, 0.28)',
          accentGlow: 'rgba(252, 211, 77, 0.2)',
          brightness: 1.05,
          intensityClass: 'opacity-100',
          isBreathing: true,
        };

      case 15: // Remembering: soft blue/purple, approx 0.95 brightness
        return {
          mode: 'auto',
          colorName: 'remembering',
          primaryGlow: 'rgba(79, 70, 229, 0.3)',
          secondaryGlow: 'rgba(124, 58, 237, 0.26)',
          accentGlow: 'rgba(30, 58, 138, 0.2)',
          brightness: 0.95,
          intensityClass: 'opacity-90',
          isBreathing: true,
        };

      case 16: // Sleepy/Tired: very dim slow breathing glow, approx 0.55 brightness
        return {
          mode: 'auto',
          colorName: 'sleepy',
          primaryGlow: 'rgba(99, 102, 241, 0.15)',
          secondaryGlow: 'rgba(139, 92, 246, 0.12)',
          accentGlow: 'rgba(15, 23, 42, 0.1)',
          brightness: 0.55,
          intensityClass: 'opacity-60',
          isBreathing: true,
        };

      case 17: // Looking Around: calm blue/purple, approx 0.95 brightness
      case 30: // Look Toward Something: approx 0.95 brightness
        return {
          mode: 'auto',
          colorName: 'looking-around',
          primaryGlow: 'rgba(59, 130, 246, 0.25)',
          secondaryGlow: 'rgba(168, 85, 247, 0.22)',
          accentGlow: 'rgba(6, 182, 212, 0.18)',
          brightness: 0.95,
          intensityClass: 'opacity-95',
          isBreathing: true,
        };

      case 19: // Sigh / Breath: soft blue/purple, approx 0.85 brightness
        return {
          mode: 'auto',
          colorName: 'sigh',
          primaryGlow: 'rgba(147, 51, 234, 0.22)',
          secondaryGlow: 'rgba(99, 102, 241, 0.18)',
          accentGlow: 'rgba(192, 132, 252, 0.15)',
          brightness: 0.85,
          intensityClass: 'opacity-85',
          isBreathing: true,
        };

      case 6: // Listening: calm blue/purple, approx 0.95 brightness
        return {
          mode: 'auto',
          colorName: 'listening',
          primaryGlow: 'rgba(59, 130, 246, 0.28)',
          secondaryGlow: 'rgba(147, 51, 234, 0.24)',
          accentGlow: 'rgba(6, 182, 212, 0.2)',
          brightness: 0.95,
          intensityClass: 'opacity-100',
          isBreathing: true,
        };

      case 29: // Idle / Waiting: subtle neutral blue/purple ambient glow
      default:
        return {
          mode: 'auto',
          colorName: 'idle',
          primaryGlow: 'rgba(124, 58, 237, 0.24)',
          secondaryGlow: 'rgba(59, 130, 246, 0.2)',
          accentGlow: 'rgba(236, 72, 153, 0.15)',
          brightness: 0.95,
          intensityClass: 'opacity-90',
          isBreathing: true,
        };
    }
  }, [activeSessionState, activeAnimId]);

  // Combined current active light state
  const lightState = useMemo<AmbientLightState>(() => {
    if (manualState.isManual && activeSessionState !== 'disconnected') {
      return {
        mode: 'manual',
        colorName: manualState.colorName,
        primaryGlow: manualState.primary,
        secondaryGlow: manualState.secondary,
        accentGlow: manualState.accent,
        brightness: manualState.brightness,
        intensityClass: 'opacity-100',
        isBreathing: true,
      };
    }
    return emotionLight;
  }, [manualState, emotionLight, activeSessionState]);

  const setColor = useCallback((color: string) => {
    const c = color.toLowerCase().trim();
    if (c.includes('blue') || c.includes('neela')) {
      setManualState({
        isManual: true,
        colorName: 'blue',
        primary: 'rgba(37, 99, 235, 0.42)',
        secondary: 'rgba(59, 130, 246, 0.32)',
        accent: 'rgba(6, 182, 212, 0.28)',
        brightness: 1.1,
      });
    } else if (c.includes('purple') || c.includes('violet') || c.includes('baingani')) {
      setManualState({
        isManual: true,
        colorName: 'purple',
        primary: 'rgba(147, 51, 234, 0.44)',
        secondary: 'rgba(124, 58, 237, 0.35)',
        accent: 'rgba(217, 70, 239, 0.25)',
        brightness: 1.1,
      });
    } else if (c.includes('pink') || c.includes('gulabi') || c.includes('rose')) {
      setManualState({
        isManual: true,
        colorName: 'pink',
        primary: 'rgba(244, 63, 94, 0.45)',
        secondary: 'rgba(236, 72, 153, 0.38)',
        accent: 'rgba(251, 113, 133, 0.25)',
        brightness: 1.15,
      });
    } else if (c.includes('red') || c.includes('laal')) {
      setManualState({
        isManual: true,
        colorName: 'red',
        primary: 'rgba(239, 68, 68, 0.45)',
        secondary: 'rgba(220, 38, 38, 0.35)',
        accent: 'rgba(248, 113, 113, 0.22)',
        brightness: 1.1,
      });
    } else if (c.includes('cyan') || c.includes('aqua')) {
      setManualState({
        isManual: true,
        colorName: 'cyan',
        primary: 'rgba(6, 182, 212, 0.42)',
        secondary: 'rgba(14, 165, 233, 0.35)',
        accent: 'rgba(45, 212, 191, 0.25)',
        brightness: 1.1,
      });
    } else if (c.includes('green') || c.includes('hara')) {
      setManualState({
        isManual: true,
        colorName: 'green',
        primary: 'rgba(16, 185, 129, 0.4)',
        secondary: 'rgba(5, 150, 105, 0.32)',
        accent: 'rgba(52, 211, 153, 0.2)',
        brightness: 1.05,
      });
    } else if (c.includes('warm') || c.includes('amber') || c.includes('orange')) {
      setManualState({
        isManual: true,
        colorName: 'warm',
        primary: 'rgba(245, 158, 11, 0.42)',
        secondary: 'rgba(251, 146, 60, 0.32)',
        accent: 'rgba(252, 211, 77, 0.22)',
        brightness: 1.1,
      });
    } else if (c.includes('cool') || c.includes('ice') || c.includes('frost')) {
      setManualState({
        isManual: true,
        colorName: 'cool',
        primary: 'rgba(56, 189, 248, 0.4)',
        secondary: 'rgba(99, 102, 241, 0.3)',
        accent: 'rgba(147, 197, 253, 0.22)',
        brightness: 1.05,
      });
    } else if (c.includes('neutral') || c.includes('normal') || c.includes('reset') || c.includes('auto')) {
      setManualState((prev) => ({ ...prev, isManual: false }));
    }
  }, []);

  const setBrightness = useCallback((brightness: number) => {
    setManualState((prev) => ({
      ...prev,
      brightness: Math.max(0.3, Math.min(1.5, brightness)),
    }));
  }, []);

  const setMode = useCallback((mode: 'auto' | 'manual') => {
    setManualState((prev) => ({ ...prev, isManual: mode === 'manual' }));
  }, []);

  const resetToAuto = useCallback(() => {
    setManualState((prev) => ({ ...prev, isManual: false, brightness: 1.0 }));
  }, []);

  // Recognizes Hindi/Hinglish/English commands in user text / voice prompts
  const handleVoiceCommand = useCallback(
    (text: string): boolean => {
      const lower = text.toLowerCase();

      // Normal / Reset commands: "light normal kar do", "normal light", "auto light", "automatic lighting on kar do", "emotion lighting wapas karo"
      if (
        lower.includes('normal kar do') ||
        lower.includes('light normal') ||
        lower.includes('normal light') ||
        lower.includes('normal lighting') ||
        lower.includes('reset light') ||
        lower.includes('default light') ||
        lower.includes('automatic lighting') ||
        lower.includes('auto light') ||
        lower.includes('auto lighting') ||
        lower.includes('emotion lighting') ||
        lower.includes('wapas karo') ||
        lower.includes('neutral light')
      ) {
        resetToAuto();
        return true;
      }

      // Dim commands: "light dim kar do", "dim light", "thoda andhera", "brightness kam", "light thodi dim"
      if (
        lower.includes('dim kar do') ||
        lower.includes('thodi dim') ||
        lower.includes('thoda dim') ||
        lower.includes('light dim') ||
        lower.includes('dim light') ||
        lower.includes('kam light') ||
        lower.includes('brightness kam') ||
        lower.includes('make it dim') ||
        lower.includes('decrease brightness')
      ) {
        setManualState((prev) => ({ ...prev, isManual: true, brightness: 0.45 }));
        return true;
      }

      // Bright commands: "light bright kar do", "bright light", "tez light", "brightness badha do", "badhao", "badha"
      if (
        lower.includes('bright kar do') ||
        lower.includes('light bright') ||
        lower.includes('bright light') ||
        lower.includes('tez light') ||
        lower.includes('brightness badha') ||
        lower.includes('brightness badhao') ||
        lower.includes('make it bright') ||
        lower.includes('increase brightness') ||
        lower.includes('zyada light') ||
        lower.includes('light tez')
      ) {
        setManualState((prev) => ({ ...prev, isManual: true, brightness: 1.35 }));
        return true;
      }

      // Color commands:
      // "background blue kar do", "blue light kar do", "blue kar do", "background ko blue"
      if (lower.includes('blue') || lower.includes('neela') || lower.includes('neeli')) {
        setColor('blue');
        return true;
      }
      // "purple light kar do", "baingani light", "thoda purple glow"
      if (lower.includes('purple') || lower.includes('violet') || lower.includes('baingani')) {
        setColor('purple');
        return true;
      }
      // "pink glow chahiye", "pink light kar do", "gulabi"
      if (lower.includes('pink') || lower.includes('gulabi')) {
        setColor('pink');
        return true;
      }
      // "background red kar do", "laal light"
      if (lower.includes('red') || lower.includes('laal')) {
        setColor('red');
        return true;
      }
      // "warm light", "warm glow"
      if (lower.includes('warm') || lower.includes('amber')) {
        setColor('warm');
        return true;
      }
      // "cool light", "cool glow"
      if (lower.includes('cool') || lower.includes('ice')) {
        setColor('cool');
        return true;
      }
      // "cyan light kar do"
      if (lower.includes('cyan') || lower.includes('aqua')) {
        setColor('cyan');
        return true;
      }
      // "green light kar do", "hara light", "green background"
      if (lower.includes('green') || lower.includes('hara') || lower.includes('hari')) {
        setColor('green');
        return true;
      }

      return false;
    },
    [setColor, resetToAuto]
  );

  const value = useMemo(
    () => ({
      lightState,
      setColor,
      setBrightness,
      setMode,
      resetToAuto,
      handleVoiceCommand,
      updateActiveState,
    }),
    [lightState, setColor, setBrightness, setMode, resetToAuto, handleVoiceCommand, updateActiveState]
  );

  return (
    <AmbientLightingContext.Provider value={value}>
      {children}
    </AmbientLightingContext.Provider>
  );
};

export const useAmbientLighting = () => {
  const context = useContext(AmbientLightingContext);
  if (!context) {
    return {
      lightState: DEFAULT_LIGHT_STATE,
      setColor: () => {},
      setBrightness: () => {},
      setMode: () => {},
      resetToAuto: () => {},
      handleVoiceCommand: () => false,
      updateActiveState: () => {},
    };
  }
  return context;
};
