import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { SessionState } from '../types';

interface AuraVisualizerProps {
  state: SessionState;
  userVolume: number;
  aiVolume: number;
  frequencies: Uint8Array;
}

export const AuraVisualizer: React.FC<AuraVisualizerProps> = ({
  state,
  userVolume,
  aiVolume,
  frequencies,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      phase += 0.03;

      // Base radius calculation
      let baseRadius = 85;
      let energy = 0;

      if (state === 'speaking') {
        energy = Math.max(0.2, aiVolume * 2.5);
        baseRadius = 85 + energy * 45;
      } else if (state === 'listening') {
        energy = Math.max(0.08, userVolume * 2.0);
        baseRadius = 85 + energy * 35;
      } else if (state === 'connecting') {
        energy = 0.3 + Math.sin(phase * 2) * 0.15;
        baseRadius = 80;
      } else {
        // Disconnected / idle
        energy = 0.05 + Math.sin(phase * 0.8) * 0.03;
        baseRadius = 80;
      }

      // 1. Draw outer ambient radiant glow
      const glowGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.4,
        centerX,
        centerY,
        baseRadius * 2.2
      );

      if (state === 'speaking') {
        glowGrad.addColorStop(0, 'rgba(236, 72, 153, 0.45)'); // Rose pink
        glowGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.25)'); // Purple
        glowGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
      } else if (state === 'listening') {
        glowGrad.addColorStop(0, 'rgba(6, 182, 212, 0.4)'); // Cyan
        glowGrad.addColorStop(0.5, 'rgba(59, 130, 246, 0.2)'); // Blue
        glowGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      } else if (state === 'connecting') {
        glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.35)'); // Amber
        glowGrad.addColorStop(0.6, 'rgba(239, 68, 68, 0.15)');
        glowGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        glowGrad.addColorStop(0, 'rgba(115, 115, 115, 0.15)');
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw dynamic frequency wave rings around the orb
      const numPoints = 64;
      const angleStep = (Math.PI * 2) / numPoints;

      ctx.beginPath();
      for (let i = 0; i <= numPoints; i++) {
        const angle = i * angleStep;
        const freqIdx = i % frequencies.length;
        const freqVal = state === 'speaking' ? frequencies[freqIdx] / 255 : 0;

        // Wave distortion based on sine harmonics and audio frequency
        const wave1 = Math.sin(angle * 4 + phase) * 6 * (energy + 0.2);
        const wave2 = Math.cos(angle * 7 - phase * 1.5) * 4 * (energy + 0.1);
        const freqOffset = freqVal * 30;

        const r = baseRadius + wave1 + wave2 + freqOffset;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();

      // Fluid orb fill gradient
      const orbGrad = ctx.createRadialGradient(
        centerX - baseRadius * 0.2,
        centerY - baseRadius * 0.2,
        baseRadius * 0.1,
        centerX,
        centerY,
        baseRadius
      );

      if (state === 'speaking') {
        orbGrad.addColorStop(0, '#fbcfe8'); // bright pink core
        orbGrad.addColorStop(0.3, '#f43f5e'); // rose
        orbGrad.addColorStop(0.7, '#a855f7'); // purple
        orbGrad.addColorStop(1, '#6b21a8');
      } else if (state === 'listening') {
        orbGrad.addColorStop(0, '#a5f3fc'); // bright cyan core
        orbGrad.addColorStop(0.3, '#06b6d4'); // cyan
        orbGrad.addColorStop(0.7, '#3b82f6'); // blue
        orbGrad.addColorStop(1, '#1e3a8a');
      } else if (state === 'connecting') {
        orbGrad.addColorStop(0, '#fef08a');
        orbGrad.addColorStop(0.4, '#f59e0b');
        orbGrad.addColorStop(1, '#78350f');
      } else {
        orbGrad.addColorStop(0, '#525252');
        orbGrad.addColorStop(0.6, '#262626');
        orbGrad.addColorStop(1, '#0a0a0a');
      }

      ctx.fillStyle = orbGrad;
      ctx.fill();

      // Outer rim stroke with holographic sheen
      ctx.lineWidth = 2.5;
      if (state === 'speaking') {
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.8)';
      } else if (state === 'listening') {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
      } else if (state === 'connecting') {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
      } else {
        ctx.strokeStyle = 'rgba(115, 115, 115, 0.4)';
      }
      ctx.stroke();

      // 3. Draw inner concentric organic pulses
      const innerRadius = baseRadius * 0.55;
      ctx.beginPath();
      for (let i = 0; i <= numPoints; i++) {
        const angle = i * angleStep;
        const innerWave = Math.cos(angle * 5 - phase * 2) * 5 * (energy + 0.1);
        const r = innerRadius + innerWave;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [state, userVolume, aiVolume, frequencies]);

  return (
    <div className="relative flex items-center justify-center w-80 h-80 sm:w-96 sm:h-96">
      {/* Background ambient circular rings with motion */}
      <motion.div
        animate={{
          scale: state === 'speaking' ? [1, 1.08, 1] : state === 'listening' ? [1, 1.04, 1] : 1,
          opacity: state === 'speaking' ? 0.8 : state === 'listening' ? 0.6 : 0.2,
          rotate: 360,
        }}
        transition={{
          scale: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
          rotate: { duration: 25, repeat: Infinity, ease: 'linear' },
        }}
        className={`absolute inset-0 rounded-full border border-dashed pointer-events-none ${
          state === 'speaking'
            ? 'border-pink-500/30'
            : state === 'listening'
            ? 'border-cyan-500/30'
            : 'border-neutral-800'
        }`}
      />

      {/* Outer secondary dotted ring */}
      <motion.div
        animate={{
          rotate: -360,
        }}
        transition={{
          duration: 35,
          repeat: Infinity,
          ease: 'linear',
        }}
        className="absolute inset-6 rounded-full border border-dotted border-white/10 pointer-events-none"
      />

      {/* Main Canvas Visualizer */}
      <canvas
        ref={canvasRef}
        width={384}
        height={384}
        className="w-full h-full drop-shadow-[0_0_35px_rgba(236,72,153,0.25)]"
      />
    </div>
  );
};
