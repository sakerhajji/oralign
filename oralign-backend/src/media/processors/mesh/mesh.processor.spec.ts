import { type BinaryLike, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import type { MeshFormat } from '../../media.types';
import {
  accessorValues,
  asciiStl,
  binaryStl,
  objFile,
  plyFile,
  readGlb,
  toSoup,
  torusMesh,
  withNaNTriangle,
} from './mesh-fixtures.helper-spec';
import { processMesh } from './mesh.processor';
import { renderPreview } from './preview.renderer';
import { parseStl } from './stl.parser';

const sha256 = (bytes: BinaryLike) =>
  createHash('sha256').update(bytes).digest('hex');

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'oralign-mesh-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function run(format: MeshFormat, content: Buffer) {
  const absPath = path.join(dir, `scan.${format}`);
  await fs.writeFile(absPath, content);
  const result = await processMesh(format, {
    absPath,
    absDir: dir,
    relDir: 'orders/o1/ply',
    baseName: 'scan',
  });
  const read = (variant: 'model' | 'thumb') =>
    fs.readFile(path.join(dir, path.basename(result.variants[variant].path)));
  return { ...result, read };
}

/** Share of opaque thumbnail pixels that are clearly pink (gum colour). */
async function pinkShare(thumb: Buffer): Promise<number> {
  const { data } = await sharp(thumb).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  let opaque = 0;
  let pink = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < 128) continue;
    opaque++;
    if (data[p] > data[p + 1] + 30) pink++;
  }
  return pink / Math.max(1, opaque);
}

/**
 * Golden values recorded from the STL processor as it stood before the
 * PLY/OBJ refactor (same frozen torus fixture): STL output must not move.
 */
describe('STL output is unchanged by the mesh refactor', () => {
  const soup = withNaNTriangle(toSoup(torusMesh()));
  const metadata = {
    kind: 'stl',
    triangleCount: 2305,
    vertexCount: 1152,
    bbox: {
      min: [-33.79999923706055, -6, -26],
      max: [33.79999923706055, 6, 26],
    },
  };
  // The raw render is pure JS, so it is pinned bit for bit; the webp bytes
  // depend on the libwebp build and are only checked for dimensions.
  const RENDER_SHA =
    '4715c31f54daf0b8876785dffea688d98ee2365bab4388aba8b334b0a5f39520';

  it.each([
    [
      'binary',
      binaryStl(soup),
      '7ce356c0e43730d82e8a3a5f5a227c46f45026f68b560b3af4ff363702bdb7b0',
    ],
    [
      'ascii',
      asciiStl(soup),
      '5b18569e680bdb7f298ee35e761b548cded125497c63d51d4fa7592ff4e0cf5f',
    ],
  ])('%s STL', async (format, content, glbSha) => {
    const result = await run('stl', content);

    expect(result.metadata).toEqual({ ...metadata, format });
    expect(result.variants.model).toMatchObject({
      sizeBytes: 42080,
      format: 'glb',
    });
    expect(result.variants.thumb).toMatchObject({
      width: 300,
      height: 300,
      format: 'webp',
    });
    expect(sha256(await result.read('model'))).toBe(glbSha);

    const parsed = parseStl(content);
    if (!parsed.geometry) throw new Error('no geometry');
    const rgba = renderPreview(parsed.geometry, parsed.bbox.bbox);
    expect(sha256(rgba)).toBe(RENDER_SHA);
  });

  it('still skips a GLB that would not be smaller than a tiny STL', async () => {
    const tiny = binaryStl(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const result = await run('stl', tiny);
    expect(result.variants.model).toBeUndefined();
    expect(result.variants.thumb).toBeDefined();
  });
});

describe('processMesh for PLY and OBJ', () => {
  it.each<[MeshFormat, Buffer, string]>([
    [
      'ply',
      plyFile(torusMesh(), {
        format: 'binary_little_endian',
        colors: 'uchar',
        alpha: true,
        extraVertexProps: true,
      }),
      'binary_little_endian',
    ],
    [
      'ply',
      plyFile(torusMesh(), { format: 'ascii', colors: 'float' }),
      'ascii',
    ],
    [
      'obj',
      objFile(torusMesh(), {
        colors: 'unit',
        faceStyle: 'v/vt/vn',
        extras: true,
      }),
      'ascii',
    ],
  ])(
    'turns a coloured %s (%#) into a coloured GLB and thumbnail',
    async (kind, content, format) => {
      const result = await run(kind, content);

      expect(result.metadata).toEqual({
        kind,
        format,
        triangleCount: 2304,
        vertexCount: 1152,
        bbox: {
          min: [-33.79999923706055, -6, -26],
          max: [33.79999923706055, 6, 26],
        },
        hasColors: true,
      });
      expect(result.variants.model.path).toBe('orders/o1/ply/scan__model.glb');
      const gltf = readGlb(await result.read('model'));
      expect(gltf.json.meshes[0].primitives[0].attributes).toEqual({
        POSITION: 1,
        COLOR_0: 2,
      });
      expect(accessorValues(gltf, 2)).toHaveLength(1152 * 4);

      expect(result.variants.thumb).toMatchObject({ width: 300, height: 300 });
      expect(await pinkShare(await result.read('thumb'))).toBeGreaterThan(0.2);
    },
  );

  it('keeps an uncoloured PLY looking exactly like an STL', async () => {
    const result = await run(
      'ply',
      plyFile(torusMesh(), { format: 'binary_big_endian' }),
    );
    expect(result.metadata).not.toHaveProperty('hasColors');
    const gltf = readGlb(await result.read('model'));
    expect(gltf.json.meshes[0].primitives[0].attributes).toEqual({
      POSITION: 1,
    });

    const stl = parseStl(binaryStl(toSoup(torusMesh())));
    if (!stl.geometry) throw new Error('no geometry');
    const stlThumb = await sharp(
      Buffer.from(renderPreview(stl.geometry, stl.bbox.bbox)),
      { raw: { width: 640, height: 640, channels: 4 } },
    )
      .resize(300, 300, { fit: 'inside' })
      .webp({ quality: 80 })
      .toBuffer();
    expect(await result.read('thumb')).toEqual(stlThumb);
  });

  it('gives a point cloud a thumbnail but no GLB', async () => {
    const result = await run(
      'ply',
      plyFile(torusMesh(), {
        format: 'binary_little_endian',
        colors: 'uchar',
        pointCloud: true,
      }),
    );
    expect(result.metadata).toMatchObject({
      kind: 'ply',
      triangleCount: 0,
      vertexCount: 1152,
      hasColors: true,
      pointCloud: true,
    });
    expect(result.variants.model).toBeUndefined();
    expect(await pinkShare(await result.read('thumb'))).toBeGreaterThan(0.2);
  });

  it('writes the GLB of a PLY even when it is not smaller than the source', async () => {
    const one = {
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ] as [number, number, number][],
      faces: [[0, 1, 2]],
      colors: [] as [number, number, number][],
    };
    const result = await run(
      'ply',
      plyFile(one, { format: 'binary_little_endian' }),
    );
    expect(result.variants.model).toBeDefined();
  });

  it('fails the job for a file that is not a PLY', async () => {
    await expect(run('ply', Buffer.from('solid not a ply\n'))).rejects.toThrow(
      /magic/,
    );
  });
});
