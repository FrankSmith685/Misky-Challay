import * as THREE from 'three';
import type { CakePreviewSnapshot } from '../cakePreview.service';
import { defaultCakeVisualDesign } from './cakeVisualDesign';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE');
const colorFor = (value: string, fallback: string) => {
  const name = normalize(value);
  const palette: Array<[RegExp, string]> = [
    [/chocolate|cacao|fudge|brownie|moka/, '#6b3c2d'], [/rosa|rosado|fresa|frambuesa/, '#e6a1b4'],
    [/rojo|cereza|red velvet/, '#b94c60'], [/lila|violeta|morado|arandano|mora/, '#ac99c6'],
    [/verde|pistacho|limon|menta/, '#a9bd8c'], [/azul|celeste/, '#9cbfdc'],
    [/naranja|mango|durazno|zanahoria/, '#e8ab75'], [/dorado|amarillo|manjar/, '#d9b36b'],
    [/plateado/, '#c7c9cd'], [/blanco|crema|vainilla/, '#f5e7cf'],
  ];
  return palette.find(([pattern]) => pattern.test(name))?.[1] ?? fallback;
};

export const cakeDimensions = (config: CakePreviewSnapshot) => {
  const exact = Boolean(config.diameterCm && config.diameterCm >= 8 && config.diameterCm <= 100);
  const servings = Number.isFinite(config.servings) && config.servings! > 0 ? config.servings! : 12;
  const diameter = exact ? config.diameterCm! / 100 : Math.max(.16, Math.min(.46, .14 + Math.sqrt(servings) * .025));
  const twoTiers = /dos pisos|2 pisos|doble piso/.test(normalize(`${config.variantName} ${config.themeName ?? ''}`));
  return { diameter, estimated: !exact, tiers: twoTiers ? 2 : 1, scale: diameter / 1.4 };
};

const surfaceTexture = (hex: string, crumbs: boolean) => {
  const size = 64;
  const bytes = new Uint8Array(size * size * 4);
  const base = Number.parseInt(hex.slice(1), 16);
  const rgb = [(base >> 16) & 255, (base >> 8) & 255, base & 255];
  let seed = 137;
  for (let index = 0; index < size * size; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const random = seed / 0xffffffff;
    const variation = crumbs ? (random < .12 ? -.27 : (random - .5) * .16) : (random - .5) * .035;
    rgb.forEach((channel, offset) => { bytes[index * 4 + offset] = Math.max(0, Math.min(255, channel * (1 + variation))); });
    bytes[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.needsUpdate = true;
  return texture;
};

const icedTierGeometry = (radius: number, height: number) => {
  const edge = Math.min(radius * .065, .036);
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(radius - edge, 0)];
  for (let step = 1; step <= 6; step += 1) {
    const angle = step / 6 * Math.PI / 2;
    profile.push(new THREE.Vector2(radius - edge + Math.sin(angle) * edge, edge - Math.cos(angle) * edge));
  }
  profile.push(new THREE.Vector2(radius, height - edge));
  for (let step = 1; step <= 6; step += 1) {
    const angle = step / 6 * Math.PI / 2;
    profile.push(new THREE.Vector2(radius - edge + Math.cos(angle) * edge, height - edge + Math.sin(angle) * edge));
  }
  profile.push(new THREE.Vector2(0, height));
  return new THREE.LatheGeometry(profile, 96);
};

const creamRosette = (radius: number) => {
  const height = radius * 1.55;
  const geometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(radius * .8, 0),
    new THREE.Vector2(radius, height * .18), new THREE.Vector2(radius * .8, height * .48),
    new THREE.Vector2(radius * .47, height * .78), new THREE.Vector2(0, height),
  ], 32);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const fold = 1 + .14 * Math.cos(Math.atan2(z, x) * 6 + positions.getY(index) / height * Math.PI * 1.5);
    positions.setX(index, x * fold);
    positions.setZ(index, z * fold);
  }
  geometry.computeVertexNormals();
  return geometry;
};

