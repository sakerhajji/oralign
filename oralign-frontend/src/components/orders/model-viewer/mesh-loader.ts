/**
 * Turns downloaded 3D bytes into one render-ready BufferGeometry.
 *
 * Two sources, same result:
 *   - the media pipeline's `model` variant (GLB, positions + optional
 *     COLOR_0, no normals): the fast path;
 *   - the raw upload (STL / PLY / OBJ), parsed with three's own loaders:
 *     legacy rows, files past the pipeline's caps, and point clouds, which
 *     never get a GLB.
 *
 * three and each loader are imported dynamically, so none of them lands in
 * the page bundle and a STL never pulls the PLY or OBJ parser.
 */
import type {
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  Mesh,
  Points,
} from 'three';
import {
  colorsLookLikeBytes,
  parsePlyHeader,
  readPlyHeader,
  type ModelFormat,
} from './model-format';

type Three = typeof import('three');
type Attribute = BufferAttribute | InterleavedBufferAttribute;

export interface LoadedModel {
  geometry: BufferGeometry;
  /** Faceless PLY / OBJ scan: drawn as THREE.Points. */
  isPointCloud: boolean;
  /** Carries the scanner's per-vertex colours as an RGB `color` attribute. */
  hasColors: boolean;
}

/** Parses the pipeline's GLB variant; null when it holds nothing drawable. */
export async function parseModelVariant(
  buffer: ArrayBuffer,
): Promise<LoadedModel | null> {
  const [THREE, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ]);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');

  let found: { geometry: BufferGeometry; isPointCloud: boolean } | undefined;
  gltf.scene.traverse((node) => {
    if (found) return;
    if ((node as Mesh).isMesh) {
      found = { geometry: (node as Mesh).geometry, isPointCloud: false };
    } else if ((node as Points).isPoints) {
      found = { geometry: (node as Points).geometry, isPointCloud: true };
    }
  });
  if (!found) return null;
  return finalize(THREE, found.geometry, found.isPointCloud, false);
}

/** Parses the raw upload. Synchronous-heavy: callers yield a frame first. */
export async function parseModelSource(
  buffer: ArrayBuffer,
  format: ModelFormat,
): Promise<LoadedModel> {
  const THREE = await import('three');

  if (format === 'ply') {
    const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
    const geometry = new PLYLoader().parse(buffer);
    const header = readPlyHeader(new Uint8Array(buffer));
    const facts = header
      ? parsePlyHeader(header)
      : { faceCount: geometry.index ? 1 : 0, floatColors: false };
    const color = geometry.getAttribute('color');
    if (color && facts.floatColors) rescaleSrgb(THREE, color, 255);
    return finalize(THREE, geometry, facts.faceCount === 0, false);
  }

  if (format === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const group = new OBJLoader().parse(new TextDecoder().decode(buffer));
    const meshes: BufferGeometry[] = [];
    const clouds: BufferGeometry[] = [];
    group.traverse((node) => {
      if ((node as Mesh).isMesh) meshes.push((node as Mesh).geometry);
      else if ((node as Points).isPoints) clouds.push((node as Points).geometry);
    });
    const parts = meshes.length > 0 ? meshes : clouds;
    if (parts.length === 0) throw new Error('The OBJ file contains no geometry.');
    const geometry = parts.length === 1 ? parts[0] : await mergeParts(parts);
    const color = geometry.getAttribute('color');
    if (color && colorsLookLikeBytes(color.array)) rescaleSrgb(THREE, color, 1 / 255);
    return finalize(THREE, geometry, meshes.length === 0, false);
  }

  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
  const geometry = new STLLoader().parse(buffer);
  // Rare "Materialise" STL face colours are dropped: the pipeline ignores
  // them too, so a STL looks the same whether it came as GLB or raw.
  if (geometry.hasAttribute('color')) geometry.deleteAttribute('color');
  // STL facet normals are frequently zeroed or flipped by exporters, so they
  // are always recomputed from the winding (what the viewer has always done).
  return finalize(THREE, geometry, false, true);
}

function finalize(
  THREE: Three,
  geometry: BufferGeometry,
  isPointCloud: boolean,
  recomputeNormals: boolean,
): LoadedModel {
  const color = geometry.getAttribute('color');
  // A VEC4 COLOR_0 would turn on three's vertex alpha, and with the
  // transparent canvas any alpha below 1 punches see-through holes.
  if (color && color.itemSize === 4) geometry.setAttribute('color', toRgb(THREE, color));
  if (!isPointCloud && (recomputeNormals || !geometry.hasAttribute('normal'))) {
    geometry.computeVertexNormals();
  }
  return { geometry, isPointCloud, hasColors: geometry.hasAttribute('color') };
}

function toRgb(THREE: Three, color: Attribute): BufferAttribute {
  const rgb = new THREE.BufferAttribute(new Float32Array(color.count * 3), 3);
  for (let i = 0; i < color.count; i += 1) {
    rgb.setXYZ(i, color.getX(i), color.getY(i), color.getZ(i));
  }
  return rgb;
}

/**
 * Loaders store colours already converted to linear, assuming a fixed
 * range. Undo the conversion, rescale in sRGB where the range mistake was
 * made, and convert back, so the scan keeps its true colours.
 */
function rescaleSrgb(THREE: Three, color: Attribute, factor: number): void {
  const working = new THREE.Color();
  const srgb = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < color.count; i += 1) {
    working.setRGB(color.getX(i), color.getY(i), color.getZ(i));
    working.getRGB(srgb, THREE.SRGBColorSpace);
    working.setRGB(srgb.r * factor, srgb.g * factor, srgb.b * factor, THREE.SRGBColorSpace);
    color.setXYZ(i, working.r, working.g, working.b);
  }
}

/** One geometry per OBJ group (`o` / `g` / `usemtl`); the viewer wants one. */
async function mergeParts(parts: BufferGeometry[]): Promise<BufferGeometry> {
  const { mergeGeometries } = await import(
    'three/examples/jsm/utils/BufferGeometryUtils.js'
  );
  // mergeGeometries needs identical attribute sets; colour survives only
  // when every group has it, and UVs are never used.
  const shared = ['position', 'normal', 'color'].filter((name) =>
    parts.every((part) => part.hasAttribute(name)),
  );
  for (const part of parts) {
    for (const name of Object.keys(part.attributes)) {
      if (!shared.includes(name)) part.deleteAttribute(name);
    }
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Unable to merge the OBJ groups.');
  return merged;
}
