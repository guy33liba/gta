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
  private readonly maxForward = 22;
  private readonly maxReverse = 8;
  private readonly acceleration = 18;
  private readonly braking = 28;
  private readonly drag = 7;
  private readonly steering = 1.7;

  constructor(private readonly body: Mesh) {}

  update(input: VehicleInput, dt: number) {
    const targetSpeed = input.throttle
      ? this.maxForward
      : input.reverse
        ? -this.maxReverse
        : 0;

    const rate = input.brake ? this.braking : this.acceleration;

    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + rate * dt);
    if (this.speed > targetSpeed) this.speed = Math.max(targetSpeed, this.speed - rate * dt);

    if (!input.throttle && !input.reverse && !input.brake) {
      const amount = Math.min(Math.abs(this.speed), this.drag * dt);
      this.speed -= Math.sign(this.speed) * amount;
    }

    const steeringInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const steeringStrength = Math.min(1, Math.abs(this.speed) / 5);
    this.body.rotation.y += steeringInput * this.steering * steeringStrength * dt * Math.sign(this.speed || 1);

    const forward = new Vector3(
      Math.sin(this.body.rotation.y),
      0,
      Math.cos(this.body.rotation.y),
    );

    this.body.position.addInPlace(forward.scale(this.speed * dt));
    this.body.position.y = 0.55;
  }

  getSpeed() {
    return this.speed;
  }

  stop() {
    this.speed = 0;
  }
}
