import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Controller } from '../../vendor/mindar/mindar-image.prod.js';
import { CAKE_AR_COMPILED_TARGET, type CakeArStatus } from '../cakes/ar/cakeAr';
import { createExperienceObject, type SceneMedia } from './scene';
import type { ExperienceScene } from './experiences.service';
const CAKE_AR_CHANNEL = 'misky-experience-ar';
type CakeArInput = { snapshot: ExperienceScene; media: SceneMedia; expiresAt?: string | null };
const notify = (status: CakeArStatus, message?: string) =>
  parent.postMessage({ channel: CAKE_AR_CHANNEL, status, message }, location.origin);
const abort = new AbortController();
let stream: MediaStream | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let controller: Controller | undefined;
let object: Awaited<ReturnType<typeof createExperienceObject>> | undefined;
let resizeObserver: ResizeObserver | undefined;
let adjustPlacement: ((action: string, value?: number) => void) | undefined;
let pointerCleanup: (() => void) | undefined;
let stopped = false;
let started = false;
const alive = () => {
  if (stopped) throw new DOMException('Closed', 'AbortError');
};
const stop = () => {
  if (stopped) return;
  stopped = true;
  abort.abort();
  stream?.getTracks().forEach((track) => track.stop());
  renderer?.setAnimationLoop(null);
  controller?.stopProcessVideo();
  controller?.worker.terminate();
  object?.dispose();
  adjustPlacement = undefined;
  pointerCleanup?.();
  pointerCleanup = undefined;
  resizeObserver?.disconnect();
  renderer?.dispose();
  renderer?.forceContextLoss();
};
window.addEventListener('pagehide', stop);

