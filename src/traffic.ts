import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

type Axis = "x" | "z";
type Direction = 1 | -1;
type TrafficCar = {
  mesh: Mesh;
  axis: Axis;
  direction: Direction;
  speed: number;
  targetSpeed: number;
  seed: number;
  lastIntersection: string;
  laneOffset: number;
  laneTarget: number;
  laneChangeTimer: number;
  stuckTimer: number;
  panicTimer: number;
};

const ROAD_SPACING = 56;
const LANE_OFFSET = 3.2;
const MAX_CARS = 18;
const SPAWN_RADIUS = 150;
const DESPAWN_RADIUS = 205;

export class TrafficSystem {
  private readonly cars: TrafficCar[] = [];
  private readonly lights = new Map<string, Mesh>();
  private readonly carMaterial: StandardMaterial;
  private readonly glassMaterial: StandardMaterial;
  private elapsed = 0;
  private lastFocusX = Number.NaN;
  private lastFocusZ = Number.NaN;

  constructor(
    private readonly scene: Scene,
    private readonly focus: Mesh,
    private readonly playerCar: Mesh,
    private readonly isPlayerDriving: () => boolean,
    makeMaterial: (scene: Scene, name: string, color: Color3) => StandardMaterial,
  ) {
    this.carMaterial = makeMaterial(scene, "TrafficPaint", new Color3(0.12, 0.18, 0.22));
    this.glassMaterial = makeMaterial(scene, "TrafficGlass", new Color3(0.025, 0.05, 0.065));
  }

  update(dt: number) {
    this.elapsed += dt;
    this.ensureInfrastructure();
    this.ensurePopulation();

    for (const car of this.cars) this.updateCar(car, dt);
    this.despawnFarCars();
  }

  private ensurePopulation() {
    if (this.cars.length >= MAX_CARS) return;

    const focusX = Math.round(this.focus.position.x / ROAD_SPACING) * ROAD_SPACING;
    const focusZ = Math.round(this.focus.position.z / ROAD_SPACING) * ROAD_SPACING;
    let attempts = 0;

    while (this.cars.length < MAX_CARS && attempts < MAX_CARS * 4) {
      attempts++;
      const axis: Axis = this.cars.length % 2 === 0 ? "x" : "z";
      const roadIndex = ((this.cars.length * 5) % 7) - 3;
      const road = (axis === "x" ? focusZ : focusX) + roadIndex * ROAD_SPACING;
      const along = this.cars.length % 3 === 0 ? -SPAWN_RADIUS : SPAWN_RADIUS * 0.72;
      const direction: Direction = this.cars.length % 4 < 2 ? 1 : -1;
      const position = axis === "x"
        ? new Vector3(along + focusX, 0.55, road - direction * LANE_OFFSET)
        : new Vector3(road + direction * LANE_OFFSET, 0.55, along + focusZ);

      if (Vector3.Distance(position, this.focus.position) > SPAWN_RADIUS) continue;
      if (this.cars.some((other) => Vector3.Distance(other.mesh.position, position) < 12)) continue;
      this.addCar(position, axis, direction, this.cars.length * 17 + 3);
    }
  }

  private addCar(position: Vector3, axis: Axis, direction: Direction, seed: number) {
    const body = MeshBuilder.CreateBox("traffic-car", { width: 1.9, height: 0.5, depth: 3.7 }, this.scene);
    body.position.copyFrom(position);
    body.rotation.y = this.rotationFor(axis, direction);
    body.material = this.carMaterial;

    const roof = MeshBuilder.CreateBox("traffic-roof", { width: 1.55, height: 0.42, depth: 1.7 }, this.scene);
    roof.parent = body;
    roof.position = new Vector3(0, 0.43, -0.1);
    roof.material = this.glassMaterial;

    this.cars.push({
      mesh: body,
      axis,
      direction,
      speed: 5 + (seed % 5),
      targetSpeed: 7 + (seed % 7),
      seed,
      lastIntersection: "",
      laneOffset: -direction * LANE_OFFSET,
      laneTarget: -direction * LANE_OFFSET,
      laneChangeTimer: 2 + (seed % 5),
      stuckTimer: 0,
      panicTimer: 0,
    });
  }

