import React from 'react';
import { useAmbientLighting } from '../context/AmbientLightingContext';

export const AmbientBackground: React.FC = () => {
  const { lightState } = useAmbientLighting();

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 transition-all duration-700 ease-out">
      {/* Primary Top Radial Glow */}
      <div
        className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[120vw] h-[80vh] rounded-full blur-[120px] transition-all duration-700 ease-out"
        style={{
          background: `radial-gradient(ellipse at center, ${lightState.primaryGlow} 0%, transparent 70%)`,
          opacity: lightState.brightness,
          transform: `translate(-50%, 0) scale(${lightState.brightness > 1 ? 1.08 : 1})`,
        }}
      />

      {/* Secondary Center Ambient Aura behind character */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-[580px] h-[55vh] rounded-full blur-[90px] transition-all duration-700 ease-out"
        style={{
          background: `radial-gradient(circle at center, ${lightState.secondaryGlow} 0%, transparent 65%)`,
          opacity: lightState.brightness * 0.9,
        }}
      />

      {/* Subtle Starfield matching Frame 00:00 */}
      <div className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none">
        {[
          { top: '12%', left: '15%', size: 'w-1 h-1', delay: '0s' },
          { top: '22%', left: '80%', size: 'w-1.5 h-1.5', delay: '1.2s' },
          { top: '35%', left: '25%', size: 'w-1 h-1', delay: '2.5s' },
          { top: '48%', left: '85%', size: 'w-1 h-1', delay: '0.8s' },
          { top: '65%', left: '18%', size: 'w-1.5 h-1.5', delay: '1.9s' },
          { top: '72%', left: '78%', size: 'w-1 h-1', delay: '3.1s' },
          { top: '82%', left: '30%', size: 'w-1 h-1', delay: '0.4s' },
          { top: '88%', left: '68%', size: 'w-1 h-1', delay: '2.1s' },
          { top: '18%', left: '50%', size: 'w-1 h-1', delay: '1.5s' },
        ].map((star, i) => (
          <div
            key={i}
            className={`absolute rounded-full bg-cyan-200 shadow-[0_0_6px_rgba(255,255,255,0.8)] animate-pulse ${star.size}`}
            style={{
              top: star.top,
              left: star.left,
              animationDelay: star.delay,
              animationDuration: '3s',
            }}
          />
        ))}
      </div>

      {/* Dark Space Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(5,6,11,0.8)_100%)]" />
    </div>
  );
};
