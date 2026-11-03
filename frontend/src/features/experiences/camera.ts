import * as THREE from 'three';
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
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0xa39487, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(1, 2, 3);
  scene.add(light);
  const anchor = new THREE.Group();
  anchor.matrixAutoUpdate = false;
  anchor.visible = false;
  scene.add(anchor);
  let lastFound = false;
  let everFound = false;
  const post = new THREE.Matrix4();
  controller = new Controller({
    inputWidth: video.videoWidth,
    inputHeight: video.videoHeight,
    maxTrack: 1,
    warmupTolerance: 5,
    missTolerance: 8,
    filterMinCF: 0.001,
    filterBeta: 1000,
    onUpdate: ({ type, targetIndex, worldMatrix }) => {
      if (stopped || type !== 'updateMatrix' || targetIndex !== 0) return;
      const found = worldMatrix !== null;
      anchor.visible = found;
      if (worldMatrix) anchor.matrix.fromArray(worldMatrix).multiply(post);
      if (found !== lastFound) {
        notify(found ? 'found' : 'lost');
        everFound ||= found;
        lastFound = found;
      } else if (!everFound) notify('scanning');
    },
  });
  // Fetch ourselves: the upstream addImageTargets wrapper does not reject HTTP failures.
  const response = await fetch(media.target ?? CAKE_AR_COMPILED_TARGET, { signal: abort.signal });
  if (!response.ok) throw new Error('No se pudo cargar la tarjeta. Vuelve a intentarlo.');
  const { dimensions } = controller.addImageTargetsFromBuffer(await response.arrayBuffer());
  if (dimensions.length !== 1) throw new Error('La tarjeta de reconocimiento no es válida.');
  alive();
  const [width, height] = dimensions[0];
  post.compose(
    new THREE.Vector3(width / 2, height / 2, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(width, width, width),
  );
  object = await createExperienceObject(snapshot, media);
  if (stopped) {
    object.dispose();
    return;
  }
  const placement = new THREE.Group();
  placement.rotation.x = Math.PI / 2;
  placement.scale.setScalar(0.35);
  placement.add(object.root);
  anchor.add(placement);
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
    event.data?.channel !== CAKE_AR_CHANNEL ||
    started
  )
    return;
  if (event.data.action !== 'start' || !event.data.input?.snapshot) return;
  started = true;
  void start(event.data.input as CakeArInput).catch(fail);
});
parent.postMessage({ channel: CAKE_AR_CHANNEL, ready: true }, location.origin);
