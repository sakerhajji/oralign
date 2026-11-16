import { computeBbox } from './bbox';
import { indexedGeometry, torusMesh } from './mesh-fixtures.helper-spec';
import type { MeshGeometry } from './mesh.types';
import { RENDER_SIZE, renderPreview } from './preview.renderer';

interface PixelStats {
  opaque: number;
  /** Clearly pink: red well above green (the gum colour). */
  pink: number;
  /** Bright and neutral (the tooth colour). */
  white: number;
  /** Slate: blue above green above red (the uncoloured look). */
  slate: number;
}

function stats(geometry: MeshGeometry): PixelStats {
  const rgba = renderPreview(geometry, computeBbox(geometry.positions).bbox);
  const result: PixelStats = { opaque: 0, pink: 0, white: 0, slate: 0 };
  for (let p = 0; p < rgba.length; p += 4) {
    const [r, g, b, a] = [rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3]];
    if (a === 0) continue;
    result.opaque++;
    if (r > g + 30) result.pink++;
    if (r > 150 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12) result.white++;
    if (b >= g && g >= r) result.slate++;
  }
  return result;
}

describe('renderPreview', () => {
  it('renders a coloured mesh in the scanner colours', () => {
    const s = stats(indexedGeometry(torusMesh(), true));
    expect(s.opaque).toBeGreaterThan(RENDER_SIZE * RENDER_SIZE * 0.1);
    expect(s.pink).toBeGreaterThan(s.opaque * 0.2);
    expect(s.white).toBeGreaterThan(s.opaque * 0.02);
  });

  it('renders an uncoloured mesh in the neutral slate only', () => {
    const s = stats(indexedGeometry(torusMesh(), false));
    expect(s.opaque).toBeGreaterThan(RENDER_SIZE * RENDER_SIZE * 0.1);
    expect(s.slate).toBe(s.opaque);
    expect(s.pink).toBe(0);
  });

  it('splats a coloured point cloud', () => {
    const { positions, colors } = indexedGeometry(torusMesh(), true);
    const s = stats({
      kind: 'points',
      positions,
      colors,
      pointCount: positions.length / 3,
    });
    expect(s.opaque).toBeGreaterThan(RENDER_SIZE * RENDER_SIZE * 0.02);
    expect(s.pink).toBeGreaterThan(s.opaque * 0.2);
    expect(s.white).toBeGreaterThan(0);
  });

  it('leaves the background transparent', () => {
    const geometry = indexedGeometry(torusMesh(), true);
    const rgba = renderPreview(geometry, computeBbox(geometry.positions).bbox);
    expect(rgba[3]).toBe(0);
    expect(rgba[rgba.length - 1]).toBe(0);
  });
});
