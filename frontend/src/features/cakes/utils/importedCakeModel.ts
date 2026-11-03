import * as THREE from 'three';
import type { CakePreviewSnapshot } from '../cakePreview.service';
import { cakeDimensions } from './cake3dModel';
import { cakePhotoSurface } from './cakePhotoSurface';
import { smoothCakeSurface } from './smoothCakeSurface';

/** Preserve the generated shape, center it on the table and scale its width to the selected presentation. */
export const prepareImportedCakeModel = (asset: THREE.Group, config: CakePreviewSnapshot) => {
  const box = new THREE.Box3().setFromObject(asset);
  const size = box.getSize(new THREE.Vector3());
  const width = Math.max(size.x, size.z);
  if (!Number.isFinite(width) || width < .000001 || !Number.isFinite(size.y) || size.y < .000001) throw new Error('El modelo generado no tiene volumen válido.');
  const center = box.getCenter(new THREE.Vector3());
  asset.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  const root = new THREE.Group();
  root.name = 'reconstructed-cake';
  root.userData.originalWidth = width;
  root.userData.lowDepth = Math.min(size.x, size.z) / width < .2;
  root.add(asset);
  root.scale.setScalar(cakeDimensions(config).diameter / width);
  const replacedMaterials = new Set<THREE.Material>();
  asset.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // Generated colors already contain shadows. Reapplying the detailed mesh's
    // shadows to itself creates dark speckles; keep only the shadow on the table.
    object.castShadow = true; object.receiveShadow = false;
    const preservePhoto = (material: THREE.Material): THREE.Material => {
      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial)) return material;
      if (material.name === 'SF3D cake material') { root.userData.photoFront = 'negative-z'; root.userData.physicalPhoto = true; }
      const legacyColors = material.vertexColors && !material.map;
      const hunyuanPhoto = material.name === 'Hunyuan cake photo';
      if (hunyuanPhoto) root.userData.estimatedBack = true;
      if (!legacyColors && material.name !== 'TripoSR cake texture' && !hunyuanPhoto) return material;
      if (hunyuanPhoto) smoothCakeSurface(object.geometry);
      const surface = hunyuanPhoto && material.map ? cakePhotoSurface(object.geometry, material.map) : null;
      if (surface) {
        object.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surface.uv, 2));
        object.geometry.setAttribute('cakeEstimatedColor', new THREE.Float32BufferAttribute(surface.estimated, 3));
        object.geometry.setAttribute('cakePhotoWeight', new THREE.Float32BufferAttribute(surface.weight, 1));
        object.geometry.setAttribute('cakeSurfaceGrain', new THREE.Float32BufferAttribute(surface.grain, 1));
      }
      root.userData.photoFront = hunyuanPhoto ? 'positive-z' : 'negative-z';
      root.userData.photoColors = true;
      // Legacy TripoSR exports sRGB bytes as glTF vertex colors. glTF expects
      // linear values; decode once, without changing positions or normals.
      const colors = object.geometry.getAttribute('color');
      if (legacyColors && colors && !object.geometry.userData.cakeColorsLinear) {
        const values = new Float32Array(colors.count * colors.itemSize);
        const color = new THREE.Color();
        for (let index = 0; index < colors.count; index++) {
          color.setRGB(colors.getX(index), colors.getY(index), colors.getZ(index), THREE.SRGBColorSpace).toArray(values, index * colors.itemSize);
          if (colors.itemSize === 4) values[index * 4 + 3] = colors.getW(index);
        }
        object.geometry.setAttribute('color', new THREE.Float32BufferAttribute(values, colors.itemSize));
        object.geometry.userData.cakeColorsLinear = true;
      }
      // TripoSR bakes illumination into its colors. Keep those colors instead
      // of lighting them a second time and applying a photographic tone curve.
      const photo = new THREE.MeshBasicMaterial({
        name: 'Cake photo colors', color: material.color, map: material.map,
        vertexColors: material.vertexColors, transparent: material.transparent,
        opacity: material.opacity, alphaTest: material.alphaTest, side: material.side,
        toneMapped: false,
      });
      if (surface) {
        // Keep the original photo sampled per pixel. Only the estimated side
        // is interpolated, so letters and frosting do not lose texture detail.
        photo.onBeforeCompile = (shader) => {
          shader.vertexShader = `attribute vec3 cakeEstimatedColor;
attribute float cakePhotoWeight;
attribute float cakeSurfaceGrain;
varying vec3 vCakeEstimated;
varying float vCakePhotoWeight;
varying float vCakeSurfaceGrain;
varying vec2 vCakeLocalPoint;
${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
vCakeEstimated = cakeEstimatedColor;
vCakePhotoWeight = cakePhotoWeight;
vCakeSurfaceGrain = cakeSurfaceGrain;
vCakeLocalPoint = position.xz;`);
          shader.fragmentShader = `varying vec3 vCakeEstimated;
varying float vCakePhotoWeight;
varying float vCakeSurfaceGrain;
varying vec2 vCakeLocalPoint;
float cakeNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(cell + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}
${shader.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
float cakeGrain = .96 + .04 * (cakeNoise(vCakeLocalPoint * 110.0) + cakeNoise(vCakeLocalPoint * 370.0));
vec3 cakeEstimated = vCakeEstimated * mix(1.0, cakeGrain, vCakeSurfaceGrain);
diffuseColor.rgb = mix(diffuse * cakeEstimated, diffuseColor.rgb, clamp(vCakePhotoWeight, 0.0, 1.0));`);
        };
        photo.customProgramCacheKey = () => 'cake-photo-surface-v2';
      }
      replacedMaterials.add(material);
      return photo;
    };
    object.material = Array.isArray(object.material) ? object.material.map(preservePhoto) : preservePhoto(object.material);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if ('color' in material && material.color instanceof THREE.Color) material.userData.originalCakeColor = material.color.clone();
    }
  });
  replacedMaterials.forEach((material) => material.dispose());
  updateImportedCakeModel(root, config);
  return root;
};

export const updateImportedCakeModel = (root: THREE.Group, config: CakePreviewSnapshot) => {
  root.scale.setScalar(cakeDimensions(config).diameter / root.userData.originalWidth);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if ('color' in material && material.color instanceof THREE.Color) {
        material.color.copy(material.userData.originalCakeColor as THREE.Color);
      }
    }
  });
};
