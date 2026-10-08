import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  WebGPUEngine,
  DefaultRenderingPipeline,
  ShadowGenerator,
} from "@babylonjs/core";
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

type InputState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
};


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

const input: InputState = { forward: false, backward: false, left: false, right: false, sprint: false };
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

function createPlayer(scene: Scene) {
  const root = MeshBuilder.CreateBox("player-root", { width: 0.7, height: 1.8, depth: 0.55 }, scene);
  root.position.set(0, 1.15, 0);
  root.isVisible = false;

  const skin = material(scene, "PlayerSkin", new Color3(0.72, 0.46, 0.30));
  const shirt = material(scene, "PlayerShirt", new Color3(0.035, 0.13, 0.28));
  const pants = material(scene, "PlayerPants", new Color3(0.035, 0.045, 0.065));
  const shoes = material(scene, "PlayerShoes", new Color3(0.015, 0.018, 0.022));
  const hair = material(scene, "PlayerHair", new Color3(0.018, 0.012, 0.01));

  const torso = MeshBuilder.CreateBox("player-torso", { width: 0.78, height: 0.92, depth: 0.46 }, scene);
  torso.parent = root;
  torso.position.y = 0.08;
  torso.material = shirt;

  const head = MeshBuilder.CreateSphere("player-head", { diameter: 0.52, segments: 16 }, scene);
  head.parent = root;
  head.position.y = 0.78;
  head.material = skin;

  const hairTop = MeshBuilder.CreateSphere("player-hair", { diameter: 0.55, segments: 12 }, scene);
  hairTop.parent = root;
  hairTop.position.set(0, 0.98, 0);
  hairTop.scaling.y = 0.42;
  hairTop.material = hair;

  for (const side of [-1, 1]) {
    const arm = MeshBuilder.CreateCapsule("player-arm-" + side, { height: 0.78, radius: 0.12 }, scene);
    arm.parent = root;
    arm.position.set(side * 0.51, 0.02, 0);
    arm.rotation.z = side * 0.08;
    arm.material = shirt;

    const leg = MeshBuilder.CreateCapsule("player-leg-" + side, { height: 0.9, radius: 0.13 }, scene);
    leg.parent = root;
    leg.position.set(side * 0.19, -0.58, 0);
    leg.material = pants;

    const shoe = MeshBuilder.CreateBox("player-shoe-" + side, { width: 0.25, height: 0.12, depth: 0.42 }, scene);
    shoe.parent = root;
    shoe.position.set(side * 0.19, -0.99, 0.08);
    shoe.material = shoes;
  }

  return root;
}

