/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { mergeArtifactTemplate, RENZO_TEMPLATE, type RenzoRuntimeTemplate } from './data/template';
import { experiencesApi, publicArtifactAssetUrl } from '../experiences.service';
import { VisualStyle } from './types/video';
import { AnimatedPlayer } from './components/AnimatedPlayer';
import { TimelineControls } from './components/TimelineControls';
import { GalleryComparison } from './components/GalleryComparison';
import { MemoryCardModal } from './components/MemoryCardModal';
import { soundtrack } from './services/soundtrack';
import { trackUxEvent } from '@services/analytics';
import { Sparkles, Heart, Music } from 'lucide-react';

export default function App({ slug = 'renzo' }: { slug?: string }) {
  const [searchParams] = useSearchParams();
  const [template, setTemplate] = useState<RenzoRuntimeTemplate>(() => slug === 'renzo' ? RENZO_TEMPLATE : { ...RENZO_TEMPLATE, slug });
  const [templateUnavailable, setTemplateUnavailable] = useState(false);
  const opensCardFromQr = searchParams.get('vista') === 'tarjeta' && template.features.directCardOnQr;
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [fpsMode] = useState<24 | 60>(24);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | 'cinema'>('16:9');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('ghibli');
  const [isCardOpen, setIsCardOpen] = useState<boolean>(opensCardFromQr);

  const duration = template.duration;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const playTrackedRef = useRef(false);
  const completeTrackedRef = useRef(false);

  useEffect(() => {
    let active = true;
    setTemplateUnavailable(false);
    setTemplate(slug === 'renzo' ? RENZO_TEMPLATE : { ...RENZO_TEMPLATE, slug });
    void experiencesApi.artifact(slug).then((response) => {
      if (active && response.artifact) {
        setTemplate(mergeArtifactTemplate(slug, response.artifact, (assetId) => publicArtifactAssetUrl(slug, assetId)));
      }
    }).catch((cause) => {
      if (active && isAxiosError(cause) && cause.response?.status === 404) setTemplateUnavailable(true);
    });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    setIsCardOpen(opensCardFromQr);
    if (opensCardFromQr) {
      setIsCardOpen(true);
      void trackUxEvent('VIDEO_QR_OPEN', { experience: slug, view: 'card' });
    }
  }, [opensCardFromQr, slug]);

  useEffect(() => {
    const firstScene = template.scenes[0]?.ghibliImg;
    if (!firstScene) return;
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = firstScene;
    document.head.appendChild(preload);
    return () => preload.remove();
  }, [template.scenes]);

  // Synchronize soundtrack playback with video state
  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        if (!playTrackedRef.current) {
          playTrackedRef.current = true;
          void trackUxEvent('VIDEO_PLAY', { experience: slug });
        }
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
  }, [currentTime, duration, slug]);

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
            if (!completeTrackedRef.current) {
              completeTrackedRef.current = true;
              void trackUxEvent('VIDEO_COMPLETE', { experience: slug });
            }
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
  }, [isPlaying, duration, slug]);

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

  if (templateUnavailable) {
    return (
      <div className="renzo-artifact flex min-h-[60vh] items-center justify-center bg-stone-950 px-4 py-12 text-center text-stone-100">
        <div className="max-w-md rounded-3xl border border-stone-800 bg-stone-900 p-8 shadow-2xl">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-amber-400" aria-hidden="true" />
          <h1 className="font-serif-display text-2xl font-bold">Experiencia no disponible</h1>
          <p className="mt-3 text-sm text-stone-400">Esta plantilla todavía no está publicada o ya no se encuentra activa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="renzo-artifact min-h-screen overflow-x-hidden bg-stone-950 text-stone-100 flex flex-col font-sans-ui selection:bg-amber-500/20 selection:text-amber-200">
      {/* Hero Header Presentation */}
      <div className="border-b border-stone-900 bg-gradient-to-b from-stone-900/40 via-stone-950 to-stone-950 px-3 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-8">
        <div className="max-w-6xl mx-auto text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-xs text-amber-400/90 font-semibold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{template.hero.eyebrow}</span>
            <Sparkles className="w-3.5 h-3.5" />
          </div>

          <h1 className="mx-auto max-w-3xl break-words font-serif-display text-2xl font-bold leading-tight tracking-tight text-stone-50 sm:text-4xl md:text-5xl">{template.hero.headline}</h1>

          <p className="font-handwriting text-2xl sm:text-3xl text-amber-300/90 font-medium">{template.hero.greeting}</p>

          <p className="text-stone-400 text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed">{template.hero.description}</p>
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
            scenes={template.scenes}
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

        {/* Story Chapters & Side-by-Side Comparison */}
        <section id="capitulos">
          <GalleryComparison
            scenes={template.scenes}
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
                Este video animado y tarjeta personalizada son una muestra real de nuestra <strong>Experiencia Conceptual</strong>. En Misky Challay convertimos los momentos más memorables de nuestros clientes en historias vivientes a través de arte generativo, música y recuerdos digitales.
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
                  <span className="text-xs font-bold text-amber-300 block mb-1">03. Comparte</span>
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
              <span>{template.dedication.eyebrow}</span>
            </div>

            <h3 className="font-handwriting text-3xl sm:text-4xl text-amber-100 font-bold leading-snug">“{template.dedication.headline}”</h3>

            <p className="text-stone-300 text-sm leading-relaxed">{template.dedication.body}</p>
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
      <MemoryCardModal
        isOpen={isCardOpen}
        onClose={() => setIsCardOpen(false)}
        recipient={template.recipient}
        template={template.card}
      />
    </div>
  );
}
