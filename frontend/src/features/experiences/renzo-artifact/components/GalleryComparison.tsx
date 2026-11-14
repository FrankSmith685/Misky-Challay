import React, { useState } from 'react';
import { SceneData } from '../types/video';
import { Play, Heart, Clock } from 'lucide-react';

interface GalleryComparisonProps {
  scenes: SceneData[];
  onSelectScene: (time: number) => void;
  activeTime: number;
}

export const GalleryComparison: React.FC<GalleryComparisonProps> = ({
  scenes,
  onSelectScene,
  activeTime,
}) => {
  const [hoveredScene, setHoveredScene] = useState<number | null>(null);

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-stone-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400 mb-1">
            <Heart className="w-3.5 h-3.5 fill-amber-400" />
            <span>Capítulos de Nuestra Historia</span>
          </div>
          <h3 className="font-serif-display text-2xl sm:text-3xl font-semibold text-stone-100">
            De la Foto al Lienzo Animado
          </h3>
          <p className="text-sm text-stone-400 mt-1">
            Explora cada una de las tres escenas capturadas en acuarela estilo Studio Ghibli a partir de tus fotos reales.
          </p>
        </div>

        <div className="text-xs text-stone-400 font-mono">
          <span>3 Escenas</span>
          <span className="mx-1.5">·</span>
          <span>10 Segundos</span>
          <span className="mx-1.5">·</span>
          <span>Acuarela & Óleo 2D</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {scenes.map((scene) => {
          const isCurrentlyPlaying = activeTime >= scene.startTime && activeTime < scene.endTime;
          return (
            <div
              key={scene.id}
              className={`group bg-stone-900/90 rounded-2xl border transition-all duration-300 overflow-hidden flex flex-col ${
                isCurrentlyPlaying
                  ? 'border-amber-400/80 ring-2 ring-amber-400/20 shadow-xl'
                  : 'border-stone-800 hover:border-amber-500/40'
              }`}
              onMouseEnter={() => setHoveredScene(scene.id)}
              onMouseLeave={() => setHoveredScene(null)}
            >
              {/* Media Preview (Hover to flip between Ghibli & Real photo) */}
              <div className="relative aspect-[16/10] overflow-hidden bg-stone-950">
                {/* Ghibli Art */}
                <img
                  src={scene.ghibliImg}
                  alt={scene.title}
                  loading={scene.id === 1 ? 'eager' : 'lazy'}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${
                    hoveredScene === scene.id ? 'opacity-90' : 'opacity-100'
                  }`}
                />

                {/* Real Photo Thumbnail Badge */}
                <div className="absolute bottom-2.5 right-2.5 w-16 h-16 sm:w-20 sm:h-20 rounded-lg p-1 bg-amber-50 shadow-xl border border-amber-200/80 rotate-3 group-hover:rotate-0 transition-transform duration-300">
                  <img
                    src={scene.realImg}
                    alt="Foto original"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded"
                  />
                  <div className="absolute -top-2 -left-2 bg-brand-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow">
                    Original
                  </div>
                </div>

                {/* Quick Jump Overlay Button */}
                <button
                  onClick={() => onSelectScene(scene.startTime)}
                  className="absolute inset-0 bg-brand-900/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-medium text-xs backdrop-blur-[2px]"
                >
                  <div className="p-2.5 rounded-full bg-brand-600 text-white font-bold shadow-lg transform group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                  <span className="bg-brand-900/90 px-3 py-1.5 rounded-lg border border-brand-200/60 text-white">
                    Reproducir Escena
                  </span>
                </button>

                {/* Timestamp Pill */}
                <div className="absolute top-2.5 left-2.5 bg-brand-900/85 backdrop-blur-md px-2 py-1 rounded text-[11px] font-mono text-white border border-brand-200/60 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-brand-100" />
                  <span>{scene.startTime}s - {scene.endTime}s</span>
                </div>
              </div>

              {/* Text & Content */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-amber-400/90 font-medium mb-1">
                    <span>{scene.subtitle}</span>
                    {scene.particles === 'dust' && <span>Partículas de Sol</span>}
                    {scene.particles === 'sakura' && <span>Pétalos de Cerezo</span>}
                    {scene.particles === 'sunset' && <span>Resplandor Dorado</span>}
                  </div>
                  <h4 className="font-serif-display text-lg font-semibold text-stone-100 group-hover:text-amber-200 transition-colors">
                    {scene.title}
                  </h4>
                  <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                    {scene.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-stone-800/80">
                  <p className="font-handwriting text-base text-amber-100/90 italic">
                    "{scene.quote}"
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
