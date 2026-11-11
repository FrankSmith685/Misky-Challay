import React, { useState } from 'react';
import { Download, Film, Loader2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { SceneData } from '../types/video';

interface VideoExporterProps {
  scenes: SceneData[];
  onOpenCard: () => void;
}

export const VideoExporter: React.FC<VideoExporterProps> = ({ scenes, onOpenCard }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  // Quick export frame
  const handleExportFrame = (scene: SceneData) => {
    const link = document.createElement('a');
    link.href = scene.ghibliImg;
    link.download = `Renzo_Cumpleanos_${scene.title.replace(/\s+/g, '_')}_Ghibli.jpg`;
    link.click();
  };

  // Full 10-second video recorder using Canvas + MediaRecorder
  const handleRecordVideo = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setProgress(5);
    setStatusText('Preparando lienzo cinematográfico HD...');

    try {
      const width = 1280;
      const height = 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo crear el contexto 2D');

      // Preload images including Misky Challay logo
      setStatusText('Cargando acuarelas y logo de Pasteler-IA...');
      const loadedImages: HTMLImageElement[] = [];
      for (const scene of scenes) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = scene.ghibliImg;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve; // fallback
        });
        loadedImages.push(img);
      }

      // Preload Misky Challay logo
      const miskyLogoImg = new Image();
      miskyLogoImg.crossOrigin = 'anonymous';
      miskyLogoImg.src = '/assets/aistudio/WhatsApp_Image_2026-11-05_at_22.50.19_6cc9e389.jpeg';
      await new Promise((resolve) => {
        miskyLogoImg.onload = resolve;
        miskyLogoImg.onerror = resolve;
      });

      setProgress(20);
      setStatusText('Iniciando renderizado a 24 FPS...');

      // Setup Canvas stream
      const stream = canvas.captureStream(24);
      let mediaRecorder: MediaRecorder;
      const chunks: Blob[] = [];

      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      } catch {
        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        } catch {
          mediaRecorder = new MediaRecorder(stream);
        }
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordPromise = new Promise<string>((resolve) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          resolve(url);
        };
      });

      mediaRecorder.start();

      // Render 10 seconds (240 frames at 24fps)
      const totalFrames = 240;
      const frameDuration = 1 / 24;

      for (let f = 0; f < totalFrames; f++) {
        const t = f * frameDuration;
        const sceneIdx = t < 3 ? 0 : t < 6 ? 1 : 2;
        const currentScene = scenes[sceneIdx];
        const currentImg = loadedImages[sceneIdx];

        // Scene local progress
        const sDur = currentScene.endTime - currentScene.startTime;
        const sElapsed = Math.max(0, t - currentScene.startTime);
        const sProg = Math.min(1, sElapsed / sDur);
        const ease = 0.5 - 0.5 * Math.cos(sProg * Math.PI);

        // Clear canvas
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(0, 0, width, height);

        // Draw image with Ken Burns transform
        ctx.save();
        const scale = currentScene.cameraStart.scale + (currentScene.cameraEnd.scale - currentScene.cameraStart.scale) * ease;
        const transX = currentScene.cameraStart.x + (currentScene.cameraEnd.x - currentScene.cameraStart.x) * ease;
        const transY = currentScene.cameraStart.y + (currentScene.cameraEnd.y - currentScene.cameraStart.y) * ease;

        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.translate((transX / 100) * width, (transY / 100) * height);
        ctx.drawImage(currentImg, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Particles overlay
        ctx.save();
        if (currentScene.particles === 'sakura') {
          // Draw falling petals
          ctx.fillStyle = 'rgba(255, 210, 220, 0.75)';
          for (let p = 0; p < 25; p++) {
            const px = ((p * 73 + t * 90) % (width + 100)) - 50;
            const py = (p * 51 + t * 80) % height;
            ctx.beginPath();
            ctx.ellipse(px, py, 6, 3.5, 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (currentScene.particles === 'dust') {
          // Floating golden motes
          ctx.fillStyle = 'rgba(255, 238, 187, 0.65)';
          for (let p = 0; p < 25; p++) {
            const px = (p * 67 + Math.sin(t + p) * 15) % width;
            const py = (height - ((p * 43 + t * 40) % height));
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Sunset golden sparkles
          ctx.fillStyle = 'rgba(255, 215, 120, 0.7)';
          for (let p = 0; p < 30; p++) {
            const px = (p * 59 + Math.cos(t * 1.5 + p) * 20) % width;
            const py = (height - ((p * 37 + t * 30) % height));
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();

        // Vignette
        const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.65);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(20, 10, 5, 0.45)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Typography overlay for Scene 3 (7.1s - 10.0s)
        if (t >= 7.1) {
          const textProg1 = Math.min(1, (t - 7.1) / 0.7);
          const textProg2 = t >= 8.0 ? Math.min(1, (t - 8.0) / 0.7) : 0;

          // Scrim
          ctx.fillStyle = `rgba(15, 10, 8, ${Math.max(textProg1, textProg2) * 0.45})`;
          ctx.fillRect(0, 0, width, height);

          // Line 1: "El mejor regalo es tener una gran familia"
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 44px "Caveat", cursive, sans-serif';
          ctx.fillStyle = `rgba(255, 251, 235, ${textProg1})`;
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = 12;
          ctx.fillText('“El mejor regalo es tener una gran familia”', width / 2, height / 2 - 60);

          // Line 2: "¡Feliz Cumpleaños, Renzo!"
          if (textProg2 > 0) {
            ctx.font = 'bold 56px "Caveat", cursive, sans-serif';
            ctx.fillStyle = `rgba(254, 240, 138, ${textProg2})`;
            ctx.shadowColor = 'rgba(217, 119, 6, 0.9)';
            ctx.shadowBlur = 24;
            ctx.fillText('¡Feliz Cumpleaños, Renzo!', width / 2, height / 2 + 10);
          }

          // Misky Challay Outro Brand Card at bottom (8.5s - 10.0s)
          if (t >= 8.5 && miskyLogoImg.complete && miskyLogoImg.naturalWidth > 0) {
            const logoProg = Math.min(1, (t - 8.5) / 0.8);
            ctx.globalAlpha = logoProg;

            // Draw clean rounded container badge
            const badgeW = 380;
            const badgeH = 70;
            const badgeX = (width - badgeW) / 2;
            const badgeY = height - 105;

            ctx.fillStyle = 'rgba(15, 12, 10, 0.88)';
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 16);
            ctx.fill();
            ctx.stroke();

            // Draw white background backing for logo
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(badgeX + 10, badgeY + 8, 80, 54, 10);
            ctx.fill();

            // Draw logo image
            ctx.drawImage(miskyLogoImg, badgeX + 12, badgeY + 10, 76, 50);

            // Badge text
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fde68a';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText('EXPERIENCIA CONCEPTUAL', badgeX + 105, badgeY + 28);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText('Misky Challay · Pasteler-IA Artesanal', badgeX + 105, badgeY + 48);

            ctx.globalAlpha = 1.0;
          }

          ctx.restore();
        }

        // Update progress
        const currentPct = 20 + Math.floor((f / totalFrames) * 75);
        setProgress(currentPct);
        setStatusText(`Renderizando cuadro ${f + 1}/${totalFrames} (${t.toFixed(1)}s)...`);

        // Yield execution to allow paint
        await new Promise((r) => setTimeout(r, 8));
      }

      mediaRecorder.stop();
      setProgress(98);
      setStatusText('Generando archivo de video final...');

      const videoUrl = await recordPromise;
      setProgress(100);
      setStatusText('¡Video listo para descargar!');

      // Auto trigger download
      const dlLink = document.createElement('a');
      dlLink.href = videoUrl;
      dlLink.download = 'Feliz_Cumpleanos_Renzo_Animacion_Ghibli.webm';
      dlLink.click();
    } catch (err) {
      console.error('Error generating video:', err);
      setStatusText('Hubo un detalle en el navegador al generar el video directo.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="overflow-hidden bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400 mb-1">
            <Film className="w-3.5 h-3.5 text-amber-400" />
            <span>Compartir y Guardar el Regalo</span>
          </div>
          <h4 className="font-serif-display text-xl font-bold text-stone-100">
            Descargar Video & Recuerdos en Alta Definición
          </h4>
          <p className="text-xs text-stone-400 mt-0.5">
            Descarga el video animado de 10s completo para enviar por WhatsApp o guardar las postales ilustradas.
          </p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2.5 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={onOpenCard}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            <span>Ver Tarjeta & Mensaje</span>
          </button>

          <button
            onClick={handleRecordVideo}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generando Video ({progress}%)...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Descargar Video Animado (WebM)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress status */}
      {isExporting && (
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-stone-300 font-medium">
            <span>{statusText}</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Quick wallpaper download row */}
      <div className="pt-3 border-t border-stone-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-400">
        <span className="flex items-center gap-1.5 font-medium text-stone-300">
          <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
          Descargar postales individuales como fondo de pantalla:
        </span>
        <div className="flex flex-wrap gap-2">
          {scenes.map((sc) => (
            <button
              key={sc.id}
              onClick={() => handleExportFrame(sc)}
              className="px-2.5 py-1 bg-stone-800/80 hover:bg-stone-800 hover:text-amber-200 rounded-lg border border-stone-700/60 text-[11px] transition-colors"
            >
              Postales Escena {sc.id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
