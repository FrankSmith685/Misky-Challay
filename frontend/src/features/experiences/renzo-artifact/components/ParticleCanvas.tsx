import React, { useEffect, useRef } from 'react';

interface ParticleCanvasProps {
  sceneType: 'dust' | 'sakura' | 'sunset';
  currentTime: number;
  fpsMode: 24 | 60;
  isPlaying: boolean;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  rotation: number;
  rotSpeed: number;
  flip: number;
  flipSpeed: number;
  color: string;
  swayAmp: number;
  swayFreq: number;
  phase: number;
}

export const ParticleCanvas: React.FC<ParticleCanvasProps> = ({
  sceneType,
  currentTime,
  fpsMode,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameInterval = 1000 / fpsMode;
  const lastRenderRef = useRef<number>(0);

  // Initialize particles based on scene type
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const count = sceneType === 'dust' ? 45 : sceneType === 'sakura' ? 55 : 40;
    const newParticles: Particle[] = [];
    const w = canvas.width || 1280;
    const h = canvas.height || 720;

    for (let i = 0; i < count; i++) {
      if (sceneType === 'dust') {
        newParticles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: Math.random() * 3.5 + 1.2,
          speedX: (Math.random() - 0.4) * 0.3,
          speedY: -(Math.random() * 0.4 + 0.15),
          opacity: Math.random() * 0.6 + 0.2,
          rotation: 0,
          rotSpeed: 0,
          flip: 1,
          flipSpeed: 0,
          color: Math.random() > 0.4 ? 'rgba(255, 238, 187,' : 'rgba(255, 250, 220,',
          swayAmp: Math.random() * 15 + 5,
          swayFreq: Math.random() * 0.002 + 0.001,
          phase: Math.random() * Math.PI * 2,
        });
      } else if (sceneType === 'sakura') {
        newParticles.push({
          x: Math.random() * (w + 200) - 100,
          y: Math.random() * h,
          size: Math.random() * 8 + 6,
          speedX: Math.random() * 1.4 + 0.8,
          speedY: Math.random() * 1.1 + 0.6,
          opacity: Math.random() * 0.5 + 0.45,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.03,
          flip: Math.random(),
          flipSpeed: (Math.random() - 0.5) * 0.04,
          color: Math.random() > 0.3 ? 'rgba(255, 204, 213,' : 'rgba(255, 225, 232,',
          swayAmp: Math.random() * 25 + 10,
          swayFreq: Math.random() * 0.003 + 0.001,
          phase: Math.random() * Math.PI * 2,
        });
      } else {
        // Sunset fireflies & golden meadow sparkles
        newParticles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: Math.random() * 3.8 + 1.5,
          speedX: (Math.random() - 0.45) * 0.5,
          speedY: -(Math.random() * 0.35 + 0.1),
          opacity: Math.random() * 0.7 + 0.25,
          rotation: Math.random() * Math.PI,
          rotSpeed: 0.01,
          flip: 1,
          flipSpeed: 0,
          color: Math.random() > 0.5 ? 'rgba(255, 215, 120,' : 'rgba(255, 180, 90,',
          swayAmp: Math.random() * 12 + 4,
          swayFreq: Math.random() * 0.002 + 0.001,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    particlesRef.current = newParticles;
  }, [sceneType]);

  // Main animation render loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const render = (now: number) => {
      animId = requestAnimationFrame(render);

      // FPS throttle for authentic 24fps anime cadence if enabled
      if (now - lastRenderRef.current < frameInterval) {
        return;
      }
      lastRenderRef.current = now;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Render warm subtle sunbeams for Scene 1 or sunset glow for Scene 3
      if (sceneType === 'dust') {
        const grad = ctx.createLinearGradient(0, 0, w * 0.6, h);
        grad.addColorStop(0, 'rgba(255, 245, 215, 0.08)');
        grad.addColorStop(0.5, 'rgba(255, 235, 190, 0.04)');
        grad.addColorStop(1, 'rgba(255, 230, 180, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(w * 0.15, 0);
        ctx.lineTo(w * 0.65, 0);
        ctx.lineTo(w * 0.9, h);
        ctx.lineTo(w * 0.35, h);
        ctx.closePath();
        ctx.fill();
      } else if (sceneType === 'sunset' && currentTime >= 7.0) {
        // Soft celebratory warm aura
        const glow = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, w * 0.55);
        glow.addColorStop(0, 'rgba(255, 235, 180, 0.12)');
        glow.addColorStop(0.6, 'rgba(255, 200, 140, 0.06)');
        glow.addColorStop(1, 'rgba(255, 180, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }

      const particles = particlesRef.current;
      particles.forEach(p => {
        if (isPlaying) {
          p.phase += p.swayFreq * 16;
          p.x += p.speedX + Math.sin(p.phase) * 0.4;
          p.y += p.speedY;
          p.rotation += p.rotSpeed;
          p.flip = Math.sin(p.phase * 1.5);

          // Wrap boundaries
          if (sceneType === 'sakura') {
            if (p.x > w + 50) p.x = -40;
            if (p.y > h + 40) {
              p.y = -30;
              p.x = Math.random() * (w + 100) - 50;
            }
          } else {
            if (p.y < -30) p.y = h + 20;
            if (p.x < -20) p.x = w + 20;
            if (p.x > w + 20) p.x = -20;
          }
        }

        ctx.save();
        ctx.translate(p.x, p.y);

        if (sceneType === 'sakura') {
          ctx.rotate(p.rotation);
          ctx.scale(1, Math.abs(p.flip) * 0.8 + 0.2);

          // Draw hand-drawn sakura petal shape
          ctx.fillStyle = `${p.color} ${p.opacity})`;
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.bezierCurveTo(p.size * 0.8, -p.size * 0.7, p.size * 0.8, p.size * 0.4, 0, p.size);
          ctx.bezierCurveTo(-p.size * 0.8, p.size * 0.4, -p.size * 0.8, -p.size * 0.7, 0, -p.size);
          ctx.fill();

          // Subtle petal vein
          ctx.strokeStyle = `rgba(240, 170, 185, ${p.opacity * 0.6})`;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 0.6);
          ctx.lineTo(0, p.size * 0.6);
          ctx.stroke();
        } else if (sceneType === 'dust') {
          // Soft golden dust mote with radial gradient
          const rad = p.size;
          const radial = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
          radial.addColorStop(0, `${p.color} ${p.opacity})`);
          radial.addColorStop(0.5, `${p.color} ${p.opacity * 0.4})`);
          radial.addColorStop(1, `${p.color} 0)`);

          ctx.fillStyle = radial;
          ctx.beginPath();
          ctx.arc(0, 0, rad * 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Sunset meadow firefly / sparkle
          const pulse = Math.sin(p.phase * 2) * 0.3 + 0.7;
          const rad = p.size * pulse;
          const radial = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 1.8);
          radial.addColorStop(0, `rgba(255, 255, 230, ${p.opacity * pulse})`);
          radial.addColorStop(0.4, `${p.color} ${p.opacity * pulse * 0.7})`);
          radial.addColorStop(1, `${p.color} 0)`);

          ctx.fillStyle = radial;
          ctx.beginPath();
          ctx.arc(0, 0, rad * 1.8, 0, Math.PI * 2);
          ctx.fill();

          // Delicate 4-point sparkle cross
          if (pulse > 0.85) {
            ctx.strokeStyle = `rgba(255, 245, 200, ${(pulse - 0.85) * 4 * p.opacity})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-rad * 1.5, 0);
            ctx.lineTo(rad * 1.5, 0);
            ctx.moveTo(0, -rad * 1.5);
            ctx.lineTo(0, rad * 1.5);
            ctx.stroke();
          }
        }

        ctx.restore();
      });
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [sceneType, fpsMode, frameInterval, isPlaying, currentTime]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
    />
  );
};