  private updateCar(car: TrafficCar, dt: number) {
    const position = car.mesh.position;
    car.laneChangeTimer = Math.max(0, car.laneChangeTimer - dt);
    const signalStop = this.shouldStopForSignal(car);
    const traffic = this.getTrafficObstacle(car);
    const obstacleStop = traffic.blocked;

    if (obstacleStop) car.stuckTimer += dt;
    else car.stuckTimer = Math.max(0, car.stuckTimer - dt * 1.5);

    if (car.stuckTimer > 1.4 && car.laneChangeTimer === 0) {
      const alternate = -car.laneTarget;
      if (this.canUseLane(car, alternate)) {
        car.laneTarget = alternate;
        car.laneChangeTimer = 3.5;
      }
    }

    car.targetSpeed = signalStop ? 0 : obstacleStop && car.laneTarget === car.laneOffset ? Math.min(2.2, 7 + (car.seed % 7)) : 7 + (car.seed % 7);
    const acceleration = car.targetSpeed > car.speed ? 5 : 10;
    car.speed += Math.sign(car.targetSpeed - car.speed) * Math.min(Math.abs(car.targetSpeed - car.speed), acceleration * dt);

    const laneStep = Math.min(Math.abs(car.laneTarget - car.laneOffset), dt * 2.8);
    car.laneOffset += Math.sign(car.laneTarget - car.laneOffset) * laneStep;
    const laneCenter = car.axis === "x"
      ? this.nearestRoadZ(position.z) + car.laneOffset
      : this.nearestRoadX(position.x) + car.laneOffset;
    if (car.axis === "x") position.z = laneCenter;
    else position.x = laneCenter;

    const step = car.speed * dt * car.direction;
    if (car.axis === "x") position.x += step;
    else position.z += step;

    position.y = 0.55;
    car.mesh.rotation.y = this.rotationFor(car.axis, car.direction);
    this.handleIntersection(car);
  }

  private getTrafficObstacle(car: TrafficCar) {
    const forward = this.forwardVector(car);
    const lookAhead = 11;
    let blocked = false;
    let nearest = lookAhead;
    for (const other of this.cars) {
      if (other === car) continue;
      if (other.axis !== car.axis || other.direction !== car.direction) continue;
      const delta = other.mesh.position.subtract(car.mesh.position);
      const forwardDistance = Vector3.Dot(delta, forward);
      const lateralDistance = Math.abs(Vector3.Dot(delta, new Vector3(-forward.z, 0, forward.x)));
      if (forwardDistance > 0 && forwardDistance < nearest && lateralDistance < 2.1) {
        blocked = true;
        nearest = forwardDistance;
      }
    }
    if (this.isPlayerDriving()) {
      const delta = this.playerCar.position.subtract(car.mesh.position);
      const forwardDistance = Vector3.Dot(delta, forward);
      const lateralDistance = Math.abs(Vector3.Dot(delta, new Vector3(-forward.z, 0, forward.x)));
      if (forwardDistance > 0 && forwardDistance < nearest && lateralDistance < 2.3) blocked = true;
    }
    return { blocked, nearest };
  }

  private canUseLane(car: TrafficCar, targetOffset: number) {
    const road = car.axis === "x" ? this.nearestRoadZ(car.mesh.position.z) : this.nearestRoadX(car.mesh.position.x);
    const target = car.axis === "x" ? new Vector3(car.mesh.position.x, 0.55, road + targetOffset) : new Vector3(road + targetOffset, 0.55, car.mesh.position.z);
    return !this.cars.some((other) => {
      if (other === car || other.axis !== car.axis || other.direction !== car.direction) return false;
      return Vector3.DistanceSquared(other.mesh.position, target) < 36;
    });
  }