const start = async ({ snapshot, media, expiresAt }: CakeArInput) => {
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now())
    throw new Error('Esta vista compartida venció. Solicita un enlace nuevo.');
  if (!isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new Error('Abre la web con HTTPS para usar la cámara.');
  const mobile = matchMedia('(max-width: 640px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  const targetSources = (media.targets?.filter(Boolean) ?? []).length
    ? media.targets!.filter(Boolean)
    : [media.target ?? CAKE_AR_COMPILED_TARGET];
  const targetBuffersPromise = Promise.all(targetSources.map(async (targetSource) => {
    const response = await fetch(targetSource, { signal: abort.signal });
    if (!response.ok) throw new Error('No se pudo cargar la tarjeta. Vuelve a intentarlo.');
    return response.arrayBuffer();
  }));
  notify('loading');
  const container = document.getElementById('camera')!;
  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  container.append(video);
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
  });
  if (stopped) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  video.srcObject = stream;
  await video.play();
  alive();
  // MindAR's InputLoader uses these attributes, not videoWidth/videoHeight.
  video.width = video.videoWidth;
  video.height = video.videoHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const appearance = Object.assign({
    exposure: 1,
    ambientIntensity: 1.8,
    keyIntensity: 2.3,
    environment: 'ROOM' as const,
    toneMapping: 'ACES' as const,
  } as ExperienceScene['appearance'], snapshot.appearance ?? {});
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = appearance.toneMapping === 'NONE' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = appearance.exposure;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  if (appearance.environment === 'ROOM' && !mobile) {
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(environment, 0.04).texture;
    environment.dispose();
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0xa39487, appearance.ambientIntensity));
  const light = new THREE.DirectionalLight(0xffffff, appearance.keyIntensity);
  light.position.set(1, 2, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.01;
  light.shadow.camera.far = 5;
  light.shadow.bias = -0.0002;
  scene.add(light);
  scene.add(new THREE.DirectionalLight(0xffe9d2, 0.55));
  const anchors: THREE.Group[] = [];
  const targetPosts: THREE.Matrix4[] = [];
  const detectedTargets = new Set<number>();
  let lastFound = false;
  let everFound = false;
  controller = new Controller({
    inputWidth: video.videoWidth,
    inputHeight: video.videoHeight,
    maxTrack: targetSources.length,
    warmupTolerance: 3,
    missTolerance: 6,
    filterMinCF: 0.001,
    filterBeta: 500,
    onUpdate: ({ type, targetIndex, worldMatrix }) => {
      if (stopped || type !== 'updateMatrix') return;
      const anchor = anchors[targetIndex];
      const targetPost = targetPosts[targetIndex];
      if (!anchor || !targetPost) return;
      const found = worldMatrix !== null;
      anchor.visible = found;
      if (worldMatrix) anchor.matrix.fromArray(worldMatrix).multiply(targetPost);
      if (found) detectedTargets.add(targetIndex);
      else detectedTargets.delete(targetIndex);
      const anyFound = detectedTargets.size > 0;
      if (anyFound !== lastFound) {
        notify(anyFound ? 'found' : 'lost');
        everFound ||= anyFound;
        lastFound = anyFound;
      } else if (!everFound) notify('scanning');
    },
  });
  // Fetch ourselves: the upstream addImageTargets wrapper does not reject HTTP failures.
  const targetBuffers = await targetBuffersPromise;
  const dimensions: Array<[number, number]> = [];
  for (const targetBuffer of targetBuffers) {
    const result = controller.addImageTargetsFromBuffer(targetBuffer);
    result.dimensions.forEach((dimension) => dimensions.push([dimension[0], dimension[1]]));
  }
  if (!dimensions.length) throw new Error('La tarjeta de reconocimiento no es valida.');
  alive();
  dimensions.forEach(([width, height]) => {
    const anchor = new THREE.Group();
    anchor.matrixAutoUpdate = false;
    anchor.visible = false;
    scene.add(anchor);
    anchors.push(anchor);
    targetPosts.push(new THREE.Matrix4().compose(
      new THREE.Vector3(width / 2, height / 2, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(width, width, width),
    ));
  });
  object = await createExperienceObject(snapshot, media);
  if (stopped) {
    object.dispose();
    return;
  }
  const placements: THREE.Group[] = [];
  const basePlacementScale = snapshot.content === 'CAKE' ? 0.24 : 0.32;
  // The target is the vertical XY plane. Keeping the cake Y-up prevents the
  // previous quarter-turn from presenting only its top as a flat disc.
  anchors.forEach((anchor, index) => {
    const placement = new THREE.Group();
    placement.rotation.set(0, 0, 0);
    placement.scale.setScalar(basePlacementScale);
    placement.position.z = 0.12;
    placement.add(index === 0 ? object!.root : object!.root.clone(true));
    anchor.add(placement);
    placements.push(placement);
  });
  let userScale = 1;
  let userRotation = 0;
  const applyPlacement = () => {
    placements.forEach((placement) => {
      placement.scale.setScalar(basePlacementScale * userScale);
      placement.rotation.y = THREE.MathUtils.degToRad(userRotation);
    });
  };
  adjustPlacement = (action, value) => {
    if (action === 'scale') userScale = THREE.MathUtils.clamp(userScale + (value ?? 0), 0.65, 1.55);
    if (action === 'rotate') userRotation = (userRotation + (value ?? 0) + 540) % 360 - 180;
    if (action === 'reset') { userScale = 1; userRotation = 0; }
    applyPlacement();
  };
  let pointerX: number | null = null;
  const onPointerDown = (event: PointerEvent) => {
    pointerX = event.clientX;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerX === null) return;
    const delta = event.clientX - pointerX;
    if (Math.abs(delta) < 0.5) return;
    adjustPlacement?.('rotate', delta * 1.1);
    pointerX = event.clientX;
  };
  const onPointerEnd = () => { pointerX = null; };
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerEnd);
  container.addEventListener('pointercancel', onPointerEnd);
  pointerCleanup = () => {
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', onPointerEnd);
    container.removeEventListener('pointercancel', onPointerEnd);
  };
  const resize = () => {
    if (!renderer || !controller) return;
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const factor = Math.max(w / video.videoWidth, h / video.videoHeight);
    const vw = video.videoWidth * factor;
    const vh = video.videoHeight * factor;
    Object.assign(video.style, {
      width: `${vw}px`,
      height: `${vh}px`,
      left: `${(w - vw) / 2}px`,
      top: `${(h - vh) / 2}px`,
    });
    const projection = controller.getProjectionMatrix();
    const inputRatio = controller.inputWidth / controller.inputHeight;
    const inputAdjust =
      inputRatio > w / h
        ? video.width / controller.inputWidth
        : video.height / controller.inputHeight;
    const projectionHeight =
      (inputRatio > w / h ? h : (w / controller.inputWidth) * controller.inputHeight) * inputAdjust;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / projectionHeight / projection[5]));
    camera.aspect = w / h;
    camera.near = projection[14] / (projection[10] - 1);
    camera.far = projection[14] / (projection[10] + 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  video.addEventListener('resize', resize);
  resize();
  controller.dummyRun(video);
  alive();
  notify('scanning');
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1);
    object?.update(clock.elapsedTime, delta);
    renderer?.render(scene, camera);
  });
  controller.processVideo(video);
  // Stop the camera when the tab is hidden; resuming is an explicit action.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      notify('error', 'La cámara se pausó. Vuelve a activarla para continuar.');
    }
  });
  if (expiresAt)
    window.setTimeout(
      () => {
        stop();
        notify('error', 'Esta vista compartida venció. Solicita un enlace nuevo.');
      },
      Math.max(0, new Date(expiresAt).getTime() - Date.now()),
    );
};
function fail(error: unknown) {
  if (stopped) return;
  const name = error instanceof DOMException ? error.name : '';
  const message =
    name === 'NotAllowedError'
      ? 'No se permitió la cámara. Habilítala en los permisos de este sitio y vuelve a intentarlo.'
      : name === 'NotFoundError'
        ? 'No encontramos una cámara en este dispositivo.'
        : name === 'NotReadableError'
          ? 'La cámara está ocupada. Cierra otras aplicaciones que la estén usando.'
          : error instanceof Error
            ? error.message
            : 'No se pudo iniciar la cámara AR. Puedes usar el visor 3D.';
  stop();
  notify('error', message);
}
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  fail(event.reason);
});
window.addEventListener('message', (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    event.data?.channel !== CAKE_AR_CHANNEL
  )
    return;
  if (event.data.action === 'start' && !started && event.data.input?.snapshot) {
    started = true;
    void start(event.data.input as CakeArInput).catch(fail);
    return;
  }
  if (started) adjustPlacement?.(event.data.action, Number(event.data.value));
});
parent.postMessage({ channel: CAKE_AR_CHANNEL, ready: true }, location.origin);
