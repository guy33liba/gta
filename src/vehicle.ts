import { Mesh, Vector3 } from "@babylonjs/core";

export type VehicleInput = {
  throttle: boolean;
  reverse: boolean;
  left: boolean;
  right: boolean;
  brake: boolean;
};

export class VehicleController {
  private speed = 0;
  private steeringVelocity = 0;
  private readonly maxForward = 26;
  private readonly maxReverse = 9;
  private readonly acceleration = 22;
  private readonly braking = 34;
  private readonly drag = 4.5;
  private readonly rollingResistance = 1.4;
  private readonly maxSteering = 0.72;
  private readonly grip = 7.5;

  constructor(private readonly body: Mesh) {}

  update(input: VehicleInput, dt: number) {
    const target = input.throttle ? this.maxForward : input.reverse ? -this.maxReverse : 0;
    const rate = input.brake ? this.braking : this.acceleration;

    if (this.speed < target) this.speed = Math.min(target, this.speed + rate * dt);
    if (this.speed > target) this.speed = Math.max(target, this.speed - rate * dt);

    if (!input.throttle && !input.reverse) {
      const resistance = Math.min(Math.abs(this.speed), this.drag * dt + this.rollingResistance * Math.abs(this.speed) * dt);
      this.speed -= Math.sign(this.speed) * resistance;
    }

    const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 4);
    const steeringTarget = steerInput * this.maxSteering * speedFactor;
    this.steeringVelocity += (steeringTarget - this.steeringVelocity) * Math.min(1, dt * this.grip);

    this.body.rotation.y += this.steeringVelocity * dt * Math.sign(this.speed || 1) * 2.4;

    const forward = new Vector3(Math.sin(this.body.rotation.y), 0, Math.cos(this.body.rotation.y));
    this.body.position.addInPlace(forward.scale(this.speed * dt));
    this.body.position.y = 0.55;

    const rollTarget = -this.steeringVelocity * Math.min(1, Math.abs(this.speed) / 12) * 0.12;
    this.body.rotation.z += (rollTarget - this.body.rotation.z) * Math.min(1, dt * 8);
  }

  getSpeed() {
    return this.speed;
  }

  getSteering() {
    return this.steeringVelocity;
  }

  stop() {
    this.speed = 0;
    this.steeringVelocity = 0;
    this.body.rotation.z = 0;
  }
}
