import { computeBbox } from './bbox';
import { buildGlb } from './glb.writer';
import {
  GUM_RGB,
  accessorValues,
  indexedGeometry,
  readGlb,
  torusMesh,
} from './mesh-fixtures.helper-spec';
import type { TriangleGeometry } from './mesh.types';

/** Reference sRGB → linear transfer (IEC 61966-2-1), as an independent oracle. */
const linear = (srgb: number) => {
  const c = srgb / 255;
  return Math.round(
    (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 255,
  );
};

function build(geometry: TriangleGeometry) {
  const built = buildGlb(geometry, computeBbox(geometry.positions).bbox);
  if (built === null) throw new Error('no GLB');
  return { ...built, gltf: readGlb(built.glb) };
}

describe('buildGlb', () => {
  it('writes a valid coloured GLB: POSITION + COLOR_0 (normalized ubyte VEC4)', () => {
    const torus = torusMesh();
    const geometry = indexedGeometry(torus, true);
    const { gltf, uniqueVertexCount } = build(geometry);
    const { json } = gltf;

    expect(json.asset.version).toBe('2.0');
    expect(json.meshes[0].primitives[0]).toEqual({
      attributes: { POSITION: 1, COLOR_0: 2 },
      indices: 0,
      mode: 4,
    });
    expect(json.accessors[0]).toMatchObject({
      componentType: 5125,
      type: 'SCALAR',
      count: geometry.triangleCount * 3,
    });
    expect(json.accessors[1]).toMatchObject({
      componentType: 5126,
      type: 'VEC3',
      count: torus.vertices.length,
      min: computeBbox(geometry.positions).bbox.min,
      max: computeBbox(geometry.positions).bbox.max,
    });
    expect(json.accessors[2]).toEqual({
      bufferView: 2,
      componentType: 5121,
      normalized: true,
      count: torus.vertices.length,
      type: 'VEC4',
    });
    expect(uniqueVertexCount).toBe(torus.vertices.length);

    // Every view 4-byte aligned, inside the BIN chunk, and big enough.
    const sizes = [4, 12, 4];
    json.bufferViews.forEach((view, i) => {
      expect(view.byteOffset % 4).toBe(0);
      expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(
        gltf.bin.length,
      );
      expect(view.byteLength).toBe(json.accessors[i].count * sizes[i]);
    });

    // Decoded corners match the source: positions exactly, colours linearized.
    const indices = accessorValues(gltf, 0);
    const positions = accessorValues(gltf, 1);
    const colors = accessorValues(gltf, 2);
    const sourceIndices = geometry.indices ?? [];
    indices.forEach((out, corner) => {
      const src = sourceIndices[corner];
      expect(positions.slice(out * 3, out * 3 + 3)).toEqual(
        Array.from(geometry.positions.subarray(src * 3, src * 3 + 3)),
      );
      expect(colors.slice(out * 4, out * 4 + 4)).toEqual([
        ...torus.colors[src].map(linear),
        255,
      ]);
    });
    expect(colors.slice(0, 4)).toEqual([...GUM_RGB.map(linear), 255]);
  });

  it('keeps an uncoloured mesh POSITION-only', () => {
    const { gltf } = build(indexedGeometry(torusMesh(), false));
    expect(gltf.json.meshes[0].primitives[0].attributes).toEqual({
      POSITION: 1,
    });
    expect(gltf.json.accessors).toHaveLength(2);
    expect(gltf.json.bufferViews).toHaveLength(2);
  });

  it('drops unreferenced vertices and triangles touching a NaN vertex', () => {
    const geometry: TriangleGeometry = {
      kind: 'triangles',
      positions: Float32Array.from([
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        0,
        9,
        9,
        9,
        NaN,
        0,
        0,
      ]),
      colors: null,
      indices: Uint32Array.from([0, 1, 2, 0, 1, 4]),
      triangleCount: 2,
    };
    const { gltf, uniqueVertexCount } = build(geometry);
    expect(uniqueVertexCount).toBe(3);
    expect(accessorValues(gltf, 0)).toEqual([0, 1, 2]);
    expect(accessorValues(gltf, 1)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it('merges a soup by position but keeps differently coloured twins apart', () => {
    const square = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
    const soup: TriangleGeometry = {
      kind: 'triangles',
      positions: Float32Array.from(square),
      colors: null,
      indices: null,
      triangleCount: 2,
    };
    expect(build(soup).uniqueVertexCount).toBe(4);

    const twoTone = { ...soup, colors: new Uint8Array(18).fill(255, 9) };
    expect(build(twoTone).uniqueVertexCount).toBe(6);
  });

  it('returns null when no finite triangle survives', () => {
    const geometry: TriangleGeometry = {
      kind: 'triangles',
      positions: Float32Array.from([NaN, 0, 0, 1, 0, 0, 0, 1, 0]),
      colors: null,
      indices: null,
      triangleCount: 1,
    };
    expect(buildGlb(geometry, computeBbox(geometry.positions).bbox)).toBeNull();
  });
});
