import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HavokPlugin,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Scene,
  StandardMaterial,
  Vector3,
  WebGPUEngine,
  Camera,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/loaders";
import { createWorldStream } from "./world";
import { VehicleController } from "./vehicle";
import { TrafficSystem } from "./traffic";
import { PedestrianSystem } from "./pedestrians";
import { CombatSystem } from "./combat";
import { WantedSystem } from "./wanted";
import { MissionSystem } from "./missions";
import { AtmosphereSystem } from "./atmosphere";
import { AudioSystem } from "./audio";
import "./styles.css";

type InputState = Record<string, boolean>;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) throw new Error("Game canvas not found");

const progress = document.querySelector<HTMLElement>("#loading-progress");
const loadingScreen = document.querySelector<HTMLElement>("#loading-screen");
const missionState = document.querySelector<HTMLElement>("#mission-state");
const ammoValue = document.querySelector<HTMLElement>("#ammo-value");
const hitMarker = document.querySelector<HTMLElement>("#hit-marker");
const wantedValue = document.querySelector<HTMLElement>("#wanted-value");
const healthValue = document.querySelector<HTMLElement>("#health-value");
const damageFlash = document.querySelector<HTMLElement>("#damage-flash");

const input: InputState = {};
let player: Mesh;
let car: Mesh;
let driving = false;
let vehicleController: VehicleController;
let playerHealth = 100;

const setProgress = (value: number) => {
  if (progress) progress.style.width = value + "%";
};

const material = (scene: Scene, name: string, color: Color3) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  return m;
};

async function createEngine(): Promise<Engine> {
  try {
    if (await WebGPUEngine.IsSupportedAsync) {
      const engine = new WebGPUEngine(canvas, {
        adaptToDeviceRatio: true,
        antialias: true,
      });
      await engine.initAsync();
      return engine;
    }
  } catch {
    // WebGPU can fail at runtime; WebGL2 is the compatibility path.
  }
  return new Engine(canvas, true, { adaptToDeviceRatio: true, antialias: true });
}

async function enablePhysics(scene: Scene) {
  try {
    const havok = await HavokPhysics();
    const plugin = new HavokPlugin(true, havok);
    scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
    return true;
  } catch (error) {
    console.warn("Havok physics unavailable; continuing with kinematic fallback.", error);
    return false;
  }
}

function createCity(scene: Scene) {
  const groundMat = material(scene, "Ground", new Color3(0.045, 0.055, 0.065));
  const roadMat = material(scene, "Road", new Color3(0.018, 0.022, 0.028));
  const buildingMats = [
    material(scene, "Concrete", new Color3(0.22, 0.24, 0.27)),
    material(scene, "WarmConcrete", new Color3(0.28, 0.24, 0.20)),
    material(scene, "GlassDark", new Color3(0.08, 0.13, 0.17)),
  ];

  const ground = MeshBuilder.CreateGround("city-ground", { width: 180, height: 180 }, scene);
  ground.material = groundMat;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, restitution: 0.05, friction: 0.9 }, scene);

  const roadWidth = 12;
  for (let i = -3; i <= 3; i++) {
    const vertical = MeshBuilder.CreateBox("road-v-" + i, { width: roadWidth, height: 0.04, depth: 180 }, scene);
    vertical.position.x = i * 28;
    vertical.position.y = 0.02;
    vertical.material = roadMat;

    const horizontal = MeshBuilder.CreateBox("road-h-" + i, { width: 180, height: 0.04, depth: roadWidth }, scene);
    horizontal.position.z = i * 28;
    horizontal.position.y = 0.025;
    horizontal.material = roadMat;
  }

  let index = 0;
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if (x === 0 && z === 0) continue;
      const bx = x * 28 + (x % 2 === 0 ? 5 : -5);
      const bz = z * 28 + (z % 2 === 0 ? -4 : 4);
      const width = 13 + ((index * 7) % 7);
      const depth = 13 + ((index * 5) % 8);
      const height = 7 + ((index * 13) % 30);
      const building = MeshBuilder.CreateBox("building-" + index, { width, depth, height }, scene);
      building.position.set(bx, height / 2, bz);
      building.material = buildingMats[index % buildingMats.length];
      new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0, restitution: 0, friction: 0.8 }, scene);
      index++;
    }
  }

  for (let i = -84; i <= 84; i += 14) {
    const lamp = MeshBuilder.CreateCylinder("lamp-" + i, { height: 5, diameter: 0.12 }, scene);
    lamp.position.set(6, 2.5, i);
    lamp.material = groundMat;

    const head = MeshBuilder.CreateSphere("lamp-head-" + i, { diameter: 0.35, segments: 8 }, scene);
    head.position.set(6, 5, i);
    head.material = material(scene, "LampGlow" + i, new Color3(1, 0.68, 0.25));
  }
}

