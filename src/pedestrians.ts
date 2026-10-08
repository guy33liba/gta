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
  stagger: number;
  knockback: Vector3;
  awareness: "calm" | "alert" | "fleeing";
  panicTimer: number;
  threat: Vector3;
  group: number;
  activityTimer: number;
  crossCooldown: number;
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
  private gunshotThreats: Array<{ position: Vector3; timer: number }> = [];
  private policeThreats: Vector3[] = [];

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

  damage(target: Mesh, amount: number, hitPosition?: Vector3, hitDirection?: Vector3) {
    const pedestrian = this.pedestrians.find((item) => item.mesh === target);
    if (!pedestrian) return false;
    pedestrian.health -= amount;
    pedestrian.pause = 0.22;
    pedestrian.stagger = Math.min(0.6, pedestrian.stagger + 0.28);
    if (hitDirection) { const push = hitDirection.clone(); push.y = 0; if (push.lengthSquared() > 0) { push.normalize(); pedestrian.knockback.addInPlace(push.scale(3.2)); } }
    if (hitPosition) pedestrian.mesh.rotation.z = hitPosition.x >= pedestrian.mesh.position.x ? -0.14 : 0.14;
    if (pedestrian.health <= 0) {
      pedestrian.mesh.dispose(false, true);
      this.pedestrians.splice(this.pedestrians.indexOf(pedestrian), 1);
    }
    return true;
  }

  notifyGunshot(position: Vector3) {
    this.gunshotThreats.push({ position: position.clone(), timer: 2.8 });
    if (this.gunshotThreats.length > 6) this.gunshotThreats.shift();
  }

  setPoliceThreats(positions: Vector3[]) {
    this.policeThreats = positions;
  }

  update(dt: number) {
    this.elapsed += dt;
    for (let i = this.gunshotThreats.length - 1; i >= 0; i--) {
      this.gunshotThreats[i].timer -= dt;
      if (this.gunshotThreats[i].timer <= 0) this.gunshotThreats.splice(i, 1);
    }
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
      stagger: 0,
      knockback: Vector3.Zero(),
      awareness: "calm",
      panicTimer: 0,
      threat: Vector3.Zero(),
      group: Math.floor(seed / 2),
      activityTimer: 2 + (seed % 7),
      crossCooldown: 0,
    });
  }

  private updatePedestrian(pedestrian: Pedestrian, dt: number) {
    if (pedestrian.stagger > 0) {
      pedestrian.stagger = Math.max(0, pedestrian.stagger - dt);
      pedestrian.mesh.rotation.z *= Math.max(0, 1 - dt * 6);
    }
    if (pedestrian.knockback.lengthSquared() > 0.01) {
      pedestrian.mesh.position.addInPlace(pedestrian.knockback.scale(dt));
      pedestrian.knockback.scaleInPlace(Math.max(0, 1 - dt * 9));
    }

    const position = pedestrian.mesh.position;
    pedestrian.activityTimer = Math.max(0, pedestrian.activityTimer - dt);
    pedestrian.crossCooldown = Math.max(0, pedestrian.crossCooldown - dt);
    const threat = this.findThreat(position);
    if (threat) {
      pedestrian.awareness = "fleeing";
      pedestrian.panicTimer = Math.max(pedestrian.panicTimer, threat.distance < 12 ? 4.5 : 3.2);
      pedestrian.threat.copyFrom(threat.position);
    } else if (pedestrian.panicTimer > 0) {
      pedestrian.panicTimer = Math.max(0, pedestrian.panicTimer - dt);
      if (pedestrian.panicTimer === 0) pedestrian.awareness = "calm";
    }

    if (pedestrian.pause > 0 && pedestrian.awareness !== "fleeing") {
      pedestrian.pause -= dt;
      return;
    }

    if (pedestrian.awareness === "fleeing") {
      this.updateFleeingPedestrian(pedestrian, dt);
      return;
    }

    if (pedestrian.pause > 0) {
      pedestrian.pause -= dt;
      return;
    }

    const roadX = Math.round(position.x / ROAD_SPACING) * ROAD_SPACING;
    const roadZ = Math.round(position.z / ROAD_SPACING) * ROAD_SPACING;
    const alongIntersection = pedestrian.axis === "x"
      ? Math.abs(position.x - roadX) < 2.5
      : Math.abs(position.z - roadZ) < 2.5;

    if (alongIntersection && pedestrian.crossCooldown === 0 && !pedestrian.crossing) {
      pedestrian.crossing = true;
      pedestrian.crossCooldown = 5 + (pedestrian.seed % 5);
      if ((pedestrian.seed + Math.floor(this.elapsed / 6)) % 3 !== 0) {
        const currentSide = pedestrian.axis === "x" ? position.z : position.x;
        const crossSide = currentSide >= (pedestrian.axis === "x" ? roadZ : roadX) ? -1 : 1;
        if (pedestrian.axis === "x") {
          position.z = roadZ + crossSide * SIDEWALK_OFFSET;
          pedestrian.direction = pedestrian.seed % 2 === 0 ? pedestrian.direction : -pedestrian.direction as 1 | -1;
        } else {
          position.x = roadX + crossSide * SIDEWALK_OFFSET;
          pedestrian.direction = pedestrian.seed % 2 === 0 ? pedestrian.direction : -pedestrian.direction as 1 | -1;
        }
      }
    }

    if (!alongIntersection) pedestrian.crossing = false;

    if (pedestrian.activityTimer === 0 && !pedestrian.crossing) {
      pedestrian.pause = 0.45 + (pedestrian.seed % 4) * 0.3;
      pedestrian.activityTimer = 5 + (pedestrian.seed % 9);
    }

    const forward = pedestrian.axis === "x"
      ? new Vector3(pedestrian.direction, 0, 0)
      : new Vector3(0, 0, pedestrian.direction);
    if (this.isBlocked(pedestrian, forward)) {
      pedestrian.pause = 0.45;
      return;
    }

    position.addInPlace(forward.scale(pedestrian.speed * dt));
    position.y = 1.05;
    pedestrian.mesh.rotation.y = Math.atan2(forward.x, forward.z);
  }

  private updateFleeingPedestrian(pedestrian: Pedestrian, dt: number) {
    const away = pedestrian.mesh.position.subtract(pedestrian.threat);
    away.y = 0;
    if (away.lengthSquared() < 0.01) away.copyFrom(new Vector3(1, 0, 0));
    away.normalize();

    const side = new Vector3(-away.z, 0, away.x);
    const sidestep = Math.sin(this.elapsed * 4 + pedestrian.seed) * 0.22;
    const escapeDirection = away.add(side.scale(sidestep)).normalize();
    const speed = 4.2 + (pedestrian.seed % 4) * 0.35;

    if (!this.isBlocked(pedestrian, escapeDirection)) {
      pedestrian.mesh.position.addInPlace(escapeDirection.scale(speed * dt));
    } else {
      pedestrian.mesh.position.addInPlace(side.scale((pedestrian.seed % 2 === 0 ? 1 : -1) * speed * dt));
    }
    pedestrian.mesh.position.y = 1.05;
    pedestrian.mesh.rotation.y = Math.atan2(escapeDirection.x, escapeDirection.z);
    pedestrian.mesh.rotation.z = Math.sin(this.elapsed * 14 + pedestrian.seed) * 0.045;
  }

  private findThreat(position: Vector3) {
    let best: { position: Vector3; distance: number } | null = null;
    for (const gunshot of this.gunshotThreats) {
      const distance = Vector3.Distance(position, gunshot.position);
      if (distance < 28 && (!best || distance < best.distance)) best = { position: gunshot.position, distance };
    }
    for (const police of this.policeThreats) {
      const distance = Vector3.Distance(position, police);
      if (distance < 18 && (!best || distance < best.distance)) best = { position: police, distance };
    }
    return best;
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
