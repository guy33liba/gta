import { Camera, Color3, Mesh, MeshBuilder, PointLight, Ray, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { PedestrianSystem } from "./pedestrians";

export type CombatState = { ammo: number; magazineSize: number; reserveAmmo: number; reloading: boolean };

export class CombatSystem {
  private readonly state: CombatState = { ammo: 12, magazineSize: 12, reserveAmmo: 60, reloading: false };
  private cooldown = 0;
  private reloadTimer = 0;
  private flashTimer = 0;
  private recoil = 0;
  private readonly muzzle: Mesh;
  private readonly muzzleMaterial: StandardMaterial;
  private readonly muzzleLight: PointLight;
  private readonly impactMaterial: StandardMaterial;
  private readonly impactCoreMaterial: StandardMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly pedestrians: PedestrianSystem,
    private readonly canShoot: () => boolean,
    private readonly onStateChange: (state: CombatState) => void,
    private readonly onHit: () => void,
  ) {
    this.impactMaterial = new StandardMaterial("BulletImpact", scene);
    this.impactMaterial.diffuseColor = new Color3(1, 0.55, 0.12);
    this.impactMaterial.emissiveColor = new Color3(1, 0.18, 0.03);
    this.impactMaterial.specularColor = Color3.Black();
    this.impactCoreMaterial = new StandardMaterial("BulletImpactCore", scene);
    this.impactCoreMaterial.diffuseColor = new Color3(1, 0.9, 0.45);
    this.impactCoreMaterial.emissiveColor = new Color3(1, 0.75, 0.2);
    this.impactCoreMaterial.specularColor = Color3.Black();

    this.muzzle = MeshBuilder.CreatePlane("weapon-muzzle-flash", { size: 0.42 }, scene);
    this.muzzle.parent = camera;
    this.muzzle.position = new Vector3(0.32, -0.24, 0.95);
    this.muzzle.rotation.z = Math.PI * 0.25;
    this.muzzleMaterial = new StandardMaterial("WeaponMuzzleFlash", scene);
    this.muzzleMaterial.diffuseColor = new Color3(1, 0.68, 0.18);
    this.muzzleMaterial.emissiveColor = new Color3(1, 0.32, 0.04);
    this.muzzleMaterial.alpha = 0;
    this.muzzleMaterial.disableLighting = true;
    this.muzzle.material = this.muzzleMaterial;
    this.muzzle.isPickable = false;

    this.muzzleLight = new PointLight("weapon-muzzle-light", Vector3.Zero(), scene);
    this.muzzleLight.parent = camera;
    this.muzzleLight.position = new Vector3(0.32, -0.24, 0.8);
    this.muzzleLight.diffuse = new Color3(1, 0.48, 0.12);
    this.muzzleLight.range = 7;
    this.muzzleLight.intensity = 0;
  }

  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.recoil = Math.max(0, this.recoil - dt * 5.5);
    this.muzzleMaterial.alpha = this.flashTimer > 0 ? Math.min(1, this.flashTimer * 26) : 0;
    this.muzzleLight.intensity = this.flashTimer > 0 ? 2.8 : 0;
    if (this.state.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
  }

  shoot() {
    if (!this.canShoot() || this.state.reloading || this.cooldown > 0) return false;
    if (this.state.ammo <= 0) { this.reload(); return false; }

    this.state.ammo -= 1;
    this.cooldown = 0.16;
    this.flashTimer = 0.05;
    this.recoil = Math.min(0.09, this.recoil + 0.065);

    const origin = this.camera.globalPosition.clone();
    const forward = this.camera.getForwardRay().direction.normalize();
    const hit = this.scene.pickWithRay(new Ray(origin, forward, 120), (mesh) => mesh.name === "pedestrian");

    if (hit?.hit && hit.pickedMesh) {
      const target = hit.pickedMesh as Mesh;
      const point = hit.pickedPoint?.clone() ?? target.getAbsolutePosition();
      this.spawnImpact(point, forward);
      if (this.pedestrians.damage(target, 34, point, forward)) this.onHit();
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

  get muzzleFlashActive() { return this.flashTimer > 0; }
  get recoilKick() { return this.recoil; }

  private spawnImpact(position: Vector3, direction: Vector3) {
    const core = MeshBuilder.CreateSphere("bullet-impact-core", { diameter: 0.12, segments: 6 }, this.scene);
    core.position.copyFrom(position);
    core.material = this.impactCoreMaterial;
    core.isPickable = false;
    const sparks: Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const spark = MeshBuilder.CreateBox("bullet-spark", { size: 0.035 }, this.scene);
      spark.position.copyFrom(position);
      spark.material = this.impactMaterial;
      spark.isPickable = false;
      spark.metadata = { velocity: direction.scale(-1.2).add(new Vector3((Math.random() - 0.5) * 1.4, Math.random() * 1.2, (Math.random() - 0.5) * 1.4)) };
      sparks.push(spark);
    }
    const started = performance.now();
    const animate = () => {
      const age = (performance.now() - started) / 1000;
      if (age > 0.16) { core.dispose(); sparks.forEach((spark) => spark.dispose()); return; }
      for (const spark of sparks) {
        const velocity = spark.metadata?.velocity as Vector3 | undefined;
        if (velocity) { spark.position.addInPlace(velocity.scale(0.016)); velocity.y -= 0.064; }
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private finishReload() {
    const loaded = Math.min(this.state.magazineSize - this.state.ammo, this.state.reserveAmmo);
    this.state.ammo += loaded;
    this.state.reserveAmmo -= loaded;
    this.state.reloading = false;
    this.onStateChange({ ...this.state });
  }
}