  private nearestRoadX(value: number) {
    return Math.round(value / ROAD_SPACING) * ROAD_SPACING;
  }

  private nearestRoadZ(value: number) {
    return Math.round(value / ROAD_SPACING) * ROAD_SPACING;
  }

  private shouldStopForTraffic(car: TrafficCar) {
    return this.getTrafficObstacle(car).blocked;
  }

  private shouldStopForSignal(car: TrafficCar) {
    const roadX = Math.round(car.mesh.position.x / ROAD_SPACING) * ROAD_SPACING;
    const roadZ = Math.round(car.mesh.position.z / ROAD_SPACING) * ROAD_SPACING;
    const distance = car.axis === "x"
      ? Math.abs(car.mesh.position.x - roadX)
      : Math.abs(car.mesh.position.z - roadZ);

    if (distance > 13 || distance < 4) return false;
    const phase = this.elapsed % 20;
    const horizontalGreen = phase < 8;
    const verticalGreen = phase >= 10 && phase < 18;
    return car.axis === "x" ? !horizontalGreen : !verticalGreen;
  }

  private handleIntersection(car: TrafficCar) {
    const roadX = Math.round(car.mesh.position.x / ROAD_SPACING) * ROAD_SPACING;
    const roadZ = Math.round(car.mesh.position.z / ROAD_SPACING) * ROAD_SPACING;
    const nearX = Math.abs(car.mesh.position.x - roadX) < 2.2;
    const nearZ = Math.abs(car.mesh.position.z - roadZ) < 2.2;
    if (!nearX || !nearZ) return;

    const key = roadX + ":" + roadZ;
    if (car.lastIntersection === key) return;
    car.lastIntersection = key;

    const choice = (car.seed + Math.floor(this.elapsed / 20)) % 5;
    if (choice === 0) {
      car.axis = car.axis === "x" ? "z" : "x";
      car.direction = car.direction;
    } else if (choice === 1) {
      car.axis = car.axis === "x" ? "z" : "x";
      car.direction = -car.direction as Direction;
    }

    if (car.axis === "x") car.mesh.position.z = roadZ - car.direction * LANE_OFFSET;
    else car.mesh.position.x = roadX + car.direction * LANE_OFFSET;
  }

  private ensureInfrastructure() {
    const centerX = Math.round(this.focus.position.x / ROAD_SPACING);
    const centerZ = Math.round(this.focus.position.z / ROAD_SPACING);
    if (centerX === this.lastFocusX && centerZ === this.lastFocusZ) return;
    this.lastFocusX = centerX;
    this.lastFocusZ = centerZ;

    const required = new Set<string>();
    for (let x = centerX - 2; x <= centerX + 2; x++) {
      for (let z = centerZ - 2; z <= centerZ + 2; z++) {
        const key = x + ":" + z;
        required.add(key);
        if (!this.lights.has(key)) this.createLight(x * ROAD_SPACING, z * ROAD_SPACING, key);
      }
    }

    for (const [key, mesh] of this.lights) {
      if (!required.has(key)) {
        mesh.dispose();
        this.lights.delete(key);
      }
    }
  }

  private createLight(x: number, z: number, key: string) {
    const light = MeshBuilder.CreateBox("traffic-light-" + key, { width: 0.25, height: 3.4, depth: 0.25 }, this.scene);
    light.position.set(x + 8, 1.7, z + 8);
    light.material = this.carMaterial;
    this.lights.set(key, light);
  }

  private despawnFarCars() {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (Vector3.Distance(this.cars[i].mesh.position, this.focus.position) > DESPAWN_RADIUS) {
        this.cars[i].mesh.dispose();
        this.cars.splice(i, 1);
      }
    }
  }

  private forwardVector(car: TrafficCar) {
    return car.axis === "x"
      ? new Vector3(car.direction, 0, 0)
      : new Vector3(0, 0, car.direction);
  }

  private rotationFor(axis: Axis, direction: Direction) {
    if (axis === "z") return direction > 0 ? 0 : Math.PI;
    return direction > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}
