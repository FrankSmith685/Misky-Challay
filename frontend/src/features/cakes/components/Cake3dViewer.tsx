import { useEffect, useRef, useState } from 'react';
import { Camera, Maximize2, Pause, Play, RotateCcw, ScanLine, ZoomIn, ZoomOut } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CakePreviewSnapshot } from '../cakePreview.service';
import { cakeDimensions, createCakeModel, disposeCakeModel } from '../utils/cake3dModel';
import { prepareImportedCakeModel, updateImportedCakeModel } from '../utils/importedCakeModel';
import { cakeReconstructionApi } from '../cakeReconstruction.service';
import { cakePreviewDesign } from '../utils/cakeVisualDesign';

interface ViewerActions {
  update: () => void;
  reset: () => void;
  zoom: (factor: number) => void;
  rotate: (enabled: boolean) => void;
  capture: () => string;
  startAr: () => Promise<void>;
  stopAr: () => Promise<void>;
}

export const Cake3dViewer = ({ config: incomingConfig, referenceDataUrl, sourceReference, modelToken = null, onExpand, large = false, compact = false, initialInterior = false, interiorValue, onInteriorChange }: { config: CakePreviewSnapshot; referenceDataUrl?: string | null; sourceReference?: string | null; modelToken?: string | null; onExpand?: () => void; large?: boolean; compact?: boolean; initialInterior?: boolean; interiorValue?: boolean; onInteriorChange?: (value: boolean) => void }) => {
  const config = { ...incomingConfig, visualDesign: cakePreviewDesign(incomingConfig.visualDesign) };
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerActions | null>(null);
  const [localInterior, setInterior] = useState(initialInterior);
  const interior = interiorValue ?? localInterior;
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [modelLoading, setModelLoading] = useState(false);
  const [lowDepth, setLowDepth] = useState(false);
  const [estimatedBack, setEstimatedBack] = useState(false);
  const [arSupported, setArSupported] = useState(false);
  const [arActive, setArActive] = useState(false);
  const [arBusy, setArBusy] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [comparisonToken, setComparisonToken] = useState<string | null>(null);
  const comparing = Boolean(modelToken && sourceReference && comparisonToken === modelToken);
  const source = referenceDataUrl ?? config.referenceImageDataUrl ?? '';
  const [decoded, setDecoded] = useState<{ source: string; image: HTMLImageElement | null; error: string }>({ source: '', image: null, error: '' });
  const referenceImage = decoded.source === source ? decoded.image : null;
  const stateRef = useRef({ config, interior, referenceImage, modelToken });
  stateRef.current = { config, interior, referenceImage, modelToken };
  const signature = JSON.stringify(config);
  const dimensions = cakeDimensions(config);
  const changeInterior = (value: boolean) => { setInterior(value); onInteriorChange?.(value); };

  useEffect(() => {
    let active = true;
    if (!source) { setDecoded({ source, image: null, error: '' }); return; }
    const image = new Image();
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(source)) {
      setDecoded({ source, image: null, error: 'El formato de la referencia no es compatible.' });
      return;
    }
    image.src = source;
    void image.decode().then(() => { if (active) setDecoded({ source, image, error: '' }); })
      .catch(() => { if (active) setDecoded({ source, image: null, error: 'No pudimos abrir la imagen en 3D. Prueba otra foto.' }); });
    return () => { active = false; };
  }, [source]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    const cleanup: Array<() => void> = [];
    setError('');
    setRotating(false);
    setArActive(false);
    setArSupported(false);
    setLowDepth(false);
    setEstimatedBack(false);
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#f5f0e9');
      const camera = new THREE.PerspectiveCamera(38, 1, .001, 20);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local');
      renderer.domElement.setAttribute('aria-label', 'Vista 3D de tu torta. Usa los botones para ampliar, girar y ver el interior.');
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
      host.appendChild(renderer.domElement);
      cleanup.push(() => { renderer.dispose(); renderer.domElement.remove(); });
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = .09;
      controls.maxPolarAngle = Math.PI * .49;
      controls.autoRotateSpeed = .65;
      cleanup.push(() => controls.dispose());
      const ambient = new THREE.HemisphereLight('#fffaf5', '#b4a28f', 1.7);
      scene.add(ambient);
      const keyLight = new THREE.DirectionalLight('#fff5e7', 2.3);
      keyLight.position.set(.6, 1, .7);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -.6;
      keyLight.shadow.camera.right = keyLight.shadow.camera.top = .6;
      keyLight.shadow.camera.near = .01;
      keyLight.shadow.camera.far = 4;
      keyLight.shadow.bias = -.0003;
      keyLight.shadow.radius = 3;
      scene.add(keyLight);
      cleanup.push(() => keyLight.shadow.dispose());
      const rim = new THREE.DirectionalLight('#ffffff', .8);
      rim.position.set(-.7, .3, -.3);
      scene.add(rim);
      let studio: THREE.WebGLRenderTarget | null = null;
      const studioEnvironment = () => {
        if (!studio) {
          const generator = new THREE.PMREMGenerator(renderer);
          const room = new RoomEnvironment();
          try { studio = generator.fromScene(room, .04); }
          finally { room.dispose(); generator.dispose(); }
        }
        return studio.texture;
      };
      cleanup.push(() => studio?.dispose());
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: .12 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -.0005;
      floor.receiveShadow = true;
      floor.visible = false;
      scene.add(floor);
      cleanup.push(() => disposeCakeModel(floor));
      const modelSignature = () => JSON.stringify([stateRef.current.config, stateRef.current.interior, stateRef.current.referenceImage?.src]);
      const dimensionSignature = () => JSON.stringify([cakeDimensions(stateRef.current.config), stateRef.current.config.visualDesign?.image.placement, Boolean(stateRef.current.referenceImage)]);
      let cake = createCakeModel(stateRef.current.config, stateRef.current.interior, stateRef.current.referenceImage);
      scene.add(cake);
      cleanup.push(() => disposeCakeModel(cake));
      let modelKey = modelSignature();
      let modelDimensions = dimensionSignature();
      let requestedModel: string | null = null;
      let loadedModel: string | null = null;
      let modelRequest = new AbortController();
      let loadVersion = 0;
      cleanup.push(() => { loadVersion++; modelRequest.abort(); });
      const reticle = new THREE.Mesh(new THREE.RingGeometry(.075, .085, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9d5d70', side: THREE.DoubleSide }));
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);
      cleanup.push(() => disposeCakeModel(reticle));
      let session: XRSession | null = null;
      let hitSource: XRHitTestSource | null = null;
      let frameHandle = 0;
      let visible = true;
      let lastFrame = performance.now();
      const invalidate = () => {
        if (!active || !visible || document.hidden || renderer.xr.isPresenting || frameHandle) return;
        frameHandle = window.requestAnimationFrame((time) => {
          frameHandle = 0;
          if (!active || !visible || document.hidden || renderer.xr.isPresenting) return;
          controls.update(Math.min((time - lastFrame) / 1000, .05));
          lastFrame = time;
          renderer.render(scene, camera);
          if (controls.autoRotate) invalidate();
        });
      };
      const frameModel = () => {
        const box = new THREE.Box3().setFromObject(cake);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        controls.target.copy(sphere.center);
        const size = box.getSize(new THREE.Vector3());
        const elevation = size.y < Math.max(size.x, size.z) * .65 ? 1.3 : .65;
        const angle = cake.userData.photoFront === 'negative-z' ? new THREE.Vector3(-.4, 1.2, -2.4) : stateRef.current.modelToken ? new THREE.Vector3(.2, elevation, 2.4) : new THREE.Vector3(1.35, .95, 1.65);
        const direction = angle.normalize();
        const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
        const up = new THREE.Vector3().crossVectors(direction, right);
        const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        let distance = 0;
        const point = new THREE.Vector3();
        const include = () => {
          point.sub(sphere.center);
          distance = Math.max(distance, Math.abs(point.dot(right)) / (tanY * camera.aspect) + point.dot(direction), Math.abs(point.dot(up)) / tanY + point.dot(direction));
        };
        // Fit the visible surface. The empty corners of a box around a round,
        // low cake otherwise push the camera back and leave wide margins.
        cake.updateWorldMatrix(true, true);
        cake.traverseVisible((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const positions = object.geometry.getAttribute('position');
          if (!positions) return;
          for (let index = 0; index < positions.count; index++) {
            point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
            include();
          }
        });
        camera.position.copy(direction.multiplyScalar(Math.max(distance * 1.08, sphere.radius * 1.15)).add(sphere.center));
        controls.minDistance = sphere.radius * 1.4;
        controls.maxDistance = sphere.radius * 12;
        controls.update();
        invalidate();
      };
      const resize = () => {
        if (renderer.xr.isPresenting) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        frameModel();
      };
      const update = () => {
        if (session) return;
        const nextToken = stateRef.current.modelToken;
        if (nextToken) {
          if (requestedModel !== nextToken) {
            requestedModel = nextToken;
            loadedModel = null;
            modelRequest.abort(); modelRequest = new AbortController();
            const version = ++loadVersion;
            setModelLoading(true); setError('');
            setLowDepth(false);
            setEstimatedBack(false);
            // A different photo must never leave the previous reconstructed cake visible.
            cake.visible = false;
            void cakeReconstructionApi.model(nextToken, modelRequest.signal)
              .then((buffer) => new GLTFLoader().parseAsync(buffer, ''))
              .then((gltf) => {
                if (!active || version !== loadVersion) { disposeCakeModel(gltf.scene); return; }
                let imported: THREE.Group;
                try { imported = prepareImportedCakeModel(gltf.scene, stateRef.current.config); }
                catch (error) { disposeCakeModel(gltf.scene); throw error; }
                scene.remove(cake); disposeCakeModel(cake);
                cake = imported;
                setLowDepth(Boolean(cake.userData.lowDepth));
                setEstimatedBack(Boolean(cake.userData.estimatedBack));
                scene.environment = cake.userData.physicalPhoto ? studioEnvironment() : null;
                loadedModel = nextToken;
                // The source colors already contain photographic lighting.
                ambient.intensity = 1.8; keyLight.intensity = 2.3; rim.intensity = .4;
                if (cake.userData.physicalPhoto) { ambient.intensity = .7; keyLight.intensity = 1.3; rim.intensity = .35; }
                ambient.color.set('#ffffff'); ambient.groundColor.set('#d9cfc4');
                const front = cake.userData.photoFront === 'negative-z' ? -1 : 1;
                keyLight.position.set(.6 * front, 1, .7 * front);
                rim.position.set(-.7 * front, .3, -.3 * front);
                floor.visible = true;
                scene.add(cake); frameModel(); setModelLoading(false);
              }).catch(() => {
                if (!active || version !== loadVersion) return;
                setModelLoading(false); setError('No pudimos abrir el modelo generado. Pulsa Recargar visor para reintentarlo.');
              });
          } else if (loadedModel === nextToken) {
            const previousScale = cake.scale.x;
            updateImportedCakeModel(cake, stateRef.current.config);
            if (cake.scale.x !== previousScale) frameModel();
            invalidate();
          }
          return;
        }
        if (requestedModel) { requestedModel = null; loadedModel = null; ++loadVersion; modelRequest.abort(); modelKey = ''; setModelLoading(false); ambient.intensity = 1.7; keyLight.intensity = 2.3; rim.intensity = .8; ambient.color.set('#fffaf5'); ambient.groundColor.set('#b4a28f'); keyLight.position.set(.6, 1, .7); rim.position.set(-.7, .3, -.3); floor.visible = false; }
        const nextKey = modelSignature();
        if (modelKey === nextKey) return;
        scene.environment = null;
        scene.remove(cake);
        disposeCakeModel(cake);
        cake = createCakeModel(stateRef.current.config, stateRef.current.interior, stateRef.current.referenceImage);
        scene.add(cake);
        modelKey = nextKey;
        const nextDimensions = dimensionSignature();
        if (modelDimensions !== nextDimensions) frameModel();
        modelDimensions = nextDimensions;
        invalidate();
      };
      controls.addEventListener('change', invalidate);
      cleanup.push(() => controls.removeEventListener('change', invalidate));
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      cleanup.push(() => observer.disconnect());
      const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) invalidate(); });
      visibility.observe(host);
      cleanup.push(() => visibility.disconnect());
      document.addEventListener('visibilitychange', invalidate);
      cleanup.push(() => document.removeEventListener('visibilitychange', invalidate));
      const contextLost = (event: Event) => {
        event.preventDefault();
        if (active) setError('El visor perdió la conexión gráfica. Vuelve a cargarlo para continuar.');
      };
      renderer.domElement.addEventListener('webglcontextlost', contextLost);
      cleanup.push(() => renderer.domElement.removeEventListener('webglcontextlost', contextLost));
      const controller = renderer.xr.getController(0);
      controller.addEventListener('select', () => {
        if (!reticle.visible || !session) return;
        cake.position.setFromMatrixPosition(reticle.matrix);
        cake.visible = true;
        if (active) setPlaced(true);
      });
      scene.add(controller);

      viewerRef.current = {
        update, reset: frameModel,
        zoom: (factor) => {
          const offset = camera.position.clone().sub(controls.target);
          offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
          camera.position.copy(controls.target).add(offset);
          controls.update();
          invalidate();
        },
        rotate: (enabled) => { controls.autoRotate = enabled; invalidate(); },
        capture: () => {
          renderer.render(scene, camera);
          const card = document.createElement('canvas');
          const source = renderer.domElement;
          card.width = Math.max(source.width, 640);
          const ratio = card.width / source.width;
          card.height = Math.round(source.height * ratio + 108);
          const ctx = card.getContext('2d');
          if (!ctx) throw new Error('No se pudo crear la imagen');
          ctx.fillStyle = '#f5f0e9';
          ctx.fillRect(0, 0, card.width, card.height);
          ctx.drawImage(source, 0, 0, card.width, source.height * ratio);
          ctx.fillStyle = '#44352e';
          ctx.font = '600 23px sans-serif';
          ctx.fillText(stateRef.current.config.themeName ?? stateRef.current.config.productName, 24, card.height - 68, card.width - 48);
          ctx.font = '17px sans-serif';
          ctx.fillText(`${stateRef.current.config.variantName} · Vista ilustrativa`, 24, card.height - 38, card.width - 48);
          return card.toDataURL('image/png');
        },
        stopAr: async () => { await session?.end(); },
        startAr: async () => {
          if (session || !navigator.xr) return;
          const previousCamera = camera.position.clone();
          const previousTarget = controls.target.clone();
          const previousRotation = controls.autoRotate;
          const overlay = overlayRef.current;
          const nextSession = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            ...(overlay ? { optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } } : {}),
          });
          if (!active) { await nextSession.end(); return; }
          session = nextSession;
          floor.visible = false;
          session.addEventListener('end', () => {
            hitSource?.cancel();
            hitSource = null;
            session = null;
            floor.visible = Boolean(loadedModel);
            renderer.setAnimationLoop(null);
            if (!active) return;
            scene.background = new THREE.Color('#f5f0e9');
            cake.position.set(0, 0, 0);
            cake.visible = true;
            reticle.visible = false;
            controls.enabled = true;
            controls.autoRotate = previousRotation;
            camera.position.copy(previousCamera);
            controls.target.copy(previousTarget);
            update();
            resize();
            invalidate();
            setArActive(false);
            setPlaced(false);
          }, { once: true });
          try {
            await renderer.xr.setSession(session);
            const viewerSpace = await session.requestReferenceSpace('viewer');
            if (!session.requestHitTestSource) throw new Error('No se encontró una superficie');
            hitSource = await session.requestHitTestSource({ space: viewerSpace }) ?? null;
            if (!hitSource) throw new Error('No se encontró una superficie');
            scene.background = null;
            cake.visible = false;
            controls.enabled = false;
            window.cancelAnimationFrame(frameHandle);
            frameHandle = 0;
            renderer.setAnimationLoop((_time, frame) => {
              if (!frame || !hitSource) return;
              const space = renderer.xr.getReferenceSpace();
              const pose = space ? frame.getHitTestResults(hitSource)[0]?.getPose(space) : null;
              reticle.visible = Boolean(pose);
              if (pose) reticle.matrix.fromArray(pose.transform.matrix);
              renderer.render(scene, camera);
            });
            setPlaced(false);
            setArActive(true);
          } catch (cause) {
            await nextSession.end().catch(() => undefined);
            throw cause;
          }
        },
      };
      cleanup.push(() => {
        window.cancelAnimationFrame(frameHandle);
        renderer.setAnimationLoop(null);
        hitSource?.cancel();
        hitSource = null;
        void session?.end().catch(() => undefined);
      });
      resize();
      frameModel();
      update();
      if (window.isSecureContext && navigator.xr) {
        void navigator.xr.isSessionSupported('immersive-ar').then((supported) => { if (active) setArSupported(supported); }).catch(() => undefined);
      }
    } catch {
      cleanup.splice(0).reverse().forEach((dispose) => dispose());
      viewerRef.current = null;
      setError('No pudimos iniciar el visor 3D. Vuelve a cargarlo o usa otro navegador.');
    }
    return () => {
      active = false;
      viewerRef.current = null;
      cleanup.reverse().forEach((dispose) => dispose());
    };
  }, [retry]);

  useEffect(() => { viewerRef.current?.update(); }, [signature, interior, referenceImage, modelToken, retry]);

  const download = () => {
    try {
      const url = viewerRef.current?.capture();
      if (!url) return;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `torta-${config.productSlug}-3d.png`;
      anchor.click();
    } catch { setError('No se pudo guardar la imagen. Inténtalo otra vez.'); }
  };
  const toggleAr = async () => {
    if (arBusy) return;
    setArBusy(true);
    setError('');
    try {
      if (arActive) await viewerRef.current?.stopAr();
      else await viewerRef.current?.startAr();
    } catch { setError('No pudimos abrir la cámara. Revisa los permisos del navegador y vuelve a intentarlo.'); }
    finally { setArBusy(false); }
  };
  const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink transition hover:bg-brand-50 disabled:opacity-40';
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      {modelToken ? sourceReference ? <div className="inline-flex rounded-card border border-line bg-surface-muted p-1" aria-label="Comparar reconstrucción y foto">{([false, true] as const).map((photo) => <button type="button" key={String(photo)} disabled={arActive} aria-pressed={comparing === photo} onClick={() => { setComparisonToken(photo ? modelToken : null); if (photo) { viewerRef.current?.rotate(false); setRotating(false); } }} className={`min-h-8 rounded-field px-3 text-xs font-semibold ${comparing === photo ? 'bg-white text-brand-800 shadow-sm' : 'text-ink-muted'}`}>{photo ? 'Foto original' : 'Modelo 3D'}</button>)}</div> : <span className="inline-flex min-h-10 items-center rounded-card bg-brand-50 px-3 text-xs font-semibold text-brand-800">Modelo de tu foto</span> : <div className="inline-flex rounded-lg border border-line bg-surface-muted p-1" aria-label="Tipo de vista">
        <button type="button" disabled={arActive} aria-pressed={!interior} onClick={() => changeInterior(false)} className={`min-h-8 rounded-md px-3 text-xs font-semibold ${!interior ? 'bg-white text-brand-800 shadow-sm' : 'text-ink-muted'}`}>Exterior</button>
        <button type="button" disabled={arActive} aria-pressed={interior} onClick={() => changeInterior(true)} className={`min-h-8 rounded-md px-3 text-xs font-semibold ${interior ? 'bg-white text-brand-800 shadow-sm' : 'text-ink-muted'}`}>Ver interior</button>
      </div>}
      {onExpand && <button type="button" className={button} onClick={onExpand}><Maximize2 className="size-3.5" /> Ampliar</button>}
    </div>
    <div className="relative overflow-hidden rounded-card">
      <div ref={hostRef} aria-hidden={comparing || undefined} className={`relative w-full overflow-hidden bg-[#f5f0e9] ${large ? 'h-[42dvh] min-h-56 md:h-[46dvh]' : compact ? 'aspect-[3/2]' : 'h-80 sm:h-96'}`} />
      {comparing && <figure className="absolute inset-0 flex flex-col bg-surface-muted p-3"><img src={sourceReference!} alt="Foto original de la torta para comparar con el modelo 3D" className="min-h-0 flex-1 object-contain" /><figcaption className="pt-2 text-center text-[11px] font-semibold text-ink-muted">Tu referencia · vuelve a Modelo 3D para girar la torta</figcaption></figure>}
    </div>
    {modelLoading && <p role="status" className="text-xs text-brand-800">Abriendo la forma y las texturas de tu torta…</p>}
    {modelToken && lowDepth && !modelLoading && !error && <p role="status" className="rounded-card border border-line bg-surface-muted p-3 text-xs leading-5 text-ink-muted">La reconstrucción no recuperó bien la profundidad de esta torta. Puedes girarla y compararla con tu foto. Una foto tomada ligeramente de lado puede ayudar a mostrar mejor el volumen.</p>}
    {source && decoded.source !== source && <p role="status" className="text-xs text-ink-muted">Aplicando tu imagen al modelo…</p>}
    {decoded.source === source && decoded.error && <p role="alert" className="text-xs text-red-700">{decoded.error}</p>}
    {!modelToken && interior && referenceImage && <p className="text-xs text-ink-muted">Vuelve a Exterior para ver la referencia.</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800"><span className="flex-1">{error}</span><button type="button" onClick={() => setRetry((current) => current + 1)} className="font-semibold underline">Recargar visor</button></div>}
    <div className={`flex flex-wrap gap-1.5 ${comparing ? 'hidden' : ''}`} aria-label="Controles del modelo 3D">
      <button type="button" className={button} disabled={arActive} onClick={() => viewerRef.current?.zoom(.82)} aria-label="Acercar torta"><ZoomIn className="size-4" /></button>
      <button type="button" className={button} disabled={arActive} onClick={() => viewerRef.current?.zoom(1.22)} aria-label="Alejar torta"><ZoomOut className="size-4" /></button>
      <button type="button" className={button} disabled={arActive} onClick={() => viewerRef.current?.reset()} aria-label="Restablecer vista"><RotateCcw className="size-4" /></button>
      <button type="button" className={button} disabled={arActive} aria-pressed={rotating} onClick={() => { viewerRef.current?.rotate(!rotating); setRotating(!rotating); }}>{rotating ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{rotating ? 'Pausar' : 'Girar'}</button>
      <button type="button" className={button} disabled={arActive} onClick={download} aria-label="Guardar imagen"><Camera className="size-3.5" />{!compact && <span className={large ? 'hidden md:inline' : ''}>Guardar imagen</span>}</button>
    </div>
    <div className={`${large ? 'hidden md:flex' : 'flex'} flex-wrap items-center justify-between gap-2 text-[11px] leading-4 text-ink-muted`}><span>Arrastra para girar · pellizca para ampliar</span>{!compact && <span>{modelToken ? 'Escala orientativa del modelo' : dimensions.estimated ? 'Tamaño orientativo' : `Diámetro de referencia: ${config.diameterCm} cm`}</span>}</div>
    {arSupported && <button type="button" disabled={arBusy} onClick={() => void toggleAr()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white disabled:opacity-50"><ScanLine className="size-4" />{arBusy ? 'Abriendo cámara…' : arActive ? 'Salir de la cámara' : 'Ver sobre mi mesa'}</button>}
    <div ref={overlayRef} className={arActive ? 'pointer-events-none fixed inset-0 z-[2000] flex flex-col justify-between p-5' : 'hidden'}>
      <p className="rounded-xl bg-black/70 p-4 text-center text-sm font-semibold text-white">{placed ? 'La torta está colocada. Toca otro punto para moverla.' : 'Mueve el celular para encontrar la mesa y toca el círculo para colocar la torta.'}</p>
      <button type="button" onClick={() => void toggleAr()} className="pointer-events-auto self-center rounded-full bg-white px-5 py-3 text-sm font-bold text-ink">Salir de la cámara</button>
    </div>
    <p className={`${large ? 'hidden md:block ' : ''}text-[11px] leading-4 text-ink-muted`}>{modelToken ? compact ? `Vista aproximada${estimatedBack ? '; zonas ocultas estimadas' : ''}. Confirma el acabado con la pastelería.` : `${estimatedBack ? 'Los colores visibles provienen de tu foto; las zonas que no se ven son estimadas. ' : ''}Reconstrucción aproximada. El tamaño y los acabados se confirman con la pastelería.` : `${interior ? 'El corte muestra los sabores y el relleno elegidos. ' : ''}${compact ? 'Vista aproximada. El acabado se confirma con la pastelería.' : 'Vista ilustrativa; la pastelería confirma el acabado y las medidas finales.'}`}</p>
  </div>;
};
