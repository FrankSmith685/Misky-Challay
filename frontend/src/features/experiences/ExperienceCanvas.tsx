import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createExperienceObject, type SceneMedia } from './scene';
import type { ExperienceScene } from './experiences.service';
import { Move, ZoomIn } from 'lucide-react';

export default function ExperienceCanvas({
  scene: config,
  media,
  large = false,
}: {
  scene: ExperienceScene;
  media: SceneMedia;
  large?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const node = container.current!;
    let disposed = false;
    let object: Awaited<ReturnType<typeof createExperienceObject>> | undefined;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resize: ResizeObserver | undefined;
    setError('');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const appearance = Object.assign({
        exposure: 1,
        ambientIntensity: 1.8,
        keyIntensity: 2.3,
        environment: 'ROOM' as const,
        toneMapping: 'ACES' as const,
      } as ExperienceScene['appearance'], config.appearance ?? {});
      renderer.toneMapping = appearance.toneMapping === 'NONE' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = appearance.exposure;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      node.append(renderer.domElement);
      const scene = new THREE.Scene();
      const environment = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(renderer);
      if (appearance.environment === 'ROOM') scene.environment = pmrem.fromScene(environment, 0.04).texture;
      environment.dispose();
      pmrem.dispose();
      const cameraSettings = Object.assign({ autoRotate: true, autoRotateSpeed: 0.65, fov: 38, distance: 2.4 } as ExperienceScene['camera'], config.camera ?? {});
      const camera = new THREE.PerspectiveCamera(cameraSettings.fov, 1, 0.01, 100);
      camera.position.set(0, 0.7, cameraSettings.distance + 1.9);
      scene.add(new THREE.HemisphereLight('#fff7ec', '#827a8f', appearance.ambientIntensity));
      const light = new THREE.DirectionalLight('#ffffff', appearance.keyIntensity);
      light.position.set(2, 3, 4);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.near = 0.01;
      light.shadow.camera.far = 8;
      light.shadow.bias = -0.0002;
      scene.add(light);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.25, 0);
      controls.autoRotate = cameraSettings.autoRotate;
      controls.autoRotateSpeed = cameraSettings.autoRotateSpeed;
      controls.enablePan = false;
      controls.minDistance = 2;
      controls.maxDistance = 7;
      controls.update();
      resize = new ResizeObserver(() => {
        if (!renderer) return;
        renderer.setSize(node.clientWidth, node.clientHeight);
        camera.aspect = node.clientWidth / Math.max(node.clientHeight, 1);
        camera.updateProjectionMatrix();
      });
      resize.observe(node);
      const clock = new THREE.Clock();
      void createExperienceObject(config, media)
        .then((value) => {
          if (disposed) value.dispose();
          else {
            object = value;
            scene.add(value.root);
          }
        })
        .catch((e: Error) => {
          if (!disposed) setError(e.message);
        });
      renderer.setAnimationLoop(() => {
        const delta = Math.min(clock.getDelta(), 0.1);
        object?.update(clock.elapsedTime, delta);
        controls?.update();
        renderer?.render(scene, camera);
      });
    } catch {
      setError('No se pudo iniciar la vista 3D en este navegador. Puedes ver el video.');
    }
    return () => {
      disposed = true;
      resize?.disconnect();
      controls?.dispose();
      renderer?.setAnimationLoop(null);
      object?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      node.replaceChildren();
    };
  }, [config, media]);
  return (
    <div className={`exp-stage ${large ? 'exp-stage--large' : ''}`}>
      <div
        ref={container}
        className="exp-stage__canvas w-full"
        role="img"
        aria-label="Escena 3D animada; arrastra para girar"
      />
      {error && (
        <p className="p-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <p className="exp-stage__caption">
        <Move size={13} aria-hidden="true" />
        Arrastra para girar<span aria-hidden="true">·</span>
        <ZoomIn size={13} aria-hidden="true" />
        Pellizca para acercar
      </p>
    </div>
  );
}
