import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Controller } from '../../../vendor/mindar/mindar-image.prod.js';
import { createCakeModel, disposeCakeModel } from '../utils/cake3dModel';
import { prepareImportedCakeModel } from '../utils/importedCakeModel';
import { cakeReconstructionApi } from '../cakeReconstruction.service';
import { CAKE_AR_CHANNEL, CAKE_AR_COMPILED_TARGET, type CakeArInput, type CakeArStatus } from './cakeAr';

const notify = (status: CakeArStatus, message?: string) => parent.postMessage({ channel: CAKE_AR_CHANNEL, status, message }, location.origin);
const abort = new AbortController();
let stream: MediaStream | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let controller: Controller | undefined;
let model: THREE.Group | undefined;
let adjustPlacement: ((action: string, value?: number) => void) | undefined;
let stopped = false;
let started = false;
const alive = () => { if (stopped) throw new DOMException('Closed', 'AbortError'); };
const stop = () => {
  if (stopped) return;
  stopped = true;
  abort.abort();
  stream?.getTracks().forEach((track) => track.stop());
  renderer?.setAnimationLoop(null);
  controller?.stopProcessVideo();
  controller?.worker.terminate();
  if (model) disposeCakeModel(model);
  adjustPlacement = undefined;
  renderer?.dispose();
  renderer?.forceContextLoss();
};
window.addEventListener('pagehide', stop);

