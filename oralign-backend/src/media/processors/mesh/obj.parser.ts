/**
 * Wavefront OBJ → indexed mesh or point cloud. Reads `v x y z [r g b]`
 * (vertex colours, 0..1 or 0..255) and `f` in all four corner syntaxes,
 * with negative (relative) indices; texture, normal, material and grouping
 * statements are ignored — the viewer recomputes normals, and scanners put
 * their colours on the vertices.
 */
import { ByteSource, forEachLine, tokensOf } from './byte-source';
import { MeshBuilder } from './mesh-builder';
import type { ParsedMesh } from './mesh.types';

const LOWER_V = 0x76;
const LOWER_F = 0x66;

const isBlank = (byte: number) => byte === 0x20 || byte === 0x09;

export async function readObj(
  src: ByteSource,
  collect: boolean,
): Promise<ParsedMesh> {
  const builder = new MeshBuilder(collect);
  let corners = new Float64Array(16);

  await forEachLine(src, (buf, start, end) => {
    let at = start;
    while (at < end && isBlank(buf[at])) at++;
    // Only `v ` and `f ` statements matter; testing two bytes first skips
    // vt/vn/#/usemtl/… lines without decoding them.
    const keyword = buf[at];
    const statement =
      at + 1 < end &&
      (keyword === LOWER_V || keyword === LOWER_F) &&
      isBlank(buf[at + 1]);
    if (!statement) return;
    const tokens = tokensOf(buf, at + 2, end);
    if (keyword === LOWER_V) {
      addVertex(builder, tokens);
      return;
    }
    if (tokens.length > corners.length) {
      corners = new Float64Array(tokens.length);
    }
    for (let k = 0; k < tokens.length; k++) {
      corners[k] = cornerIndex(tokens[k], builder.vertexCount);
    }
    builder.addPolygon(corners, tokens.length);
  });
  return builder.finish('ascii', 'auto');
}

/** `x y z`, `x y z w` (weight, ignored) or `x y z r g b` (vertex colour). */
function addVertex(builder: MeshBuilder, tokens: string[]): void {
  const x = parseFloat(tokens[0]);
  const y = parseFloat(tokens[1]);
  const z = parseFloat(tokens[2]);
  if (tokens.length >= 6) {
    builder.addColoredVertex(
      x,
      y,
      z,
      parseFloat(tokens[3]),
      parseFloat(tokens[4]),
      parseFloat(tokens[5]),
    );
  } else {
    builder.addVertex(x, y, z);
  }
}

/**
 * `v`, `v/vt`, `v//vn` or `v/vt/vn` → 0-based vertex index. Negative
 * indices count back from the latest vertex defined so far. NaN for
 * anything else, which makes the builder drop the polygon.
 */
export function cornerIndex(token: string, vertexCount: number): number {
  const slash = token.indexOf('/');
  const ref = Number(slash === -1 ? token : token.slice(0, slash));
  if (!Number.isInteger(ref) || ref === 0) return NaN;
  return ref > 0 ? ref - 1 : vertexCount + ref;
}
