import * as THREE from 'three';
import { MONOGRAM_CONTOURS, MONOGRAM_VIEWBOX } from '@/assets/monogram';

/** Converte o contorno (coordenadas SVG, y para baixo) para o espaço do Three. */
function toPoints(flat: number[]): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    points.push(
      new THREE.Vector2(
        flat[i] / MONOGRAM_VIEWBOX - 0.5,
        0.5 - flat[i + 1] / MONOGRAM_VIEWBOX,
      ),
    );
  }
  return points;
}

function isInside(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-9) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export interface MonogramGeometryOptions {
  depth?: number;
  bevel?: number;
  bevelSegments?: number;
}

/**
 * Extrusão 3D do monograma AM a partir dos contornos reais do logotipo.
 * O resultado é centralizado na origem e cabe num cubo de ~1 unidade.
 */
export function createMonogramGeometry({
  depth = 0.13,
  bevel = 0.009,
  bevelSegments = 4,
}: MonogramGeometryOptions = {}): THREE.ExtrudeGeometry {
  const solids = MONOGRAM_CONTOURS.filter((contour) => !contour.hole).map((contour) =>
    toPoints(contour.points),
  );
  const holes = MONOGRAM_CONTOURS.filter((contour) => contour.hole).map((contour) =>
    toPoints(contour.points),
  );

  const shapes = solids.map((outline) => {
    const shape = new THREE.Shape(outline);
    for (const hole of holes) {
      if (isInside(hole[0], outline)) shape.holes.push(new THREE.Path(hole));
    }
    return shape;
  });

  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.75,
    bevelOffset: 0,
    bevelSegments,
    curveSegments: 2,
  });

  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

/** Sprite radial usado pelas partículas douradas (evita texturas externas). */
export function createParticleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,246,220,1)');
    gradient.addColorStop(0.35, 'rgba(227,194,126,0.75)');
    gradient.addColorStop(1, 'rgba(201,160,80,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
