import React from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize, Sparkles, Layers, Sliders, Heart } from 'lucide-react';
import { VisualStyle } from '../types/video';

interface TimelineControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  aspectRatio: '16:9' | '9:16' | 'cinema';
  visualStyle: VisualStyle;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onChangeVolume: (val: number) => void;
  onChangeAspectRatio: (ratio: '16:9' | '9:16' | 'cinema') => void;
  onChangeStyle: (style: VisualStyle) => void;
  onToggleFullscreen: () => void;
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  currentTime,
  duration,
  isPlaying,
  volume,
  isMuted,
  aspectRatio,
  visualStyle,
  onTogglePlay,
  onSeek,
  onRestart,
  onToggleMute,
  onChangeVolume,
  onChangeAspectRatio,
  onChangeStyle,
  onToggleFullscreen,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const dec = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${dec}`;
  };

  const progressPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  return (
    <div className="w-full overflow-hidden bg-stone-900/95 backdrop-blur-xl border border-stone-800 rounded-2xl p-3 sm:p-5 shadow-2xl space-y-3 sm:space-y-4">
      {/* Scrubber Bar with Scene Markers */}
      <div className="space-y-2">
        <div className="relative group cursor-pointer py-2">
          {/* Base Track */}
          <div className="w-full h-2.5 bg-stone-800/90 rounded-full overflow-hidden relative border border-stone-700/50">
            {/* Scene Segment Shading */}
            <div className="absolute inset-0 flex">
              <div className="w-[30%] h-full border-r border-stone-600/40 bg-amber-500/10" title="Escena 1 (0-3s)" />
              <div className="w-[30%] h-full border-r border-stone-600/40 bg-rose-500/10" title="Escena 2 (3-6s)" />
              <div className="w-[40%] h-full bg-orange-500/10" title="Escena 3 (6-10s)" />
            </div>

            {/* Active Progress Fill */}
            <div
              className="h-full bg-gradient-to-r from-amber-400 via-rose-400 to-amber-300 rounded-full transition-all duration-75 relative"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Interactive Scrub Input */}
          <input
            type="range"
            min="0"
            max={duration}
            step="0.05"
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Línea de tiempo del video"
          />

        </div>
      </div>

      {/* Primary Playback Bar */}
      <div className="flex flex-col gap-3 pt-3 border-t border-stone-800/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:pt-1">
        {/* Left: Play/Pause, Replay, Time */}
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
          <button
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
            className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-semibold transition-all shadow-md flex items-center justify-center"
            title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={onRestart}
            aria-label="Reiniciar video desde el inicio"
            className="p-2 rounded-xl text-stone-400 hover:text-amber-200 hover:bg-stone-800/80 transition-colors"
            title="Reiniciar desde el inicio (0:00)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="font-mono text-xs text-stone-300 tabular-nums bg-stone-950/70 px-2.5 py-1.5 rounded-lg border border-stone-800">
            <span className="text-amber-300 font-semibold">{formatTime(currentTime)}</span>
            <span className="text-stone-500 mx-1">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Center: Visual Style Selector */}
        <div className="hidden flex w-full shrink-0 items-center gap-1 overflow-x-auto bg-stone-950 p-1 rounded-xl border border-stone-800 text-xs sm:w-auto">
          <button
            onClick={() => onChangeStyle('ghibli')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              visualStyle === 'ghibli'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="Animación en Acuarela Estilo Studio Ghibli"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acuarela Ghibli</span>
          </button>

          <button
            onClick={() => onChangeStyle('real')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              visualStyle === 'real'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="Fotografías Originales Familiares"
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Fotos Reales</span>
          </button>

          <button
            onClick={() => onChangeStyle('pip')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              visualStyle === 'pip'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="Ghibli con Polaroid de la foto real en esquina"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Polaroid Recuerdo</span>
            <span className="md:hidden">Polaroid</span>
          </button>

          <button
            onClick={() => onChangeStyle('split')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              visualStyle === 'split'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="Comparación lado a lado"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Dividido</span>
          </button>
        </div>

        {/* Right: Audio Volume, Aspect & Fullscreen */}
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
          {/* Volume Control */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleMute}
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar video'}
              className="p-1.5 text-stone-400 hover:text-amber-300 transition-colors"
              title={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
              aria-label="Volumen del video"
              className="w-16 h-1.5 bg-stone-800 rounded-lg accent-brand-600 cursor-pointer"
              title="Volumen de banda sonora acústica"
            />
          </div>

          {/* Aspect Ratio Selector */}
          <div className="hidden lg:flex items-center bg-stone-950 p-0.5 rounded-lg border border-stone-800 text-[11px] font-mono">
            <button
              onClick={() => onChangeAspectRatio('16:9')}
              aria-label="Formato 16:9"
              className={`px-2 py-0.5 rounded ${aspectRatio === '16:9' ? 'bg-brand-700 text-white' : 'text-ink-muted'}`}
              title="16:9 Panorámico Estándar"
            >
              16:9
            </button>
            <button
              onClick={() => onChangeAspectRatio('9:16')}
              aria-label="Formato 9:16 vertical"
              className={`px-2 py-0.5 rounded ${aspectRatio === '9:16' ? 'bg-brand-700 text-white' : 'text-ink-muted'}`}
              title="9:16 Vertical para Historias de WhatsApp / Instagram"
            >
              9:16
            </button>
            <button
              onClick={() => onChangeAspectRatio('cinema')}
              aria-label="Formato cine 2.39:1"
              className={`px-2 py-0.5 rounded ${aspectRatio === 'cinema' ? 'bg-brand-700 text-white' : 'text-ink-muted'}`}
              title="2.39:1 Cinema Scope"
            >
              2.39:1
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={onToggleFullscreen}
            aria-label="Abrir pantalla completa"
            className="p-2 rounded-xl text-stone-400 hover:text-amber-200 hover:bg-stone-800/80 transition-colors"
            title="Pantalla Completa"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
