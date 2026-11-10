import { useEffect, useState } from 'react';
import { api } from '@services/api/client';
import { assetIds, type ExperienceScene } from './experiences.service';
import type { SceneMedia } from './scene';

export function useExperienceMedia(scene: ExperienceScene | null, base: string, demo = false) {
  const [state, setState] = useState<{ key: string; media: SceneMedia; error: string }>({
    key: '',
    media: {},
    error: '',
  });
  const key = JSON.stringify([scene, base, demo]);
  useEffect(() => {
    if (!scene) return;
    const abort = new AbortController();
    const urls: string[] = [];
    let failed = false;
    void (async () => {
      const media: SceneMedia = demo
        ? { video: '/experiences/demo-greeting.webm', poster: '/experiences/demo-poster.svg' }
        : {};
      try {
        await Promise.all(
          assetIds(scene).map(async (id) => {
            const response = await api.get<Blob>(`${base}/assets/${id}`, {
              responseType: 'blob',
              signal: abort.signal,
              timeout: 60000,
            });
            if (abort.signal.aborted || failed) return;
            const url = URL.createObjectURL(response.data);
            urls.push(url);
            if (scene.modelAssetId === id) media.model = url;
            if (scene.videoAssetId === id) media.video = url;
            if (scene.audioAssetId === id) media.audio = url;
            if (scene.targetAssetId === id) media.target = url;
            if (scene.targetImageAssetId === id) media.image = url;
            const activeMarkers = (scene.markers ?? []).filter((marker) => marker.enabled);
            const markerTargetIds = [...new Set(activeMarkers.map((marker) => marker.targetAssetId))];
            const markerIndex = markerTargetIds.indexOf(id);
            if (markerIndex >= 0) {
              media.targets ??= [];
              media.targets[markerIndex] = url;
            }
          }),
        );
        if (!abort.signal.aborted) setState({ key, media, error: '' });
      } catch {
        failed = true;
        urls.forEach(URL.revokeObjectURL);
        if (!abort.signal.aborted)
          setState({
            key,
            media: {},
            error: 'No se pudieron cargar los archivos. Actualiza para volver a intentarlo.',
          });
      }
      if (abort.signal.aborted) urls.forEach(URL.revokeObjectURL);
    })();
    return () => {
      abort.abort();
      urls.forEach(URL.revokeObjectURL);
    };
    // key captures the complete request; scene object identity alone is not a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { media: state.media, error: state.error, loading: Boolean(scene) && state.key !== key };
}
