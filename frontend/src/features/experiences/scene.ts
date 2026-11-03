import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ExperienceScene } from './experiences.service';

export interface SceneMedia {
  poster?: string;
  model?: string;
  video?: string;
  audio?: string;
  target?: string;
  image?: string;
}
export const createExperienceObject = async (config: ExperienceScene, media: SceneMedia) => {
  const root = new THREE.Group();
  const content = new THREE.Group();
  root.add(content);
  const disposables: Array<() => void> = [];
  let mixer: THREE.AnimationMixer | undefined;
  const animate: Array<(time: number) => void> = [];
  const mesh = (
    geometry: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    parent = content,
  ) => {
    const object = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
    );
    parent.add(object);
    return object;
  };
  if (config.content === 'ALIEN') {
    const alien = new THREE.Group();
    content.add(alien);
    mesh(new THREE.SphereGeometry(0.37, 32, 24), config.color, alien).scale.set(1, 1.15, 0.7);
    const head = mesh(new THREE.SphereGeometry(0.38, 32, 24), config.color, alien);
    head.position.y = 0.66;
    head.scale.set(1.3, 1, 0.8);
    for (const sign of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.14, 20, 16), '#20242c', alien);
      eye.scale.set(0.7, 1.2, 0.35);
      eye.position.set(sign * 0.2, 0.69, 0.28);
      eye.rotation.z = sign * -0.3;
      const shine = mesh(new THREE.SphereGeometry(0.025, 12, 8), '#ffffff', alien);
      shine.position.set(sign * 0.2 - 0.02, 0.73, 0.333);
      const foot = mesh(new THREE.SphereGeometry(0.14, 16, 12), config.color, alien);
      foot.scale.set(1, 0.6, 1.5);
      foot.position.set(sign * 0.2, -0.38, 0.05);
      const arm = new THREE.Group();
      arm.position.set(sign * 0.29, 0.24, 0);
      alien.add(arm);
      const hand = mesh(new THREE.CapsuleGeometry(0.07, 0.4, 6, 12), config.color, arm);
      hand.position.set(sign * 0.15, 0.17, 0);
      hand.rotation.z = sign * -0.6;
      animate.push((t) => {
        arm.rotation.z = sign * (0.3 + Math.sin(t * 3) * 0.24);
      });
    }
    const ring = mesh(new THREE.TorusGeometry(0.65, 0.035, 8, 64), '#c89551');
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.48;
    for (let i = 0; i < 10; i++) {
      const star = mesh(new THREE.OctahedronGeometry(0.025), i % 2 ? '#c89551' : '#a6809c');
      animate.push((t) => {
        const a = i * Math.PI * 0.2 + t * 0.25;
        star.position.set(Math.cos(a) * 0.85, Math.sin(t + i) * 0.2 + 0.4, Math.sin(a) * 0.6);
        star.rotation.y = t;
      });
    }
    animate.push((t) => {
      alien.position.y = Math.sin(t * 1.5) * 0.06;
      alien.rotation.y = Math.sin(t * 0.6) * 0.15;
    });
  } else if (config.content === 'MODEL' || config.content === 'COMBINED') {
    if (!media.model) throw new Error('Falta el modelo de esta escena.');
    const gltf = await new GLTFLoader().loadAsync(media.model);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    gltf.scene.position.sub(center);
    const holder = new THREE.Group();
    holder.add(gltf.scene);
    holder.scale.setScalar(1.7 / Math.max(size.x, size.y, size.z, 0.001));
    content.add(holder);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      mixer
        .clipAction(gltf.animations[Math.min(config.animationIndex, gltf.animations.length - 1)])
        .play();
    }
  }
  if (config.videoOnTarget && media.video) {
    const video = document.createElement('video');
    video.src = media.video;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.01),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    plane.position.set(0, config.content === 'VIDEO' ? 0.2 : 1.35, -0.1);
    content.add(plane);
    video.play().catch(() => undefined);
    disposables.push(() => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      texture.dispose();
    });
  }
  root.scale.setScalar(config.scale);
  root.position.set(config.position.x, config.position.y, config.position.z);
  root.rotation.y = (config.rotation * Math.PI) / 180;
  return {
    root,
    update: (time: number, delta: number) => {
      for (const fn of animate) fn(time);
      mixer?.update(delta);
    },
    dispose: () => {
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(mixer.getRoot());
      for (const fn of disposables) fn();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of materials) {
            for (const value of Object.values(m))
              if (value instanceof THREE.Texture) value.dispose();
            m.dispose();
          }
        }
      });
    },
  };
};
