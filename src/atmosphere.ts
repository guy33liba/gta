import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";

export class AtmosphereSystem {
  private timeOfDay = 9.5;
  private readonly dayLengthSeconds = 300;
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphericLight;

  constructor(scene: Scene, sun: DirectionalLight, hemi: HemisphericLight) {
    this.sun = sun;
    this.hemi = hemi;
    scene.fogMode = Scene.FOGMODE_EXP;
    scene.fogDensity = 0.0025;
    scene.fogStart = 90;
  }

  get hour() {
    return this.timeOfDay;
  }

  update(scene: Scene, dt: number) {
    this.timeOfDay = (this.timeOfDay + (24 / this.dayLengthSeconds) * dt) % 24;

    const daylight = this.daylightFactor(this.timeOfDay);
    const warm = this.sunsetFactor(this.timeOfDay);

    const sky = Color3.Lerp(
      new Color3(0.008, 0.012, 0.025),
      new Color3(0.20, 0.38, 0.62),
      daylight,
    );
    const warmSky = Color3.Lerp(sky, new Color3(0.55, 0.24, 0.10), warm);
    scene.clearColor = new Color4(warmSky.r, warmSky.g, warmSky.b, 1);

    const fog = Color3.Lerp(
      new Color3(0.012, 0.018, 0.035),
      new Color3(0.16, 0.24, 0.34),
      daylight,
    );
    const fogWarm = Color3.Lerp(fog, new Color3(0.38, 0.18, 0.09), warm);
    scene.fogColor = fogWarm;
    scene.fogDensity = 0.0018 + (1 - daylight) * 0.0032;

    const angle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    this.sun.direction = new Vector3(
      Math.cos(angle),
      -Math.max(0.08, Math.sin(angle)),
      Math.sin(angle) * 0.65,
    ).normalize();
    this.sun.intensity = 0.18 + daylight * 1.55;
    this.hemi.intensity = 0.18 + daylight * 0.48;

    const night = 1 - daylight;
    for (const material of scene.materials) {
      if ("emissiveColor" in material && material.name.startsWith("LampGlow")) {
        const emissive = material as { emissiveColor: Color3 };
        emissive.emissiveColor = new Color3(0.95 * night, 0.52 * night, 0.12 * night);
      }
    }
  }

  private daylightFactor(hour: number) {
    const sunrise = 6;
    const sunset = 18.5;
    if (hour <= sunrise || hour >= sunset) return 0;
    const x = (hour - sunrise) / (sunset - sunrise);
    return Math.sin(x * Math.PI);
  }

  private sunsetFactor(hour: number) {
    const sunriseWindow = Math.max(0, 1 - Math.abs(hour - 6) / 1.5);
    const sunsetWindow = Math.max(0, 1 - Math.abs(hour - 18.5) / 1.5);
    return Math.max(sunriseWindow, sunsetWindow);
  }
}
