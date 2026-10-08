import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";

export type WorldStream = { update(): void };

const CHUNK_SIZE = 56;
const ACTIVE_RADIUS = 2;

export function createWorldStream(
  scene: Scene,
  focus: Mesh,
  makeMaterial: (scene: Scene, name: string, color: Color3) => PBRMaterial,
  shadows: ShadowGenerator,
): WorldStream {
  const groundMaterial = makeMaterial(scene, "WorldGround", new Color3(0.035, 0.045, 0.052));
  const roadMaterial = makeMaterial(scene, "WorldRoad", new Color3(0.014, 0.018, 0.024));
  roadMaterial.roughness = 0.88;
  const roadEdgeMaterial = makeMaterial(scene, "WorldRoadEdge", new Color3(0.08, 0.085, 0.09));
  const sidewalkMaterial = makeMaterial(scene, "WorldSidewalk", new Color3(0.16, 0.17, 0.18));
  sidewalkMaterial.roughness = 0.92;
  const sidewalkDarkMaterial = makeMaterial(scene, "WorldSidewalkDark", new Color3(0.10, 0.11, 0.12));
  const laneMaterial = makeMaterial(scene, "WorldLaneMark", new Color3(0.92, 0.82, 0.55));
  laneMaterial.emissiveColor = new Color3(0.08, 0.065, 0.025);
  const whiteMarkMaterial = makeMaterial(scene, "WorldWhiteMark", new Color3(0.92, 0.92, 0.88));
  const grassMaterial = makeMaterial(scene, "WorldGrass", new Color3(0.035, 0.13, 0.055));
  const grassAccentMaterial = makeMaterial(scene, "WorldGrassAccent", new Color3(0.07, 0.22, 0.085));
  const trunkMaterial = makeMaterial(scene, "WorldTreeTrunk", new Color3(0.13, 0.065, 0.028));
  const leafMaterials = [
    makeMaterial(scene, "WorldLeafA", new Color3(0.025, 0.16, 0.055)),
    makeMaterial(scene, "WorldLeafB", new Color3(0.035, 0.23, 0.09)),
    makeMaterial(scene, "WorldLeafC", new Color3(0.075, 0.19, 0.055)),
  ];
  const windowMaterial = makeMaterial(scene, "WorldWindows", new Color3(0.025, 0.085, 0.13));
  windowMaterial.metallic = 0.25;
  windowMaterial.roughness = 0.18;
  windowMaterial.emissiveColor = new Color3(0.012, 0.035, 0.055);
  const warmWindowMaterial = makeMaterial(scene, "WorldWarmWindows", new Color3(0.22, 0.13, 0.055));
  warmWindowMaterial.emissiveColor = new Color3(0.12, 0.065, 0.018);
  const glassMaterial = makeMaterial(scene, "WorldDarkGlass", new Color3(0.035, 0.10, 0.14));
  glassMaterial.metallic = 0.45;
  glassMaterial.roughness = 0.14;
  const curbMaterial = makeMaterial(scene, "WorldCurb", new Color3(0.23, 0.24, 0.25));
  const metalMaterial = makeMaterial(scene, "WorldStreetMetal", new Color3(0.045, 0.055, 0.065));
  metalMaterial.metallic = 0.72;
  metalMaterial.roughness = 0.34;
  const facadeTrimMaterial = makeMaterial(scene, "WorldFacadeTrim", new Color3(0.065, 0.075, 0.085));
  facadeTrimMaterial.metallic = 0.38;
  facadeTrimMaterial.roughness = 0.38;
  const brickMaterial = makeMaterial(scene, "WorldBrick", new Color3(0.24, 0.12, 0.075));
  const concreteMaterials = [
    makeMaterial(scene, "WorldConcreteA", new Color3(0.24, 0.26, 0.29)),
    makeMaterial(scene, "WorldConcreteB", new Color3(0.31, 0.27, 0.24)),
    makeMaterial(scene, "WorldConcreteC", new Color3(0.19, 0.23, 0.27)),
    makeMaterial(scene, "WorldConcreteD", new Color3(0.34, 0.33, 0.30)),
    makeMaterial(scene, "WorldConcreteE", new Color3(0.20, 0.18, 0.22)),
  ];
  const accentMaterials = [
    makeMaterial(scene, "WorldAccentBlue", new Color3(0.035, 0.16, 0.25)),
    makeMaterial(scene, "WorldAccentRed", new Color3(0.36, 0.055, 0.035)),
    makeMaterial(scene, "WorldAccentGold", new Color3(0.42, 0.24, 0.055)),
    makeMaterial(scene, "WorldAccentGreen", new Color3(0.055, 0.25, 0.13)),
  ];
  const lampMaterial = makeMaterial(scene, "WorldLamp", new Color3(1, 0.64, 0.22));
  lampMaterial.emissiveColor = new Color3(0.9, 0.36, 0.06);

  const ground = MeshBuilder.CreateGround("world-ground", { width: 800, height: 800 }, scene);
  ground.material = groundMaterial;
  ground.receiveShadows = true;

  type Chunk = { meshes: Mesh[] };
  const chunks = new Map<string, Chunk>();

  const addBox = (
    meshes: Mesh[],
    name: string,
    width: number,
    height: number,
    depth: number,
    position: Vector3,
    material: PBRMaterial,
    castShadow = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.receiveShadows = true;
    if (castShadow) shadows.addShadowCaster(mesh);
    meshes.push(mesh);
    return mesh;
  };

  const addCylinder = (
    meshes: Mesh[],
    name: string,
    diameter: number,
    height: number,
    position: Vector3,
    material: PBRMaterial,
    tessellation = 10,
    castShadow = false,
  ) => {
    const mesh = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation }, scene);
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.receiveShadows = true;
    if (castShadow) shadows.addShadowCaster(mesh);
    meshes.push(mesh);
    return mesh;
  };

  const createBuilding = (
    meshes: Mesh[],
    key: string,
    index: number,
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
  ) => {
    const facade = concreteMaterials[index % concreteMaterials.length];
    const building = addBox(meshes, "building-" + key + "-" + index, width, height, depth, new Vector3(x, height / 2, z), facade, true);

    const base = addBox(
      meshes,
      "building-base-" + key + "-" + index,
      width + 0.28,
      Math.min(1.8, height * 0.12),
      depth + 0.28,
      new Vector3(x, Math.min(0.9, height * 0.06), z),
      index % 2 === 0 ? brickMaterial : facadeTrimMaterial,
    );

    const roof = addBox(
      meshes,
      "building-roof-" + key + "-" + index,
      width + 0.35,
      0.32,
      depth + 0.35,
      new Vector3(x, height + 0.16, z),
      concreteMaterials[(index + 2) % concreteMaterials.length],
    );
    roof.freezeWorldMatrix();

    const floorCount = Math.max(2, Math.floor((height - 2.5) / 3.8));
    const columns = Math.max(3, Math.floor((width - 2) / 2.35));
    const xStep = (width - 2.2) / Math.max(1, columns - 1);
    const windowDepth = 0.07;
    const windowWidth = Math.min(1.25, xStep * 0.58);

    for (let floor = 0; floor < floorCount; floor++) {
      const y = 2.2 + floor * 3.8;
      if (y > height - 1.2) break;

      const band = addBox(
        meshes,
        "floor-band-" + key + "-" + index + "-" + floor,
        width - 0.4,
        0.11,
        0.12,
        new Vector3(x, y - 1.72, z - depth / 2 - 0.06),
        facadeTrimMaterial,
      );
      band.freezeWorldMatrix();

      for (let column = 0; column < columns; column++) {
        const wx = x - width / 2 + 1.1 + column * xStep;
        const material = (index + floor + column) % 5 === 0 ? warmWindowMaterial : windowMaterial;

        const front = addBox(
          meshes,
          "window-front-" + key + "-" + index + "-" + floor + "-" + column,
          windowWidth,
          1.05,
          windowDepth,
          new Vector3(wx, y, z - depth / 2 - 0.045),
          material,
        );
        front.freezeWorldMatrix();

        const side = addBox(
          meshes,
          "window-side-" + key + "-" + index + "-" + floor + "-" + column,
          Math.min(1.25, (depth - 2) / Math.max(3, columns)),
          1.05,
          windowDepth,
          new Vector3(x - width / 2 - 0.045, y, z - depth / 2 + 1 + column * Math.min(2.5, (depth - 2) / Math.max(1, columns - 1))),
          material,
        );
        side.rotation.y = Math.PI / 2;
        side.freezeWorldMatrix();
      }
    }

    for (const side of [-1, 1]) {
      const pillar = addBox(
        meshes,
        "facade-pillar-" + key + "-" + index + "-" + side,
        0.22,
        height - 0.8,
        0.18,
        new Vector3(x + side * (width / 2 - 0.32), height / 2, z - depth / 2 - 0.08),
        facadeTrimMaterial,
      );
      pillar.freezeWorldMatrix();
    }

    const storefront = addBox(
      meshes,
      "storefront-" + key + "-" + index,
      width * 0.68,
      Math.min(2.8, height * 0.22),
      0.11,
      new Vector3(x, Math.min(1.7, height * 0.11), z - depth / 2 - 0.13),
      glassMaterial,
    );
    storefront.freezeWorldMatrix();

    const sign = addBox(
      meshes,
      "store-sign-" + key + "-" + index,
      Math.min(width * 0.62, 7.5),
      0.65,
      0.12,
      new Vector3(x, Math.min(3.25, height * 0.2), z - depth / 2 - 0.2),
      accentMaterials[index % accentMaterials.length],
    );
    sign.freezeWorldMatrix();

    for (let awning = 0; awning < 2; awning++) {
      const canopy = addBox(
        meshes,
        "awning-" + key + "-" + index + "-" + awning,
        Math.min(4.2, width * 0.38),
        0.16,
        1.0,
        new Vector3(
          x - width * 0.22 + awning * width * 0.44,
          Math.min(2.25, height * 0.14),
          z - depth / 2 - 0.55,
        ),
        accentMaterials[(index + awning + 1) % accentMaterials.length],
      );
      canopy.rotation.x = -0.08;
    }

    const rooftopCount = 2 + (index % 2);
    for (let unit = 0; unit < rooftopCount; unit++) {
      const ac = addBox(
        meshes,
        "roof-ac-" + key + "-" + index + "-" + unit,
        1.25,
        0.62,
        0.88,
        new Vector3(
          x - width * 0.3 + unit * 1.65,
          height + 0.47,
          z + depth * 0.12,
        ),
        metalMaterial,
      );
      addBox(
        meshes,
        "roof-ac-top-" + key + "-" + index + "-" + unit,
        0.95,
        0.08,
        0.62,
        new Vector3(ac.position.x, height + 0.82, ac.position.z),
        facadeTrimMaterial,
      );
    }

    if (index % 3 === 0) {
      addBox(
        meshes,
        "roof-water-tank-" + key + "-" + index,
        1.3,
        1.6,
        1.3,
        new Vector3(x + width * 0.25, height + 0.95, z + depth * 0.2),
        metalMaterial,
      );
    }

    base.freezeWorldMatrix();
    building.freezeWorldMatrix();
  };

  const createTree = (meshes: Mesh[], key: string, index: number, x: number, z: number) => {
    const trunkHeight = 2.4 + (index % 3) * 0.35;
    const trunk = addCylinder(
      meshes,
      "tree-trunk-" + key + "-" + index,
      0.24,
      trunkHeight,
      new Vector3(x, trunkHeight / 2, z),
      trunkMaterial,
      10,
      true,
    );

    const crownMaterial = leafMaterials[index % leafMaterials.length];
    const crown = MeshBuilder.CreateSphere("tree-crown-" + key + "-" + index, {
      diameter: 2.5 + (index % 3) * 0.35,
      segments: 12,
    }, scene);
    crown.position.set(x, trunkHeight + 0.85, z);
    crown.scaling.y = 0.92 + (index % 2) * 0.12;
    crown.material = crownMaterial;
    crown.receiveShadows = true;
    shadows.addShadowCaster(crown);
    meshes.push(crown);

    if (index % 2 === 0) {
      const grassRing = MeshBuilder.CreateCylinder("tree-bed-" + key + "-" + index, {
        diameter: 3.1,
        height: 0.07,
        tessellation: 18,
      }, scene);
      grassRing.position.set(x, 0.115, z);
      grassRing.material = grassAccentMaterial;
      meshes.push(grassRing);
    }

    trunk.freezeWorldMatrix();
    crown.freezeWorldMatrix();
  };

  const createStreetLight = (meshes: Mesh[], key: string, x: number, z: number, side: number) => {
    const pole = addCylinder(
      meshes,
      "lamp-pole-" + key + "-" + side + "-" + x + "-" + z,
      0.11,
      6.6,
      new Vector3(x, 3.3, z),
      metalMaterial,
      8,
    );
    const arm = addBox(
      meshes,
      "lamp-arm-" + key + "-" + side + "-" + x + "-" + z,
      1.65,
      0.10,
      0.10,
      new Vector3(x + side * 0.68, 6.2, z),
      metalMaterial,
    );
    const lamp = MeshBuilder.CreateSphere("lamp-head-" + key + "-" + side + "-" + x + "-" + z, {
      diameter: 0.34,
      segments: 10,
    }, scene);
    lamp.position.set(x + side * 1.35, 6.05, z);
    lamp.material = lampMaterial;
    meshes.push(lamp);


    pole.freezeWorldMatrix();
    arm.freezeWorldMatrix();
  };

  const createParkedCar = (meshes: Mesh[], key: string, index: number, x: number, z: number, rotation: number) => {
    const colors = [
      new Color3(0.50, 0.055, 0.035),
      new Color3(0.035, 0.17, 0.32),
      new Color3(0.22, 0.23, 0.25),
      new Color3(0.46, 0.34, 0.08),
    ];
    const carPaint = makeMaterial(scene, "ParkedCarPaint-" + key + "-" + index, colors[index % colors.length]);
    carPaint.metallic = 0.72;
    carPaint.roughness = 0.22;

    const body = addBox(
      meshes,
      "parked-car-body-" + key + "-" + index,
      1.75,
      0.48,
      3.45,
      new Vector3(x, 0.48, z),
      carPaint,
      true,
    );
    body.rotation.y = rotation;

    const roof = addBox(
      meshes,
      "parked-car-roof-" + key + "-" + index,
      1.42,
      0.42,
      1.65,
      new Vector3(x, 0.82, z - Math.cos(rotation) * 0.08),
      glassMaterial,
    );
    roof.rotation.y = rotation;

    for (const side of [-1, 1]) {
      const wheelA = MeshBuilder.CreateCylinder("parked-wheel-" + key + "-" + index + "-" + side + "-a", {
        diameter: 0.52,
        height: 0.16,
        tessellation: 12,
      }, scene);
      wheelA.rotation.z = Math.PI / 2;
      wheelA.rotation.y = rotation;
      wheelA.position.set(x + Math.sin(rotation) * side * 0.9, 0.34, z + Math.cos(rotation) * side * 0.9);
      wheelA.material = metalMaterial;
      meshes.push(wheelA);
    }
    body.freezeWorldMatrix();
    roof.freezeWorldMatrix();
  };

  const load = (cx: number, cz: number) => {
    const key = cx + ":" + cz;
    if (chunks.has(key)) return;

    const meshes: Mesh[] = [];
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    addBox(meshes, "road-v-" + key, 14, 0.06, CHUNK_SIZE, new Vector3(ox, 0.03, oz), roadMaterial);
    addBox(meshes, "road-h-" + key, CHUNK_SIZE, 0.06, 14, new Vector3(ox, 0.035, oz), roadMaterial);

    for (const edge of [-1, 1]) {
      addBox(meshes, "road-edge-v-" + key + "-" + edge, 0.18, 0.025, CHUNK_SIZE - 1, new Vector3(ox + edge * 6.35, 0.07, oz), roadEdgeMaterial);
      addBox(meshes, "road-edge-h-" + key + "-" + edge, CHUNK_SIZE - 1, 0.025, 0.18, new Vector3(ox, 0.075, oz + edge * 6.35), roadEdgeMaterial);
    }

    const sidewalks = [
      { x: -9.2, z: 0, w: 4.2, d: CHUNK_SIZE },
      { x: 9.2, z: 0, w: 4.2, d: CHUNK_SIZE },
      { x: 0, z: -9.2, w: CHUNK_SIZE, d: 4.2 },
      { x: 0, z: 9.2, w: CHUNK_SIZE, d: 4.2 },
    ];
    sidewalks.forEach((piece, index) => {
      addBox(meshes, "sidewalk-" + key + "-" + index, piece.w, 0.12, piece.d, new Vector3(ox + piece.x, 0.09, oz + piece.z), sidewalkMaterial);
    });

    for (let seam = -24; seam <= 24; seam += 4) {
      addBox(meshes, "sidewalk-seam-v-" + key + "-" + seam, 0.035, 0.018, 3.7, new Vector3(ox - 9.2, 0.16, oz + seam), sidewalkDarkMaterial);
      addBox(meshes, "sidewalk-seam-v2-" + key + "-" + seam, 0.035, 0.018, 3.7, new Vector3(ox + 9.2, 0.16, oz + seam), sidewalkDarkMaterial);
      addBox(meshes, "sidewalk-seam-h-" + key + "-" + seam, 3.7, 0.018, 0.035, new Vector3(ox + seam, 0.16, oz - 9.2), sidewalkDarkMaterial);
      addBox(meshes, "sidewalk-seam-h2-" + key + "-" + seam, 3.7, 0.018, 0.035, new Vector3(ox + seam, 0.16, oz + 9.2), sidewalkDarkMaterial);
    }

    for (let lane = -1; lane <= 1; lane += 2) {
      for (let segment = -1; segment <= 1; segment++) {
        addBox(
          meshes,
          "lane-v-" + key + "-" + lane + "-" + segment,
          0.12,
          0.026,
          7.5,
          new Vector3(ox + lane * 3.45, 0.075, oz + segment * 18),
          whiteMarkMaterial,
        );
        addBox(
          meshes,
          "lane-h-" + key + "-" + lane + "-" + segment,
          7.5,
          0.026,
          0.12,
          new Vector3(ox + segment * 18, 0.08, oz + lane * 3.45),
          whiteMarkMaterial,
        );
      }
    }

    for (let stripe = -5; stripe <= 5; stripe += 2) {
      addBox(meshes, "crosswalk-v-" + key + "-" + stripe, 0.8, 0.028, 5.8, new Vector3(ox + stripe, 0.085, oz - 8.9), whiteMarkMaterial);
      addBox(meshes, "crosswalk-h-" + key + "-" + stripe, 5.8, 0.028, 0.8, new Vector3(ox - 8.9, 0.09, oz + stripe), whiteMarkMaterial);
    }

    const buildingData = [
      [-21, -21, 12, 13, 16],
      [4, -21, 15, 12, 27],
      [21, -20, 12, 14, 12],
      [-21, 20, 14, 12, 23],
      [4, 20, 12, 14, 34],
      [21, 20, 14, 12, 19],
    ];
    buildingData.forEach((data, index) => {
      createBuilding(meshes, key, index, ox + data[0], oz + data[1], data[2], data[3], data[4]);
    });

    const streetFurniture = [
      [-11.4, -17], [-11.4, 3], [-11.4, 23],
      [11.4, -3], [11.4, 17],
      [-3, -11.4], [17, -11.4],
      [3, 11.4], [-17, 11.4],
    ];
    streetFurniture.forEach((item, index) => {
      const [x, z] = item;
      createStreetLight(meshes, key, ox + x, oz + z, index % 2 === 0 ? 1 : -1);
    });

    const treePositions = [
      [-11.2, -23], [11.2, -17], [-11.2, -3], [11.2, 4],
      [-11.2, 20], [11.2, 23],
    ];
    treePositions.forEach((item, index) => createTree(meshes, key, index, ox + item[0], oz + item[1]));

    const parked = [
      [-11.5, -8.5, Math.PI / 2],
      [11.5, 8.5, -Math.PI / 2],
      [-18.5, 11.5, 0],
      [18.5, -11.5, Math.PI],
    ];
    parked.forEach((item, index) => createParkedCar(meshes, key, index, ox + item[0], oz + item[1], item[2]));

    // Small street props break up the empty procedural look.
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = ox + side * 11.2;
      const z = oz - 7 + i * 5;
      addCylinder(meshes, "bollard-" + key + "-" + i, 0.16, 0.72, new Vector3(x, 0.42, z), metalMaterial, 8);
      addBox(meshes, "bollard-cap-" + key + "-" + i, 0.22, 0.08, 0.22, new Vector3(x, 0.81, z), facadeTrimMaterial);
    }

    chunks.set(key, { meshes });
  };

  const unload = (key: string) => {
    const chunk = chunks.get(key);
    if (!chunk) return;
    for (const mesh of chunk.meshes) mesh.dispose();
    chunks.delete(key);
  };

  return {
    update() {
      const cx = Math.round(focus.position.x / CHUNK_SIZE);
      const cz = Math.round(focus.position.z / CHUNK_SIZE);
      const required = new Set<string>();

      for (let x = cx - ACTIVE_RADIUS; x <= cx + ACTIVE_RADIUS; x++) {
        for (let z = cz - ACTIVE_RADIUS; z <= cz + ACTIVE_RADIUS; z++) {
          const key = x + ":" + z;
          required.add(key);
          load(x, z);
        }
      }

      for (const key of chunks.keys()) {
        if (!required.has(key)) unload(key);
      }
    },
  };
}