function createCar(scene: Scene) {
  const body = MeshBuilder.CreateBox("car", { width: 2.15, height: 0.62, depth: 4.2 }, scene);
  body.position.set(8, 0.55, 8);
  body.material = material(scene, "CarPaint", new Color3(0.55, 0.045, 0.025));

  const dark = material(scene, "CarTrim", new Color3(0.012, 0.016, 0.022));
  const glass = material(scene, "CarGlass", new Color3(0.025, 0.075, 0.10));
  glass.emissiveColor = new Color3(0.008, 0.025, 0.035);
  const chrome = material(scene, "CarChrome", new Color3(0.32, 0.34, 0.36));
  const headlight = material(scene, "CarHeadlight", new Color3(0.95, 0.92, 0.72));
  headlight.emissiveColor = new Color3(0.55, 0.48, 0.22);
  const taillight = material(scene, "CarTaillight", new Color3(0.45, 0.015, 0.01));
  taillight.emissiveColor = new Color3(0.25, 0.008, 0.004);

  const roof = MeshBuilder.CreateBox("car-roof", { width: 1.72, height: 0.48, depth: 1.92 }, scene);
  roof.parent = body;
  roof.position.set(0, 0.55, -0.12);
  roof.material = glass;

  const hood = MeshBuilder.CreateBox("car-hood", { width: 1.82, height: 0.14, depth: 0.9 }, scene);
  hood.parent = body;
  hood.position.set(0, 0.32, 1.48);
  hood.material = body.material;

  const trunk = MeshBuilder.CreateBox("car-trunk", { width: 1.82, height: 0.14, depth: 0.72 }, scene);
  trunk.parent = body;
  trunk.position.set(0, 0.34, -1.52);
  trunk.material = body.material;

  const frontBumper = MeshBuilder.CreateBox("car-front-bumper", { width: 2.0, height: 0.16, depth: 0.12 }, scene);
  frontBumper.parent = body;
  frontBumper.position.set(0, -0.18, 2.06);
  frontBumper.material = chrome;

  const rearBumper = MeshBuilder.CreateBox("car-rear-bumper", { width: 2.0, height: 0.16, depth: 0.12 }, scene);
  rearBumper.parent = body;
  rearBumper.position.set(0, -0.18, -2.06);
  rearBumper.material = chrome;

  for (const side of [-1, 1]) {
    const sideTrim = MeshBuilder.CreateBox("car-side-trim-" + side, { width: 0.08, height: 0.11, depth: 2.9 }, scene);
    sideTrim.parent = body;
    sideTrim.position.set(side * 1.08, -0.02, 0);
    sideTrim.material = dark;
  }

  const lightPositions = [
    { x: -0.62, z: 2.08, material: headlight },
    { x: 0.62, z: 2.08, material: headlight },
    { x: -0.62, z: -2.08, material: taillight },
    { x: 0.62, z: -2.08, material: taillight },
  ];
  for (let i = 0; i < lightPositions.length; i++) {
    const light = MeshBuilder.CreateBox("car-light-" + i, { width: 0.34, height: 0.13, depth: 0.08 }, scene);
    light.parent = body;
    light.position.set(lightPositions[i].x, 0.05, lightPositions[i].z);
    light.material = lightPositions[i].material;
  }

  const wheelMat = material(scene, "Tire", new Color3(0.008, 0.009, 0.012));
  const rimMat = material(scene, "WheelRim", new Color3(0.18, 0.19, 0.20));
  const wheelPositions = [[-1.05, 0.35, 1.25], [1.05, 0.35, 1.25], [-1.05, 0.35, -1.25], [1.05, 0.35, -1.25]];
  for (let i = 0; i < wheelPositions.length; i++) {
    const wheel = MeshBuilder.CreateCylinder("car-wheel-" + i, { diameter: 0.66, height: 0.24, tessellation: 20 }, scene);
    wheel.parent = body;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wheelPositions[i][0], -0.03, wheelPositions[i][2]);
    wheel.material = wheelMat;

    const rim = MeshBuilder.CreateCylinder("car-rim-" + i, { diameter: 0.34, height: 0.255, tessellation: 16 }, scene);
    rim.parent = wheel;
    rim.rotation.z = Math.PI / 2;
    rim.position.set(0, 0, 0);
    rim.material = rimMat;
  }

  return body;
}

function createCamera(scene: Scene, target: Mesh) {
  const camera = new ArcRotateCamera("third-person-camera", Math.PI, 1.12, 10.5, target.position.clone(), scene);
  camera.lowerRadiusLimit = 5.5;
  camera.upperRadiusLimit = 18;
  camera.lowerBetaLimit = 0.72;
  camera.upperBetaLimit = 1.38;
  camera.wheelDeltaPercentage = 0.015;
  camera.panningSensibility = 0;
  camera.inertia = 0.72;
  camera.angularSensibilityX = 420;
  camera.angularSensibilityY = 420;
  camera.attachControl(canvas, true);
  return camera;
}

function toggleVehicle() {
  if (Vector3.Distance(player.position, car.position) < 5) {
    driving = !driving;
    missionState!.textContent = driving ? "DRIVING" : "FREE ROAM";
    player.setEnabled(!driving);
  }
}

function bindTouchButton(id: string, action: keyof InputState) {
  const button = document.querySelector<HTMLButtonElement>("#" + id);
  if (!button) return;

  const press = (event: PointerEvent) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    input[action] = true;
  };
  const release = (event: PointerEvent) => {
    event.preventDefault();
    input[action] = false;
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => { input[action] = false; });
}

