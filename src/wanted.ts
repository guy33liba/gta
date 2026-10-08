import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

type PoliceUnit = {
  mesh: Mesh;
  speed: number;
  targetOffset: Vector3;
  sirenPhase: number;
};

export class WantedSystem {
  private readonly units: PoliceUnit[] = [];
  private readonly policeMaterial: StandardMaterial;
  private readonly lightMaterial: StandardMaterial;
  private wanted = 0;
  private crimeTimer = 0;
  private searchTimer = 0;
  private elapsed = 0;

  constructor(
    private readonly scene: Scene,
    private readonly player: Mesh,
    private readonly car: Mesh,
    private readonly isDriving: () => boolean,
    makeMaterial: (scene: Scene, name: string, color: Color3) => StandardMaterial,
    private readonly onWantedChange: (level: number) => void,
  ) {
    this.policeMaterial = makeMaterial(scene, "PoliceVehicle", new Color3(0.035, 0.055, 0.09));
    this.lightMaterial = makeMaterial(scene, "PoliceLight", new Color3(0.75, 0.05, 0.08));
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
    this.updateUnits(target, dt);
  }

  private syncPolice(target: Mesh) {
    const desired = this.wanted === 0 ? 0 : Math.min(5, 1 + this.wanted);
    while (this.units.length < desired) this.spawnPolice(target, this.units.length);
    while (this.units.length > desired) {
      const unit = this.units.pop();
      unit?.mesh.dispose(false, true);
    }
  }

  private spawnPolice(target: Mesh, index: number) {
    const angle = (index / Math.max(1, this.wanted + 1)) * Math.PI * 2 + 0.8;
    const distance = 38 + index * 12;
    const mesh = MeshBuilder.CreateBox("police-car", { width: 2.15, height: 0.58, depth: 4.25 }, this.scene);
    mesh.position = target.position.add(new Vector3(Math.cos(angle) * distance, 0.58, Math.sin(angle) * distance));
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
    });
  }

  private updateUnits(target: Mesh, dt: number) {
    for (const unit of this.units) {
      const toTarget = target.position.subtract(unit.mesh.position);
      toTarget.y = 0;
      const distance = toTarget.length();
      if (distance < 0.001) continue;

      const desired = toTarget.normalize();
      const speed = unit.speed + Math.min(8, this.wanted * 1.2);
      unit.mesh.position.addInPlace(desired.scale(Math.min(speed * dt, distance)));
      unit.mesh.position.y = 0.58;
      unit.mesh.rotation.y = Math.atan2(desired.x, desired.z);

      const siren = unit.mesh.getChildren()[0] as Mesh | undefined;
      if (siren) {
        siren.scaling.x = 0.85 + Math.abs(Math.sin(this.elapsed * 8 + unit.sirenPhase)) * 0.3;
        siren.scaling.z = 0.85 + Math.abs(Math.sin(this.elapsed * 8 + unit.sirenPhase)) * 0.3;
      }
    }
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
