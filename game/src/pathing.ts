import * as THREE from "three";
import { CRATES, segmentHitsExpandedRect } from "./arena";

// Visibility graph over expanded crate corners. Nodes are the start, the
// goal, and every crate corner expanded by the mover radius plus a margin.
// Edges exist only when the straight segment clears every expanded crate.
// This is deliberately small: five crates give at most twenty-two nodes, so
// a Dijkstra pass is cheap, but callers must still cache the route and
// replan only on a material target move, a stall, or a broken waypoint.
export function findRoute(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
): THREE.Vector3[] {
  const expand = radius + 0.25;
  const nodes: THREE.Vector3[] = [from.clone(), to.clone()];
  for (const crate of CRATES) {
    nodes.push(new THREE.Vector3(crate.x - crate.half - expand, 0, crate.z - crate.half - expand));
    nodes.push(new THREE.Vector3(crate.x + crate.half + expand, 0, crate.z - crate.half - expand));
    nodes.push(new THREE.Vector3(crate.x - crate.half - expand, 0, crate.z + crate.half + expand));
    nodes.push(new THREE.Vector3(crate.x + crate.half + expand, 0, crate.z + crate.half + expand));
  }
  const clear = (a: THREE.Vector3, b: THREE.Vector3, isGoalEdge: boolean): boolean => {
    for (const crate of CRATES) {
      if (segmentHitsExpandedRect(a, b, crate, 0)) return false;
      if (!isGoalEdge && segmentHitsExpandedRect(a, b, crate, expand)) return false;
    }
    return true;
  };
  const dist: number[] = nodes.map(() => Infinity);
  const prev: number[] = nodes.map(() => -1);
  const done: boolean[] = nodes.map(() => false);
  dist[0] = 0;
  for (let step = 0; step < nodes.length; step += 1) {
    let best = -1;
    for (let i = 0; i < nodes.length; i += 1) {
      if (!done[i] && (best === -1 || dist[i] < dist[best])) best = i;
    }
    if (best === -1 || dist[best] === Infinity) break;
    done[best] = true;
    if (best === 1) break;
    for (let i = 0; i < nodes.length; i += 1) {
      if (done[i] || i === best) continue;
      if (!clear(nodes[best], nodes[i], i === 1)) continue;
      const alt = dist[best] + nodes[best].distanceTo(nodes[i]);
      if (alt < dist[i]) {
        dist[i] = alt;
        prev[i] = best;
      }
    }
  }
  if (dist[1] === Infinity) return [to.clone()];
  const path: THREE.Vector3[] = [];
  let at = 1;
  while (at !== 0 && at !== -1) {
    path.unshift(nodes[at].clone());
    at = prev[at];
  }
  return path.length > 0 ? path : [to.clone()];
}
