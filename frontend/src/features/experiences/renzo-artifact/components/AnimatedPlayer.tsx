import React, { useMemo } from 'react';
import { SceneData, VisualStyle } from '../types/video';
import { ParticleCanvas } from './ParticleCanvas';
import { Sparkles, Heart } from 'lucide-react';

interface AnimatedPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  visualStyle: VisualStyle;
  fpsMode: 24 | 60;
  aspectRatio: '16:9' | '9:16' | 'cinema';
  scenes: SceneData[];
  onTogglePlay: () => void;
}

export const AnimatedPlayer: React.FC<AnimatedPlayerProps> = ({
  currentTime,
  isPlaying,
  visualStyle,
  fpsMode,
  aspectRatio,
  scenes,
  onTogglePlay,
}) => {
  // Determine active scene based on currentTime
  const currentSceneIndex = useMemo(() => {
    if (currentTime < 3.0) return 0;
    if (currentTime < 6.0) return 1;
    return 2;
  }, [currentTime]);

  const activeScene = scenes[currentSceneIndex];

  // Calculate normalized progress within the active scene (0.0 to 1.0)
  const sceneProgress = useMemo(() => {
    const sceneDuration = activeScene.endTime - activeScene.startTime;
    const elapsed = Math.max(0, currentTime - activeScene.startTime);
    return Math.min(1, elapsed / sceneDuration);
  }, [currentTime, activeScene]);

  // Compute camera transform (Ken Burns effect)
  const cameraTransform = useMemo(() => {
    // Smooth easeInOut curve
    const easeProgress = 0.5 - 0.5 * Math.cos(sceneProgress * Math.PI);
    const scale = activeScene.cameraStart.scale + (activeScene.cameraEnd.scale - activeScene.cameraStart.scale) * easeProgress;
    const x = activeScene.cameraStart.x + (activeScene.cameraEnd.x - activeScene.cameraStart.x) * easeProgress;
    const y = activeScene.cameraStart.y + (activeScene.cameraEnd.y - activeScene.cameraStart.y) * easeProgress;
    return `scale(${scale}) translate(${x}%, ${y}%)`;
  }, [sceneProgress, activeScene]);

  // Determine transition crossfade opacity between scenes (0.3s window around 3.0s and 6.0s)
  const transitionWarmth = useMemo(() => {
    if (currentTime > 2.85 && currentTime < 3.15) {
      const dist = Math.abs(currentTime - 3.0) / 0.15;
      return 1 - dist;
    }
    if (currentTime > 5.85 && currentTime < 6.15) {
      const dist = Math.abs(currentTime - 6.0) / 0.15;
      return 1 - dist;
    }
    return 0;
  }, [currentTime]);

  // Typography reveal progress for Scene 3 (7.2s - 10.0s)
  const typographyState = useMemo(() => {
    if (currentTime < 7.0) return { showText1: false, showText2: false, opacity1: 0, opacity2: 0 };
    
    // Text 1: "El mejor regalo es tener una gran familia" starts at 7.1s, fully visible by 7.8s
    const progress1 = Math.min(1, Math.max(0, (currentTime - 7.1) / 0.7));
    
    // Text 2: "¡Feliz Cumpleaños, Renzo!" starts at 8.0s, fully visible by 8.7s
    const progress2 = Math.min(1, Math.max(0, (currentTime - 8.0) / 0.7));

    return {
      showText1: currentTime >= 7.1,
      showText2: currentTime >= 8.0,
      opacity1: progress1,
      opacity2: progress2,
    };
  }, [currentTime]);

  // Aspect ratio container classes
  const aspectClass = useMemo(() => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16] max-h-[80vh] mx-auto';
      case 'cinema':
        return 'aspect-[2.39/1] w-full';
      case '16:9':
      default:
        return 'aspect-[16/9] w-full';
    }
  }, [aspectRatio]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-stone-950 shadow-2xl transition-all duration-300 border border-stone-800/80 group select-none ${aspectClass}`}
      onClick={onTogglePlay}
    >
      {/* Visual Render Layers */}
      {scenes.map((scene, idx) => {
        const isActive = idx === currentSceneIndex;
        return (
          <div
            key={scene.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out pointer-events-none ${
              isActive ? 'opacity-100 z-0' : 'opacity-0 z-[-1]'
            }`}
          >
            {/* Split Screen Mode */}
            {visualStyle === 'split' ? (
              <div className="relative w-full h-full flex">
                {/* Left: Ghibli anime */}
                <div className="w-1/2 h-full overflow-hidden relative border-r border-amber-300/40">
                  <img
                    src={scene.ghibliImg}
                    alt={scene.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover will-change-transform"
                    style={{
                      transform: isActive ? cameraTransform : undefined,
                      transition: fpsMode === 24 ? 'transform 41ms linear' : 'transform 16ms linear',
                    }}
                  />
                  <div className="absolute top-3 left-3 bg-brand-900/80 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-medium text-white border border-brand-200/60">
                    Acuarela Ghibli
                  </div>
                </div>

                {/* Right: Real photo */}
                <div className="w-1/2 h-full overflow-hidden relative">
                  <img
                    src={scene.realImg}
                    alt={scene.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover filter contrast-105 saturate-110 will-change-transform"
                    style={{
                      transform: isActive ? cameraTransform : undefined,
                      transition: fpsMode === 24 ? 'transform 41ms linear' : 'transform 16ms linear',
                    }}
                  />
                  <div className="absolute top-3 right-3 bg-brand-900/80 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-medium text-white border border-brand-200/60">
                    Memoria Real
                  </div>
                </div>
              </div>
            ) : visualStyle === 'real' ? (
              /* Real Photos Mode */
              <div className="w-full h-full overflow-hidden relative">
                <img
                  src={scene.realImg}
                  alt={scene.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover filter sepia-[0.15] contrast-[1.04] brightness-[1.02] will-change-transform"
                  style={{
                    transform: isActive ? cameraTransform : undefined,
                    transition: fpsMode === 24 ? 'transform 41ms linear' : 'transform 16ms linear',
                  }}
                />
                {/* Filmic warm golden hour tint */}
                <div className="absolute inset-0 bg-gradient-to-t from-amber-950/40 via-amber-900/10 to-transparent pointer-events-none" />
              </div>
            ) : (
              /* Ghibli Hand-drawn Watercolor Mode (Default) */
              <div className="w-full h-full overflow-hidden relative">
                <img
                  src={scene.ghibliImg}
                  alt={scene.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover will-change-transform"
                  style={{
                    transform: isActive ? cameraTransform : undefined,
                    transition: fpsMode === 24 ? 'transform 41ms linear' : 'transform 16ms linear',
                  }}
                />

                {/* Picture-in-Picture Polaroid / Keepsake overlay */}
                {visualStyle === 'pip' && (
                  <div className="absolute bottom-6 right-6 w-36 sm:w-48 bg-amber-50/95 p-2 rounded-lg shadow-2xl border border-amber-200/60 rotate-2 hover:rotate-0 transition-transform duration-300 pointer-events-auto">
                    <div className="aspect-square w-full overflow-hidden rounded bg-stone-200 shadow-inner">
                      <img
                        src={scene.realImg}
                        alt="Memoria Original"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="mt-1.5 text-center">
                      <span className="font-handwriting text-sm text-stone-700 tracking-wide font-semibold block">
                        {scene.title}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 24fps Particle System Canvas Overlay (Dust, Sakura petals, Sunset glow) */}
      <ParticleCanvas
        sceneType={activeScene.particles}
        currentTime={currentTime}
        fpsMode={fpsMode}
        isPlaying={isPlaying}
      />

      {/* Cinematic Vignette & Soft Golden Light Flash during Transitions */}
      <div className="absolute inset-0 vignette-cinematic pointer-events-none z-10" />
      {transitionWarmth > 0 && (
        <div
          className="absolute inset-0 bg-amber-100 pointer-events-none z-15 transition-opacity"
          style={{ opacity: transitionWarmth * 0.35 }}
        />
      )}

      {/* Typography Overlay for Scene 3 (0:07 - 0:10) */}
      {currentSceneIndex === 2 && typographyState.showText1 && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          {/* Subtle dark backdrop glow to ensure maximum readability */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-brand-900/70 via-brand-900/40 to-brand-900/10 backdrop-blur-[1px] transition-opacity duration-1000"
            style={{ opacity: Math.max(typographyState.opacity1, typographyState.opacity2) * 0.85 }}
          />

          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            {/* Line 1: "El mejor regalo es tener una gran familia" */}
            <div
              className="transform transition-all duration-1000 ease-out"
              style={{
                opacity: typographyState.opacity1,
                transform: `translateY(${(1 - typographyState.opacity1) * 15}px)`,
              }}
            >
              <div className="inline-flex items-center gap-2 mb-1 text-brand-100 text-xs sm:text-sm tracking-widest uppercase font-semibold">
                <Heart className="w-3.5 h-3.5 fill-brand-200 text-brand-100" />
                <span>Un mensaje del corazón</span>
                <Heart className="w-3.5 h-3.5 fill-brand-200 text-brand-100" />
              </div>
              <h2 className="font-handwriting text-3xl sm:text-5xl md:text-6xl text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] font-bold tracking-wide leading-tight">
                “El mejor regalo es tener una gran familia”
              </h2>
            </div>

            {/* Line 2: "¡Feliz Cumpleaños, Renzo!" */}
            {typographyState.showText2 && (
              <div
                className="transform transition-all duration-1000 ease-out pt-2"
                style={{
                  opacity: typographyState.opacity2,
                  transform: `translateY(${(1 - typographyState.opacity2) * 20}px) scale(${
                    0.95 + typographyState.opacity2 * 0.05
                  })`,
                }}
              >
                <div className="relative inline-block">
                  <h1 className="font-handwriting text-4xl sm:text-6xl md:text-7xl font-bold bg-gradient-to-r from-brand-100 via-white to-brand-200 bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(31,72,111,0.5)]">
                    ¡Feliz Cumpleaños, Renzo!
                  </h1>
                  <Sparkles className="absolute -top-3 -right-6 w-6 h-6 text-brand-100 animate-pulse" />
                  <Sparkles className="absolute -bottom-2 -left-6 w-5 h-5 text-brand-200 animate-pulse delay-300" />
                </div>
                <p className="mt-3 text-brand-50 text-sm sm:text-base font-medium max-w-lg mx-auto font-sans-ui drop-shadow-md">
                  Hoy celebramos tu vida, tu entrega y el infinito amor que compartes con nosotros cada día.
                </p>

                {/* Misky Challay Digital Bakery Concept Outro Logo Badge (fades in at 8.6s) */}
                {currentTime >= 8.5 && (
                  <div
                    className="mt-6 inline-flex items-center gap-3.5 bg-brand-900/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-brand-200/60 shadow-2xl transition-all duration-700 transform"
                    style={{
                      opacity: Math.min(1, (currentTime - 8.5) / 0.8),
                      transform: `translateY(${(1 - Math.min(1, (currentTime - 8.5) / 0.8)) * 10}px)`,
                    }}
                  >
                    <div className="bg-white rounded-xl p-1 shadow-md shrink-0">
                      <img
                        src="/assets/aistudio/WhatsApp_Image_2026-11-05_at_22.50.19_6cc9e389.jpeg"
                        alt="Misky Challay Pasteler-IA Artesanal"
                        className="h-9 sm:h-11 w-auto object-contain"
                      />
                    </div>
                    <div className="text-left font-sans-ui">
                      <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-100">
                          Experiencia Conceptual
                        </span>
                        <span className="text-stone-500 text-[10px]">·</span>
                        <span className="text-[10px] text-brand-50 font-medium">Pasteler-IA Artesanal</span>
                      </div>
                      <p className="text-[11px] text-brand-100 font-medium">
                        Endulzando momentos únicos con arte & tecnología
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Play/Pause Overlay Touch Target */}
      <div
        className="absolute inset-0 z-15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
        aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
      >
        <div className="bg-brand-900/75 hover:bg-brand-900/90 backdrop-blur-md p-4 rounded-full border border-brand-200/60 text-white shadow-2xl transform group-hover:scale-105 transition-all">
          {isPlaying ? (
            <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};