function createPlayer(scene: Scene) {
  const body = MeshBuilder.CreateCapsule("player", { height: 2.1, radius: 0.42 }, scene);
  body.position.set(0, 1.05, 0);
  body.material = material(scene, "Player", new Color3(0.12, 0.42, 0.8));
  return body;
}

function createCar(scene: Scene) {
  const body = MeshBuilder.CreateBox("car", { width: 2.1, height: 0.55, depth: 4.1 }, scene);
  body.position.set(8, 0.55, 8);
  body.material = material(scene, "CarPaint", new Color3(0.65, 0.07, 0.05));

  const wheelMat = material(scene, "Tire", new Color3(0.015, 0.015, 0.018));
  const wheelPositions = [[-1.05, 0.35, 1.25], [1.05, 0.35, 1.25], [-1.05, 0.35, -1.25], [1.05, 0.35, -1.25]];
  for (let i = 0; i < wheelPositions.length; i++) {
    const wheel = MeshBuilder.CreateCylinder("car-wheel-" + i, { diameter: 0.62, height: 0.22, tessellation: 16 }, scene);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(8 + wheelPositions[i][0], 0.35, 8 + wheelPositions[i][2]);
    wheel.material = wheelMat;
    wheel.parent = body;
  }

  const roof = MeshBuilder.CreateBox("car-roof", { width: 1.75, height: 0.5, depth: 1.9 }, scene);
  roof.position.set(8, 0.98, 7.8);
  roof.material = material(scene, "CarGlass", new Color3(0.03, 0.08, 0.11));
  roof.parent = body;

  return body;
}

function createCamera(scene: Scene, target: Mesh) {
  const camera = new ArcRotateCamera("third-person-camera", Math.PI, 1.05, 9, target.position, scene);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 16;
  camera.wheelDeltaPercentage = 0.02;
  camera.attachControl(canvas, true);
  camera.panningSensibility = 0;
  return camera;
}

function toggleVehicle() {
  if (Vector3.Distance(player.position, car.position) < 5) {
    driving = !driving;
    missionState!.textContent = driving ? "DRIVING" : "FREE ROAM";
    player.setEnabled(!driving);
  }
}

function bindTouchButton(id: string, key: string) {
  const button = document.querySelector<HTMLButtonElement>("#" + id);
  if (!button) return;

  const press = (event: Event) => {
    event.preventDefault();
    input[key] = true;
  };
  const release = (event: Event) => {
    event.preventDefault();
    input[key] = false;
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}

function setupInput() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    input[key] = true;
    if (key === "e") toggleVehicle();
    if (key === "r") reload();
    if (key === "m" && !missions.active) missions.startMission();
  });

  window.addEventListener("keyup", (event) => {
    input[event.key.toLowerCase()] = false;
  });

  bindTouchButton("touch-up", "w");
  bindTouchButton("touch-left", "a");
  bindTouchButton("touch-down", "s");
  bindTouchButton("touch-right", "d");
  bindTouchButton("touch-sprint", "shift");

  const enterButton = document.querySelector<HTMLButtonElement>("#touch-enter");
  enterButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    toggleVehicle();
  });
}

