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

export type WorldStream = { update(): void };

const CHUNK_SIZE = 56;
const ACTIVE_RADIUS = 2;

export function createWorldStream(
  scene: Scene,
  focus: Mesh,
  makeMaterial: (scene: Scene, name: string, color: Color3) => StandardMaterial,
): WorldStream {
  const groundMaterial = makeMaterial(scene, "WorldGround", new Color3(0.045, 0.055, 0.065));
  const roadMaterial = makeMaterial(scene, "WorldRoad", new Color3(0.018, 0.022, 0.028));
  const sidewalkMaterial = makeMaterial(scene, "WorldSidewalk", new Color3(0.12, 0.13, 0.14));
  const laneMaterial = makeMaterial(scene, "WorldLaneMark", new Color3(0.82, 0.78, 0.55));
  const grassMaterial = makeMaterial(scene, "WorldGrass", new Color3(0.05, 0.16, 0.07));
  const trunkMaterial = makeMaterial(scene, "WorldTreeTrunk", new Color3(0.16, 0.09, 0.045));
  const leafMaterial = makeMaterial(scene, "WorldTreeLeaf", new Color3(0.035, 0.20, 0.08));
  const buildingMaterials = [
    makeMaterial(scene, "WorldConcrete", new Color3(0.22, 0.24, 0.27)),
    makeMaterial(scene, "WorldWarmConcrete", new Color3(0.28, 0.24, 0.20)),
    makeMaterial(scene, "WorldGlass", new Color3(0.08, 0.13, 0.17)),
  ];

  const ground = MeshBuilder.CreateGround("world-ground", { width: 800, height: 800 }, scene);
  ground.material = groundMaterial;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, restitution: 0.05, friction: 0.9 }, scene);

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
      width: 12, height: 0.04, depth: CHUNK_SIZE,
    }, scene);
    verticalRoad.position.set(ox, 0.02, oz);
    verticalRoad.material = roadMaterial;
    meshes.push(verticalRoad);

    const horizontalRoad = MeshBuilder.CreateBox("road-h-" + key, {
      width: CHUNK_SIZE, height: 0.04, depth: 12,
    }, scene);
    horizontalRoad.position.set(ox, 0.025, oz);
    horizontalRoad.material = roadMaterial;
    meshes.push(horizontalRoad);

    const sidewalkPieces = [
      { x: -8, z: 0, w: 4, d: CHUNK_SIZE },
      { x: 8, z: 0, w: 4, d: CHUNK_SIZE },
      { x: 0, z: -8, w: CHUNK_SIZE, d: 4 },
      { x: 0, z: 8, w: CHUNK_SIZE, d: 4 },
    ];
    for (const piece of sidewalkPieces) {
      const sidewalk = MeshBuilder.CreateBox("sidewalk-" + key, {
        width: piece.w, height: 0.08, depth: piece.d,
      }, scene);
      sidewalk.position.set(ox + piece.x, 0.08, oz + piece.z);
      sidewalk.material = sidewalkMaterial;
      meshes.push(sidewalk);
    }

    for (let lane = -1; lane <= 1; lane += 2) {
      const verticalMark = MeshBuilder.CreateBox("lane-v-" + key + "-" + lane, {
        width: 0.12, height: 0.025, depth: CHUNK_SIZE - 4,
      }, scene);
      verticalMark.position.set(ox + lane * 3, 0.055, oz);
      verticalMark.material = laneMaterial;
      meshes.push(verticalMark);

      const horizontalMark = MeshBuilder.CreateBox("lane-h-" + key + "-" + lane, {
        width: CHUNK_SIZE - 4, height: 0.025, depth: 0.12,
      }, scene);
      horizontalMark.position.set(ox, 0.06, oz + lane * 3);
      horizontalMark.material = laneMaterial;
      meshes.push(horizontalMark);
    }

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
      building.scaling = new Vector3(1, 1, 1);
      building.freezeWorldMatrix();

      const body = new PhysicsAggregate(building, PhysicsShapeType.BOX, {
        mass: 0, restitution: 0, friction: 0.8,
      }, scene);
      bodies.push(body);
      meshes.push(building);

      const roof = MeshBuilder.CreateBox("roof-" + key + "-" + i, {
        width: 10 + (i % 3) * 2, height: 0.35, depth: 10 + ((i + 1) % 3) * 2,
      }, scene);
      roof.position.set(x, height + 0.2, z);
      roof.material = buildingMaterials[(i + 1) % buildingMaterials.length];
      roof.freezeWorldMatrix();
      meshes.push(roof);

      const awning = MeshBuilder.CreateBox("awning-" + key + "-" + i, {
        width: 4.5, height: 0.35, depth: 0.7,
      }, scene);
      awning.position.set(x, Math.min(height - 1, 5), z - 6);
      awning.material = buildingMaterials[(i + 2) % buildingMaterials.length];
      awning.freezeWorldMatrix();
      meshes.push(awning);
    }

    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tree = MeshBuilder.CreateCylinder("tree-trunk-" + key + "-" + i, {
        height: 2.8, diameter: 0.22, tessellation: 8,
      }, scene);
      tree.position.set(ox + side * 10, 1.4, oz - 18 + i * 12);
      tree.material = trunkMaterial;
      tree.freezeWorldMatrix();
      meshes.push(tree);

      const crown = MeshBuilder.CreateSphere("tree-crown-" + key + "-" + i, {
        diameter: 2.4, segments: 8,
      }, scene);
      crown.position.set(tree.position.x, 3.0, tree.position.z);
      crown.material = leafMaterial;
      crown.freezeWorldMatrix();
      meshes.push(crown);
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
