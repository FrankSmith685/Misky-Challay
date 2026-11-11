/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SCENES } from './data/scenes';
import { VisualStyle } from './types/video';
import { AnimatedPlayer } from './components/AnimatedPlayer';
import { TimelineControls } from './components/TimelineControls';
import { GalleryComparison } from './components/GalleryComparison';
import { MemoryCardModal } from './components/MemoryCardModal';
import { VideoExporter } from './components/VideoExporter';
import { soundtrack } from './services/soundtrack';
import { Sparkles, Heart, Gift, Play, Music } from 'lucide-react';

export default function App() {
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [fpsMode] = useState<24 | 60>(24);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | 'cinema'>('16:9');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('ghibli');
  const [isCardOpen, setIsCardOpen] = useState<boolean>(false);

  const duration = 10.0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  // Synchronize soundtrack playback with video state
  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        // Start or resume audio from current offset
        soundtrack.playFrom(currentTime >= duration ? 0 : currentTime);
        if (currentTime >= duration) {
          setCurrentTime(0);
        }
      } else {
        soundtrack.stop();
      }
      return next;
    });
  }, [currentTime, duration]);

  const handleSeek = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    setCurrentTime(clamped);
    if (isPlaying) {
      soundtrack.playFrom(clamped);
    }
  }, [duration, isPlaying]);

  const handleRestart = useCallback(() => {
    setCurrentTime(0);
    if (isPlaying) {
      soundtrack.playFrom(0);
    }
  }, [isPlaying]);

  const handleToggleMute = useCallback(() => {
    const muted = soundtrack.toggleMute();
    setIsMuted(muted);
  }, []);

  const handleChangeVolume = useCallback((val: number) => {
    setVolume(val);
    soundtrack.setVolume(val);
    if (val > 0 && isMuted) {
      soundtrack.toggleMute();
      setIsMuted(false);
    }
  }, [isMuted]);

  // Main high-precision animation loop
  useEffect(() => {
    let animId: number;

    const tick = (now: number) => {
      if (lastTimestampRef.current !== null && isPlaying) {
        const delta = (now - lastTimestampRef.current) / 1000;
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= duration) {
            setIsPlaying(false);
            soundtrack.stop();
            return duration;
          }
          return next;
        });
      }
      lastTimestampRef.current = now;
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      lastTimestampRef.current = null;
    };
  }, [isPlaying, duration]);

  // Fullscreen support
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in inputs or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(currentTime - 0.5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeek(currentTime + 0.5);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, handleSeek, handleToggleMute, currentTime]);

  return (
    <div className="renzo-artifact min-h-screen overflow-x-hidden bg-stone-950 text-stone-100 flex flex-col font-sans-ui selection:bg-amber-500/20 selection:text-amber-200">
      {/* Top Bar Contract: 1 row, 3 zones (Brand wordmark — Nav links — 1 primary action) */}
      <header className="sticky top-0 z-40 bg-stone-950/90 backdrop-blur-md border-b border-stone-800/80 px-3 py-3 sm:px-6 sm:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#"
            className="flex items-center gap-2.5 font-serif-display text-lg sm:text-xl font-bold tracking-tight text-amber-100 hover:text-amber-200 transition-colors whitespace-nowrap shrink-0"
          >
            <div className="h-8 w-8 rounded-lg overflow-hidden bg-white p-0.5 shadow-sm border border-amber-300/60">
              <img
                src="/assets/aistudio/WhatsApp_Image_2026-11-05_at_22.50.19_6cc9e389.jpeg"
                alt="Misky Challay"
                className="w-full h-full object-contain"
              />
            </div>
            <span>Misky Challay</span>
            <span className="text-brand-600 font-normal">·</span>
            <span className="hidden font-sans-ui text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200 sm:inline">
              Pasteler-IA
            </span>
          </a>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-400">
            <a href="#video-theater" className="hover:text-amber-200 transition-colors whitespace-nowrap shrink-0">
              Película Animada
            </a>
            <a href="#capitulos" className="hover:text-amber-200 transition-colors whitespace-nowrap shrink-0">
              Capítulos
            </a>
            <a href="#experiencia-pasteleria" className="hover:text-amber-200 transition-colors whitespace-nowrap shrink-0">
              Experiencia Pasteler-IA
            </a>
            <a href="#dedicatoria" className="hover:text-amber-200 transition-colors whitespace-nowrap shrink-0">
              Dedicatoria
            </a>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsCardOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all shadow-md active:scale-95 whitespace-nowrap shrink-0"
            >
              <Gift className="w-4 h-4" />
              <span className="hidden sm:inline">Tarjeta &amp; Pastel</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Header Presentation */}
      <div className="border-b border-stone-900 bg-gradient-to-b from-stone-900/40 via-stone-950 to-stone-950 px-3 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-8">
        <div className="max-w-6xl mx-auto text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs text-amber-400/90 font-semibold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Homenaje de Amor en Acuarela 2D</span>
            <Sparkles className="w-3.5 h-3.5" />
          </div>

          <h1 className="mx-auto max-w-3xl break-words font-serif-display text-2xl font-bold leading-tight tracking-tight text-stone-50 sm:text-4xl md:text-5xl">
            “El mejor regalo es tener una gran familia”
          </h1>

          <p className="font-handwriting text-2xl sm:text-3xl text-amber-300/90 font-medium">
            ¡Feliz Cumpleaños, Renzo!
          </p>

          <p className="text-stone-400 text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed">
            Una animación cinematográfica inspirada en el universo nostálgico de Studio Ghibli, 
            acompañada por piano acústico y cuerdas, rindiendo homenaje al amor incondicional entre padre, madre e hija.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-7 px-3 py-6 sm:space-y-10 sm:px-6 sm:py-8">
        {/* Cinema Video Theater Section */}
        <section id="video-theater" ref={containerRef} className="space-y-4">
          <AnimatedPlayer
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            visualStyle={visualStyle}
            fpsMode={fpsMode}
            aspectRatio={aspectRatio}
            scenes={SCENES}
            onTogglePlay={handleTogglePlay}
          />

          {/* Primary Timeline Controls Bar */}
          <TimelineControls
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            volume={volume}
            isMuted={isMuted}
            aspectRatio={aspectRatio}
            visualStyle={visualStyle}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onRestart={handleRestart}
            onToggleMute={handleToggleMute}
            onChangeVolume={handleChangeVolume}
            onChangeAspectRatio={setAspectRatio}
            onChangeStyle={setVisualStyle}
            onToggleFullscreen={handleToggleFullscreen}
          />

          {/* Soundtrack Ambient Note */}
          <div className="flex flex-col items-start gap-2 px-1 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-3">
            <div className="flex items-start gap-2">
              <Music className="w-3.5 h-3.5 text-amber-500" />
              <span>Banda Sonora Original: Piano acústico y ensamble de cuerdas emotivas (Joe Hisaishi style).</span>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <span>Atajos: [Espacio] Play/Pause</span>
              <span>[← / →] Adelantar/Retroceder</span>
              <span>[M] Silencio</span>
              <span>[F] Pantalla Completa</span>
            </div>
          </div>
        </section>

        {/* Video Exporter & Sharing Banner */}
        <VideoExporter scenes={SCENES} onOpenCard={() => setIsCardOpen(true)} />

        {/* Story Chapters & Side-by-Side Comparison */}
        <section id="capitulos">
          <GalleryComparison
            scenes={SCENES}
            onSelectScene={(time) => {
              handleSeek(time);
              if (!isPlaying) handleTogglePlay();
            }}
            activeTime={currentTime}
          />
        </section>

        {/* Misky Challay Digital Bakery Conceptual Experience Section */}
        <section id="experiencia-pasteleria" className="bg-stone-900/90 border border-stone-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Experiencia Conceptual Misky Challay</span>
              </div>

              <h3 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-100 leading-snug">
                Pasteler-IA Artesanal: Donde el Sabor se Une con tus Recuerdos
              </h3>

              <p className="text-stone-300 text-sm leading-relaxed">
                Este video animado y tarjeta personalizada son una muestra real de nuestra <strong>Experiencia Conceptual</strong>. En Misky Challay no solo elaboramos pasteles de alta repostería; convertimos los momentos más memorables de nuestros clientes en historias vivientes a través de arte generativo, música y realidad aumentada.
              </p>

              {/* 3 Pillars from Logo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="bg-stone-950/70 p-3.5 rounded-xl border border-stone-800">
                  <span className="text-xs font-bold text-amber-300 block mb-1">01. Diseña</span>
                  <p className="text-[11px] text-stone-400 leading-tight">
                    Envía las fotos familiares que marcaron la vida del agasajado.
                  </p>
                </div>
                <div className="bg-stone-950/70 p-3.5 rounded-xl border border-stone-800">
                  <span className="text-xs font-bold text-amber-300 block mb-1">02. IA lo Perfecciona</span>
                  <p className="text-[11px] text-stone-400 leading-tight">
                    Nuestra IA transforma los recuerdos en animación Ghibli y música.
                  </p>
                </div>
                <div className="bg-stone-950/70 p-3.5 rounded-xl border border-stone-800">
                  <span className="text-xs font-bold text-amber-300 block mb-1">03. Experiencia AR</span>
                  <p className="text-[11px] text-stone-400 leading-tight">
                    El pastel llega con un código QR para vivir la emoción en familia.
                  </p>
                </div>
              </div>
            </div>

            {/* Logo Display Showcase Card */}
            <div className="w-full lg:w-auto shrink-0 flex flex-col items-center">
              <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-2xl border-4 border-amber-300/80 max-w-sm transform hover:scale-[1.02] transition-transform duration-300">
                <img
                  src="/assets/aistudio/WhatsApp_Image_2026-11-05_at_22.50.19_6cc9e389.jpeg"
                  alt="Misky Challay Pasteler-IA Artesanal"
                  className="w-64 sm:w-72 h-auto object-contain"
                />
                <div className="mt-3 pt-3 border-t border-amber-100 text-center">
                  <span className="text-xs font-bold text-stone-800 block">
                    Misky Challay · Pasteler-IA Artesanal
                  </span>
                  <span className="text-[10px] text-stone-500 block">
                    Concepto Exclusivo de Regalo para Clientes
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Heartfelt Dedication Card Banner */}
        <section id="dedicatoria" className="bg-gradient-to-r from-amber-950/40 via-stone-900 to-amber-950/40 border border-amber-900/40 rounded-3xl p-6 sm:p-10 relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
              <Heart className="w-4 h-4 fill-amber-400" />
              <span>Dedicatoria Especial para Renzo</span>
            </div>

            <h3 className="font-handwriting text-3xl sm:text-4xl text-amber-100 font-bold leading-snug">
              “Gracias por cada abrazo, por enseñarme a sonreír y por caminar siempre a mi lado.”
            </h3>

            <p className="text-stone-300 text-sm leading-relaxed">
              Los mejores recuerdos no solo se quedan en fotografías; se guardan en el corazón para siempre. 
              Esta animación celebra tu entrega, tu ternura como papá y el amor infinito de nuestra familia.
            </p>

            <div className="!hidden pt-2 flex flex-wrap items-center gap-4">
              <button
                onClick={() => setIsCardOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2"
              >
                <Gift className="w-4 h-4" />
                <span>Ver y Personalizar Carta de Cumpleaños</span>
              </button>

              <button
                onClick={() => {
                  handleSeek(6.0);
                  if (!isPlaying) handleTogglePlay();
                }}
                className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition-colors flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Ver Escena Final con Mensaje (0:06)</span>
              </button>
            </div>
          </div>

          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950 py-8 px-6 text-stone-500 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-serif-display text-amber-200 font-semibold">Misky Challay</span>
            <span>·</span>
            <span>Pasteler-IA Artesanal</span>
            <span>·</span>
            <span className="text-stone-400">¡Feliz Cumpleaños, Renzo!</span>
          </div>
          <div className="text-stone-600">
            Experiencia Conceptual de Regalo Digital & Pastel Artesanal
          </div>
        </div>
      </footer>

      {/* Memory Birthday Card Modal */}
      <MemoryCardModal isOpen={isCardOpen} onClose={() => setIsCardOpen(false)} />
    </div>
  );
}
