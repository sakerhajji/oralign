/**
 * The three.js stage of the 3D scan viewer: renderer, camera, lights,
 * orbit controls and the scan itself. Framework-free so the React viewer
 * only deals with fetching, progress and status.
 *
 * The stage owns everything it creates and frees it in `dispose()`; the
 * model's geometry stays owned by the caller, who parsed it.
 */
import type { BufferGeometry, Material, Object3D } from 'three';
import type { LoadedModel } from './mesh-loader';
import { pointSizeFor } from './model-format';

type Three = typeof import('three');

/** Slate grey: the look every uncoloured scan has always had. */
const MODEL_COLOR = 0x596b80;

export interface ModelStage {
  dispose: () => void;
}

export async function mountModelStage(
  container: HTMLElement,
  model: LoadedModel,
  large: boolean,
): Promise<ModelStage> {
  const [THREE, { OrbitControls }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
  ]);

  const scene = new THREE.Scene();
  // No scene.background — `alpha: true` keeps the renderer transparent so
  // the soft light gradient on the container shows through. That's the
  // "default" look the wrapping card defines.
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.width = '100%';
  container.appendChild(renderer.domElement);

  const { geometry } = model;
  geometry.center();
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius || 1;
  const scale = radius > 0 ? 1.35 / radius : 1;

  const drawable = buildDrawable(THREE, model);
  drawable.object.scale.setScalar(scale);
  drawable.object.rotation.x = -Math.PI / 2;
  scene.add(drawable.object);

  // Lighting tuned for a dark model on a white scene — bright hemisphere
  // keeps shadows soft, key light gives the cusps depth.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(3, -4, 5);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
  fillLight.position.set(-4, 3, 3);
  scene.add(fillLight);

  // Reference grid ("échelle") stays removed — clean white-box
  // presentation, no floor lines.

  camera.position.set(0, -4.2, 2.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = false;
  controls.target.set(0, 0, 0);
  controls.update();

  const resize = () => {
    const width = Math.max(container.clientWidth, 280);
    const height = Math.max(container.clientHeight, large ? 360 : 240);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  let stopped = false;
  let frameId = 0;
  const animate = () => {
    if (stopped) return;
    controls.update();
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(animate);
  };
  animate();

  return {
    dispose: () => {
      stopped = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      drawable.geometries.forEach((owned) => owned.dispose());
      drawable.materials.forEach((owned) => owned.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

interface Drawable {
  object: Object3D;
  /** Created here (not the model's geometry), so disposed here. */
  geometries: BufferGeometry[];
  materials: Material[];
}

function buildDrawable(THREE: Three, model: LoadedModel): Drawable {
  const { geometry, hasColors } = model;

  if (model.isPointCloud) {
    // Points are unlit: with vertex colours they show the scanner colours
    // exactly; without, the usual slate.
    const material = new THREE.PointsMaterial({
      size: pointSizeFor(geometry.getAttribute('position').count),
      color: hasColors ? 0xffffff : MODEL_COLOR,
      vertexColors: hasColors,
    });
    return {
      object: new THREE.Points(geometry, material),
      geometries: [],
      materials: [material],
    };
  }

  if (hasColors) {
    // Scanner colours are the albedo under the same lights. Matte and
    // non-metallic, so the key light shades the surface instead of
    // bleaching teeth to white. No edge overlay: the dark lines muddy the
    // gum / tooth colours, and colour already separates the shapes.
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    return {
      object: new THREE.Mesh(geometry, material),
      geometries: [],
      materials: [material],
    };
  }

  // Dark grey model material — Tailwind slate-600 (#475569). Reads as
  // clearly dental but contrasts strongly against the white card.
  const material = new THREE.MeshStandardMaterial({
    color: MODEL_COLOR,
    metalness: 0.08,
    roughness: 0.48,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);

  // Edge overlay — slate-900 at low opacity so it crisps up the silhouette
  // against white without dominating the surface shading.
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.25,
  });
  const edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
  mesh.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

  return {
    object: mesh,
    geometries: [edgeGeometry],
    materials: [material, edgeMaterial],
  };
}
