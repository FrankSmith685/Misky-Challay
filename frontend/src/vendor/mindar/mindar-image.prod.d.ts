/** Public image-tracking API of MindAR 1.2.5, vendored beside this declaration. */
export interface TargetUpdate { type: string; targetIndex: number; worldMatrix: number[] | null }
export class Controller {
  inputWidth: number;
  inputHeight: number;
  constructor(options: { inputWidth: number; inputHeight: number; maxTrack: number; warmupTolerance: number; missTolerance: number; filterMinCF: number; filterBeta: number; onUpdate: (event: TargetUpdate) => void });
  addImageTargetsFromBuffer(buffer: ArrayBuffer): { dimensions: number[][] };
  getProjectionMatrix(): number[];
  dummyRun(input: HTMLVideoElement): void;
  processVideo(input: HTMLVideoElement): void;
  stopProcessVideo(): void;
  dispose(): void;
  worker: Worker;
}
export class Compiler {
  compileImageTargets(images: HTMLImageElement[], progress: (percent: number) => void): Promise<unknown>;
  exportData(): Uint8Array;
  importData(buffer: ArrayBuffer): Array<{ targetImage: { width: number; height: number }; matchingData: unknown[]; trackingData: unknown[] }>;
}
