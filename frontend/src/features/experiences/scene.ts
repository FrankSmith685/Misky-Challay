import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ExperienceScene } from './experiences.service';

export interface SceneMedia {
  poster?: string;
  model?: string;
  video?: string;
  audio?: string;
  target?: string;
  targets?: string[];
  image?: string;
}
export const createExperienceObject = async (config: ExperienceScene, media: SceneMedia) => {
  const root = new THREE.Group();
  const content = new THREE.Group();
  root.add(content);
  const disposables: Array<() => void> = [];
  let mixer: THREE.AnimationMixer | undefined;
  const animate: Array<(time: number) => void> = [];
  const appearance = Object.assign({
    preset: 'PASTRY' as const,
    exposure: 1,
    ambientIntensity: 1.8,
    keyIntensity: 2.3,
    roughness: 0.62,
    metalness: 0,
  } as ExperienceScene['appearance'], config.appearance ?? {});
  const materialFinish = appearance.preset === 'ELEGANT'
    ? { roughness: appearance.roughness * 0.82, metalness: Math.min(appearance.metalness + 0.08, 1) }
    : appearance.preset === 'NIGHT'
      ? { roughness: Math.min(appearance.roughness + 0.12, 1), metalness: appearance.metalness }
      : { roughness: appearance.roughness, metalness: appearance.metalness };
  const mesh = (
    geometry: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    parent = content,
  ) => {
    const object = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: materialFinish.roughness, metalness: materialFinish.metalness }),
    );
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  if (config.content === 'CAKE') {
    const cake = new THREE.Group();
    content.add(cake);

    const plate = mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.08, 64), '#f7eee7', cake);
    plate.position.y = -0.56;

    const base = mesh(new THREE.CylinderGeometry(0.9, 0.96, 0.5, 64), '#b15a83', cake);
    base.position.y = -0.29;
    const baseTop = mesh(new THREE.CylinderGeometry(0.91, 0.91, 0.1, 64), '#fff6ec', cake);
    baseTop.position.y = -0.02;

    const upper = mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.4, 64), '#d8a06d', cake);
    upper.position.y = 0.26;
    const upperTop = mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.1, 64), '#fffaf2', cake);
    upperTop.position.y = 0.49;

    const frosting = mesh(new THREE.TorusGeometry(0.83, 0.055, 12, 64), '#fffaf2', cake);
    frosting.rotation.x = Math.PI / 2;
    frosting.position.y = -0.06;
    const upperFrosting = mesh(new THREE.TorusGeometry(0.58, 0.045, 12, 64), '#fffaf2', cake);
    upperFrosting.rotation.x = Math.PI / 2;
    upperFrosting.position.y = 0.5;

    const candle = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.35, 24), '#c89551', cake);
    candle.position.set(0, 0.72, 0);
    const flame = mesh(new THREE.SphereGeometry(0.09, 20, 16), '#f4b84b', cake);
    flame.position.set(0, 0.96, 0);
    flame.scale.set(0.65, 1.35, 0.65);

    for (const [x, z, color] of [
      [-0.3, 0.1, '#c89551'],
      [0.28, -0.06, '#f6c2cf'],
      [-0.12, -0.27, '#f4b84b'],
      [0.38, 0.2, '#8d5a9e'],
    ] as const) {
      const berry = mesh(new THREE.SphereGeometry(0.075, 18, 14), color, cake);
      berry.position.set(x, 0.58, z);
    }

    const sparkleGroup = new THREE.Group();
    cake.add(sparkleGroup);
    for (let i = 0; i < 10; i += 1) {
      const sparkle = mesh(new THREE.OctahedronGeometry(0.025, 0), i % 2 ? '#f4b84b' : config.color, sparkleGroup);
      const angle = (i / 10) * Math.PI * 2;
      sparkle.position.set(Math.cos(angle) * (0.95 + (i % 3) * 0.05), 0.15 + (i % 4) * 0.18, Math.sin(angle) * 0.6);
      sparkle.scale.setScalar(0.8 + (i % 3) * 0.2);
    }
    animate.push((t) => {
      cake.position.y = Math.sin(t * 1.4) * 0.045;
      cake.rotation.y = Math.sin(t * 0.55) * 0.08;
      flame.scale.y = 1.15 + Math.sin(t * 8) * 0.22;
      sparkleGroup.rotation.y = t * 0.18;
    });
  } else if (config.content === 'ALIEN') {
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
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
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
  for (const layer of config.layers ?? []) {
    if (!layer.visible || !layer.text.trim()) continue;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) continue;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = layer.kind === 'TEXT' ? 'rgba(36, 28, 48, 0.82)' : config.color;
    context.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.fillStyle = '#fffaf5';
    context.font = layer.kind === 'BUTTON' ? '700 34px Arial' : '600 32px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const text = layer.text.length > 42 ? `${layer.text.slice(0, 39)}...` : layer.text;
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    sprite.position.set(layer.position.x, layer.position.y, layer.position.z);
    const width = layer.kind === 'BUTTON' ? 1.25 : layer.kind === 'HOTSPOT' ? 1.15 : 1.65;
    sprite.scale.set(width * layer.scale, 0.28 * layer.scale, 1);
    content.add(sprite);
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
        if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
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
