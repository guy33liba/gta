import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

type Pedestrian = {
  mesh: Mesh;
  axis: "x" | "z";
  direction: 1 | -1;
  speed: number;
  seed: number;
  pause: number;
  crossing: boolean;
  health: number;
};

const ROAD_SPACING = 56;
const SIDEWALK_OFFSET = 9;
const SPAWN_RADIUS = 120;
const DESPAWN_RADIUS = 165;
const MAX_PEDESTRIANS = 28;

export class PedestrianSystem {
  private readonly pedestrians: Pedestrian[] = [];
  private readonly bodyMaterial: StandardMaterial;
  private readonly shirtMaterials: StandardMaterial[];
  private elapsed = 0;

  constructor(
    private readonly scene: Scene,
    private readonly focus: Mesh,
    private readonly playerCar: Mesh,
    private readonly isPlayerDriving: () => boolean,
    makeMaterial: (scene: Scene, name: string, color: Color3) => StandardMaterial,
  ) {
    this.bodyMaterial = makeMaterial(scene, "PedestrianSkin", new Color3(0.34, 0.2, 0.12));
    this.shirtMaterials = [
      makeMaterial(scene, "PedestrianShirtA", new Color3(0.12, 0.28, 0.55)),
      makeMaterial(scene, "PedestrianShirtB", new Color3(0.5, 0.12, 0.12)),
      makeMaterial(scene, "PedestrianShirtC", new Color3(0.25, 0.32, 0.18)),
    ];
  }

  damage(target: Mesh, amount: number) {
    const pedestrian = this.pedestrians.find((item) => item.mesh === target);
    if (!pedestrian) return false;
    pedestrian.health -= amount;
    if (pedestrian.health <= 0) {
      pedestrian.mesh.dispose(false, true);
      this.pedestrians.splice(this.pedestrians.indexOf(pedestrian), 1);
    }
    return true;
  }

  update(dt: number) {
    this.elapsed += dt;
    this.ensurePopulation();
    for (const pedestrian of this.pedestrians) this.updatePedestrian(pedestrian, dt);
    this.despawnFarPedestrians();
  }

  private ensurePopulation() {
    let attempts = 0;
    while (this.pedestrians.length < MAX_PEDESTRIANS && attempts < MAX_PEDESTRIANS * 3) {
      attempts++;
      const index = this.pedestrians.length * 7 + Math.floor(this.elapsed);
      const axis: "x" | "z" = index % 2 === 0 ? "x" : "z";
      const roadX = Math.round(this.focus.position.x / ROAD_SPACING) * ROAD_SPACING;
      const roadZ = Math.round(this.focus.position.z / ROAD_SPACING) * ROAD_SPACING;
      const roadIndex = (index % 5) - 2;
      const road = (axis === "x" ? roadZ : roadX) + roadIndex * ROAD_SPACING;
      const along = ((index * 31) % (SPAWN_RADIUS * 2)) - SPAWN_RADIUS;
      const side = index % 2 === 0 ? 1 : -1;
      const position = axis === "x"
        ? new Vector3(roadX + along, 1.05, road + side * SIDEWALK_OFFSET)
        : new Vector3(road + side * SIDEWALK_OFFSET, 1.05, roadZ + along);

      if (Vector3.Distance(position, this.focus.position) > SPAWN_RADIUS) continue;
      if (this.pedestrians.some((other) => Vector3.Distance(other.mesh.position, position) < 4)) continue;
      this.addPedestrian(position, axis, index % 2 === 0 ? 1 : -1, index);
    }
  }

  private addPedestrian(position: Vector3, axis: "x" | "z", direction: 1 | -1, seed: number) {
    const mesh = MeshBuilder.CreateCapsule("pedestrian", { height: 1.8, radius: 0.28 }, this.scene);
    mesh.position.copyFrom(position);
    mesh.material = this.shirtMaterials[seed % this.shirtMaterials.length];

    const head = MeshBuilder.CreateSphere("pedestrian-head", { diameter: 0.48, segments: 8 }, this.scene);
    head.parent = mesh;
    head.position = new Vector3(0, 0.98, 0);
    head.material = this.bodyMaterial;

    this.pedestrians.push({
      mesh,
      axis,
      direction,
      speed: 1.1 + (seed % 5) * 0.18,
      seed,
      pause: 0,
      crossing: false,
      health: 100,
    });
  }

  private updatePedestrian(pedestrian: Pedestrian, dt: number) {
    if (pedestrian.pause > 0) {
      pedestrian.pause -= dt;
      return;
    }

    const position = pedestrian.mesh.position;
    const roadX = Math.round(position.x / ROAD_SPACING) * ROAD_SPACING;
    const roadZ = Math.round(position.z / ROAD_SPACING) * ROAD_SPACING;
    const nearIntersection = Math.abs(position.x - roadX) < 2 && Math.abs(position.z - roadZ) < 2;

    if (nearIntersection && !pedestrian.crossing) {
      pedestrian.crossing = true;
      if (this.elapsed % 10 < 4) {
        pedestrian.axis = pedestrian.axis === "x" ? "z" : "x";
        pedestrian.direction = pedestrian.seed % 3 === 0 ? -pedestrian.direction as 1 | -1 : pedestrian.direction;
      } else {
        pedestrian.pause = 0.8 + (pedestrian.seed % 3) * 0.35;
      }
    }

    if (!nearIntersection) pedestrian.crossing = false;

    const forward = pedestrian.axis === "x"
      ? new Vector3(pedestrian.direction, 0, 0)
      : new Vector3(0, 0, pedestrian.direction);
    const blocked = this.isBlocked(pedestrian, forward);
    if (blocked) {
      pedestrian.pause = 0.45;
      return;
    }

    position.addInPlace(forward.scale(pedestrian.speed * dt));
    position.y = 1.05;
    pedestrian.mesh.rotation.y = Math.atan2(forward.x, forward.z);
  }

  private isBlocked(pedestrian: Pedestrian, forward: Vector3) {
    for (const other of this.pedestrians) {
      if (other === pedestrian) continue;
      const delta = other.mesh.position.subtract(pedestrian.mesh.position);
      const ahead = Vector3.Dot(delta, forward);
      if (ahead > 0 && ahead < 1.8) {
        const lateral = Math.abs(Vector3.Dot(delta, new Vector3(-forward.z, 0, forward.x)));
        if (lateral < 0.7) return true;
      }
    }

    if (this.isPlayerDriving()) {
      const delta = this.playerCar.position.subtract(pedestrian.mesh.position);
      const ahead = Vector3.Dot(delta, forward);
      const lateral = Math.abs(Vector3.Dot(delta, new Vector3(-forward.z, 0, forward.x)));
      if (ahead > 0 && ahead < 5 && lateral < 2.5) return true;
    }
    return false;
  }

  private despawnFarPedestrians() {
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      if (Vector3.Distance(this.pedestrians[i].mesh.position, this.focus.position) > DESPAWN_RADIUS) {
        this.pedestrians[i].mesh.dispose();
        this.pedestrians.splice(i, 1);
      }
    }
  }
}
