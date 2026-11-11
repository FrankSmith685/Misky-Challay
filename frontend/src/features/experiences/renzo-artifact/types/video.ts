export type VisualStyle = 'ghibli' | 'real' | 'split' | 'pip';

export interface SceneData {
  id: number;
  title: string;
  subtitle: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  ghibliImg: string;
  realImg: string;
  cameraStart: { scale: number; x: number; y: number };
  cameraEnd: { scale: number; x: number; y: number };
  particles: 'dust' | 'sakura' | 'sunset';
  description: string;
  quote: string;
}

export interface PlaybackState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  speed: number;
  fpsMode: 24 | 60;
  aspectRatio: '16:9' | '9:16' | 'cinema';
  visualStyle: VisualStyle;
}
