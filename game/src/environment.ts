import * as THREE from "three";
import type { Environment } from "./assets";

// Distant layers only. Nothing built here collides, blocks shots, or
// moves. The arena walls stay between the player and these cards, so a
// single-view card cannot be circled at close range.
export function buildEnvironment(
  textures: Map<string, THREE.Texture>,
  env: Environment,
): THREE.Group {
  const group = new THREE.Group();
  const skylineTexture = textures.get(env.skyline.asset);
  if (skylineTexture) {
    skylineTexture.wrapS = THREE.RepeatWrapping;
    const material = new THREE.MeshBasicMaterial({
      depthWrite: false,
      map: skylineTexture,
      side: THREE.BackSide,
      transparent: true,
    });
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(env.skyline.radius, env.skyline.radius, env.skyline.height, 64, 1, true),
      material,
    );
    cylinder.position.y = env.skyline.height / 2;
    cylinder.renderOrder = 1;
    group.add(cylinder);
  }
  const ruinsTexture = textures.get(env.ruins.asset);
  if (ruinsTexture) {
    const material = new THREE.MeshBasicMaterial({
      depthWrite: false,
      map: ruinsTexture,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const geometry = new THREE.PlaneGeometry(env.ruins.width, env.ruins.height);
    for (const [x, z, rotationY] of env.ruins.cards) {
      const card = new THREE.Mesh(geometry, material);
      card.position.set(x, env.ruins.height / 2, z);
      card.rotation.y = rotationY;
      card.renderOrder = 2;
      group.add(card);
    }
  }
  return group;
}

export function applySky(scene: THREE.Scene, texture: THREE.Texture | undefined): void {
  if (!texture) return;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = texture;
}
