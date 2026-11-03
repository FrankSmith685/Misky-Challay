import * as THREE from 'three';

/** Remove small reconstruction spikes on low cakes without rounding tall toppers.
 * Weld positions for the filter only: texture seams and triangle order stay intact.
 * Alternating Laplacian passes avoid the shrinkage of a one-way blur.
 */
export const smoothCakeSurface = (geometry: THREE.BufferGeometry) => {
  if (geometry.userData.cakeSurfaceSmoothed) return;
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const width = Math.max(size.x, size.z);
  if (!Number.isFinite(width) || width < 1e-6 || size.y < 1e-6 || size.y / width >= .8) return;
  const vertices: number[] = [];
  const welded = new Uint32Array(position.count);
  const keys = new Map<string, number>();
  const precision = 1e6 / width;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const key = `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;
    let vertex = keys.get(key);
    if (vertex === undefined) {
      vertex = vertices.length / 3;
      keys.set(key, vertex); vertices.push(x, y, z);
    }
    welded[index] = vertex;
  }
  const count = vertices.length / 3;
  const neighbors = Array.from({ length: count }, () => new Set<number>());
  const index = geometry.getIndex();
  const triangleCount = index?.count ?? position.count;
  const at = (offset: number) => welded[index ? index.getX(offset) : offset];
  for (let triangle = 0; triangle + 2 < triangleCount; triangle += 3) {
    const a = at(triangle), b = at(triangle + 1), c = at(triangle + 2);
    if (a === b || b === c || c === a) continue;
    neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
  }
  const original = Float64Array.from(vertices);
  let current = original.slice(), next = original.slice();
  const gain = Float64Array.from({ length: count }, (_, vertex) => {
    const height = (original[vertex * 3 + 1] - box.min.y) / size.y;
    // Keep the board and lower silhouette; the upper frosting gets the filter.
    return height < .12 ? 0 : height > .55 ? 1 : .2;
  });
  for (let pass = 0; pass < 10; pass++) {
    const strength = pass % 2 ? -.53 : .5;
    for (let vertex = 0; vertex < count; vertex++) {
      const adjacent = neighbors[vertex];
      for (let channel = 0; channel < 3; channel++) {
        const offset = vertex * 3 + channel;
        let average = 0;
        adjacent.forEach((other) => { average += current[other * 3 + channel]; });
        next[offset] = adjacent.size ? current[offset] + strength * gain[vertex] * (average / adjacent.size - current[offset]) : current[offset];
      }
    }
    [current, next] = [next, current];
  }
  for (let vertex = 0; vertex < count; vertex++) {
    const offset = vertex * 3;
    const dx = current[offset] - original[offset], dy = current[offset + 1] - original[offset + 1], dz = current[offset + 2] - original[offset + 2];
    const displacement = Math.hypot(dx, dy, dz);
    const limit = width * .015 * gain[vertex];
    const factor = displacement > limit && displacement > 0 ? limit / displacement : 1;
    current[offset] = original[offset] + dx * factor;
    current[offset + 1] = original[offset + 1] + dy * factor;
    current[offset + 2] = original[offset + 2] + dz * factor;
  }
  const smoothNormals = new Float64Array(current.length);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let triangle = 0; triangle + 2 < triangleCount; triangle += 3) {
    const first = at(triangle), second = at(triangle + 1), third = at(triangle + 2);
    a.fromArray(current, first * 3); b.fromArray(current, second * 3); c.fromArray(current, third * 3);
    b.sub(a); c.sub(a); b.cross(c);
    for (const vertex of [first, second, third]) {
      smoothNormals[vertex * 3] += b.x; smoothNormals[vertex * 3 + 1] += b.y; smoothNormals[vertex * 3 + 2] += b.z;
    }
  }
  const normal = geometry.getAttribute('normal');
  if (!normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3));
  const normals = geometry.getAttribute('normal');
  for (let vertex = 0; vertex < position.count; vertex++) {
    const offset = welded[vertex] * 3;
    position.setXYZ(vertex, current[offset], current[offset + 1], current[offset + 2]);
    a.fromArray(smoothNormals, offset).normalize();
    if (a.lengthSq()) normals.setXYZ(vertex, a.x, a.y, a.z);
  }
  position.needsUpdate = true; normals.needsUpdate = true;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.cakeSurfaceSmoothed = true;
};
