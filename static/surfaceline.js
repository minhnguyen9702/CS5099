import * as THREE from 'three';

export function buildTriangleSoup(model) {
  /* Convert every mesh into a flat array of world-space triangles.

  Output format:

  [
    x1, y1, z1, x2, y2, z2, x3, y3, z3,
    x1, y1, z1, x2, y2, z2, x3, y3, z3,
    ...
  ]

  Vertices are transformed into world space once so later operations
  don't have to keep applying matrixWorld.
  */
 
  const worldTriangles = [];
  const vertex = new THREE.Vector3(); // reusing one Vector3 avoids creating temporary objects.

  model.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes.position) return;
    object.updateWorldMatrix(true, false);

    const positions = object.geometry.attributes.position;
    const indices = object.geometry.index;
    const worldMatrix = object.matrixWorld;
    const triangleCount = indices ? indices.count / 3 : positions.count / 3;

    for (let tri = 0; tri < triangleCount; tri++) {
      for (let corner = 0; corner < 3; corner++) {
        // resolve this corner's vertex index (indexed or non-indexed geometry)
        // read its local position, and push it in world space.
        const vertexIndex = indices ? indices.getX(tri * 3 + corner) : tri * 3 + corner;
        vertex.fromBufferAttribute(positions, vertexIndex).applyMatrix4(worldMatrix);
        worldTriangles.push(vertex.x, vertex.y, vertex.z);
      }
    }
  });

  return Float32Array.from(worldTriangles);
}

export function sliceLineOnSurface(worldTriangles, from, to, viewpoint) {
  /* Intersect the mesh with the plane defined by the viewpoint and the two
   clicked points. Returns line segments in THREE.LineSegments format:
   [a0, b0, a1, b1, ...].

   Two simple filters remove unwanted intersections:
   - locality: ignore triangles far from the midpoint between the clicks
   - along-chord: clip anything outside the clicked endpoints
  */
  const plane = new THREE.Plane().setFromCoplanarPoints(viewpoint, from, to);

  const normalX = plane.normal.x;
  const normalY = plane.normal.y;
  const normalZ = plane.normal.z;
  const planeConstant = plane.constant;

  const midX = (from.x + to.x) * 0.5;
  const midY = (from.y + to.y) * 0.5;
  const midZ = (from.z + to.z) * 0.5;

  const chordLength = from.distanceTo(to);
  if (chordLength === 0) return [];

  const reachSquared = (chordLength * 1.5) * (chordLength * 1.5);

  const dirX = (to.x - from.x) / chordLength;
  const dirY = (to.y - from.y) / chordLength;
  const dirZ = (to.z - from.z) / chordLength;

  const alongChord = (p) => (p.x - from.x) * dirX + (p.y - from.y) * dirY + (p.z - from.z) * dirZ;

  const distSqToMid = (x, y, z) => {
    const dx = x - midX;
    const dy = y - midY;
    const dz = z - midZ;
    return dx * dx + dy * dy + dz * dz;
  };

  const segments = [];
  const triangleCount = worldTriangles.length / 9;

  for (let tri = 0; tri < triangleCount; tri++) {
    const base = tri * 9;

    const aX = worldTriangles[base];
    const aY = worldTriangles[base + 1];
    const aZ = worldTriangles[base + 2];

    const bX = worldTriangles[base + 3];
    const bY = worldTriangles[base + 4];
    const bZ = worldTriangles[base + 5];

    const cX = worldTriangles[base + 6];
    const cY = worldTriangles[base + 7];
    const cZ = worldTriangles[base + 8];

    // Locality: skip triangles that lie wholly outside the reach sphere.
    if (
      distSqToMid(aX, aY, aZ) > reachSquared &&
      distSqToMid(bX, bY, bZ) > reachSquared &&
      distSqToMid(cX, cY, cZ) > reachSquared
    ) {
      continue;
    }


    const distA =
      normalX * aX +
      normalY * aY +
      normalZ * aZ +
      planeConstant;

    const distB =
      normalX * bX +
      normalY * bY +
      normalZ * bZ +
      planeConstant;

    const distC =
      normalX * cX +
      normalY * cY +
      normalZ * cZ +
      planeConstant;

    // If all three corners are on the same side, the plane misses this triangle.
    if (
      (distA > 0) === (distB > 0) &&
      (distB > 0) === (distC > 0)
    ) {
      continue;
    }

    const crossings = [];

    const addEdgeCrossing = (pX, pY, pZ, qX, qY, qZ, distP, distQ) => {
      if (distP > 0 === distQ > 0) return;
      const frac = distP / (distP - distQ);
      crossings.push(new THREE.Vector3(
        pX + frac * (qX - pX),
        pY + frac * (qY - pY),
        pZ + frac * (qZ - pZ),
      ));
    };
    addEdgeCrossing(aX, aY, aZ, bX, bY, bZ, distA, distB);
    addEdgeCrossing(bX, bY, bZ, cX, cY, cZ, distB, distC);
    addEdgeCrossing(cX, cY, cZ, aX, aY, aZ, distC, distA);
    if (crossings.length !== 2) continue;

    // Along-chord clip: trim the crossing segment to the slab [0, chordLength],
    // so the drawn line neither falls short of nor overshoots the endpoints.
    const along0 = alongChord(crossings[0]);
    const along1 = alongChord(crossings[1]);

    let keepStart = 0, keepEnd = 1;
    if (along0 !== along1) {
      const fracAtStart = (0 - along0) / (along1 - along0);
      const fracAtEnd = (chordLength - along0) / (along1 - along0);
      keepStart = Math.max(0, Math.min(fracAtStart, fracAtEnd));
      keepEnd = Math.min(1, Math.max(fracAtStart, fracAtEnd));
      if (keepStart >= keepEnd) continue;
    } else if (along0 < 0 || along0 > chordLength) {
      continue;
    }

    segments.push(
      crossings[0].clone().lerp(crossings[1], keepStart),
      crossings[0].clone().lerp(crossings[1], keepEnd),
    );
  }

  return segments;
}
