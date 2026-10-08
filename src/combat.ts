import {
  Camera,
  Mesh,
  Ray,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { PedestrianSystem } from "./pedestrians";

export type CombatState = {
  ammo: number;
  magazineSize: number;
  reserveAmmo: number;
  reloading: boolean;
};

export class CombatSystem {
  private readonly state: CombatState = {
    ammo: 12,
    magazineSize: 12,
    reserveAmmo: 60,
    reloading: false,
  };
  private cooldown = 0;
  private reloadTimer = 0;
  private flashTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly pedestrians: PedestrianSystem,
    private readonly canShoot: () => boolean,
    private readonly onStateChange: (state: CombatState) => void,
    private readonly onHit: () => void,
  ) {}

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    if (this.state.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
  }

  shoot() {
    if (!this.canShoot() || this.state.reloading || this.cooldown > 0) return false;
    if (this.state.ammo <= 0) {
      this.reload();
      return false;
    }

    this.state.ammo -= 1;
    this.cooldown = 0.16;
    this.flashTimer = 0.05;

    const origin = this.camera.globalPosition.clone();
    const forward = this.camera.getForwardRay().direction.normalize();
    const ray = new Ray(origin, forward, 120);
    const hit = this.scene.pickWithRay(ray, (mesh) => mesh.name === "pedestrian");

    if (hit?.hit && hit.pickedMesh) {
      const target = hit.pickedMesh as Mesh;
      if (this.pedestrians.damage(target, 34)) this.onHit();
    }

    this.onStateChange({ ...this.state });
    return true;
  }

  reload() {
    if (this.state.reloading || this.state.ammo >= this.state.magazineSize || this.state.reserveAmmo <= 0) return;
    this.state.reloading = true;
    this.reloadTimer = 0.9;
    this.onStateChange({ ...this.state });
  }

  get muzzleFlashActive() {
    return this.flashTimer > 0;
  }

  private finishReload() {
    const needed = this.state.magazineSize - this.state.ammo;
    const loaded = Math.min(needed, this.state.reserveAmmo);
    this.state.ammo += loaded;
    this.state.reserveAmmo -= loaded;
    this.state.reloading = false;
    this.onStateChange({ ...this.state });
  }
}