/** Real world metres, with a removable quarter to inspect the selected filling. */
export const createCakeModel = (config: CakePreviewSnapshot, interior = false, referenceImage?: HTMLImageElement | null): THREE.Group => {
  const root = new THREE.Group();
  const selected = (pattern: RegExp) => config.options.filter((entry) => pattern.test(normalize(entry.groupName)))
    .map((entry) => entry.optionName).sort((a, b) => a.localeCompare(b, 'es-PE')).join(' ');
  const flavor = selected(/sabor|bizcocho|masa/);
  const filling = selected(/relleno/);
  const color = selected(/color/);
  const finish = selected(/cobertura|acabado|frosting/);
  const decoration = normalize(`${selected(/decoracion|adorno|topping/)} ${config.themeName ?? ''}`);
  const dimensions = cakeDimensions(config);
  const design = config.visualDesign ?? defaultCakeVisualDesign();
  const icingColor = design.icingColor ?? colorFor(color || finish, '#f4e6d5');
  const spongeColor = colorFor(flavor, '#dfb97d');
  const fillingColor = colorFor(filling, '#f3ddba');
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (hex: string, crumbs = false) => {
    const key = `${hex}:${crumbs}`;
    let result = materials.get(key);
    if (!result) {
      const texture = surfaceTexture(hex, crumbs);
      result = new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: crumbs ? .012 : .004, roughness: crumbs ? .94 : .65 });
      materials.set(key, result);
    }
    return result;
  };
  const add = (geometry: THREE.BufferGeometry, hex: string, x: number, y: number, z: number, crumbs = false) => {
    const mesh = new THREE.Mesh(geometry, material(hex, crumbs));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const sector = (radius: number, height: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(radius, 0);
    shape.absarc(0, 0, radius, 0, Math.PI * 1.5, false);
    shape.lineTo(0, 0);
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2);
  };
  add(new THREE.CylinderGeometry(.86, .88, .035, 64), '#fefaf5', 0, .02, 0);
  add(new THREE.TorusGeometry(.84, .011, 8, 64).rotateX(Math.PI / 2), '#d6b88b', 0, .04, 0);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.94, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: .14 }));
  shadow.position.y = -.002;
  shadow.receiveShadow = true;
  root.add(shadow);

  const tier = (radius: number, base: number, height: number) => {
    if (interior) {
      const portions: Array<[number, string, boolean]> = [[.27, spongeColor, true], [.095, fillingColor, false], [.27, spongeColor, true], [.095, fillingColor, false], [.27, spongeColor, true]];
      let y = base;
      portions.forEach(([ratio, hex, crumbs]) => {
        add(sector(radius - .012, height * ratio), hex, 0, y, 0, crumbs);
        y += height * ratio;
      });
      add(new THREE.CylinderGeometry(radius, radius, height, 64, 1, true, Math.PI / 2, Math.PI * 1.5), icingColor, 0, base + height / 2, 0);
      add(sector(radius, .028), icingColor, 0, base + height, 0);
    } else {
      add(icedTierGeometry(radius, height + .028), icingColor, 0, base, 0);
    }
    const rosette = creamRosette(radius * .064);
    const creamColor = `#${new THREE.Color(icingColor).lerp(new THREE.Color('#fffaf2'), .18).getHexString()}`;
    for (let index = 0; index < 26; index += 1) {
      const angle = index * Math.PI * 2 / 26;
      const x = Math.cos(angle) * (radius - .018);
      const z = Math.sin(angle) * (radius - .018);
      if (interior && x > 0 && z > 0) continue;
      const piping = add(rosette, creamColor, x, base + height + .02, z);
      piping.rotation.y = angle;
      const lower = add(new THREE.SphereGeometry(radius * .055, 10, 8), icingColor, x, base + .025, z);
      lower.scale.set(1.1, .65, 1.1);
    }
    if (/chocolate|drip|fudge/.test(normalize(finish))) {
      for (let index = 0; index < 19; index += 1) {
        const angle = index * Math.PI * 2 / 19;
        const x = Math.cos(angle) * (radius + .005);
        const z = Math.sin(angle) * (radius + .005);
        if (interior && x > 0 && z > 0) continue;
        const drop = add(new THREE.SphereGeometry(.022, 10, 8), '#643a2c', x, base + height - .045, z);
        drop.scale.y = 2 + (index % 3);
      }
    }
  };
  tier(.7, .045, .73);
  if (dimensions.tiers === 2) tier(.44, .805, .47);
  const top = dimensions.tiers === 2 ? 1.31 : .81;
  const topRadius = dimensions.tiers === 2 ? .44 : .7;
  const floral = /flor|rosa|margarita/.test(decoration);
  const fruit = /fruta|fresa|cereza|arandano|frambuesa/.test(decoration);
  const chocolate = /chocolate|cacao|ganache/.test(decoration);
  const count = floral ? 5 : fruit || chocolate ? 7 : 0;
  for (let index = 0; index < count; index += 1) {
    const angle = index * Math.PI * 2 / count;
    const x = Math.cos(angle) * topRadius * .63;
    const z = Math.sin(angle) * topRadius * .63;
    if (interior && x > 0 && z > 0) continue;
    if (floral) {
      for (let petal = 0; petal < 6; petal += 1) {
        const a = petal * Math.PI / 3;
        const mesh = add(new THREE.SphereGeometry(.048, 12, 8), colorFor(color, '#e0a0b0'), x + Math.cos(a) * .045, top + .015, z + Math.sin(a) * .045);
        mesh.scale.set(1.1, .45, 1);
      }
      add(new THREE.SphereGeometry(.025, 10, 8), '#e4c57c', x, top + .035, z);
    } else if (chocolate) {
      const shard = add(new THREE.BoxGeometry(.08, .16, .026), '#613829', x, top + .065, z);
      shard.rotation.set(.2, angle, -.25);
    } else {
      const berry = add(new THREE.SphereGeometry(.055, 14, 12), /arandano/.test(decoration) ? '#554c76' : '#bc4259', x, top + .04, z);
      berry.scale.set(.85, 1.2, .85);
      const leaf = add(new THREE.SphereGeometry(.028, 8, 6), '#7c9c62', x, top + .1, z);
      leaf.scale.set(1.2, .2, 1.7);
    }
  }
  if (referenceImage && design.image.visible && !interior) {
    const image = design.image;
    const canvas = document.createElement('canvas');
    const aspect = image.placement === 'top' ? 1 : Math.max(.6, Math.min(1.8, referenceImage.naturalWidth / referenceImage.naturalHeight));
    canvas.width = 512;
    canvas.height = Math.round(512 / aspect);
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      const angle = THREE.MathUtils.degToRad(image.rotation);
      context.rotate(angle);
      const width = referenceImage.naturalWidth;
      const height = referenceImage.naturalHeight;
      const rotatedWidth = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
      const rotatedHeight = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
      const fit = Math.min(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
      context.drawImage(referenceImage, -referenceImage.naturalWidth * fit / 2, -referenceImage.naturalHeight * fit / 2, referenceImage.naturalWidth * fit, referenceImage.naturalHeight * fit);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const photoMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: .78, side: THREE.DoubleSide });
      let photo: THREE.Mesh;
      if (image.placement === 'top') {
        const radius = topRadius * .86 * image.scale;
        photo = new THREE.Mesh(new THREE.CircleGeometry(radius, 64).rotateX(-Math.PI / 2), photoMaterial);
        const offset = new THREE.Vector2(image.offsetX, image.offsetY).clampLength(0, 1).multiplyScalar(topRadius * .9 - radius);
        photo.position.set(offset.x, top + .006, offset.y);
      } else if (image.placement === 'front') {
        const height = .55 * image.scale;
        const span = height * aspect / .705;
        photo = new THREE.Mesh(new THREE.CylinderGeometry(.705, .705, height, 48, 1, true, -span / 2, span), photoMaterial);
        photo.rotation.y = image.offsetX * Math.PI * .7;
        photo.position.y = .41 + image.offsetY * (.34 - height / 2);
      } else {
        const height = .55 * image.scale;
        const width = height * aspect;
        const bottom = top + .12 + (image.offsetY + 1) * .08;
        const x = image.offsetX * Math.max(.02, topRadius - width / 2);
        const z = -topRadius * .27;
        add(new THREE.CylinderGeometry(.009, .009, bottom - top + .04, 8), '#ddc99f', x, (top + bottom) / 2, z);
        const backing = add(new THREE.BoxGeometry(width + .018, height + .018, .014), '#fffaf5', x, bottom + height / 2, z - .009);
        backing.castShadow = true;
        photo = new THREE.Mesh(new THREE.PlaneGeometry(width, height), photoMaterial);
        photo.position.set(x, bottom + height / 2, z);
      }
      photo.name = 'reference-image';
      photo.receiveShadow = true;
      root.add(photo);
    }
  }
  root.scale.setScalar(dimensions.scale);
  return root;
};

export const disposeCakeModel = (group: THREE.Object3D) => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((entry) => {
      materials.add(entry);
      Object.values(entry).forEach((value) => { if (value instanceof THREE.Texture) textures.add(value); });
    });
  });
  const bitmaps = new Set<ImageBitmap>();
  textures.forEach((entry) => {
    if (typeof ImageBitmap !== 'undefined' && entry.source.data instanceof ImageBitmap) bitmaps.add(entry.source.data);
    entry.dispose();
  });
  bitmaps.forEach((entry) => entry.close());
  materials.forEach((entry) => entry.dispose());
  geometries.forEach((entry) => entry.dispose());
};
