import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Ray,
} from "@babylonjs/core";

type PoliceUnit = {
  mesh: Mesh;
  speed: number;
  targetOffset: Vector3;
  sirenPhase: number;
  role: "chase" | "intercept" | "blockade";
  shotCooldown: number;
  combatOffset: number;
};

export class WantedSystem {
  private readonly units: PoliceUnit[] = [];
  private readonly policeMaterial: StandardMaterial;
  private readonly lightMaterial: StandardMaterial;
  private wanted = 0;
  private crimeTimer = 0;
  private searchTimer = 0;
  private elapsed = 0;
  private lastTargetPosition = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly player: Mesh,
    private readonly car: Mesh,
    private readonly isDriving: () => boolean,
    makeMaterial: (scene: Scene, name: string, color: Color3) => StandardMaterial,
    private readonly onWantedChange: (level: number) => void,
    private readonly onPlayerDamage: (amount: number) => void,
  ) {
    this.policeMaterial = makeMaterial(scene, "PoliceVehicle", new Color3(0.035, 0.055, 0.09));
    this.lightMaterial = makeMaterial(scene, "PoliceLight", new Color3(0.75, 0.05, 0.08));
    this.lastTargetPosition.copyFrom(player.position);
  }

  get level() {
    return this.wanted;
  }

  addCrime(amount = 1) {
    this.wanted = Math.min(5, this.wanted + amount);
    this.crimeTimer = 12;
    this.searchTimer = 18;
    this.onWantedChange(this.wanted);
  }

  update(dt: number) {
    this.elapsed += dt;
    const target = this.isDriving() ? this.car : this.player;
    const velocity = target.position.subtract(this.lastTargetPosition);
    velocity.y = 0;
    const targetVelocity = velocity.scale(1 / Math.max(dt, 0.016));
    this.lastTargetPosition.copyFrom(target.position);

    if (this.wanted > 0) {
      this.crimeTimer = Math.max(0, this.crimeTimer - dt);
      if (this.crimeTimer === 0 && Vector3.Distance(this.getClosestUnitPosition(), target.position) > 45) {
        this.searchTimer = Math.max(0, this.searchTimer - dt);
        if (this.searchTimer === 0) {
          this.wanted = Math.max(0, this.wanted - 1);
          this.searchTimer = this.wanted > 0 ? 12 : 0;
          this.onWantedChange(this.wanted);
        }
      }
    }

    this.syncPolice(target);
    this.updateUnits(target, targetVelocity, dt);
  }

  private syncPolice(target: Mesh) {
    const desired = this.wanted === 0 ? 0 : Math.min(5, 1 + this.wanted);
    while (this.units.length < desired) this.spawnPolice(target, this.units.length);
    while (this.units.length > desired) {
      const unit = this.units.pop();
      unit?.mesh.dispose(false, true);
    }

    this.units.forEach((unit, index) => {
      unit.role = this.wanted >= 3 && index === 1
        ? "blockade"
        : this.wanted >= 2 && index === 0
          ? "intercept"
          : "chase";
    });
  }

  private spawnPolice(target: Mesh, index: number) {
    const angle = (index / Math.max(1, this.wanted + 1)) * Math.PI * 2 + 0.8;
    const distance = 38 + index * 12;
    const spawn = this.roadPosition(target.position.add(new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)));
    const mesh = MeshBuilder.CreateBox("police-car", { width: 2.15, height: 0.58, depth: 4.25 }, this.scene);
    mesh.position = new Vector3(spawn.x, 0.58, spawn.z);
    mesh.material = this.policeMaterial;

    const siren = MeshBuilder.CreateBox("police-siren", { width: 0.55, height: 0.12, depth: 0.35 }, this.scene);
    siren.parent = mesh;
    siren.position.y = 0.38;
    siren.material = this.lightMaterial;

    this.units.push({
      mesh,
      speed: 8.5 + index * 0.9,
      targetOffset: new Vector3(0, 0, 0),
      sirenPhase: index * 0.7,
      role: "chase",
      shotCooldown: 0.4 + index * 0.18,
      combatOffset: index % 2 === 0 ? 1 : -1,
    });
  }

  private updateUnits(target: Mesh, targetVelocity: Vector3, dt: number) {
    const predicted = target.position.add(targetVelocity.scale(Math.min(2.4, 0.8 + this.wanted * 0.25)));
    const forward = targetVelocity.lengthSquared() > 0.25
      ? targetVelocity.normalize()
      : new Vector3(Math.sin(target.rotation.y), 0, Math.cos(target.rotation.y));

    for (const [index, unit] of this.units.entries()) {
      unit.shotCooldown = Math.max(0, unit.shotCooldown - dt);
      let goal = target.position.clone();

      if (unit.role === "intercept") {
        goal = this.roadPosition(predicted.add(forward.scale(18 + this.wanted * 4)));
      } else if (unit.role === "blockade") {
        const side = new Vector3(-forward.z, 0, forward.x);
        goal = this.roadPosition(predicted.add(forward.scale(34)).add(side.scale(index % 2 === 0 ? 5 : -5)));
      } else {
        const side = new Vector3(-forward.z, 0, forward.x);
        const offset = side.scale(index % 2 === 0 ? 4 : -4);
        goal = this.roadPosition(target.position.add(offset));
      }

      const toGoal = goal.subtract(unit.mesh.position);
      toGoal.y = 0;
      const distance = toGoal.length();
      if (distance < 0.8) continue;

      const desired = toGoal.normalize();
      const baseSpeed = unit.speed + Math.min(10, this.wanted * 1.6);
      const closingBoost = distance > 80 ? 2.5 : 0;
      const speed = baseSpeed + closingBoost;
      const step = Math.min(speed * dt, distance);
      unit.mesh.position.addInPlace(desired.scale(step));
      unit.mesh.position.y = 0.58;
      unit.mesh.rotation.y = Math.atan2(desired.x, desired.z);

      for (const other of this.units) {
        if (other === unit) continue;
        const separation = unit.mesh.position.subtract(other.mesh.position);
        separation.y = 0;
        const d = separation.length();
        if (d > 0 && d < 4.5) {
          unit.mesh.position.addInPlace(separation.normalize().scale((4.5 - d) * dt * 3));
        }
      }

      const targetDistance = Vector3.Distance(unit.mesh.position, target.position);
      this.updatePoliceCombat(unit, target, targetDistance);
      if (targetDistance < 3.2 && this.wanted >= 3) {
        const push = unit.mesh.position.subtract(target.position);
        push.y = 0;
        if (push.lengthSquared() > 0.01) {
          target.position.addInPlace(push.normalize().scale(dt * 1.2));
        }
      }

      const siren = unit.mesh.getChildren()[0] as Mesh | undefined;
      if (siren) {
        const pulse = Math.abs(Math.sin(this.elapsed * 8 + unit.sirenPhase));
        siren.scaling.x = 0.85 + pulse * 0.3;
        siren.scaling.z = 0.85 + pulse * 0.3;
      }
    }
  }


  private updatePoliceCombat(unit: PoliceUnit, target: Mesh, targetDistance: number) {
    if (this.wanted < 1 || targetDistance > 42 || unit.shotCooldown > 0) return;

    const origin = unit.mesh.position.add(new Vector3(0, 0.8, 0));
    const targetPoint = target.position.add(new Vector3(0, this.isDriving() ? 0.55 : 0.8, 0));
    const toTarget = targetPoint.subtract(origin);
    const distance = toTarget.length();
    if (distance <= 0.1) return;

    const direction = toTarget.scale(1 / distance);
    const hit = this.scene.pickWithRay(new Ray(origin, direction, distance + 0.5));
    if (hit?.pickedMesh !== target) return;

    unit.shotCooldown = Math.max(0.42, 0.9 - this.wanted * 0.07 + unit.combatOffset * 0.06);
    this.onPlayerDamage(this.wanted >= 4 ? 9 : 6);
  }

  private roadPosition(position: Vector3) {
    const road = 56;
    const nearestX = Math.round(position.x / road) * road;
    const nearestZ = Math.round(position.z / road) * road;
    const dx = Math.abs(position.x - nearestX);
    const dz = Math.abs(position.z - nearestZ);

    if (dx < dz) {
      return new Vector3(nearestX, 0.58, position.z);
    }
    return new Vector3(position.x, 0.58, nearestZ);
  }

  private getClosestUnitPosition() {
    if (this.units.length === 0) return this.player.position.add(new Vector3(999, 0, 999));
    let closest = this.units[0].mesh.position;
    let best = Vector3.DistanceSquared(closest, this.player.position);
    for (let i = 1; i < this.units.length; i++) {
      const candidate = this.units[i].mesh.position;
      const distance = Vector3.DistanceSquared(candidate, this.player.position);
      if (distance < best) {
        best = distance;
        closest = candidate;
      }
    }
    return closest;
  }
}