function setupInput() {
  const movementKeys: Record<string, keyof InputState> = {
    KeyW: "forward",
    ArrowUp: "forward",
    KeyS: "backward",
    ArrowDown: "backward",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    ShiftLeft: "sprint",
    ShiftRight: "sprint",
  };

  window.addEventListener("keydown", (event) => {
    const action = movementKeys[event.code];
    if (action) {
      input[action] = true;
      event.preventDefault();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "e") {
      event.preventDefault();
      toggleVehicle();
    }
    if (key === "r") {
      event.preventDefault();
      reload();
    }
    if (key === "m" && !missions.active) {
      event.preventDefault();
      missions.startMission();
    }
  });

  window.addEventListener("keyup", (event) => {
    const action = movementKeys[event.code];
    if (action) {
      input[action] = false;
      event.preventDefault();
    }
  });

  window.addEventListener("blur", () => {
    input.forward = false;
    input.backward = false;
    input.left = false;
    input.right = false;
    input.sprint = false;
  });

  bindTouchButton("touch-up", "forward");
  bindTouchButton("touch-left", "left");
  bindTouchButton("touch-down", "backward");
  bindTouchButton("touch-right", "right");
  bindTouchButton("touch-sprint", "sprint");

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

  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 24;
  shadows.setDarkness(0.32);

  setProgress(55);

  player = createPlayer(scene);
  car = createCar(scene);
  shadows.addShadowCaster(player);
  shadows.addShadowCaster(car);
  const worldStream = createWorldStream(scene, player, material, shadows);
  worldStream.update();
  vehicleController = new VehicleController(car);
  const traffic = new TrafficSystem(scene, player, car, () => driving, material);
  const pedestrians = new PedestrianSystem(scene, player, car, () => driving, material);
  const camera = createCamera(scene, player);
  const pipeline = new DefaultRenderingPipeline("urban-heat-pipeline", true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.78;
  pipeline.bloomWeight = 0.14;
  pipeline.bloomKernel = 48;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.contrast = 1.12;
  pipeline.imageProcessing.exposure = 1.04;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.18;
  pipeline.sharpen.colorAmount = 0.65;
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

  const fire = () => {
    if (combat.shoot()) {
      audio.gunshot();
      pedestrians.notifyGunshot(driving ? car.position : camera.globalPosition);
    }
  };
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
    const forwardInput = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const strafeInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (driving) {
      vehicleController.update({
        throttle: forwardInput > 0,
        reverse: forwardInput < 0,
        left: strafeInput < 0,
        right: strafeInput > 0,
        brake: false,
      }, dt);
    } else if (forwardInput !== 0 || strafeInput !== 0) {
      const cameraForward = camera.getForwardRay(1).direction.clone();
      cameraForward.y = 0;
      if (cameraForward.lengthSquared() < 0.001) cameraForward.set(0, 0, 1);
      cameraForward.normalize();

      const cameraRight = new Vector3(cameraForward.z, 0, -cameraForward.x);
      const moveDirection = cameraForward.scale(forwardInput)
        .addInPlace(cameraRight.scale(strafeInput));
      if (moveDirection.lengthSquared() > 0.001) {
        moveDirection.normalize();
        const speed = input.sprint ? 7.2 : 4.6;
        active.position.addInPlace(moveDirection.scale(speed * dt));

        const targetYaw = Math.atan2(moveDirection.x, moveDirection.z);
        let yawDelta = targetYaw - active.rotation.y;
        while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        active.rotation.y += yawDelta * Math.min(1, dt * 12);
      }
    }

    active.position.y = driving ? 0.55 : 1.05;

    worldStream.update();
    traffic.update(dt);
    combat.update(dt);
    wanted.update(dt);
    pedestrians.setPoliceThreats(wanted.getThreatPositions());
    pedestrians.update(dt);
    missions.update(dt);
    atmosphere.update(scene, dt);

    if (missionState) {
      missionState.textContent = missions.active ? missions.label : wanted.level > 0 ? "WANTED" : driving ? "DRIVING" : "FREE ROAM";
    }

    const target = driving ? car : player;
    const speedRatio = driving ? Math.min(1, Math.abs(vehicleController.getSpeed()) / 26) : 0;
    if (driving && Math.abs(vehicleController.getSpeed()) > 1) {
      const desiredAlpha = Math.atan2(Math.sin(target.rotation.y), Math.cos(target.rotation.y)) + Math.PI;
      let alphaDelta = desiredAlpha - camera.alpha;
      while (alphaDelta > Math.PI) alphaDelta -= Math.PI * 2;
      while (alphaDelta < -Math.PI) alphaDelta += Math.PI * 2;
      camera.alpha += alphaDelta * Math.min(1, dt * 2.2);
    }
    camera.beta = (driving ? 1.14 - speedRatio * 0.06 : 1.12) - combat.recoilKick;
    camera.radius = driving ? 9.5 + speedRatio * 1.8 : 10.5;
    const desiredTarget = target.position.add(new Vector3(0, driving ? 0.65 : 0.9, 0));
    camera.target = Vector3.Lerp(camera.target, desiredTarget, Math.min(1, dt * 8));

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
