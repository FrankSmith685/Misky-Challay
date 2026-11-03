import * as THREE from 'three';

interface PhotoSurface {
  atlasWidth: number;
  atlasHeight: number;
  width: number;
  height: number;
  profile: Float32Array;
  topColor: Float32Array;
}

const references = new WeakMap<THREE.Texture, PhotoSurface | null>();
const linear = Float32Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
});
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (low: number, high: number, value: number) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};

/** Read the foreground tile embedded by the local Hunyuan photo adapter.
 * Its four-pixel border and bottom lighting strip identify that format only.
 */
const readPhoto = (texture: THREE.Texture): PhotoSurface | null => {
  if (references.has(texture)) return references.get(texture) ?? null;
  let result: PhotoSurface | null = null;
  try {
    const image = texture.image as CanvasImageSource & { width: number; height: number };
    if (!image || image.width < 32 || image.height < 32) return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const coating = [pixels[0], pixels[1], pixels[2]];
    let right = 3, bottom = 3;
    for (let y = 4; y < canvas.height - 16; y++) {
      for (let x = 4; x < canvas.width - 4; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (Math.max(Math.abs(pixels[offset] - coating[0]), Math.abs(pixels[offset + 1] - coating[1]), Math.abs(pixels[offset + 2] - coating[2])) <= 2) continue;
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    const width = right - 3, height = bottom - 3;
    if (width < 8 || height < 8) return null;
    // The row median carries visible horizontal layers around the estimated
    // side, without stamping lettering or isolated decorations onto the back.
    const profile = new Float32Array(height * 3);
    const histogram = new Uint32Array(768);
    for (let y = 0; y < height; y++) {
      histogram.fill(0);
      let count = 0;
      for (let x = Math.floor(width * .2); x < Math.ceil(width * .8); x++) {
        const offset = ((y + 4) * canvas.width + x + 4) * 4;
        if (Math.max(Math.abs(pixels[offset] - coating[0]), Math.abs(pixels[offset + 1] - coating[1]), Math.abs(pixels[offset + 2] - coating[2])) <= 3) continue;
        for (let channel = 0; channel < 3; channel++) histogram[channel * 256 + pixels[offset + channel]]++;
        count++;
      }
      for (let channel = 0; channel < 3; channel++) {
        let median = coating[channel];
        if (count) {
          let sum = 0;
          for (let value = 0; value < 256; value++) {
            sum += histogram[channel * 256 + value];
            if (sum >= count / 2) { median = value; break; }
          }
        }
        profile[y * 3 + channel] = linear[median];
      }
    }
    const softened = profile.slice();
    const kernel = [1, 4, 6, 4, 1];
    for (let y = 0; y < height; y++) for (let channel = 0; channel < 3; channel++) {
      let sum = 0;
      for (let index = 0; index < 5; index++) sum += profile[Math.max(0, Math.min(height - 1, y + index - 2)) * 3 + channel] * kernel[index];
      softened[y * 3 + channel] = sum / 16;
    }
    const topColor = new Float32Array(3);
    const firstRow = Math.floor(height * .04), lastRow = Math.max(firstRow + 1, Math.ceil(height * .12));
    for (let y = firstRow; y < lastRow; y++) for (let channel = 0; channel < 3; channel++) topColor[channel] += softened[y * 3 + channel] / (lastRow - firstRow);
    result = { atlasWidth: canvas.width, atlasHeight: canvas.height, width, height, profile: softened, topColor };
  } catch {
    // Preserve the original texture if a browser cannot read this image.
  }
  references.set(texture, result);
  return result;
};

/** Continuous color on the existing mesh; positions and topology are preserved.
 * A low cake's projected top accounts for camera elevation. Hidden sides use
 * an estimated row profile blended in linear RGB, with no per-face color switch.
 */
export const cakePhotoSurface = (geometry: THREE.BufferGeometry, texture: THREE.Texture): { uv: Float32Array; estimated: Float32Array; weight: Float32Array; grain: Float32Array } | null => {
  const photo = readPhoto(texture);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!photo || !positions || !normals || normals.count !== positions.count) return null;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const width = box.max.x - box.min.x, height = box.max.y - box.min.y, depth = box.max.z - box.min.z;
  if (Math.min(width, height, depth) < 1e-6) return null;
  const lowCake = height / Math.max(width, depth) < .8;
  let angle = 0;
  if (lowCake) {
    let error = Infinity;
    const stride = Math.max(1, Math.ceil(positions.count / 4096));
    for (let degrees = 5; degrees <= 55; degrees++) {
      const radians = THREE.MathUtils.degToRad(degrees), cosine = Math.cos(radians), sine = Math.sin(radians);
      let min = Infinity, max = -Infinity;
      for (let index = 0; index < positions.count; index += stride) {
        const projected = positions.getY(index) * cosine - positions.getZ(index) * sine;
        min = Math.min(min, projected); max = Math.max(max, projected);
      }
      const candidate = Math.abs(Math.log((max - min) / width / (photo.height / photo.width))) + degrees * .00015;
      if (candidate < error) { error = candidate; angle = radians; }
    }
  }
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  let minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < positions.count; index++) {
    const projected = positions.getY(index) * cosine - positions.getZ(index) * sine;
    minY = Math.min(minY, projected); maxY = Math.max(maxY, projected);
  }
  const centerX = (box.min.x + box.max.x) / 2, centerZ = (box.min.z + box.max.z) / 2;
  const frontZ = centerZ + depth * .42;
  const uv = new Float32Array(positions.count * 2);
  const estimated = new Float32Array(positions.count * 3);
  const weight = new Float32Array(positions.count);
  const grain = new Float32Array(positions.count);
  const capHeight = Math.max(.12, Math.min(.6, depth * sine / (maxY - minY)));
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const px = clamp((x - box.min.x) / width);
    let py = clamp((maxY - (y * cosine - z * sine)) / (maxY - minY));
    const relativeY = (y - box.min.y) / height;
    const upperSurface = lowCake ? smooth(.5, .68, relativeY) * smooth(.25, .85, normals.getY(index)) : 0;
    const capY = clamp(.02 + capHeight * (.5 + (z - centerZ) / depth));
    py = py * (1 - upperSurface) + capY * upperSurface;
    uv[index * 2] = (4 + px * (photo.width - 1)) / photo.atlasWidth;
    // glTF's V points down the image; Trimesh flips its source UV on export.
    uv[index * 2 + 1] = (4 + py * (photo.height - 1)) / photo.atlasHeight;
    const profileY = clamp((maxY - (y * cosine - frontZ * sine)) / (maxY - minY)) * (photo.height - 1);
    const row = Math.floor(profileY), nextRow = Math.min(photo.height - 1, row + 1), mixRow = profileY - row;
    const radialX = (x - centerX) / width, radialZ = (z - centerZ) / depth;
    const facing = radialZ / (Math.hypot(radialX, radialZ) || 1);
    const topWeight = lowCake ? smooth(.3, .85, normals.getY(index)) * smooth(.45, .65, relativeY) : 0;
    const decoration = lowCake ? 0 : smooth(.56, .72, relativeY);
    // With an almost frontal reference the top center is unobserved. Estimate
    // its coating instead of stretching the thin strip of front frosting.
    const radius = Math.hypot(radialX * 2, radialZ * 2);
    const unseenTop = lowCake && angle < THREE.MathUtils.degToRad(20)
      ? (1 - smooth(.48, .75, radius)) * smooth(.5, .65, relativeY) * smooth(.5, .85, normals.getY(index)) : 0;
    weight[index] = Math.max(smooth(-.18, .8, facing), topWeight, decoration) * (1 - unseenTop);
    grain[index] = unseenTop;
    const light = .92 + .08 * clamp((-.45 * normals.getX(index) + .75 * normals.getY(index) + .5 * normals.getZ(index) + 1) / 2);
    for (let channel = 0; channel < 3; channel++) {
      const side = photo.profile[row * 3 + channel] * (1 - mixRow) + photo.profile[nextRow * 3 + channel] * mixRow;
      estimated[index * 3 + channel] = (side * (1 - unseenTop) + photo.topColor[channel] * unseenTop) * light;
    }
  }
  return { uv, estimated, weight, grain };
};
