import type { ExperienceScene } from './experiences.service';

/** Original, local canvas animation. It never requests a camera or microphone. */
export async function createGreetingVideo(
  scene: ExperienceScene,
  progress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)
    throw new Error('Este navegador no permite crear videos. Puedes subir un MP4 o WebM editado.');
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar el video.');
  const stream = canvas.captureStream(24);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].find((mime) =>
    MediaRecorder.isTypeSupported(mime),
  );
  if (!mimeType) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Sube un video MP4 o WebM creado en otro editor.');
  }
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1000000 });
  const chunks: Blob[] = [];
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const lines = (text: string, max: number) => {
    const result: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (ctx.measureText(`${line} ${word}`).width > 490 && line) {
        result.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) result.push(line);
    if (result.length > max) result[max - 1] = `${result[max - 1].slice(0, -3)}…`;
    return result.slice(0, max);
  };
  try {
    return await new Promise<File>((resolve, reject) => {
      let frame = 0;
      let aborted = false;
      const abort = () => {
        aborted = true;
        cancelAnimationFrame(frame);
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new DOMException('Cancelado', 'AbortError'));
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () =>
        reject(new Error('No se pudo grabar el saludo. Inténtalo otra vez.'));
      recorder.onstop = () => {
        signal?.removeEventListener('abort', abort);
        if (!aborted)
            resolve(
            new File(chunks, `saludo-misky.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`, {
              type: mimeType.split(';')[0],
            }),
          );
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      recorder.start();
      const start = performance.now();
      const draw = () => {
        const t = (performance.now() - start) / 1000;
        const gradient = ctx.createLinearGradient(0, 0, 960, 540);
        gradient.addColorStop(0, '#003a60');
        gradient.addColorStop(1, '#006fb9');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 960, 540);
        for (let i = 0; i < 30; i++)
          ellipse(
            (i * 173) % 960,
            (i * 91) % 540,
            1.6 + Math.sin(t + i),
            1.6 + Math.sin(t + i),
            '#d7b27c',
          );
        if (scene.content === 'CAKE') {
          const bounce = Math.sin(t * 2) * 4;
          ellipse(225, 430, 105, 12, '#201b28');
          ctx.fillStyle = scene.color;
          ctx.fillRect(145, 340 + bounce, 160, 76);
          ellipse(225, 340 + bounce, 80, 18, '#f9e8dd');
          ellipse(225, 416 + bounce, 80, 18, scene.color);
          ctx.fillStyle = '#d8a06d';
          ctx.fillRect(170, 285 + bounce, 110, 58);
          ellipse(225, 285 + bounce, 55, 15, '#fffaf2');
          ellipse(225, 343 + bounce, 55, 15, '#d8a06d');
          ctx.fillStyle = '#c89551';
          ctx.fillRect(220, 245 + bounce, 10, 38);
          ellipse(225, 241 + bounce + Math.sin(t * 8) * 2, 10, 14, '#f4b84b');
          for (const x of [181, 212, 245, 275]) ellipse(x, 330 + bounce, 5, 5, '#f4b84b');
        } else {
          const y = 240 + Math.sin(t * 2) * 9;
          ellipse(225, 430, 100, 12, '#201b28');
          ellipse(225, y + 75, 62, 83, scene.color);
          ellipse(225, y - 20, 85, 65, scene.color);
          for (const x of [193, 257]) {
            ellipse(x, y - 20, 17, 27, '#25232b');
            ellipse(x - 6, y - 30, 5, 7, '#ffffff');
          }
          ctx.strokeStyle = scene.color;
          ctx.lineWidth = 21;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(280, y + 55);
          ctx.lineTo(328, y + 10 + Math.sin(t * 5) * 22);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(170, y + 55);
          ctx.lineTo(130, y + 100);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff5e8';
        ctx.font = 'bold 33px Arial';
        lines(scene.title, 3).forEach((line, index) => ctx.fillText(line, 395, 105 + index * 39));
        ctx.fillStyle = '#eee1db';
        ctx.font = '23px Arial';
        lines(scene.message, 6).forEach((line, index) => ctx.fillText(line, 395, 260 + index * 29));
        ctx.fillStyle = '#dfbd81';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('Misky Challay', 395, 492);
        progress(Math.min(100, Math.round((t / 8) * 100)));
        if (t < 8) frame = requestAnimationFrame(draw);
        else recorder.stop();
      };
      draw();
    });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