const start = async ({ snapshot, expiresAt }: CakeArInput) => {
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw new Error('Esta vista compartida venció. Solicita un enlace nuevo.');
  if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Abre la web con HTTPS para usar la cámara.');
  notify('loading');
  const container = document.getElementById('camera')!;
  const video = document.createElement('video');
  video.muted = true; video.autoplay = true; video.playsInline = true;
  container.append(video);
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } });
  if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
  video.srcObject = stream;
  await video.play();
  alive();
  // MindAR's InputLoader uses these attributes, not videoWidth/videoHeight.
  video.width = video.videoWidth; video.height = video.videoHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0xa39487, 2.1));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(1, 2, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.01;
  light.shadow.camera.far = 5;
  light.shadow.bias = -0.0002;
  scene.add(light);
  scene.add(new THREE.DirectionalLight(0xffe9d2, 0.55));
  const anchor = new THREE.Group();
  anchor.matrixAutoUpdate = false; anchor.visible = false; scene.add(anchor);
  let lastFound = false;
  let everFound = false;
  const post = new THREE.Matrix4();
  controller = new Controller({
    inputWidth: video.videoWidth, inputHeight: video.videoHeight, maxTrack: 1,
    warmupTolerance: 5, missTolerance: 8, filterMinCF: .001, filterBeta: 1000,
    onUpdate: ({ type, targetIndex, worldMatrix }) => {
      if (stopped || type !== 'updateMatrix' || targetIndex !== 0) return;
      const found = worldMatrix !== null;
      anchor.visible = found;
      if (worldMatrix) anchor.matrix.fromArray(worldMatrix).multiply(post);
      if (found !== lastFound) { notify(found ? 'found' : 'lost'); everFound ||= found; lastFound = found; }
      else if (!everFound) notify('scanning');
    },
  });
  // Fetch ourselves: the upstream addImageTargets wrapper does not reject HTTP failures.
  const response = await fetch(CAKE_AR_COMPILED_TARGET, { signal: abort.signal });
  if (!response.ok) throw new Error('No se pudo cargar la tarjeta. Vuelve a intentarlo.');
  const { dimensions } = controller.addImageTargetsFromBuffer(await response.arrayBuffer());
  if (dimensions.length !== 1) throw new Error('La tarjeta de reconocimiento no es válida.');
  alive();
  const [width, height] = dimensions[0];
  post.compose(new THREE.Vector3(width / 2, height / 2, 0), new THREE.Quaternion(), new THREE.Vector3(width, width, width));
  const reconstruction = snapshot.visualDesign?.reconstruction;
  if (reconstruction) {
    const buffer = await cakeReconstructionApi.model(reconstruction.token, abort.signal);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    if (stopped) { disposeCakeModel(gltf.scene); return; }
    try { model = prepareImportedCakeModel(gltf.scene, snapshot); }
    catch (error) { disposeCakeModel(gltf.scene); throw error; }
  } else model = createCakeModel({ ...snapshot, visualDesign: undefined });
  alive();
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const placement = new THREE.Group();
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  // Cake is Y-up; the recognized image lies in XY with +Z toward the camera.
  // Keep the cake upright in the target's XY plane. The old quarter-turn
  // made the camera see only a large circular top surface.
  const baseScale = .28 / Math.max(size.x, size.z, .001);
  placement.rotation.set(Math.PI * .42, 0, 0);
  placement.scale.setScalar(baseScale);
  placement.position.set(0, 0, Math.max(size.z * baseScale * .5, .08));
  placement.add(model); anchor.add(placement);
  let userScale = 1;
  let userRotation = 0;
  const applyPlacement = () => {
    placement.scale.setScalar(baseScale * userScale);
    placement.rotation.y = THREE.MathUtils.degToRad(userRotation);
  };
  adjustPlacement = (action, value) => {
    if (action === 'scale') userScale = THREE.MathUtils.clamp(userScale + (value ?? 0), .65, 1.55);
    if (action === 'rotate') userRotation = (userRotation + (value ?? 0) + 540) % 360 - 180;
    if (action === 'reset') { userScale = 1; userRotation = 0; }
    applyPlacement();
  };
  const resize = () => {
    if (!renderer || !controller) return;
    video.width = video.videoWidth; video.height = video.videoHeight;
    const w = container.clientWidth; const h = container.clientHeight;
    const factor = Math.max(w / video.videoWidth, h / video.videoHeight);
    const vw = video.videoWidth * factor; const vh = video.videoHeight * factor;
    Object.assign(video.style, { width: `${vw}px`, height: `${vh}px`, left: `${(w - vw) / 2}px`, top: `${(h - vh) / 2}px` });
    const projection = controller.getProjectionMatrix();
    const inputRatio = controller.inputWidth / controller.inputHeight;
    const inputAdjust = inputRatio > w / h ? video.width / controller.inputWidth : video.height / controller.inputHeight;
    const projectionHeight = (inputRatio > w / h ? h : w / controller.inputWidth * controller.inputHeight) * inputAdjust;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / projectionHeight / projection[5]));
    camera.aspect = w / h;
    camera.near = projection[14] / (projection[10] - 1);
    camera.far = projection[14] / (projection[10] + 1);
    camera.updateProjectionMatrix(); renderer.setSize(w, h);
  };
  new ResizeObserver(resize).observe(container);
  video.addEventListener('resize', resize);
  resize();
  controller.dummyRun(video);
  alive();
  notify('scanning');
  renderer.setAnimationLoop(() => renderer?.render(scene, camera));
  controller.processVideo(video);
  // Stop the camera when the tab is hidden; resuming is an explicit action.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); notify('error', 'La cámara se pausó. Vuelve a activarla para continuar.'); }
  });
  if (expiresAt) window.setTimeout(() => { stop(); notify('error', 'Esta vista compartida venció. Solicita un enlace nuevo.'); }, Math.max(0, new Date(expiresAt).getTime() - Date.now()));
};
function fail(error: unknown) {
  if (stopped) return;
  const name = error instanceof DOMException ? error.name : '';
  const message = name === 'NotAllowedError' ? 'No se permitió la cámara. Habilítala en los permisos de este sitio y vuelve a intentarlo.'
    : name === 'NotFoundError' ? 'No encontramos una cámara en este dispositivo.'
      : name === 'NotReadableError' ? 'La cámara está ocupada. Cierra otras aplicaciones que la estén usando.'
        : error instanceof Error ? error.message : 'No se pudo iniciar la cámara AR. Puedes usar el visor 3D.';
  stop(); notify('error', message);
}
window.addEventListener('unhandledrejection', (event) => { event.preventDefault(); fail(event.reason); });
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.channel !== CAKE_AR_CHANNEL) return;
  if (event.data.action === 'start' && !started && event.data.input?.snapshot) {
    started = true;
    void start(event.data.input as CakeArInput).catch(fail);
    return;
  }
  if (started) adjustPlacement?.(event.data.action, Number(event.data.value));
});
parent.postMessage({ channel: CAKE_AR_CHANNEL, ready: true }, location.origin);