async function boot() {
  setProgress(8);
  const engine = await createEngine();
  setProgress(28);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.025, 0.035, 0.05, 1);

  const hemi = new HemisphericLight("sky-light", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, -0.3), scene);
  sun.position = new Vector3(40, 70, 30);
  sun.intensity = 1.7;

  setProgress(42);
  const physicsEnabled = await enablePhysics(scene);
  setProgress(55);

  player = createPlayer(scene);
  car = createCar(scene);
  const worldStream = createWorldStream(scene, player, material);
  worldStream.update();
  vehicleController = new VehicleController(car);
  const traffic = new TrafficSystem(scene, player, car, () => driving, material);
  const pedestrians = new PedestrianSystem(scene, player, car, () => driving, material);
  const camera = createCamera(scene, player);
  const atmosphere = new AtmosphereSystem(scene, sun, hemi);
  const audio = new AudioSystem();
  const unlockAudio = () => audio.unlock();
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
  const wanted = new WantedSystem(scene, player, car, () => driving, material, (level) => {
    if (wantedValue) wantedValue.textContent = level > 0 ? "★".repeat(level) : "CLEAR";
  }, (amount) => {
    playerHealth = Math.max(0, playerHealth - amount);
    if (healthValue) healthValue.textContent = String(playerHealth);
    if (damageFlash) {
      damageFlash.classList.remove("is-damaged");
      void damageFlash.offsetWidth;
      damageFlash.classList.add("is-damaged");
    }
    if (playerHealth === 0) {
      playerHealth = 100;
      if (healthValue) healthValue.textContent = "100";
      player.position.set(0, 1.05, 0);
      car.position.set(8, 0.55, 8);
      driving = false;
      player.setEnabled(true);
    }
  });
  const combat = new CombatSystem(
    scene,
    camera,
    pedestrians,
    () => !driving,
    (state) => {
      if (ammoValue) ammoValue.textContent = state.reloading ? "RELOADING" : state.ammo + " / " + state.reserveAmmo;
    },
    () => {
      if (hitMarker) {
        hitMarker.classList.remove("is-hit");
        void hitMarker.offsetWidth;
        hitMarker.classList.add("is-hit");
      }
    },
  );
  const missionTitle = document.querySelector<HTMLElement>("#mission-title");
  const missionObjective = document.querySelector<HTMLElement>("#mission-objective");
  const missionDistance = document.querySelector<HTMLElement>("#mission-distance");
  const cashValue = document.querySelector<HTMLElement>("#cash-value");
  let cash = Number(cashValue?.textContent?.replace(/[^0-9]/g, "") || "0");

  const missions = new MissionSystem(
    scene,
    player,
    car,
    () => driving,
    material,
    wanted,
    (title, objective, distance, reward) => {
      if (missionTitle) missionTitle.textContent = title;
      if (missionObjective) missionObjective.textContent = objective;
      if (missionDistance) missionDistance.textContent = distance === null ? "" : Math.round(distance) + " m";
      if (cashValue) cashValue.textContent = "$" + cash.toLocaleString();
    },
    (reward) => {
      cash += reward;
      if (cashValue) cashValue.textContent = "$" + cash.toLocaleString();
    },
  );

  const fire = () => { if (combat.shoot()) audio.gunshot(); };
  const reload = () => combat.reload();
  document.querySelector<HTMLButtonElement>("#touch-fire")?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    fire();
  });
  window.addEventListener("mousedown", (event) => {
    if (event.button === 0) fire();
  });

  setProgress(86);
  setupInput();

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    const active = driving ? car : player;
    const forward = input.w ? 1 : input.s ? -1 : 0;
    const strafe = input.d ? 1 : input.a ? -1 : 0;

    if (driving) {
      vehicleController.update({
        throttle: forward > 0,
        reverse: forward < 0,
        left: strafe < 0,
        right: strafe > 0,
        brake: Boolean(input[" "]),
      }, dt);
    } else if (forward || strafe) {
      const speed = input.shift ? 7 : 4.5;
      const direction = new Vector3(strafe, 0, forward).normalize();
      active.position.addInPlace(direction.scale(speed * dt));
      active.rotation.y = Math.atan2(direction.x, direction.z);
    }

    if (!physicsEnabled) {
      active.position.y = driving ? 0.55 : 1.05;
    }

    worldStream.update();
    traffic.update(dt);
    pedestrians.update(dt);
    combat.update(dt);\n    wanted.update(dt);
    missions.update(dt);\n    atmosphere.update(scene, dt);

    if (missionState) {
      missionState.textContent = missions.active ? missions.label : wanted.level > 0 ? "WANTED" : driving ? "DRIVING" : "FREE ROAM";
    }

    const target = driving ? car : player;
    const speedRatio = driving ? Math.min(1, Math.abs(vehicleController.getSpeed()) / 26) : 0;
    camera.alpha = Math.PI + target.rotation.y;
    camera.beta = (driving ? 1.12 - speedRatio * 0.035 : 1.08) - combat.recoilKick;
    camera.radius = driving ? 7.5 + speedRatio * 0.9 : 9;
    if (driving) camera.target.y = target.position.y + speedRatio * 0.12;
    camera.target = Vector3.Lerp(camera.target, target.position, Math.min(1, dt * 7));

    scene.render();
  });

  window.addEventListener("resize", () => engine.resize());
  setProgress(100);
  window.setTimeout(() => loadingScreen?.classList.add("is-hidden"), 350);
}

boot().catch((error) => {
  console.error(error);
  if (loadingScreen) {
    loadingScreen.innerHTML = "<div id='loading-title'>LOAD ERROR</div><div id='loading-copy'>OPEN THE CONSOLE FOR DETAILS</div>";
  }
});
