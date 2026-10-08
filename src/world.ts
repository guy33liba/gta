import {
  Color3,
  Mesh,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

export type WorldStream = {
  update(): void;
};

const CHUNK_SIZE = 56;
const ACTIVE_RADIUS = 2;

export function createWorldStream(
  scene: Scene,
  focus: Mesh,
  makeMaterial: (scene: Scene, name: string, color: Color3) => StandardMaterial,
): WorldStream {
  const groundMaterial = makeMaterial(scene, "WorldGround", new Color3(0.045, 0.055, 0.065));
  const roadMaterial = makeMaterial(scene, "WorldRoad", new Color3(0.018, 0.022, 0.028));
  const buildingMaterials = [
    makeMaterial(scene, "WorldConcrete", new Color3(0.22, 0.24, 0.27)),
    makeMaterial(scene, "WorldWarmConcrete", new Color3(0.28, 0.24, 0.20)),
    makeMaterial(scene, "WorldGlass", new Color3(0.08, 0.13, 0.17)),
  ];

  const ground = MeshBuilder.CreateGround("world-ground", { width: 800, height: 800 }, scene);
  ground.material = groundMaterial;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, {
    mass: 0,
    restitution: 0.05,
    friction: 0.9,
  }, scene);

  type Chunk = { meshes: Mesh[]; bodies: PhysicsAggregate[] };
  const chunks = new Map<string, Chunk>();

  const load = (cx: number, cz: number) => {
    const key = cx + ":" + cz;
    if (chunks.has(key)) return;

    const meshes: Mesh[] = [];
    const bodies: PhysicsAggregate[] = [];
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    const verticalRoad = MeshBuilder.CreateBox("road-v-" + key, {
      width: 12,
      height: 0.04,
      depth: CHUNK_SIZE,
    }, scene);
    verticalRoad.position = new Vector3(ox, 0.02, oz);
    verticalRoad.material = roadMaterial;
    meshes.push(verticalRoad);

    const horizontalRoad = MeshBuilder.CreateBox("road-h-" + key, {
      width: CHUNK_SIZE,
      height: 0.04,
      depth: 12,
    }, scene);
    horizontalRoad.position = new Vector3(ox, 0.025, oz);
    horizontalRoad.material = roadMaterial;
    meshes.push(horizontalRoad);

    for (let i = 0; i < 6; i++) {
      const x = ox + (i % 3 === 0 ? -20 : i % 3 === 1 ? 4 : 20);
      const z = oz + (i < 3 ? -20 : 20);
      const height = 9 + Math.abs((cx * 17 + cz * 11 + i * 7) % 28);
      const building = MeshBuilder.CreateBox("building-" + key + "-" + i, {
        width: 11 + (i % 3) * 2,
        depth: 11 + ((i + 1) % 3) * 2,
        height,
      }, scene);
      building.position.set(x, height / 2, z);
      building.material = buildingMaterials[i % buildingMaterials.length];
      const body = new PhysicsAggregate(building, PhysicsShapeType.BOX, {
        mass: 0,
        restitution: 0,
        friction: 0.8,
      }, scene);
      bodies.push(body);
      meshes.push(building);
    }

    chunks.set(key, { meshes, bodies });
  };

  const unload = (key: string) => {
    const chunk = chunks.get(key);
    if (!chunk) return;
    for (const body of chunk.bodies) body.dispose();
    for (const mesh of chunk.meshes) mesh.dispose();
    chunks.delete(key);
  };

  return {
    update() {
      const cx = Math.round(focus.position.x / CHUNK_SIZE);
      const cz = Math.round(focus.position.z / CHUNK_SIZE);
      const required = new Set<string>();

      for (let x = cx - ACTIVE_RADIUS; x <= cx + ACTIVE_RADIUS; x++) {
        for (let z = cz - ACTIVE_RADIUS; z <= cz + ACTIVE_RADIUS; z++) {
          const key = x + ":" + z;
          required.add(key);
          load(x, z);
        }
      }

      for (const key of chunks.keys()) {
        if (!required.has(key)) unload(key);
      }
    },
  };
}
