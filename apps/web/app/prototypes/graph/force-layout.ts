// Deterministic force-directed layout (graph.md §2): seeded initial
// positions plus a fixed number of repulsion/spring iterations, so the same
// case renders the same layout every time. Hand-rolled to keep the
// prototype dependency-free; the feature milestone evaluates real layout
// libraries against this baseline.

export interface LayoutPoint {
  x: number;
  y: number;
}

interface SimulatedNode {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeLayout(
  nodeIds: string[],
  edges: Array<[string, string]>,
  width: number,
  height: number,
): Map<string, LayoutPoint> {
  const random = mulberry32(1879);
  const byId = new Map<string, SimulatedNode>(
    nodeIds.map((id) => [
      id,
      {
        x: (random() - 0.5) * width,
        y: (random() - 0.5) * height,
        dx: 0,
        dy: 0,
      },
    ]),
  );
  const nodes = [...byId.values()];
  const edgePairs: Array<[SimulatedNode, SimulatedNode]> = [];
  for (const [from, to] of edges) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (a && b) edgePairs.push([a, b]);
  }

  const area = width * height;
  const k = Math.sqrt(area / Math.max(1, nodes.length));
  const iterations = 300;
  let temperature = width / 8;
  const cooling = temperature / (iterations + 1);

  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const node of nodes) {
      node.dx = 0;
      node.dy = 0;
    }

    for (const [i, a] of nodes.entries()) {
      for (const b of nodes.slice(i + 1)) {
        let deltaX = a.x - b.x;
        let deltaY = a.y - b.y;
        let distance = Math.hypot(deltaX, deltaY);
        if (distance < 0.01) {
          deltaX = random() - 0.5;
          deltaY = random() - 0.5;
          distance = Math.hypot(deltaX, deltaY);
        }
        const repulsion = (k * k) / distance;
        const fx = (deltaX / distance) * repulsion;
        const fy = (deltaY / distance) * repulsion;
        a.dx += fx;
        a.dy += fy;
        b.dx -= fx;
        b.dy -= fy;
      }
    }

    for (const [a, b] of edgePairs) {
      const deltaX = a.x - b.x;
      const deltaY = a.y - b.y;
      const distance = Math.max(0.01, Math.hypot(deltaX, deltaY));
      const attraction = (distance * distance) / k;
      const fx = (deltaX / distance) * attraction;
      const fy = (deltaY / distance) * attraction;
      a.dx -= fx;
      a.dy -= fy;
      b.dx += fx;
      b.dy += fy;
    }

    for (const node of nodes) {
      // Mild gravity toward the center keeps disconnected pieces on canvas.
      node.dx -= node.x * 0.02;
      node.dy -= node.y * 0.02;
      const displacement = Math.hypot(node.dx, node.dy);
      if (displacement > 0) {
        const limited = Math.min(displacement, temperature);
        node.x += (node.dx / displacement) * limited;
        node.y += (node.dy / displacement) * limited;
      }
    }
    temperature -= cooling;
  }

  // Normalize into the requested box with padding.
  const padding = 60;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const result = new Map<string, LayoutPoint>();
  for (const [id, node] of byId) {
    result.set(id, {
      x: padding + ((node.x - minX) / spanX) * (width - 2 * padding),
      y: padding + ((node.y - minY) / spanY) * (height - 2 * padding),
    });
  }
  return result;
}
