import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

type MissionStage = "pickup" | "delivery" | "escape" | "complete" | "failed";

export class MissionSystem {
  private marker?: Mesh;
  private ring?: Mesh;
  private stage: MissionStage = "pickup";
  private activeMission = false;
  private elapsed = 0;
  private reward = 0;
  private startPoint = new Vector3(0, 0, 0);
  private pickupPoint = new Vector3(0, 0, 0);
  private deliveryPoint = new Vector3(0, 0, 0);
  private escapePoint = new Vector3(0, 0, 0);
  private readonly markerMaterial: StandardMaterial;
  private readonly ringMaterial: StandardMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly player: Mesh,
    private readonly car: Mesh,
    private readonly isDriving: () => boolean,
    makeMaterial: (scene: Scene, name: string, color: Color3) => StandardMaterial,
    private readonly wanted: { addCrime: (amount?: number) => void; readonly level: number },
    private readonly onUpdate: (title: string, objective: string, distance: number | null, reward: number) => void,
    private readonly onComplete: (reward: number) => void,
  ) {
    this.markerMaterial = makeMaterial(scene, "MissionMarker", new Color3(0.15, 0.8, 1));
    this.ringMaterial = makeMaterial(scene, "MissionRing", new Color3(0.05, 0.45, 0.9));
    this.startMission();
  }

  get active() {
    return this.activeMission;
  }

  get label() {
    if (!this.activeMission) return "";
    if (this.stage === "pickup") return "MISSION — PICKUP";
    if (this.stage === "delivery") return "MISSION — DELIVERY";
    if (this.stage === "escape") return "MISSION — ESCAPE";
    return "MISSION";
  }

  startMission() {
    const origin = this.currentTarget().position.clone();
    this.startPoint = origin.clone();
    this.pickupPoint = this.snapToRoad(origin.add(new Vector3(112, 0, 56)));
    this.deliveryPoint = this.snapToRoad(origin.add(new Vector3(-56, 0, 112)));
    this.escapePoint = this.snapToRoad(origin.add(new Vector3(112, 0, -112)));
    this.stage = "pickup";
    this.reward = 500;
    this.elapsed = 0;
    this.activeMission = true;
    this.createMarker();
    this.pushUpdate();
  }

  update(dt: number) {
    if (!this.activeMission) return;
    this.elapsed += dt;

    const target = this.currentTarget();
    const objective = this.currentObjective();
    const distance = Vector3.Distance(target.position, objective);

    if (distance < 7) {
      if (this.stage === "pickup") {
        this.stage = "delivery";
        this.wanted.addCrime(1);
        this.moveMarker(this.deliveryPoint);
      } else if (this.stage === "delivery") {
        this.stage = "escape";
        this.wanted.addCrime(1);
        this.moveMarker(this.escapePoint);
      } else if (this.stage === "escape") {
        if (this.wanted.level === 0) {
          this.completeMission();
          return;
        }
      }
    }

    if (this.stage === "escape" && this.elapsed > 180) {
      this.failMission();
      return;
    }

    if (this.marker) {
      this.marker.position.y = 2.2 + Math.sin(this.elapsed * 4) * 0.35;
      this.marker.rotation.y += dt * 1.8;
      this.marker.scaling.setAll(0.92 + Math.sin(this.elapsed * 5) * 0.08);
    }
    this.pushUpdate();
  }

  private currentTarget() {
    return this.isDriving() ? this.car : this.player;
  }

  private currentObjective() {
    if (this.stage === "pickup") return this.pickupPoint;
    if (this.stage === "delivery") return this.deliveryPoint;
    return this.escapePoint;
  }

  private snapToRoad(point: Vector3) {
    const road = 56;
    return new Vector3(
      Math.round(point.x / road) * road,
      0.12,
      Math.round(point.z / road) * road,
    );
  }

  private createMarker() {
    this.marker?.dispose(false, true);
    this.ring?.dispose(false, true);

    this.marker = MeshBuilder.CreateCylinder("mission-waypoint", {
      height: 3.6,
      diameterTop: 0.25,
      diameterBottom: 1.2,
      tessellation: 24,
    }, this.scene);
    this.marker.position = this.currentObjective().clone();
    this.marker.position.y = 2.2;
    this.marker.material = this.markerMaterial;

    this.ring = MeshBuilder.CreateTorus("mission-waypoint-ring", {
      diameter: 5,
      thickness: 0.16,
      tessellation: 32,
    }, this.scene);
    this.ring.position = this.currentObjective().clone();
    this.ring.position.y = 0.15;
    this.ring.material = this.ringMaterial;
  }

  private moveMarker(point: Vector3) {
    if (!this.marker || !this.ring) return;
    this.marker.position.x = point.x;
    this.marker.position.z = point.z;
    this.ring.position.x = point.x;
    this.ring.position.z = point.z;
  }

  private completeMission() {
    this.activeMission = false;
    this.stage = "complete";
    this.marker?.dispose(false, true);
    this.ring?.dispose(false, true);
    this.onComplete(this.reward);
    this.onUpdate("MISSION COMPLETE", "Reward collected", null, this.reward);
  }

  private failMission() {
    this.activeMission = false;
    this.stage = "failed";
    this.marker?.dispose(false, true);
    this.ring?.dispose(false, true);
    this.onUpdate("MISSION FAILED", "Time expired", null, this.reward);
  }

  private pushUpdate() {
    const objective = this.currentObjective();
    const distance = Vector3.Distance(this.currentTarget().position, objective);
    let copy = "Reach the pickup point";
    if (this.stage === "delivery") copy = "Deliver the package";
    if (this.stage === "escape") copy = this.wanted.level > 0 ? "Lose the police" : "Reach the escape point";
    this.onUpdate(this.label, copy, distance, this.reward);
  }
}
