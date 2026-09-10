import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/MTLLoader.js";
import * as SkeletonUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js";
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/SSAOPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/OutputPass.js";
import {
  cloneR15Avatar,
  getR15BodyMaterials,
  installR15AnimationData,
  loadR15Avatar,
  makeR15TextureOpaque,
  restoreR15Animation,
  restoreR15Texture,
  setR15BodyTextureMaterial,
  setR15Animation,
  updateR15Animation,
} from "./r15-avatar.js";

const canvasWrap = document.getElementById("canvas");
const scene = new THREE.Scene();

// ---------------------------------------------------------------------------
// GAME CONFIG — tweak movement values here without hunting through the file.
// ---------------------------------------------------------------------------
const CONFIG = {
  // JumpPower in Roblox studs/s.
  jumpPower: 75,
  // Whether player-to-player body pushing is enabled. False makes avatars
  // solid but not movable.
  playerPush: true,
};

// Anonymous players use one fixed appearance. Keep these assets local so the
// same guest look is available to every client in the room.
const GUEST_AVATAR_TEXTURE = "uploads/avatar-template__3_.png";
const GUEST_HAT_ID = "guest_cap";
const GUEST_HAT_TEXTURE = "uploads/Handle1_diff.png";

// ---------------------------------------------------------------------------
// HATS & HAIR — add a new item by copying one entry below. Mesh is a local
// .obj (already in stud units, matching Roblox `Size`), texture is a local
// image. Set texture to null to use the solid brown color. `attachTo` names
// the body part the item attaches to; `position` is [x, y, z] studs from
// that part. `bone` remains as a legacy alias. Hair items use the shared
// hair-paint texture instead of `texture`.
// ---------------------------------------------------------------------------
const HATS_CONFIG = {
  // Add another entry to `items` with the same fields: mesh, attachTo,
  // position, rotation, texture, and optional style. Position/rotation are
  // in studs and degrees. This is the only section a new hat needs to touch.
  version: 2,
  hairTextureSize: 256,
  brown: "#5d4220",
  items: [
    {
      id: "messy_hair",
      name: "Messy Hair",
      category: "hair",
      mesh: "uploads/MessyHair.obj",
      texture: "uploads/Messyhair1_diff.png",
      bone: "Head",
      attachTo: "Head",
      position: [0, 0.9, 0],
      rotation: [0, -180, 0],
      style: { tint: "#ffffff", hue: 0, saturation: 1, lightness: 1, opacity: 1, specular: "#101010", shininess: 8 },
    },
    {
      id: "fabulous_hair",
      name: "Fabulous Hair",
      category: "hair",
      mesh: "uploads/Ultra-Fabulous_hair_brown.obj",
      texture: "uploads/UltrafabulousHairBrown1_diff.png",
      bone: "Head",
      attachTo: "Head",
      position: [-0.15, 1.05, 0],
      rotation: [0, 180, 0],
      style: { tint: "#ffffff", hue: 0, saturation: 1, lightness: 1, opacity: 1, specular: "#101010", shininess: 8 },
    },
    {
      id: "long_hair_band",
      name: "Long Hair Headband",
      category: "hair",
      mesh: "uploads/LongHairHeadBandBrown.obj",
      texture: "uploads/Longhairheadbandbrown1_diff.png",
      bone: "Head",
      attachTo: "Head",
      position: [0, 0.2, 0],
      rotation: [0, 90, 0],
      style: { tint: "#ffffff", hue: 0, saturation: 1, lightness: 1, opacity: 1, specular: "#101010", shininess: 8 },
    },
    {
      id: "traffic_cone",
      name: "Traffic Cone",
      category: "hat",
      mesh: "uploads/TrafficCone.obj",
      texture: "uploads/Trafficcone1_diff.png",
      bone: "Head",
      attachTo: "Head",
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      style: { tint: "#ffffff", hue: 0, saturation: 1, lightness: 1, opacity: 1, specular: "#101010", shininess: 8 },
    },
    {
      id: "fedora",
      name: "Fedora",
      category: "hat",
      mesh: "uploads/Fedora.obj",
      texture: "uploads/Fedora1_diff.png",
      bone: "Head",
      attachTo: "Head",
      position: [0, 1.2, 0],
      rotation: [0, 0, 0],
      style: { tint: "#ffffff", hue: 0, saturation: 1, lightness: 1, opacity: 1, specular: "#101010", shininess: 8 },
    },
    {
      id: "party_hat",
      name: "Party Hat",
      category: "hat",
      mesh: "uploads/PartyHat.obj",
      texture: "uploads/PartyHat1_diff.png",
      bone: "Head",
      attachTo: "Head",
      position: [0, 1.65, 0],
      rotation: [0, 0, 0],
      style: { tint: "#ffffff", hue: 0, saturation: 1, lightness: 1, opacity: 1, specular: "#101010", shininess: 8 },
    },
    {
      id: GUEST_HAT_ID,
      name: "Guest Cap",
      category: "hat",
      mesh: "uploads/GuestCap.obj",
      texture: GUEST_HAT_TEXTURE,
      bone: "Head",
      attachTo: "Head",
      position: [0, 1.05, 0.2],
      rotation: [0, 91, 0],
      scale: 1,
      style: { tint: "#ffffff", hue: 0, saturation: 1, lightness: 1, opacity: 1, specular: "#101010", shininess: 8 },
    },
  ],
};

const materialSettings = {
  // Global material defaults requested for the Plastic look.
  roughness: 0.5,
  metalness: 0.0,
  // Reflectivity remains disabled by default; the slider can still add it.
  reflectivity: 0.0,
  specular: 0.1,
};
const editableMaterials = [];
const editableMaterialSet = new Set();

function registerEditableMaterial(material) {
  if (editableMaterialSet.has(material)) return material;
  editableMaterialSet.add(material);
  editableMaterials.push(material);
  return material;
}

function unregisterEditableMaterial(material) {
  if (!material || !editableMaterialSet.delete(material)) return;
  const index = editableMaterials.indexOf(material);
  if (index >= 0) editableMaterials.splice(index, 1);
}

// ---------------------------------------------------------------------------
// RENDERER + LIGHTING — public reverse-engineered Roblox thumbnail preset
// ---------------------------------------------------------------------------
function initializeRobloxThumbnailLighting(scene, canvas) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  // A device-pixel-ratio of 3 or 4 makes every remote avatar and shadow much
  // more expensive in crowded rooms. Two is enough for the Roblox-style UI
  // while keeping the render cost bounded on high-density screens.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(new THREE.Color(0x000000), 0.0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  canvas.appendChild(renderer.domElement);

  // Values used by the public Thumbnail preset in RoAvatar-Renderer.
  const ambient = new THREE.AmbientLight(
    new THREE.Color(128 / 255, 128 / 255, 128 / 255),
    Math.PI / 2
  );
  scene.add(ambient);

  const thumbnailLightColor = new THREE.Color(Math.PI, Math.PI, Math.PI);
  const thumbnailLightDirection = new THREE.Vector3(
    -0.47489210963249207,
    0.8225368857383728,
    0.3129066228866577
  );

  const keyLight = new THREE.DirectionalLight(thumbnailLightColor, 1.0);
  keyLight.position.copy(thumbnailLightDirection).multiplyScalar(10);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 200;
  // Keep the dynamic shadow frustum focused on the playable area around the
  // avatars so the local character's shadow remains readable at 2048px.
  keyLight.shadow.camera.left = -128;
  keyLight.shadow.camera.right = 128;
  keyLight.shadow.camera.top = 128;
  keyLight.shadow.camera.bottom = -128;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(
    thumbnailLightColor,
    Math.PI * 0.1
  );
  fillLight.position.copy(thumbnailLightDirection).multiplyScalar(-10);
  fillLight.castShadow = false;
  scene.add(fillLight);

  return { renderer, ambient, keyLight, fillLight };
}

const { renderer, ambient, keyLight, fillLight } = initializeRobloxThumbnailLighting(scene, canvasWrap);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 5000);
camera.position.set(40, 38, 40);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
composer.addPass(new RenderPass(scene, camera));
const ssaoPass = new SSAOPass(
  scene,
  camera,
  window.innerWidth,
  window.innerHeight
);
ssaoPass.kernelRadius = 1;
ssaoPass.minDistance = 0.002;
ssaoPass.maxDistance = 0.5;
ssaoPass.ssaoMaterial.uniforms.ssaoStrength = { value: 1 };
ssaoPass.ssaoMaterial.fragmentShader = ssaoPass.ssaoMaterial.fragmentShader
  .replace(
    "uniform float maxDistance; // avoid the influence of fragments which are too far away",
    "uniform float maxDistance; // avoid the influence of fragments which are too far away\nuniform float ssaoStrength;"
  )
  .replace(
    "occlusion = clamp( occlusion / float( KERNEL_SIZE ), 0.0, 1.0 );",
    "occlusion = clamp( occlusion * ssaoStrength / float( KERNEL_SIZE ), 0.0, 1.0 );"
  );
ssaoPass.ssaoMaterial.needsUpdate = true;
composer.addPass(ssaoPass);
const colorGradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
    contrast: { value: 1 },
    brightness: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    varying vec2 vUv;
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 color = source.rgb;
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luminance), color, saturation);
      color = (color - 0.5) * contrast + 0.5 + brightness;
      gl_FragColor = vec4(max(color, 0.0), source.a);
    }
  `,
});
composer.addPass(colorGradePass);
composer.addPass(new OutputPass());

// These are the six faces of a real cubemap. Three.js samples the face that
// matches the camera direction, so the sky is not a billboard or a stretched
// 2D backdrop.
const skyboxFaces = [
  { url: "uploads/sky512_rt.png", rotation: 0 },
  { url: "uploads/sky512_lf.png", rotation: 0 },
  // Roblox stores the vertical faces rotated relative to a GL cubemap.
  { url: "uploads/sky512_up.png", rotation: -Math.PI / 2 },
  { url: "uploads/sky512_dn.png", rotation: Math.PI / 2 },
  { url: "uploads/sky512_bk.png", rotation: 0 },
  { url: "uploads/sky512_ft.png", rotation: 0 },
];

function addSkybox() {
  const textureLoader = new THREE.TextureLoader();
  const loadFace = ({ url, rotation }) => new Promise((resolve, reject) => {
    textureLoader.load(url, (texture) => {
      const image = texture.image;
      if (!rotation) {
        texture.dispose();
        resolve(image);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = image.height;
      canvas.height = image.width;
      const context = canvas.getContext("2d");
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(rotation);
      context.drawImage(image, -image.width / 2, -image.height / 2);
      texture.dispose();
      resolve(canvas);
    }, undefined, reject);
  });

  Promise.all(skyboxFaces.map(loadFace))
    .then((images) => {
      const cubeTexture = new THREE.CubeTexture(images);
      cubeTexture.colorSpace = THREE.SRGBColorSpace;
      cubeTexture.needsUpdate = true;
      scene.background = cubeTexture;
    })
    .catch((error) => console.error("Could not load the skybox cubemap", error));
}

addSkybox();

// ---------------------------------------------------------------------------
// 3. MATERIAL — the whole game uses the character's SmoothPlastic profile
// ---------------------------------------------------------------------------

const playerMaterialConfig = {
  material: "SmoothPlastic",
};

function smoothPlasticMaterial(color) {
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(color),
    specular: new THREE.Color(materialSettings.specular, materialSettings.specular, materialSettings.specular),
    shininess: 8,
  });
  material.name = `World_${playerMaterialConfig.material}`;
  return registerEditableMaterial(material);
}

// ---------------------------------------------------------------------------
// 4. WORLD  — a small explorable minimap of Roblox-style blocks
// ---------------------------------------------------------------------------

const GROUND_SIZE = 512;
const GROUND_HEIGHT = 10;
const groundTextureLoader = new THREE.TextureLoader();
const groundDiffuseTexture = groundTextureLoader.load("uploads/diffuse.png");
const groundNormalTexture = groundTextureLoader.load("uploads/studlightmap.png");

for (const texture of [groundDiffuseTexture, groundNormalTexture]) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(GROUND_SIZE, GROUND_SIZE);
}
groundDiffuseTexture.colorSpace = THREE.SRGBColorSpace;
groundNormalTexture.colorSpace = THREE.NoColorSpace;

const groundMat = registerEditableMaterial(new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#ffffff"),
  map: groundDiffuseTexture,
  normalMap: groundNormalTexture,
  normalScale: new THREE.Vector2(1, 1),
  roughness: materialSettings.roughness,
  metalness: materialSettings.metalness,
  specularIntensity: materialSettings.specular,
  clearcoat: materialSettings.reflectivity,
  clearcoatRoughness: materialSettings.roughness,
  envMapIntensity: 1,
}));
groundMat.name = `World_${playerMaterialConfig.material}_PBR`;
groundMat.needsUpdate = true;
const groundGeo = new THREE.BoxGeometry(GROUND_SIZE, GROUND_HEIGHT, GROUND_SIZE);
groundGeo.translate(0, -GROUND_HEIGHT / 2, 0);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

const palettes = [
  { color: "#c03f3f" },
  { color: "#8d3f7d" },
  { color: "#2e6db4" },
  { color: "#f2b233" },
  { color: "#6da851" },
  { color: "#a1a1a1" },
  { color: "#5a5348" },
];

const bricks = [];
const colliders = [];
function addBrick(x, z, w, h, d, palette) {
  // Give each box face its own material so a 3D side-bucket click can recolor
  // one surface without changing the other five sides.
  const materials = Array.from({ length: 6 }, () => smoothPlasticMaterial(palette.color));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials);
  mesh.userData.paintableSides = true;
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  bricks.push(mesh);
  colliders.push({
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: 0,
    maxY: h,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  });
}

// ---------------------------------------------------------------------------
// 5. PLAYER  — third-person Roblox noob with smooth animation blending
// ---------------------------------------------------------------------------
const GROUND_Y = 0;
const GROUND_LIMIT = GROUND_SIZE / 2;
const VOID_RESPAWN_Y = -20;
const RESPAWN_DELAY_MS = 1000;

// Sounds use the supplied local assets and Web Audio's PannerNode. Every
// player can therefore hear nearby players, with volume and stereo position
// determined by the distance from the local player.
const gameSounds = {
  jump: { src: "uploads/action_jump.mp3", volume: 0.8, playbackRate: 1 },
  falling: { src: "uploads/action_falling.mp3", volume: 0.8, playbackRate: 1 },
  // Speed and pitch are both 1.85x for the walking sound.
  footsteps: { src: "uploads/action_footsteps_plastic.mp3", volume: 0.8, playbackRate: 1.85 },
  land: { src: "uploads/orginal-roblox-land-sound.mp3", volume: 0.8, playbackRate: 1 },
  // User-supplied Cheezburger eating sound.
  burger: { src: "uploads/mmm-cheezburger.mp3", volume: 1, playbackRate: 1 },
};
const musicToggle = document.getElementById("music-toggle");
const musicTracks = [
  "uploads/Pretty_nice_day__huh..._-_OneShot.mp3",
  "uploads/012._Home__UNDERTALE_Soundtrack__-_Toby_Fox.mp3",
  "uploads/043._Temmie_Village__UNDERTALE_Soundtrack__-_Toby_Fox.mp3",
  "uploads/054._Hotel__UNDERTALE_Soundtrack__-_Toby_Fox.mp3",
  "uploads/Field_of_Hopes_and_Dreams.mp3",
  "uploads/School.mp3",
];
let musicEnabled = false;
let musicAudio = null;
let lastMusicTrackIndex = -1;

function chooseRandomMusicTrack() {
  let nextIndex = Math.floor(Math.random() * musicTracks.length);
  if (musicTracks.length > 1 && nextIndex === lastMusicTrackIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (musicTracks.length - 1))) % musicTracks.length;
  }
  lastMusicTrackIndex = nextIndex;
  return musicTracks[nextIndex];
}

function playRandomMusic() {
  if (!musicEnabled) return;
  const nextAudio = new Audio(chooseRandomMusicTrack());
  nextAudio.volume = 0.35;
  nextAudio.preload = "auto";
  musicAudio = nextAudio;
  nextAudio.addEventListener("ended", () => {
    if (musicAudio === nextAudio) playRandomMusic();
  }, { once: true });
  nextAudio.play().catch(() => {
    if (musicAudio === nextAudio) {
      musicEnabled = false;
      musicAudio = null;
    }
  });
}

function stopMusic() {
  if (!musicAudio) return;
  musicAudio.pause();
  musicAudio.currentTime = 0;
  musicAudio.removeAttribute("src");
  musicAudio.load();
  musicAudio = null;
}

function persistMusicState() {
  try {
    localStorage.setItem("rbxplay_music_enabled", String(musicEnabled));
  } catch (error) {
    /* storage unavailable */
  }
}

function setMusicEnabled(enabled) {
  musicEnabled = Boolean(enabled);
  musicToggle?.setAttribute("aria-pressed", String(musicEnabled));
  if (musicToggle) {
    musicToggle.title = musicEnabled ? "Disable music" : "Enable music";
    musicToggle.setAttribute("aria-label", musicEnabled ? "Disable music" : "Enable music");
  }
  persistMusicState();
  if (musicEnabled) {
    stopMusic();
    playRandomMusic();
  } else {
    stopMusic();
  }
}

function restoreMusicState() {
  try {
    musicEnabled = localStorage.getItem("rbxplay_music_enabled") === "true";
  } catch (error) {
    musicEnabled = false;
  }
  musicToggle?.setAttribute("aria-pressed", String(musicEnabled));
  if (musicEnabled) {
    musicToggle.title = "Disable music";
    musicToggle.setAttribute("aria-label", "Disable music");
  }
}

restoreMusicState();

musicToggle?.addEventListener("click", () => setMusicEnabled(!musicEnabled));

// --- Minesweeper (private panel for a single account) ---
const MINESWEEPER_USER = "lelellelelle";
const minesweeperToggle = document.getElementById("minesweeper-toggle");
const minesweeperPanel = document.getElementById("minesweeper-panel");
const minesweeperClose = document.getElementById("minesweeper-close");
const minesweeperBoard = document.getElementById("minesweeper-board");
const minesweeperFlags = document.getElementById("minesweeper-flags");
const minesweeperTimer = document.getElementById("minesweeper-timer");
const minesweeperRestart = document.getElementById("minesweeper-restart");
const MINE_ROWS = 9;
const MINE_COLS = 9;
const MINE_COUNT = 10;
let mineGrid = [];
let mineRevealed = [];
let mineFlags = [];
let mineOver = false;
let mineStarted = false;
let mineTimer = null;
let mineSeconds = 0;

function isMinesweeperUser(name) {
  return String(name || "").trim().toLowerCase() === MINESWEEPER_USER;
}

function updateMinesweeperAccess() {
  if (!minesweeperToggle) return;
  const allowed = isMinesweeperUser(multiplayer.username);
  minesweeperToggle.hidden = !allowed;
  if (!allowed && minesweeperPanel) minesweeperPanel.hidden = true;
}

function newMineGrid(firstRow, firstCol) {
  const grid = Array.from({ length: MINE_ROWS }, () =>
    Array.from({ length: MINE_COLS }, () => ({ mine: false, near: 0 })));
  let placed = 0;
  let guard = 0;
  while (placed < MINE_COUNT && guard++ < 1000) {
    const r = Math.floor(Math.random() * MINE_ROWS);
    const c = Math.floor(Math.random() * MINE_COLS);
    // Never place a mine on the first revealed cell or its neighbours.
    if (Math.abs(r - firstRow) <= 1 && Math.abs(c - firstCol) <= 1) continue;
    if (grid[r][c].mine) continue;
    grid[r][c].mine = true;
    placed += 1;
  }
  for (let r = 0; r < MINE_ROWS; r += 1) {
    for (let c = 0; c < MINE_COLS; c += 1) {
      let near = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= MINE_ROWS || nc < 0 || nc >= MINE_COLS) continue;
          if (grid[nr][nc].mine) near += 1;
        }
      }
      grid[r][c].near = near;
    }
  }
  return grid;
}

function startMineTimer() {
  stopMineTimer();
  mineSeconds = 0;
  if (minesweeperTimer) minesweeperTimer.textContent = "0";
  mineStarted = true;
  mineTimer = window.setInterval(() => {
    mineSeconds += 1;
    if (minesweeperTimer && !mineOver) minesweeperTimer.textContent = String(mineSeconds);
  }, 1000);
}

function stopMineTimer() {
  if (mineTimer) {
    window.clearInterval(mineTimer);
    mineTimer = null;
  }
}

function revealMineCells(r, c) {
  if (r < 0 || r >= MINE_ROWS || c < 0 || c >= MINE_COLS) return;
  if (mineRevealed[r][c] || mineFlags[r][c]) return;
  mineRevealed[r][c] = true;
  if (mineGrid[r][c].mine) return;
  if (mineGrid[r][c].near === 0) {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        revealMineCells(r + dr, c + dc);
      }
    }
  }
}

function checkMineWin() {
  let revealed = 0;
  for (let r = 0; r < MINE_ROWS; r += 1) {
    for (let c = 0; c < MINE_COLS; c += 1) {
      if (mineRevealed[r][c]) revealed += 1;
    }
  }
  if (revealed === MINE_ROWS * MINE_COLS - MINE_COUNT) {
    mineOver = true;
    stopMineTimer();
    renderMineBoard(true);
    return true;
  }
  return false;
}

function renderMineBoard(win = false) {
  if (!minesweeperBoard) return;
  minesweeperBoard.replaceChildren();
  if (minesweeperFlags) {
    let flagged = 0;
    for (const row of mineFlags) for (const f of row) if (f) flagged += 1;
    minesweeperFlags.textContent = `${MINE_COUNT - flagged} mines`;
  }
  for (let r = 0; r < MINE_ROWS; r += 1) {
    for (let c = 0; c < MINE_COLS; c += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "minesweeper-cell";
      const revealed = mineRevealed[r][c];
      if (revealed) {
        cell.classList.add("revealed");
        if (mineGrid[r][c].mine) {
          cell.textContent = "💣";
          cell.classList.add("mine");
        } else if (mineGrid[r][c].near > 0) {
          cell.textContent = String(mineGrid[r][c].near);
          cell.classList.add(`n${mineGrid[r][c].near}`);
        }
      } else if (mineFlags[r][c]) {
        cell.textContent = "🚩";
        cell.classList.add("flagged");
      }
      cell.addEventListener("click", () => onMineClick(r, c));
      cell.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        onMineFlag(r, c);
      });
      minesweeperBoard.append(cell);
    }
  }
}

function onMineClick(r, c) {
  if (mineOver || mineRevealed[r][c] || mineFlags[r][c]) return;
  if (!mineStarted) {
    mineGrid = newMineGrid(r, c);
    mineRevealed = Array.from({ length: MINE_ROWS }, () => Array.from({ length: MINE_COLS }, () => false));
    mineFlags = Array.from({ length: MINE_ROWS }, () => Array.from({ length: MINE_COLS }, () => false));
    startMineTimer();
    revealMineCells(r, c);
  } else {
    if (mineGrid[r][c].mine) {
      mineOver = true;
      stopMineTimer();
      for (let rr = 0; rr < MINE_ROWS; rr += 1) {
        for (let cc = 0; cc < MINE_COLS; cc += 1) {
          if (mineGrid[rr][cc].mine) mineRevealed[rr][cc] = true;
        }
      }
      renderMineBoard();
      return;
    }
    revealMineCells(r, c);
  }
  renderMineBoard();
  checkMineWin();
}

function onMineFlag(r, c) {
  if (mineOver || mineRevealed[r][c]) return;
  mineFlags[r][c] = !mineFlags[r][c];
  renderMineBoard();
}

function startMineGame() {
  mineGrid = [];
  mineRevealed = Array.from({ length: MINE_ROWS }, () => Array.from({ length: MINE_COLS }, () => false));
  mineFlags = Array.from({ length: MINE_ROWS }, () => Array.from({ length: MINE_COLS }, () => false));
  mineOver = false;
  mineStarted = false;
  stopMineTimer();
  mineSeconds = 0;
  if (minesweeperTimer) minesweeperTimer.textContent = "0";
  renderMineBoard();
}

minesweeperToggle?.addEventListener("click", () => {
  if (!isMinesweeperUser(multiplayer.username)) return;
  if (!minesweeperPanel) return;
  if (minesweeperPanel.hidden) {
    startMineGame();
    minesweeperPanel.hidden = false;
  } else {
    minesweeperPanel.hidden = true;
  }
});
minesweeperClose?.addEventListener("click", () => {
  if (minesweeperPanel) minesweeperPanel.hidden = true;
});
minesweeperRestart?.addEventListener("click", startMineGame);
// `multiplayer` is declared later in this module; defer the initial access
// check until after the module has fully evaluated so the TDZ guard is clear.
setTimeout(updateMinesweeperAccess, 0);

const SpatialAudioContext = window.AudioContext || window.webkitAudioContext;
let audioContext = null;
let audioUnlocked = false;
let footstepsPlaying = false;
let footstepsInstance = null;
const remoteFootsteps = new Map();
const activeSpatialSounds = new Set();

function resumeGameAudio(force = false) {
  if (!SpatialAudioContext) return null;
  if (!force && !audioUnlocked) return null;
  if (!audioContext) audioContext = new SpatialAudioContext();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function unlockGameAudio() {
  audioUnlocked = true;
  resumeGameAudio(true);
  if (musicEnabled && !musicAudio) playRandomMusic();
}

function setSpatialPosition(node, position) {
  if (!node) return;
  const x = Number(position?.x) || 0;
  const y = Number(position?.y) || 0;
  const z = Number(position?.z) || 0;
  if (node.positionX) {
    node.positionX.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
  } else {
    node.setPosition(x, y, z);
  }
}

function createSpatialAudio(soundName, position, loop = false) {
  const sound = gameSounds[soundName];
  const context = resumeGameAudio();
  if (!sound || !context) return null;

  const audio = new Audio(sound.src);
  audio.preload = "auto";
  audio.loop = loop;
  audio.volume = sound.volume;
  audio.playbackRate = sound.playbackRate;
  audio.preservesPitch = false;
  audio.mozPreservesPitch = false;
  audio.webkitPreservesPitch = false;

  const source = context.createMediaElementSource(audio);
  const panner = context.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 4;
  panner.maxDistance = 90;
  panner.rolloffFactor = 1.25;
  setSpatialPosition(panner, position);
  source.connect(panner).connect(context.destination);
  return { audio, panner, source };
}

function disposeSpatialAudio(instance) {
  if (!instance) return;
  try {
    instance.audio.pause();
    instance.audio.currentTime = 0;
    instance.source.disconnect();
    instance.panner.disconnect();
  } catch {
    // The media element may already have ended or been released.
  }
}

function playSpatialSound(soundName, position) {
  if (!gamePresenceVisible) return;
  const instance = createSpatialAudio(soundName, position);
  if (!instance) return;
  activeSpatialSounds.add(instance);
  const cleanup = () => {
    activeSpatialSounds.delete(instance);
    disposeSpatialAudio(instance);
    instance.audio.remove();
  };
  instance.audio.addEventListener("ended", cleanup, { once: true });
  instance.audio.play().catch(cleanup);
}

function updateAudioListener() {
  if (!audioContext) return;
  const listener = audioContext.listener;
  const position = { x: player.pos.x, y: player.pos.y + 2.5, z: player.pos.z };
  if (listener.positionX) {
    listener.positionX.value = position.x;
    listener.positionY.value = position.y;
    listener.positionZ.value = position.z;
    listener.forwardX.value = cameraLookDirection.x;
    listener.forwardY.value = cameraLookDirection.y;
    listener.forwardZ.value = cameraLookDirection.z;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else {
    listener.setPosition(position.x, position.y, position.z);
    listener.setOrientation(
      cameraLookDirection.x,
      cameraLookDirection.y,
      cameraLookDirection.z,
      0,
      1,
      0
    );
  }
}

function sendSoundEvent(soundName, action = "play") {
  if (!multiplayer.connected || !multiplayer.room) return;
  try {
    multiplayer.room.send({ type: "sound", sound: soundName, action });
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "sound send failed");
  }
}

function emitSound(soundName) {
  playSpatialSound(soundName, player.pos);
  // Burger sounds are emitted by the server when it accepts a new Tool
  // token. Keep this local preview immediate, but do not let a client create
  // an unsynchronized burger sound event for everyone else.
  if (soundName !== "burger") sendSoundEvent(soundName);
}

function stopRemoteFootsteps(id) {
  const instance = remoteFootsteps.get(id);
  if (!instance) return;
  disposeSpatialAudio(instance);
  instance.audio.remove();
  remoteFootsteps.delete(id);
}

function startRemoteFootsteps(id, position) {
  if (!gamePresenceVisible) return;
  const existing = remoteFootsteps.get(id);
  if (existing) {
    setSpatialPosition(existing.panner, position);
    return;
  }
  const instance = createSpatialAudio("footsteps", position, true);
  if (!instance) return;
  remoteFootsteps.set(id, instance);
  instance.audio.play().catch(() => stopRemoteFootsteps(id));
}

function updateRemoteFootsteps() {
  for (const [id, instance] of remoteFootsteps) {
    const remote = multiplayer.remotePlayers.get(id);
    const state = multiplayer.latestStates.get(id);
    setSpatialPosition(instance.panner, remote?.group.position || state);
  }
}

function receiveSoundEvent(message) {
  if (!gamePresenceVisible || !message?.id || message.id === multiplayer.id) return;
  const position = {
    x: Number(message.x) || 0,
    y: Number(message.y) || 0,
    z: Number(message.z) || 0,
  };
  if (message.sound === "footsteps") {
    if (message.action === "start") startRemoteFootsteps(message.id, position);
    else if (message.action === "stop") stopRemoteFootsteps(message.id);
    return;
  }
  playSpatialSound(message.sound, position);
}

function syncRemoteFootstepsFromState(state) {
  if (!state?.id || state.id === multiplayer.id) return;
  const animation = state.animation || state.state;
  const isWalking = animation === "Walk" || animation === "Run";
  if (isWalking) {
    startRemoteFootsteps(state.id, state);
  } else {
    stopRemoteFootsteps(state.id);
  }
}

function applyNetworkPush(message) {
  const x = Number(message.x);
  const y = Number(message.y);
  const z = Number(message.z);
  const dx = Number(message.impulseX ?? message.dx) || 0;
  const dz = Number(message.impulseZ ?? message.dz) || 0;
  if (![x, y, z].every(Number.isFinite)) return;

  if (message.id === multiplayer.id) {
    stopLocalEmote();
    if (!playerCollisionsEnabled?.checked) return;
    // A push is an impulse, not a teleport. The server includes its current
    // position for other clients, but snapping the local player to that
    // position makes latency visible as a sudden jump. Let normal movement
    // integration carry the player and reconcile through later state packets.
    player.vel.x += THREE.MathUtils.clamp(dx, -5, 5);
    player.vel.z += THREE.MathUtils.clamp(dz, -5, 5);
    return;
  }

  const state = multiplayer.latestStates.get(message.id) || {
    id: message.id,
    username: "guest",
    facing: 0,
    state: "Idle",
  };
  multiplayer.latestStates.set(message.id, state);
  const remote = multiplayer.remotePlayers.get(message.id);
  if (remote) {
    stopRemoteEmote(remote);
    remote.networkVelocity.x += THREE.MathUtils.clamp(dx, -5, 5);
    remote.networkVelocity.z += THREE.MathUtils.clamp(dz, -5, 5);
  }
}

function updateFootsteps(shouldPlay) {
  if (shouldPlay) {
    if (!footstepsPlaying) {
      footstepsPlaying = true;
      sendSoundEvent("footsteps", "start");
    }
    if (!footstepsInstance) {
      footstepsInstance = createSpatialAudio("footsteps", player.pos, true);
      footstepsInstance?.audio.play().catch(() => {
        disposeSpatialAudio(footstepsInstance);
        footstepsInstance = null;
      });
    } else {
      setSpatialPosition(footstepsInstance.panner, player.pos);
    }
    return;
  }
  if (!footstepsPlaying && !footstepsInstance) return;
  footstepsPlaying = false;
  sendSoundEvent("footsteps", "stop");
  disposeSpatialAudio(footstepsInstance);
  footstepsInstance?.audio.remove();
  footstepsInstance = null;
}

function stopGameAudio() {
  updateFootsteps(false);
  for (const id of [...remoteFootsteps.keys()]) stopRemoteFootsteps(id);
  for (const instance of activeSpatialSounds) {
    disposeSpatialAudio(instance);
    instance.audio.remove();
  }
  activeSpatialSounds.clear();
  stopMusic();
  if (audioContext?.state === "running") audioContext.suspend().catch(() => {});
}

window.addEventListener("pointerdown", unlockGameAudio, { passive: true });
window.addEventListener("keydown", unlockGameAudio, { passive: true });

const player = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  onGround: true,
  facing: 0,
  // Roblox physics, converted (1 stud = 0.28m):
  speed: 10.08, // WalkSpeed 36 studs/s
  runSpeed: 3,
  // Derived from CONFIG.jumpPower above (75 → 21 studs/s).
  jumpSpeed: 28.0 * (CONFIG.jumpPower / 100),
  gravity: 54.93, // 196.2 studs/s^2
  halfWidth: 0.82,
  halfDepth: 0.68,
  height: 5,
  keys: {},
  state: "Idle",
  flyMode: false,
  flyNoclip: false,
  flySpeed: 13,
  airborneFromJump: false,
  fallTime: 0,
  fallingSoundPlayed: false,
  // Effective Roblox-style mass used for player-to-player push resistance.
  // 10 RMU is intentionally heavy enough that players do not slide away
  // from a light touch, while repeated movement can still push them.
  massRmu: 10,
  model: null,
  maxHealth: 100,
  health: 100,
  respawning: false,
  respawnTimer: null,
};

const PLAYER_PUSH_DISTANCE = 0.48;
const PLAYER_PUSH_COOLDOWN_MS = 140;
// One rounded, upright character collider is shared with server.js. It keeps
// corner contact smooth and makes the visible avatar's full height solid.
const PLAYER_COLLISION_HEIGHT = 3.5;
const PLAYER_COLLISION_RADIUS = 0.82;
const PLAYER_STEP_UP_HEIGHT = 0.8;
const PLAYER_COLLISION_WIDTH = PLAYER_COLLISION_RADIUS * 2;
const PLAYER_COLLISION_DEPTH = PLAYER_COLLISION_RADIUS * 2;
const PLAYER_HEAD_COLLISION_SIZE = 1;
const PLAYER_HEAD_COLLISION_OFFSET_Y = 1.5;
const PLAYER_COLLISION_CENTER_OFFSET = PLAYER_COLLISION_HEIGHT / 2;
const PLAYER_COLLISION_BOTTOM_OFFSET = 0;
const localPushCooldowns = new Map();
let localCollisionProxy = null;
let localLegCollisionProxy = null;
let localHeadCollisionProxy = null;
let collisionDebugVisible = false;
const collisionDebugMaterial = new THREE.MeshBasicMaterial({
  color: 0x27d9ff,
  wireframe: true,
  transparent: true,
  opacity: 0.9,
  depthTest: false,
  depthWrite: false,
});
const localCollisionCenter = new THREE.Vector3();
const collisionBoneWorldPosition = new THREE.Vector3();
const localCollisionQuaternion = new THREE.Quaternion();
let localCollisionRotationY = 0;

function refreshLocalCollisionTransform() {
  localCollisionCenter.set(
    player.pos.x,
    player.pos.y + PLAYER_COLLISION_CENTER_OFFSET,
    player.pos.z
  );
  localCollisionRotationY = player.facing;
  if (!player.model || !torsoBone) return;
  player.model.updateMatrixWorld(true);
  torsoBone.getWorldPosition(collisionBoneWorldPosition);
  localCollisionCenter.x = collisionBoneWorldPosition.x;
  localCollisionCenter.z = collisionBoneWorldPosition.z;
  // Keep the vertical collider anchored to the avatar root. Animation can
  // move the torso bone slightly, which otherwise creates a visible gap when
  // one player stands on another.
  localCollisionCenter.y = player.pos.y + PLAYER_COLLISION_CENTER_OFFSET;
  torsoBone.getWorldQuaternion(localCollisionQuaternion);
  localCollisionRotationY = Math.atan2(
    2 * (localCollisionQuaternion.w * localCollisionQuaternion.y + localCollisionQuaternion.x * localCollisionQuaternion.z),
    1 - 2 * (localCollisionQuaternion.y ** 2 + localCollisionQuaternion.z ** 2)
  );
}

function initializeLocalCollisionProxy() {
  if (localCollisionProxy) return;
  // The cylinder proxy represents the same full character volume used by the
  // server. The legacy lower/head proxies stay allocated for compatibility
  // with the debug cleanup path but are kept hidden.
  const collisionGeometry = new THREE.CylinderGeometry(
    PLAYER_COLLISION_RADIUS,
    PLAYER_COLLISION_RADIUS,
    PLAYER_COLLISION_HEIGHT,
    16
  );
  localCollisionProxy = new THREE.Mesh(
    collisionGeometry,
    collisionDebugMaterial
  );
  localLegCollisionProxy = new THREE.Mesh(collisionGeometry, collisionDebugMaterial);
  localHeadCollisionProxy = new THREE.Mesh(
    new THREE.BoxGeometry(
      PLAYER_HEAD_COLLISION_SIZE,
      PLAYER_HEAD_COLLISION_SIZE,
      PLAYER_HEAD_COLLISION_SIZE
    ),
    collisionDebugMaterial
  );
  localCollisionProxy.visible = false;
  localLegCollisionProxy.visible = false;
  localHeadCollisionProxy.visible = false;
  localCollisionProxy.castShadow = false;
  localCollisionProxy.receiveShadow = false;
  localLegCollisionProxy.castShadow = false;
  localLegCollisionProxy.receiveShadow = false;
  localHeadCollisionProxy.castShadow = false;
  localHeadCollisionProxy.receiveShadow = false;
  localCollisionProxy.userData.isPlayerCollisionProxy = true;
  localLegCollisionProxy.userData.isLocalLegCollisionDebug = true;
  localHeadCollisionProxy.userData.isLocalHeadCollisionDebug = true;
  scene.add(localCollisionProxy);
  scene.add(localLegCollisionProxy);
  scene.add(localHeadCollisionProxy);
}

function setCollisionDebugVisible(visible) {
  collisionDebugVisible = Boolean(visible);
  if (localCollisionProxy) localCollisionProxy.visible = collisionDebugVisible;
  for (const remote of multiplayer.remotePlayers.values()) {
    if (remote.collisionDebug) remote.collisionDebug.visible = collisionDebugVisible;
  }
}

function syncLocalCollisionProxy() {
  if (!localCollisionProxy) return;
  // The collision volume is centered on the avatar's torso, not at its feet.
  refreshLocalCollisionTransform();
  localCollisionProxy.position.copy(localCollisionCenter);
  localCollisionProxy.quaternion.copy(localCollisionQuaternion);
  if (!torsoBone) localCollisionProxy.rotation.y = localCollisionRotationY;
  if (localLegCollisionProxy) {
    localLegCollisionProxy.position.copy(localCollisionCenter);
    localLegCollisionProxy.quaternion.copy(localCollisionQuaternion);
    if (!torsoBone) localLegCollisionProxy.rotation.y = localCollisionRotationY;
    localLegCollisionProxy.visible = false;
  }
  if (localHeadCollisionProxy) {
    localHeadCollisionProxy.position.copy(localCollisionCenter);
    localHeadCollisionProxy.position.y += PLAYER_HEAD_COLLISION_OFFSET_Y;
    localHeadCollisionProxy.quaternion.copy(localCollisionQuaternion);
    if (!torsoBone) localHeadCollisionProxy.rotation.y = localCollisionRotationY;
    localHeadCollisionProxy.visible = false;
  }
}

initializeLocalCollisionProxy();

function startPlayerRespawn(spawn = { x: 0, y: 0, z: 0, facing: 0 }) {
  if (player.respawning) return;
  stopLocalEmote(false);
  player.respawning = true;
  player.respawnTimer = null;
  player.vel.set(0, 0, 0);
  player.onGround = true;
  player.airborneFromJump = false;
  player.fallTime = 0;
  player.fallingSoundPlayed = false;
  player.flyMode = false;
  player.flyNoclip = false;
  syncLocalAnimationPlayback();
  player.state = "Idle";
  updateFootsteps(false);
  resetMobileThumbstick();
  if (player.model) {
    player.model.position.copy(player.pos);
    player.model.rotation.set(0, player.facing, 0);
    player.model.visible = false;
  }
  if (localNametag) localNametag.hidden = true;
  adminFlyToggle?.setAttribute("aria-pressed", "false");
  if (adminFlyToggle) adminFlyToggle.textContent = "Enable fly";
  if (adminUnflyButton) adminUnflyButton.hidden = true;

  player.respawnTimer = window.setTimeout(() => {
    player.respawnTimer = null;
    player.pos.set(
      Number.isFinite(spawn.x) ? spawn.x : 0,
      Number.isFinite(spawn.y) ? spawn.y : 0,
      Number.isFinite(spawn.z) ? spawn.z : 0
    );
    player.facing = Number.isFinite(spawn.facing) ? spawn.facing : 0;
    player.vel.set(0, 0, 0);
    player.onGround = true;
    player.respawning = false;
    player.state = "Idle";
    applyAnimationImmediate("Idle");
    if (player.model) {
      player.model.position.copy(player.pos);
      player.model.rotation.y = player.facing;
      player.model.visible = gamePresenceVisible && !pendingScale;
    }
    multiplayer.lastSentAt = 0;
    sendMultiplayerState(Date.now());
  }, RESPAWN_DELAY_MS);
}

const mobileInput = {
  x: 0,
  y: 0,
  jumpQueued: false,
};

const deviceModePrompt = document.getElementById("device-mode-prompt");
const deviceModeMobile = document.getElementById("device-mode-mobile");
const deviceModeDesktop = document.getElementById("device-mode-desktop");

function chooseDeviceMode(isMobile) {
  document.documentElement.classList.toggle("is-mobile", isMobile);
  window.dispatchEvent(new Event("webblox:device-mode-changed"));
  deviceModePrompt.hidden = true;
  deviceModePrompt.setAttribute("aria-hidden", "true");
}

deviceModeMobile.addEventListener("click", () => chooseDeviceMode(true));
deviceModeDesktop.addEventListener("click", () => chooseDeviceMode(false));

const mobileThumbstickFrame = document.getElementById("mobile-dynamic-thumbstick-frame");
const mobileThumbstickHitArea = document.getElementById("mobile-thumbstick-hit-area");
const mobileThumbstickStart = document.getElementById("mobile-thumbstick-start");
const mobileThumbstickEnd = document.getElementById("mobile-thumbstick-end");
const mobileJump = document.getElementById("mobile-jump");
let mobileThumbstickPointerId = null;

function resetMobileThumbstick() {
  mobileThumbstickPointerId = null;
  mobileInput.x = 0;
  mobileInput.y = 0;
  mobileThumbstickEnd.style.left = "";
  mobileThumbstickEnd.style.top = "";
}

function updateMobileThumbstick(event) {
  const startRect = mobileThumbstickStart.getBoundingClientRect();
  const centerX = startRect.left + startRect.width / 2;
  const centerY = startRect.top + startRect.height / 2;
  const maxDistance = (startRect.width - mobileThumbstickEnd.offsetWidth) / 2;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const distance = Math.hypot(dx, dy);
  if (distance > maxDistance) {
    const scale = maxDistance / distance;
    dx *= scale;
    dy *= scale;
  }
  mobileInput.x = dx / maxDistance;
  mobileInput.y = dy / maxDistance;
  const frameRect = mobileThumbstickFrame.getBoundingClientRect();
  mobileThumbstickEnd.style.left = `${centerX - frameRect.left + dx}px`;
  mobileThumbstickEnd.style.top = `${centerY - frameRect.top + dy}px`;
}

mobileThumbstickHitArea.addEventListener("pointerdown", (event) => {
  if (mobileThumbstickPointerId !== null) return;
  event.preventDefault();
  mobileThumbstickPointerId = event.pointerId;
  mobileThumbstickHitArea.setPointerCapture(event.pointerId);
  updateMobileThumbstick(event);
});

mobileThumbstickHitArea.addEventListener("pointermove", (event) => {
  if (event.pointerId !== mobileThumbstickPointerId) return;
  event.preventDefault();
  updateMobileThumbstick(event);
});

function releaseMobileThumbstick(event) {
  if (event?.pointerId !== mobileThumbstickPointerId) return;
  if (mobileThumbstickHitArea.hasPointerCapture(event.pointerId)) {
    mobileThumbstickHitArea.releasePointerCapture(event.pointerId);
  }
  resetMobileThumbstick();
}

mobileThumbstickHitArea.addEventListener("pointerup", releaseMobileThumbstick);
mobileThumbstickHitArea.addEventListener("pointercancel", releaseMobileThumbstick);

mobileJump.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  mobileInput.jumpQueued = true;
  mobileJump.classList.add("is-pressed");
  mobileJump.setPointerCapture(event.pointerId);
});

function releaseMobileJump(event) {
  if (mobileJump.hasPointerCapture(event.pointerId)) {
    mobileJump.releasePointerCapture(event.pointerId);
  }
  mobileJump.classList.remove("is-pressed");
}

mobileJump.addEventListener("pointerup", releaseMobileJump);
mobileJump.addEventListener("pointercancel", releaseMobileJump);

// Animation clips from the GLB
const ANIM_MAP = {
  Idle: "R6Armature|Idle",
  Walk: "R6Armature|WalkAnim",
  Run: "R6Armature|RunAnim",
  Jump: "R6Armature|Jump",
  Fall: "R6Armature|Fall",
};
const BLEND = 0.28;

let mixer = null;
let actions = {};
let r6Mixer = null;
let r6Actions = {};
let currentAction = null;
let currentName = null;
let avatarAnimationLocked = false;
let avatarCameraLocked = false;
let avatarCameraLockSnapshot = null;
let modelRoot = null;
let avatarClips = [];
let r6ModelRoot = null;
let r15ModelRoot = null;
let r15AnimationData = null;
let activeRigType = "r6";
let r15LoadPromise = null;
let r15RemoteLoadRequested = false;
let r15RemoteLoadFailed = false;
let r6TextureSourceImage = null;
let r15TextureSourceImage = null;
const avatarRigButtons = [...document.querySelectorAll("[data-avatar-rig]")];
try {
  activeRigType = localStorage.getItem("webbox_avatar_rig") === "r15" ? "r15" : "r6";
} catch { /* use the R6 default */ }
for (const button of avatarRigButtons) {
  button.classList.toggle("active", button.dataset.avatarRig === activeRigType);
}
function ensureR15AssetsLoaded() {
  if (r15ModelRoot) return Promise.resolve(r15ModelRoot);
  if (r15LoadPromise) return r15LoadPromise;
  // Keep the R6 game path independent from the optional R15 assets. A broken
  // or slow FBX request must never stop the base game from rendering.
  r15LoadPromise = Promise.all([
    loadR15Avatar("uploads/RobloxR15Rigged.fbx", "uploads/avatar-template__2_.png"),
    fetch("uploads/r15-animations.json").then((response) => response.ok ? response.json() : null),
  ]).then(([root, animations]) => {
    r15ModelRoot = root;
    r15AnimationData = animations || {};
    installR15AnimationData(root, r15AnimationData);
    r15TextureSourceImage = root.userData.r15TextureImage || null;
    for (const material of getR15BodyMaterials(root)) {
      avatarLocalMaterials.push(material);
      registerEditableMaterial(material);
    }
    applyMaterialSettings();
    if (activeRigType === "r15" && r6ModelRoot) {
      void switchAvatarRig("r15").catch((error) => console.warn("Could not activate R15 avatar", error));
    }
    return root;
  }).catch((error) => {
    console.warn("R15 avatar unavailable", error);
    r15LoadPromise = null;
    return null;
  });
  return r15LoadPromise;
}

// A player can be using R6 locally while another player is using R15. In that
// case the local rig setup above never requests the optional R15 asset, so a
// remote R15 would otherwise fall back to an R6 clone forever. Load it on
// demand for remote states as well, then replay the latest snapshot so the
// remote is rebuilt with the correct rig and appearance.
function ensureRemoteR15AssetsLoaded() {
  if (r15ModelRoot || r15RemoteLoadRequested || r15RemoteLoadFailed) return;
  r15RemoteLoadRequested = true;
  void ensureR15AssetsLoaded().then((root) => {
    r15RemoteLoadRequested = false;
    if (!root) {
      r15RemoteLoadFailed = true;
      return;
    }
    if (typeof multiplayer === "undefined" || !multiplayer.latestStates.size) return;
    applyMultiplayerSnapshot({ players: [...multiplayer.latestStates.values()] });
  }).catch((error) => {
    r15RemoteLoadRequested = false;
    r15RemoteLoadFailed = true;
    console.warn("Remote R15 avatar unavailable", error);
  });
}
const BURGER_ITEM_ID = "cheezburger";
const BURGER_HEAL_AMOUNT = 1.6;
const BURGER_USE_DELAY = 0.8;
// Exact value from burger.rbxm/SandwichScript.lua, with GripPos.Z inverted
// for the imported hand frame as requested.
const BURGER_GRIP_POSITION = new THREE.Vector3(0.5, -0.6, 1.5);
// burger.rbxm/SandwichScript.lua:
// Tool.GripForward = Vector3.new(-.981, .196, 0)
// Roblox exposes GripForward as the R02/R12/R22 column of the grip CFrame.
// Keep that column as Three.js +Z. Do not negate it: the previous negation
// made the forward/back direction of the eating grip opposite to Roblox.
const BURGER_GRIP_FORWARD = new THREE.Vector3(-0.981, 0.196, 0);
// Explicit Three.js equivalent of the activated Roblox GripRight. Roblox's
// source uses (0, 0, -1); the imported hand frame uses the opposite sign so
// this is kept as +Z when rebuilding the basis below.
const BURGER_GRIP_RIGHT = new THREE.Vector3(0, 0, 1);
// The .rbxm starts with the default identity grip and changes to the values
// above only inside Tool.Activated.
const BURGER_DEFAULT_GRIP_POSITION = new THREE.Vector3(0, 0, 0);
const BURGER_DEFAULT_GRIP_FORWARD = new THREE.Vector3(0, 0, 1);
const BURGER_DEFAULT_GRIP_RIGHT = new THREE.Vector3(1, 0, 0);
// Server-provided grip offsets. These defaults match the room authority until
// the welcome packet supplies the same values explicitly.
let burgerGrip1YawOffset = THREE.MathUtils.degToRad(-30);
let burgerGrip2YawOffset = -Math.PI * 3 / 4;
const burgerGrip1PositionOffset = BURGER_DEFAULT_GRIP_POSITION.clone();
const burgerGrip2PositionOffset = new THREE.Vector3(1, -0.6, 0.8);
let serverBurgerGripSettings = {
  grip1: { rotation: -30, x: 0, y: 0, z: 0 },
  grip2: { rotation: -135, x: 1, y: -0.6, z: 0.8 },
};
// The end-of-arm bone still inherits the imported armature's -90° X axis
// conversion. Compensate that once when converting the Roblox grip into the
// Three.js bone frame; without it local +Y becomes depth and the burger lies
// flat. This is independent from GripForward's front/back direction.
const BURGER_RIG_AXIS_CORRECTION = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2
);
let burgerGeometry = null;
let burgerTexture = null;
let burgerAssetPromise = null;
let burgerUseEnabled = true;
let burgerGripActive = false;
let burgerUseToken = 0;
let burgerGroup = null;
// The remote avatars are cloned from the local rig, which may already be in a
// walk/jump pose by the time another player joins. Keep the untouched bone
// pose so an animation clip that omits a track (Idle omits leg rotations) does
// not inherit the local player's current limb rotation.
let avatarBindPose = null;
// The uniform scale factor the LOCAL avatar settled at (modelRoot.scale) so it
// stands exactly 5 studs tall. Remote clones use this same factor instead of
// re-measuring with a bounding box, which can include head/hair/tool extents
// and leave remote players visibly shorter (or taller) than the local one.
// 0 = not yet established (scalePlayerToStuds hasn't run).
let localAvatarScale = 0;
const REMOTE_IDLE_LEG_BONES = ["Left Leg_04", "Right Leg_05"];
const EMOTE_BONE_MAP = {
  "Torso": "Torso_00",
  "Head": "Head_01",
  "Left Arm": "Left Arm_02",
  "Right Arm": "Right Arm_03",
  "Left Leg": "Left Leg_04",
  "Right Leg": "Right Leg_05",
};

// Emote data is authored in the canonical Roblox bone frame; this GLB imports
// its bones axis-aligned to the world, so a pose meant to spin "forward" shows
// up spinning "to the side". The two frames differ by a fixed 90° rotation
// around the model's vertical axis. EMOTE_TO_R6 is that basis change; we apply
// it as a true change-of-basis (conjugation), which rotates every pose onto
// the correct axis WITHOUT scaling or translating the bones.
const EMOTE_TO_R6_YAW = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const EMOTE_TO_R6_YAW_INV = EMOTE_TO_R6_YAW.clone().conjugate();

function captureAvatarBindPose(root) {
  if (!root) return null;
  const bindPose = new Map();
  root.traverse((object) => {
    if (!object.isBone) return;
    bindPose.set(object.name, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    });
  });
  return bindPose;
}

function restoreAvatarBindPose(root, bindPose) {
  if (!root || !bindPose) return;
  root.traverse((object) => {
    if (!object.isBone) return;
    const bind = bindPose.get(object.name);
    if (!bind) return;
    object.position.copy(bind.position);
    object.quaternion.copy(bind.quaternion);
  });
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isSkinnedMesh) object.skeleton.update();
  });
}

function restoreRemoteIdleLegPose(remote) {
  if (!remote?.model || !avatarBindPose) return;
  let changed = false;
  for (const boneName of REMOTE_IDLE_LEG_BONES) {
    const bind = avatarBindPose.get(boneName);
    const bone = remote.model.getObjectByName?.(boneName);
    if (!bind || !bone) continue;
    bone.quaternion.copy(bind.quaternion);
    bone.updateMatrix();
    changed = true;
  }
  if (!changed) return;
  remote.model.updateMatrixWorld(true);
  remote.model.traverse((object) => {
    if (object.isSkinnedMesh) object.skeleton.update();
  });
}
let emoteClips = new Map();
let emoteAssets = null;
let pendingLocalEmote = null;
let activeLocalEmote = null;
let toolAnimClip = null;
let activeToolAnimation = null;
let toolAnimPending = false;
let toolAnimToken = 0;

function parseRbxmxAnimation(xmlText) {
  if (typeof xmlText !== "string" || !xmlText.trim() || typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (document.querySelector("parsererror")) return null;
  const sequence = document.querySelector('Item[class="KeyframeSequence"]');
  if (!sequence) return null;
  const numberFrom = (parent, tagName, attributeName = null) => {
    const node = [...(parent?.children || [])].find((child) =>
      child.tagName === tagName && (!attributeName || child.getAttribute("name") === attributeName)
    );
    return Number(node?.textContent || 0);
  };
  const stringFrom = (parent, tagName, attributeName) => {
    const node = [...(parent?.children || [])].find((child) =>
      child.tagName === tagName && child.getAttribute("name") === attributeName
    );
    return String(node?.textContent || "").trim();
  };
  const frames = [...sequence.querySelectorAll('Item[class="Keyframe"]')]
    .map((keyframe) => {
      const properties = [...keyframe.children].find((child) => child.tagName === "Properties");
      const time = numberFrom(properties, "float", "Time");
      const poses = [];
      for (const poseItem of keyframe.querySelectorAll('Item[class="Pose"]')) {
        const poseProperties = [...poseItem.children].find((child) => child.tagName === "Properties");
        const sourceBone = stringFrom(poseProperties, "string", "Name");
        if (!EMOTE_BONE_MAP[sourceBone]) continue;
        const cframe = [...(poseProperties?.children || [])].find((child) =>
          child.tagName === "CoordinateFrame" && child.getAttribute("name") === "CFrame"
        );
        if (!cframe) continue;
        const matrix = new THREE.Matrix4().set(
          numberFrom(cframe, "R00"), numberFrom(cframe, "R01"), numberFrom(cframe, "R02"), 0,
          numberFrom(cframe, "R10"), numberFrom(cframe, "R11"), numberFrom(cframe, "R12"), 0,
          numberFrom(cframe, "R20"), numberFrom(cframe, "R21"), numberFrom(cframe, "R22"), 0,
          0, 0, 0, 1
        );
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
        poses.push([
          sourceBone,
          numberFrom(cframe, "X"),
          numberFrom(cframe, "Y"),
          numberFrom(cframe, "Z"),
          quaternion.x,
          quaternion.y,
          quaternion.z,
          quaternion.w,
        ]);
      }
      return [time, poses];
    })
    .filter((frame) => Number.isFinite(frame[0]))
    .sort((a, b) => a[0] - b[0]);
  if (!frames.length) return null;
  return {
    name: "Point",
    loop: false,
    duration: Math.max(0.001, Number(frames[frames.length - 1][0]) || 0.001),
    frames,
  };
}

const emoteLibraryPromise = Promise.all([
  fetch("uploads/emotes.json").then((response) => response.ok ? response.json() : {}),
  fetch("uploads/128853357.rbxmx").then((response) => response.ok ? response.text() : ""),
])
  .then(([assets, pointXml]) => {
    const point = parseRbxmxAnimation(pointXml);
    return point ? { ...assets, Point: point } : assets;
  })
  .catch((error) => {
    console.warn("Emote animation data unavailable", error);
    return null;
  });

function captureEmoteBindPose(root) {
  if (!root) return;
  root.updateMatrixWorld(true);
  const rootWorldQuaternion = new THREE.Quaternion();
  root.getWorldQuaternion(rootWorldQuaternion);
  const bindPose = new Map();
  for (const boneName of Object.values(EMOTE_BONE_MAP)) {
    let bone = root.getObjectByName?.(boneName);
    if (!bone) {
      const normalizedName = boneName.replace(/[^a-z0-9]/gi, "").toLowerCase();
      root.traverse((object) => {
        if (!bone && object.isBone && String(object.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase() === normalizedName) {
          bone = object;
        }
      });
    }
    if (!bone) continue;
    const parentWorldQuaternion = new THREE.Quaternion();
    bone.parent?.getWorldQuaternion(parentWorldQuaternion);
    const parentQuaternion = rootWorldQuaternion.clone()
      .invert()
      .multiply(parentWorldQuaternion)
      .normalize();
    bindPose.set(boneName, {
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      parentQuaternion,
      parentInverseQuaternion: parentQuaternion.clone().invert(),
    });
  }
  root.userData.emoteBindPose = bindPose;
}

function restoreEmoteBindPose(root) {
  const bindPose = root?.userData?.emoteBindPose;
  if (!root || !bindPose) return;
  for (const { bone, position, quaternion } of bindPose.values()) {
    if (!bone) continue;
    bone.position.copy(position);
    bone.quaternion.copy(quaternion);
    bone.updateMatrix();
    bone.matrixWorldNeedsUpdate = true;
  }
  root.parent?.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isSkinnedMesh) object.skeleton.update();
  });
}

function getEmotePoseSeries(asset, sourceBone) {
  if (!asset?._poseSeries) asset._poseSeries = {};
  if (asset._poseSeries[sourceBone]) return asset._poseSeries[sourceBone];
  const series = [];
  for (const frame of asset.frames || []) {
    const pose = (Array.isArray(frame?.[1]) ? frame[1] : [])
      .find((entry) => entry?.[0] === sourceBone);
    if (pose) series.push({ time: Number(frame[0]) || 0, pose });
  }
  asset._poseSeries[sourceBone] = series;
  return series;
}

function applyEmotePose(root, asset, time) {
  if (!root || !asset) return;
  const bindPose = root.userData?.emoteBindPose;
  if (!bindPose) return;

  const posePosition = new THREE.Vector3();
  const poseQuaternion = new THREE.Quaternion();
  const nextQuaternion = new THREE.Quaternion();
  for (const [sourceBone, boneName] of Object.entries(EMOTE_BONE_MAP)) {
    const bind = bindPose.get(boneName);
    const bone = bind?.bone;
    const series = getEmotePoseSeries(asset, sourceBone);
    if (!bind || !bone || !series.length) continue;

    // Find the two keyframes that bracket the current time and blend between
    // them. Each `pose` entry is [x, y, z, qx, qy, qz, qw].
    let from = series[0];
    let to = series[series.length - 1];
    for (let i = 1; i < series.length; i++) {
      if (series[i].time >= time) {
        to = series[i];
        from = series[i - 1];
        break;
      }
    }
    const span = to.time - from.time;
    const alpha = span > 0 ? THREE.MathUtils.clamp((time - from.time) / span, 0, 1) : 0;
    const fromPose = from.pose;
    const toPose = to.pose;

    posePosition.set(
      THREE.MathUtils.lerp(Number(fromPose[1]) || 0, Number(toPose[1]) || 0, alpha),
      THREE.MathUtils.lerp(Number(fromPose[2]) || 0, Number(toPose[2]) || 0, alpha),
      THREE.MathUtils.lerp(Number(fromPose[3]) || 0, Number(toPose[3]) || 0, alpha)
    );
    poseQuaternion.set(
      Number(fromPose[4]) || 0,
      Number(fromPose[5]) || 0,
      Number(fromPose[6]) || 0,
      Number(fromPose[7]) || 1
    ).normalize();
    nextQuaternion.set(
      Number(toPose[4]) || 0,
      Number(toPose[5]) || 0,
      Number(toPose[6]) || 0,
      Number(toPose[7]) || 1
    ).normalize();
poseQuaternion.slerp(nextQuaternion, alpha);

// Change of basis into the yawed rig frame (rotation only).
    poseQuaternion.premultiply(EMOTE_TO_R6_YAW).multiply(EMOTE_TO_R6_YAW_INV).normalize();

    // LEFT/right mirror for the limbs only: makes the left arm sweep opposite
    // to the right arm. Only the rotation is flipped — position untouched.
    if (sourceBone === "Left Arm" || sourceBone === "Left Leg") {
      poseQuaternion.z = -poseQuaternion.z;
      poseQuaternion.normalize();
    }

    // Pose.CFrame is the canonical Motor6D.Transform offset in the bone's own
    // rest orientation — one accumulated quaternion. This matches how the
    // working R15 rig applies poses (r15-avatar.js applyPose).
    bone.position.copy(bind.position).add(posePosition);
    bone.quaternion.copy(bind.quaternion).multiply(poseQuaternion).normalize();
    bone.updateMatrix();
    bone.matrixWorldNeedsUpdate = true;
  }

  // SkinnedMesh reads the skeleton matrices during render. Force the complete
  // bone hierarchy to refresh after the direct pose write so child arm/leg
  // bones do not remain visually attached to the previous torso matrix.
  root.parent?.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isSkinnedMesh) object.skeleton.update();
  });
}

function updateLocalEmote(dt) {
  if (activeLocalEmote?.r15 || !activeLocalEmote || !emoteAssets) return;
  const asset = emoteAssets[activeLocalEmote.name];
  if (!asset) return;
  const duration = Math.max(0.001, Number(asset.duration) || 0.001);
  activeLocalEmote.elapsed += dt;
  if (!activeLocalEmote.looping && activeLocalEmote.elapsed >= duration) {
    stopLocalEmote(true);
    return;
  }
  const time = activeLocalEmote.looping
    ? activeLocalEmote.elapsed % duration
    : Math.min(activeLocalEmote.elapsed, duration);
  applyEmotePose(modelRoot, asset, time);
}

function updateRemoteEmote(remote, dt) {
  if (remote?.r15) {
    if (!remote.emoteAction || !r15AnimationData) return;
    const finished = updateR15Animation(remote.model, dt);
    if (finished) stopRemoteEmote(remote);
    return;
  }
  if (!remote?.emoteAction || !emoteAssets) return;
  const asset = emoteAssets[remote.emoteName];
  if (!asset) return;
  const duration = Math.max(0.001, Number(asset.duration) || 0.001);
  remote.emoteElapsed = (remote.emoteElapsed || 0) + dt;
  if (!remote.emoteName.startsWith("Dance") && remote.emoteElapsed >= duration) {
    stopRemoteEmote(remote);
    return;
  }
  const time = remote.emoteName.startsWith("Dance")
    ? remote.emoteElapsed % duration
    : Math.min(remote.emoteElapsed, duration);
  applyEmotePose(remote.model, asset, time);
}
let skinnedMesh = null;
let headBone = null;
let torsoBone = null;
const avatarTextureMaterials = [];
const avatarLocalMaterials = [];
// Hat/hair materials attached to the LOCAL avatar (player.model). They are not
// part of avatarLocalMaterials, so the camera-zoom fade that hides the body
// never touched them. Track them so a zoomed camera hides the hat/hair the
// same way it hides the torso and head.
const localHatMaterials = [];
const avatarBaseMaps = new Map();
let avatarTextureSourceImage = null;
let avatarEditorTexture = null;
let avatarEditorOpaqueCanvas = null;
let localForcedAvatarTexture = null;
// A stable snapshot of the last successfully applied avatar image. Used to
// reseed the editor on reopen so an edit never silently reverts to the model's
// original map (which forced the user to re-apply to make the change stick).
let appliedAvatarImage = null;
// URL represented by the editor history. Once an upload is published, opening
// the editor again must keep that history instead of replacing it with a new
// one-item snapshot that makes Undo unavailable.
let avatarEditorHistorySource = "";
let avatarEditorReady = false;
let avatarTexturePublishPending = false;
const staticHeadOffset = new THREE.Vector3(0, 4.25, 0);

// Set when the parent frame asks to join as a guest. The guest identity is
// server-authoritative: this flag only makes the client ask the server to
// downgrade the connection, then trust whatever identity the server returns.
let guestModeRequested = false;
// The last "Guest <number>" username the server assigned when it confirmed the
// downgrade. Held so a stray normal welcome (from a reconnect or a second
// room/socket) cannot flip the player back to their signed-in identity.
let confirmedGuestUsername = "";
// Local guest number used only when the server has not yet confirmed its own
// "Guest N". Gives the guest a stable number to show in their own UI until the
// server assigns the authoritative one. Never sent as a name to the server.
let localGuestNumber = 0;
// Timer that keeps re-asking the server for the guest downgrade until it
// confirms, so a reconnect or a slow handshake cannot leave the player
// stuck in their signed-in identity while "Play as a Guest" is active.
let guestRetryTimer = null;
function scheduleGuestRetry() {
  // Nothing to do here anymore — the wantGuest flag rides on every state
  // packet the client already sends, so the downgrade request reaches the
  // server reliably without this timer. The welcome handler confirms.
  // (Kept as a no-op hook to avoid touching call sites; confirmation stops
  // the flag in sendMultiplayerState automatically.)
}

const multiplayer = {
  room: null,
  id: null,
  username: "guest",
  isGuest: false,
  identityResolved: false,
  isAdmin: false,
  avatarUrl: null,
  avatarPreview: null,
  customHat: null,
  customHats: [],
  connected: false,
  ready: false,
  remotePlayers: new Map(),
  latestStates: new Map(),
  lastSnapshotAt: 0,
  snapshotReceived: false,
  snapshotWatchdogAt: 0,
  lastTeleportRevision: 0,
  lastSentAt: 0,
  reconnectTimer: null,
  reconnectScheduledAt: 0,
  reconnectAttempt: 0,
  reconnectPending: false,
  transportReconnecting: false,
  handshakeTimer: null,
  connecting: false,
  connectAttemptAt: 0,
  connectGeneration: 0,
  preferLocalSocket: false,
  intentionalClose: false,
  pageClosing: false,
  permanentlyDisconnected: false,
  emoteToken: 0,
  pendingEmote: null,
  pendingChatMessages: [],
  pendingChatFlushTimer: null,
};

// The game document stays mounted inside the home iframe, but the room is
// joined only after the iframe receives `enter-game`. This prevents a hidden
// connection attempt from blocking the real game/reconnect attempt.
let gamePresenceVisible = window.parent === window;

  const usernameScreen = document.getElementById("username-screen");
  const usernameForm = document.getElementById("username-form");
  const usernameInput = document.getElementById("username-input");
  const usernameError = document.getElementById("username-error");
  const loadingScreen = document.getElementById("game-loading-screen");
  const disconnectScreen = document.getElementById("game-disconnect-screen");
const loadingTitle = document.getElementById("game-loading-title");
const loadingCreator = document.getElementById("game-loading-creator");
const loadingPlaceIcon = document.getElementById("game-loading-place-icon");
const loadingMessage = document.getElementById("game-loading-message");
const loadingCancel = document.getElementById("game-loading-cancel");
const disconnectTitle = document.getElementById("disconnect-title");
const disconnectMessage = document.getElementById("disconnect-message");
const disconnectReconnect = document.getElementById("disconnect-reconnect");
const disconnectLeave = document.getElementById("disconnect-leave");
let loadingTimeout = null;
let loadingFinishTimer = null;
let loadingStartedAt = 0;
let loadingActive = false;
  const MIN_LOADING_TIME_MS = 3000;
  const CONNECTION_TIMEOUT_MS = 30000;
  let usernameChosen = false;
  let requestedUsername = "";

  function showUsernameScreen() {
    if (!usernameScreen || usernameChosen) return;
    hideConnectionScreen(loadingScreen);
    hideConnectionScreen(disconnectScreen);
    usernameScreen.hidden = false;
    usernameScreen.classList.remove("is-fading");
    window.setTimeout(() => usernameInput?.focus(), 0);
  }

  function normalizeUsername(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  window.addEventListener("webblox:username-chosen", (event) => {
    const nextUsername = normalizeUsername(event.detail?.username);
    if (!/^[A-Za-z0-9 _-]{3,20}$/.test(nextUsername)) return;
    requestedUsername = nextUsername;
    usernameChosen = true;
    multiplayer.username = requestedUsername;
    hideConnectionScreen(usernameScreen);
    showLoadingScreen();
    connectMultiplayer({ force: true });
  });

  usernameForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextUsername = normalizeUsername(usernameInput?.value);
    if (!/^[A-Za-z0-9 _-]{3,20}$/.test(nextUsername)) {
      if (usernameError) {
        usernameError.textContent = "Use 3–20 letters, numbers, spaces, dashes, or underscores.";
        usernameError.hidden = false;
      }
      usernameInput?.focus();
      return;
    }
    requestedUsername = nextUsername;
    usernameChosen = true;
    multiplayer.username = requestedUsername;
    if (usernameError) usernameError.hidden = true;
    hideConnectionScreen(usernameScreen);
    showLoadingScreen();
    connectMultiplayer({ force: true });
  });

const loadingTextTargets = [
  // TextScaled can exceed TextSize in the Roblox export, but these ceilings
  // preserve the original loading screen's proportions instead of letting
  // the browser choose an oversized viewport-dependent heading.
  [loadingTitle, 56],
  [loadingCreator, 30],
  [loadingMessage, 30],
];

const loadingTextMeasure = document.createElement("div");
loadingTextMeasure.setAttribute("aria-hidden", "true");
Object.assign(loadingTextMeasure.style, {
  position: "fixed",
  top: "-10000px",
  left: "-10000px",
  visibility: "hidden",
  pointerEvents: "none",
  display: "block",
  overflow: "visible",
});
document.body.appendChild(loadingTextMeasure);

function loadingTextFits(element, size) {
  const styles = getComputedStyle(element);
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!width || !height) return false;
  Object.assign(loadingTextMeasure.style, {
    width: `${width}px`,
    height: "auto",
    maxWidth: "none",
    maxHeight: "none",
    boxSizing: "border-box",
    padding: styles.padding,
    fontFamily: styles.fontFamily,
    fontWeight: styles.fontWeight,
    fontStyle: styles.fontStyle,
    letterSpacing: styles.letterSpacing,
    wordSpacing: styles.wordSpacing,
    lineHeight: styles.lineHeight,
    whiteSpace: styles.whiteSpace,
    overflowWrap: styles.overflowWrap,
    wordBreak: styles.wordBreak,
    fontSize: `${size}px`,
  });
  loadingTextMeasure.textContent = element.textContent || "";
  return loadingTextMeasure.scrollWidth <= width + 1
    && loadingTextMeasure.scrollHeight <= height + 1;
}

function fitLoadingTextScaled() {
  for (const [element, maximumSize] of loadingTextTargets) {
    if (!element || !element.clientWidth || !element.clientHeight) continue;
    // Match Roblox TextScaled against the actual TextLabel box, including its
    // padding and wrapping, instead of measuring the flex item's scroll area.
    let size = maximumSize;
    while (size > 6 && !loadingTextFits(element, size)) {
      size -= 0.5;
    }
    element.style.fontSize = `${size}px`;
  }
}

function loadingSpinnerEasing(value) {
  let t = value * 2;
  if (t < 1) return 0.5 * t * t * t;
  t -= 2;
  return 0.5 * (t * t * t + 2);
}

function animateLoadingSpinner(now) {
  if (loadingSpinner) {
    const cycleTime = 2;
    const timeInCycle = (now / 1000) % cycleTime;
    const cycleAlpha = loadingSpinnerEasing(timeInCycle / cycleTime);
    loadingSpinner.style.transform = `rotate(${cycleAlpha * 360}deg)`;
  }
  window.requestAnimationFrame(animateLoadingSpinner);
}

const loadingSpinner = document.getElementById("game-loading-spinner");
window.requestAnimationFrame(animateLoadingSpinner);
if (window.ResizeObserver) {
  const loadingTextObserver = new ResizeObserver(fitLoadingTextScaled);
  loadingTextTargets.forEach(([element]) => element && loadingTextObserver.observe(element));
}
if (document.fonts?.ready) document.fonts.ready.then(fitLoadingTextScaled).catch(() => {});

function clearLoadingTimeout() {
  if (loadingTimeout) {
    window.clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
  if (loadingFinishTimer) {
    window.clearTimeout(loadingFinishTimer);
    loadingFinishTimer = null;
  }
}

function hideConnectionScreen(screen) {
  if (!screen) return;
  screen.hidden = true;
  screen.classList.remove("is-fading");
}

function fadeOutConnectionScreen(screen, onComplete) {
  if (!screen || screen.hidden) {
    onComplete?.();
    return;
  }
  screen.classList.add("is-fading");
  window.setTimeout(() => {
    hideConnectionScreen(screen);
    onComplete?.();
  }, 700);
}

function applyLoadingContext(context = {}) {
  const title = String(context.title || "Baseplate").trim() || "Baseplate";
  const creator = String(context.creator || "by hardcore").trim() || "by hardcore";
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingCreator) loadingCreator.textContent = creator;
  if (loadingPlaceIcon && typeof context.iconUrl === "string" && context.iconUrl.trim()) {
    loadingPlaceIcon.src = context.iconUrl;
    loadingPlaceIcon.alt = title;
  }
  fitLoadingTextScaled();
}

function finishLoadingScreen(message = "") {
  clearLoadingTimeout();
  const remaining = Math.max(0, MIN_LOADING_TIME_MS - (performance.now() - loadingStartedAt));
  if (remaining > 0) {
    if (loadingFinishTimer) window.clearTimeout(loadingFinishTimer);
    loadingFinishTimer = window.setTimeout(() => {
      loadingFinishTimer = null;
      finishLoadingScreen(message);
    }, remaining);
    return;
  }
  loadingActive = false;
  if (loadingMessage && message) loadingMessage.textContent = message;
  fadeOutConnectionScreen(loadingScreen);
}

function showLoadingScreen(context = {}) {
  applyLoadingContext(context);
  hideConnectionScreen(disconnectScreen);
  if (!loadingScreen) return;
  loadingActive = true;
  loadingStartedAt = performance.now();
  loadingScreen.hidden = false;
  loadingScreen.classList.remove("is-fading");
  if (loadingMessage) loadingMessage.textContent = "Joining server...";
  window.requestAnimationFrame(fitLoadingTextScaled);
  clearLoadingTimeout();
  // A connection is complete only after the server sends both welcome and
  // its current room snapshot. Never leave a dead connection behind a spinner.
  loadingTimeout = window.setTimeout(() => {
    loadingTimeout = null;
    if (multiplayer.ready && multiplayer.snapshotReceived) {
      finishLoadingScreen();
      return;
    }
    const activeRoom = multiplayer.room;
    if (activeRoom) {
      handleMultiplayerDisconnect(activeRoom, "loading timeout");
      return;
    }
    multiplayer.connectGeneration += 1;
    multiplayer.connecting = false;
    multiplayer.connectAttemptAt = 0;
    showDisconnectScreen({ message: "Unable to connect to the server.\n(Error Code:277)" });
    scheduleMultiplayerReconnect("loading timeout");
  }, CONNECTION_TIMEOUT_MS);
  if (multiplayer.ready && multiplayer.snapshotReceived && player.model && !pendingScale) {
    window.setTimeout(() => {
      if (loadingActive) finishLoadingScreen();
    }, 0);
  }
}

function showDisconnectScreen({ message = "Please check your internet connection and try again.\n(Error Code:277)", kicked = false } = {}) {
  clearLoadingTimeout();
  loadingActive = false;
  hideConnectionScreen(loadingScreen);
  if (!disconnectScreen) return;
  disconnectScreen.classList.toggle("is-kick", kicked);
  if (disconnectTitle) disconnectTitle.textContent = "Disconnected";
  if (disconnectMessage) disconnectMessage.textContent = message;
  if (disconnectReconnect) disconnectReconnect.hidden = kicked;
  disconnectScreen.hidden = false;
  disconnectScreen.classList.remove("is-fading");
}

function leaveToHomepage() {
  hideConnectionScreen(loadingScreen);
  hideConnectionScreen(disconnectScreen);
  if (window.parent !== window) {
    window.parent.postMessage({ type: "webblox:leave-game" }, "*");
  } else {
    window.location.href = "index.html";
  }
}

function reconnectFromDisconnectScreen() {
  if (multiplayer.pageClosing) return;

  // Discovery embeds the game in a long-lived iframe. Reusing the old
  // document after a dead transport can leave WebsimSocket's joinRoom promise
  // stuck behind the disconnect screen, so ask Discovery to recreate the
  // frame and start a genuinely new runtime/socket.
  if (window.parent !== window) {
    try {
      if (window.parent.document?.body?.classList.contains("games-webblox-page")) {
        window.parent.postMessage({ type: "webblox:restart-game" }, "*");
        return;
      }
    } catch {
      // Fall through to the in-document reconnect for other iframe hosts.
    }
  }

  multiplayer.intentionalClose = false;
  multiplayer.permanentlyDisconnected = false;
  multiplayer.reconnectPending = false;
  multiplayer.reconnectAttempt = 0;
  // Use the authenticated project socket for a fresh room join. The iframe
  // proxy can retain the dead transport and never deliver the new snapshot.
  multiplayer.preferLocalSocket = false;
  if (multiplayer.reconnectTimer) {
    window.clearTimeout(multiplayer.reconnectTimer);
    multiplayer.reconnectTimer = null;
    multiplayer.reconnectScheduledAt = 0;
  }
  if (multiplayer.handshakeTimer) {
    window.clearTimeout(multiplayer.handshakeTimer);
    multiplayer.handshakeTimer = null;
  }
  cancelPendingChatFlush();
  multiplayer.pendingChatMessages.length = 0;

  // Invalidate an old joinRoom promise before closing its room. This keeps a
  // late result from replacing the fresh connection created below.
  multiplayer.connectGeneration += 1;
  multiplayer.connecting = false;
  multiplayer.connectAttemptAt = 0;
  const oldRoom = multiplayer.room;
  multiplayer.room = null;
  multiplayer.connected = false;
  multiplayer.ready = false;
  multiplayer.snapshotReceived = false;
  multiplayer.transportReconnecting = false;
  multiplayer.id = null;
  clearChatBubbles();
  clearRemotePlayers();
  refreshPlayerList();
  try {
    oldRoom?.send?.({ type: "leave" });
  } catch {
    // The old transport may already be closed.
  }
  try {
    oldRoom?.close?.();
  } catch {
    // Closing a completed room is harmless on supported WebsimSocket builds.
  }

  // Start at the game spawn so reconnect is a real new game session, not the
  // old disconnected scene with a new socket attached to it.
  if (player.respawnTimer) window.clearTimeout(player.respawnTimer);
  player.respawnTimer = null;
  player.respawning = false;
  player.pos.set(0, 0, 0);
  player.vel.set(0, 0, 0);
  player.facing = 0;
  player.onGround = true;
  player.state = "Idle";
  setLocalFlyMode(false);
  if (player.model) {
    player.model.position.copy(player.pos);
    player.model.rotation.set(0, player.facing, 0);
  }

  gamePresenceVisible = true;
  showLoadingScreen();
  // Give the transport a moment to finish releasing the old room before
  // asking the same WebsimSocket instance for a new one. A zero-delay retry
  // could return the just-closed room and make Reconnect look successful
  // without creating a live server session.
  window.setTimeout(() => connectMultiplayer({ force: true }), 120);
}

loadingCancel?.addEventListener("click", leaveToHomepage);
disconnectLeave?.addEventListener("click", leaveToHomepage);
disconnectReconnect?.addEventListener("click", reconnectFromDisconnectScreen);

function setGamePresenceVisible(visible) {
  const wasVisible = gamePresenceVisible;
  gamePresenceVisible = Boolean(visible);
  if (!wasVisible && gamePresenceVisible) resetChatForGameEntry();
  document.documentElement.classList.toggle("home-presence-hidden", !gamePresenceVisible);
  if (player?.model) player.model.visible = gamePresenceVisible && !pendingScale && !player.respawning;
  if (localNametag) localNametag.hidden = true;
  if (!gamePresenceVisible && multiplayer.id) multiplayer.latestStates.delete(multiplayer.id);
  if (!gamePresenceVisible) stopGameAudio();
  refreshPlayerList?.();
  if (multiplayer.connected && multiplayer.room) {
    try {
      multiplayer.room.send({ type: "presence", visible: gamePresenceVisible });
    } catch {
      handleMultiplayerSendFailure(multiplayer.room, "presence send failed");
    }
    multiplayer.lastSentAt = 0;
    sendMultiplayerState(Date.now());
  }
}

window.addEventListener("message", (event) => {
  if (window.parent === window || event.source !== window.parent) return;
  if (event.data?.type === "webblox:game-context") {
    applyLoadingContext(event.data);
    return;
  }
  if (event.data?.type === "webblox:enter-game") {
    const wantGuest = event.data?.guest === true;
    guestModeRequested = wantGuest;
    setGamePresenceVisible(true);
    applyLoadingContext(event.data);
    if (!usernameChosen) {
      showUsernameScreen();
      return;
    }
    showLoadingScreen(event.data);
    // The downgrade request is sent 1 second after the welcome (the reliably
    // delivered channel) via scheduleGuestRetry's path; no blind immediate
    // send here. If already connected, kick the retry which fires shortly
    // after to keep it safe.
    if (wantGuest) {
      scheduleGuestRetry();
      // Immediately enforce guest restrictions locally (admin off, chat off),
      // independent of the server downgrade which may lag on a cached backend.
      setAdminAccess(false);
      if (chatInput) {
        chatInput.value = "";
        chatInput.setAttribute("placeholder", "Guests cannot chat");
        chatInput.disabled = true;
        chatInput.readOnly = true;
      }
    }
    // The iframe normally connects while the home is open. Retry here too so
    // a slow runtime/socket load cannot leave the newly opened game offline.
    connectMultiplayer({ force: !multiplayer.ready || !multiplayer.room });
  }
  if (event.data?.type === "webblox:home-ready") {
    setGamePresenceVisible(false);
    // Leaving to the details/home view is not a permanent socket close. Clear
    // any transient page-exit flags so a later Join can use the same iframe.
    multiplayer.pageClosing = false;
    multiplayer.intentionalClose = false;
    multiplayer.permanentlyDisconnected = false;
    multiplayer.reconnectPending = false;
    loadingActive = false;
    clearLoadingTimeout();
    hideConnectionScreen(loadingScreen);
    hideConnectionScreen(disconnectScreen);
    // Leaving guest mode: restore the chat input for the next (normal) session.
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.readOnly = false;
      chatInput.setAttribute("placeholder", defaultChatPlaceholderText);
    }
  }
});

const fpsCounter = document.getElementById("fps-counter");
const pingCounter = document.getElementById("ping-counter");
let fpsFrameCount = 0;
let fpsWindowStartedAt = performance.now();
let pingSentAt = 0;

function updatePerformanceHud(now = performance.now()) {
  fpsFrameCount += 1;
  const elapsed = now - fpsWindowStartedAt;
  if (elapsed < 500) return;
  const fps = Math.round((fpsFrameCount * 1000) / elapsed);
  if (fpsCounter) fpsCounter.textContent = `FPS: ${fps}`;
  fpsFrameCount = 0;
  fpsWindowStartedAt = now;
}

function sendMultiplayerPing() {
  if (!multiplayer.connected || !multiplayer.room) return;
  pingSentAt = performance.now();
  try {
    multiplayer.room.send({ type: "ping", clientTime: Date.now() });
  } catch {
    pingSentAt = 0;
  }
}

let pendingChatImageUrl = null;
let pendingChatImageUpload = null;
const defaultChatPlaceholderText = "To chat click here or press \"/\" key";

const SAVED_AVATAR_TEXTURE_KEYS = {
  r6: "webbox_saved_avatar_texture_r6_v1",
  r15: "webbox_saved_avatar_texture_r15_v1",
};
const LEGACY_SAVED_AVATAR_TEXTURE_KEY = "webbox_saved_avatar_texture_v1";

function isShareableAvatarUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function getSavedAvatarTexture(rig = activeRigType) {
  try {
    const saved = localStorage.getItem(SAVED_AVATAR_TEXTURE_KEYS[rig] || SAVED_AVATAR_TEXTURE_KEYS.r6);
    if (typeof saved === "string" && (isShareableAvatarUrl(saved) || saved.startsWith("data:image/"))) {
      return saved;
    }
  } catch { /* ignore unavailable storage */ }
  return "";
}

function loadSavedAvatarTexture(rig = activeRigType) {
  const saved = getSavedAvatarTexture(rig);
  if (saved) {
    multiplayer.avatarUrl = saved;
    return saved;
  }
  // Keep a texture saved by an older version usable, then migrate it to the
  // currently selected rig without making R6 and R15 overwrite one another.
  try {
    const legacy = localStorage.getItem(LEGACY_SAVED_AVATAR_TEXTURE_KEY);
    if (typeof legacy === "string" && (isShareableAvatarUrl(legacy) || legacy.startsWith("data:image/"))) {
      saveAvatarTexture(legacy, rig);
      multiplayer.avatarUrl = legacy;
      return legacy;
    }
  } catch { /* ignore unavailable storage */ }
  return "";
}

function saveAvatarTexture(url, rig = activeRigType) {
  if (typeof url !== "string" || !url) return;
  try {
    localStorage.setItem(SAVED_AVATAR_TEXTURE_KEYS[rig] || SAVED_AVATAR_TEXTURE_KEYS.r6, url);
  } catch (error) {
    console.warn("Saved avatar texture could not be stored", error);
  }
}

loadSavedAvatarTexture(activeRigType);

function playerIdentityKey(state) {
  const username = String(state?.username || "").trim().toLowerCase();
  // Every anonymous connection is named "guest". Using that display name as
  // a dedupe key made all anonymous players collapse into one remote clone.
  if (username && username !== "guest") return `user:${username}`;
  return `id:${state?.id || "unknown"}`;
}

function isLocalPlayerState(state) {
  if (!state) return false;
  if (state.id === multiplayer.id) return true;
  const localUsername = String(multiplayer.username || "").trim().toLowerCase();
  const username = String(state.username || "").trim().toLowerCase();
  return localUsername !== "" && localUsername !== "guest" && username === localUsername;
}

function dedupePlayerStates(states) {
  const unique = new Map();
  for (const state of states || []) {
    if (!state?.id) continue;
    const key = playerIdentityKey(state);
    const existing = unique.get(key);
    if (!existing || state.id === multiplayer.id) unique.set(key, state);
  }
  return [...unique.values()];
}

const adminToggle = document.getElementById("admin-toggle");
const adminPanel = document.getElementById("admin-panel");
const adminFlyToggle = document.getElementById("admin-fly-toggle");
const adminResetSelf = document.getElementById("admin-reset-self");
const adminUnflyButton = document.getElementById("admin-unfly-button");
const menuToggle = document.getElementById("menu-toggle");
const chatSettingsPanel = document.getElementById("chat-settings");
const leaveGameButton = document.getElementById("leave-game-button");
const playerList = document.getElementById("player-list");
const playerListScroll = document.getElementById("player-list-scroll");
const playerListToggle = document.getElementById("player-list-toggle");
const shiftLockCenterIndicator = document.getElementById("shiftlock-center-indicator");
const nametagsRoot = document.getElementById("nametags");
const chatBubblesRoot = document.getElementById("chat-bubbles");
let localNametag = null;
let nametagResolutionScale = 1;
const nametagProjection = new THREE.Vector3();
const remoteHeadPosition = new THREE.Vector3();
// Roblox-style nametags sit 1.5 studs above the animated head anchor on both
// supported rigs.
const NAMETAG_HEAD_OFFSET_STUDS = 1.5;
const nametagLift = new THREE.Vector3(0, NAMETAG_HEAD_OFFSET_STUDS, 0);
const chatBubbleWorldPosition = new THREE.Vector3();
const chatBubbleProjectionWorld = new THREE.Vector3();
const chatBubbleProjection = new THREE.Vector3();
const chatBubbleLocalNearOffset = new THREE.Vector3(0, 1.5, 0);
const chatBubbleLocalFarOffset = new THREE.Vector3(0, 3, 0);
const chatBubbleRemoteNearOffset = new THREE.Vector3(0, 2.5, 0);
const chatBubbleRemoteFarOffset = new THREE.Vector3(0, 3, 0);

// Roblox's legacy bubble chat values. The provided white background is the
// same rounded 9-slice silhouette, including the bottom caret/tail.
const CHAT_BUBBLE_FONT_SIZE = 18;
const CHAT_BUBBLE_LINE_HEIGHT = 34;
const CHAT_BUBBLE_TAIL_HEIGHT = 12;
const CHAT_BUBBLE_TEXT_Y_OFFSET = 2;
const CHAT_BUBBLE_PADDING = 12;
const CHAT_BUBBLE_MAX_WIDTH = 400;
const CHAT_BUBBLE_MAX_HEIGHT = 250;
const CHAT_BUBBLE_NEAR_DISTANCE = 65;
const CHAT_BUBBLE_MAX_DISTANCE = 100;
const CHAT_BUBBLE_MAX_LINES = 3;
const CHAT_BUBBLE_LIFETIME_LOCAL = [8, 15];
const CHAT_BUBBLE_LIFETIME_REMOTE = [12, 20];
const chatBubbleStacks = new Map();
let chatBubbleBodyImage = null;
let chatBubbleTailImage = null;

function redrawChatBubbleCanvases() {
  for (const stack of chatBubbleStacks.values()) {
    for (const line of stack) {
      line.renderSignature = "";
    }
  }
  updateChatBubbles();
}

function prepareChatBubbleNineSlice() {
  if (!chatBubblesRoot) return;
  const bodyImage = new Image();
  bodyImage.onload = () => {
    chatBubbleBodyImage = bodyImage;
    redrawChatBubbleCanvases();
  };
  bodyImage.src = "uploads/chatBubble_white_notify_bkg.png";

  const tailSource = new Image();
  tailSource.onload = () => {
    // Caret.png is intentionally drawn at about 90% alpha in the source
    // asset. Normalize that global alpha so its solid center is as opaque as
    // the bubble body while preserving its antialiased edge pixels.
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = tailSource.naturalWidth || 18;
    sourceCanvas.height = tailSource.naturalHeight || 12;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return;
    sourceContext.drawImage(tailSource, 0, 0);
    const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    let maximumAlpha = 0;
    for (let index = 3; index < imageData.data.length; index += 4) {
      maximumAlpha = Math.max(maximumAlpha, imageData.data[index]);
    }
    if (maximumAlpha > 0 && maximumAlpha < 255) {
      for (let index = 3; index < imageData.data.length; index += 4) {
        if (imageData.data[index] > 0) {
          imageData.data[index] = Math.min(
            255,
            Math.round((imageData.data[index] * 255) / maximumAlpha)
          );
        }
      }
      sourceContext.putImageData(imageData, 0, 0);
    }
    const normalizedTail = new Image();
    normalizedTail.onload = () => {
      chatBubbleTailImage = normalizedTail;
      redrawChatBubbleCanvases();
    };
    normalizedTail.src = sourceCanvas.toDataURL("image/png");
  };
  tailSource.src = "uploads/Caret.png";
}

prepareChatBubbleNineSlice();

function parseTwemoji(root) {
  if (!root || !globalThis.twemoji?.parse) return;
  globalThis.twemoji.parse(root, {
    base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
    folder: "svg",
    ext: ".svg",
    className: "twemoji",
  });
}

// Chat supports the familiar :name: notation before Twemoji rasterizes the
// message. Keep this deliberately small and predictable so command prefixes
// such as :fly are untouched, while common reactions work everywhere.
const CHAT_EMOJI_SHORTCODES = Object.freeze({
  sob: "😭",
  cry: "😢",
  joy: "😂",
  laugh: "😂",
  rofl: "🤣",
  smile: "😄",
  grin: "😁",
  wink: "😉",
  blush: "😊",
  heart_eyes: "😍",
  kiss: "😘",
  thinking: "🤔",
  scream: "😱",
  angry: "😠",
  rage: "😡",
  sweat: "😓",
  heart: "❤️",
  broken_heart: "💔",
  fire: "🔥",
  skull: "💀",
  poop: "💩",
  clown: "🤡",
  eyes: "👀",
  clap: "👏",
  pray: "🙏",
  thumbs_up: "👍",
  thumbs_down: "👎",
  wave: "👋",
  ok_hand: "👌",
  tada: "🎉",
  party: "🥳",
  check: "✅",
  x: "❌",
  question: "❓",
  exclamation: "❗",
  hundred: "💯",
});

function replaceChatEmojiShortcodes(text) {
  return String(text ?? "").replace(/:([a-z0-9_+-]+):/giu, (match, name) => {
    return CHAT_EMOJI_SHORTCODES[String(name).toLowerCase()] || match;
  });
}

let chatBubbleTwemojiRevision = 0;
const chatBubbleTwemojiImages = new Map();

function twemojiCodePointFor(value) {
  if (globalThis.twemoji?.convert?.toCodePoint) {
    return globalThis.twemoji.convert.toCodePoint(value);
  }
  return [...value].map((character) => character.codePointAt(0).toString(16)).join("-");
}

function isEmojiCluster(value) {
  return /\p{Extended_Pictographic}/u.test(value);
}

function splitTwemojiText(value) {
  if (globalThis.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(String(value))].map(({ segment }) => segment);
  }
  return Array.from(String(value));
}

function getChatTwemojiImage(value) {
  if (!isEmojiCluster(value)) return null;
  const codePoint = twemojiCodePointFor(value);
  if (!codePoint) return null;
  const cached = chatBubbleTwemojiImages.get(codePoint);
  if (cached) return cached.image || null;
  const image = new Image();
  image.crossOrigin = "anonymous";
  const entry = { image: null, loading: true };
  chatBubbleTwemojiImages.set(codePoint, entry);
  image.onload = () => {
    entry.image = image;
    entry.loading = false;
    chatBubbleTwemojiRevision += 1;
    for (const stack of chatBubbleStacks.values()) {
      for (const line of stack) line.renderSignature = "";
    }
    updateChatBubbles();
  };
  image.onerror = () => {
    entry.loading = false;
  };
  image.src = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codePoint}.svg`;
  return null;
}

function parseChatTwemoji(root) {
  if (!root) return;
  root.querySelectorAll(".chat-content, .chat-outline").forEach(parseTwemoji);
}

function setAdminAccess(isAdmin) {
  // A guest never has admin, regardless of what the (possibly stale) welcome
  // said. This is local UI enforcement; the server is still authoritative, but
  // it stops the guest from seeing/using admin tools before the downgrade.
  const effectiveAdmin = Boolean(isAdmin) && !guestModeRequested;
  multiplayer.isAdmin = effectiveAdmin;
  adminToggle.hidden = !effectiveAdmin;
  updateHatScaleLimit();
  if (!effectiveAdmin) {
    adminPanel.hidden = true;
    if (player.flyMode) setLocalFlyMode(false);
  }
}

function setLocalFlyMode(enabled, options = {}) {
  const wasFlying = player.flyMode;
  player.flyMode = Boolean(enabled);
  player.flyNoclip = player.flyMode && options.noclip === true;
  if (player.flyMode) stopLocalEmote();
  if (Number.isFinite(options.speed)) {
    player.flySpeed = Math.max(1, options.speed);
  }
  if (player.flyMode) {
    player.onGround = false;
    player.vel.set(0, 0, 0);
    // Stop and freeze the local animation while flying. The static bind pose
    // keeps the body from continuing to walk in the air.
    if (mixer) mixer.stopAllAction();
    currentAction = null;
    currentName = null;
  } else {
    player.vel.y = 0;
    if (wasFlying && player.model) {
      // Fly uses full XYZ orientation. Restore the upright ground pose before
      // normal movement starts so the avatar cannot keep a sideways roll.
      player.model.rotation.set(0, player.facing, 0);
    }
    if (wasFlying) {
      currentAction = null;
      currentName = null;
      if (!avatarAnimationLocked) applyAnimationImmediate("Idle");
    }
  }
  syncLocalAnimationPlayback();
  if (adminUnflyButton) adminUnflyButton.hidden = !player.flyMode;
}

function applyAuthoritativeTeleport(message) {
  if (!message || message.id !== multiplayer.id) return;
  const revision = Number(message.revision ?? message.teleportRevision);
  if (Number.isFinite(revision)) {
    multiplayer.lastTeleportRevision = Math.max(multiplayer.lastTeleportRevision, revision);
  }
  if (player.respawnTimer) {
    window.clearTimeout(player.respawnTimer);
    player.respawnTimer = null;
  }
  player.respawning = false;
  setLocalFlyMode(false);
  player.pos.set(
    Number.isFinite(Number(message.x)) ? Number(message.x) : 0,
    Number.isFinite(Number(message.y)) ? Number(message.y) : 0,
    Number.isFinite(Number(message.z)) ? Number(message.z) : 0
  );
  player.facing = Number.isFinite(Number(message.facing)) ? Number(message.facing) : 0;
  player.vel.set(0, 0, 0);
  player.onGround = true;
  player.airborneFromJump = false;
  player.fallTime = 0;
  player.fallingSoundPlayed = false;
  player.state = "Idle";
  if (player.model) {
    player.model.position.copy(player.pos);
    player.model.rotation.set(0, player.facing, 0);
    player.model.visible = gamePresenceVisible && !pendingScale;
  }
  if (localNametag) localNametag.hidden = true;
  multiplayer.lastSentAt = 0;
  sendMultiplayerState(Date.now());
}

function applyNetworkTeleport(message) {
  const x = Number(message?.x);
  const y = Number(message?.y);
  const z = Number(message?.z);
  const facing = Number(message?.facing);
  const revision = Number(message?.revision ?? message?.teleportRevision);
  if (![x, y, z, facing].every(Number.isFinite) || !message?.id) return;
  if (message.id === multiplayer.id) {
    applyAuthoritativeTeleport({ ...message, x, y, z, facing });
    return;
  }

  const state = multiplayer.latestStates.get(message.id) || {
    id: message.id,
    username: message.username || "guest",
    facing,
    state: "Idle",
  };
  state.x = x;
  state.y = y;
  state.z = z;
  state.facing = facing;
  state.facingSnap = message.facingSnap === true;
  state.state = "Idle";
  if (Number.isFinite(revision)) state.teleportRevision = revision;
  multiplayer.latestStates.set(message.id, state);
  const remote = multiplayer.remotePlayers.get(message.id) || createRemotePlayer(state);
  if (!remote) return;
  remote.targetPosition.set(x, y, z);
  remote.predictedPosition.set(x, y, z);
  remote.group.position.set(x, y, z);
  remote.currentFacing = facing;
  remote.targetFacing = facing;
  remote.facingSnap = state.facingSnap === true;
  remote.currentPitch = 0;
  remote.targetPitch = 0;
  remote.currentRoll = 0;
  remote.targetRoll = 0;
  remote.group.rotation.set(0, facing, 0);
  remote.networkVelocity.set(0, 0, 0);
  remote.lastNetworkAt = performance.now();
  if (Number.isFinite(revision)) remote.lastTeleportRevision = Math.max(remote.lastTeleportRevision || 0, revision);
  setRemoteAnimation(remote, "Idle");
}

let playerListVisible = true;

function setPlayerListVisible(visible) {
  playerListVisible = Boolean(visible);
  playerList.classList.toggle("player-list-hidden", !playerListVisible);
  playerListToggle?.setAttribute("aria-expanded", String(playerListVisible));
  playerListToggle?.setAttribute(
    "aria-label",
    playerListVisible ? "Hide player list" : "Show player list"
  );
  if (playerListToggle) playerListToggle.textContent = playerListVisible ? "›" : "‹";
}

function positionPlayerListToggle() {
  if (!playerList || !playerListToggle) return;
  const listTop = Number.parseFloat(getComputedStyle(playerList).top) || 0;
  const gap = 8;
  // offsetHeight is not affected by the hidden translateX animation, so the
  // toggle stays below the list even while the list is collapsed.
  playerListToggle.style.top = `${Math.round(listTop + playerList.offsetHeight + gap)}px`;
}

playerListToggle?.addEventListener("click", () => setPlayerListVisible(!playerListVisible));
window.addEventListener("resize", positionPlayerListToggle);

window.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest?.("#avatar-editor") || event.target.matches?.("input, textarea, select, button, [contenteditable='true']")) return;
  event.preventDefault();
  setPlayerListVisible(!playerListVisible);
});

adminToggle.addEventListener("click", () => {
  adminPanel.hidden = !adminPanel.hidden;
  adminToggle.setAttribute("aria-expanded", String(!adminPanel.hidden));
});
document.getElementById("admin-panel-close")?.addEventListener("click", () => {
  adminPanel.hidden = true;
  adminToggle.setAttribute("aria-expanded", "false");
});

document.getElementById("admin-panel-back")?.addEventListener("click", () => {
  adminPanel.hidden = true;
  adminToggle.setAttribute("aria-expanded", "false");
});
document.getElementById("admin-panel-minimize")?.addEventListener("click", () => {
  adminPanel.classList.toggle("admin-panel-minimized");
});

function submitAdminCommand(command) {
  const text = String(command || "").trim();
  if (!text) return;
  if (!multiplayer.isAdmin) {
    appendSystemMessage("Admin commands are only available to administrators.");
    return;
  }
  chatInput.value = text;
  updateChatInputLayout();
  sendChatMessage();
  adminPanel.hidden = true;
  adminToggle.setAttribute("aria-expanded", "false");
}

adminPanel.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => submitAdminCommand(button.dataset.command));
});
adminUnflyButton?.addEventListener("click", () => submitAdminCommand(":unfly me"));
document.getElementById("admin-fly-toggle")?.addEventListener("click", () => {
  submitAdminCommand(player.flyMode ? ":unfly me" : ":fly me 16");
});
document.getElementById("admin-reset-self")?.addEventListener("click", () => submitAdminCommand(":respawn me"));
document.getElementById("admin-command-search")?.addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  adminPanel.querySelectorAll(".admin-command-row[data-command]").forEach((row) => {
    row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query);
  });
});
menuToggle.addEventListener("click", () => {
  const shouldHide = !graphicsSettings.hidden;
  graphicsSettings.hidden = shouldHide;
  if (leaveGameButton) leaveGameButton.hidden = shouldHide;
  menuToggle.setAttribute("aria-expanded", String(!shouldHide));
});

leaveGameButton?.addEventListener("click", () => {
  if (window.parent === window) {
    window.location.href = "index.html";
    return;
  }
  window.parent.postMessage({ type: "webblox:leave-game" }, "*");
});

function refreshPlayerList() {
  const entries = dedupePlayerStates([...multiplayer.latestStates.values()])
    .filter((state) => state?.id && state.username)
    .sort((a, b) => {
      if (a.id === multiplayer.id) return -1;
      if (b.id === multiplayer.id) return 1;
      return (a.username || "guest").localeCompare(b.username || "guest");
    });
  playerList.hidden = entries.length === 0;
  playerListScroll.replaceChildren();
  for (const state of entries) {
    const isOwner = isOwnerName(state.username) && state.isGuest !== true;
    const row = document.createElement("div");
    row.className = "player-list-row";
    row.classList.toggle("you", state.id === multiplayer.id);
    row.classList.toggle("admin", Boolean(state.isAdmin));
    const hasRoleIcon = state.playerListIconVisible !== false && state.isGuest !== true && (isOwner || state.isAdmin);
    const icon = document.createElement(hasRoleIcon ? "img" : "span");
    icon.className = "player-list-icon";
    if (hasRoleIcon) {
      icon.src = isOwner
        ? "uploads/OwnerIcon.webp"
        : "uploads/AdminIcon_2022.webp";
      icon.alt = isOwner ? "Owner" : "Admin";
    } else {
      icon.setAttribute("aria-hidden", "true");
    }
    const name = document.createElement("span");
    name.className = "player-list-name";
    name.textContent = state.username;
    row.append(icon, name);
    if (state.isGuest !== true && state.checkmarkVisible === true) {
      if (isOwner) {
        const flag = document.createElement("span");
        flag.className = "player-list-flag";
        flag.textContent = "🇧🇷";
        flag.setAttribute("aria-label", "Brazil");
        row.append(flag);
      }
      const verified = document.createElement("img");
      verified.className = "player-list-verification-badge";
      verified.src = "uploads/Roblox_Verification_Badge.svg";
      verified.alt = "Verified";
      verified.title = "Verified";
      row.append(verified);
    }
    playerListScroll.append(row);
  }
  parseTwemoji(playerListScroll);
  positionPlayerListToggle();
  requestAnimationFrame(positionPlayerListToggle);
}

function createNametag(name) {
  const tag = document.createElement("div");
  tag.className = "nametag";
  const source = document.createElement("span");
  source.className = "nametag-source";
  source.textContent = name || "guest";
  const pixels = document.createElement("canvas");
  pixels.className = "nametag-pixels";
  tag.nametagSource = source;
  tag.nametagPixels = pixels;
  tag.append(source, pixels);
  nametagsRoot.append(tag);
  return tag;
}

function isOwnerName(name) {
  return String(name || "").trim().toLowerCase() === "hardcore";
}

function formatPlayerTitle(name, isAdmin = false) {
  const username = name || "guest";
  if (isOwnerName(username)) return "[OWNER] hardcore";
  return isAdmin ? `[ADMIN] ${username}` : username;
}

function formatChatSpeaker(name, isAdmin = false, nametagPrefix = null, showRankPrefix = true) {
  const username = name || "guest";
  if (showRankPrefix && nametagPrefix) return `[${nametagPrefix}] [${username}]`;
  if (showRankPrefix && isOwnerName(username)) return `[OWNER] [${username}]`;
  if (showRankPrefix && isAdmin) return `[ADMIN] [${username}]`;
  return `[${username}]`;
}

function appendVerifiedCheckmark(parent, visible = true) {
  if (!visible) return;
  const badge = document.createElement("img");
  badge.className = "verified-checkmark";
  badge.src = "uploads/Roblox_Verification_Badge.svg";
  badge.alt = "";
  badge.setAttribute("aria-label", "Verified");
  badge.draggable = false;
  const nametag = parent.closest?.(".nametag");
  badge.addEventListener("load", () => {
    if (!nametag) return;
    nametag.dataset.nametagPixelRevision = String((Number(nametag.dataset.nametagPixelRevision) || 0) + 1);
  }, { once: true });
  parent.append(badge);
}

function appendRankedName(
  parent,
  name,
  isAdmin = false,
  bracketUsername = false,
  nametagPrefix = null,
  nametagColor = null,
  usernameColor = null,
  showRankPrefix = true,
  checkmarkVisible = true
) {
  const username = name || "guest";
  const owner = isOwnerName(username);
  const createUsername = () => {
    const user = document.createElement("span");
    if (bracketUsername) {
      user.append(document.createTextNode(`[${username}`));
      appendVerifiedCheckmark(user, checkmarkVisible === true);
      user.append(document.createTextNode("]"));
    } else {
      user.textContent = username;
    }
    if (usernameColor) user.style.color = usernameColor;
    return user;
  };

  if (showRankPrefix && nametagPrefix) {
    const prefix = document.createElement("span");
    prefix.className = "rank-label custom";
    prefix.textContent = `[${nametagPrefix}]`;
    if (nametagColor) prefix.style.color = nametagColor;
    const user = createUsername();
    parent.append(prefix, document.createTextNode(" "), user);
    if (!bracketUsername) appendVerifiedCheckmark(parent, checkmarkVisible === true);
    return;
  }
  if (showRankPrefix && (owner || isAdmin)) {
    const rank = document.createElement("span");
    rank.className = `rank-label ${owner ? "owner" : "admin"}`;
    rank.textContent = owner ? "[OWNER]" : "[ADMIN]";
    if (nametagColor) rank.style.color = nametagColor;
    const user = createUsername();
    parent.append(rank, document.createTextNode(" "), user);
    if (!bracketUsername) appendVerifiedCheckmark(parent, checkmarkVisible === true);
    return;
  }
  parent.append(createUsername());
  if (!bracketUsername) appendVerifiedCheckmark(parent, checkmarkVisible === true);
}

function setNametag(tag, name, isAdmin = false, state = null) {
  const source = tag.nametagSource || tag;
  source.replaceChildren();
  const isGuest = state?.isGuest === true || name.toLowerCase().startsWith("guest ");
  const showRankPrefix = isGuest ? false : (state?.nametagPrefixVisible !== false);
  const prefix = isGuest ? null : (showRankPrefix ? (state?.nametagText || null) : null);
  appendRankedName(
    source,
    name,
    isGuest ? false : isAdmin,
    false,
    prefix,
    isGuest ? null : (state?.nametagColor || null),
    null,
    showRankPrefix,
    isGuest ? false : (state?.checkmarkVisible !== false)
  );
  tag.classList.toggle("admin", !isGuest && Boolean((isGuest ? false : isAdmin) || isOwnerName(name)));
  tag.style.color = "";
  tag.dataset.nametagVisible = "true";
  tag.dataset.nametagPixelRevision = String((Number(tag.dataset.nametagPixelRevision) || 0) + 1);
  tag.hidden = false;
}

function setLocalNametag(name, isAdmin = false, state = null) {
  if (!localNametag) localNametag = createNametag(name);
  setNametag(localNametag, name, isAdmin, state);
  localNametag.hidden = true;
}

function updateNametags() {
  if (localNametag) localNametag.hidden = true;
  for (const remote of multiplayer.remotePlayers.values()) {
    headWorldPositionForRoot(remote.model || remote.group, remoteHeadPosition);
    const distance = camera.position.distanceTo(remoteHeadPosition);
    const visualFontSize = distance >= 50 ? 8 : distance > 25 ? 14 : 18;
    remote.nametag.style.fontSize = `${visualFontSize}px`;
    remote.nametag.style.lineHeight = `${Math.max(10, Math.round(visualFontSize * 1.22))}px`;
    renderNametagPixels(remote.nametag, visualFontSize);
    positionNametag(remote.nametag, remoteHeadPosition.add(nametagLift));
  }
}

function collectNametagRuns(node, runs, inheritedColor = "#ffffff") {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.nodeValue) runs.push({ text: child.nodeValue, color: inheritedColor });
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (child.tagName === "IMG" && child.classList.contains("verified-checkmark")) {
      runs.push({
        image: child,
        width: Math.max(1, child.getBoundingClientRect().width || 0),
      });
      continue;
    }
    const computedColor = getComputedStyle(child).color;
    const color = child.style.color || (
      computedColor !== "transparent" && computedColor !== "rgba(0, 0, 0, 0)"
        ? computedColor
        : inheritedColor
    );
    collectNametagRuns(child, runs, color);
  }
}

function renderNametagPixels(tag, visualFontSize) {
  const source = tag.nametagSource;
  const pixels = tag.nametagPixels;
  if (!source || !pixels) return;

  // Use the exact ratio used by WebGL, including the current game-quality
  // setting, so the overlay shares the renderer's pixel grid.
  const viewport = getOverlayViewport();
  const internalScaleX = viewport.pixelRatioX;
  const internalScaleY = viewport.pixelRatioY;
  const signature = [
    tag.dataset.nametagPixelRevision || "0",
    visualFontSize,
    nametagResolutionScale,
    internalScaleX,
    internalScaleY,
  ].join(":");
  if (pixels.dataset.signature === signature) return;

  const sourceRect = source.getBoundingClientRect();
  const width = Math.max(1, sourceRect.width);
  const height = Math.max(1, sourceRect.height);
  const internalWidth = Math.max(1, Math.round(width * internalScaleX));
  const internalHeight = Math.max(1, Math.round(height * internalScaleY));
  pixels.width = internalWidth;
  pixels.height = internalHeight;
  // Keep the CSS box at the layout size. The backing dimensions are rounded
  // independently, so the browser never has to resize the tag by a second,
  // slightly different fractional amount.
  pixels.style.width = `${width}px`;
  pixels.style.height = `${height}px`;
  pixels.dataset.signature = signature;

  const context = pixels.getContext("2d");
  if (!context) return;
  // Match the antialiased WebGL renderer instead of hard pixel blocks.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, pixels.width, pixels.height);
  context.save();
  context.scale(internalWidth / width, internalHeight / height);
  const computed = getComputedStyle(tag);
  context.font = `${computed.fontWeight} ${visualFontSize}px ${computed.fontFamily}`;
  context.textBaseline = "alphabetic";
  const runs = [];
  collectNametagRuns(source, runs);
  let x = 0;
  const baseline = Math.max(visualFontSize, (height - visualFontSize) / 2 + visualFontSize * 0.82);
  const fullText = runs.map((run) => run.text).join("");
  // Rasterize the outline together with the glyphs so it is softened by the
  // same internal-resolution sampling as the game renderer.
  context.lineWidth = 1.25;
  context.lineJoin = "round";
  context.strokeStyle = "rgba(0, 0, 0, 0.65)";
  context.shadowColor = "rgba(0, 0, 0, 0.72)";
  context.shadowBlur = 1.75;
  context.strokeText(fullText, 0, baseline);
  context.shadowBlur = 0;
  for (const run of runs) {
    if (run.image) {
      const size = Math.max(1, run.width || visualFontSize);
      if (run.image.complete && run.image.naturalWidth > 0) {
        const imageY = baseline - visualFontSize * 0.86;
        // Give the SVG badge the same crisp dark contour as the nametag text.
        context.save();
        context.filter = "brightness(0)";
        context.globalAlpha = 0.72;
        const badgeStroke = 0.75;
        for (const [offsetX, offsetY] of [
          [badgeStroke, 0], [-badgeStroke, 0], [0, badgeStroke], [0, -badgeStroke],
        ]) {
          context.drawImage(run.image, x + offsetX, imageY + offsetY, size, size);
        }
        context.restore();
        context.drawImage(run.image, x, imageY, size, size);
      }
      x += size;
      continue;
    }
    context.fillStyle = run.color;
    context.fillText(run.text, x, baseline);
    x += context.measureText(run.text).width;
  }
  context.restore();
}

function getOverlayViewport() {
  const rect = renderer.domElement.getBoundingClientRect();
  const width = Math.max(1, renderer.domElement.width || Math.round(rect.width * renderer.getPixelRatio()));
  const height = Math.max(1, renderer.domElement.height || Math.round(rect.height * renderer.getPixelRatio()));
  return {
    rect,
    pixelRatioX: width / Math.max(1, rect.width),
    pixelRatioY: height / Math.max(1, rect.height),
  };
}

function positionNametag(tag, worldPosition) {
  nametagProjection.copy(worldPosition).project(camera);
  const onScreen = nametagProjection.z >= -1 && nametagProjection.z <= 1 &&
    nametagProjection.x >= -1.2 && nametagProjection.x <= 1.2 &&
    nametagProjection.y >= -1.2 && nametagProjection.y <= 1.2;
  tag.hidden = !onScreen;
  if (!onScreen) return;
  const viewport = getOverlayViewport();
  const { rect, pixelRatioX, pixelRatioY } = viewport;
  const screenX = rect.left + (nametagProjection.x * 0.5 + 0.5) * rect.width;
  const screenY = rect.top + (-nametagProjection.y * 0.5 + 0.5) * rect.height;
  const snappedX = rect.left + Math.round((screenX - rect.left) * pixelRatioX) / pixelRatioX;
  const snappedY = rect.top + Math.round((screenY - rect.top) * pixelRatioY) / pixelRatioY;
  tag.style.left = `${snappedX}px`;
  tag.style.top = `${snappedY}px`;
}

function sanitizeChatBubbleText(text) {
  const normalized = replaceChatEmojiShortcodes(String(text || "")).replace(/[\r\n\t]+/gu, " ").trim();
  if (!normalized) return "";
  const characters = Array.from(normalized);
  if (characters.length <= 128) return normalized;
  return `${characters.slice(0, 124).join("")}...`;
}

const chatBubbleMeasureCanvas = document.createElement("canvas");
const chatBubbleMeasureContext = chatBubbleMeasureCanvas.getContext("2d");

function measureChatBubbleText(text) {
  const fontSize = getChatBubbleFontSize();
  // Keep the Roblox slice/body line box fixed. The setting changes glyph size
  // and wrapping, but it must not stretch the 9-slice vertically.
  const lineHeight = CHAT_BUBBLE_LINE_HEIGHT;
  const font = `${fontSize}px "Source Sans Pro", "Source Sans 3", system-ui, sans-serif`;
  const maxTextWidth = CHAT_BUBBLE_MAX_WIDTH - 30;
  if (!chatBubbleMeasureContext) {
    return { width: CHAT_BUBBLE_MAX_WIDTH, height: lineHeight, lines: [String(text)] };
  }

  chatBubbleMeasureContext.font = font;
  const lines = [];
  const splitLongWord = (word) => {
    const chunks = [];
    let chunk = "";
    for (const character of Array.from(word)) {
      const candidate = `${chunk}${character}`;
      if (chunk && chatBubbleMeasureContext.measureText(candidate).width > maxTextWidth) {
        chunks.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    }
    if (chunk || !chunks.length) chunks.push(chunk);
    return chunks;
  };
  for (const paragraph of String(text).split("\n")) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    let line = "";
    for (const word of words.length ? words : [""]) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && chatBubbleMeasureContext.measureText(candidate).width > maxTextWidth) {
        lines.push(line);
        const chunks = chatBubbleMeasureContext.measureText(word).width > maxTextWidth
          ? splitLongWord(word)
          : [word];
        lines.push(...chunks.slice(0, -1));
        line = chunks.at(-1) || "";
      } else if (!line && chatBubbleMeasureContext.measureText(word).width > maxTextWidth) {
        const chunks = splitLongWord(word);
        lines.push(...chunks.slice(0, -1));
        line = chunks.at(-1) || "";
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }

  const measuredWidth = Math.max(
    40,
    Math.min(
      CHAT_BUBBLE_MAX_WIDTH,
      Math.ceil(Math.max(...lines.map((line) => chatBubbleMeasureContext.measureText(line).width), 0) + 30)
    )
  );
  const lineCount = Math.max(1, lines.length);
  const maxVisibleLines = Math.max(
    1,
    Math.floor((CHAT_BUBBLE_MAX_HEIGHT - CHAT_BUBBLE_TAIL_HEIGHT) / lineHeight)
  );
  return {
    width: measuredWidth,
    height: Math.min(
      CHAT_BUBBLE_MAX_HEIGHT - CHAT_BUBBLE_TAIL_HEIGHT,
      Math.min(lineCount, maxVisibleLines) * lineHeight
    ),
    lines: lines.slice(0, maxVisibleLines),
  };
}

function drawBubbleNineSlice(context, image, width, height, sliceScale = 1) {
  // Keep sampling the original 5px source border. SliceScale changes only
  // the destination border thickness, which is the actual 9-slice behavior:
  // the bubble's outer width/height stays fixed while its corners and edges
  // become thinner or thicker.
  const sourceSlice = 5;
  const destinationSlice = Math.max(
    1,
    Math.min(5 * sliceScale, Math.max(1, width / 2 - 0.5), Math.max(1, height / 2 - 0.5))
  );
  const sourceSize = 80;
  const centerSourceSize = sourceSize - sourceSlice * 2;
  const centerWidth = Math.max(1, width - destinationSlice * 2);
  const centerHeight = Math.max(1, height - destinationSlice * 2);

  const draw = (sx, sy, sw, sh, dx, dy, dw, dh) => {
    context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  draw(0, 0, sourceSlice, sourceSlice, 0, 0, destinationSlice, destinationSlice);
  draw(sourceSlice, 0, centerSourceSize, sourceSlice, destinationSlice, 0, centerWidth, destinationSlice);
  draw(sourceSize - sourceSlice, 0, sourceSlice, sourceSlice, width - destinationSlice, 0, destinationSlice, destinationSlice);
  draw(0, sourceSlice, sourceSlice, centerSourceSize, 0, destinationSlice, destinationSlice, centerHeight);
  draw(sourceSlice, sourceSlice, centerSourceSize, centerSourceSize, destinationSlice, destinationSlice, centerWidth, centerHeight);
  draw(sourceSize - sourceSlice, sourceSlice, sourceSlice, centerSourceSize, width - destinationSlice, destinationSlice, destinationSlice, centerHeight);
  draw(0, sourceSize - sourceSlice, sourceSlice, sourceSlice, 0, height - destinationSlice, destinationSlice, destinationSlice);
  draw(sourceSlice, sourceSize - sourceSlice, centerSourceSize, sourceSlice, destinationSlice, height - destinationSlice, centerWidth, destinationSlice);
  draw(sourceSize - sourceSlice, sourceSize - sourceSlice, sourceSlice, sourceSlice, width - destinationSlice, height - destinationSlice, destinationSlice, destinationSlice);
}

function drawBubbleFallback(context, width, height) {
  context.fillStyle = "#ffffff";
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(0, 0, width, height, 8);
  } else {
    context.rect(0, 0, width, height);
  }
  context.fill();
}

function drawChatBubbleTextLine(context, text, centerX, baseline, fontSize, richRuns = null, richOffset = 0) {
  if (Array.isArray(richRuns) && richRuns.length) {
    const pieces = [];
    let offset = richOffset;
    let remaining = text.length;
    for (const run of richRuns) {
      const runStart = Number(run.start) || 0;
      const runEnd = runStart + String(run.text || "").length;
      if (runEnd <= offset || runStart >= offset + remaining) continue;
      const start = Math.max(offset, runStart);
      const end = Math.min(offset + remaining, runEnd);
      const chunk = String(run.text || "").slice(start - runStart, end - runStart);
      if (chunk) pieces.push({ text: chunk, style: run.style || {} });
    }
    if (!pieces.length) pieces.push({ text, style: {} });
    const visualRuns = [];
    for (const piece of pieces) {
      const style = piece.style || {};
      const segments = splitTwemojiText(piece.text);
      let normalText = "";
      const flushNormalText = () => {
        if (!normalText) return;
        context.save();
        context.font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${fontSize}px "Source Sans Pro", "Source Sans 3", system-ui, sans-serif`;
        const width = context.measureText(normalText).width;
        context.restore();
        visualRuns.push({ text: normalText, image: null, width, style });
        normalText = "";
      };
      for (const segment of segments) {
        if (!isEmojiCluster(segment)) {
          normalText += segment;
          continue;
        }
        flushNormalText();
        visualRuns.push({ text: "", image: getChatTwemojiImage(segment), emoji: segment, width: fontSize, style });
      }
      flushNormalText();
    }
    const totalWidth = visualRuns.reduce((sum, run) => sum + run.width, 0);
    let x = centerX - totalWidth / 2;
    for (const run of visualRuns) {
      if (run.image) {
        context.drawImage(run.image, x, baseline - fontSize * 0.88, fontSize, fontSize);
      } else {
        const style = run.style || {};
        context.save();
        context.font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${fontSize}px "Source Sans Pro", "Source Sans 3", system-ui, sans-serif`;
        context.fillStyle = style.color || "#171717";
        if (style.underline || style.strike) {
          context.fillText(run.text, x, baseline);
          context.strokeStyle = context.fillStyle;
          context.lineWidth = Math.max(1, fontSize / 14);
          if (style.underline) context.beginPath(), context.moveTo(x, baseline + 2), context.lineTo(x + run.width, baseline + 2), context.stroke();
          if (style.strike) context.beginPath(), context.moveTo(x, baseline - fontSize * 0.35), context.lineTo(x + run.width, baseline - fontSize * 0.35), context.stroke();
        } else {
          context.fillText(run.text, x, baseline);
        }
        context.restore();
      }
      x += run.width;
    }
    return richOffset + text.length;
  }
  const segments = splitTwemojiText(text);
  const runs = [];
  let normalText = "";
  const flushNormalText = () => {
    if (!normalText) return;
    runs.push({
      text: normalText,
      image: null,
      width: context.measureText(normalText).width,
    });
    normalText = "";
  };
  for (const segment of segments) {
    if (!isEmojiCluster(segment)) {
      normalText += segment;
      continue;
    }
    flushNormalText();
    runs.push({
      text: "",
      image: getChatTwemojiImage(segment),
      emoji: segment,
      width: fontSize,
    });
  }
  flushNormalText();
  const totalWidth = runs.reduce((sum, run) => sum + run.width, 0);
  let x = centerX - totalWidth / 2;
  for (const run of runs) {
    if (run.image) {
      const size = fontSize;
      context.drawImage(run.image, x, baseline - fontSize * 0.88, size, size);
    } else {
      // Keep ordinary text in contiguous runs so the browser preserves its
      // normal kerning and space widths. Only emoji are split out for images.
      context.fillText(run.text || run.emoji || "", x, baseline);
    }
    x += run.width;
  }
}

function parseHardcoreBubbleRichText(richText) {
  if (typeof richText !== "string" || !richText) return null;
  const template = document.createElement("template");
  template.innerHTML = richText;
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "S", "SPAN", "BR"]);
  const runs = [];
  let cursor = 0;
  const appendText = (text, style) => {
    const normalized = String(text || "").replace(/[\r\n\t]+/gu, " ");
    if (!normalized) return;
    runs.push({ text: normalized, start: cursor, style: { ...style } });
    cursor += normalized.length;
  };
  const visit = (node, style) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.nodeValue || "", style);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toUpperCase();
    if (!allowedTags.has(tag)) {
      for (const child of node.childNodes) visit(child, style);
      return;
    }
    if (tag === "BR") {
      appendText("\n", style);
      return;
    }
    const nextStyle = { ...style };
    if (tag === "B" || tag === "STRONG") nextStyle.bold = true;
    if (tag === "I" || tag === "EM") nextStyle.italic = true;
    if (tag === "U") nextStyle.underline = true;
    if (tag === "S") nextStyle.strike = true;
    if (tag === "SPAN") {
      const color = node.getAttribute("style")?.match(/^\s*color\s*:\s*(#[0-9a-f]{3,8})\s*$/i)?.[1];
      if (color) nextStyle.color = color;
    }
    for (const child of node.childNodes) visit(child, nextStyle);
  };
  for (const child of template.content.childNodes) visit(child, {});
  return runs.length ? runs : null;
}

function renderChatBubblePixels(line, distant, bubbleScale, newest) {
  if (!line?.canvas) return;
  const viewport = getOverlayViewport();
  const pixelRatioX = viewport.pixelRatioX;
  const pixelRatioY = viewport.pixelRatioY;
  const sliceScale = getChatBubbleSliceScale();
  // The distant LOD may compress a large bubble into the legacy small
  // bubble, but it must never enlarge a short message when crossing the
  // distance threshold.
  const bodyWidth = distant ? Math.min(48, line.width) : line.width;
  const bodyHeight = distant ? Math.min(48, line.mainHeight) : line.mainHeight;
  const rasterScaleX = pixelRatioX * bubbleScale;
  const rasterScaleY = pixelRatioY * bubbleScale;
  const canvasWidth = Math.max(1, Math.round(bodyWidth * rasterScaleX));
  const canvasBodyHeight = Math.max(1, Math.round(bodyHeight * rasterScaleY));
  const canvasTailHeight = Math.max(1, Math.round(CHAT_BUBBLE_TAIL_HEIGHT * rasterScaleY));
  const canvasHeight = canvasBodyHeight + canvasTailHeight;
  const fontSize = getChatBubbleFontSize();
  const signature = [
    distant ? "small" : "normal",
    newest ? "newest" : "stacked",
    line.text,
    line.metricsLines?.join("\u001f") || "",
    line.richText || "",
    bodyWidth,
    bodyHeight,
    fontSize,
    sliceScale,
    bubbleScale,
    pixelRatioX,
    pixelRatioY,
    chatBubbleTwemojiRevision,
    chatBubbleBodyImage ? "body" : "no-body",
    chatBubbleTailImage ? "tail" : "no-tail",
  ].join(":");
  if (line.renderSignature === signature) return;

  line.canvas.width = canvasWidth;
  line.canvas.height = canvasHeight;
  line.canvas.style.width = `${canvasWidth / pixelRatioX}px`;
  line.canvas.style.height = `${canvasHeight / pixelRatioY}px`;
  line.renderWidth = canvasWidth / pixelRatioX;
  line.renderBodyHeight = canvasBodyHeight / pixelRatioY;
  line.renderTailHeight = canvasTailHeight / pixelRatioY;
  line.renderSignature = signature;

  const context = line.canvas.getContext("2d");
  if (!context) return;
  // Keep the overlay's edges soft like the antialiased WebGL canvas.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.save();
  context.scale(rasterScaleX, rasterScaleY);
  if (chatBubbleBodyImage) {
    drawBubbleNineSlice(context, chatBubbleBodyImage, bodyWidth, bodyHeight, sliceScale);
  } else {
    drawBubbleFallback(context, bodyWidth, bodyHeight);
  }

  const tailWidth = 18;
  // Keep the tail flush with the slice body. The previous one-pixel overlap
  // became a visible fractional gap on displays whose pixel ratio was not 1.
  const tailTop = bodyHeight;
  if (newest || distant) {
    if (chatBubbleTailImage) {
      context.drawImage(
        chatBubbleTailImage,
        (bodyWidth - tailWidth) / 2,
        tailTop,
        tailWidth,
        CHAT_BUBBLE_TAIL_HEIGHT
      );
    } else {
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.moveTo(bodyWidth / 2 - 9, tailTop);
      context.lineTo(bodyWidth / 2 + 9, tailTop);
      context.lineTo(bodyWidth / 2, tailTop + CHAT_BUBBLE_TAIL_HEIGHT);
      context.closePath();
      context.fill();
    }
  }

  const lineHeight = CHAT_BUBBLE_LINE_HEIGHT;
  const lines = distant ? ["..."] : (line.metricsLines || [line.text]);
  context.font = `400 ${fontSize}px "Source Sans Pro", "Source Sans 3", system-ui, sans-serif`;
  context.fillStyle = "#171717";
  // drawChatBubbleTextLine computes the left edge of each centered run
  // itself, so the canvas must not apply a second center offset.
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const visibleLineCount = Math.min(
    lines.length,
    Math.max(1, Math.floor(bodyHeight / lineHeight))
  );
  const firstLineMetrics = context.measureText(lines[0] || "");
  const ascent = firstLineMetrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = firstLineMetrics.actualBoundingBoxDescent || fontSize * 0.2;
  const firstBaseline =
    (bodyHeight - visibleLineCount * lineHeight) / 2
    + lineHeight / 2
    + (ascent - descent) / 2
    + CHAT_BUBBLE_TEXT_Y_OFFSET;
  let richOffset = 0;
  for (let index = 0; index < visibleLineCount; index += 1) {
    richOffset = drawChatBubbleTextLine(
      context,
      lines[index],
      bodyWidth / 2,
      firstBaseline + index * lineHeight,
      fontSize,
      distant ? null : line.richRuns,
      richOffset
    );
  }
  context.restore();
}

function chatBubbleOrigin(originId) {
  if (originId === String(multiplayer.id || "") && player.model) {
    headWorldPositionForRoot(modelRoot?.userData?.r15 ? modelRoot : player.model, chatBubbleWorldPosition);
    return chatBubbleWorldPosition;
  }

  const remote = multiplayer.remotePlayers.get(originId);
  if (!remote?.group) return null;
  headWorldPositionForRoot(remote.model || remote.group, chatBubbleWorldPosition);
  return chatBubbleWorldPosition;
}

function removeChatBubbleLine(stack, line) {
  if (!stack || !line) return;
  line.element.remove();
  const index = stack.indexOf(line);
  if (index >= 0) stack.splice(index, 1);
}

function clearChatBubblesForOrigin(originId) {
  const stack = chatBubbleStacks.get(originId);
  if (!stack) return;
  for (const line of stack) line.element.remove();
  chatBubbleStacks.delete(originId);
}

function clearChatBubbles() {
  for (const stack of chatBubbleStacks.values()) {
    for (const line of stack) line.element.remove();
  }
  chatBubbleStacks.clear();
}

function createChatBubbleLine(originId, messageText, richText = null) {
  const richRuns = parseHardcoreBubbleRichText(richText);
  const richPlainText = richRuns?.map((run) => run.text).join("") || "";
  const text = sanitizeChatBubbleText(richPlainText || messageText);
  if (!text || !chatBubblesRoot) return null;

  let stack = chatBubbleStacks.get(originId);
  if (!stack) {
    stack = [];
    chatBubbleStacks.set(originId, stack);
  }

  // Match the old Roblox queue: three visible messages max; index 0 is the
  // oldest bubble at the top and the newest message sits at the bottom.
  while (stack.length >= CHAT_BUBBLE_MAX_LINES) {
    removeChatBubbleLine(stack, stack[0]);
  }

  const element = document.createElement("div");
  element.className = "chat-bubble";
  element.setAttribute("role", "presentation");
  const canvas = document.createElement("canvas");
  canvas.className = "chat-bubble-pixels";
  canvas.setAttribute("aria-hidden", "true");
  element.append(canvas);
  chatBubblesRoot.append(element);

  const metrics = measureChatBubbleText(text);
  element.style.width = `${metrics.width}px`;
  // Match the legacy BillboardGui: Size.Y.Offset is the body height and the
  // caret hangs below it instead of being included in that height.
  element.style.height = `${metrics.height}px`;

  const isLocal = originId === String(multiplayer.id || "");
  const [minLifetime, maxLifetime] = isLocal
    ? CHAT_BUBBLE_LIFETIME_LOCAL
    : CHAT_BUBBLE_LIFETIME_REMOTE;
  const lifetime = minLifetime + (maxLifetime - minLifetime) * Math.min(text.length / 75, 1);
  stack.push({
    element,
    canvas,
    text,
    width: metrics.width,
    mainHeight: metrics.height,
    metricsLines: metrics.lines,
    richText: richRuns ? String(richText) : "",
    richRuns,
    renderSignature: "",
    dieAt: performance.now() + lifetime * 1000,
  });
  return element;
}

function showChatBubble(message) {
  // Commands are still chat messages. They may also trigger an admin action,
  // but they must remain visible as bubbles like every other message.
  if (!message?.id) return;
  const richText = isOwnerName(message.username) ? message.richText : null;
  createChatBubbleLine(String(message.id), message.text, richText);
}

function projectChatBubbleOrigin(originId) {
  const origin = chatBubbleOrigin(originId);
  if (!origin) return null;
  const distance = camera.position.distanceTo(origin);
  const isLocal = originId === String(multiplayer.id || "");
  const distant = distance >= CHAT_BUBBLE_NEAR_DISTANCE;
  // These are the exact near/far StudsOffset values from the legacy script.
  chatBubbleProjectionWorld.copy(origin).add(
    isLocal
      ? (distant ? chatBubbleLocalFarOffset : chatBubbleLocalNearOffset)
      : (distant ? chatBubbleRemoteFarOffset : chatBubbleRemoteNearOffset)
  );
  chatBubbleProjection.copy(chatBubbleProjectionWorld).project(camera);
  const onScreen = chatBubbleProjection.z >= -1 && chatBubbleProjection.z <= 1 &&
    chatBubbleProjection.x >= -1 && chatBubbleProjection.x <= 1 &&
    chatBubbleProjection.y >= -1 && chatBubbleProjection.y <= 1;
  if (!onScreen) return { distance, onScreen: false };
  const viewport = getOverlayViewport();
  const { rect, pixelRatioX, pixelRatioY } = viewport;
  const screenX = rect.left + (chatBubbleProjection.x * 0.5 + 0.5) * rect.width;
  const screenY = rect.top + (-chatBubbleProjection.y * 0.5 + 0.5) * rect.height;
  return {
    distance,
    onScreen: true,
    x: rect.left + Math.round((screenX - rect.left) * pixelRatioX) / pixelRatioX,
    y: rect.top + Math.round((screenY - rect.top) * pixelRatioY) / pixelRatioY,
  };
}

function updateChatBubbles() {
  const now = performance.now();
  for (const [originId, stack] of chatBubbleStacks) {
    // Roblox's DestroyBubble waits for the FIFO front. A newer line can
    // expire first, but it stays behind the older lines until they fade out.
    const oldest = stack[0];
    if (oldest && now >= oldest.dieAt) {
      if (!oldest.fading) {
        oldest.fading = true;
        oldest.removeAt = now + (1000 / 1.5);
        oldest.element.classList.add("chat-bubble-fading");
      }
      if (now >= oldest.removeAt) removeChatBubbleLine(stack, oldest);
    }
    if (!stack.length) {
      chatBubbleStacks.delete(originId);
      continue;
    }

    const projection = projectChatBubbleOrigin(originId);
    if (!projection || !projection.onScreen || projection.distance >= CHAT_BUBBLE_MAX_DISTANCE) {
      for (const line of stack) {
        line.element.hidden = true;
        line.element.style.display = "none";
      }
      continue;
    }

    const distant = projection.distance >= CHAT_BUBBLE_NEAR_DISTANCE;
    // BillboardGui bubbles must layer by depth, not by DOM insertion order.
    // A newer message can be farther away than an older one, so give the
    // closest origin the highest stacking level on every update.
    const distanceLayer = Math.max(
      1,
      Math.round((CHAT_BUBBLE_MAX_DISTANCE - projection.distance) * 100)
    );
    let bottom = projection.y;
    const bubbleScale = getChatBubbleScale();
    const pixelRatio = getOverlayViewport().pixelRatioY;
    const tailGap = Math.round(CHAT_BUBBLE_TAIL_HEIGHT * bubbleScale * pixelRatio) / pixelRatio;

    for (let index = stack.length - 1; index >= 0; index--) {
      const line = stack[index];
      const element = line.element;
      const newest = index === stack.length - 1;
      element.hidden = distant ? !newest : false;
      if (element.hidden) continue;
      element.style.display = "block";

      element.classList.toggle("chat-bubble-small", distant);
      element.classList.toggle("chat-bubble-stacked", !newest && !distant);
      element.style.zIndex = String(distanceLayer);
      renderChatBubblePixels(line, distant, bubbleScale, newest);
      element.style.width = `${line.renderWidth}px`;
      element.style.height = `${line.renderBodyHeight}px`;
      element.style.left = `${projection.x}px`;
      const height = line.renderBodyHeight;
      const top = bottom - height;
      element.style.top = `${top}px`;
      // The legacy script moves the next bubble by the previous bubble's
      // Size.Y.Offset plus CHAT_BUBBLE_TAIL_HEIGHT. Keep that exact cadence;
      // when the user scales bubbles, use the rendered (scaled) distance.
      bottom = Math.round((bottom - height - (distant ? 0 : tailGap)) * pixelRatio) / pixelRatio;
    }
  }
}

function createAvatarPlasticMaterial(source, index) {
  // Keep only the original albedo texture. Roblox's non-PBR Plastic path is
  // a low-specular Phong-style material, not the GLB's glossy PBR preset.
  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    map: source?.map ?? null,
    specular: new THREE.Color(materialSettings.specular, materialSettings.specular, materialSettings.specular),
    shininess: 8,
    transparent: source?.transparent ?? false,
    opacity: source?.opacity ?? 1,
    alphaTest: source?.alphaTest ?? 0,
    side: source?.side ?? THREE.FrontSide,
  });
  material.name = `${source?.name || "Avatar"}_Plastic_${index}`;
  material.userData.originalTransparent = Boolean(source?.transparent);
  material.userData.originalOpacity = source?.opacity ?? 1;
  // Keep an immutable reference to the original GLB map. The local avatar
  // can later swap material.map to a saved custom texture; remote clones must
  // never use that already-swapped map as their default.
  material.userData.avatarBaseMap = source?.map ?? null;
  // Keep the original map available for remote clones. The local avatar may
  // later use a CanvasTexture, but that texture must never be shared with
  // another player's model.
  avatarBaseMaps.set(material.name, source?.map ?? null);
  if (!avatarTextureSourceImage && source?.map?.image) {
    avatarTextureSourceImage = source.map.image;
  }
  if (source?.map) avatarTextureMaterials.push(material);
  avatarLocalMaterials.push(material);
  return registerEditableMaterial(material);
}

function getActiveAvatarTextureMaterials() {
  return activeRigType === "r15" ? getR15BodyMaterials(modelRoot) : avatarTextureMaterials;
}

// ---------------------------------------------------------------------------
// AVATAR TEXTURE EDITOR — a small MS Paint-like canvas for the loaded albedo
// ---------------------------------------------------------------------------
const avatarEditor = document.getElementById("avatar-editor");
const avatarEditorToggle = document.getElementById("avatar-editor-toggle");
const avatarEditorClose = document.getElementById("avatar-editor-close");
const avatarEditorCanvas = document.getElementById("avatar-texture-canvas");
const avatarEditorStatus = document.getElementById("avatar-editor-status");
const avatarEditorApply = document.getElementById("avatar-editor-apply");
const avatarEditorClear = document.getElementById("avatar-editor-clear");
const avatarEditorUndo = document.getElementById("avatar-editor-undo");
const avatarEditorRedo = document.getElementById("avatar-editor-redo");
const avatarTemplateDownload = document.getElementById("avatar-template-download");
const avatarTemplateUpload = document.getElementById("avatar-template-upload");
const avatarBrushColor = document.getElementById("avatar-brush-color");
const avatarBrushSize = document.getElementById("avatar-brush-size");
const avatarBrushSizeValue = document.getElementById("avatar-brush-size-value");
const avatarBucketTolerance = document.getElementById("avatar-bucket-tolerance");
const avatarBucketToleranceValue = document.getElementById("avatar-bucket-tolerance-value");
const avatarBucketTransition = document.getElementById("avatar-bucket-transition");
const avatarShapeType = document.getElementById("avatar-shape-type");
const avatarLayerWidth = document.getElementById("avatar-layer-width");
const avatarLayerWidthValue = document.getElementById("avatar-layer-width-value");
const avatarLayerHeight = document.getElementById("avatar-layer-height");
const avatarLayerHeightValue = document.getElementById("avatar-layer-height-value");
const avatarLayerScale = document.getElementById("avatar-layer-scale");
const avatarLayerScaleValue = document.getElementById("avatar-layer-scale-value");
const avatarLayerRotation = document.getElementById("avatar-layer-rotation");
const avatarLayerRotationValue = document.getElementById("avatar-layer-rotation-value");
const avatarLayerSaturation = document.getElementById("avatar-layer-saturation");
const avatarLayerSaturationValue = document.getElementById("avatar-layer-saturation-value");
const avatarLayerContrast = document.getElementById("avatar-layer-contrast");
const avatarLayerContrastValue = document.getElementById("avatar-layer-contrast-value");
const avatarLayerHue = document.getElementById("avatar-layer-hue");
const avatarLayerHueValue = document.getElementById("avatar-layer-hue-value");
const avatarLayerPixel = document.getElementById("avatar-layer-pixel");
const avatarLayerFlip = document.getElementById("avatar-layer-flip");
const avatar3DDragModeButton = document.getElementById("avatar-3d-drag-mode");
const avatarLockAnimationInput = document.getElementById("avatar-lock-animation");
const avatarLockCameraInput = document.getElementById("avatar-lock-camera");
const avatarLayerAdd = document.getElementById("avatar-layer-add");
const avatarLayerDelete = document.getElementById("avatar-layer-delete");
const avatarLayerUp = document.getElementById("avatar-layer-up");
const avatarLayerDown = document.getElementById("avatar-layer-down");
const avatarImagePaste = document.getElementById("avatar-image-paste");
const avatarImageInsert = document.getElementById("avatar-image-insert");
const avatarLayerList = document.getElementById("avatar-layer-list");
const avatarLayerCount = document.getElementById("avatar-layer-count");
avatar3DDragModeButton.disabled = true;
const avatarToolButtons = [...document.querySelectorAll("[data-avatar-tool]")];
const avatarModeButtons = [...document.querySelectorAll("[data-avatar-mode]")];
const avatarBodyPartInputs = [...document.querySelectorAll("[data-avatar-body-part]")];
const avatarWorldHint = document.getElementById("avatar-world-hint");
const avatarEditorContext = avatarEditorCanvas.getContext("2d", { willReadFrequently: true });
let avatarEditorTool = "pencil";
let avatarEditorMode = "texture";
let avatarEditorDrawing = false;
let avatarEditorLastPoint = null;
let avatarEditorDefaultImageData = null;
// The true original template loaded from the avatar's model. Never replaced
// by an uploaded image, so Restore always reverts to this first template.
let avatarBaseTemplateImageData = null;
let avatarEditorHistory = [];
let avatarEditorHistoryIndex = -1;
let avatarLayers = [];
let avatarSelectedLayerId = null;
let avatarNextLayerId = 1;
let avatarLayerInteraction = null;
let avatarPixelBuffer = null;
let avatarColorTransformBuffer = null;
const avatarBodyPartVisibility = new Map(
  avatarBodyPartInputs.map((input) => [input.dataset.avatarBodyPart, input.checked])
);

function isGuestPlayer() {
  return multiplayer.isGuest === true;
}

// The name to show for the local guest. Prefer the server-confirmed name
// ("Guest N"); fall back to "Guest" so the nametag and player list reflect
// guest mode immediately, even before the server confirms the downgrade.
function localGuestDisplayName() {
  if (confirmedGuestUsername) return confirmedGuestUsername;
  if (guestModeRequested) {
    if (!localGuestNumber) localGuestNumber = 100 + Math.floor(Math.random() * 900);
    return `Guest ${localGuestNumber}`;
  }
  return multiplayer.username;
}

function updateAvatarEditorAccess() {
  const locked = !multiplayer.identityResolved || isGuestPlayer();
  avatarEditorToggle.disabled = locked || !avatarEditorReady;
  avatarEditorToggle.title = locked ? "Guest avatar is fixed" : "Edit avatar";
  avatarEditorToggle.setAttribute("aria-label", locked ? "Guest avatar is fixed" : "Edit avatar");
  avatarEditor.classList.toggle("is-guest-locked", locked);
  if (!locked) {
    for (const control of avatarEditor.querySelectorAll("[data-guest-locked='true']")) {
      control.disabled = false;
      control.removeAttribute("data-guest-locked");
    }
    if (avatarEditorReady) {
      updateAvatarHistoryButtons();
      avatarTemplateDownload.disabled = false;
      avatarTemplateUpload.disabled = false;
    }
    return;
  }
  for (const control of avatarEditor.querySelectorAll("input, select, button")) {
    if (control.id !== "avatar-editor-close") {
      control.disabled = true;
      control.dataset.guestLocked = "true";
    }
  }
  if (!avatarEditor.hidden) closeAvatarEditor();
}

function avatarBodyPartFromBoneName(name) {
  const normalized = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized.includes("head")) return "head";
  if (normalized.includes("leftarm") || normalized.includes("armleft")) return "leftArm";
  if (normalized.includes("rightarm") || normalized.includes("armright")) return "rightArm";
  if (normalized.includes("leftleg") || normalized.includes("legleft")) return "leftLeg";
  if (normalized.includes("rightleg") || normalized.includes("legright")) return "rightLeg";
  if (normalized.includes("torso") || normalized.includes("spine") || normalized.includes("chest")) {
    return "torso";
  }
  // Root/armature/end bones are structural helpers, not visible body parts.
  // Treating every unknown influence as torso was making the torso checkbox
  // hide arms and legs that shared those generic influences.
  return null;
}

function getAvatarTriangleBodyPart(mesh, vertexIndices) {
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  const bones = mesh.skeleton?.bones || [];
  const votes = new Map();
  for (const vertexIndex of vertexIndices) {
    for (let influence = 0; influence < 4; influence += 1) {
      const boneIndex = skinIndex.getComponent(vertexIndex, influence);
      const weight = skinWeight.getComponent(vertexIndex, influence);
      if (!weight) continue;
      const part = avatarBodyPartFromBoneName(bones[boneIndex]?.name);
      if (!part) continue;
      votes.set(part, (votes.get(part) || 0) + weight);
    }
  }
  let dominantPart = "torso";
  let dominantWeight = -1;
  for (const [part, weight] of votes) {
    if (weight > dominantWeight) {
      dominantPart = part;
      dominantWeight = weight;
    }
  }
  return dominantPart;
}

function splitAvatarMeshByBodyPart(mesh, baseMaterial) {
  const geometry = mesh.geometry;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const position = geometry.attributes.position;
  if (!skinIndex || !skinWeight || !position || !mesh.skeleton) return [baseMaterial];

  const indexArray = geometry.index?.array || null;
  const triangleCount = indexArray ? indexArray.length / 3 : position.count / 3;
  if (!triangleCount) return [baseMaterial];

  const partOrder = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];
  const partMaterialIndex = new Map(partOrder.map((part, index) => [part, index]));
  const materials = partOrder.map((part) => {
    const material = baseMaterial.clone();
    const avatarBaseMap = baseMaterial.userData?.avatarBaseMap
      || avatarBaseMaps.get(baseMaterial.name)
      || baseMaterial.map
      || null;
    material.name = `${baseMaterial.name}_${part}`;
    material.userData = {
      ...baseMaterial.userData,
      avatarBodyPart: part,
      avatarBaseMap,
      originalOpacity: baseMaterial.userData.originalOpacity ?? baseMaterial.opacity,
      originalTransparent: baseMaterial.userData.originalTransparent ?? baseMaterial.transparent,
      originalDepthWrite: baseMaterial.depthWrite,
    };
    avatarBaseMaps.set(material.name, avatarBaseMap);
    registerEditableMaterial(material);
    avatarTextureMaterials.push(material);
    avatarLocalMaterials.push(material);
    return material;
  });

  geometry.clearGroups();
  let currentPart = null;
  let groupStart = 0;
  let groupCount = 0;
  const flushGroup = () => {
    if (!currentPart || !groupCount) return;
    geometry.addGroup(groupStart, groupCount, partMaterialIndex.get(currentPart));
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertexIndices = indexArray
      ? [indexArray[triangle * 3], indexArray[triangle * 3 + 1], indexArray[triangle * 3 + 2]]
      : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
    const part = getAvatarTriangleBodyPart(mesh, vertexIndices);
    const indexStart = triangle * 3;
    if (part !== currentPart) {
      flushGroup();
      currentPart = part;
      groupStart = indexStart;
      groupCount = 3;
    } else {
      groupCount += 3;
    }
  }
  flushGroup();
  return materials;
}

function applyAvatarBodyPartVisibility() {
  if (!modelRoot) return;
  const previewActive = !avatarEditor.hidden && avatarEditorMode === "world";
  modelRoot.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const part = material.userData?.avatarBodyPart;
      if (!part) continue;
      const hidden = previewActive && avatarBodyPartVisibility.get(part) === false;
      material.visible = !hidden;
      material.opacity = hidden ? 0 : (material.userData.originalOpacity ?? 1);
      material.transparent = hidden || Boolean(material.userData.originalTransparent);
      material.depthWrite = hidden ? false : (material.userData.originalDepthWrite ?? true);
      material.needsUpdate = true;
    }
  });
}

function setAvatarEditorStatus(message) {
  avatarEditorStatus.textContent = message;
}

function syncLocalAnimationPlayback() {
  if (mixer) mixer.timeScale = avatarAnimationLocked || player.flyMode ? 0 : 1;
}

function setAvatarAnimationLocked(locked) {
  avatarAnimationLocked = Boolean(locked);
  avatarLockAnimationInput.checked = avatarAnimationLocked;
  syncLocalAnimationPlayback();
  if (avatarAnimationLocked) setAvatarEditorStatus("Animation locked");
}

function setAvatarCameraLocked(locked) {
  avatarCameraLocked = Boolean(locked);
  avatarLockCameraInput.checked = avatarCameraLocked;
  if (avatarCameraLocked) {
    avatarCameraLockSnapshot = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
    setAvatarEditorStatus("Camera locked");
  } else {
    avatarCameraLockSnapshot = null;
  }
}

function avatarCanvasPoint(event) {
  const rect = avatarEditorCanvas.getBoundingClientRect();
  return {
    x: THREE.MathUtils.clamp(
      (event.clientX - rect.left) * avatarEditorCanvas.width / rect.width,
      0,
      avatarEditorCanvas.width
    ),
    y: THREE.MathUtils.clamp(
      (event.clientY - rect.top) * avatarEditorCanvas.height / rect.height,
      0,
      avatarEditorCanvas.height
    ),
  };
}

function createAvatarLayerCanvas(width = avatarEditorCanvas.width, height = avatarEditorCanvas.height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function createAvatarLayer(kind, name, options = {}) {
  const width = options.canvas?.width || options.width || avatarEditorCanvas.width;
  const height = options.canvas?.height || options.height || avatarEditorCanvas.height;
  const layer = {
    id: `avatar-layer-${avatarNextLayerId++}`,
    name: name || `${kind[0].toUpperCase()}${kind.slice(1)} layer`,
    kind,
    visible: true,
    locked: Boolean(options.locked),
    opacity: 1,
    x: Number.isFinite(options.x) ? options.x : 0,
    y: Number.isFinite(options.y) ? options.y : 0,
    width: Number.isFinite(options.displayWidth) ? options.displayWidth : width,
    height: Number.isFinite(options.displayHeight) ? options.displayHeight : height,
    baseWidth: Number.isFinite(options.baseWidth) ? options.baseWidth : width,
    baseHeight: Number.isFinite(options.baseHeight) ? options.baseHeight : height,
    rotation: 0,
    flipY: false,
    saturation: 0,
    contrast: 0,
    hue: 0,
    pixelEffect: false,
    shape: options.shape || null,
    canvas: options.canvas || createAvatarLayerCanvas(width, height),
  };
  return layer;
}

function getSelectedAvatarLayer() {
  return avatarLayers.find((layer) => layer.id === avatarSelectedLayerId) || avatarLayers[avatarLayers.length - 1] || null;
}

function setSelectedAvatarLayer(id) {
  const layer = avatarLayers.find((item) => item.id === id);
  if (!layer) return;
  avatarSelectedLayerId = id;
  if (layer.kind !== "paint") setAvatarEditorTool("select");
  updateAvatarLayerList();
  updateAvatarLayerControls();
  refreshAvatarEditorCanvas();
}

function getAvatarPaintLayer(create = true) {
  const selected = getSelectedAvatarLayer();
  if (selected?.kind === "paint" && !selected.locked) return selected;
  if (!create) return selected?.kind === "paint" ? selected : null;
  const layer = createAvatarLayer("paint", "Paint layer");
  avatarLayers.push(layer);
  avatarSelectedLayerId = layer.id;
  updateAvatarLayerList();
  updateAvatarLayerControls();
  return layer;
}

function drawAvatarShape(context, layer) {
  const width = layer.width;
  const height = layer.height;
  const shape = layer.shape || "rectangle";
  context.beginPath();
  if (shape === "circle") {
    context.arc(0, 0, Math.min(width, height) / 2, 0, Math.PI * 2);
  } else if (shape === "triangle") {
    context.moveTo(0, -height / 2);
    context.lineTo(width / 2, height / 2);
    context.lineTo(-width / 2, height / 2);
    context.closePath();
  } else if (shape === "star") {
    const points = 10;
    for (let index = 0; index < points; index += 1) {
      const radius = index % 2 === 0 ? Math.min(width, height) / 2 : Math.min(width, height) * 0.22;
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  } else if (shape === "line") {
    context.moveTo(-width / 2, 0);
    context.lineTo(width / 2, 0);
    context.lineWidth = Math.max(1, Math.min(width, height) * 0.12);
    context.strokeStyle = layer.color || avatarBrushColor.value;
    context.stroke();
    return;
  } else {
    context.rect(-width / 2, -height / 2, width, height);
  }
  context.fillStyle = layer.color || avatarBrushColor.value;
  context.fill();
}

function getAvatarLayerFilter(layer) {
  const saturation = 1 + Math.max(0, Number(layer.saturation) || 0) / 2;
  const contrast = 1 + Math.max(0, Number(layer.contrast) || 0) / 2;
  const hue = Number(layer.hue) || 0;
  return `saturate(${saturation}) contrast(${contrast}) hue-rotate(${hue}deg)`;
}

function applyAvatarColorTransforms(canvas, layer) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const saturationValue = THREE.MathUtils.clamp(Number(layer.saturation) || 0, -2, 2);
  const contrastValue = THREE.MathUtils.clamp(Number(layer.contrast) || 0, -2, 2);
  const hueDeg = (Number(layer.hue) || 0) % 360;
  // Negative saturation changes chroma around the pixel's luminance. This
  // makes -1 grayscale and -2 inverted saturation without changing brightness.
  const saturation = saturationValue < 0 ? 1 + saturationValue : 1 + saturationValue / 2;
  const contrast = contrastValue < 0 ? 1 + contrastValue : 1 + contrastValue / 2;
  // Precompute the hue-rotation matrix (RGB -> rotated RGB) so every pixel is
  // transformed cheaply in the same loop as saturation/contrast.
  const hueRad = hueDeg * Math.PI / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const lumR = 0.213, lumG = 0.715, lumB = 0.072;
  const m00 = lumR + cosH * (1 - lumR) + sinH * -lumR;
  const m01 = lumG + cosH * -lumG + sinH * lumG;
  const m02 = lumB + cosH * -lumB + sinH * lumB;
  const m10 = lumR + cosH * -lumR + sinH * 0.143;
  const m11 = lumG + cosH * (1 - lumG) + sinH * 0.140;
  const m12 = lumB + cosH * -lumB + sinH * -0.283;
  const m20 = lumR + cosH * -lumR + sinH * -0.787;
  const m21 = lumG + cosH * -lumG + sinH * 0.715;
  const m22 = lumB + cosH * (1 - lumB) + sinH * 0.072;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    let contrastRed = (luminance + (red - luminance) * saturation - 0.5) * contrast + 0.5;
    let contrastGreen = (luminance + (green - luminance) * saturation - 0.5) * contrast + 0.5;
    let contrastBlue = (luminance + (blue - luminance) * saturation - 0.5) * contrast + 0.5;
    if (hueDeg !== 0) {
      const hueRed = m00 * contrastRed + m01 * contrastGreen + m02 * contrastBlue;
      const hueGreen = m10 * contrastRed + m11 * contrastGreen + m12 * contrastBlue;
      const hueBlue = m20 * contrastRed + m21 * contrastGreen + m22 * contrastBlue;
      contrastRed = hueRed;
      contrastGreen = hueGreen;
      contrastBlue = hueBlue;
    }
    pixels[index] = Math.round(THREE.MathUtils.clamp(contrastRed, 0, 1) * 255);
    pixels[index + 1] = Math.round(THREE.MathUtils.clamp(contrastGreen, 0, 1) * 255);
    pixels[index + 2] = Math.round(THREE.MathUtils.clamp(contrastBlue, 0, 1) * 255);
  }
  context.putImageData(image, 0, 0);
}

function drawAvatarLayerContent(context, layer) {
  if (layer.kind === "shape") {
    drawAvatarShape(context, layer);
    return;
  }
  if (!layer.canvas) return;
  const source = layer.canvas;
  if (layer.pixelEffect) {
    const pixelWidth = Math.max(1, Math.round(source.width / 8));
    const pixelHeight = Math.max(1, Math.round(source.height / 8));
    if (!avatarPixelBuffer || avatarPixelBuffer.width !== pixelWidth || avatarPixelBuffer.height !== pixelHeight) {
      avatarPixelBuffer = createAvatarLayerCanvas(pixelWidth, pixelHeight);
    }
    const pixelContext = avatarPixelBuffer.getContext("2d");
    pixelContext.imageSmoothingEnabled = false;
    pixelContext.clearRect(0, 0, pixelWidth, pixelHeight);
    pixelContext.drawImage(source, 0, 0, pixelWidth, pixelHeight);
    context.imageSmoothingEnabled = false;
    context.drawImage(avatarPixelBuffer, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    return;
  }
  context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
}

function drawAvatarLayer(context, layer) {
  if (!layer.visible || layer.opacity <= 0) return;
  const hasNegativeColorTransform = Number(layer.saturation) < 0 || Number(layer.contrast) < 0 || Number(layer.hue) !== 0;
  context.save();
  context.globalAlpha = layer.opacity;
  context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  context.rotate((layer.rotation || 0) * Math.PI / 180);
  context.scale(1, layer.flipY ? -1 : 1);
  if (hasNegativeColorTransform) {
    const bufferWidth = Math.max(1, Math.ceil(layer.width));
    const bufferHeight = Math.max(1, Math.ceil(layer.height));
    if (!avatarColorTransformBuffer || avatarColorTransformBuffer.width !== bufferWidth || avatarColorTransformBuffer.height !== bufferHeight) {
      avatarColorTransformBuffer = createAvatarLayerCanvas(bufferWidth, bufferHeight);
    }
    const bufferContext = avatarColorTransformBuffer.getContext("2d");
    bufferContext.clearRect(0, 0, bufferWidth, bufferHeight);
    bufferContext.save();
    bufferContext.translate(bufferWidth / 2, bufferHeight / 2);
    drawAvatarLayerContent(bufferContext, layer);
    bufferContext.restore();
    applyAvatarColorTransforms(avatarColorTransformBuffer, layer);
    context.filter = "none";
    context.drawImage(avatarColorTransformBuffer, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  } else {
    context.filter = getAvatarLayerFilter(layer);
    drawAvatarLayerContent(context, layer);
  }
  context.restore();
}

function getAvatarLayerBounds(layer) {
  return { left: layer.x, top: layer.y, right: layer.x + layer.width, bottom: layer.y + layer.height };
}

function renderAvatarLayerSelection() {
  const layer = getSelectedAvatarLayer();
  if (!layer || avatarEditorTool !== "select") return;
  let bounds = null;
  const areaInteraction = avatarLayerInteraction?.mode === "select-area" &&
    avatarLayerInteraction.layerId === layer.id;
  if (layer.kind !== "paint") {
    bounds = getAvatarLayerBounds(layer);
  } else if (areaInteraction) {
    bounds = normalizeAvatarSelection(avatarLayerInteraction.start, avatarLayerInteraction.current);
  }
  if (!bounds) return;
  const left = bounds.left ?? bounds.x;
  const top = bounds.top ?? bounds.y;
  const width = layer.kind === "paint" ? bounds.width : layer.width;
  const height = layer.kind === "paint" ? bounds.height : layer.height;
  avatarEditorContext.save();
  avatarEditorContext.strokeStyle = "#1769aa";
  avatarEditorContext.lineWidth = Math.max(1, avatarEditorCanvas.width / 512);
  avatarEditorContext.setLineDash([6, 4]);
  avatarEditorContext.strokeRect(left, top, width, height);
  avatarEditorContext.setLineDash([]);
  if (layer.kind !== "paint") {
    avatarEditorContext.fillStyle = "#ffffff";
    avatarEditorContext.strokeStyle = "#1769aa";
    const handleSize = Math.max(6, avatarEditorCanvas.width / 64);
    avatarEditorContext.fillRect(bounds.right - handleSize / 2, bounds.bottom - handleSize / 2, handleSize, handleSize);
    avatarEditorContext.strokeRect(bounds.right - handleSize / 2, bounds.bottom - handleSize / 2, handleSize, handleSize);
  }
  avatarEditorContext.restore();
}

function normalizeAvatarSelection(start, end) {
  const left = THREE.MathUtils.clamp(Math.min(start.x, end.x), 0, avatarEditorCanvas.width);
  const top = THREE.MathUtils.clamp(Math.min(start.y, end.y), 0, avatarEditorCanvas.height);
  const right = THREE.MathUtils.clamp(Math.max(start.x, end.x), 0, avatarEditorCanvas.width);
  const bottom = THREE.MathUtils.clamp(Math.max(start.y, end.y), 0, avatarEditorCanvas.height);
  return {
    left,
    top,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}

function refreshAvatarEditorCanvas(includeSelection = true) {
  if (!avatarEditorCanvas.width || !avatarEditorCanvas.height) return;
  avatarEditorContext.save();
  avatarEditorContext.clearRect(0, 0, avatarEditorCanvas.width, avatarEditorCanvas.height);
  avatarEditorContext.imageSmoothingEnabled = false;
  for (const layer of avatarLayers) drawAvatarLayer(avatarEditorContext, layer);
  if (includeSelection) renderAvatarLayerSelection();
  avatarEditorContext.restore();
}

function updateAvatarCanvasTexture() {
  refreshAvatarEditorCanvas(false);
  let textureImage = avatarEditorCanvas;
  if (activeRigType === "r15") {
    if (!avatarEditorOpaqueCanvas) avatarEditorOpaqueCanvas = document.createElement("canvas");
    avatarEditorOpaqueCanvas.width = avatarEditorCanvas.width;
    avatarEditorOpaqueCanvas.height = avatarEditorCanvas.height;
    const opaqueContext = avatarEditorOpaqueCanvas.getContext("2d");
    opaqueContext.clearRect(0, 0, avatarEditorOpaqueCanvas.width, avatarEditorOpaqueCanvas.height);
    opaqueContext.fillStyle = "#ffffff";
    opaqueContext.fillRect(0, 0, avatarEditorOpaqueCanvas.width, avatarEditorOpaqueCanvas.height);
    opaqueContext.drawImage(avatarEditorCanvas, 0, 0);
    textureImage = avatarEditorOpaqueCanvas;
  }
  if (!avatarEditorTexture) {
    avatarEditorTexture = new THREE.CanvasTexture(textureImage);
    avatarEditorTexture.colorSpace = THREE.SRGBColorSpace;
    avatarEditorTexture.wrapS = THREE.ClampToEdgeWrapping;
    avatarEditorTexture.wrapT = THREE.ClampToEdgeWrapping;
  } else if (avatarEditorTexture.image !== textureImage) {
    avatarEditorTexture.image = textureImage;
    if (avatarEditorTexture.source) avatarEditorTexture.source.data = textureImage;
  }
  avatarEditorTexture.flipY = activeRigType === "r15";
  avatarEditorTexture.needsUpdate = true;
  if (!avatarEditor.hidden && avatarEditorMode === "texture" && avatarEditorTool === "select") {
    renderAvatarLayerSelection();
  }
  scheduleAvatarPreviewBroadcast();
}

const avatarPreviewCanvas = document.createElement("canvas");
const avatarPreviewContext = avatarPreviewCanvas.getContext("2d");
let avatarPreviewTimer = null;
let lastAvatarPreviewSent = "";

function broadcastAvatarPreview() {
  avatarPreviewTimer = null;
  if (!avatarEditorReady || !multiplayer.connected || !multiplayer.room) return;
  if (avatarEditor.hidden) return;
  const sourceWidth = avatarEditorCanvas.width;
  const sourceHeight = avatarEditorCanvas.height;
  if (!sourceWidth || !sourceHeight) return;
  const previewCandidates = [
    [384, 0.68],
    [320, 0.64],
    [256, 0.62],
  ];
  let data = "";
  for (const [previewSize, quality] of previewCandidates) {
    avatarPreviewCanvas.width = previewSize;
    avatarPreviewCanvas.height = Math.max(1, Math.round(previewSize * sourceHeight / sourceWidth));
    avatarPreviewContext.clearRect(0, 0, avatarPreviewCanvas.width, avatarPreviewCanvas.height);
    avatarPreviewContext.imageSmoothingEnabled = true;
    avatarPreviewContext.imageSmoothingQuality = "high";
    avatarPreviewContext.drawImage(
      avatarEditorCanvas,
      0,
      0,
      avatarPreviewCanvas.width,
      avatarPreviewCanvas.height
    );
    data = avatarPreviewCanvas.toDataURL("image/webp", quality);
    if (data.length <= 60000) break;
  }
  if (!data.startsWith("data:image/")) return;
  if (data === lastAvatarPreviewSent) return;
  try {
    multiplayer.room.send({ type: "avatarPreview", data });
    lastAvatarPreviewSent = data;
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "avatar preview send failed");
  }
}

function scheduleAvatarPreviewBroadcast() {
  if (avatarPreviewTimer || !avatarEditorReady) return;
  avatarPreviewTimer = window.setTimeout(broadcastAvatarPreview, 450);
}

function cloneAvatarLayer(layer) {
  const copy = { ...layer, shape: layer.shape, canvas: null };
  if (layer.canvas) {
    copy.canvas = createAvatarLayerCanvas(layer.canvas.width, layer.canvas.height);
    copy.canvas.getContext("2d").drawImage(layer.canvas, 0, 0);
  }
  return copy;
}

function snapshotAvatarLayers() {
  return { layers: avatarLayers.map(cloneAvatarLayer), selectedId: avatarSelectedLayerId };
}

function restoreAvatarSnapshot(snapshot) {
  avatarLayers = (snapshot?.layers || []).map(cloneAvatarLayer);
  avatarSelectedLayerId = avatarLayers.some((layer) => layer.id === snapshot?.selectedId)
    ? snapshot.selectedId
    : avatarLayers[avatarLayers.length - 1]?.id || null;
  refreshAvatarEditorCanvas();
  updateAvatarLayerList();
  updateAvatarLayerControls();
}

function updateAvatarHistoryButtons() {
  avatarEditorUndo.disabled = avatarEditorHistoryIndex <= 0;
  avatarEditorRedo.disabled = avatarEditorHistoryIndex < 0 || avatarEditorHistoryIndex >= avatarEditorHistory.length - 1;
}

function recordAvatarHistory() {
  if (!avatarEditorReady && !avatarEditorDefaultImageData) return;
  const nextState = snapshotAvatarLayers();
  avatarEditorHistory = avatarEditorHistory.slice(0, avatarEditorHistoryIndex + 1);
  avatarEditorHistory.push(nextState);
  // Keep the editor responsive even after many strokes.
  if (avatarEditorHistory.length > 50) avatarEditorHistory.shift();
  avatarEditorHistoryIndex = avatarEditorHistory.length - 1;
  updateAvatarHistoryButtons();
}

function restoreAvatarHistory(index) {
  if (index < 0 || index >= avatarEditorHistory.length) return;
  avatarEditorHistoryIndex = index;
  restoreAvatarSnapshot(avatarEditorHistory[index]);
  updateAvatarCanvasTexture();
  updateAvatarHistoryButtons();
}

function restoreDefaultAvatarTexture() {
  const baseData = avatarBaseTemplateImageData || avatarEditorDefaultImageData;
  if (!baseData) return;
  const baseCanvas = createAvatarLayerCanvas(avatarEditorCanvas.width, avatarEditorCanvas.height);
  baseCanvas.getContext("2d").putImageData(baseData, 0, 0);
  const baseLayer = createAvatarLayer("paint", "Base texture", { canvas: baseCanvas, locked: false });
  avatarLayers = [baseLayer];
  avatarSelectedLayerId = baseLayer.id;
  avatarEditorDefaultImageData = baseCanvas.getContext("2d").getImageData(0, 0, avatarEditorCanvas.width, avatarEditorCanvas.height);
  updateAvatarCanvasTexture();
  updateAvatarLayerList();
  updateAvatarLayerControls();
  recordAvatarHistory();
  setAvatarEditorStatus("Default texture restored");
}

function updateAvatarLayerList() {
  if (!avatarLayerList) return;
  avatarLayerList.replaceChildren();
  const ordered = [...avatarLayers].reverse();
  for (const layer of ordered) {
    const row = document.createElement("div");
    row.className = "avatar-layer-row";
    row.classList.toggle("active", layer.id === avatarSelectedLayerId);
    row.title = layer.locked ? "Base texture" : "Select layer";
    row.addEventListener("click", () => setSelectedAvatarLayer(layer.id));

    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.textContent = layer.visible ? "◉" : "○";
    visibility.title = layer.visible ? "Hide layer" : "Show layer";
    visibility.addEventListener("click", (event) => {
      event.stopPropagation();
      layer.visible = !layer.visible;
      updateAvatarLayerList();
      updateAvatarCanvasTexture();
      recordAvatarHistory();
    });
    const details = document.createElement("span");
    details.className = "avatar-layer-name";
    details.append(document.createTextNode(layer.name));
    const kind = document.createElement("small");
    kind.className = "avatar-layer-kind";
    kind.textContent = layer.kind;
    details.append(kind);
    const lock = document.createElement("button");
    lock.type = "button";
    lock.textContent = layer.locked ? "🔒" : "·";
    lock.title = layer.locked ? "Unlock layer" : "Lock layer";
    lock.addEventListener("click", (event) => {
      event.stopPropagation();
      layer.locked = !layer.locked;
      updateAvatarLayerList();
      updateAvatarLayerControls();
    });
    row.append(visibility, details, lock);
    avatarLayerList.append(row);
  }
  avatarLayerCount.textContent = String(avatarLayers.length);
}

function updateAvatarLayerControls() {
  const layer = getSelectedAvatarLayer();
  const hasTransform = Boolean(layer && layer.kind !== "paint");
  const width = hasTransform ? layer.width : 0;
  const height = hasTransform ? layer.height : 0;
  const baseWidth = layer?.baseWidth || layer?.canvas?.width || avatarEditorCanvas.width;
  const scale = layer ? Math.round((layer.width / Math.max(1, baseWidth)) * 100) : 100;
  avatarLayerScale.value = String(THREE.MathUtils.clamp(scale, 10, 300));
  avatarLayerScaleValue.textContent = `${avatarLayerScale.value}%`;
  const rotation = layer?.kind !== "paint" ? Math.round(layer?.rotation || 0) : 0;
  avatarLayerRotation.value = String(rotation);
  avatarLayerRotationValue.textContent = hasTransform ? `${rotation}°` : "—";
  avatarLayerWidth.value = String(Math.max(2, Math.round(width)));
  avatarLayerHeight.value = String(Math.max(2, Math.round(height)));
  avatarLayerWidthValue.textContent = hasTransform ? `${Math.round(width)}px` : "—";
  avatarLayerHeightValue.textContent = hasTransform ? `${Math.round(height)}px` : "—";
  avatarLayerSaturation.value = String(layer?.saturation || 0);
  avatarLayerContrast.value = String(layer?.contrast || 0);
  avatarLayerHue.value = String(layer?.hue || 0);
  avatarLayerSaturationValue.textContent = String(layer?.saturation || 0);
  avatarLayerContrastValue.textContent = String(layer?.contrast || 0);
  avatarLayerHueValue.textContent = layer ? `${Math.round(layer.hue || 0)}°` : "0°";
  avatarLayerPixel.classList.toggle("active", Boolean(layer?.pixelEffect));
  avatarLayerFlip.textContent = layer?.flipY ? "Flip back" : "Flip upside down";
  avatarLayerScale.disabled = !hasTransform;
  avatarLayerRotation.disabled = !hasTransform;
  avatarLayerWidth.disabled = !hasTransform;
  avatarLayerHeight.disabled = !hasTransform;
  avatarLayerSaturation.disabled = !layer;
  avatarLayerContrast.disabled = !layer;
  avatarLayerHue.disabled = !layer;
  avatarLayerPixel.disabled = !hasTransform;
  avatarLayerFlip.disabled = !layer;
  avatarLayerDelete.disabled = !layer;
  avatarLayerUp.disabled = !layer || avatarLayers.indexOf(layer) >= avatarLayers.length - 1;
  avatarLayerDown.disabled = !layer || avatarLayers.indexOf(layer) <= 0;
}

function addAvatarPaintLayer() {
  const layer = createAvatarLayer("paint", `Paint ${avatarLayers.filter((item) => item.kind === "paint").length + 1}`);
  avatarLayers.push(layer);
  avatarSelectedLayerId = layer.id;
  updateAvatarLayerList();
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
  setAvatarEditorStatus("Paint layer added");
}

function addAvatarImageLayer(image, filename = "Image") {
  if (!image) return;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return;
  const maxSize = Math.min(avatarEditorCanvas.width, avatarEditorCanvas.height) * 0.6;
  const ratio = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const imageCanvas = createAvatarLayerCanvas(sourceWidth, sourceHeight);
  imageCanvas.getContext("2d").drawImage(image, 0, 0, sourceWidth, sourceHeight);
  const selected = getSelectedAvatarLayer();
  if (selected?.kind === "image" && !selected.locked) {
    const centerX = selected.x + selected.width / 2;
    const centerY = selected.y + selected.height / 2;
    selected.canvas = imageCanvas;
    selected.name = filename.replace(/\.[^.]+$/, "") || "Image";
    selected.baseWidth = sourceWidth;
    selected.baseHeight = sourceHeight;
    selected.width = sourceWidth * ratio;
    selected.height = sourceHeight * ratio;
    selected.x = centerX - selected.width / 2;
    selected.y = centerY - selected.height / 2;
    setAvatarEditorTool("select");
    updateAvatarLayerList();
    updateAvatarLayerControls();
    updateAvatarCanvasTexture();
    recordAvatarHistory();
    setAvatarEditorStatus(`${filename} placed in the selected image layer`);
    return;
  }
  const layer = createAvatarLayer("image", filename.replace(/\.[^.]+$/, "") || "Image", {
    canvas: imageCanvas,
    baseWidth: sourceWidth,
    baseHeight: sourceHeight,
    x: (avatarEditorCanvas.width - sourceWidth * ratio) / 2,
    y: (avatarEditorCanvas.height - sourceHeight * ratio) / 2,
    displayWidth: sourceWidth * ratio,
    displayHeight: sourceHeight * ratio,
  });
  avatarLayers.push(layer);
  avatarSelectedLayerId = layer.id;
  setAvatarEditorTool("select");
  updateAvatarLayerList();
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
  setAvatarEditorStatus(`${filename} inserted as a layer`);
}

function addAvatarShapeLayer() {
  const size = Math.min(avatarEditorCanvas.width, avatarEditorCanvas.height) * 0.35;
  const layer = createAvatarLayer("shape", `${avatarShapeType.value} shape`, {
    shape: avatarShapeType.value,
    baseWidth: size,
    baseHeight: size,
    x: (avatarEditorCanvas.width - size) / 2,
    y: (avatarEditorCanvas.height - size) / 2,
    displayWidth: size,
    displayHeight: size,
  });
  layer.color = avatarBrushColor.value;
  avatarLayers.push(layer);
  avatarSelectedLayerId = layer.id;
  setAvatarEditorTool("select");
  updateAvatarLayerList();
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
  setAvatarEditorStatus(`${avatarShapeType.value} added as a layer`);
}

function handleAvatarImageFile(file) {
  if (isGuestPlayer()) return;
  if (!file || !file.type.startsWith("image/")) return;
  const image = new Image();
  image.onload = () => {
    addAvatarImageLayer(image, file.name);
    URL.revokeObjectURL(image.src);
  };
  image.onerror = () => {
    URL.revokeObjectURL(image.src);
    setAvatarEditorStatus("Could not load that image");
  };
  image.src = URL.createObjectURL(file);
}

async function pasteAvatarImage() {
  try {
    if (!navigator.clipboard?.read) throw new Error("Clipboard image read unavailable");
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((value) => value.startsWith("image/"));
      if (!type) continue;
      handleAvatarImageFile(new File([await item.getType(type)], `pasted-image.${type.split("/")[1]}` , { type }));
      return;
    }
    throw new Error("No image in clipboard");
  } catch (error) {
    setAvatarEditorStatus("Clipboard image unavailable �� use Insert image");
  }
}

function resizeSelectedAvatarLayer() {
  const layer = getSelectedAvatarLayer();
  if (!layer || layer.kind === "paint") return;
  const baseWidth = layer.baseWidth || layer.canvas?.width || layer.width;
  const baseHeight = layer.baseHeight || layer.canvas?.height || layer.height;
  const scale = Number(avatarLayerScale.value) / 100;
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  layer.width = Math.max(2, baseWidth * scale);
  layer.height = Math.max(2, baseHeight * scale);
  layer.x = centerX - layer.width / 2;
  layer.y = centerY - layer.height / 2;
  avatarLayerScaleValue.textContent = `${avatarLayerScale.value}%`;
  updateAvatarCanvasTexture();
}

function resizeSelectedAvatarLayerAxis(axis) {
  const layer = getSelectedAvatarLayer();
  if (!layer || layer.kind === "paint") return;
  const control = axis === "width" ? avatarLayerWidth : avatarLayerHeight;
  const value = THREE.MathUtils.clamp(
    Number(control.value) || 2,
    2,
    4096
  );
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  layer[axis] = value;
  layer.x = centerX - layer.width / 2;
  layer.y = centerY - layer.height / 2;
  control.value = String(Math.round(value));
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
}

function extractAvatarSelectedArea(layer, bounds) {
  const x = Math.max(0, Math.floor(bounds.x));
  const y = Math.max(0, Math.floor(bounds.y));
  const width = Math.min(layer.canvas.width - x, Math.max(1, Math.floor(bounds.width)));
  const height = Math.min(layer.canvas.height - y, Math.max(1, Math.floor(bounds.height)));
  if (width < 2 || height < 2) return false;
  const selectedCanvas = createAvatarLayerCanvas(width, height);
  selectedCanvas.getContext("2d").drawImage(layer.canvas, x, y, width, height, 0, 0, width, height);
  layer.canvas.getContext("2d").clearRect(x, y, width, height);
  const selectedLayer = createAvatarLayer("image", "Selected area", {
    canvas: selectedCanvas,
    baseWidth: width,
    baseHeight: height,
    x,
    y,
    displayWidth: width,
    displayHeight: height,
  });
  avatarLayers.push(selectedLayer);
  avatarSelectedLayerId = selectedLayer.id;
  setAvatarEditorTool("select");
  updateAvatarLayerList();
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  setAvatarEditorStatus("Selected area is now resizable");
  return true;
}

function avatarColorToRgba(color) {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  ];
}

function fillAvatarRegion(point) {
  const width = avatarEditorCanvas.width;
  const height = avatarEditorCanvas.height;
  refreshAvatarEditorCanvas();
  const image = avatarEditorContext.getImageData(0, 0, width, height);
  const pixels = image.data;
  const startX = Math.min(width - 1, Math.max(0, Math.floor(point.x)));
  const startY = Math.min(height - 1, Math.max(0, Math.floor(point.y)));
  const startIndex = (startY * width + startX) * 4;
  const target = [
    pixels[startIndex],
    pixels[startIndex + 1],
    pixels[startIndex + 2],
    pixels[startIndex + 3],
  ];
  const replacement = avatarColorToRgba(avatarBrushColor.value);
  const tolerance = Number(avatarBucketTolerance.value);
  const matchesTarget = (pixelIndex) => {
    const alpha = pixels[pixelIndex + 3];
    if (Math.abs(alpha - target[3]) > tolerance) return false;
    if (target[3] < tolerance) return alpha < tolerance;
    return Math.abs(pixels[pixelIndex] - target[0]) <= tolerance &&
      Math.abs(pixels[pixelIndex + 1] - target[1]) <= tolerance &&
      Math.abs(pixels[pixelIndex + 2] - target[2]) <= tolerance;
  };

  if (matchesTarget(startIndex) && target.every((value, channel) => value === replacement[channel])) {
    return false;
  }

  const stack = [startY * width + startX];
  const visited = new Uint8Array(width * height);
  const distances = new Int32Array(width * height);
  distances.fill(-1);
  distances[startY * width + startX] = 0;
  const filledLocations = [];
  let filled = 0;
  let maxDistance = 0;
  while (stack.length) {
    const location = stack.pop();
    if (visited[location]) continue;
    visited[location] = 1;
    const x = location % width;
    const y = Math.floor(location / width);
    const pixelIndex = location * 4;
    if (!matchesTarget(pixelIndex)) continue;
    pixels[pixelIndex] = replacement[0];
    pixels[pixelIndex + 1] = replacement[1];
    pixels[pixelIndex + 2] = replacement[2];
    pixels[pixelIndex + 3] = replacement[3];
    filledLocations.push(location);
    filled++;
    maxDistance = Math.max(maxDistance, distances[location]);
    const neighbors = [];
    if (x > 0) neighbors.push(location - 1);
    if (x < width - 1) neighbors.push(location + 1);
    if (y > 0) neighbors.push(location - width);
    if (y < height - 1) neighbors.push(location + width);
    for (const neighbor of neighbors) {
      if (distances[neighbor] >= 0) continue;
      distances[neighbor] = distances[location] + 1;
      stack.push(neighbor);
    }
  }
  if (!filled) return false;
  const selected = getSelectedAvatarLayer();
  const paintLayer = selected?.kind === "paint" && !selected.locked
    ? selected
    : createAvatarLayer("paint", "Bucket fill");
  if (paintLayer !== selected) {
    avatarLayers.push(paintLayer);
    avatarSelectedLayerId = paintLayer.id;
  }
  const paintContext = paintLayer.canvas.getContext("2d");
  const output = paintLayer === selected
    ? paintContext.getImageData(0, 0, width, height)
    : paintContext.createImageData(width, height);
  const outputPixels = output.data;
  for (const location of filledLocations) {
    const index = location * 4;
    const transition = avatarBucketTransition.checked
      ? Math.min(1, 0.2 + distances[location] / Math.max(1, maxDistance) * 0.8)
      : 1;
    outputPixels[index] = Math.round(target[0] + (replacement[0] - target[0]) * transition);
    outputPixels[index + 1] = Math.round(target[1] + (replacement[1] - target[1]) * transition);
    outputPixels[index + 2] = Math.round(target[2] + (replacement[2] - target[2]) * transition);
    outputPixels[index + 3] = replacement[3];
  }
  paintContext.putImageData(output, 0, 0);
  updateAvatarLayerList();
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  return true;
}

function traceAvatarUvSurface(context, surface) {
  if (!surface?.faces?.length || !surface.uvAttribute) return;
  context.beginPath();
  for (const face of surface.faces) {
    const points = getAvatarUvTrianglePoints(surface, face);
    if (!points) continue;
    for (let indexInFace = 0; indexInFace < 3; indexInFace += 1) {
      const point = points[indexInFace];
      if (indexInFace === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.closePath();
  }
}

// A UV triangle that crosses the 0/1 seam must not be drawn as one straight
// polygon. Canvas has no texture wrapping here, so that would create a huge
// diagonal mask across the atlas and make a normal brush stroke look broken.
function getAvatarUvTrianglePoints(surface, face) {
  const vertices = surface.faceVertices(face);
  const uvs = vertices.map((vertex) => new THREE.Vector2().fromBufferAttribute(surface.uvAttribute, vertex));
  const uValues = uvs.map((uv) => uv.x);
  const vValues = uvs.map((uv) => uv.y);
  if (Math.max(...uValues) - Math.min(...uValues) > 0.5 ||
      Math.max(...vValues) - Math.min(...vValues) > 0.5) {
    return null;
  }
  return uvs.map((uv) => uvToAvatarCanvas(uv, new THREE.Vector2()));
}

function clipAvatarUvSurface(context, surface) {
  traceAvatarUvSurface(context, surface);
  if (!surface?.faces?.length || !surface.uvAttribute) return;
  context.clip();
}

function paintAvatarSegment(from, to, surface = null) {
  const layer = getAvatarPaintLayer(true);
  if (!layer) return;
  const context = layer.canvas.getContext("2d");
  if (avatarEditorTool === "eraser") {
    restoreAvatarSegment(from, to, surface);
    return;
  }
  const brushSize = Number(avatarBrushSize.value);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = avatarBrushColor.value;
  context.fillStyle = avatarBrushColor.value;
  context.lineWidth = brushSize;
  context.lineCap = "round";
  context.lineJoin = "round";
  clipAvatarUvSurface(context, surface);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
  updateAvatarCanvasTexture();
}

function paintAvatarDot(point, surface = null) {
  paintAvatarSegment(point, point, surface);
}

function distanceToAvatarSegmentSquared(x, y, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return (x - from.x) ** 2 + (y - from.y) ** 2;
  const projection = THREE.MathUtils.clamp(
    ((x - from.x) * dx + (y - from.y) * dy) / (dx * dx + dy * dy),
    0,
    1
  );
  const nearestX = from.x + projection * dx;
  const nearestY = from.y + projection * dy;
  return (x - nearestX) ** 2 + (y - nearestY) ** 2;
}

function restoreAvatarSegment(from, to, surface = null) {
  const layer = getAvatarPaintLayer(true);
  if (!layer) return;
  const width = avatarEditorCanvas.width;
  const height = avatarEditorCanvas.height;
  const radius = Math.max(0.5, Number(avatarBrushSize.value) / 2);
  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius - 1));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius - 1));
  const right = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius + 1));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius + 1));
  const patchWidth = right - left + 1;
  const patchHeight = bottom - top + 1;
  const context = layer.canvas.getContext("2d");
  const image = context.getImageData(left, top, patchWidth, patchHeight);
  const radiusSquared = radius * radius;
  const hasSurfaceMask = Boolean(surface?.faces?.length && surface.uvAttribute);
  if (hasSurfaceMask) traceAvatarUvSurface(context, surface);
  for (let y = 0; y < patchHeight; y += 1) {
    for (let x = 0; x < patchWidth; x += 1) {
      const canvasX = left + x;
      const canvasY = top + y;
      if (distanceToAvatarSegmentSquared(canvasX, canvasY, from, to) > radiusSquared) continue;
      if (hasSurfaceMask && !context.isPointInPath(canvasX, canvasY)) continue;
      const targetIndex = (y * patchWidth + x) * 4;
      // Eraser clears the selected image layer itself, including the base
      // texture/template, instead of silently restoring the original pixels.
      image.data[targetIndex] = 0;
      image.data[targetIndex + 1] = 0;
      image.data[targetIndex + 2] = 0;
      image.data[targetIndex + 3] = 0;
    }
  }
  context.putImageData(image, left, top);
  updateAvatarCanvasTexture();
}

function initializeAvatarTextureEditor() {
  const imageWidth = avatarTextureSourceImage?.width || avatarTextureSourceImage?.naturalWidth;
  const imageHeight = avatarTextureSourceImage?.height || avatarTextureSourceImage?.naturalHeight;
  if (!avatarTextureSourceImage || !imageWidth || !imageHeight) {
    setAvatarEditorStatus("This avatar has no editable texture");
    return;
  }

  avatarEditorCanvas.width = imageWidth;
  avatarEditorCanvas.height = imageHeight;
  avatarEditorContext.imageSmoothingEnabled = false;
  const baseCanvas = createAvatarLayerCanvas(imageWidth, imageHeight);
  baseCanvas.getContext("2d").drawImage(avatarTextureSourceImage, 0, 0, imageWidth, imageHeight);
  avatarLayers = [createAvatarLayer("paint", "Base texture", { canvas: baseCanvas })];
  avatarSelectedLayerId = avatarLayers[0].id;
  avatarEditorDefaultImageData = baseCanvas.getContext("2d").getImageData(0, 0, imageWidth, imageHeight);
  avatarBaseTemplateImageData = baseCanvas.getContext("2d").getImageData(0, 0, imageWidth, imageHeight);
  updateAvatarCanvasTexture();
  for (const material of getActiveAvatarTextureMaterials()) {
    material.map = avatarEditorTexture;
    if (activeRigType === "r15" && setR15BodyTextureMaterial(material, avatarEditorTexture)) continue;
    // Preserve alpha from uploaded PNGs and from the original template.
    material.transparent = true;
    material.alphaTest = 0.01;
    material.needsUpdate = true;
  }
  avatarEditorReady = true;
  avatarEditorHistory = [snapshotAvatarLayers()];
  avatarEditorHistoryIndex = 0;
  updateAvatarHistoryButtons();
  updateAvatarLayerList();
  updateAvatarLayerControls();
  avatarEditorToggle.disabled = false;
  avatarTemplateDownload.disabled = false;
  avatarTemplateUpload.disabled = false;
  setAvatarEditorStatus(`Texture ready • ${imageWidth}×${imageHeight}`);
}

async function switchAvatarRig(nextRig) {
  const requested = nextRig === "r15" ? "r15" : "r6";
  if (isGuestPlayer() && requested !== "r6") return false;
  const requestedRoot = requested === "r15" ? r15ModelRoot : r6ModelRoot;
  if (requested === activeRigType && modelRoot === requestedRoot) return true;
  const previousRig = activeRigType;
  if (!isGuestPlayer() && avatarEditorReady) {
    // Save the live editor canvas too, so toggling rigs preserves an unsent
    // texture instead of falling back to the template for that rig.
    try {
      if (!avatarEditor.hidden) refreshAvatarEditorCanvas(false);
      const currentTexture = !avatarEditor.hidden
        ? avatarEditorCanvas.toDataURL("image/png")
        : multiplayer.avatarUrl;
      if (currentTexture) saveAvatarTexture(currentTexture, previousRig);
    } catch (error) {
      console.warn("Could not snapshot avatar texture before rig switch", error);
    }
  }
  if (requested === "r15" && !r15ModelRoot) {
    setAvatarEditorStatus("Loading R15 avatar…");
    await ensureR15AssetsLoaded();
  }
  const nextRoot = requested === "r15" ? r15ModelRoot : r6ModelRoot;
  if (!nextRoot || !player.model) {
    setAvatarEditorStatus(requested === "r15" ? "R15 avatar could not load" : "R6 avatar is not ready");
    return false;
  }
  const savedTextureForRig = isGuestPlayer() ? "" : getSavedAvatarTexture(requested);
  stopLocalEmote(false, false);
  if (activeToolAnimation) finishToolAnimation(false);
  if (modelRoot?.parent === player.model) player.model.remove(modelRoot);
  activeRigType = requested;
  modelRoot = nextRoot;
  if (requested === "r15") {
    mixer = null;
    actions = {};
    restoreR15Animation(modelRoot);
    if (r15AnimationData) installR15AnimationData(modelRoot, r15AnimationData);
    avatarTextureSourceImage = r15TextureSourceImage;
    restoreR15Texture(modelRoot);
  } else {
    mixer = r6Mixer;
    actions = r6Actions;
    restoreAvatarBindPose(modelRoot, avatarBindPose);
    avatarTextureSourceImage = r6TextureSourceImage;
  }
  // Several systems use the active rig's bones (camera, collision and hats).
  // Refresh them after the old model has been detached so accessories never
  // remain attached to the previous rig.
  headBone = findHeadBone(modelRoot);
  torsoBone = null;
  modelRoot.traverse((object) => {
    if (!torsoBone && object.isBone && /torso|spine|chest/i.test(object.name)) torsoBone = object;
  });
  skinnedMesh = null;
  modelRoot.traverse((object) => {
    if (!skinnedMesh && object.isSkinnedMesh) skinnedMesh = object;
  });
  player.model.add(modelRoot);
  modelRoot.visible = true;
  modelRoot.scale.set(1, 1, 1);
  modelRoot.position.set(0, 0, 0);
  player.model.visible = false;
  pendingScale = true;
  localForcedAvatarSource = "";
  for (const button of avatarRigButtons) {
    button.classList.toggle("active", button.dataset.avatarRig === activeRigType);
  }
  try { localStorage.setItem("webbox_avatar_rig", activeRigType); } catch { /* ignore unavailable storage */ }
  appliedAvatarImage?.close?.();
  appliedAvatarImage = null;
  avatarEditorHistorySource = "";
  if (avatarEditorReady) initializeAvatarTextureEditor();
  // initializeAvatarTextureEditor can replace the active map with its shared
  // canvas texture. Re-assert the R15 base map here so the rig never comes up
  // untextured while a saved/custom texture is still being loaded below.
  if (requested === "r15") restoreR15Texture(modelRoot);
  multiplayer.avatarUrl = savedTextureForRig || null;
  // Ignore the previous rig's delayed room snapshot until the server echoes
  // this rig and its own saved texture (or its intentional empty texture).
  localAvatarPublishGuard = savedTextureForRig || AVATAR_RIG_SWITCH_GUARD;
  if (multiplayer.avatarUrl) {
    // Force this one application while the editor is open; the editor is
    // reseeded below so the visible model and the canvas stay in agreement.
    applyLocalAvatarSource(multiplayer.avatarUrl, true);
    if (!avatarEditor.hidden) {
      const editorSeedHistoryIndex = avatarEditorHistoryIndex;
      const savedImage = new Image();
      savedImage.onload = () => {
        if (
          activeRigType !== requested
          || !avatarEditorReady
          || avatarEditorHistorySource
          || avatarEditorHistoryIndex !== editorSeedHistoryIndex
        ) return;
        applyUploadedAvatarImage(savedImage, "Saved texture");
        avatarEditorHistorySource = multiplayer.avatarUrl || "";
      };
      savedImage.onerror = () => {};
      savedImage.src = multiplayer.avatarUrl;
    }
  }
  applyAvatarBodyPartVisibility();
  rebuildLocalHats();
  refreshHatPreview(true);
  applyAnimationImmediate("Idle");
  multiplayer.lastSentAt = 0;
  sendMultiplayerState(Date.now());
  return true;
}

function applyUploadedAvatarImage(image, filename) {
  if (isGuestPlayer()) return;
  const width = avatarEditorCanvas.width;
  const height = avatarEditorCanvas.height;
  const baseCanvas = createAvatarLayerCanvas(width, height);
  baseCanvas.getContext("2d").drawImage(image, 0, 0, width, height);
  avatarLayers = [createAvatarLayer("paint", "Uploaded texture", { canvas: baseCanvas })];
  avatarSelectedLayerId = avatarLayers[0].id;
  updateAvatarCanvasTexture();
  for (const material of getActiveAvatarTextureMaterials()) {
    material.map = avatarEditorTexture;
    if (activeRigType === "r15" && setR15BodyTextureMaterial(material, avatarEditorTexture)) continue;
    material.transparent = true;
    material.alphaTest = 0.01;
    material.needsUpdate = true;
  }
  // Replacing the texture is itself an editor action. Keep the previous
  // texture so Undo can restore it after this replacement is uploaded.
  if (!avatarEditorHistory.length) {
    avatarEditorHistory = [snapshotAvatarLayers()];
    avatarEditorHistoryIndex = 0;
  } else {
    recordAvatarHistory();
  }
  updateAvatarHistoryButtons();
  updateAvatarLayerList();
  updateAvatarLayerControls();
  setAvatarEditorStatus(`Template loaded • ${filename}`);
}

// Rebuild the editor's working base from the currently-applied/published
// texture image. This is what makes the 2nd (and later) edit keep the new
// texture forever instead of snapping back to the model's original map.
function resetAvatarEditorToAppliedImage(image) {
  if (!image) return false;
  const originalHistory = avatarEditorHistory[0] || null;
  const width = avatarEditorCanvas.width;
  const height = avatarEditorCanvas.height;
  const baseCanvas = createAvatarLayerCanvas(width, height);
  baseCanvas.getContext("2d").clearRect(0, 0, width, height);
  baseCanvas.getContext("2d").drawImage(image, 0, 0, width, height);
  avatarLayers = [createAvatarLayer("paint", "Base texture", { canvas: baseCanvas })];
  avatarSelectedLayerId = avatarLayers[0].id;
  updateAvatarCanvasTexture();
  // Keep the model's original texture as an undo step before the published
  // texture. Restore uses avatarBaseTemplateImageData, not this image.
  avatarEditorHistory = originalHistory
    ? [originalHistory, snapshotAvatarLayers()]
    : [snapshotAvatarLayers()];
  avatarEditorHistoryIndex = avatarEditorHistory.length - 1;
  updateAvatarHistoryButtons();
  updateAvatarLayerList();
  updateAvatarLayerControls();
  return true;
}

async function publishAvatarTexture() {
  if (isGuestPlayer() || !avatarEditorReady || avatarTexturePublishPending) return;
  avatarTexturePublishPending = true;
  setAvatarEditorStatus("Uploading avatar…");
  try {
    refreshAvatarEditorCanvas(false);
    const blob = await new Promise((resolve) => avatarEditorCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not encode avatar texture");
    let url = "";
    if (typeof globalThis.websim?.upload === "function") {
      const file = new File([blob], "avatar-texture.png", { type: "image/png" });
      url = await globalThis.websim.upload(file);
      if (typeof url !== "string" || !url) throw new Error("Upload returned no URL");
    } else {
      url = avatarEditorCanvas.toDataURL("image/png");
    }
    multiplayer.avatarUrl = url;
    // Ignore delayed snapshots carrying the previous URL until the server
    // confirms this newly published source.
    localAvatarPublishGuard = url;
    saveAvatarTexture(url, activeRigType);
    localForcedAvatarSource = "";
    localForcedAvatarTexture?.dispose();
    localForcedAvatarTexture = null;
    try {
      appliedAvatarImage = await createImageBitmap(blob);
    } catch {
      appliedAvatarImage = null;
    }
    // Keep the editor open until the upload is finished. The live canvas stays
    // authoritative while old room snapshots and state echoes arrive.
    avatarTexturePublishPending = false;
    avatarEditorHistorySource = url;
    const hasPublicAvatarUrl = isShareableAvatarUrl(url);
    if (!hasPublicAvatarUrl && multiplayer.connected && multiplayer.room) {
      // If the upload fallback produced a data URL, keep a final preview on
      // the server so other players can still receive the edited appearance.
      lastAvatarPreviewSent = "";
      broadcastAvatarPreview();
    }
    if (!avatarEditor.hidden) closeAvatarEditor();
    applyLocalAvatarSource(url);
    if (multiplayer.connected && multiplayer.room && hasPublicAvatarUrl) {
      multiplayer.room.send({ type: "avatar", url });
    }
    setAvatarEditorStatus(isShareableAvatarUrl(url)
      ? "Avatar replicated to multiplayer"
      : "Avatar saved on this device");
  } catch (error) {
    console.warn("Avatar upload unavailable", error);
    avatarTexturePublishPending = false;
    setAvatarEditorStatus("Avatar could not be saved");
  }
}

function setAvatarEditorTool(tool) {
  avatarEditorTool = tool;
  avatarEditorCanvas.classList.toggle("avatar-selecting", tool === "select");
  for (const button of avatarToolButtons) {
    button.classList.toggle("active", button.dataset.avatarTool === tool);
  }
  if (avatarEditorReady) updateAvatarCanvasTexture();
}

window.addEventListener("paste", (event) => {
  if (avatarEditor.hidden || avatarEditorMode !== "texture") return;
  const imageFile = [...(event.clipboardData?.items || [])]
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))
    ?.getAsFile();
  if (!imageFile) return;
  event.preventDefault();
  handleAvatarImageFile(imageFile);
});

function setAvatarEditorMode(mode) {
  if (isGuestPlayer()) return;
  avatarEditorMode = mode === "world" ? "world" : mode === "hats" ? "hats" : "texture";
  avatarEditor.classList.toggle("is-3d", avatarEditorMode === "world");
  avatarEditor.classList.toggle("is-hats", avatarEditorMode === "hats");
  // The HAT tab is a static customization workspace; it must not hijack the
  // game camera with an automatic orbit.
  for (const button of avatarModeButtons) {
    button.classList.toggle("active", button.dataset.avatarMode === avatarEditorMode);
  }
  avatarWorldHint.hidden = avatarEditorMode !== "world";
  avatar3DDragModeButton.disabled = avatarEditorMode !== "world";
  if (avatarHatsPanel) avatarHatsPanel.hidden = avatarEditorMode !== "hats";
  updateHardcoreCustomHatUI();
  if (avatarEditorMode !== "world" && avatar3DDragMode) setAvatar3DDragMode(false);
  if (avatarEditorMode === "hats") {
    if (avatarHatsEquipList) renderHatsEquipList();
    // `selectedCustomHatId` belongs to the custom-hat import controls; it is
    // not the hat currently selected in the settings dropdown. Preserve the
    // actual paint/settings target when reopening this tab.
    refreshHatAdjustOptions(hatPaintTargetId || selectedCustomHatId);
    refreshHatPreview(true);
    setAvatarEditorStatus("Hats & hair — equip accessories, paint your hair");
  }
  applyAvatarBodyPartVisibility();
  if (avatarEditorMode === "world") {
    setAvatarEditorStatus("3D World ready • paint directly on your avatar");
  } else if (avatarEditorMode === "texture" && avatarEditorReady) {
    setAvatarEditorStatus(`Texture ready • ${avatarEditorCanvas.width}×${avatarEditorCanvas.height}`);
  }
}

function closeAvatarEditor() {
  if (avatarTexturePublishPending) {
    setAvatarEditorStatus("Wait for avatar upload…");
    return;
  }
  avatarEditor.hidden = true;
  avatarEditorDrawing = false;
  avatarEditorLastPoint = null;
  applyAvatarBodyPartVisibility();
  setAvatarAnimationLocked(false);
  setAvatarCameraLocked(false);
}

avatarEditorToggle.addEventListener("click", () => {
  if (isGuestPlayer() || !avatarEditorReady) return;
  // If a texture is already applied/published, seed the editor from that
  // image so a 2nd edit keeps the new texture instead of flipping back to the
  // model's original map (the old "flickers between old and new" behavior).
  // Prefer the last applied snapshot so an edit never reverts to an old image.
  const reseedSource = appliedAvatarImage || localForcedAvatarTexture?.image;
  if (reseedSource && avatarEditorHistorySource !== localForcedAvatarSource) {
    resetAvatarEditorToAppliedImage(reseedSource);
    avatarEditorHistorySource = localForcedAvatarSource;
  }
  // Re-attach the live canvas to the local materials. A previous Apply uploads
  // a separate PNG texture, and that copy must not keep the 3D model frozen on
  // an older frame while the user is drawing again.
  for (const material of getActiveAvatarTextureMaterials()) {
    material.map = avatarEditorTexture;
    if (activeRigType === "r15" && setR15BodyTextureMaterial(material, avatarEditorTexture)) continue;
    material.transparent = true;
    material.alphaTest = 0.01;
    material.needsUpdate = true;
  }
  avatarEditor.hidden = false;
  applyAvatarBodyPartVisibility();
});
avatarEditorClose.addEventListener("click", closeAvatarEditor);
avatarLockAnimationInput.addEventListener("change", () => setAvatarAnimationLocked(avatarLockAnimationInput.checked));
avatarLockCameraInput.addEventListener("change", () => setAvatarCameraLocked(avatarLockCameraInput.checked));
avatarBodyPartInputs.forEach((input) => {
  input.addEventListener("change", () => {
    avatarBodyPartVisibility.set(input.dataset.avatarBodyPart, input.checked);
    applyAvatarBodyPartVisibility();
  });
});
avatarEditorApply.addEventListener("click", () => {
  void publishAvatarTexture();
});
avatarTemplateDownload.addEventListener("click", () => {
  if (!avatarEditorReady) return;
  refreshAvatarEditorCanvas(false);
  const link = document.createElement("a");
  link.href = avatarEditorCanvas.toDataURL("image/png");
  link.download = "avatar-template.png";
  link.click();
  requestAnimationFrame(() => updateAvatarCanvasTexture());
});
avatarTemplateUpload.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    applyUploadedAvatarImage(image, file.name);
    URL.revokeObjectURL(image.src);
  };
  image.onerror = () => {
    URL.revokeObjectURL(image.src);
    setAvatarEditorStatus("Could not load that image");
  };
  image.src = URL.createObjectURL(file);
  event.target.value = "";
});
avatarImageInsert.addEventListener("change", (event) => {
  handleAvatarImageFile(event.target.files?.[0]);
  event.target.value = "";
});
avatarImagePaste.addEventListener("click", () => void pasteAvatarImage());
avatarLayerAdd.addEventListener("click", addAvatarPaintLayer);
avatarLayerDelete.addEventListener("click", () => {
  const layer = getSelectedAvatarLayer();
  if (!layer) return;
  avatarLayers = avatarLayers.filter((item) => item.id !== layer.id);
  avatarSelectedLayerId = avatarLayers[Math.max(0, avatarLayers.length - 1)]?.id || null;
  updateAvatarLayerList();
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
  setAvatarEditorStatus(avatarLayers.length ? "Layer deleted" : "Base texture removed");
});
avatarLayerUp.addEventListener("click", () => {
  const index = avatarLayers.findIndex((layer) => layer.id === avatarSelectedLayerId);
  if (index < 0 || index >= avatarLayers.length - 1) return;
  [avatarLayers[index], avatarLayers[index + 1]] = [avatarLayers[index + 1], avatarLayers[index]];
  updateAvatarLayerList();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
});
avatarLayerDown.addEventListener("click", () => {
  const index = avatarLayers.findIndex((layer) => layer.id === avatarSelectedLayerId);
  if (index <= 0) return;
  [avatarLayers[index], avatarLayers[index - 1]] = [avatarLayers[index - 1], avatarLayers[index]];
  updateAvatarLayerList();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
});
avatarLayerScale.addEventListener("input", resizeSelectedAvatarLayer);
avatarLayerScale.addEventListener("change", recordAvatarHistory);
avatarLayerRotation.addEventListener("input", () => {
  const layer = getSelectedAvatarLayer();
  if (!layer || layer.kind === "paint") return;
  layer.rotation = Number(avatarLayerRotation.value) || 0;
  avatarLayerRotationValue.textContent = `${layer.rotation}°`;
  updateAvatarCanvasTexture();
});
avatarLayerRotation.addEventListener("change", recordAvatarHistory);
avatarLayerWidth.addEventListener("input", () => resizeSelectedAvatarLayerAxis("width"));
avatarLayerWidth.addEventListener("change", recordAvatarHistory);
avatarLayerHeight.addEventListener("input", () => resizeSelectedAvatarLayerAxis("height"));
avatarLayerHeight.addEventListener("change", recordAvatarHistory);
avatarLayerSaturation.addEventListener("input", () => {
  const layer = getSelectedAvatarLayer();
  if (!layer) return;
  layer.saturation = Number(avatarLayerSaturation.value);
  avatarLayerSaturationValue.textContent = avatarLayerSaturation.value;
  updateAvatarCanvasTexture();
});
avatarLayerSaturation.addEventListener("change", recordAvatarHistory);
avatarLayerContrast.addEventListener("input", () => {
  const layer = getSelectedAvatarLayer();
  if (!layer) return;
  layer.contrast = Number(avatarLayerContrast.value);
  avatarLayerContrastValue.textContent = avatarLayerContrast.value;
  updateAvatarCanvasTexture();
});
avatarLayerContrast.addEventListener("change", recordAvatarHistory);
avatarLayerHue.addEventListener("input", () => {
  const layer = getSelectedAvatarLayer();
  if (!layer) return;
  layer.hue = Number(avatarLayerHue.value);
  avatarLayerHueValue.textContent = `${avatarLayerHue.value}°`;
  updateAvatarCanvasTexture();
});
avatarLayerHue.addEventListener("change", recordAvatarHistory);
avatarLayerPixel.addEventListener("click", () => {
  const layer = getSelectedAvatarLayer();
  if (!layer || layer.kind === "paint") return;
  layer.pixelEffect = !layer.pixelEffect;
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
});
avatarLayerFlip.addEventListener("click", () => {
  const layer = getSelectedAvatarLayer();
  if (!layer) return;
  layer.flipY = !layer.flipY;
  updateAvatarLayerControls();
  updateAvatarCanvasTexture();
  recordAvatarHistory();
});
avatar3DDragModeButton.addEventListener("click", () => setAvatar3DDragMode(!avatar3DDragMode));
avatarToolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tool = button.dataset.avatarTool;
    if (tool === "shape") {
      addAvatarShapeLayer();
      return;
    }
    setAvatarEditorTool(tool);
  });
});
avatarModeButtons.forEach((button) => {
  button.addEventListener("click", () => setAvatarEditorMode(button.dataset.avatarMode));
});
avatarRigButtons.forEach((button) => {
  button.addEventListener("click", () => {
    void switchAvatarRig(button.dataset.avatarRig).catch((error) => {
      console.warn("Avatar rig switch failed", error);
      setAvatarEditorStatus("Avatar rig could not load");
    });
  });
});
avatarBrushSize.addEventListener("input", () => {
  avatarBrushSizeValue.textContent = avatarBrushSize.value;
});
avatarBucketTolerance.addEventListener("input", () => {
  avatarBucketToleranceValue.textContent = avatarBucketTolerance.value;
});
avatarEditorClear.addEventListener("click", () => {
  if (!avatarEditorReady) return;
  restoreDefaultAvatarTexture();
  // Persist the original avatar instead of leaving the previous custom save.
  void publishAvatarTexture();
});
avatarEditorUndo.addEventListener("click", () => {
  if (avatarEditorHistoryIndex <= 0) return;
  restoreAvatarHistory(avatarEditorHistoryIndex - 1);
  setAvatarEditorStatus("Last action undone");
});
avatarEditorRedo.addEventListener("click", () => {
  if (avatarEditorHistoryIndex >= avatarEditorHistory.length - 1) return;
  restoreAvatarHistory(avatarEditorHistoryIndex + 1);
  setAvatarEditorStatus("Action redone");
});
avatarEditor.addEventListener("pointerdown", (event) => {
  if (event.target === avatarEditor) closeAvatarEditor();
});
avatarEditorCanvas.addEventListener("pointerdown", (event) => {
  if (!avatarEditorReady) return;
  event.preventDefault();
  const point = avatarCanvasPoint(event);
  if (avatarEditorTool === "select") {
    const selected = getSelectedAvatarLayer();
    const handleSize = Math.max(10, avatarEditorCanvas.width / 30);
    const selectedBounds = selected ? getAvatarLayerBounds(selected) : null;
    if (selected?.kind === "paint" && !selected.locked) {
      avatarLayerInteraction = {
        mode: "select-area",
        start: point,
        current: point,
        layerId: selected.id,
      };
      avatarEditorCanvas.setPointerCapture(event.pointerId);
      updateAvatarCanvasTexture();
      return;
    }
    if (selectedBounds && selected.kind !== "paint" &&
      Math.abs(point.x - selectedBounds.right) <= handleSize && Math.abs(point.y - selectedBounds.bottom) <= handleSize) {
      avatarLayerInteraction = { mode: "resize", start: point, layerId: selected.id, width: selected.width, height: selected.height, x: selected.x, y: selected.y };
      avatarEditorCanvas.setPointerCapture(event.pointerId);
      return;
    }
    const selectedHit = selected && selected.kind !== "paint" && selected.visible
      ? (() => {
        const bounds = getAvatarLayerBounds(selected);
        return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom
          ? selected
          : null;
      })()
      : null;
    const hit = selectedHit || [...avatarLayers].reverse().find((layer) => {
      if (!layer.visible) return false;
      const bounds = getAvatarLayerBounds(layer);
      return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
    });
    if (hit) {
      setSelectedAvatarLayer(hit.id);
      if (hit.kind !== "paint") {
        avatarLayerInteraction = { mode: "move", start: point, layerId: hit.id, x: hit.x, y: hit.y };
        avatarEditorCanvas.setPointerCapture(event.pointerId);
      }
    }
    return;
  }
  if (avatarEditorTool === "bucket") {
    if (fillAvatarRegion(point)) {
      recordAvatarHistory();
      setAvatarEditorStatus("Region filled");
    }
    return;
  }
  avatarEditorDrawing = true;
  avatarEditorLastPoint = point;
  avatarEditorCanvas.setPointerCapture(event.pointerId);
  paintAvatarDot(avatarEditorLastPoint);
});
avatarEditorCanvas.addEventListener("pointermove", (event) => {
  if (avatarLayerInteraction) {
    event.preventDefault();
    const point = avatarCanvasPoint(event);
    if (avatarLayerInteraction.mode === "select-area") {
      avatarLayerInteraction.current = point;
      updateAvatarCanvasTexture();
      return;
    }
    const layer = avatarLayers.find((item) => item.id === avatarLayerInteraction.layerId);
    if (!layer) return;
    const dx = point.x - avatarLayerInteraction.start.x;
    const dy = point.y - avatarLayerInteraction.start.y;
    if (avatarLayerInteraction.mode === "move") {
      layer.x = avatarLayerInteraction.x + dx;
      layer.y = avatarLayerInteraction.y + dy;
    } else {
      const ratio = avatarLayerInteraction.width / Math.max(1, avatarLayerInteraction.height);
      layer.width = Math.max(4, avatarLayerInteraction.width + dx);
      layer.height = Math.max(4, layer.width / ratio);
      layer.x = avatarLayerInteraction.x;
      layer.y = avatarLayerInteraction.y;
      avatarLayerScale.value = String(Math.round((layer.width / Math.max(1, layer.baseWidth || layer.canvas?.width || layer.width)) * 100));
      avatarLayerScaleValue.textContent = `${avatarLayerScale.value}%`;
    }
    updateAvatarCanvasTexture();
    return;
  }
  if (!avatarEditorDrawing) return;
  event.preventDefault();
  const point = avatarCanvasPoint(event);
  paintAvatarSegment(avatarEditorLastPoint, point);
  avatarEditorLastPoint = point;
});
function stopAvatarDrawing(event) {
  if (avatarLayerInteraction) {
    const interaction = avatarLayerInteraction;
    avatarLayerInteraction = null;
    if (interaction.mode === "select-area") {
      const layer = avatarLayers.find((item) => item.id === interaction.layerId);
      const bounds = layer ? normalizeAvatarSelection(interaction.start, interaction.current) : null;
      if (layer && bounds && extractAvatarSelectedArea(layer, bounds)) {
        recordAvatarHistory();
      } else {
        updateAvatarCanvasTexture();
      }
      if (event?.pointerId !== undefined && avatarEditorCanvas.hasPointerCapture(event.pointerId)) {
        avatarEditorCanvas.releasePointerCapture(event.pointerId);
      }
      return;
    }
    recordAvatarHistory();
    if (event?.pointerId !== undefined && avatarEditorCanvas.hasPointerCapture(event.pointerId)) {
      avatarEditorCanvas.releasePointerCapture(event.pointerId);
    }
    return;
  }
  if (!avatarEditorDrawing) return;
  avatarEditorDrawing = false;
  avatarEditorLastPoint = null;
  recordAvatarHistory();
  if (event?.pointerId !== undefined && avatarEditorCanvas.hasPointerCapture(event.pointerId)) {
    avatarEditorCanvas.releasePointerCapture(event.pointerId);
  }
}
avatarEditorCanvas.addEventListener("pointerup", stopAvatarDrawing);
avatarEditorCanvas.addEventListener("pointercancel", stopAvatarDrawing);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !avatarEditor.hidden) closeAvatarEditor();
});

// ---------------------------------------------------------------------------
// HATS & HAIR — equip accessories/hair on the head bone, paint the hair.
// ---------------------------------------------------------------------------
const hatGeometryCache = new Map();   // hatId -> centered, smoothed BufferGeometry
const hatMaterialCache = new Map();   // hatId -> optional material loaded from .mtl
const hatTextureCache = new Map();
const hatItemMap = new Map(HATS_CONFIG.items.map((item) => [item.id, item]));
// Custom hats mutate `hat.texture` when a painted texture is uploaded. Keep
// the imported texture separately so Restore can return to it later.
const hatDefaultTextureMap = new Map(
  HATS_CONFIG.items.filter((item) => item.isCustom).map((item) => [item.id, item.texture || null])
);
const equippedHats = new Set();
let hatEditorReady = false;
let hatsSynced = false;
const CUSTOM_HAT_ID_PREFIX = "hardcore_custom_hat_";
const CUSTOM_HAT_ID = `${CUSTOM_HAT_ID_PREFIX}1`;
const CUSTOM_HAT_STORAGE_KEY = "webbox_hardcore_custom_hat_v1";
const CUSTOM_HATS_STORAGE_KEY = "webbox_hardcore_custom_hats_v2";
let selectedCustomHatId = CUSTOM_HAT_ID;
const CUSTOM_HAT_DEFAULT_STYLE = {
  tint: "#ffffff",
  hue: 0,
  saturation: 1,
  lightness: 1,
  opacity: 1,
  specular: "#101010",
  shininess: 8,
  roughness: 0.5,
  metalness: 0,
  specularScale: 0.1,
};
const CUSTOM_HAT_ATTACHMENTS = [
  { value: "Head", label: "Head" },
  { value: "Torso", label: "Torso" },
  { value: "LeftArm", label: "Left arm" },
  { value: "RightArm", label: "Right arm" },
  { value: "LeftLeg", label: "Left leg" },
  { value: "RightLeg", label: "Right leg" },
];
const CUSTOM_HAT_ATTACHMENT_VALUES = new Set(CUSTOM_HAT_ATTACHMENTS.map(({ value }) => value));
const HAT_SCALE_MIN = 0.1;
const HAT_SCALE_MAX = 25;
const HAT_SCALE_USER_MAX = 4;
let refreshHatScaleControl = null;
const R15_ACCESSORY_YAW_CORRECTION = Math.PI;

function getHatScaleMax() {
  return multiplayer.isAdmin ? HAT_SCALE_MAX : HAT_SCALE_USER_MAX;
}

function clampHatScale(value, max = HAT_SCALE_MAX) {
  return THREE.MathUtils.clamp(Number(value) || 1, HAT_SCALE_MIN, max);
}

function updateHatScaleLimit() {
  const scaleInput = document.getElementById("hat-adjust-scale");
  const scaleOutput = document.getElementById("hat-adjust-scale-value");
  if (!scaleInput) return;
  const max = getHatScaleMax();
  scaleInput.max = String(max);
  if (Number(scaleInput.value) > max) scaleInput.value = String(max);
  if (scaleOutput) scaleOutput.textContent = Number(scaleInput.value || 1).toFixed(2);
  refreshHatScaleControl?.();
}

function isCustomHatId(value) {
  return typeof value === "string" && /^hardcore_custom_hat_\d+$/i.test(value);
}

function customHatNumber(id) {
  const match = String(id || "").match(/(\d+)$/);
  return Math.max(1, Number(match?.[1]) || 1);
}

function customHatDisplayName(id) {
  return `Custom hat ${customHatNumber(id)}`;
}

function sanitizeCustomHatState(value, fallbackId = CUSTOM_HAT_ID) {
  if (!value || typeof value !== "object") return null;
  const rawId = typeof value.id === "string" ? value.id.trim() : "";
  const id = isCustomHatId(rawId) ? rawId.toLowerCase() : fallbackId;
  const mesh = typeof value.mesh === "string" && isShareableAvatarUrl(value.mesh.trim())
    ? value.mesh.trim().slice(0, 2048)
    : "";
  if (!mesh) return null;
  const texture = typeof value.texture === "string" && isShareableAvatarUrl(value.texture.trim())
    ? value.texture.trim().slice(0, 2048)
    : null;
  const defaultTexture = typeof value.defaultTexture === "string" && isShareableAvatarUrl(value.defaultTexture.trim())
    ? value.defaultTexture.trim().slice(0, 2048)
    : texture;
  const mtl = typeof value.mtl === "string" && isShareableAvatarUrl(value.mtl.trim())
    ? value.mtl.trim().slice(0, 2048)
    : null;
  const vector = (input, min, max) => Array.isArray(input) && input.length === 3
    ? input.map((number) => THREE.MathUtils.clamp(Number(number) || 0, min, max))
    : [0, 0, 0];
  const scale = clampHatScale(value.scale);
  const attachTo = CUSTOM_HAT_ATTACHMENT_VALUES.has(value.attachTo) ? value.attachTo : "Head";
  const rawStyle = value.style && typeof value.style === "object" ? value.style : {};
  const style = {
    ...CUSTOM_HAT_DEFAULT_STYLE,
    tint: /^#[0-9a-f]{6}$/i.test(rawStyle.tint) ? rawStyle.tint : CUSTOM_HAT_DEFAULT_STYLE.tint,
    hue: THREE.MathUtils.clamp(Number(rawStyle.hue) || 0, -180, 180),
    saturation: THREE.MathUtils.clamp(Number.isFinite(Number(rawStyle.saturation)) ? Number(rawStyle.saturation) : 1, 0, 2),
    lightness: THREE.MathUtils.clamp(Number.isFinite(Number(rawStyle.lightness)) ? Number(rawStyle.lightness) : 1, 0.2, 2),
    opacity: THREE.MathUtils.clamp(Number.isFinite(Number(rawStyle.opacity)) ? Number(rawStyle.opacity) : 1, 0.1, 1),
    specular: /^#[0-9a-f]{6}$/i.test(rawStyle.specular) ? rawStyle.specular : CUSTOM_HAT_DEFAULT_STYLE.specular,
    shininess: THREE.MathUtils.clamp(Number(rawStyle.shininess) || 0, 0, 100),
  };
  return {
    id,
    name: customHatDisplayName(id),
    mesh,
    mtl,
    texture,
    defaultTexture,
    enabled: value.enabled !== false,
    scale,
    attachTo,
    position: vector(value.position, -3, 3),
    rotation: vector(value.rotation, -180, 180),
    style,
  };
}

function sanitizeCustomHatList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const result = [];
  const usedIds = new Set();
  for (let index = 0; index < values.length && result.length < 20; index += 1) {
    const fallbackId = `${CUSTOM_HAT_ID_PREFIX}${index + 1}`;
    const state = sanitizeCustomHatState(values[index], fallbackId);
    if (!state || usedIds.has(state.id)) continue;
    usedIds.add(state.id);
    result.push(state);
  }
  return result;
}

function localCustomHats() {
  if (Array.isArray(multiplayer.customHats)) return multiplayer.customHats;
  return multiplayer.customHat ? [multiplayer.customHat] : [];
}

function setLocalCustomHats(value) {
  const list = sanitizeCustomHatList(value);
  multiplayer.customHats = list;
  // Keep the old singular field as a compatibility alias for saved states
  // and older code paths while the network uses the complete list.
  multiplayer.customHat = list[0] || null;
  return list;
}

function getLocalCustomHat(id = selectedCustomHatId) {
  return localCustomHats().find((hat) => hat.id === id) || null;
}

function nextCustomHatId() {
  const used = new Set(localCustomHats().map((hat) => hat.id));
  let number = 1;
  while (used.has(`${CUSTOM_HAT_ID_PREFIX}${number}`)) number += 1;
  return `${CUSTOM_HAT_ID_PREFIX}${number}`;
}

function saveCustomHatState() {
  try {
    const hats = sanitizeCustomHatList(localCustomHats());
    if (hats.length) localStorage.setItem(CUSTOM_HATS_STORAGE_KEY, JSON.stringify(hats));
    else localStorage.removeItem(CUSTOM_HATS_STORAGE_KEY);
    localStorage.removeItem(CUSTOM_HAT_STORAGE_KEY);
  } catch { /* ignore unavailable storage */ }
}

function loadSavedCustomHatState() {
  try {
    const savedList = localStorage.getItem(CUSTOM_HATS_STORAGE_KEY);
    const legacy = localStorage.getItem(CUSTOM_HAT_STORAGE_KEY);
    const parsed = savedList
      ? sanitizeCustomHatList(JSON.parse(savedList))
      : legacy ? sanitizeCustomHatList(JSON.parse(legacy)) : [];
    setLocalCustomHats(parsed);
    if (parsed.length) selectedCustomHatId = parsed[parsed.length - 1].id;
  } catch { /* ignore unavailable storage */ }
}

function ensureCustomHatDefinition(value, syncLocalMaps = true) {
  const state = sanitizeCustomHatState(value);
  if (!state) return null;
  const customId = state.id;
  let hat = hatItemMap.get(customId);
  const meshChanged = !hat || hat.mesh !== state.mesh;
  const mtlChanged = !hat || hat.mtl !== state.mtl;
  if (!hat) {
    hat = {
      id: customId,
      name: state.name,
      category: "hat",
      mesh: state.mesh,
      texture: state.texture,
      bone: state.attachTo,
      attachTo: state.attachTo,
      position: [...state.position],
      rotation: [...state.rotation],
      style: { ...state.style },
      scale: state.scale,
      isCustom: true,
      mtl: state.mtl,
    };
    HATS_CONFIG.items.push(hat);
    hatItemMap.set(hat.id, hat);
    hatDefaultTextureMap.set(customId, state.defaultTexture || state.texture || null);
  } else {
    hat.mesh = state.mesh;
    hat.mtl = state.mtl;
    hat.texture = state.texture;
    hat.scale = state.scale;
    hat.bone = state.attachTo;
    hat.attachTo = state.attachTo;
    // Keep the imported item's original defaults stable. Live values belong
    // to the saved customHat state, so moving it does not move the reset point.
    if (meshChanged) {
      hat.position = [...state.position];
      hat.rotation = [...state.rotation];
      hat.style = { ...state.style };
    }
  }
  if (syncLocalMaps) {
    hatAdjustMap.set(customId, {
      offset: [...state.position],
      rotation: [...state.rotation],
      scale: clampHatScale(state.scale),
    });
    hatStyleMap.set(customId, { ...state.style });
  }
  if (meshChanged || mtlChanged) {
    hatGeometryCache.delete(customId);
    hatMaterialCache.get(customId)?.dispose?.();
    hatMaterialCache.delete(customId);
    loadHatGeometry(hat);
  }
  return hat;
}

function defaultHatTexture(hat) {
  if (!hat) return null;
  if (hatDefaultTextureMap.has(hat.id)) return hatDefaultTextureMap.get(hat.id);
  return hat.texture || null;
}

function serializeCustomHatsForNetwork() {
  if (!isOwnerName(multiplayer.username)) return [];
  return sanitizeCustomHatList(localCustomHats());
}

// Send only stable http(s) URL hat textures. Local data-URL paints are kept
// locally (they are not shareable across clients) and are uploaded to the
// server endpoint to get a permanent URL when the player hits Apply.
function serializeHatTexturesForNetwork() {
  if (isGuestPlayer()) return {};
  const result = {};
  for (const [id, url] of hatPaintTextures) {
    if (isShareableAvatarUrl(url)) result[id] = url;
  }
  return result;
}

function localCustomHatState() {
  return isOwnerName(multiplayer.username) ? localCustomHats() : [];
}

// Live position/rotation overrides for each hat, editable in the Hats tab.
// These layer on top of the HATS_CONFIG defaults at the top of the file.
const hatAdjustMap = new Map(); // hatId -> { offset: [x,y,z], rotation: [rx,ry,rz] }
const hatStyleMap = new Map();
function defaultHatAdjust(hat) {
  return {
    offset: [...(hat?.position || hat?.offset || [0, 0, 0])],
    rotation: [...(hat?.rotation || [0, 0, 0])],
    scale: clampHatScale(hat?.scale),
  };
}
function defaultHatStyle(hat) {
  const styleNumber = (key, fallback) => Number.isFinite(Number(hat?.style?.[key]))
    ? Number(hat.style[key])
    : fallback;
  // PBR-style hat controls default to the player's global material profile so
  // a fresh hat looks like the avatar until the user overrides it.
  const pm = materialSettings || {}
  ;
  return {
    tint: hat?.style?.tint || "#ffffff",
    hue: styleNumber("hue", 0),
    saturation: styleNumber("saturation", 1),
    lightness: styleNumber("lightness", 1),
    opacity: styleNumber("opacity", 1),
    specular: typeof hat?.style?.specular === "string" ? hat.style.specular : "#101010",
    shininess: styleNumber("shininess", 8),
    roughness: styleNumber("roughness", Number.isFinite(Number(pm.roughness)) ? Number(pm.roughness) : 0.5),
    metalness: styleNumber("metalness", Number.isFinite(Number(pm.metalness)) ? Number(pm.metalness) : 0),
    specularScale: styleNumber("specularScale", Number.isFinite(Number(pm.specular)) ? Number(pm.specular) : 0.1),
  };
}
function loadHatAdjusts() {
  for (const item of HATS_CONFIG.items) hatAdjustMap.set(item.id, {
    offset: [...(item.position || item.offset || [0, 0, 0])],
    rotation: [...(item.rotation || [0, 0, 0])],
    scale: clampHatScale(item.scale),
  });
  try {
    const raw = localStorage.getItem(`webbox_hat_adjust_v${HATS_CONFIG.version}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [id, adj] of Object.entries(parsed)) {
          if (!hatItemMap.has(id) || !adj) continue;
          hatAdjustMap.set(id, {
            offset: Array.isArray(adj.offset) && adj.offset.length === 3 ? [...adj.offset] : defaultHatAdjust(hatItemMap.get(id)).offset,
            rotation: Array.isArray(adj.rotation) && adj.rotation.length === 3 ? [...adj.rotation] : [...(hatItemMap.get(id).rotation || [0, 0, 0])],
            scale: clampHatScale(adj.scale),
          });
        }
      }
    }
  } catch { /* ignore */ }
}
function loadHatStyles() {
  for (const item of HATS_CONFIG.items) hatStyleMap.set(item.id, defaultHatStyle(item));
  try {
    const raw = localStorage.getItem(`webbox_hat_style_v${HATS_CONFIG.version}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return;
    for (const [id, style] of Object.entries(parsed)) {
      if (!hatItemMap.has(id) || !style) continue;
      hatStyleMap.set(id, { ...defaultHatStyle(hatItemMap.get(id)), ...style });
    }
  } catch { /* ignore */ }
}
function saveHatAdjustState() {
  const out = {};
  for (const [id, adj] of hatAdjustMap) out[id] = adj;
  try {
    localStorage.setItem(`webbox_hat_adjust_v${HATS_CONFIG.version}`, JSON.stringify(out));
  } catch { /* ignore */ }
}
function saveHatStyleState() {
  const out = {};
  for (const [id, style] of hatStyleMap) out[id] = style;
  try {
    localStorage.setItem(`webbox_hat_style_v${HATS_CONFIG.version}`, JSON.stringify(out));
  } catch { /* ignore */ }
}

// Appearance is part of each player's network state. Never make a remote
// player read this client's local hatStyleMap/hatAdjustMap, otherwise changing
// one accessory here changes the way every other player is rendered here.
function serializeHatStylesForNetwork() {
  const styles = {};
  for (const hat of HATS_CONFIG.items) {
    const style = hatStyleMap.get(hat.id) || defaultHatStyle(hat);
    styles[hat.id] = {
      tint: style.tint,
      hue: Number(style.hue) || 0,
      saturation: Number(style.saturation) || 0,
      lightness: Number(style.lightness) || 0,
      opacity: Number(style.opacity) || 0,
      specular: style.specular,
      shininess: Number(style.shininess) || 0,
      roughness: Number(style.roughness) || 0,
      metalness: Number(style.metalness) || 0,
      specularScale: Number(style.specularScale) || 0,
    };
  }
  return styles;
}

function serializeHatAdjustsForNetwork() {
  if (isGuestPlayer()) {
    const guestHat = hatItemMap.get(GUEST_HAT_ID);
    return guestHat ? { [GUEST_HAT_ID]: defaultHatAdjust(guestHat) } : {};
  }
  const adjusts = {};
  for (const hat of HATS_CONFIG.items) {
    const adjust = hatAdjustMap.get(hat.id) || defaultHatAdjust(hat);
    adjusts[hat.id] = {
      offset: adjust.offset.map((value) => Number(value) || 0),
      rotation: adjust.rotation.map((value) => Number(value) || 0),
      scale: clampHatScale(adjust.scale, getHatScaleMax()),
    };
  }
  return adjusts;
}

function hatAppearanceNetworkKey(hats, styles, adjusts, customHats = []) {
  return JSON.stringify([hats || [], styles || {}, adjusts || {}, customHats || []]);
}

// Shared hair paint canvas + texture (the visible Hats-tab canvas).
const hairCanvas = document.getElementById("hair-texture-canvas");
hairCanvas.width = HATS_CONFIG.hairTextureSize;
hairCanvas.height = HATS_CONFIG.hairTextureSize;
const hairCtx = hairCanvas.getContext("2d", { willReadFrequently: true });
let hairEditorTexture = null;
const hatPaintTextures = new Map(); // hatId -> painted texture data URL
// Tracks hat ids currently being painted (strokes started this session but not
// yet persisted). Lets an accessory's material switch to the live paint canvas
// the moment the user brushes it, without stripping a real uploaded texture the
// moment they merely select the hat to adjust it.
const hatActivePainted = new Set();
let hatPaintTargetId = null;
let hatPaintReadyId = null;
let hatPaintLoadToken = 0;
let persistentHatPaintTimer = null;
let hatPaintLayers = [];
let hatPaintActiveLayer = 0;
const hatPaintLayerCache = new Map();

function createHatPaintLayer(name, source = null) {
  const canvas = document.createElement("canvas");
  canvas.width = hairCanvas.width;
  canvas.height = hairCanvas.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (source) context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { name, canvas, context, visible: true, opacity: 1 };
}

function activeHatPaintLayer() {
  return hatPaintLayers[hatPaintActiveLayer] || null;
}

function renderHatPaintLayers() {
  hairCtx.clearRect(0, 0, hairCanvas.width, hairCanvas.height);
  for (const layer of hatPaintLayers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    hairCtx.save();
    hairCtx.globalAlpha = THREE.MathUtils.clamp(Number(layer.opacity) || 0, 0, 1);
    hairCtx.drawImage(layer.canvas, 0, 0);
    hairCtx.restore();
  }
  updateHatPaintLayerUI();
}

function cacheCurrentHatPaintLayers() {
  if (!hatPaintTargetId || !hatPaintLayers.length) return;
  hatPaintLayerCache.set(hatPaintTargetId, {
    layers: hatPaintLayers,
    active: hatPaintActiveLayer,
  });
}

function resetHatPaintLayers(sourceImage = null) {
  const cached = hatPaintLayerCache.get(hatPaintTargetId);
  if (cached?.layers?.length) {
    hatPaintLayers = cached.layers;
    hatPaintActiveLayer = THREE.MathUtils.clamp(Number(cached.active) || 0, 0, hatPaintLayers.length - 1);
    renderHatPaintLayers();
    return;
  }
  const base = createHatPaintLayer("Texture", sourceImage);
  if (!sourceImage) {
    base.context.fillStyle = HATS_CONFIG.brown;
    base.context.fillRect(0, 0, hairCanvas.width, hairCanvas.height);
  }
  hatPaintLayers = [base, createHatPaintLayer("Paint")];
  hatPaintActiveLayer = 1;
  renderHatPaintLayers();
}

function updateHatPaintLayerUI() {
  const select = document.getElementById("hat-paint-layer-select");
  const opacity = document.getElementById("hat-paint-layer-opacity");
  const visibleButton = document.getElementById("hat-paint-layer-visible");
  if (!select) return;
  const current = activeHatPaintLayer();
  select.replaceChildren();
  hatPaintLayers.forEach((layer, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${layer.visible ? "" : "(hidden) "}${layer.name}`;
    select.append(option);
  });
  if (current) {
    select.value = String(hatPaintActiveLayer);
    if (opacity) opacity.value = String(layerOpacity(current));
    if (visibleButton) visibleButton.textContent = current.visible ? "Hide layer" : "Show layer";
  }
}

function layerOpacity(layer) {
  return THREE.MathUtils.clamp(Number(layer?.opacity) || 0, 0, 1);
}

function finishHatPaintEdit() {
  renderHatPaintLayers();
  cacheCurrentHatPaintLayers();
  markHatActivePainted();
  refreshHairTexture();
}

function addHatPaintLayer(name = `Layer ${hatPaintLayers.length + 1}`) {
  hatPaintLayers.push(createHatPaintLayer(name));
  hatPaintActiveLayer = hatPaintLayers.length - 1;
  finishHatPaintEdit();
}

function deleteHatPaintLayer() {
  if (hatPaintLayers.length <= 1) return;
  hatPaintLayers.splice(hatPaintActiveLayer, 1);
  hatPaintActiveLayer = Math.min(hatPaintActiveLayer, hatPaintLayers.length - 1);
  finishHatPaintEdit();
}

function markHatActivePainted() {
  const id = hatPaintTargetId;
  if (!id || hatActivePainted.has(id)) return;
  hatActivePainted.add(id);
  rebuildLocalHats();
}

function loadHatPaintState() {
  try {
    const raw = localStorage.getItem(`webbox_hat_paint_v${HATS_CONFIG.version}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return;
    for (const [id, dataUrl] of Object.entries(parsed)) {
      if (hatItemMap.has(id) && typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
        hatPaintTextures.set(id, dataUrl);
      }
    }
  } catch { /* ignore */ }
}

function saveHatPaintState() {
  const out = Object.fromEntries(hatPaintTextures);
  try {
    localStorage.setItem(`webbox_hat_paint_v${HATS_CONFIG.version}`, JSON.stringify(out));
  } catch { /* ignore */ }
}

function captureHatPaintDataUrl(format = "image/png", quality) {
  try {
    return quality === undefined
      ? hairCanvas.toDataURL(format)
      : hairCanvas.toDataURL(format, quality);
  } catch (error) {
    // A remote texture without CORS headers can taint the canvas. A failed
    // snapshot must never cancel selecting another hat in the dropdown.
    console.warn("Hat paint canvas is not readable", error?.message || error);
    return null;
  }
}

function drawHatPaintSource(hat, sourceUrl) {
  const token = ++hatPaintLoadToken;
  hatPaintTargetId = hat?.id || null;
  hatPaintReadyId = null;
  const cached = hatPaintLayerCache.get(hatPaintTargetId);
  if (cached?.layers?.length) {
    resetHatPaintLayers();
    hatPaintReadyId = hatPaintTargetId;
    refreshHairTexture();
    rebuildLocalHats();
    return;
  }
  if (!sourceUrl) {
    resetHatPaintLayers();
    hatPaintReadyId = hatPaintTargetId;
    refreshHairTexture();
    rebuildLocalHats();
    return;
  }
  const image = new Image();
  if (/^https?:\/\//i.test(sourceUrl)) image.crossOrigin = "anonymous";
  image.onload = () => {
    if (token !== hatPaintLoadToken) return;
    resetHatPaintLayers(image);
    hatPaintReadyId = hat?.id || null;
    refreshHairTexture();
    rebuildLocalHats();
  };
  image.onerror = () => {
    if (token !== hatPaintLoadToken) return;
    resetHatPaintLayers();
    hatPaintReadyId = hat?.id || null;
    refreshHairTexture();
    rebuildLocalHats();
  };
  image.src = sourceUrl;
}

function selectHatPaintTarget(hat) {
  if (!hat) return;
  // Re-selecting the same hat is common when toggling its equip checkbox.
  // Keep the existing paint canvas and texture instead of starting another
  // image load and another rebuild of the avatar.
  if (hatPaintTargetId === hat.id) {
    refreshHatPreview();
    return;
  }
  const previousHat = hatPaintTargetId ? hatItemMap.get(hatPaintTargetId) : null;
  const previousWasPainted = Boolean(previousHat && hatActivePainted.has(previousHat.id));
  if (hatPaintTargetId && hatPaintTargetId !== hat.id) {
    const previousTexture = captureHatPaintDataUrl();
    cacheCurrentHatPaintLayers();
    if (previousTexture) hatPaintTextures.set(hatPaintTargetId, previousTexture);
    hatActivePainted.delete(hatPaintTargetId);
    saveHatPaintState();
    // Switching away from a painted hat commits that hat independently. This
    // keeps custom and built-in hats from overwriting each other's paint and
    // makes the server copy authoritative even when Apply was not clicked.
    if (previousWasPainted && hatEditorReady) persistHatPaint(previousHat, previousTexture);
  }
  const savedTexture = hatPaintTextures.get(hat.id);
  drawHatPaintSource(hat, savedTexture || hat.texture || null);
  refreshHatPreview();
}

function ensureHairTexture() {
  if (hairEditorTexture) return hairEditorTexture;
  hairEditorTexture = new THREE.CanvasTexture(hairCanvas);
  hairEditorTexture.colorSpace = THREE.SRGBColorSpace;
  // Hat OBJ files use the authored Roblox UV orientation. Keep painted and
  // loaded accessory textures on the same orientation so switching between
  // them cannot make the image appear vertically shifted/flipped.
  hairEditorTexture.flipY = true;
  hairEditorTexture.offset.set(0, 0);
  hairEditorTexture.repeat.set(1, 1);
  hairEditorTexture.center.set(0, 0);
  hairEditorTexture.rotation = 0;
  hairEditorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return hairEditorTexture;
}
function initHairCanvas() {
  ensureHairTexture();
  resetHatPaintLayers();
}
function refreshHairTexture() {
  if (hairEditorTexture) hairEditorTexture.needsUpdate = true;
  hairSyncDirty = true;
  scheduleHairBroadcast();
  schedulePersistentHatPaint();
}

function schedulePersistentHatPaint() {
  if (persistentHatPaintTimer) window.clearTimeout(persistentHatPaintTimer);
  const targetId = hatPaintTargetId;
  if (!hatEditorReady || !targetId || !hatActivePainted.has(targetId)) return;
  persistentHatPaintTimer = window.setTimeout(() => {
    persistentHatPaintTimer = null;
    if (hatPaintTargetId !== targetId || !hatActivePainted.has(targetId)) return;
    const targetHat = hatItemMap.get(targetId);
    if (targetHat) persistHatPaint(targetHat);
  }, 900);
}

// Smooth the normals at the existing vertex positions without subdividing or
// merging the geometry. This keeps UV seams intact while making duplicated
// OBJ seam vertices share the same averaged normal.
function smoothExistingVertexNormals(geometry) {
  const position = geometry.attributes.position;
  if (!position) return geometry;
  const normal = geometry.attributes.normal || new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
  if (!geometry.attributes.normal) geometry.setAttribute("normal", normal);
  const accumulators = new Map();
  const keyFor = (index) => {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    return `${Math.round(x * 100000)}:${Math.round(y * 100000)}:${Math.round(z * 100000)}`;
  };
  const face = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const index = geometry.index;
  const triangleCount = index ? index.count / 3 : position.count / 3;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3;
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    face.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    if (face.lengthSq() === 0) continue;
    for (const vertexIndex of [ia, ib, ic]) {
      const key = keyFor(vertexIndex);
      const sum = accumulators.get(key) || new THREE.Vector3();
      sum.add(face);
      accumulators.set(key, sum);
    }
  }
  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    const sum = accumulators.get(keyFor(vertexIndex));
    if (!sum) continue;
    sum.normalize();
    normal.setXYZ(vertexIndex, sum.x, sum.y, sum.z);
  }
  normal.needsUpdate = true;
  return geometry;
}

// Each hat's .obj is authored in studs matching its Roblox `Size`, but the
// vertices are offset from the attachment pivot. We bake the bounding-box
// center out so every hat is centered on the head bone, then apply the
// per-item `offset` from HATS_CONFIG on top.
function loadHatGeometry(hat, attempt = 0) {
  if (hatGeometryCache.has(hat.id) && hatGeometryCache.get(hat.id)) return;
  if (attempt === 0) hatGeometryCache.set(hat.id, null);
  const loadObj = (materials = null) => {
    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);
    objLoader.load(hat.mesh, (obj) => {
      const source = obj.children.find((child) => child && child.isMesh);
      if (!source) {
        hatGeometryCache.delete(hat.id);
        return;
      }
      if (source.material && materials) {
        const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
        if (sourceMaterial) hatMaterialCache.set(hat.id, sourceMaterial.clone());
      }
      const geometry = source.geometry.clone();
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      if (bb) {
        const cx = (bb.min.x + bb.max.x) / 2;
        const cy = (bb.min.y + bb.max.y) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        geometry.translate(-cx, -cy, -cz);
      }
      geometry.computeVertexNormals();
      smoothExistingVertexNormals(geometry);
      hatGeometryCache.set(hat.id, geometry);
      queueHatUsersRebuild();
    }, undefined, (error) => {
      hatGeometryCache.delete(hat.id);
      hatMaterialCache.get(hat.id)?.dispose?.();
      hatMaterialCache.delete(hat.id);
      // A transient network hiccup must not permanently lose an accessory
      // (e.g. the guest cap). Retry a few times before giving up.
      if (attempt < 3) {
        console.warn(`Hat OBJ load failed (retry ${attempt + 1}/3)`, error);
        setTimeout(() => loadHatGeometry(hat, attempt + 1), 1200 * (attempt + 1));
      } else {
        console.warn("Custom hat OBJ could not be loaded", error);
      }
    });
  };
  if (hat.mtl) {
    new MTLLoader().load(hat.mtl, (materials) => {
      materials.preload();
      loadObj(materials);
    }, undefined, (error) => {
      // An OBJ remains usable without its optional MTL. Its uploaded texture
      // or the normal hat fallback will still be applied below.
      if (attempt < 3) {
        console.warn(`Hat MTL load failed (retry ${attempt + 1}/3)`, error);
        setTimeout(() => loadHatGeometry(hat, attempt + 1), 1200 * (attempt + 1));
      } else {
        console.warn("Custom hat MTL could not be loaded", error);
        loadObj();
      }
    });
    return;
  }
  loadObj();
}

// The supplied burger.rbxm contains a SpecialMesh that points at this OBJ and
// its original Roblox texture. Keep the mesh as authored, only recentering its
// exported pivot so it can follow the R6 right-arm bone like a real Tool.
function loadBurgerAsset() {
  if (burgerAssetPromise) return burgerAssetPromise;
  const loadGeometry = new Promise((resolve) => {
    new OBJLoader().load("uploads/obj.obj", (obj) => {
      let source = null;
      obj.traverse((child) => {
        if (!source && child?.isMesh && child.geometry) source = child;
      });
      if (!source?.geometry) {
        console.warn("Burger OBJ loaded without a renderable mesh");
        resolve(null);
        return;
      }
      const geometry = source.geometry.clone();
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (bounds) {
        geometry.translate(
          -(bounds.min.x + bounds.max.x) / 2,
          -(bounds.min.y + bounds.max.y) / 2,
          -(bounds.min.z + bounds.max.z) / 2
        );
      }
      geometry.computeVertexNormals();
      smoothExistingVertexNormals(geometry);
      resolve(geometry);
    }, undefined, (error) => {
      console.warn("Burger OBJ could not be loaded", error);
      resolve(null);
    });
  });
  const loadTexture = new Promise((resolve) => {
      new THREE.TextureLoader().load("uploads/Meshpart1_diff.png", (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      // OBJLoader/MTLLoader use the normal OBJ convention: the image is
      // flipped on upload, while the exported Roblox UVs remain untouched.
      texture.flipY = true;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      resolve(texture);
    }, undefined, (error) => {
      console.warn("Burger texture could not be loaded", error);
      resolve(null);
    });
  });
  burgerAssetPromise = Promise.all([loadGeometry, loadTexture]).then(([geometry, texture]) => {
    burgerGeometry = geometry;
    burgerTexture = texture;
    refreshAllBurgerUsers();
    return { geometry, texture };
  });
  return burgerAssetPromise;
}

function createBurgerMaterial() {
  // Burger uses the same Roblox Plastic material path as the avatar. The
  // supplied MTL still provides the mesh's texture, but its own diffuse and
  // specular values must not make the burger look different from the player
  // when the material settings sliders change.
  const shininess = THREE.MathUtils.clamp(
    Math.round(9 + (0.5 - materialSettings.roughness) * 13.333),
    1,
    32
  );
  const highlightStrength = THREE.MathUtils.clamp(
    materialSettings.specular * (1 + materialSettings.reflectivity * 9),
    0,
    1
  );
  const specularColor = new THREE.Color(highlightStrength, highlightStrength, highlightStrength);
  if (materialSettings.metalness > 0) {
    specularColor.lerp(new THREE.Color(0xffffff), materialSettings.metalness);
  }
  const material = new THREE.MeshPhongMaterial({
    map: burgerTexture || null,
    color: 0xffffff,
    specular: specularColor,
    shininess,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    alphaTest: 0,
    depthTest: true,
    depthWrite: true,
  });
  material.userData.isTool = true;
  return registerEditableMaterial(material);
}

function applyBurgerGripOrientation(group, forwardVector, rightVector) {
  // GripRight/GripUp/GripForward are the three rotation columns in Roblox's
  // Tool.Grip CFrame. Use both source axes explicitly, then derive Up from
  // Forward x Right so the resulting basis remains orthonormal.
  const forward = forwardVector.clone().normalize();
  const right = rightVector.clone()
    .sub(forward.clone().multiplyScalar(rightVector.dot(forward)))
    .normalize();
  const up = forward.clone().cross(right).normalize();
  const gripMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
  const gripQuaternion = new THREE.Quaternion().setFromRotationMatrix(gripMatrix);
  group.quaternion.copy(BURGER_RIG_AXIS_CORRECTION).multiply(gripQuaternion);
}

function findBurgerToolGroups(root) {
  if (!root) return [];
  const groups = [];
  root.traverse((object) => {
    if (object?.userData?.burgerToolGroup === true || object.name === "CheezburgerTool") {
      groups.push(object);
    }
  });
  return groups;
}

function removeBurgerFromRoot(root) {
  if (!root) return;
  const groups = findBurgerToolGroups(root);
  const trackedGroup = root.userData?.burgerToolGroup;
  if (trackedGroup && !groups.includes(trackedGroup)) groups.push(trackedGroup);
  if (!groups.length) {
    root.userData.burgerToolGroup = null;
    if (root === player.model) burgerGroup = null;
    return;
  }
  const disposedMaterials = new Set();
  for (const group of groups) {
    group.parent?.remove(group);
    group.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material || disposedMaterials.has(material)) continue;
        disposedMaterials.add(material);
        material.dispose?.();
      }
    });
  }
  root.userData.burgerToolGroup = null;
  if (root === player.model) burgerGroup = null;
}

function findBurgerAttachmentBone(root) {
  if (!root) return null;
  // The Tool is welded to the hand/end joint, never to Right Arm_03. The
  // fallback used by hats intentionally skips helper/end bones, so it is not
  // suitable for a held Tool and caused the burger to float from the arm.
  const exact = root.getObjectByName?.("Right Arm_end_08");
  if (exact) return exact;
  let endBone = null;
  root.traverse((object) => {
    if (endBone || !object.isBone) return;
    const name = String(object.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const isRightArmEnd = name.includes("rightarm") && name.includes("end");
    const isRightHand = name.includes("righthand") || name === "handright";
    if (isRightArmEnd || isRightHand) endBone = object;
  });
  if (!endBone) console.warn("Burger hand-end bone not found on the active rig");
  return endBone;
}

function updateBurgerGripTransform(root, group) {
  if (!root || !group) return;
  const activatedGrip = root === player.model
    ? burgerGripActive
    : root.userData?.burgerGrip2Active === true;
  group.position
    .copy(activatedGrip ? burgerGrip2PositionOffset : burgerGrip1PositionOffset)
    .applyQuaternion(BURGER_RIG_AXIS_CORRECTION);
  group.quaternion.identity();
  applyBurgerGripOrientation(
    group,
    activatedGrip ? BURGER_GRIP_FORWARD : BURGER_DEFAULT_GRIP_FORWARD,
    activatedGrip ? BURGER_GRIP_RIGHT : BURGER_DEFAULT_GRIP_RIGHT
  );
  if (activatedGrip) group.rotateY(burgerGrip2YawOffset);
  else group.rotateY(burgerGrip1YawOffset);
}

function applyBurgerToRoot(root, visible) {
  if (!root) return;
  if (root === player.model && visible && !isBurgerEquipped()) visible = false;
  const existingGroups = findBurgerToolGroups(root);
  const trackedGroup = root.userData?.burgerToolGroup;
  if (visible && burgerGeometry && existingGroups.length === 1 && trackedGroup === existingGroups[0]) {
    updateBurgerGripTransform(root, trackedGroup);
    return;
  }
  if (!visible && existingGroups.length === 0) return;
  removeBurgerFromRoot(root);
  if (!visible || !burgerGeometry) {
    if (visible && !burgerGeometry) console.warn("Burger mesh is not ready");
    return;
  }
  const attachmentBone = findBurgerAttachmentBone(root);
  if (!attachmentBone) return;

  const mesh = new THREE.Mesh(burgerGeometry, createBurgerMaterial());
  mesh.name = "CheezburgerMesh";
  // The exported Roblox mesh is vertically flipped around its local Z axis.
  // Correct only that top/bottom orientation; the grip still controls the
  // position and front/back direction.
  mesh.rotation.set(0, 0, Math.PI);
  // Remote tools do not need their own shadow pass. The local burger keeps
  // the same lighting, while crowded rooms avoid one extra shadow caster per
  // player holding the item.
  mesh.castShadow = root === player.model;
  mesh.receiveShadow = root === player.model;
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = "CheezburgerTool";
  group.userData.burgerToolGroup = true;
  updateBurgerGripTransform(root, group);
  group.add(mesh);
  attachmentBone.add(group);
  root.userData.burgerToolGroup = group;
  if (root === player.model) burgerGroup = group;
}

function refreshAllBurgerUsers() {
  const localItem = globalThis.WebbloxInventory?.getEquippedItem?.();
  applyBurgerToRoot(player.model, localItem?.id === BURGER_ITEM_ID);
  for (const remote of multiplayer.remotePlayers.values()) {
    applyBurgerToRoot(remote.model, remoteBurgerVisible(remote));
  }
}

function remoteBurgerVisible(remote) {
  // The server's equipped-item flag is the only condition that can render a
  // remote burger. Tool animation state alone can arrive stale for a frame.
  return remote?.burgerEquipped === true;
}

// -------------------- Dropped burgers ----------------------------------
// Pressing Backspace while holding the burger unequips it, removes it from
// the inventory, and drops a physical burger in the world. It falls to the
// ground under gravity, rests on whatever surface it lands on, and any player
// who walks over it collects it. To stop drops from duplicating items, the
// server hands the burger back to a player who dies without owning one.
const droppedBurgers = new Map();
const DROP_FALL_GRAVITY = 60;
const DROP_FALL_MAX_SPEED = 20;
const DROP_FOOTPRINT = 0.4;
const DROP_PICKUP_RADIUS = 2.3;
const DROP_PICKUP_DELAY_MS = 600;

function spawnDroppedBurger(id, x, y, z, velX = 0, velZ = 0) {
  if (!burgerGeometry || droppedBurgers.has(id)) return;
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(burgerGeometry, createBurgerMaterial());
  mesh.name = "CheezburgerDropMesh";
  mesh.rotation.set(0, 0, Math.PI);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim ? 1.5 / maxDim : 1;
  group.scale.setScalar(scale);
  const halfHeight = (size.y * scale) / 2 || 0.5;
  group.position.set(x, y + halfHeight, z);
  group.userData.droppedBurger = { id, halfHeight, vy: 0, vx: velX, vz: velZ, grounded: false, spawnedAt: Date.now() };
  scene.add(group);
  droppedBurgers.set(id, group);
}

function removeDroppedBurger(id) {
  const group = droppedBurgers.get(id);
  if (!group) return;
  scene.remove(group);
  droppedBurgers.delete(id);
}

function droppedBurgerLandingY(x, z) {
  let top = GROUND_Y;
  for (const collider of colliders) {
    if (
      x + DROP_FOOTPRINT > collider.minX &&
      x - DROP_FOOTPRINT < collider.maxX &&
      z + DROP_FOOTPRINT > collider.minZ &&
      z - DROP_FOOTPRINT < collider.maxZ
    ) {
      if (collider.maxY > top) top = collider.maxY;
    }
  }
  return top;
}

function updateDroppedBurgers(dt) {
  if (droppedBurgers.size === 0) return;
  for (const [id, group] of droppedBurgers) {
    const data = group.userData.droppedBurger;
    if (!data) continue;
    const pos = group.position;
    const base = pos.y - data.halfHeight;
    const landing = droppedBurgerLandingY(pos.x, pos.z);
    // Projectile impulse: carry the burger forward with friction while it
    // falls and until it rolls to a stop.
    if (data.vx || data.vz) {
      const drag = Math.max(0.35, 1 - 2.6 * dt);
      data.vx *= drag;
      data.vz *= drag;
      pos.x += data.vx * dt;
      pos.z += data.vz * dt;
      if (Math.hypot(data.vx, data.vz) < 0.25) { data.vx = 0; data.vz = 0; }
      // If it drifted onto a raised surface, lift it to rest on top.
      const newBase = pos.y - data.halfHeight;
      const newLanding = droppedBurgerLandingY(pos.x, pos.z);
      if (newBase < newLanding) pos.y = newLanding + data.halfHeight;
    }
    if (base > landing + 0.001) {
      data.vy -= DROP_FALL_GRAVITY * dt;
      if (data.vy < -DROP_FALL_MAX_SPEED) data.vy = -DROP_FALL_MAX_SPEED;
      pos.y += data.vy * dt;
      if (pos.y - data.halfHeight <= landing) {
        pos.y = landing + data.halfHeight;
        data.vy = 0;
        data.grounded = true;
      }
    } else {
      pos.y = landing + data.halfHeight;
      data.vy = 0;
      data.grounded = true;
    }
    if (Date.now() - data.spawnedAt >= DROP_PICKUP_DELAY_MS) tryPickupDroppedBurger(id);
  }
}

function tryPickupDroppedBurger(id) {
  if (!multiplayer.connected || !multiplayer.room) return;
  const group = droppedBurgers.get(id);
  if (!group) return;
  const pos = group.position;
  const dx = pos.x - player.pos.x;
  const dz = pos.z - player.pos.z;
  const dy = pos.y - player.pos.y;
  if (Math.hypot(dx, dz) < DROP_PICKUP_RADIUS && Math.abs(dy) < 4) {
    try {
      multiplayer.room.send({ type: "pickupBurger", id });
    } catch {
      handleMultiplayerSendFailure(multiplayer.room, "burger pickup send failed");
    }
  }
}

function dropEquippedBurger() {
  if (burgerGeometry.singletonDropInFlight) return;
  const equipped = globalThis.WebbloxInventory?.getEquippedItem?.();
  if (equipped?.id !== BURGER_ITEM_ID) return;
  burgerGeometry.singletonDropInFlight = true;
  const id = `${multiplayer.id || "local"}-${Date.now()}`;
  // Origin: the burger's actual world position in the player's hand (the grip
  // group), falling instead of dropping from the center of the body.
  let hand = null;
  if (burgerGroup && burgerGroup.isObject3D) {
    burgerGroup.getWorldPosition(hand = (hand || new THREE.Vector3()));
  }
  if (!hand) {
    hand = new THREE.Vector3(
      player.pos.x,
      player.pos.y + 1.3,
      player.pos.z
    );
  }
  const fx = -Math.sin(player.facing);
  const fz = -Math.cos(player.facing);
  const reach = 0.5;
  const x = hand.x + fx * reach;
  const z = hand.z + fz * reach;
  const y = hand.y + 0.1;
  if (!globalThis.WebbloxInventory?.removeItem?.(BURGER_ITEM_ID)) {
    burgerGeometry.singletonDropInFlight = false;
    return;
  }
  // A light forward toss keeps the drop from landing right at the player's feet.
  const toss = 4.5;
  spawnDroppedBurger(id, x, y, z, fx * toss, fz * toss);
  try {
    multiplayer.room?.send?.({ type: "dropBurger", id, x, y, z });
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "dropBurger send failed");
  }
  emitSound("land");
  window.setTimeout(() => {
    burgerGeometry.singletonDropInFlight = false;
  }, 200);
}

loadBurgerAsset();

const remoteHairTextures = new Map(); // dataUrl -> THREE.Texture

function hatTextureFor(path, attempt = 0) {
  if (!hatTextureCache.has(path)) {
    const texture = new THREE.TextureLoader().load(path, () => {
      // On a successful (re)load, refresh any hat materials that may have
      // been built against a stale/empty texture so the cap never stays
      // untextured after a retry.
      queueHatUsersRebuild();
    }, undefined, () => {
      // A transient failure must not leave a hat permanently untextured
      // (e.g. the guest cap). Retry a few times before giving up.
      if (attempt < 3) {
        hatTextureCache.delete(path);
        setTimeout(() => hatTextureFor(path, attempt + 1), 1200 * (attempt + 1));
      }
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    // Keep the authored accessory UV orientation; never offset or remap it.
    texture.flipY = true;
    texture.offset.set(0, 0);
    texture.repeat.set(1, 1);
    texture.center.set(0, 0);
    texture.rotation = 0;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    hatTextureCache.set(path, texture);
  }
  return hatTextureCache.get(path);
}

function applyHatStyle(material, hat, styleOverride = undefined) {
  const style = styleOverride === undefined
    ? (hatStyleMap.get(hat.id) || defaultHatStyle(hat))
    : (styleOverride || defaultHatStyle(hat));
  const tint = new THREE.Color(style.tint || "#ffffff");
  const hue = Number.isFinite(Number(style.hue)) ? Number(style.hue) : 0;
  const saturation = Number.isFinite(Number(style.saturation)) ? Number(style.saturation) : 1;
  const lightness = Number.isFinite(Number(style.lightness)) ? Number(style.lightness) : 1;
  const opacity = Number.isFinite(Number(style.opacity)) ? Number(style.opacity) : 1;
  // Keep the tint as the material color, then transform the sampled texture
  // in the shader. Applying HSL only to material.color made hue/saturation
  // look inert whenever the tint was white.
  material.color.copy(tint);
  const needsTextureTransform = Math.abs(hue) > 0.001
    || Math.abs(saturation - 1) > 0.001
    || Math.abs(lightness - 1) > 0.001;
  if (needsTextureTransform) material.onBeforeCompile = (shader) => {
    shader.uniforms.hatHue = { value: hue * Math.PI / 180 };
    shader.uniforms.hatSaturation = { value: saturation };
    shader.uniforms.hatLightness = { value: lightness };
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `uniform float hatHue;
uniform float hatSaturation;
uniform float hatLightness;
vec3 hatRgbToHsv(vec3 color) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(color.bg, k.wz), vec4(color.gb, k.xy), step(color.b, color.g));
  vec4 q = mix(vec4(p.xyw, color.r), vec4(color.r, p.yzx), step(p.x, color.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hatHsvToRgb(vec3 color) {
  vec3 p = abs(fract(color.xxx + vec3(0.0, 1.0 / 3.0, 2.0 / 3.0)) * 6.0 - 3.0);
  return color.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), color.y);
}
void main() {`
    ).replace(
      "#include <map_fragment>",
      `#include <map_fragment>
vec3 hatHsv = hatRgbToHsv(diffuseColor.rgb);
hatHsv.x = fract(hatHsv.x + hatHue / 6.28318530718);
hatHsv.y = clamp(hatHsv.y * hatSaturation, 0.0, 1.0);
hatHsv.z = clamp(hatHsv.z * hatLightness, 0.0, 1.0);
diffuseColor.rgb = clamp(hatHsvToRgb(hatHsv), 0.0, 1.0);`
    );
  };
  if (needsTextureTransform) material.customProgramCacheKey = () => "hat-style-hsv";
  material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
  // PBR-style hat controls (roughness / metalness / specular) default to the
  // player's global material profile. They map onto MeshPhongMaterial exactly
  // the way the global "All materials" settings do: roughness tightens the
  // highlight, specular scales its strength, and metalness tints it toward the
  // base color. The pre-existing Shine slider is kept as an extra shininess
  // boost on top.
  const roughness = Number.isFinite(Number(style.roughness)) ? Number(style.roughness) : materialSettings.roughness;
  const metalness = Number.isFinite(Number(style.metalness)) ? Number(style.metalness) : materialSettings.metalness;
  const specularScale = Number.isFinite(Number(style.specularScale)) ? Number(style.specularScale) : materialSettings.specular;
  const derivedShininess = THREE.MathUtils.clamp(
    Math.round(9 + (0.5 - roughness) * 13.333),
    1,
    32
  );
  const highlightStrength = THREE.MathUtils.clamp(specularScale, 0, 1);
  const baseSpecular = new THREE.Color(highlightStrength, highlightStrength, highlightStrength);
  if (metalness > 0) baseSpecular.lerp(material.color, metalness);
  material.specular.copy(baseSpecular);
  material.shininess = Math.max(
    derivedShininess,
    Math.max(0, Number.isFinite(Number(style.shininess)) ? Number(style.shininess) : 8)
  );
  material.transparent = material.opacity < 1 || Boolean(hat.texture) || hat.category === "hair";
  material.alphaTest = 0.01;
  material.flatShading = false;
  // Record the authored appearance so the camera-zoom fade (and the world-mode
  // body-part hidden state) can layer on top of it without permanently baking
  // opacity/transparency back into the hat's own style.
  material.userData.originalTransparent = Boolean(material.transparent);
  material.userData.originalOpacity = material.opacity;
  material.userData.originalDepthWrite = Boolean(material.depthWrite);
  // Hats are part of the same global material set as the avatar and world.
  // This makes the game's All materials roughness/specular sliders update
  // already-equipped and remote accessories immediately.
  registerEditableMaterial(material);
  material.needsUpdate = true;
}

function hatMaterialFor(hat, hairTextureDataUrl, styleOverride = undefined, useLocalPaint = false, hatTexturesOverride = undefined) {
  // The local HAT tab paints one selected item at a time. Once selected, the
  // canvas is the material map for that item instead of the generic brown
  // fallback or another hat's texture.
  //
  // Only replace a hat's real appearance with the paint canvas when it is a
  // hair item (the shared hair-paint surface) or the user has actually painted
  // on this hat (persisted or live this session). A custom accessory that just
  // has an uploaded texture must keep showing that real texture while it is
  // selected for adjustment, instead of jumping to a briefly-blank canvas that
  // reads as invisible.
  // While a hat is selected in the Hats tab, the paint surface holds that
  // hat's own texture (drawHatPaintSource loads it into the canvas). Use the
  // canvas as the map for the selected hat so painting applies live and
  // switching hats immediately shows that hat's texture, instead of only ever
  // swapping the canvas on hair items or already-painted accessories.
  if (useLocalPaint && !hairTextureDataUrl && hatPaintTargetId === hat.id
      && hatPaintReadyId === hat.id) {
    const material = new THREE.MeshPhongMaterial({
      map: hairEditorTexture || ensureHairTexture(),
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
    });
    material.userData.isHat = true;
    material.userData.isHair = hat.category === "hair";
    applyHatStyle(material, hat, styleOverride);
    return material;
  }
  // A per-hat painted/uploaded texture (from this client's own editor or a
  // remote player's network state) always wins over the hat's bundled default.
  const overrideTexture = hatTexturesOverride && hatTexturesOverride[hat.id]
    ? hatTexturesOverride[hat.id]
    : (useLocalPaint ? hatPaintTextures.get(hat.id) : null);
  if (overrideTexture) {
    const texture = hatTextureFor(overrideTexture);
    const material = new THREE.MeshPhongMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
    });
    material.userData.isHat = true;
    material.userData.isHair = hat.category === "hair";
    applyHatStyle(material, hat, styleOverride);
    return material;
  }
  // A hat/hair with its own texture always shows that real texture. This is
  // what replaced the old plain-brown default for the hair items.
  if (hat.texture) {
    const texture = hatTextureFor(hat.texture);
    const material = new THREE.MeshPhongMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
    });
    material.userData.isHat = true;
    material.userData.isHair = hat.category === "hair";
    applyHatStyle(material, hat, styleOverride);
    return material;
  }
  if (hatMaterialCache.has(hat.id)) {
    const material = hatMaterialCache.get(hat.id).clone();
    material.side = THREE.DoubleSide;
    material.userData.isHat = true;
    material.userData.isHair = hat.category === "hair";
    applyHatStyle(material, hat, styleOverride);
    return material;
  }
  if (hat.category === "hair") {
    let map;
    if (hairTextureDataUrl) {
      let cached = remoteHairTextures.get(hairTextureDataUrl);
      if (!cached) {
        cached = new THREE.TextureLoader().load(hairTextureDataUrl);
        cached.colorSpace = THREE.SRGBColorSpace;
        cached.flipY = true;
        cached.offset.set(0, 0);
        cached.repeat.set(1, 1);
        cached.center.set(0, 0);
        cached.rotation = 0;
        remoteHairTextures.set(hairTextureDataUrl, cached);
      }
      map = cached;
    } else {
      map = hairEditorTexture || ensureHairTexture();
    }
    const material = new THREE.MeshPhongMaterial({
      map,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
    });
    material.userData.isHair = true;
    material.userData.isHat = true;
    applyHatStyle(material, hat, styleOverride);
    return material;
  }
  const brownMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(HATS_CONFIG.brown),
    transparent: true,
    alphaTest: 0.01,
    side: THREE.DoubleSide,
  });
  brownMaterial.userData.isHat = true;
  applyHatStyle(brownMaterial, hat, styleOverride);
  return brownMaterial;
}

function findHeadBone(root) {
  let found = null;
  root.traverse((object) => {
    if (!found && object.isBone && /head|neck/i.test(object.name)) found = object;
  });
  return found;
}

function findCustomHatAttachmentBone(root, attachment = "Head", fallback = null) {
  if (!root) return fallback;
  const normalizedAttachment = CUSTOM_HAT_ATTACHMENT_VALUES.has(attachment) ? attachment : "Head";
  const matches = {
    Head: ["head", "neck", "headbone"],
    Torso: ["torso", "chest", "spine", "upperbody", "humanoidrootpart", "root"],
    LeftArm: ["leftarm", "leftupperarm", "leftlowerarm", "leftforearm", "larm"],
    RightArm: ["rightarm", "rightupperarm", "rightlowerarm", "rightforearm", "rarm"],
    LeftLeg: ["leftleg", "leftupperleg", "leftlowerleg", "leftfoot", "lleg"],
    RightLeg: ["rightleg", "rightupperleg", "rightlowerleg", "rightfoot", "rleg"],
  };
  const bones = [];
  root.traverse((object) => {
    if (object.isBone) bones.push(object);
  });
  // The bundled R6 rig names its bones `Head_01`, `Left Arm_02`, etc. Other
  // avatar imports may prefix those names with an armature name. Match the
  // actual body-part token while ignoring helper/end bones.
  const found = matches[normalizedAttachment]?.flatMap((part) => bones.filter((bone) => {
    const name = String(bone.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return name.includes(part) && !name.includes("end");
  }))[0] || matches[normalizedAttachment]?.flatMap((part) => bones.filter((bone) => {
    const name = String(bone.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return name.includes(part);
  }))[0];
  return found || fallback;
}

function removeHatGroups(root) {
  const doomed = [];
  root.traverse((object) => {
    if (object.userData?.hatGroup) doomed.push(object);
  });
  for (const group of doomed) {
    disposeHatGroup(group);
  }
}

function disposeHatGroup(group) {
  if (!group) return;
  group.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      unregisterEditableMaterial(material);
      material?.dispose?.();
    });
  });
  group.parent?.remove(group);
}

function hatMaterialKey(hat, hairTextureDataUrl, styleOverride, useLocalPaint, hatTexturesOverride) {
  const localPaint = useLocalPaint && !hairTextureDataUrl
    && hatPaintTargetId === hat.id && hatPaintReadyId === hat.id;
  const overrideTexture = hatTexturesOverride?.[hat.id]
    || (useLocalPaint ? hatPaintTextures.get(hat.id) : null)
    || null;
  const style = styleOverride === undefined
    ? (hatStyleMap.get(hat.id) || defaultHatStyle(hat))
    : (styleOverride || defaultHatStyle(hat));
  return JSON.stringify([
    localPaint ? "local-paint" : "",
    overrideTexture,
    hat.texture || null,
    hairTextureDataUrl || null,
    hat.mtl || null,
    style,
  ]);
}

let hatUsersRebuildFrame = 0;
function queueHatUsersRebuild() {
  if (hatUsersRebuildFrame) return;
  hatUsersRebuildFrame = requestAnimationFrame(() => {
    hatUsersRebuildFrame = 0;
    rebuildAllHatUsers();
  });
}

function applyHatsToRoot(root, headBone, hatIds, hairTextureDataUrl, styleOverrides = undefined, adjustOverrides = undefined, customHatState = [], hatTexturesOverride = undefined) {
  if (!root || !headBone) return;
  const isLocalPlayer = root === player.model;
  if (isLocalPlayer) localHatMaterials.length = 0;
  const resolvedHatIds = [...(hatIds || [])];
  const customStates = Array.isArray(customHatState)
    ? customHatState
    : customHatState ? [customHatState] : [];
  const customStateMap = new Map();
  for (const state of customStates) {
    const customHat = ensureCustomHatDefinition(
      state,
      root === player.model || root === hatPreviewAvatar
    );
    if (!customHat) continue;
    customStateMap.set(customHat.id, state);
    if (state.enabled !== false && !resolvedHatIds.includes(customHat.id)) {
      resolvedHatIds.push(customHat.id);
    }
  }
  const existingGroups = new Map();
  root.traverse((object) => {
    if (object.userData?.hatGroup && !existingGroups.has(object.userData.hatId)) {
      existingGroups.set(object.userData.hatId, object);
    }
  });
  const desiredGroups = new Set();
  for (const hatId of resolvedHatIds) {
    const hat = hatItemMap.get(hatId);
    const geometry = hatGeometryCache.get(hatId);
    if (!hat || !geometry) continue;
    const customState = customStateMap.get(hatId);
    // A custom hat that was explicitly disabled must never render, even if its
    // id is still present in the worn list (which happens when the equip list
    // or a forceavatar populated `equippedHats`).
    if (customState && customState.enabled === false) continue;
    desiredGroups.add(hatId);
    const styleOverride = styleOverrides === undefined
      ? undefined
      : styleOverrides[hatId] || customState?.style || null;
    const useLocalPaint = styleOverrides === undefined;
    const materialKey = hatMaterialKey(hat, hairTextureDataUrl, styleOverride, useLocalPaint, hatTexturesOverride);
    let group = existingGroups.get(hatId);
    let mesh = group?.children.find((child) => child.isMesh) || null;
    if (!group) {
      group = new THREE.Group();
      group.userData.hatGroup = true;
      group.userData.hatId = hatId;
    }
    if (!mesh) {
      mesh = new THREE.Mesh(geometry, null);
      group.add(mesh);
    } else if (mesh.geometry !== geometry) {
      mesh.geometry = geometry;
    }
    if (group.userData.hatMaterialKey !== materialKey || !mesh.material) {
      const previousMaterial = mesh.material;
      const material = hatMaterialFor(hat, hairTextureDataUrl, styleOverride, useLocalPaint, hatTexturesOverride);
      mesh.material = material;
      group.userData.hatMaterialKey = materialKey;
      if (previousMaterial && previousMaterial !== material) {
        unregisterEditableMaterial(previousMaterial);
        previousMaterial.dispose?.();
      }
    }
    const material = mesh.material;
    if (isLocalPlayer) localHatMaterials.push(material);
    mesh.castShadow = isLocalPlayer;
    mesh.frustumCulled = false;
    // Live position/rotation overrides (editable in the Hats tab) layer on
    // top of the HATS_CONFIG defaults above.
    const adjust = adjustOverrides === undefined
      ? (hatAdjustMap.get(hatId) || defaultHatAdjust(hat))
      : (adjustOverrides[hatId] || (customState
        ? { offset: customState.position || [0, 0, 0], rotation: customState.rotation || [0, 0, 0], scale: customState.scale || 1 }
        : defaultHatAdjust(hat)));
    // The R15 attachment frame is yaw-corrected, so its horizontal offset
    // axes are reversed. Keep the vertical offset untouched.
    const r15Accessory = headBone?.name === "Head";
    group.position.set(
      r15Accessory ? -(adjust.offset[0] || 0) : adjust.offset[0],
      adjust.offset[1],
      r15Accessory ? -(adjust.offset[2] || 0) : adjust.offset[2]
    );
    group.scale.setScalar(clampHatScale(adjust.scale));
    group.rotation.order = "XYZ";
    // R15's head/body frame has a 180° yaw correction, while accessory
    // offsets are already authored in the game's forward frame. Compensate
    // only the accessory rotation; never touch its saved position offset.
    group.rotation.set(
      (adjust.rotation[0] || 0) * Math.PI / 180,
      (adjust.rotation[1] || 0) * Math.PI / 180 + (r15Accessory ? R15_ACCESSORY_YAW_CORRECTION : 0),
      (adjust.rotation[2] || 0) * Math.PI / 180
    );
    // Keep the imported accessory's authored up axis. A blanket Z flip makes
    // custom accessories and several Roblox exports appear upside down.
    mesh.rotation.set(0, 0, 0);
    const attachmentBone = findCustomHatAttachmentBone(
      root,
      customState?.attachTo || hat.attachTo || hat.bone || "Head",
      headBone
    );
    if (attachmentBone) attachmentBone.add(group);
  }
  for (const [hatId, group] of existingGroups) {
    if (!desiredGroups.has(hatId)) disposeHatGroup(group);
  }
}

function rebuildAllHatUsers() {
  rebuildLocalHats();
  for (const remote of multiplayer.remotePlayers.values()) applyHatsToRemote(remote);
}

function rebuildLocalHats() {
  if (!player.model || !headBone) return;
  const guestHat = hatItemMap.get(GUEST_HAT_ID);
  const guest = isGuestPlayer() && guestHat;
  const hatIds = guest ? [GUEST_HAT_ID] : [...equippedHats];
  const guestStyles = guest ? { [GUEST_HAT_ID]: defaultHatStyle(guestHat) } : undefined;
  const guestAdjusts = guest ? { [GUEST_HAT_ID]: defaultHatAdjust(guestHat) } : undefined;
  applyHatsToRoot(
    player.model,
    headBone,
    hatIds,
    null,
    guestStyles,
    guestAdjusts,
    guest ? [] : localCustomHatState(),
    localHatTextureOverrides()
  );
  refreshHatPreview();
}

function localHatTextureOverrides() {
  if (isGuestPlayer()) return { [GUEST_HAT_ID]: GUEST_HAT_TEXTURE };
  if (!hatPaintTextures.size) return undefined;
  return Object.fromEntries(hatPaintTextures);
}

function applyHatsToRemote(remote) {
  const hatIds = remote.hats || [];
  if (!remote.group) return;
  const head = remote.headBone || findHeadBone(remote.group);
  remote.headBone = head;
  // Remote appearance is authoritative per player. Passing empty maps is
  // intentional: an older client without appearance data gets config
  // defaults, never this client's locally customized values.
  const overrides = { ...(remote.hatTextures || {}) };
  // A remote that is live-painting a specific hat uses its shared paint
  // surface as that hat's texture so the edit is visible in real time.
  if (remote.liveHatTargetId && !overrides[remote.liveHatTargetId] && typeof remote.hairTexture === "string") {
    overrides[remote.liveHatTargetId] = remote.hairTexture;
  }
  applyHatsToRoot(
    remote.group,
    head,
    hatIds,
    remote.hairTexture,
    remote.hatStyles || {},
    remote.hatAdjusts || {},
    remote.customHats || remote.customHat || [],
    overrides
  );
}

function loadHatAssets() {
  for (const hat of HATS_CONFIG.items) loadHatGeometry(hat);
}

// --- Hair painting (mini editor inside the Hats tab) ---
let hairTool = "pencil";
let hairDrawing = false;
let hairLast = null;
let hairGestureStart = null;
let hairGestureSnapshot = null;
let hairGestureSelectionCanvas = null;
let hairSelection = null;
const hairSelectionCanvas = document.getElementById("hair-texture-selection");
const hairSelectionContext = hairSelectionCanvas?.getContext("2d");

function normalizedHairSelection(start, end) {
  const x = Math.round(Math.min(start.x, end.x));
  const y = Math.round(Math.min(start.y, end.y));
  return {
    x: THREE.MathUtils.clamp(x, 0, hairCanvas.width),
    y: THREE.MathUtils.clamp(y, 0, hairCanvas.height),
    width: THREE.MathUtils.clamp(Math.round(Math.abs(end.x - start.x)), 1, hairCanvas.width),
    height: THREE.MathUtils.clamp(Math.round(Math.abs(end.y - start.y)), 1, hairCanvas.height),
  };
}

function renderHairSelection() {
  if (!hairSelectionContext || !hairSelectionCanvas) return;
  hairSelectionContext.clearRect(0, 0, hairSelectionCanvas.width, hairSelectionCanvas.height);
  if (!hairSelection) return;
  hairSelectionContext.save();
  hairSelectionContext.setLineDash([5, 3]);
  hairSelectionContext.lineWidth = 1;
  hairSelectionContext.strokeStyle = "#1476e8";
  hairSelectionContext.strokeRect(hairSelection.x + 0.5, hairSelection.y + 0.5, hairSelection.width, hairSelection.height);
  hairSelectionContext.restore();
}

function clearHairSelection() {
  hairSelection = null;
  renderHairSelection();
}

function hairCanvasPoint(event) {
  const rect = hairCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * hairCanvas.width / rect.width,
    y: (event.clientY - rect.top) * hairCanvas.height / rect.height,
  };
}

function startHairDrawing(event) {
  if (avatarEditorMode !== "hats") return;
  const layer = activeHatPaintLayer();
  if (!layer) return;
  hairDrawing = true;
  hairLast = hairCanvasPoint(event);
  hairGestureStart = { ...hairLast };
  hairGestureSnapshot = (hairTool === "move" || ["rectangle", "circle", "line"].includes(hairTool))
    ? layer.context.getImageData(0, 0, hairCanvas.width, hairCanvas.height)
    : null;
  hairGestureSelectionCanvas = null;
  if (hairTool === "move" && hairSelection) {
    hairGestureSelectionCanvas = document.createElement("canvas");
    hairGestureSelectionCanvas.width = hairSelection.width;
    hairGestureSelectionCanvas.height = hairSelection.height;
    hairGestureSelectionCanvas.getContext("2d").drawImage(
      layer.canvas,
      hairSelection.x,
      hairSelection.y,
      hairSelection.width,
      hairSelection.height,
      0,
      0,
      hairSelection.width,
      hairSelection.height
    );
  }
  hairCanvas.setPointerCapture(event.pointerId);
  if (hairTool === "move" || ["rectangle", "circle", "line"].includes(hairTool)) {
    updateHairGesture(hairLast);
  } else if (hairTool !== "select") {
    strokeHair(hairLast, hairLast);
  }
}

function moveHairDrawing(event) {
  if (!hairDrawing) return;
  const point = hairCanvasPoint(event);
  if (hairTool === "move" || ["rectangle", "circle", "line"].includes(hairTool)) {
    updateHairGesture(point);
  } else if (hairTool !== "select") {
    strokeHair(hairLast, point);
  }
  hairLast = point;
}

function stopHairDrawing(event) {
  if (!hairDrawing) return;
  hairDrawing = false;
  hairLast = null;
  if (hairTool === "select" && hairGestureStart) {
    hairSelection = normalizedHairSelection(hairGestureStart, hairCanvasPoint(event));
    renderHairSelection();
  }
  hairGestureStart = null;
  hairGestureSnapshot = null;
  hairGestureSelectionCanvas = null;
  if (hairTool === "move" || ["rectangle", "circle", "line"].includes(hairTool)) {
    finishHatPaintEdit();
  }
  if (event?.pointerId !== undefined && hairCanvas.hasPointerCapture(event.pointerId)) {
    hairCanvas.releasePointerCapture(event.pointerId);
  }
}

function updateHairGesture(point) {
  const layer = activeHatPaintLayer();
  if (!layer || !hairGestureStart || !hairGestureSnapshot) return;
  const context = layer.context;
  context.putImageData(hairGestureSnapshot, 0, 0);
  const dx = point.x - hairGestureStart.x;
  const dy = point.y - hairGestureStart.y;
  if (hairTool === "move") {
    context.clearRect(0, 0, hairCanvas.width, hairCanvas.height);
    if (hairSelection && hairGestureSelectionCanvas) {
      context.putImageData(hairGestureSnapshot, 0, 0);
      context.clearRect(hairSelection.x, hairSelection.y, hairSelection.width, hairSelection.height);
      context.drawImage(
        hairGestureSelectionCanvas,
        hairSelection.x + Math.round(dx),
        hairSelection.y + Math.round(dy)
      );
    } else {
      context.putImageData(hairGestureSnapshot, Math.round(dx), Math.round(dy));
    }
  } else {
    context.save();
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = hairBrushColor.value;
    context.fillStyle = hairBrushColor.value;
    context.lineWidth = Number(hairBrushSize.value);
    context.lineCap = "round";
    context.lineJoin = "round";
    if (hairTool === "rectangle") {
      context.globalAlpha = 0.35;
      context.fillRect(hairGestureStart.x, hairGestureStart.y, dx, dy);
      context.globalAlpha = 1;
      context.strokeRect(hairGestureStart.x, hairGestureStart.y, dx, dy);
    } else if (hairTool === "circle") {
      const radius = Math.hypot(dx, dy);
      context.beginPath();
      context.arc(hairGestureStart.x, hairGestureStart.y, radius, 0, Math.PI * 2);
      context.globalAlpha = 0.35;
      context.fill();
      context.globalAlpha = 1;
      context.stroke();
    } else if (hairTool === "line") {
      context.beginPath();
      context.moveTo(hairGestureStart.x, hairGestureStart.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
  }
  renderHatPaintLayers();
  refreshHairTexture();
}

function strokeHair(from, to) {
  const layer = activeHatPaintLayer();
  if (!layer) return;
  const context = layer.context;
  const size = Number(hairBrushSize.value);
  const radius = size / 2;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = size;
  if (hairTool === "eraser") {
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
    renderHatPaintLayers();
    markHatActivePainted();
    refreshHairTexture();
    return;
  }
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = hairBrushColor.value;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
  renderHatPaintLayers();
  markHatActivePainted();
  refreshHairTexture();
}

function bucketHair(point) {
  const layer = activeHatPaintLayer();
  if (!layer) return;
  const context = layer.context;
  const width = hairCanvas.width;
  const height = hairCanvas.height;
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const startIndex = (Math.floor(point.y) * width + Math.floor(point.x)) * 4;
  const target = [pixels[startIndex], pixels[startIndex + 1], pixels[startIndex + 2], pixels[startIndex + 3]];
  const replacement = hairColorToRgba(hairBrushColor.value);
  const tolerance = 24;
  if (target.every((v, i) => Math.abs(v - replacement[i]) <= tolerance)) return;
  const stack = [Math.floor(point.y) * width + Math.floor(point.x)];
  const visited = new Uint8Array(width * height);
  while (stack.length) {
    const loc = stack.pop();
    if (visited[loc]) continue;
    visited[loc] = 1;
    const x = loc % width;
    const y = Math.floor(loc / width);
    const pi = loc * 4;
    if (Math.abs(pixels[pi] - target[0]) > tolerance || Math.abs(pixels[pi + 1] - target[1]) > tolerance ||
        Math.abs(pixels[pi + 2] - target[2]) > tolerance || Math.abs(pixels[pi + 3] - target[3]) > tolerance) continue;
    pixels[pi] = replacement[0];
    pixels[pi + 1] = replacement[1];
    pixels[pi + 2] = replacement[2];
    pixels[pi + 3] = replacement[3];
    if (x > 0) stack.push(loc - 1);
    if (x < width - 1) stack.push(loc + 1);
    if (y > 0) stack.push(loc - width);
    if (y < height - 1) stack.push(loc + width);
  }
  context.putImageData(image, 0, 0);
  renderHatPaintLayers();
  markHatActivePainted();
  refreshHairTexture();
}

function hairColorToRgba(color) {
  const value = String(color || "#ffffff").replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  ];
}

function applyHairHue(degrees) {
  const layer = activeHatPaintLayer();
  if (!layer) return;
  const context = layer.context;
  const image = context.getImageData(0, 0, hairCanvas.width, hairCanvas.height);
  const pixels = image.data;
  const hueRad = (Number(degrees) || 0) * Math.PI / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const m00 = 0.213 + cosH * 0.787 + sinH * -0.213;
  const m01 = 0.715 + cosH * -0.715 + sinH * 0.715;
  const m02 = 0.072 + cosH * -0.072 + sinH * 0.072;
  const m10 = 0.213 + cosH * -0.213 + sinH * 0.143;
  const m11 = 0.715 + cosH * 0.285 + sinH * 0.140;
  const m12 = 0.072 + cosH * -0.072 + sinH * -0.283;
  const m20 = 0.213 + cosH * -0.213 + sinH * -0.787;
  const m21 = 0.715 + cosH * -0.715 + sinH * 0.715;
  const m22 = 0.072 + cosH * 0.928 + sinH * 0.072;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const r = pixels[index] / 255;
    const g = pixels[index + 1] / 255;
    const b = pixels[index + 2] / 255;
    pixels[index] = Math.round(Math.min(1, Math.max(0, m00 * r + m01 * g + m02 * b)) * 255);
    pixels[index + 1] = Math.round(Math.min(1, Math.max(0, m10 * r + m11 * g + m12 * b)) * 255);
    pixels[index + 2] = Math.round(Math.min(1, Math.max(0, m20 * r + m21 * g + m22 * b)) * 255);
  }
  context.putImageData(image, 0, 0);
  renderHatPaintLayers();
  markHatActivePainted();
  refreshHairTexture();
}

function broadcastHairTexture() {
  hairBroadcastTimer = null;
  if (!multiplayer.connected || !multiplayer.room || !hatEditorReady) return;
  const targetId = hatPaintTargetId && hatItemMap.has(hatPaintTargetId) ? hatPaintTargetId : null;
  if (!targetId) return;
  // Realtime frames are limited in size. Use a compact live preview here;
  // Apply/switching uploads the full PNG and stores its permanent URL.
  const url = captureHatPaintDataUrl("image/webp", 0.55);
  if (!url) return;
  if (url.length > 56000) return;
  if (url === lastSentHairTexture && !hairSyncDirty) return;
  try {
    multiplayer.room.send({ type: "hairTexture", data: url, hatTarget: targetId });
    lastSentHairTexture = url;
    hairSyncDirty = false;
  } catch {
    // ignore transient send failures
  }
}
let hairBroadcastTimer = null;
let lastSentHairTexture = null;
let hairSyncDirty = true;
function scheduleHairBroadcast() {
  if (hairBroadcastTimer || !hatEditorReady) return;
  hairBroadcastTimer = window.setTimeout(broadcastHairTexture, 450);
}
function publishHairTexture() {
  if (!hatEditorReady) return;
  if (hatPaintTargetId) {
    const dataUrl = captureHatPaintDataUrl();
    if (dataUrl) hatPaintTextures.set(hatPaintTargetId, dataUrl);
    saveHatPaintState();
  }
  const targetHat = hatPaintTargetId ? hatItemMap.get(hatPaintTargetId) : null;
  if (targetHat) persistHatPaint(targetHat);
  else broadcastHairTexture();
}

function persistHatPaint(hat, dataUrl = null) {
  if (!hat || !hatEditorReady) return;
  if (hat.isCustom && isOwnerName(multiplayer.username)) {
    void applyCustomHatPaint(hat, dataUrl);
  } else {
    void applyHatTextureFor(hat);
  }
}

// Persist the painted texture of a custom hat server-side. The painted canvas
// is uploaded to a permanent URL and stored on the custom hat's `texture`, so
// the painting survives reloads and is shared with every other player through
// the normal custom-hat network state instead of living only in local storage.
async function applyCustomHatPaint(hat, providedDataUrl = null) {
  if (!hat && hatPaintTargetId) hat = hatItemMap.get(hatPaintTargetId);
  if (!hat || !hat.isCustom || !isOwnerName(multiplayer.username)) return;
  // Keep an immediate local copy so the current session never loses the edit.
  const dataUrl = providedDataUrl || captureHatPaintDataUrl();
  if (!dataUrl) {
    if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = "Hat texture cannot be read from this image";
    return;
  }
  hatPaintTextures.set(hat.id, dataUrl);
  saveHatPaintState();
  let url = null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/hardcore-hat-upload", {
        method: "POST",
        headers: { "content-type": "image/png", "x-upload-kind": "texture" },
        body: blob,
        signal: controller.signal,
      });
      let body = null;
      try { body = await response.json(); } catch { /* ignore */ }
      if (response.ok && isShareableAvatarUrl(body?.url)) url = body.url;
    } catch {
      url = null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  } catch {
    url = null;
  }

  const state = getLocalCustomHat(hat.id);
  if (url && state) {
    state.texture = url;
    selectedCustomHatId = state.id;
    saveCustomHatState();
    hat.texture = url;
    ensureCustomHatDefinition(state);
    hatPaintTextures.set(hat.id, url);
    hatActivePainted.delete(hat.id);
    saveHatPaintState();
    rebuildLocalHats();
    multiplayer.lastSentAt = 0;
    sendMultiplayerState(Date.now());
    // The upload may finish after the user has already selected another hat.
    // Rebuild the options without snapping the settings dropdown back to this
    // custom hat.
    refreshHatAdjustOptions(hatPaintTargetId || selectedCustomHatId);
    if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = "Hat painting saved on server";
    return;
  }
  // Server unavailable: keep the local paint so this session still shows it.
  refreshHatPreview();
  if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = "Hat painted (server upload failed; kept locally)";
}

// --- Hats tab UI wiring ---
const avatarModeButtonsAll = [...document.querySelectorAll("[data-avatar-mode]")];
const avatarHatsPanel = document.getElementById("avatar-hats-panel");
const avatarHatsEquipList = document.getElementById("avatar-hats-equip-list");
const avatarHatsApply = document.getElementById("avatar-hats-apply");
const hardcoreCustomHatPanel = document.getElementById("hardcore-custom-hat-panel");
const hardcoreCustomHatModel = document.getElementById("hardcore-custom-hat-model");
const hardcoreCustomHatMtl = document.getElementById("hardcore-custom-hat-mtl");
const hardcoreCustomHatTexture = document.getElementById("hardcore-custom-hat-texture");
const hardcoreCustomHatAttach = document.getElementById("hardcore-custom-hat-attach");
const hardcoreCustomHatImport = document.getElementById("hardcore-custom-hat-import");
const hardcoreCustomHatDelete = document.getElementById("hardcore-custom-hat-delete");
const hardcoreCustomHatEnabled = document.getElementById("hardcore-custom-hat-enabled");
const hardcoreCustomHatStatus = document.getElementById("hardcore-custom-hat-status");
const hairCanvasEl = document.getElementById("hair-texture-canvas");
const hatPreviewCanvas = document.getElementById("avatar-hats-preview-canvas");
let hatPreviewRenderer = null;
let hatPreviewScene = null;
let hatPreviewCamera = null;
let hatPreviewAvatar = null;
let hatPreviewAvatarGroup = null;
let hatPreviewReady = false;
let hatPreviewRefreshFrame = 0;
let hatPreviewSource = null;
const hatPreviewFocus = new THREE.Vector3();
const hatPreviewDirection = new THREE.Vector3();
const HAT_PREVIEW_PITCH = THREE.MathUtils.degToRad(-23.927);
const HAT_PREVIEW_YAW = THREE.MathUtils.degToRad(26.341);
const HAT_PREVIEW_ROLL = 0;
const HAT_PREVIEW_MIN_DISTANCE = 6.5;
const HAT_PREVIEW_MAX_DISTANCE = 8.5;
const hairBrushColor = document.getElementById("hair-brush-color");
const hairBrushSize = document.getElementById("hair-brush-size");
const hairBrushSizeValue = document.getElementById("hair-brush-size-value");
const hairHueInput = document.getElementById("hair-hue");

function updateHardcoreCustomHatUI() {
  const owner = isOwnerName(multiplayer.username);
  const hats = localCustomHats();
  const selected = getLocalCustomHat() || hats[hats.length - 1] || null;
  if (selected) selectedCustomHatId = selected.id;
  if (hardcoreCustomHatPanel) hardcoreCustomHatPanel.hidden = !owner || avatarEditorMode !== "hats";
  if (hardcoreCustomHatEnabled) hardcoreCustomHatEnabled.checked = selected?.enabled === true;
  if (hardcoreCustomHatAttach) hardcoreCustomHatAttach.value = selected?.attachTo || "Head";
  if (hardcoreCustomHatDelete) hardcoreCustomHatDelete.disabled = !selected;
  if (hardcoreCustomHatStatus) {
    hardcoreCustomHatStatus.textContent = selected
      ? `${hats.length} custom hat${hats.length === 1 ? "" : "s"} • ${selected.name} ${selected.enabled ? "enabled" : "disabled"}`
      : "No custom hat imported";
  }
}

function setSelectedCustomHatAttachment(value) {
  if (!isOwnerName(multiplayer.username)) return;
  const selected = getLocalCustomHat();
  if (!selected) return;
  selected.attachTo = CUSTOM_HAT_ATTACHMENT_VALUES.has(value) ? value : "Head";
  // A new attachment starts at the center of that body part. The position
  // sliders can then be used for the final offset.
  selected.position = [0, 0, 0];
  const adjust = hatAdjustMap.get(selected.id) || defaultHatAdjust(hatItemMap.get(selected.id));
  adjust.offset = [0, 0, 0];
  hatAdjustMap.set(selected.id, adjust);
  if (hardcoreCustomHatAttach) hardcoreCustomHatAttach.value = selected.attachTo;
  ensureCustomHatDefinition(selected);
  saveCustomHatState();
  saveHatAdjustState();
  renderHatsEquipList();
  refreshHatAdjustOptions(selected.id);
  rebuildLocalHats();
  sendMultiplayerState(Date.now());
}

async function importHardcoreCustomHat() {
  if (!isOwnerName(multiplayer.username)) return;
  const modelFile = hardcoreCustomHatModel?.files?.[0];
  const mtlFile = hardcoreCustomHatMtl?.files?.[0];
  const textureFile = hardcoreCustomHatTexture?.files?.[0];
  const previous = getLocalCustomHat() || {};
  if (!modelFile && !mtlFile && !textureFile && !previous.mesh) {
    if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = "Choose a model or texture first";
    return;
  }
  if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = "Uploading custom hat…";
  try {
    const uploadTimeout = (kind) => kind === "model" ? 30000 : 20000;
    const uploadAsset = async (file, kind, fallback = null) => {
      if (!file) return fallback;
      const contentType = file.type || (kind === "model" || kind === "mtl" ? "text/plain" : "image/png");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), uploadTimeout(kind));
      try {
        if (hardcoreCustomHatStatus) {
          hardcoreCustomHatStatus.textContent = `Uploading ${kind} on server…`;
        }
        const response = await fetch("/api/hardcore-hat-upload", {
          method: "POST",
          headers: {
            "content-type": contentType,
            "x-upload-kind": kind,
          },
          body: file,
          signal: controller.signal,
        });
        let body = null;
        try { body = await response.json(); } catch { /* ignore malformed error body */ }
        if (response.ok && isShareableAvatarUrl(body?.url)) return body.url;
        throw new Error(body?.error || `Server upload failed (${response.status})`);
      } finally {
        window.clearTimeout(timeoutId);
      }
    };
    const uploadDirectFallback = async (file, kind) => {
      if (typeof globalThis.websim?.upload !== "function") {
        throw new Error("No direct upload service is available");
      }
      if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = `Server unavailable; uploading ${kind} directly…`;
      const directUpload = globalThis.websim.upload(file);
      const timeout = new Promise((_, reject) => window.setTimeout(
        () => reject(new Error("Direct upload timed out")),
        uploadTimeout(kind)
      ));
      const url = await Promise.race([directUpload, timeout]);
      if (!isShareableAvatarUrl(url)) throw new Error("Direct upload returned an invalid URL");
      return url;
    };
    const uploadWithFallback = async (file, kind, fallback = null) => {
      if (!file) return fallback;
      try {
        return await uploadAsset(file, kind, fallback);
      } catch (serverError) {
        try {
          return await uploadDirectFallback(file, kind);
        } catch (directError) {
          directError.cause = serverError;
          throw directError;
        }
      }
    };
    const [mesh, mtl, texture] = await Promise.all([
      uploadWithFallback(modelFile, "model", previous.mesh || null),
      uploadWithFallback(mtlFile, "mtl", modelFile ? null : (previous.mtl || null)),
      uploadWithFallback(textureFile, "texture", modelFile ? null : (previous.texture || null)),
    ]);
    if (!mesh) throw new Error("The custom hat needs a model");
    const customId = modelFile ? nextCustomHatId() : (previous.id || nextCustomHatId());
    const next = sanitizeCustomHatState({
      id: customId,
      mesh,
      mtl,
      texture,
      defaultTexture: textureFile ? texture : (previous.defaultTexture || previous.texture || null),
      enabled: true,
      position: previous.position || [0, 0, 0],
      rotation: previous.rotation || [0, 0, 0],
      attachTo: previous.attachTo || "Head",
      style: previous.style || CUSTOM_HAT_DEFAULT_STYLE,
    });
    if (!next) throw new Error("The uploaded model URL was invalid");
    const nextHats = localCustomHats().filter((hat) => hat.id !== next.id);
    nextHats.push(next);
    setLocalCustomHats(nextHats);
    selectedCustomHatId = next.id;
    if (textureFile) {
      // A newly imported texture replaces the previous paint cache for this
      // custom id; otherwise the old canvas would win over the new file.
      hatPaintTextures.delete(next.id);
      hatPaintLayerCache.delete(next.id);
      hatActivePainted.delete(next.id);
      saveHatPaintState();
    }
    hatDefaultTextureMap.set(next.id, next.defaultTexture || next.texture || null);
    ensureCustomHatDefinition(next);
    refreshHatAdjustOptions(next.id);
    saveCustomHatState();
    renderHatsEquipList();
    selectHatPaintTarget(next);
    if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = "Custom hat imported";
    rebuildLocalHats();
    multiplayer.lastSentAt = 0;
    sendMultiplayerState(Date.now());
    updateHardcoreCustomHatUI();
  } catch (error) {
    console.warn("Custom hat upload failed", error);
    if (hardcoreCustomHatStatus) hardcoreCustomHatStatus.textContent = "Custom hat could not be imported";
  }
}

hardcoreCustomHatImport?.addEventListener("click", importHardcoreCustomHat);
hardcoreCustomHatAttach?.addEventListener("change", () => {
  setSelectedCustomHatAttachment(hardcoreCustomHatAttach.value);
});
hardcoreCustomHatDelete?.addEventListener("click", () => {
  if (!isOwnerName(multiplayer.username)) return;
  const selected = getLocalCustomHat();
  if (!selected) return;
  setLocalCustomHats(localCustomHats().filter((hat) => hat.id !== selected.id));
  hatItemMap.delete(selected.id);
  const itemIndex = HATS_CONFIG.items.findIndex((hat) => hat.id === selected.id);
  if (itemIndex >= 0) HATS_CONFIG.items.splice(itemIndex, 1);
  hatGeometryCache.get(selected.id)?.dispose?.();
  hatGeometryCache.delete(selected.id);
  hatMaterialCache.get(selected.id)?.dispose?.();
  hatMaterialCache.delete(selected.id);
  hatAdjustMap.delete(selected.id);
  hatStyleMap.delete(selected.id);
  hatPaintTextures.delete(selected.id);
  hatPaintLayerCache.delete(selected.id);
  hatDefaultTextureMap.delete(selected.id);
  const nextPaintHat = HATS_CONFIG.items.find((hat) => hat.id !== selected.id && (
    hat.isCustom ? getLocalCustomHat(hat.id)?.enabled === true : equippedHats.has(hat.id)
  )) || HATS_CONFIG.items.find((hat) => hat.id !== selected.id) || null;
  selectedCustomHatId = localCustomHats()[0]?.id || CUSTOM_HAT_ID;
  if (hatPaintTargetId === selected.id) {
    hatPaintTargetId = null;
    hatPaintReadyId = null;
    if (nextPaintHat) selectHatPaintTarget(nextPaintHat);
  }
  refreshHatAdjustOptions(selectedCustomHatId !== CUSTOM_HAT_ID ? selectedCustomHatId : undefined);
  saveCustomHatState();
  renderHatsEquipList();
  rebuildLocalHats();
  syncHatsState();
  updateHardcoreCustomHatUI();
});
hardcoreCustomHatEnabled?.addEventListener("change", () => {
  if (!isOwnerName(multiplayer.username)) return;
  const selected = getLocalCustomHat();
  if (!selected) return;
  selected.enabled = hardcoreCustomHatEnabled.checked;
  saveCustomHatState();
  renderHatsEquipList();
  rebuildLocalHats();
  multiplayer.lastSentAt = 0;
  sendMultiplayerState(Date.now());
  updateHardcoreCustomHatUI();
});

function initHatPreview() {
  if (!hatPreviewCanvas || hatPreviewReady) return;
  hatPreviewRenderer = new THREE.WebGLRenderer({ canvas: hatPreviewCanvas, antialias: true, alpha: true });
  hatPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  hatPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  hatPreviewRenderer.setClearColor(0xffffff, 1);
  hatPreviewScene = new THREE.Scene();
  // Reuse the game's exact ambient, key, and fill lighting for the preview.
  // Cloning keeps the preview isolated while preserving the same colors,
  // intensities, and directions.
  hatPreviewScene.add(ambient.clone());
  const previewKey = keyLight.clone();
  previewKey.castShadow = false;
  hatPreviewScene.add(previewKey);
  hatPreviewScene.add(fillLight.clone());
  hatPreviewCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);
  hatPreviewCamera.rotation.order = "YXZ";
  hatPreviewAvatarGroup = new THREE.Group();
  hatPreviewScene.add(hatPreviewAvatarGroup);
  hatPreviewReady = true;
  refreshHatPreview();
}

function refreshHatPreview(forceClone = false) {
  if (forceClone) hatPreviewSource = null;
  if (hatPreviewRefreshFrame) return;
  hatPreviewRefreshFrame = requestAnimationFrame(() => {
    hatPreviewRefreshFrame = 0;
    refreshHatPreviewNow();
  });
}

function refreshHatPreviewNow() {
  if (!hatPreviewReady || !modelRoot || !hatPreviewAvatarGroup) return;
  const previewSource = player.model || modelRoot;
  const shouldCloneAvatar = !hatPreviewAvatar || hatPreviewSource !== previewSource;
  if (shouldCloneAvatar && hatPreviewAvatar) {
    hatPreviewAvatar.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        unregisterEditableMaterial(material);
        material?.dispose?.();
      });
    });
    hatPreviewAvatarGroup.remove(hatPreviewAvatar);
  }
  if (shouldCloneAvatar) {
    // Clone the outer character group so the model's internal floor/head
    // offset is preserved. Reset only the outer transform for the preview.
    hatPreviewAvatar = SkeletonUtils.clone(previewSource);
    hatPreviewAvatar.scale.copy(previewSource.scale);
    hatPreviewAvatar.position.set(0, 0, 0);
    hatPreviewAvatar.rotation.set(0, 0, 0);
    hatPreviewAvatar.visible = true;
    hatPreviewAvatar.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.material) {
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => material.clone())
          : object.material.clone();
      }
    });
    hatPreviewAvatarGroup.add(hatPreviewAvatar);
    hatPreviewSource = previewSource;
  }
  hatPreviewAvatarGroup.position.set(0, 0, 0);
  hatPreviewAvatarGroup.rotation.set(0, 0, 0);
  const previewHead = findHeadBone(hatPreviewAvatar);
  const previewHatIds = [...equippedHats];
  applyHatsToRoot(hatPreviewAvatar, previewHead, previewHatIds, null, undefined, undefined, localCustomHatState(), localHatTextureOverrides());
  updateHatPreviewCamera();
  resizeHatPreview();
}

function updateHatPreviewCamera() {
  if (!hatPreviewCamera || !hatPreviewAvatarGroup) return;
  // The preview group origin is the avatar's HumanoidRootPart. Keep the
  // camera optical axis aimed at that exact point while preserving the
  // requested pitch/yaw/roll values.
  hatPreviewAvatarGroup.updateMatrixWorld(true);
  const box = hatPreviewAvatar
    ? new THREE.Box3().setFromObject(hatPreviewAvatar)
    : null;
  const sphere = box?.getBoundingSphere(new THREE.Sphere());
  // Center the visual outfit itself so the head and feet share the available
  // preview space instead of framing the empty HumanoidRootPart origin.
  if (sphere) hatPreviewFocus.copy(sphere.center);
  else hatPreviewFocus.setFromMatrixPosition(hatPreviewAvatarGroup.matrixWorld);
  const aspect = Math.max(0.1, hatPreviewCamera.aspect || 1);
  const verticalFov = THREE.MathUtils.degToRad(hatPreviewCamera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const verticalDistance = sphere ? sphere.radius / Math.tan(verticalFov / 2) : 7.5;
  const horizontalDistance = sphere ? sphere.radius / Math.tan(horizontalFov / 2) : 7.5;
  const distance = THREE.MathUtils.clamp(
    Math.max(verticalDistance, horizontalDistance) * 1.12,
    HAT_PREVIEW_MIN_DISTANCE,
    HAT_PREVIEW_MAX_DISTANCE
  );

  hatPreviewCamera.rotation.set(HAT_PREVIEW_PITCH, HAT_PREVIEW_YAW, HAT_PREVIEW_ROLL);
  hatPreviewCamera.updateMatrixWorld(true);
  hatPreviewCamera.getWorldDirection(hatPreviewDirection);
  hatPreviewCamera.position.copy(hatPreviewFocus).addScaledVector(hatPreviewDirection, -distance);
  hatPreviewCamera.updateMatrixWorld(true);
}

function resizeHatPreview() {
  if (!hatPreviewRenderer || !hatPreviewCamera || !hatPreviewCanvas) return;
  const rect = hatPreviewCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  hatPreviewRenderer.setSize(width, height, false);
  hatPreviewCamera.aspect = width / height;
  hatPreviewCamera.updateProjectionMatrix();
  updateHatPreviewCamera();
}

function renderHatPreview() {
  if (!hatPreviewReady || avatarEditor.hidden || avatarEditorMode !== "hats") return;
  resizeHatPreview();
  hatPreviewRenderer.render(hatPreviewScene, hatPreviewCamera);
}

window.addEventListener("resize", resizeHatPreview);

// Hair tool buttons (eraser / bucket) share the hair canvas.
document.querySelectorAll("[data-hair-tool]").forEach((button) => {
  button.addEventListener("click", () => {
    const tool = button.dataset.hairTool;
    hairTool = ["pencil", "select", "move", "rectangle", "circle", "line", "bucket", "eraser"].includes(tool)
      ? tool
      : "pencil";
    document.querySelectorAll("[data-hair-tool]").forEach((b) => b.classList.toggle("active", b === button));
    hairCanvas.style.cursor = hairTool === "bucket"
      ? "cell"
      : hairTool === "move"
        ? "grab"
        : hairTool === "select"
          ? "crosshair"
          : "crosshair";
  });
});
document.getElementById("hair-tool-pencil")?.classList.add("active");
document.getElementById("hat-paint-layer-select")?.addEventListener("change", (event) => {
  hatPaintActiveLayer = THREE.MathUtils.clamp(Number(event.target.value) || 0, 0, Math.max(0, hatPaintLayers.length - 1));
  updateHatPaintLayerUI();
  renderHatPaintLayers();
  refreshHairTexture();
});
document.getElementById("hat-paint-layer-add")?.addEventListener("click", () => addHatPaintLayer());
document.getElementById("hat-paint-layer-delete")?.addEventListener("click", deleteHatPaintLayer);
document.getElementById("hat-paint-layer-visible")?.addEventListener("click", () => {
  const layer = activeHatPaintLayer();
  if (!layer) return;
  layer.visible = !layer.visible;
  finishHatPaintEdit();
});
document.getElementById("hat-paint-layer-opacity")?.addEventListener("input", (event) => {
  const layer = activeHatPaintLayer();
  if (!layer) return;
  layer.opacity = THREE.MathUtils.clamp(Number(event.target.value) || 0, 0, 1);
  renderHatPaintLayers();
  refreshHairTexture();
});
hairCanvasEl.addEventListener("pointerdown", (event) => {
  if (avatarEditorMode !== "hats") return;
  if (hairTool === "bucket") {
    bucketHair(hairCanvasPoint(event));
    return;
  }
  startHairDrawing(event);
});
hairCanvasEl.addEventListener("pointermove", moveHairDrawing);
hairCanvasEl.addEventListener("pointerup", stopHairDrawing);
hairCanvasEl.addEventListener("pointercancel", stopHairDrawing);

function renderHatsEquipList() {
  if (!avatarHatsEquipList) return;
  avatarHatsEquipList.replaceChildren();
  for (const hat of HATS_CONFIG.items) {
    if (hat.id === GUEST_HAT_ID && !isGuestPlayer()) continue;
    if (hat.isCustom && !isOwnerName(multiplayer.username)) continue;
    const customState = hat.isCustom ? getLocalCustomHat(hat.id) : null;
    const label = document.createElement("label");
    label.className = "avatar-hat-row";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = hat.isCustom ? customState?.enabled === true : equippedHats.has(hat.id);
    check.addEventListener("change", () => {
      if (hat.isCustom) {
        if (!customState) return;
        customState.enabled = check.checked;
        selectedCustomHatId = customState.id;
        saveCustomHatState();
        refreshHatAdjustOptions(selectedCustomHatId);
      } else if (check.checked) equippedHats.add(hat.id);
      else equippedHats.delete(hat.id);
      // Every hat row is also a paint-target selection. Previously this only
      // ran for custom hats, leaving the canvas bound to the old custom hat
      // whenever a built-in hat was selected.
      if (!hat.isCustom) selectHatPaintTarget(hat);
      rebuildLocalHats();
      syncHatsState();
    });
    const name = document.createElement("span");
    name.textContent = hat.name;
    const cat = document.createElement("small");
    cat.textContent = hat.category;
    label.append(check, name, cat);
    avatarHatsEquipList.append(label);
  }
}

function syncHatsState() {
  try {
    localStorage.setItem("webbox_equipped_hats", JSON.stringify([...equippedHats]));
  } catch { /* ignore */ }
  // The next state packet carries hats plus this player's private appearance
  // maps, so the server can replicate them without sharing local settings.
  sendMultiplayerState(Date.now());
  hatsSynced = true;
}

function loadHatsState() {
  try {
    const raw = localStorage.getItem("webbox_equipped_hats");
    if (raw) {
      const ids = JSON.parse(raw);
      for (const id of ids) if (hatItemMap.has(id)) equippedHats.add(id);
    }
  } catch { /* ignore */ }
}

// Entry points used by the avatar model loader and remote spawner.
function initHatSystem() {
  loadSavedCustomHatState();
  for (const customHat of localCustomHats()) ensureCustomHatDefinition(customHat);
  loadHatsState();
  loadHatAdjusts();
  loadHatStyles();
  loadHatPaintState();
  loadHatAssets();
  initHairCanvas();
  initHatPreview();
  if (avatarHatsEquipList) renderHatsEquipList();
  initHatAdjustUI();
  updateHardcoreCustomHatUI();
  hatEditorReady = true;
  rebuildLocalHats();
}

// Wire hair canvas events (delegated so it works after DOM exists).
if (hairBrushSize) {
  hairBrushSize.addEventListener("input", () => {
    if (hairBrushSizeValue) hairBrushSizeValue.textContent = hairBrushSize.value;
  });
}
if (hairHueInput) {
  hairHueInput.addEventListener("input", () => applyHairHue(hairHueInput.value));
  hairHueInput.addEventListener("change", () => {
    hairHueInput.value = "0";
    refreshHairTexture();
  });
}
if (avatarHatsApply) {
  avatarHatsApply.addEventListener("click", () => {
    const targetHat = hatItemMap.get(hatPaintTargetId);
    if (targetHat && targetHat.isCustom && isOwnerName(multiplayer.username)) {
      void applyCustomHatPaint(targetHat);
    } else if (targetHat) {
      void applyHatTextureFor(targetHat);
    } else {
      publishHairTexture();
    }
  });
}

// Upload the selected hat's paint canvas as a per-hat texture that persists on
// the server and is visible to every player. Works for game hats and custom
// hats alike, unlike the owner-only server-side custom-hat paint path.
async function applyHatTextureFor(hat) {
  if (isGuestPlayer() || !hat || !hatEditorReady) return;
  const dataUrl = captureHatPaintDataUrl();
  if (!dataUrl) {
    setAvatarEditorStatus(`Hat texture could not be read • ${hat.name}`);
    return;
  }
  hatPaintTextures.set(hat.id, dataUrl);
  saveHatPaintState();
  let url = dataUrl;
  if (isShareableAvatarUrl(dataUrl) || dataUrl.startsWith("data:image/")) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      let uploaded = "";
      try {
        const response = await fetch("/api/hat-texture-upload", {
          method: "POST",
          headers: { "content-type": "image/png", "x-upload-kind": "texture" },
          body: blob,
          signal: controller.signal,
        });
        let body = null;
        try { body = await response.json(); } catch { /* ignore */ }
        if (response.ok && isShareableAvatarUrl(body?.url)) uploaded = body.url;
      } catch { /* ignore */ } finally {
        window.clearTimeout(timeoutId);
      }
      if (uploaded) url = uploaded;
    } catch { /* keep local data URL */ }
  }
  if (url) {
    hatPaintTextures.set(hat.id, url);
    saveHatPaintState();
  }
  rebuildLocalHats();
  multiplayer.lastSentAt = 0;
  sendMultiplayerState(Date.now());
  setAvatarEditorStatus(url !== dataUrl && isShareableAvatarUrl(url)
    ? `Hat texture saved on server • ${hat.name}`
    : `Hat texture kept locally • ${hat.name}`);
  refreshHatPreview();
}

// Let any player upload an image file to use as the currently selected hat's
// texture, without having to paint it by hand.
const hatTextureUploadInput = document.getElementById("hat-texture-upload");
function insertHatPaintImage(file) {
  if (!file || !file.type.startsWith("image/") || !hatEditorReady) return false;
  const targetHat = hatItemMap.get(hatPaintTargetId);
  if (!targetHat) return false;
  const url = URL.createObjectURL(file);
  // Draw the uploaded image into the paint canvas so the user can keep
  // editing it as this hat's texture.
  const image = new Image();
  image.onload = () => {
    const layer = createHatPaintLayer(`Image ${hatPaintLayers.length + 1}`);
    const scale = Math.min(hairCanvas.width / image.width, hairCanvas.height / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    layer.context.drawImage(image, (hairCanvas.width - width) / 2, (hairCanvas.height - height) / 2, width, height);
    hatPaintLayers.push(layer);
    hatPaintActiveLayer = hatPaintLayers.length - 1;
    if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
    hatPaintTargetId = targetHat.id;
    hatPaintReadyId = targetHat.id;
    hatActivePainted.add(targetHat.id);
    clearHairSelection();
    renderHatPaintLayers();
    refreshHairTexture();
    rebuildLocalHats();
    void applyHatTextureFor(targetHat);
  };
  image.onerror = () => {
    if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
  };
  image.src = url;
  return true;
}

hatTextureUploadInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  insertHatPaintImage(file);
});

function flipActiveHatPaintLayer() {
  const layer = activeHatPaintLayer();
  if (!layer) return;
  const copy = document.createElement("canvas");
  copy.width = hairCanvas.width;
  copy.height = hairCanvas.height;
  copy.getContext("2d").drawImage(layer.canvas, 0, 0);
  layer.context.clearRect(0, 0, hairCanvas.width, hairCanvas.height);
  layer.context.save();
  layer.context.translate(0, hairCanvas.height);
  layer.context.scale(1, -1);
  layer.context.drawImage(copy, 0, 0);
  layer.context.restore();
  finishHatPaintEdit();
}

async function pasteHatTextureFromClipboard() {
  if (!navigator.clipboard?.read) {
    setAvatarEditorStatus("Use Ctrl+V while the Hat Paint canvas is active");
    return;
  }
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const type = item.types.find((value) => value.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      insertHatPaintImage(new File([blob], "pasted-texture", { type }));
      return;
    }
    setAvatarEditorStatus("No image found in the clipboard");
  } catch {
    setAvatarEditorStatus("The browser blocked clipboard access; use Ctrl+V");
  }
}

function restoreHatTextureToDefault(hat) {
  if (!hat) return;
  const texture = defaultHatTexture(hat);
  // The layer cache is separate from the saved texture map. Clearing only the
  // latter used to make the old painted layers come back immediately.
  hatPaintLayerCache.delete(hat.id);
  hatPaintTextures.delete(hat.id);
  hatActivePainted.delete(hat.id);
  if (hat.isCustom) {
    const state = getLocalCustomHat(hat.id);
    if (state) {
      state.texture = texture;
      saveCustomHatState();
    }
    hat.texture = texture;
    ensureCustomHatDefinition(state || hat);
  }
  saveHatPaintState();
  selectHatPaintTarget(hat);
  setAvatarEditorStatus(`${hat.name} texture restored`);
}

document.getElementById("hair-tool-flip")?.addEventListener("click", flipActiveHatPaintLayer);
document.getElementById("hat-texture-paste")?.addEventListener("click", pasteHatTextureFromClipboard);
document.getElementById("hat-texture-restore")?.addEventListener("click", () => {
  const hat = hatItemMap.get(hatPaintTargetId);
  if (!hat) return;
  restoreHatTextureToDefault(hat);
  rebuildLocalHats();
  syncHatsState();
});
document.addEventListener("paste", (event) => {
  if (avatarEditorMode !== "hats") return;
  const target = event.target;
  if (target?.closest?.("textarea, input, select, [contenteditable='true']")) return;
  const item = [...(event.clipboardData?.items || [])]
    .find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  const file = item?.getAsFile?.() || [...(event.clipboardData?.files || [])]
    .find((entry) => entry.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  insertHatPaintImage(file);
});

// Tie into the avatar editor mode toggle: enter/leave the Hats tab.
if (avatarModeButtonsAll && avatarHatsPanel) {
  // (the setAvatarEditorMode override below handles switching)
}

function initHatAdjustUI() {
  const select = document.getElementById("hat-adjust-select");
  if (!select) return;
  select.replaceChildren();
  for (const hat of HATS_CONFIG.items) {
    if (hat.id === GUEST_HAT_ID && !isGuestPlayer()) continue;
    const option = document.createElement("option");
    option.value = hat.id;
    option.textContent = hat.name;
    select.append(option);
  }
  const axes = ["x", "y", "z", "rx", "ry", "rz"];
  const inputs = Object.fromEntries(axes.map((axis) => [axis, document.getElementById(`hat-adjust-${axis}`)]));
  const outputs = Object.fromEntries(axes.map((axis) => [axis, document.getElementById(`hat-adjust-${axis}-value`)]));
  const scaleInput = document.getElementById("hat-adjust-scale");
  const scaleOutput = document.getElementById("hat-adjust-scale-value");
  const attachSelect = document.getElementById("hat-adjust-attach");
  if (axes.some((axis) => !inputs[axis] || !outputs[axis])) return;
  const resetButton = document.getElementById("hat-adjust-reset");
  function applyAdjustToUI(hat) {
    const adj = hatAdjustMap.get(hat.id) || defaultHatAdjust(hat);
    inputs.x.value = adj.offset[0];
    inputs.y.value = adj.offset[1];
    inputs.z.value = adj.offset[2];
    inputs.rx.value = adj.rotation[0];
    inputs.ry.value = adj.rotation[1];
    inputs.rz.value = adj.rotation[2];
    axes.forEach((axis) => { outputs[axis].textContent = inputs[axis].value; });
    if (scaleInput) {
      const scale = clampHatScale(adj.scale, getHatScaleMax());
      scaleInput.value = scale;
      if (scaleOutput) scaleOutput.textContent = Number(scale).toFixed(2);
    }
    if (attachSelect) {
      attachSelect.value = hat.attachTo || hat.bone || "Head";
      attachSelect.disabled = !hat.isCustom;
    }
  }
  function syncCustomHatFromAdjust(hat, adj, includeStyle = false) {
    const customState = hat.isCustom ? getLocalCustomHat(hat.id) : null;
    if (!customState) return;
    customState.position = [...adj.offset];
    customState.rotation = [...adj.rotation];
    customState.scale = clampHatScale(adj.scale, getHatScaleMax());
    if (includeStyle) customState.style = { ...(hatStyleMap.get(hat.id) || defaultHatStyle(hat)) };
    selectedCustomHatId = customState.id;
    saveCustomHatState();
  }
  let currentHat = HATS_CONFIG.items.find((hat) => (
    hat.isCustom
      ? getLocalCustomHat(hat.id)?.enabled === true
      : equippedHats.has(hat.id)
  )) || HATS_CONFIG.items[0];
  refreshHatScaleControl = () => applyAdjustToUI(currentHat);
  const styleInputs = {
    tint: document.getElementById("hat-style-tint"),
    hue: document.getElementById("hat-style-hue"),
    saturation: document.getElementById("hat-style-saturation"),
    lightness: document.getElementById("hat-style-lightness"),
    opacity: document.getElementById("hat-style-opacity"),
    shininess: document.getElementById("hat-style-shininess"),
    roughness: document.getElementById("hat-style-roughness"),
    metalness: document.getElementById("hat-style-metalness"),
    specularScale: document.getElementById("hat-style-specular"),
  };
  const styleOutputs = {
    hue: document.getElementById("hat-style-hue-value"),
    saturation: document.getElementById("hat-style-saturation-value"),
    lightness: document.getElementById("hat-style-lightness-value"),
    opacity: document.getElementById("hat-style-opacity-value"),
    shininess: document.getElementById("hat-style-shininess-value"),
    roughness: document.getElementById("hat-style-roughness-value"),
    metalness: document.getElementById("hat-style-metalness-value"),
    specularScale: document.getElementById("hat-style-specular-value"),
  };
  function applyStyleToUI(hat) {
    const style = hatStyleMap.get(hat.id) || defaultHatStyle(hat);
    styleInputs.tint.value = style.tint;
    styleInputs.hue.value = style.hue;
    styleInputs.saturation.value = style.saturation;
    styleInputs.lightness.value = style.lightness;
    styleInputs.opacity.value = style.opacity;
    styleInputs.shininess.value = style.shininess;
    styleInputs.roughness.value = style.roughness;
    styleInputs.metalness.value = style.metalness;
    styleInputs.specularScale.value = style.specularScale;
    styleOutputs.hue.textContent = `${style.hue}°`;
    styleOutputs.saturation.textContent = Number(style.saturation).toFixed(2);
    styleOutputs.lightness.textContent = Number(style.lightness).toFixed(2);
    styleOutputs.opacity.textContent = Number(style.opacity).toFixed(2);
    styleOutputs.shininess.textContent = String(style.shininess);
    styleOutputs.roughness.textContent = Number(style.roughness).toFixed(2);
    styleOutputs.metalness.textContent = Number(style.metalness).toFixed(2);
    styleOutputs.specularScale.textContent = Number(style.specularScale).toFixed(2);
  }
  applyAdjustToUI(currentHat);
  applyStyleToUI(currentHat);
  updateHatScaleLimit();
  selectHatPaintTarget(currentHat);
  select.addEventListener("change", () => {
    currentHat = hatItemMap.get(select.value) || currentHat;
    if (currentHat.isCustom) selectedCustomHatId = currentHat.id;
    applyAdjustToUI(currentHat);
    applyStyleToUI(currentHat);
    selectHatPaintTarget(currentHat);
    updateHardcoreCustomHatUI();
  });
  attachSelect?.addEventListener("change", () => {
    if (!currentHat.isCustom) return;
    setSelectedCustomHatAttachment(attachSelect.value);
  });
  resetButton?.addEventListener("click", () => {
    hatAdjustMap.set(currentHat.id, defaultHatAdjust(currentHat));
    hatStyleMap.set(currentHat.id, defaultHatStyle(currentHat));
    syncCustomHatFromAdjust(currentHat, hatAdjustMap.get(currentHat.id), true);
    restoreHatTextureToDefault(currentHat);
    saveHatAdjustState();
    saveHatStyleState();
    applyAdjustToUI(currentHat);
    applyStyleToUI(currentHat);
    rebuildLocalHats();
    syncHatsState();
  });
  const fieldMap = { x: 0, y: 1, z: 2, rx: 0, ry: 1, rz: 2 };
  const fieldKind = { x: "offset", y: "offset", z: "offset", rx: "rotation", ry: "rotation", rz: "rotation" };
  for (const axis of axes) {
    inputs[axis].addEventListener("input", () => {
      const adj = hatAdjustMap.get(currentHat.id) || defaultHatAdjust(currentHat);
      const mode = fieldKind[axis];
      adj[mode][fieldMap[axis]] = Number(inputs[axis].value) || 0;
      hatAdjustMap.set(currentHat.id, adj);
      outputs[axis].textContent = inputs[axis].value;
      syncCustomHatFromAdjust(currentHat, adj);
      rebuildLocalHats();
      saveHatAdjustState();
      sendMultiplayerState(Date.now());
    });
  }
  if (scaleInput) {
    scaleInput.addEventListener("input", () => {
      const adj = hatAdjustMap.get(currentHat.id) || defaultHatAdjust(currentHat);
      const scale = clampHatScale(scaleInput.value, getHatScaleMax());
      adj.scale = scale;
      hatAdjustMap.set(currentHat.id, adj);
      if (scaleOutput) scaleOutput.textContent = scale.toFixed(2);
      syncCustomHatFromAdjust(currentHat, adj);
      rebuildLocalHats();
      saveHatAdjustState();
      sendMultiplayerState(Date.now());
    });
  }
  for (const key of Object.keys(styleInputs)) {
    styleInputs[key].addEventListener("input", () => {
      const style = hatStyleMap.get(currentHat.id) || defaultHatStyle(currentHat);
      style[key] = key === "tint" ? styleInputs[key].value : Number(styleInputs[key].value) || 0;
      hatStyleMap.set(currentHat.id, style);
      const adj = hatAdjustMap.get(currentHat.id) || defaultHatAdjust(currentHat);
      syncCustomHatFromAdjust(currentHat, adj);
      const customState = currentHat.isCustom ? getLocalCustomHat(currentHat.id) : null;
      if (customState) customState.style = { ...style };
      applyStyleToUI(currentHat);
      rebuildLocalHats();
      saveHatStyleState();
      saveCustomHatState();
      sendMultiplayerState(Date.now());
    });
  }
}

// Rebuild the Hat settings dropdown so saved/imported custom hats appear in
// the list every time the Hats tab is opened, not only right after an upload.
function refreshHatAdjustOptions(preferredId) {
  const select = document.getElementById("hat-adjust-select");
  if (!select) return;
  const currentValue = String(preferredId || select.value || "");
  select.replaceChildren();
  for (const hat of HATS_CONFIG.items) {
    if (hat.id === GUEST_HAT_ID && !isGuestPlayer()) continue;
    const option = document.createElement("option");
    option.value = hat.id;
    option.textContent = hat.name;
    select.append(option);
  }
  for (const hat of [...HATS_CONFIG.items]) {
    if (hat.id === currentValue) {
      select.value = currentValue;
      break;
    }
  }
  if (!select.value || !hatItemMap.has(select.value)) select.value = HATS_CONFIG.items[0]?.id || "";
  select.dispatchEvent(new Event("change"));
}

function setRemoteAnimation(remote, stateName, animationTime = null) {
  if (remote?.r15) {
    const normalizedState = ["Idle", "Walk", "Run", "Jump", "Fall"].includes(stateName) ? stateName : "Idle";
    remote.lastAnimation = normalizedState;
    remote.isMoving = normalizedState === "Walk" || normalizedState === "Run";
    remote.idleNeutralPose = normalizedState === "Idle";
    if (remote.emoteAction && normalizedState !== "Idle") stopRemoteEmote(remote, false);
    if (!remote.emoteAction && remote.model?.userData?.r15Animation?.name !== normalizedState) {
      const startTime = Number.isFinite(Number(animationTime)) ? Math.max(0, Number(animationTime)) : 0;
      setR15Animation(remote.model, normalizedState === "Walk" ? "Walk" : normalizedState, startTime, r15AnimationData);
    }
    return;
  }
  const normalizedState = ANIM_MAP[stateName] ? stateName : "Idle";
  remote.lastAnimation = normalizedState;
  remote.isMoving = normalizedState === "Walk" || normalizedState === "Run";
  remote.idleNeutralPose = normalizedState === "Idle";
  if (remote.emoteAction) {
    if (normalizedState === "Idle") return;
    stopRemoteEmote(remote, false);
  }
  const clipName = ANIM_MAP[normalizedState];
  const next = remote.actions[clipName] || remote.actions[ANIM_MAP.Idle];
  if (!next || remote.currentAction === next) return;
  if (remote.currentAction) remote.currentAction.fadeOut(0.2);
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
  remote.currentAction = next;
}

function finishRemoteToolAnimation(remote) {
  const action = remote?.toolAnimAction;
  if (!action) return;
  remote.toolAnimAction = null;
  remote.toolAnimPhase = null;
  remote.toolAnimState = null;
  action.stop();
  remote.toolAnim = false;
  if (remote.model?.userData) remote.model.userData.burgerGrip2Active = false;
  applyBurgerToRoot(remote.model, remoteBurgerVisible(remote));
  setRemoteAnimation(remote, remote.lastAnimation || "Idle");
}

function lockToolBoneRotations(root, toolState) {
  const action = toolState?.action;
  if (!root || !action) return;
  if (!toolState.rotationTracks) {
    toolState.rotationTracks = action.getClip().tracks.flatMap((track) => {
      const match = String(track.name || "").match(/^(.*)\.(quaternion|rotation)$/i);
      if (!match) return [];
      const boneName = match[1].split("/").pop();
      const bone = root.getObjectByName?.(boneName);
      const bind = avatarBindPose?.get(boneName);
      if (!bone || !bind?.quaternion) return [];
      return [{ track, bone, bind, interpolant: track.createInterpolant() }];
    });
  }
  for (const entry of toolState.rotationTracks) {
    const values = entry.interpolant.evaluate(Math.max(0, action.time));
    if (entry.track.getValueSize() === 4) {
      entry.bone.quaternion.copy(entry.bind.quaternion).multiply(
        new THREE.Quaternion(values[0], values[1], values[2], values[3])
      ).normalize();
    } else if (entry.track.getValueSize() === 3) {
      entry.bone.quaternion.copy(entry.bind.quaternion).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(values[0], values[1], values[2], "XYZ"))
      ).normalize();
    }
  }
}

function setRemoteToolAnimation(remote, enabled, nextToken = null) {
  if (!remote) return;
  const normalizedToken = Number.isFinite(Number(nextToken))
    ? Math.max(0, Math.floor(Number(nextToken)))
    : Number(remote.toolAnimToken) || 0;
  const tokenChanged = normalizedToken !== (Number(remote.toolAnimToken) || 0);
  remote.toolAnimToken = normalizedToken;
  const ownsBurger = remote.burgerEquipped === true;
  const shouldPlay = enabled === true && ownsBurger;
  remote.toolAnimRequested = shouldPlay;
  if (!shouldPlay) {
    remote.toolAnimPending = false;
    remote.burgerGripActive = false;
    if (remote.model?.userData) remote.model.userData.burgerGrip2Active = false;
    if (remote.toolAnimAction) {
      if (remote.toolAnimPhase !== "releasing") {
        remote.toolAnimPhase = "releasing";
        remote.toolAnimAction.enabled = true;
        remote.toolAnimAction.paused = false;
        remote.toolAnimAction.setLoop(THREE.LoopOnce, 1);
        remote.toolAnimAction.setEffectiveTimeScale(-1);
        remote.toolAnimAction.clampWhenFinished = true;
        remote.toolAnimAction.play();
      }
      // Keep the tool overlay alive until its reverse pass finishes.
      remote.toolAnim = true;
      // A stale animation may still be reversing, but it must never keep the
      // mesh visible after the equipped-item flag is false.
      applyBurgerToRoot(remote.model, ownsBurger);
      return;
    }
    remote.toolAnim = false;
    applyBurgerToRoot(remote.model, remoteBurgerVisible(remote));
    return;
  }
  if (remote.model?.userData) {
    remote.model.userData.burgerGrip2Active = remote.burgerGripActive === true;
  }
  if (remote.toolAnimAction) {
    if (remote.toolAnimPhase === "releasing" || tokenChanged) {
      remote.toolAnimAction.enabled = true;
      remote.toolAnimAction.paused = false;
      remote.toolAnimAction.reset();
      remote.toolAnimAction.setEffectiveTimeScale(1);
      remote.toolAnimAction.setLoop(THREE.LoopOnce, 1).play();
      remote.toolAnimPhase = "forward";
    }
    remote.toolAnim = true;
    applyBurgerToRoot(remote.model, ownsBurger);
    return;
  }
  // R15 remotes do not pay for an AnimationMixer every frame. Create one
  // lazily only when that remote actually equips/uses the burger tool.
  if (!remote.mixer && remote.model) {
    remote.mixer = new THREE.AnimationMixer(remote.model);
    remote.mixer.addEventListener("finished", (event) => {
      if (remote.toolAnimAction !== event.action) return;
      if (remote.toolAnimPhase === "releasing") finishRemoteToolAnimation(remote);
      else {
        event.action.time = event.action.getClip().duration;
        event.action.paused = true;
        remote.toolAnimPhase = "held";
      }
    });
  }
  const clip = buildToolAnimClip();
  if (!clip || !remote.mixer || !remote.model) {
    // The state can arrive a frame before the cloned avatar has its mixer or
    // the shared GLB clips. Keep the request alive and retry from the render
    // loop instead of silently losing the remote Tool animation.
    remote.toolAnimPending = true;
    return;
  }
  remote.toolAnimPending = false;
  if (remote.emoteAction) stopRemoteEmote(remote, false);
  const action = remote.mixer.clipAction(clip, remote.model);
  action.blendMode = THREE.AdditiveAnimationBlendMode;
  action.reset().setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  remote.toolAnim = true;
  remote.toolAnimPhase = "forward";
  remote.toolAnimAction = action;
  remote.toolAnimState = { action, rotationTracks: null };
  applyBurgerToRoot(remote.model, ownsBurger);
}

function stopRemoteEmote(remote, resume = true) {
  if (!remote?.emoteAction) return;
  const action = remote.emoteAction;
  remote.emoteAction = null;
  remote.emoteName = null;
  remote.emoteToken = 0;
  remote.isMoving = false;
  if (action.fadeOut) action.fadeOut(BLEND);
  if (remote.r15) restoreR15Animation(remote.model);
  else restoreEmoteBindPose(remote.model);
  if (remote.currentAction === action) remote.currentAction = null;
  if (resume) setRemoteAnimation(remote, "Idle");
}

function playRemoteEmote(remote, name, token = 0, startTime = null) {
  const normalized = String(name || "").trim();
  if (remote?.r15) {
    const asset = r15AnimationData?.[normalized];
    if (!asset) return;
    if (remote.emoteAction && remote.emoteName === normalized && remote.emoteToken === token) return;
    stopRemoteEmote(remote, false);
    remote.emoteAction = { direct: true, r15: true };
    remote.emoteName = normalized;
    remote.emoteToken = token;
    remote.emoteElapsed = Number.isFinite(Number(startTime)) ? Math.max(0, Number(startTime)) : 0;
    remote.isMoving = false;
    setR15Animation(remote.model, normalized, remote.emoteElapsed, r15AnimationData);
    return;
  }
  const asset = emoteAssets?.[normalized];
  if (!remote || !asset) return;
  if (remote.emoteAction && remote.emoteName === normalized && remote.emoteToken === token) return;
  stopRemoteEmote(remote, false);
  const looping = normalized.startsWith("Dance");
  if (remote.currentAction) remote.currentAction.fadeOut(BLEND);
  remote.currentAction = null;
  remote.emoteAction = { direct: true };
  remote.emoteName = normalized;
  remote.emoteToken = token;
  remote.emoteElapsed = Number.isFinite(Number(startTime)) ? Math.max(0, Number(startTime)) : 0;
  remote.isMoving = false;
  applyEmotePose(remote.model, asset, remote.emoteElapsed);
}

function syncRemoteEmote(remote, state) {
  if (!remote || !state) return;
  const name = typeof state.emote === "string" ? state.emote : "";
  const token = Number.isFinite(Number(state.emoteToken)) ? Number(state.emoteToken) : 0;
  if (name) playRemoteEmote(remote, name, token, state.animationTime);
  else stopRemoteEmote(remote);
}

function applyRemoteTexture(remote, source) {
  if (!source || remote.textureSource === source) return;
  remote.textureSource = source;
  const requestId = ++remote.avatarRequestId;
  new THREE.TextureLoader().load(
    source,
    (texture) => {
      if (requestId !== remote.avatarRequestId) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = remote.r15 === true;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      if (remote.r15 === true) texture = makeR15TextureOpaque(texture);
      remote.group.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          // The Cheezburger is attached inside the remote avatar hierarchy,
          // but it is its own Tool and must never inherit the player's avatar
          // texture. Restore its authored map as a defensive guard in case an
          // older frame already applied the avatar texture to this material.
          if (material.userData?.isTool) {
            if (burgerTexture && material.map !== burgerTexture) {
              material.map = burgerTexture;
              material.needsUpdate = true;
            }
            continue;
          }
          if (!material.map) continue;
          if (material.userData?.isHat) continue;
          material.map = texture;
          if (remote.r15 === true && setR15BodyTextureMaterial(material, texture)) continue;
          // A custom uploaded PNG may contain alpha even when the original
          // GLB material was opaque.
          material.transparent = true;
          material.alphaTest = 0.01;
          material.needsUpdate = true;
        }
      });
      if (remote.liveTexture && remote.liveTexture !== texture) remote.liveTexture.dispose();
      remote.liveTexture = texture;
    },
    undefined,
    (error) => console.warn("Remote avatar texture unavailable", error)
  );
}

function setRemoteAvatar(remote, avatarUrl) {
  const normalized = typeof avatarUrl === "string" && avatarUrl ? avatarUrl : null;
  if (remote.avatarUrl === normalized) return;
  remote.avatarUrl = normalized;
  if (!normalized) {
    remote.avatarRequestId += 1;
    remote.liveTexture?.dispose?.();
    remote.liveTexture = null;
    remote.group?.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const baseMap = material.userData?.avatarBaseMap || null;
        if (baseMap) material.map = baseMap;
        material.needsUpdate = true;
      }
    });
    return;
  }
  // A published texture is the authoritative/full-resolution source. A live
  // editor preview is intentionally smaller for realtime transport and must
  // never replace this texture when both are available.
  applyRemoteTexture(remote, avatarUrl);
}

function setRemoteAvatarPreview(remote, preview) {
  const normalized = typeof preview === "string" && preview ? preview : null;
  if (remote.avatarPreview === normalized) return;
  remote.avatarPreview = normalized;
  if (!normalized) return;
  if (remote.avatarUrl) return;
  applyRemoteTexture(remote, preview);
}

let localForcedAvatarSource = "";
let localAvatarPublishGuard = "";
let localAdminAvatarAppearanceKey = "";
const AVATAR_RIG_SWITCH_GUARD = "__avatar_rig_switch__";

function applyGuestAvatarAppearance() {
  if (!isGuestPlayer()) return;
  multiplayer.avatarUrl = GUEST_AVATAR_TEXTURE;
  multiplayer.avatarPreview = null;
  equippedHats.clear();
  equippedHats.add(GUEST_HAT_ID);
  localAvatarPublishGuard = "";
  localForcedAvatarSource = "";
  if (!avatarEditor.hidden) closeAvatarEditor();
  updateAvatarEditorAccess();
  const needsR6Model = modelRoot && r6ModelRoot && modelRoot !== r6ModelRoot;
  if (activeRigType !== "r6") {
    activeRigType = "r6";
    for (const button of avatarRigButtons) button.classList.toggle("active", button.dataset.avatarRig === "r6");
  }
  if (needsR6Model) {
    void switchAvatarRig("r6").catch((error) => console.warn("Could not activate guest R6 avatar", error));
  }
  rebuildLocalHats();
  applyLocalAvatarSource(GUEST_AVATAR_TEXTURE);
}

function clearLocalAvatarSource() {
  localForcedAvatarSource = "";
  localForcedAvatarTexture?.dispose?.();
  localForcedAvatarTexture = null;
  if (!avatarEditor.hidden) return;
  for (const material of getActiveAvatarTextureMaterials()) {
    const baseMap = material.userData?.avatarBaseMap || avatarBaseMaps.get(material.name);
    if (!baseMap) continue;
    material.map = baseMap;
    if (activeRigType === "r15" && setR15BodyTextureMaterial(material, baseMap)) continue;
    material.transparent = true;
    material.alphaTest = 0.01;
    material.needsUpdate = true;
  }
}

function applyLocalAvatarSource(source, force = false) {
  // The editor canvas is authoritative until its upload succeeds. Ignore
  // stale room snapshots and echoes instead of restoring the previous map.
  if ((!avatarEditor.hidden || avatarTexturePublishPending) && !force) return;
  if (localAvatarPublishGuard && source !== localAvatarPublishGuard) return;
  if (!source || !player.model) {
    clearLocalAvatarSource();
    return;
  }
  if (source !== avatarEditorHistorySource) avatarEditorHistorySource = "";
  // Never reload the same published texture. Without this guard, the local
  // player's own state echo (broadcast at ~20Hz) would keep re-loading the
  // same PNG and the model would flicker back and forth between the old and
  // the new avatar texture on every frame.
  if (localForcedAvatarSource === source) return;
  localForcedAvatarSource = source;
  // While the editor is open the live canvas is authoritative. A delayed
  // snapshot, state echo, or admin forceAvatar must not rip the model's
  // texture away mid-edit or flash the previous published frame.
  if (!avatarEditor.hidden && !force) return;
  new THREE.TextureLoader().load(source, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = activeRigType === "r15";
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    if (activeRigType === "r15") texture = makeR15TextureOpaque(texture);
    localForcedAvatarTexture?.dispose();
    localForcedAvatarTexture = texture;
    appliedAvatarImage?.close?.();
    appliedAvatarImage = texture.image;
    for (const material of getActiveAvatarTextureMaterials()) {
      material.map = texture;
      if (activeRigType === "r15" && setR15BodyTextureMaterial(material, texture)) continue;
      material.transparent = true;
      material.alphaTest = 0.01;
      material.needsUpdate = true;
    }
  }, undefined, (error) => console.warn("Forced local avatar unavailable", error));
}

function applyLocalAdminAvatarAppearance(message) {
  const preview = typeof message.avatarPreview === "string" ? message.avatarPreview : "";
  const appearanceKey = JSON.stringify([
    message.forcedAvatar === true,
    message.avatarUrl || "",
    preview ? `${preview.length}:${preview.slice(0, 24)}:${preview.slice(-24)}` : "",
    message.hats || [],
    message.hatStyles || {},
    message.hatAdjusts || {},
    message.customHats || [],
    message.hairTexture || "",
    message.hatTarget || "",
    message.hatTextures || {},
  ]);
  if (localAdminAvatarAppearanceKey === appearanceKey) return;
  localAdminAvatarAppearanceKey = appearanceKey;
  // A server-side force/unforce command is an explicit authority change and
  // supersedes any pending confirmation for a normal avatar edit.
  localAvatarPublishGuard = "";
  multiplayer.avatarUrl = typeof message.avatarUrl === "string" ? message.avatarUrl : null;
  multiplayer.avatarPreview = preview || null;
  if (Array.isArray(message.hats)) {
    equippedHats.clear();
    for (const id of message.hats) if (hatItemMap.has(id)) equippedHats.add(id);
    try {
      localStorage.setItem("webbox_equipped_hats", JSON.stringify([...equippedHats]));
    } catch { /* ignore */ }
  }
  const customHats = Array.isArray(message.customHats) ? message.customHats : [];
  if (Array.isArray(message.customHats)) {
    multiplayer.customHats = sanitizeCustomHatList(customHats);
    multiplayer.customHat = multiplayer.customHats[0] || null;
  }
  localForcedAvatarSource = "";
  if (player.model && headBone) {
    applyHatsToRoot(
      player.model,
      headBone,
      Array.isArray(message.hats) ? message.hats : [...equippedHats],
      typeof message.hairTexture === "string" ? message.hairTexture : null,
      message.hatStyles && typeof message.hatStyles === "object" ? message.hatStyles : {},
      message.hatAdjusts && typeof message.hatAdjusts === "object" ? message.hatAdjusts : {},
      customHats,
      message.hatTextures && typeof message.hatTextures === "object" ? message.hatTextures : {}
    );
  }
  refreshHatPreview(true);
  applyLocalAvatarSource(multiplayer.avatarUrl || multiplayer.avatarPreview || "");
}

function applyAdminEffect(message) {
  if (!message || message.id !== multiplayer.id) return;
  if (message.action === "fly") {
    setLocalFlyMode(message.enabled === true, {
      noclip: message.noclip === true,
      speed: Number(message.speed),
    });
    return;
  }
  if (message.action === "flySpeed") {
    const speed = Number(message.speed);
    if (Number.isFinite(speed)) player.flySpeed = Math.max(1, speed);
    return;
  }
  if (message.action === "respawn") {
    applyAuthoritativeTeleport(message);
    return;
  }
  if (message.action === "teleport") {
    applyAuthoritativeTeleport(message);
    return;
  }
  if (message.action === "forceAvatar" || message.action === "unforceAvatar") {
    applyLocalAdminAvatarAppearance(message);
    multiplayer.lastSentAt = 0;
    sendMultiplayerState(Date.now());
    return;
  }
}

function applyPlayerUpdate(message) {
  if (!message?.id) return;
  const state = multiplayer.latestStates.get(message.id) || {
    id: message.id,
    username: message.username || "guest",
    x: 0,
    y: 0,
    z: 0,
    facing: 0,
    state: "Idle",
    toolAnim: false,
    toolAnimToken: 0,
    burgerEquipped: false,
    emote: null,
    emoteToken: 0,
  };
  if (typeof message.username === "string" && message.username) state.username = message.username;
  if (typeof message.isAdmin === "boolean") state.isAdmin = message.isAdmin;
  if (message.nametagColor !== undefined) state.nametagColor = message.nametagColor;
  if (message.nametagText !== undefined) state.nametagText = message.nametagText;
  if (typeof message.nametagPrefixVisible === "boolean") state.nametagPrefixVisible = message.nametagPrefixVisible;
  if (typeof message.playerListIconVisible === "boolean") state.playerListIconVisible = message.playerListIconVisible;
  if (typeof message.checkmarkVisible === "boolean") state.checkmarkVisible = message.checkmarkVisible;
  if (message.emote !== undefined) state.emote = typeof message.emote === "string" ? message.emote : null;
  if (message.emoteToken !== undefined) state.emoteToken = Number(message.emoteToken) || 0;
  if (message.animationTime !== undefined) state.animationTime = Number(message.animationTime) || 0;
  if (message.toolAnim !== undefined) state.toolAnim = message.toolAnim === true;
    if (message.toolAnimToken !== undefined) state.toolAnimToken = Number(message.toolAnimToken) || 0;
  if (message.burgerEquipped !== undefined) state.burgerEquipped = message.burgerEquipped === true;
  if (message.burgerGripActive !== undefined) state.burgerGripActive = message.burgerGripActive === true;
  if (typeof message.facingSnap === "boolean") state.facingSnap = message.facingSnap;
  if (message.rigType === "r15" || message.rigType === "r6") state.rigType = message.rigType;
  if (message.avatarUrl !== undefined) state.avatarUrl = message.avatarUrl;
  if (message.avatarPreview !== undefined) state.avatarPreview = message.avatarPreview;
  if (message.forcedAvatar !== undefined) state.forcedAvatar = message.forcedAvatar === true;
  if (Array.isArray(message.hats)) state.hats = message.hats;
  if (message.hatStyles && typeof message.hatStyles === "object") state.hatStyles = message.hatStyles;
  if (message.hatAdjusts && typeof message.hatAdjusts === "object") state.hatAdjusts = message.hatAdjusts;
  if (message.customHats !== undefined) {
    state.customHats = Array.isArray(message.customHats) ? message.customHats : [];
  } else if (message.customHat !== undefined) {
    state.customHats = message.customHat ? [message.customHat] : [];
  }
  if (message.hairTexture !== undefined) state.hairTexture = typeof message.hairTexture === "string" ? message.hairTexture : null;
  if (message.hatTarget !== undefined) state.hatTarget = message.hatTarget;
  if (message.hatTextures && typeof message.hatTextures === "object") state.hatTextures = message.hatTextures;
  multiplayer.latestStates.set(message.id, state);

  if (message.id === multiplayer.id) {
    if (guestModeRequested) {
      // Guest session requested: keep the confirmed guest identity. The
      // server re-broadcasts the authoritative "Guest N" name on every update,
      // so prefer it over any locally-held name.
      multiplayer.isGuest = true;
      const serverName = state.username || "";
      const serverIsGuest = serverName.startsWith("Guest ");
      const guestName = serverIsGuest ? serverName : confirmedGuestUsername;
      if (guestName) {
        multiplayer.username = guestName;
        if (serverIsGuest) confirmedGuestUsername = guestName;
      }
      // Keep the player-list / snapshot view consistent with the guest identity
      // even before the server confirms the specific "Guest N" name.
      const selfState = multiplayer.latestStates.get(multiplayer.id) || state;
      selfState.username = localGuestDisplayName();
      selfState.isGuest = true;
      multiplayer.latestStates.set(multiplayer.id, selfState);
      setLocalNametag(localGuestDisplayName(), false, state);
      applyGuestAvatarAppearance();
    } else {
      multiplayer.username = state.username;
      setLocalNametag(state.username, state.isAdmin, state);
      if (state.forcedAvatar === true) {
        applyLocalAdminAvatarAppearance(state);
      } else {
        localAdminAvatarAppearanceKey = "";
        const rigSwitchState = localAvatarPublishGuard === AVATAR_RIG_SWITCH_GUARD
          && state.rigType === activeRigType
          && !state.avatarUrl;
        const acceptedAvatarState = !localAvatarPublishGuard
          || state.avatarUrl === localAvatarPublishGuard
          || rigSwitchState;
        if (acceptedAvatarState && state.avatarUrl) {
          if (state.avatarUrl === localAvatarPublishGuard) localAvatarPublishGuard = "";
          multiplayer.avatarUrl = state.avatarUrl;
          applyLocalAvatarSource(state.avatarUrl);
        } else if (acceptedAvatarState && rigSwitchState) {
          localAvatarPublishGuard = "";
          multiplayer.avatarUrl = null;
          clearLocalAvatarSource();
        } else if (acceptedAvatarState && state.avatarPreview && !localAvatarPublishGuard) {
          applyLocalAvatarSource(state.avatarPreview);
        }
      }
    }
  } else {
    let remote = multiplayer.remotePlayers.get(message.id);
    const wantsR15 = state.rigType === "r15";
    const remoteRigMismatch = remote && (
      remote.pendingR15 ? (!wantsR15 || Boolean(r15ModelRoot)) : remote.r15 !== wantsR15
    );
    if (remoteRigMismatch) {
      removeRemotePlayer(message.id);
      remote = null;
    }
    remote = remote || createRemotePlayer(state);
    if (remote) {
      remote.username = state.username;
      remote.facingSnap = state.facingSnap === true;
      remote.burgerEquipped = state.burgerEquipped === true;
      remote.burgerGripActive = state.burgerGripActive === true;
      syncRemoteEmote(remote, state);
      setRemoteToolAnimation(remote, state.toolAnim === true, state.toolAnimToken);
      applyBurgerToRoot(remote.model, remoteBurgerVisible(remote));
      setRemoteAnimation(remote, state.animation || state.state || "Idle", state.animationTime);
      setNametag(remote.nametag, state.username, state.isAdmin, state);
      if (message.avatarUrl !== undefined) setRemoteAvatar(remote, state.avatarUrl);
      if (message.avatarPreview !== undefined) setRemoteAvatarPreview(remote, state.avatarPreview);
      if (Array.isArray(state.hats) || state.hatStyles || state.hatAdjusts || state.customHats !== undefined
          || (state.hatTextures && typeof state.hatTextures === "object")) {
        remote.hats = state.hats;
        remote.hatStyles = state.hatStyles || {};
        remote.hatAdjusts = state.hatAdjusts || {};
        remote.customHats = Array.isArray(state.customHats) ? state.customHats : [];
        remote.hatTextures = state.hatTextures && typeof state.hatTextures === "object" ? state.hatTextures : {};
        const nextLiveHatTargetId = typeof state.hatTarget === "string" && hatItemMap.has(state.hatTarget)
          ? state.hatTarget
          : null;
        remote.hairTexture = typeof state.hairTexture === "string" ? state.hairTexture : null;
        remote.liveHatTargetId = nextLiveHatTargetId;
        remote.hatAppearanceKey = hatAppearanceNetworkKey(remote.hats, remote.hatStyles, remote.hatAdjusts, remote.customHats);
        applyHatsToRemote(remote);
      } else if (typeof state.hairTexture === "string") {
        remote.hairTexture = state.hairTexture;
        remote.liveHatTargetId = typeof state.hatTarget === "string" && hatItemMap.has(state.hatTarget)
          ? state.hatTarget
          : null;
        applyHatsToRemote(remote);
      }
    }
  }
  refreshPlayerList();
}

function createRemotePlayer(state) {
  if (!modelRoot || !state?.id || isLocalPlayerState(state)) return null;

  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  const wantsR15 = state.rigType === "r15";
  if (wantsR15 && !r15ModelRoot) ensureRemoteR15AssetsLoaded();
  // Keep a visible R6 placeholder while the optional R15 FBX is downloading.
  // Replace it once the load completes instead of leaving the player invisible.
  const isR15 = wantsR15 && Boolean(r15ModelRoot);
  const remoteModel = isR15 ? cloneR15Avatar(r15ModelRoot) : SkeletonUtils.clone(r6ModelRoot || modelRoot);
  // SkeletonUtils clones the current local bone transforms. Restore the GLB's
  // bind pose before capturing emote data, otherwise a remote created while
  // the local player is walking starts with those bent legs permanently baked
  // into its otherwise mostly-static Idle animation.
  if (isR15) restoreR15Animation(remoteModel);
  else {
    restoreAvatarBindPose(remoteModel, avatarBindPose);
    captureEmoteBindPose(remoteModel);
  }
  // Do not inherit a live local scale/pose from the shared R15 template. The
  // local player can be mid-measurement or mid-animation when this clone is
  // created, which made remote R15 avatars tiny, huge, or outside the camera.
  remoteModel.position.set(0, 0, 0);
  if (isR15) remoteModel.rotation.set(0, 0, 0);
  remoteModel.scale.set(1, 1, 1);
  remoteModel.updateMatrixWorld(true);
  const remoteBounds = new THREE.Box3().setFromObject(remoteModel);
  const remoteBodyHeight = remoteBounds.max.y - remoteBounds.min.y;
  // Prefer the LOCAL avatar's settled scale factor so remote players match the
  // local player's exact height, instead of re-measuring with a bounding box
  // (which can include head/hair/tool extent and shrink or stretch remotes).
  // Fall back to a Box3-based 5-stud scale only when the local factor isn't
  // established yet (e.g. an R15 clone whose template wasn't scaled locally).
  const remoteScaleFactor =
    isR15 || !(Number.isFinite(localAvatarScale) && localAvatarScale > 0)
      ? (Number.isFinite(remoteBodyHeight) && remoteBodyHeight > 0.01 ? 5 / remoteBodyHeight : 1)
      : localAvatarScale / (remoteModel.scale.x || 1);
  remoteModel.scale.multiplyScalar(remoteScaleFactor);
  // Match the local avatar's ground reference: after scaling, the visible
  // feet must sit at the remote player's Y instead of keeping the source
  // model's original offset and making the whole avatar look too low.
  if (Number.isFinite(remoteBounds.min.y)) {
    remoteModel.position.y = -remoteBounds.min.y * remoteScaleFactor;
  }
  remoteModel.updateMatrixWorld(true);
  const collisionDebug = new THREE.Mesh(
    new THREE.CylinderGeometry(
      PLAYER_COLLISION_RADIUS,
      PLAYER_COLLISION_RADIUS,
      PLAYER_COLLISION_HEIGHT,
      16
    ),
    collisionDebugMaterial
  );
  const collisionHeadDebug = new THREE.Mesh(
    new THREE.BoxGeometry(
      PLAYER_HEAD_COLLISION_SIZE,
      PLAYER_HEAD_COLLISION_SIZE,
      PLAYER_HEAD_COLLISION_SIZE
    ),
    collisionDebugMaterial
  );
  collisionDebug.visible = collisionDebugVisible;
  collisionHeadDebug.visible = false;
  collisionDebug.renderOrder = 999;
  collisionHeadDebug.renderOrder = 999;
  collisionDebug.frustumCulled = false;
  collisionHeadDebug.frustumCulled = false;
  scene.add(collisionDebug);
  scene.add(collisionHeadDebug);
  group.add(remoteModel);
  group.position.set(state.x, state.y, state.z);

  const remote = {
    id: state.id,
    r15: Boolean(isR15),
    pendingR15: wantsR15 && !isR15,
    username: state.username || "guest",
    group,
    model: remoteModel,
    targetPosition: new THREE.Vector3(state.x, state.y, state.z),
    predictedPosition: new THREE.Vector3(state.x, state.y, state.z),
    networkVelocity: new THREE.Vector3(),
    lastNetworkAt: performance.now(),
    isMoving: state.animation === "Walk" || state.animation === "Run" || state.state === "Walk" || state.state === "Run",
    targetFacing: state.facing,
    currentFacing: state.facing,
    facingSnap: state.facingSnap === true,
    targetPitch: Number.isFinite(state.pitch) ? state.pitch : 0,
    currentPitch: Number.isFinite(state.pitch) ? state.pitch : 0,
    targetRoll: Number.isFinite(state.roll) ? state.roll : 0,
    currentRoll: Number.isFinite(state.roll) ? state.roll : 0,
    mixer: isR15 ? null : new THREE.AnimationMixer(remoteModel),
    animationAccumulator: 0,
    actions: {},
    currentAction: null,
    lastAnimation: state.animation || state.state || "Idle",
    idleNeutralPose: false,
    emoteAction: null,
    toolAnim: state.toolAnim === true,
    toolAnimToken: Number(state.toolAnimToken) || 0,
    toolAnimRequested: state.toolAnim === true && state.burgerEquipped === true,
    toolAnimPending: false,
    burgerEquipped: state.burgerEquipped === true,
    burgerGripActive: state.burgerGripActive === true,
    toolAnimAction: null,
    toolAnimPhase: null,
    emoteName: null,
    emoteToken: 0,
    avatarUrl: null,
    avatarPreview: null,
    textureSource: null,
    liveTexture: null,
    avatarRequestId: 0,
    lastTeleportRevision: Number(state.teleportRevision) || 0,
    torsoBone: null,
    collisionCenter: new THREE.Vector3(
      state.x,
      state.y + PLAYER_COLLISION_CENTER_OFFSET,
      state.z
    ),
    collisionRotationY: state.facing || 0,
    collisionDebug,
    collisionHeadDebug,
    hats: Array.isArray(state.hats) ? state.hats : [],
    hatStyles: state.hatStyles && typeof state.hatStyles === "object" ? state.hatStyles : {},
    hatAdjusts: state.hatAdjusts && typeof state.hatAdjusts === "object" ? state.hatAdjusts : {},
    customHats: Array.isArray(state.customHats) ? state.customHats : (state.customHat ? [state.customHat] : []),
    hatAppearanceKey: hatAppearanceNetworkKey(state.hats, state.hatStyles, state.hatAdjusts, state.customHats || (state.customHat ? [state.customHat] : [])),
    hairTexture: typeof state.hairTexture === "string" ? state.hairTexture : null,
    liveHatTargetId: typeof state.hatTarget === "string" && hatItemMap.has(state.hatTarget) ? state.hatTarget : null,
    nametag: createNametag(state.username || "guest"),
  };
  setNametag(remote.nametag, state.username, state.isAdmin, state);
  remote.group.visible = true;
  remoteModel.visible = true;
  for (const clip of isR15 ? [] : avatarClips) {
    // Bind each action to the cloned GLTF root, not the local player's root.
    remote.actions[clip.name] = remote.mixer.clipAction(clip, remoteModel);
  }
  bindEmoteActionsToRemote(remote);
  remote.mixer?.addEventListener("finished", (event) => {
    if (remote.toolAnimAction === event.action) {
      if (remote.toolAnimPhase === "releasing") {
        finishRemoteToolAnimation(remote);
      } else {
        event.action.time = event.action.getClip().duration;
        event.action.paused = true;
        remote.toolAnimPhase = "held";
      }
      return;
    }
    if (remote.emoteAction === event.action) stopRemoteEmote(remote);
  });
  remoteModel.traverse((object) => {
    if (!remote.torsoBone && (object.isBone || remote.r15) && /torso|spine|chest/i.test(object.name)) {
      remote.torsoBone = object;
    }
    if (!remote.headBone && (object.isBone || remote.r15) && /head|neck/i.test(object.name)) {
      remote.headBone = object;
    }
    object.visible = true;
    if (object.isMesh) {
      object.visible = true;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const remoteMaterials = sourceMaterials.map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        material.opacity = sourceMaterial.userData?.originalOpacity ?? 1;
        material.transparent = sourceMaterial.userData?.originalTransparent ?? false;
        // GLTF preparation can rename cloned materials. If the lookup misses,
        // keep the source map so remote avatars render at the same quality as
        // the local avatar instead of falling back to an untextured clone.
        const baseMap = sourceMaterial.userData?.avatarBaseMap
          || avatarBaseMaps.get(sourceMaterial.name)
          || sourceMaterial.map;
        if (baseMap) {
          material.map = baseMap;
          material.map.colorSpace = baseMap.colorSpace || THREE.SRGBColorSpace;
          material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
          material.map.minFilter = THREE.LinearMipmapLinearFilter;
          material.map.magFilter = THREE.LinearFilter;
          material.map.generateMipmaps = true;
          material.map.needsUpdate = true;
        }
        return material;
      });
      object.material = Array.isArray(object.material) ? remoteMaterials : remoteMaterials[0];
      // The local avatar is the only player that needs to cast into the
      // dynamic shadow map. Remote avatars remain lit but do not multiply the
      // shadow pass as room population grows.
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  scene.add(group);
  syncRemoteEmote(remote, state);
  setRemoteToolAnimation(remote, state.toolAnim === true, state.toolAnimToken);
  applyBurgerToRoot(remote.model, remoteBurgerVisible(remote));
  setRemoteAnimation(remote, state.animation || state.state, state.animationTime);
  setRemoteAvatar(remote, state.avatarUrl);
  setRemoteAvatarPreview(remote, state.avatarPreview);
  applyHatsToRemote(remote);

  // A reconnect can briefly leave an older session with the same username in
  // the room. Keep only one visible clone for each player identity.
  for (const existing of multiplayer.remotePlayers.values()) {
    if (existing.id !== remote.id && playerIdentityKey(existing) === playerIdentityKey(remote)) {
      removeRemotePlayer(existing.id);
    }
  }
  multiplayer.remotePlayers.set(state.id, remote);
  return remote;
}

function refreshRemoteCollisionTransform(remote) {
  // Rebuild the world matrix before reading the torso so collision follows
  // the same position, animation and facing that are currently rendered.
  // Collision geometry is driven by the stable networked position and facing
  // (currentFacing), NOT the animated torso bone. Animation bones snap to
  // axis-aligned orientations between pose frames, which made collision boxes
  // and push reactions jump to 90-degree multiples and caused players to shake
  // while touching. A fixed box also prevents one player from being shoved
  // through the other by incremental jitter.
  remote.group.updateMatrixWorld(true);
  remote.collisionCenter.set(
    remote.group.position.x,
    remote.group.position.y + PLAYER_COLLISION_CENTER_OFFSET,
    remote.group.position.z
  );
  remote.collisionRotationY = remote.currentFacing;
  if (remote.collisionDebug) {
    remote.collisionDebug.visible = collisionDebugVisible;
    remote.collisionDebug.position.copy(remote.collisionCenter);
    remote.collisionDebug.rotation.set(0, remote.collisionRotationY, 0);
  }
  if (remote.collisionHeadDebug) {
    remote.collisionHeadDebug.visible = false;
    remote.collisionHeadDebug.position.copy(remote.collisionCenter);
    remote.collisionHeadDebug.position.y += PLAYER_HEAD_COLLISION_OFFSET_Y;
    remote.collisionHeadDebug.rotation.set(0, remote.collisionRotationY, 0);
  }
}

function removeRemotePlayer(id) {
  stopRemoteFootsteps(id);
  clearChatBubblesForOrigin(String(id));
  const remote = multiplayer.remotePlayers.get(id);
  if (!remote) {
    multiplayer.latestStates.delete(id);
    return;
  }
  scene.remove(remote.group);
  if (remote.collisionDebug) {
    scene.remove(remote.collisionDebug);
    remote.collisionDebug.geometry.dispose();
  }
  if (remote.collisionHeadDebug) {
    scene.remove(remote.collisionHeadDebug);
    remote.collisionHeadDebug.geometry.dispose();
  }
  remote.liveTexture?.dispose();
  remote.nametag.remove();
  remote.mixer?.stopAllAction();
  multiplayer.remotePlayers.delete(id);
  multiplayer.latestStates.delete(id);
}

function applyMultiplayerSnapshot(message) {
  // Synchronize dropped burgers carried in the snapshot so a late joiner sees
  // burgers already resting in the world.
  if (Array.isArray(message.droppedBurgers)) {
    for (const burger of message.droppedBurgers) {
      if (burger && burger.id && !droppedBurgers.has(burger.id)) {
        spawnDroppedBurger(burger.id, burger.x, burger.y, burger.z);
      }
    }
    for (const [id] of droppedBurgers) {
      if (!message.droppedBurgers.some((b) => b && b.id === id)) removeDroppedBurger(id);
    }
  }
  // Compact server snapshots intentionally omit unchanged appearance data.
  // Merge each packet with the last full/playerUpdate state before replacing
  // the map, so a movement tick can never erase hats or avatar settings.
  const previousStates = new Map(multiplayer.latestStates);
  const states = dedupePlayerStates(message.players).map((state) => ({
    ...(previousStates.get(state.id) || {}),
    ...state,
  }));
  const seen = new Set();
  multiplayer.latestStates.clear();
  for (const state of states) {
    multiplayer.latestStates.set(state.id, state);
    if (isLocalPlayerState(state)) {
      const revision = Number(state.teleportRevision);
      if (Number.isFinite(revision) && revision > multiplayer.lastTeleportRevision) {
        // A snapshot is also authoritative. This covers a delayed/missed
        // one-off teleport packet on the target's own connection.
        applyAuthoritativeTeleport({ ...state, id: multiplayer.id, revision });
      }
      if (guestModeRequested) {
        multiplayer.isGuest = true;
        const serverName = String(state.username || "");
        const serverIsGuest = serverName.startsWith("Guest ");
        const guestName = serverIsGuest ? serverName : confirmedGuestUsername;
        if (guestName) {
          multiplayer.username = guestName;
          if (serverIsGuest) confirmedGuestUsername = guestName;
        }
        const selfState = multiplayer.latestStates.get(multiplayer.id) || state;
        selfState.username = localGuestDisplayName();
        selfState.isGuest = true;
        multiplayer.latestStates.set(multiplayer.id, selfState);
        setLocalNametag(localGuestDisplayName(), false, state);
      } else {
      setLocalNametag(state.username, state.isAdmin, state);
    if (state.forcedAvatar === true) {
      applyLocalAdminAvatarAppearance(state);
    } else {
      localAdminAvatarAppearanceKey = "";
      if (state.avatarUrl && (!localAvatarPublishGuard || state.avatarUrl === localAvatarPublishGuard)) {
        if (state.avatarUrl === localAvatarPublishGuard) localAvatarPublishGuard = "";
        multiplayer.avatarUrl = state.avatarUrl;
        applyLocalAvatarSource(state.avatarUrl);
      } else if (state.avatarPreview && !localAvatarPublishGuard) {
        applyLocalAvatarSource(state.avatarPreview);
      }
      }
      if (typeof state.fly === "boolean" && state.fly !== player.flyMode) {
        setLocalFlyMode(state.fly, {
          noclip: state.flyNoclip === true,
          speed: Number(state.flySpeed),
        });
      }
      if (state.fly === true && Number.isFinite(Number(state.flySpeed))) {
        player.flySpeed = Math.max(1, Number(state.flySpeed));
      }
      }
      continue;
    }
    seen.add(state.id);
    let remote = multiplayer.remotePlayers.get(state.id);
    const wantsR15 = state.rigType === "r15";
    const remoteRigMismatch = remote && (
      remote.pendingR15 ? (!wantsR15 || Boolean(r15ModelRoot)) : remote.r15 !== wantsR15
    );
    if (remoteRigMismatch) {
      removeRemotePlayer(state.id);
      remote = null;
    }
    remote = remote || createRemotePlayer(state);
    if (!remote) continue;
    setNametag(remote.nametag, state.username, state.isAdmin, state);
    const animation = state.animation || state.state || "Idle";
    const now = performance.now();
    const revision = Number(state.teleportRevision);
    const authoritativeTeleport = Number.isFinite(revision) && revision > (remote.lastTeleportRevision || 0);
    const elapsed = THREE.MathUtils.clamp((now - remote.lastNetworkAt) / 1000, 0.016, 0.25);
    if (authoritativeTeleport) {
      // Do not interpolate a bring/respawn through the target's previous
      // active movement sample. Every client sees the same server position.
      remote.group.position.set(state.x, state.y, state.z);
      remote.predictedPosition.set(state.x, state.y, state.z);
      remote.networkVelocity.set(0, 0, 0);
      remote.lastTeleportRevision = revision;
    } else {
      remote.networkVelocity.set(state.x, state.y, state.z).sub(remote.targetPosition).divideScalar(elapsed);
    }
    const speed = remote.networkVelocity.length();
    if (speed > 35) remote.networkVelocity.multiplyScalar(35 / speed);
    remote.targetPosition.set(state.x, state.y, state.z);
    remote.lastNetworkAt = now;
    remote.targetFacing = state.facing;
    remote.facingSnap = state.facingSnap === true;
    remote.targetPitch = Number.isFinite(state.pitch) ? state.pitch : 0;
    remote.targetRoll = Number.isFinite(state.roll) ? state.roll : 0;
    syncRemoteEmote(remote, state);
    remote.burgerEquipped = state.burgerEquipped === true;
    remote.burgerGripActive = state.burgerGripActive === true;
    setRemoteToolAnimation(remote, state.toolAnim === true, state.toolAnimToken);
    applyBurgerToRoot(remote.model, remoteBurgerVisible(remote));
    setRemoteAnimation(remote, animation, state.animationTime);
    // Do not keep predicting an old walking velocity after the server says
    // the player is idle. This was making stationary avatars drift as if they
    // were still walking between snapshots.
    if (!remote.isMoving) remote.networkVelocity.set(0, 0, 0);
    syncRemoteFootstepsFromState(state);
    setRemoteAvatar(remote, state.avatarUrl);
    if (state.avatarPreview !== undefined) setRemoteAvatarPreview(remote, state.avatarPreview);
    const appearanceKey = hatAppearanceNetworkKey(state.hats, state.hatStyles, state.hatAdjusts, state.customHats || (state.customHat ? [state.customHat] : []));
    const hatTextureKey = state.hatTextures && typeof state.hatTextures === "object" ? JSON.stringify(state.hatTextures) : "";
    if (appearanceKey !== remote.hatAppearanceKey || hatTextureKey !== remote.hatTextureKey) {
      remote.hats = Array.isArray(state.hats) ? state.hats : [];
      remote.hatStyles = state.hatStyles && typeof state.hatStyles === "object" ? state.hatStyles : {};
      remote.hatAdjusts = state.hatAdjusts && typeof state.hatAdjusts === "object" ? state.hatAdjusts : {};
      remote.customHats = Array.isArray(state.customHats) ? state.customHats : (state.customHat ? [state.customHat] : []);
      remote.hatTextures = hatTextureKey ? state.hatTextures : {};
      remote.hatAppearanceKey = appearanceKey;
      remote.hatTextureKey = hatTextureKey;
      applyHatsToRemote(remote);
    }
    const liveHatTargetId = typeof state.hatTarget === "string" && hatItemMap.has(state.hatTarget)
      ? state.hatTarget
      : null;
    const nextHairTexture = typeof state.hairTexture === "string" ? state.hairTexture : null;
    if (nextHairTexture !== remote.hairTexture || liveHatTargetId !== remote.liveHatTargetId) {
      remote.hairTexture = nextHairTexture;
      // The sender's live paint canvas doubles as that hat's texture while they
      // edit it. Route it to the exact hat they are painting so other players
      // see the edit in real time, not just hair items.
      remote.liveHatTargetId = liveHatTargetId;
      applyHatsToRemote(remote);
    }
  }
  for (const id of multiplayer.remotePlayers.keys()) {
    if (!seen.has(id)) removeRemotePlayer(id);
  }
  refreshPlayerList();
}

function updateRemotePlayer(remote, dt, now) {
  remote.group.visible = true;
  if (remote.toolAnimPending && remote.toolAnimRequested) {
    setRemoteToolAnimation(remote, true, remote.toolAnimToken);
  }
  // Predict only a short slice between snapshots. This hides the visible
  // stepping caused by network snapshots arriving slower than render frames.
  const networkAge = Math.min(0.05, Math.max(0, (now - remote.lastNetworkAt) / 1000));
  remote.predictedPosition.copy(remote.targetPosition);
  if (remote.isMoving) remote.predictedPosition.addScaledVector(remote.networkVelocity, networkAge);
  const smoothing = 1 - Math.exp(-30 * dt);
  remote.group.position.lerp(remote.predictedPosition, smoothing);
  if (remote.facingSnap) remote.currentFacing = remote.targetFacing;
  let facingDelta = remote.targetFacing - remote.currentFacing;
  while (facingDelta > Math.PI) facingDelta -= Math.PI * 2;
  while (facingDelta < -Math.PI) facingDelta += Math.PI * 2;
  if (!remote.facingSnap) remote.currentFacing += facingDelta * Math.min(1, 12 * dt);
  remote.currentPitch += (remote.targetPitch - remote.currentPitch) * Math.min(1, 18 * dt);
  let rollDelta = remote.targetRoll - remote.currentRoll;
  while (rollDelta > Math.PI) rollDelta -= Math.PI * 2;
  while (rollDelta < -Math.PI) rollDelta += Math.PI * 2;
  remote.currentRoll += rollDelta * Math.min(1, 18 * dt);
  remote.group.rotation.set(remote.currentPitch, remote.currentFacing, remote.currentRoll);
  // Keep movement interpolation at render rate, but do not run a full
  // AnimationMixer/nametag/collision workload for every avatar at 60 Hz.
  // Nearby players stay smooth; distant players still advance often enough
  // that they never freeze permanently in a crowded room.
  const distanceToCameraSq = remote.group.position.distanceToSquared(camera.position);
  const animationInterval = distanceToCameraSq > 55 * 55
    ? 0.12
    : distanceToCameraSq > 30 * 30
      ? 0.06
      : remote.r15 ? 1 / 30 : 1 / 60;
  remote.animationAccumulator += dt;
  if (remote.animationAccumulator >= animationInterval) {
    const animationDt = Math.min(remote.animationAccumulator, 0.12);
    remote.animationAccumulator = 0;
    if (remote.r15) {
      if (!remote.emoteAction) updateR15Animation(remote.model, animationDt);
      updateRemoteEmote(remote, animationDt);
      if (remote.toolAnimAction) {
        remote.mixer?.update(animationDt);
        if (remote.toolAnimState) lockToolBoneRotations(remote.model, remote.toolAnimState);
      }
    } else {
      remote.mixer?.update(animationDt);
      if (remote.toolAnimAction) lockToolBoneRotations(remote.model, remote.toolAnimState);
      if (remote.idleNeutralPose && !remote.emoteAction) restoreRemoteIdleLegPose(remote);
      updateRemoteEmote(remote, animationDt);
    }
  }
  // Remote models are normalized once when created. Do not copy the local
  // rig's scale every frame: the local rig can be remeasured during loading,
  // and multiplying by that changing value makes remote avatars shrink.
  // Player collision only matters at contact range. Far-away collider matrix
  // work is pure overhead and was multiplied by every crowded-room client.
  const dx = remote.group.position.x - player.pos.x;
  const dz = remote.group.position.z - player.pos.z;
  remote.collisionNearby = dx * dx + dz * dz <= 18 * 18;
  if (remote.collisionNearby) refreshRemoteCollisionTransform(remote);
}

function updateRemotePlayers(dt) {
  const now = performance.now();
  for (const remote of multiplayer.remotePlayers.values()) {
    try {
      updateRemotePlayer(remote, dt, now);
    } catch (error) {
      // A malformed/stale remote must not abort the update loop for every
      // other player. Drop only its transient motion until the next snapshot.
      remote.isMoving = false;
      remote.networkVelocity.set(0, 0, 0);
      console.warn("Remote player update skipped", error);
    }
  }
  try {
    updateRemoteFootsteps();
  } catch (error) {
    console.warn("Remote footsteps update skipped", error);
  }
}

function sendMultiplayerState(now) {
  if (!multiplayer.connected || !multiplayer.room || !player.model || now - multiplayer.lastSentAt < 100) return;
  multiplayer.lastSentAt = now;
  const r15Animation = activeRigType === "r15" ? modelRoot?.userData?.r15Animation : null;
  try {
    multiplayer.room.send({
  type: "state",
  ...(requestedUsername ? { username: requestedUsername, displayName: requestedUsername } : {}),
  // "Play as a Guest" requested and not yet confirmed: carry the upgrade
      // flag on every state packet (a channel the game provably delivers to
      // the server) so the server downgrades this connection to a guest.
      wantGuest: guestModeRequested && !confirmedGuestUsername,
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z,
      facing: player.facing,
      facingSnap: Boolean(cam.isFirstPerson || cam.shiftLock),
      collisionsEnabled: Boolean(playerCollisionsEnabled?.checked),
      pitch: player.flyMode && player.model ? player.model.rotation.x : 0,
      roll: player.flyMode && player.model ? player.model.rotation.z : 0,
      state: activeLocalEmote ? "Emote" : player.state,
      animation: activeLocalEmote ? "Emote" : player.state,
      // Used when a remote changes state so it joins the current animation
      // frame instead of restarting at an unrelated pose.
      animationTime: r15Animation ? Number(r15Animation.time) || 0 : 0,
      toolAnim: Boolean(activeToolAnimation && activeToolAnimation.phase !== "releasing"),
      toolAnimToken,
      burgerEquipped: isBurgerEquipped(),
      burgerGripActive: Boolean(isBurgerEquipped() && burgerGripActive),
      emote: activeLocalEmote?.name || null,
      emoteToken: activeLocalEmote?.token ?? multiplayer.emoteToken,
      fly: player.flyMode,
      rigType: activeRigType,
      avatarUrl: isGuestPlayer()
        ? GUEST_AVATAR_TEXTURE
        : (isShareableAvatarUrl(multiplayer.avatarUrl) ? multiplayer.avatarUrl : null),
      hats: isGuestPlayer() ? [GUEST_HAT_ID] : [...equippedHats],
      hatStyles: serializeHatStylesForNetwork(),
      hatAdjusts: serializeHatAdjustsForNetwork(),
      customHats: serializeCustomHatsForNetwork(),
      hatTextures: serializeHatTexturesForNetwork(),
      hatTarget: hatPaintTargetId && hatItemMap.has(hatPaintTargetId) ? hatPaintTargetId : null,
    });
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "state send failed");
  }
}

function sendMultiplayerHeartbeat() {
  if (!multiplayer.connected || !multiplayer.room) return;
  try {
    multiplayer.room.send({ type: "heartbeat" });
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "heartbeat failed");
  }
}

// A failed send is not enough evidence that the player should be removed.
// Avatar previews and other large packets can be rejected locally while the
// room is still healthy. Let onclose/offline decide when the transport really
// went away, so AFK and avatar editing never become accidental disconnects.
function handleMultiplayerSendFailure(room, reason) {
  if (!room || multiplayer.room !== room) return;
  if (navigator.onLine === false) {
    handleMultiplayerDisconnect(room, `internet offline (${reason})`);
    return;
  }
  console.warn(`Multiplayer send skipped: ${reason}`);
}

function clearRemotePlayers() {
  for (const id of remoteFootsteps.keys()) stopRemoteFootsteps(id);
  for (const id of multiplayer.remotePlayers.keys()) removeRemotePlayer(id);
  multiplayer.latestStates.clear();
}

function handleMultiplayerDisconnect(room, reason) {
  if (room && multiplayer.room !== room) return;
  if (multiplayer.preferLocalSocket && window.parent !== window) {
    multiplayer.preferLocalSocket = false;
  }
  const disconnectedRoom = room || multiplayer.room;
  cancelPendingChatFlush();
  if (multiplayer.handshakeTimer) {
    window.clearTimeout(multiplayer.handshakeTimer);
    multiplayer.handshakeTimer = null;
  }
  multiplayer.connected = false;
  multiplayer.ready = false;
  multiplayer.transportReconnecting = false;
  multiplayer.room = null;
  multiplayer.id = null;
  multiplayer.lastSnapshotAt = 0;
  multiplayer.snapshotReceived = false;
  multiplayer.snapshotWatchdogAt = 0;
  pingSentAt = 0;
  if (pingCounter) pingCounter.textContent = "Ping: --";
  clearChatBubbles();
  clearRemotePlayers();
  refreshPlayerList();
  if (gamePresenceVisible && reason !== "kicked") showDisconnectScreen();
  // Tell the server we are going before tearing the transport down. Websim's
  // transport reconnect can silently reuse an idle server entry, so without an
  // explicit leave the old session can linger as a "clone" until the stale
  // sweep (or a full page reload) eventually removes it.
  try {
    if (typeof disconnectedRoom?.send === "function") {
      disconnectedRoom.send({ type: "leave" });
    }
  } catch {
    // The transport may already be gone; the server still clears stale ids.
  }
  try {
    disconnectedRoom?.close?.();
  } catch {
    // The transport may already be closed.
  }
  scheduleMultiplayerReconnect(reason);
}

function queueChatMessage(text, whisperTo = null, imageUrl = null) {
  // A short network blip should not discard a message typed during the
  // reconnect window. Keep only a small bounded queue for longer outages.
  if (multiplayer.pendingChatMessages.length >= 20) multiplayer.pendingChatMessages.shift();
  multiplayer.pendingChatMessages.push({ text, whisperTo, imageUrl });
  scheduleMultiplayerReconnect("chat waiting for reconnect");
}

function cancelPendingChatFlush() {
  if (multiplayer.pendingChatFlushTimer) {
    window.clearTimeout(multiplayer.pendingChatFlushTimer);
    multiplayer.pendingChatFlushTimer = null;
  }
}

function flushPendingChatMessages() {
  if (!multiplayer.connected || !multiplayer.room) return;
  if (!multiplayer.pendingChatMessages.length) return;

  const wait = Math.max(0, chatClientAntiSpam.nextAllowedAt - Date.now());
  if (wait > 0) {
    cancelPendingChatFlush();
    multiplayer.pendingChatFlushTimer = window.setTimeout(() => {
      multiplayer.pendingChatFlushTimer = null;
      flushPendingChatMessages();
    }, wait);
    return;
  }

  const packet = multiplayer.pendingChatMessages.shift();
  chatClientAntiSpam.nextAllowedAt = Date.now() + CHAT_CLIENT_COOLDOWN_MS;
  try {
    multiplayer.room.send({
      type: "chat",
      text: packet.text,
      ...(packet.whisperTo ? { whisperTo: packet.whisperTo } : {}),
      ...(packet.imageUrl ? { imageUrl: packet.imageUrl } : {}),
    });
  } catch {
    multiplayer.pendingChatMessages.unshift(packet);
    handleMultiplayerSendFailure(multiplayer.room, "queued chat send failed");
    return;
  }
  if (multiplayer.pendingChatMessages.length) {
    cancelPendingChatFlush();
    multiplayer.pendingChatFlushTimer = window.setTimeout(() => {
      multiplayer.pendingChatFlushTimer = null;
      flushPendingChatMessages();
    }, CHAT_CLIENT_COOLDOWN_MS);
  }
}

function scheduleMultiplayerReconnect(reason) {
  if (!gamePresenceVisible || multiplayer.intentionalClose || multiplayer.pageClosing || multiplayer.permanentlyDisconnected) return;
  if (multiplayer.reconnectTimer) return;
  multiplayer.reconnectPending = true;
  multiplayer.reconnectAttempt += 1;
  const attempt = multiplayer.reconnectAttempt;
  showDisconnectScreen({ message: "Connection lost. Reconnecting...\n(Error Code:277)" });
  console.warn("Multiplayer reconnect scheduled", reason, attempt);
  if (attempt > 4) {
    multiplayer.reconnectPending = false;
    showDisconnectScreen();
    return;
  }
  const delay = Math.min(8000, 1000 * 2 ** (attempt - 1));
  multiplayer.reconnectScheduledAt = Date.now() + delay;
  multiplayer.reconnectTimer = window.setTimeout(() => {
    multiplayer.reconnectTimer = null;
    multiplayer.reconnectScheduledAt = 0;
    multiplayer.reconnectPending = false;
    reconnectFromDisconnectScreen();
  }, delay);
}
  multiplayer.reconnectPending = false;
  showDisconnectScreen();
  console.warn("Multiplayer reconnect requires the Reconnect button", reason);
}

function getMultiplayerSocket() {
  // Websim exposes a separate socket proxy inside nested iframes. In the
  // saved home page that proxy can wait forever, while the parent page has
  // the authenticated project connection. Both Home and Discovery must use
  // that parent connection when embedded; standalone game.html keeps its
  // local socket.
  const localSocket = globalThis.WebsimSocket;
  let parentSocket = null;
  if (window.parent !== window) {
    try {
      parentSocket = window.parent.WebsimSocket;
    } catch {
      // A cross-origin parent cannot be inspected; use the local socket.
    }
  }
  if (multiplayer.preferLocalSocket && localSocket?.joinRoom) return localSocket;
  if (parentSocket?.joinRoom) return parentSocket;
  return localSocket;
}

async function connectMultiplayer({ force = false } = {}) {
  if (multiplayer.intentionalClose || multiplayer.pageClosing || multiplayer.permanentlyDisconnected) return;
  if (navigator.onLine === false) return;
  const websimSocket = getMultiplayerSocket();
  if (!websimSocket?.joinRoom) {
    scheduleMultiplayerReconnect("socket unavailable");
    return;
  }
  if (multiplayer.connecting) {
    // The hidden home iframe can start a join before the visitor clicks Play.
    // A repeated enter message must not create a second joinRoom promise.
    if (!force) return;
    // A forced entry/reconnect is an explicit request for a new attempt. Do
    // not wait for the old promise's age: it may be the promise that got
    // stuck and is precisely why the game is showing Loading.
    multiplayer.connectGeneration += 1;
    multiplayer.connecting = false;
    multiplayer.connectAttemptAt = 0;
  }
  if (!force && multiplayer.ready && multiplayer.room) return;

  if (multiplayer.reconnectTimer) {
    window.clearTimeout(multiplayer.reconnectTimer);
    multiplayer.reconnectTimer = null;
    multiplayer.reconnectScheduledAt = 0;
  }

  if (force && multiplayer.room) {
    const oldRoom = multiplayer.room;
    multiplayer.room = null;
    multiplayer.connected = false;
    multiplayer.ready = false;
    multiplayer.snapshotReceived = false;
    multiplayer.transportReconnecting = false;
    multiplayer.id = null;
    clearRemotePlayers();
    try {
      oldRoom.send({ type: "leave" });
    } catch {
      // The room may already be disconnected.
    }
    try {
      oldRoom.close?.();
    } catch {
      // Some WebsimSocket versions close automatically after leave.
    }
  }

  multiplayer.connecting = true;
  const connectGeneration = ++multiplayer.connectGeneration;
  multiplayer.connectAttemptAt = Date.now();
  try {
    const room = await websimSocket.joinRoom();
    if (connectGeneration !== multiplayer.connectGeneration) {
      room.close?.();
      return;
    }
    if (multiplayer.intentionalClose || multiplayer.pageClosing) {
      room.close?.();
      return;
    }
    multiplayer.room = room;
    multiplayer.connected = false;
    multiplayer.ready = false;
    multiplayer.snapshotReceived = false;
    multiplayer.id = null;
    multiplayer.reconnectPending = false;
    multiplayer.handshakeTimer = window.setTimeout(() => {
      if (multiplayer.room !== room || multiplayer.ready) return;
      handleMultiplayerDisconnect(room, "welcome timeout");
    }, CONNECTION_TIMEOUT_MS);
    room.onmessage = (event) => {
      if (multiplayer.room !== room) return;
      let message;
      try {
        message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
    if (message.type === "welcome") {
        if (multiplayer.handshakeTimer) {
          window.clearTimeout(multiplayer.handshakeTimer);
          multiplayer.handshakeTimer = null;
        }
        multiplayer.id = message.id;
        multiplayer.lastSnapshotAt = Date.now();
        multiplayer.snapshotWatchdogAt = 0;
        multiplayer.username = message.username || "guest";
        if (requestedUsername && !guestModeRequested) multiplayer.username = requestedUsername;
        multiplayer.isGuest = message.isGuest === true;
        multiplayer.identityResolved = true;
        // Once a guest session is requested, never let a welcome flip the
        // player back to their signed-in identity. If the server confirms the
        // downgrade we keep its "Guest <number>" name; if a fresh normal
        // welcome arrives (reconnect / second room) we ask for the downgrade
        // again and keep the previously confirmed guest name so there is no
        // flash back to the real account.
        if (guestModeRequested) {
          if (message.isGuest && message.username) confirmedGuestUsername = message.username;
          multiplayer.isGuest = true;
          if (confirmedGuestUsername) multiplayer.username = confirmedGuestUsername;
          if (confirmedGuestUsername && guestRetryTimer) {
            window.clearTimeout(guestRetryTimer);
            guestRetryTimer = null;
          }
        }
        applyServerBurgerGripSettings(message.burgerGripSettings);
        updateGripSettingAccess();
        globalThis.WebbloxInventory?.setIdentity?.(localGuestDisplayName(), message.backpackItems);
        updateHardcoreCustomHatUI();
        updateMinesweeperAccess();
        if (multiplayer.isGuest) applyGuestAvatarAppearance();
        else updateAvatarEditorAccess();
        if (hatEditorReady) {
          // Custom hats are owner-only in the equip list. Hat initialization
          // runs before welcome while the username is still guest, so render
          // the list again after the authenticated identity is available.
          renderHatsEquipList();
          rebuildLocalHats();
        }
        updateAvatarEditorAccess();
        syncClientChatAntiSpamState(message.chatAntiSpam);
        multiplayer.lastTeleportRevision = 0;
        setLocalNametag(localGuestDisplayName(), message.isAdmin, {
          checkmarkVisible: message.checkmarkVisible !== false,
        });
        setAdminAccess(message.isAdmin);
        multiplayer.connected = true;
        multiplayer.ready = true;
        multiplayer.transportReconnecting = false;
        multiplayer.preferLocalSocket = false;
        multiplayer.reconnectAttempt = 0;
        // The wantGuest flag rides on the next state packet (sent below), so
        // no separate guest message or timer is needed — state provably
        // reaches the server and the server confirms with a guest welcome.
        if (gamePresenceVisible && loadingActive && multiplayer.snapshotReceived) finishLoadingScreen();
        else if (gamePresenceVisible && multiplayer.snapshotReceived) fadeOutConnectionScreen(disconnectScreen);
        try {
          room.send({ type: "presence", visible: gamePresenceVisible });
        } catch {
          handleMultiplayerSendFailure(room, "initial presence send failed");
        }
        refreshPlayerList();
        sendMultiplayerState(Date.now());
        sendMultiplayerPing();
        if (isShareableAvatarUrl(multiplayer.avatarUrl)) {
          room.send({ type: "avatar", url: multiplayer.avatarUrl });
        }
        if (avatarEditorReady) broadcastAvatarPreview();
        flushPendingChatMessages();
        flushPendingEmote();
      } else if (message.type === "adminReset" && message.id === multiplayer.id) {
        startPlayerRespawn({
          x: message.x,
          y: message.y,
          z: message.z,
          facing: message.facing,
        });
      } else if (message.type === "pong") {
        if (pingSentAt) {
          const ping = Math.max(0, Math.round(performance.now() - pingSentAt));
          if (pingCounter) pingCounter.textContent = `Ping: ${ping} ms`;
          pingSentAt = 0;
        }
      } else if (message.type === "burgerDropped") {
        spawnDroppedBurger(message.id, message.x, message.y, message.z);
      } else if (message.type === "burgerTaken") {
        removeDroppedBurger(message.id);
      } else if (message.type === "burgerGranted") {
        globalThis.WebbloxInventory?.addItem?.(BURGER_ITEM_ID);
      } else if (message.type === "snapshot") {
        multiplayer.lastSnapshotAt = Date.now();
        multiplayer.snapshotReceived = true;
        applyMultiplayerSnapshot(message);
        if (gamePresenceVisible && multiplayer.ready) {
          if (loadingActive) finishLoadingScreen();
          else fadeOutConnectionScreen(disconnectScreen);
        }
      } else if (message.type === "teleport") {
        applyNetworkTeleport(message);
      } else if (message.type === "avatar") {
        const knownState = multiplayer.latestStates.get(message.id);
        if (isLocalPlayerState({
          id: message.id,
          username: message.username || knownState?.username,
        })) return;
        const state = knownState || {
          id: message.id,
          username: message.username || "guest",
          x: 0,
          y: 0,
          z: 0,
          facing: 0,
          state: "Idle",
        };
        state.avatarUrl = message.avatarUrl;
        if (message.avatarPreview !== undefined) state.avatarPreview = message.avatarPreview;
        multiplayer.latestStates.set(message.id, state);
        const remote = multiplayer.remotePlayers.get(message.id) || createRemotePlayer(state);
        if (remote) {
          setRemoteAvatar(remote, message.avatarUrl);
          if (message.avatarPreview !== undefined) setRemoteAvatarPreview(remote, message.avatarPreview);
        }
      } else if (message.type === "avatarPreview") {
        const knownState = multiplayer.latestStates.get(message.id);
        if (isLocalPlayerState({
          id: message.id,
          username: message.username || knownState?.username,
        })) return;
        const state = knownState || {
          id: message.id,
          username: message.username || "guest",
          x: 0,
          y: 0,
          z: 0,
          facing: 0,
          state: "Idle",
        };
        state.avatarPreview = message.data;
        multiplayer.latestStates.set(message.id, state);
        const remote = multiplayer.remotePlayers.get(message.id) || createRemotePlayer(state);
        if (remote) setRemoteAvatarPreview(remote, message.data);
      } else if (message.type === "hats") {
        const knownState = multiplayer.latestStates.get(message.id);
        if (isLocalPlayerState({
          id: message.id,
          username: message.username || knownState?.username,
        })) return;
        const state = knownState || {
          id: message.id,
          username: message.username || "guest",
          x: 0,
          y: 0,
          z: 0,
          facing: 0,
          state: "Idle",
        };
        state.hats = Array.isArray(message.hats) ? message.hats : [];
        state.hatStyles = message.hatStyles && typeof message.hatStyles === "object" ? message.hatStyles : {};
        state.hatAdjusts = message.hatAdjusts && typeof message.hatAdjusts === "object" ? message.hatAdjusts : {};
        state.customHats = Array.isArray(message.customHats)
          ? message.customHats
          : (message.customHat && typeof message.customHat === "object" ? [message.customHat] : []);
        multiplayer.latestStates.set(message.id, state);
        const remote = multiplayer.remotePlayers.get(message.id) || createRemotePlayer(state);
        if (remote) {
          remote.hats = state.hats;
          remote.hatStyles = state.hatStyles;
          remote.hatAdjusts = state.hatAdjusts;
          remote.customHats = state.customHats;
          remote.hatAppearanceKey = hatAppearanceNetworkKey(remote.hats, remote.hatStyles, remote.hatAdjusts, remote.customHats);
          applyHatsToRemote(remote);
        }
      } else if (message.type === "hairTexture") {
        const knownState = multiplayer.latestStates.get(message.id);
        if (isLocalPlayerState({
          id: message.id,
          username: message.username || knownState?.username,
        })) return;
        const state = knownState || {
          id: message.id,
          username: message.username || "guest",
          x: 0,
          y: 0,
          z: 0,
          facing: 0,
          state: "Idle",
        };
        state.hairTexture = message.data;
        state.hatTarget = message.hatTarget;
        multiplayer.latestStates.set(message.id, state);
        const remote = multiplayer.remotePlayers.get(message.id) || createRemotePlayer(state);
        if (remote) {
          remote.hairTexture = state.hairTexture;
          remote.liveHatTargetId = typeof state.hatTarget === "string" && hatItemMap.has(state.hatTarget)
            ? state.hatTarget
            : null;
          applyHatsToRemote(remote);
        }
      } else if (message.type === "chat") {
        // The hidden game iframe stays connected while the visitor is on the
        // home/details page. Do not let those background messages become
        // visible when the game is opened.
        if (!gamePresenceVisible) return;
        appendChatMessage(
          message.username || "guest",
          message.text || "",
          undefined,
          message.whisper ? "chat-whisper" : (message.command ? "chat-command" : ""),
          message.isAdmin,
          message.whisper ? {
            peer: message.whisperPeer || "guest",
            direction: message.whisperDirection || "received",
          } : null,
          message.nametagPrefixVisible === false ? null : (message.nametagText || null),
          message.nametagColor || null,
          message.nametagPrefixVisible !== false,
          message.checkmarkVisible !== false,
          message.imageUrl || null,
          message.richText || null
        );
        showChatBubble(message);
      } else if (message.type === "chatError") {
        if (message.code === "whisperTargetNotFound") {
          appendSystemMessage(`Whisper target not found: ${message.username || "unknown"}`);
        }
      } else if (message.type === "chatAntiSpam") {
        syncClientChatAntiSpamState(message);
        // Do not replay an offline burst after the server has rejected a
        // packet. Every rejected payload is discarded, including queued ones.
        multiplayer.pendingChatMessages.length = 0;
        cancelPendingChatFlush();
        showChatAntiSpamMessage(
          message.code === "hardLockout"
            ? CHAT_HARD_LOCKOUT_MESSAGE
            : CHAT_SOFT_VIOLATION_MESSAGE
        );
      } else if (message.type === "playerUpdate") {
        applyPlayerUpdate(message);
      } else if (message.type === "presence") {
        if (!message.id) return;
        if (message.id === multiplayer.id) {
          setGamePresenceVisible(message.visible === true);
          return;
        }
        if (message.visible !== true) {
          removeRemotePlayer(message.id);
          refreshPlayerList();
        }
      } else if (message.type === "adminEffect") {
        applyAdminEffect(message);
      } else if (message.type === "adminNotice") {
        const text = String(message.text || "").trim();
        if (text) appendSystemMessage(text);
      } else if (message.type === "kicked") {
        const reason = typeof message.reason === "string" ? message.reason.trim() : "";
        const kickMessage = reason
          ? `You were kicked from this experience: ${reason}\n(Error Code:267)`
          : "You have been kicked from the game\n(Error Code:267)";
        showDisconnectScreen({ message: kickMessage, kicked: true });
        // Prevent the ordinary reconnect loop from undoing :kick immediately.
        multiplayer.intentionalClose = true;
        multiplayer.permanentlyDisconnected = true;
        multiplayer.pendingChatMessages.length = 0;
        handleMultiplayerDisconnect(room, "kicked");
      } else if (message.type === "sessionReplaced") {
        // The server replaced this transport while repairing a reconnect.
        // Treat it as an ordinary transient disconnect: the replacement
        // session must be allowed to join without requiring a page reload.
        if (message.id === multiplayer.id) {
          handleMultiplayerDisconnect(room, "session replaced");
        }
      } else if (message.type === "push") {
        applyNetworkPush(message);
      } else if (message.type === "emote") {
        const state = multiplayer.latestStates.get(message.id) || {
          id: message.id,
          username: message.username || "guest",
          x: 0,
          y: 0,
          z: 0,
          facing: 0,
          state: "Idle",
        };
        state.emote = typeof message.emote === "string" ? message.emote : null;
        state.emoteToken = Number(message.token) || 0;
        multiplayer.latestStates.set(message.id, state);
        if (message.id === multiplayer.id) {
          if (activeLocalEmote?.token !== state.emoteToken || activeLocalEmote?.name !== state.emote) {
            playLocalEmote(state.emote, state.emoteToken);
          }
        } else {
          const remote = multiplayer.remotePlayers.get(message.id) || createRemotePlayer(state);
          if (remote) playRemoteEmote(remote, state.emote, state.emoteToken);
        }
      } else if (message.type === "emoteStop") {
        const state = multiplayer.latestStates.get(message.id);
        if (state) {
          state.emote = null;
          state.emoteToken = Number(message.token) || 0;
        }
        if (message.id === multiplayer.id) stopLocalEmote(true, false);
        else stopRemoteEmote(multiplayer.remotePlayers.get(message.id));
      } else if (message.type === "sound") {
        receiveSoundEvent(message);
      } else if (message.type === "left") {
        // A local `left` means the server closed this room entry explicitly
        // (or the transport disappeared). It is not generated by AFK timeouts.
        if (message.id === multiplayer.id) {
          console.warn("Multiplayer session removed; waiting for Reconnect button");
          handleMultiplayerDisconnect(room, "session removed");
          return;
        }
        removeRemotePlayer(message.id);
        refreshPlayerList();
      }
    };
    room.onreconnect = () => {
      if (multiplayer.room !== room) return;
      // Do not accept the socket library's transparent transport recovery.
      // Close this session and wait for the user to press Reconnect.
      handleMultiplayerDisconnect(room, "transport reconnect");
    };
    room.onerror = (event) => {
      if (multiplayer.room !== room) return;
      console.warn("Multiplayer transport error", event?.message || "unknown error");
      // WebSocket error events are often recoverable and may be emitted for a
      // rejected packet. The close/offline handlers are the authoritative
      // disconnect signals.
      if (navigator.onLine === false) {
        handleMultiplayerDisconnect(room, "internet offline");
      }
    };
    room.onclose = (event) => {
      if (multiplayer.room !== room) return;
      console.warn("Multiplayer disconnected", event?.reason || "unknown reason");
      handleMultiplayerDisconnect(room, "room closed");
    };
  } catch (error) {
    if (connectGeneration !== multiplayer.connectGeneration) return;
    console.warn("Multiplayer unavailable", error);
    // If the iframe-local proxy was tried first, use the authenticated
    // parent proxy when the user presses Reconnect.
    if (multiplayer.preferLocalSocket && window.parent !== window) {
      multiplayer.preferLocalSocket = false;
    }
    scheduleMultiplayerReconnect("join failed");
  } finally {
    if (connectGeneration === multiplayer.connectGeneration) {
      multiplayer.connecting = false;
      multiplayer.connectAttemptAt = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Roblox-like local chat GUI
// ---------------------------------------------------------------------------
const chatRoot = document.getElementById("game-chat");
const chatToggle = document.getElementById("chat-toggle");
const graphicsSettings = document.getElementById("graphics-settings");
const graphicsSettingsReset = document.getElementById("graphics-settings-reset");
const chatSettingsReset = document.getElementById("chat-settings-reset");
const ssaoEnabled = document.getElementById("ssao-enabled");
const shadowsEnabled = document.getElementById("shadows-enabled");
const colorGradingEnabled = document.getElementById("color-grading-enabled");
const collisionBoxesEnabled = document.getElementById("collision-boxes-enabled");
const playerCollisionsEnabled = document.getElementById("player-collisions-enabled");
const renderQuality = document.getElementById("render-quality");
const renderQualityValue = document.getElementById("render-quality-value");
const shadowQuality = document.getElementById("shadow-quality");
const fpsLimit = document.getElementById("fps-limit");
const chatUnreadBadge = document.getElementById("chat-unread-badge");
const chatLog = document.getElementById("chat-log");
parseChatTwemoji(chatLog);
const chatImageViewer = document.getElementById("chat-image-viewer");
const chatImageViewerImage = document.getElementById("chat-image-viewer-image");
const chatImageViewerClose = document.getElementById("chat-image-viewer-close");
const chatInput = document.getElementById("chat-input");
const chatPlaceholder = document.getElementById("chat-placeholder");
const chatMode = document.getElementById("chat-mode");
const chatResize = document.getElementById("chat-resize");
const chatFontSize = document.getElementById("chat-font-size");
const chatFontSizeValue = document.getElementById("chat-font-size-value");
const playerListFontSize = document.getElementById("player-list-font-size");
const playerListFontSizeValue = document.getElementById("player-list-font-size-value");
const backpackFontSize = document.getElementById("backpack-font-size");
const backpackFontSizeValue = document.getElementById("backpack-font-size-value");
const playerListSliceScale = document.getElementById("player-list-slice-scale");
const playerListSliceScaleValue = document.getElementById("player-list-slice-scale-value");
const bubbleChatFontSize = document.getElementById("bubble-chat-font-size");
const bubbleChatFontSizeValue = document.getElementById("bubble-chat-font-size-value");
const bubbleChatScale = document.getElementById("bubble-chat-scale");
const bubbleChatScaleValue = document.getElementById("bubble-chat-scale-value");
const bubbleChatSliceScale = document.getElementById("bubble-chat-slice-scale");
const bubbleChatSliceScaleValue = document.getElementById("bubble-chat-slice-scale-value");
const chatMessageColor = document.getElementById("chat-message-color");
const chatBarColor = document.getElementById("chat-bar-color");
const chatAlign = document.getElementById("chat-align");
const chatStrokeColor = document.getElementById("chat-stroke-color");
const chatStrokeWidth = document.getElementById("chat-stroke-width");
const chatStrokeWidthValue = document.getElementById("chat-stroke-width-value");
const chatStrokeAlpha = document.getElementById("chat-stroke-alpha");
const chatStrokeAlphaValue = document.getElementById("chat-stroke-alpha-value");
const chatStrokeSoftness = document.getElementById("chat-stroke-softness");
const chatStrokeSoftnessValue = document.getElementById("chat-stroke-softness-value");

function resizeChatInput() {
  if (!chatInput) return;
  const lineHeight = Number.parseFloat(getComputedStyle(chatInput).lineHeight) || Number(chatFontSize.value) || 13;
  chatInput.style.height = "auto";
  const height = Math.max(lineHeight, Math.min(chatInput.scrollHeight, lineHeight * 2));
  chatInput.style.height = `${height}px`;
  chatRoot.style.setProperty("--chat-input-height", `${height}px`);
}

function setChatFontMetrics(element, fontSize) {
  if (!element) return;
  const size = `${fontSize}px`;
  // Chat rules use !important too, so use the same priority for the exact
  // pixel size and prevent mobile text autosizing on every rendered node.
  element.style.setProperty("font-size", size, "important");
  element.style.setProperty("line-height", size, "important");
  element.style.setProperty("-webkit-text-size-adjust", "none");
  element.style.setProperty("text-size-adjust", "none");
}

function applyChatFontMetrics(fontSize) {
  const elements = [
    chatRoot,
    chatInput,
    chatPlaceholder,
    chatMode,
    ...chatRoot.querySelectorAll(".chat-message, .chat-outline, .chat-content"),
  ];
  elements.forEach((element) => setChatFontMetrics(element, fontSize));
}

function updateChatInputLayout() {
  resizeChatInput();
}

updateChatInputLayout();
const materialRoughness = document.getElementById("material-roughness");
const materialRoughnessValue = document.getElementById("material-roughness-value");
const materialMetalness = document.getElementById("material-metalness");
const materialMetalnessValue = document.getElementById("material-metalness-value");
const materialReflectivity = document.getElementById("material-reflectivity");
const materialReflectivityValue = document.getElementById("material-reflectivity-value");
const materialSpecular = document.getElementById("material-specular");
const materialSpecularValue = document.getElementById("material-specular-value");
const ssaoRadius = document.getElementById("ssao-radius");
const ssaoRadiusValue = document.getElementById("ssao-radius-value");
const ssaoStrength = document.getElementById("ssao-strength");
const ssaoStrengthValue = document.getElementById("ssao-strength-value");
const ssaoMinDistance = document.getElementById("ssao-min-distance");
const ssaoMinDistanceValue = document.getElementById("ssao-min-distance-value");
const ssaoMaxDistance = document.getElementById("ssao-max-distance");
const ssaoMaxDistanceValue = document.getElementById("ssao-max-distance-value");
const toneMapping = document.getElementById("tone-mapping");
const toneMappingExposure = document.getElementById("tone-mapping-exposure");
const toneMappingExposureValue = document.getElementById("tone-mapping-exposure-value");
const colorSaturation = document.getElementById("color-saturation");
const colorSaturationValue = document.getElementById("color-saturation-value");
const colorContrast = document.getElementById("color-contrast");
const colorContrastValue = document.getElementById("color-contrast-value");
const colorBrightness = document.getElementById("color-brightness");
const colorBrightnessValue = document.getElementById("color-brightness-value");
function applyServerBurgerGripSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  const normalize = (source, fallback) => ({
    rotation: Number.isFinite(Number(source?.rotation)) ? Number(source.rotation) : fallback.rotation,
    x: Number.isFinite(Number(source?.x)) ? Number(source.x) : fallback.x,
    y: Number.isFinite(Number(source?.y)) ? Number(source.y) : fallback.y,
    z: Number.isFinite(Number(source?.z)) ? Number(source.z) : fallback.z,
  });
  serverBurgerGripSettings = {
    grip1: normalize(settings.grip1, { rotation: -30, x: 0, y: 0, z: 0 }),
    grip2: normalize(settings.grip2, { rotation: -135, x: 1, y: -0.6, z: 0.8 }),
  };
  updateGripSettingAccess();
}

function updateGripSettingAccess() {
  const grip1 = serverBurgerGripSettings.grip1;
  const grip2 = serverBurgerGripSettings.grip2;
  burgerGrip1YawOffset = THREE.MathUtils.degToRad(grip1.rotation);
  burgerGrip2YawOffset = THREE.MathUtils.degToRad(grip2.rotation);
  burgerGrip1PositionOffset.set(grip1.x, grip1.y, grip1.z);
  burgerGrip2PositionOffset.set(grip2.x, grip2.y, grip2.z);
}

function applyGripSetting() {
  updateGripSettingAccess();
  if (!player.model) return;
  if (player.model.userData?.burgerToolGroup) {
    removeBurgerFromRoot(player.model);
    applyBurgerToRoot(player.model, true);
  }
}
let whisperTarget = null;
let lastChatInteraction = Date.now();
let chatEnabled = true;
let unreadChatCount = 0;
const CHAT_CLIENT_COOLDOWN_MS = 1200;
const CHAT_CLIENT_MAX_VIOLATIONS = 4;
const CHAT_CLIENT_HARD_LOCKOUT_MS = 15000;
const CHAT_SOFT_VIOLATION_MESSAGE = "You are sending messages too fast. Please try again later.";
const CHAT_HARD_LOCKOUT_MESSAGE = "Your chat has been temporarily disabled for spamming. Please wait 15 seconds.";
const chatClientAntiSpam = {
  nextAllowedAt: 0,
  violationCount: 0,
  lockoutUntil: 0,
  lockoutTimer: null,
};

function updateUnreadChatBadge() {
  if (unreadChatCount <= 0) {
    chatUnreadBadge.hidden = true;
    return;
  }
  chatUnreadBadge.hidden = false;
  chatUnreadBadge.textContent = unreadChatCount > 99 ? "99+" : String(unreadChatCount);
}

function notifyUnreadChat() {
  if (chatEnabled) return;
  unreadChatCount += 1;
  updateUnreadChatBadge();
}

// Matches Roblox's deterministic name-color algorithm. The same username
// therefore gets the same name color for every player and every session.
const NAME_COLORS = [
  "#fd2943", // Color3.new(253/255, 41/255, 67/255)
  "#01a2ff", // Color3.new(1/255, 162/255, 255/255)
  "#02b857", // Color3.new(2/255, 184/255, 87/255)
  "#6b327c", // BrickColor.new("Bright violet").Color
  "#da8541", // BrickColor.new("Bright orange").Color
  "#f5cd30", // BrickColor.new("Bright yellow").Color
  "#e8bac8", // BrickColor.new("Light reddish violet").Color
  "#d7c59a", // BrickColor.new("Brick yellow").Color
];

function getNameValue(name) {
  let value = 0;
  for (let index = 0; index < name.length; index += 1) {
    let charValue = name.charCodeAt(index);
    let reverseIndex = name.length - index;
    if (name.length % 2 === 1) reverseIndex -= 1;
    if (reverseIndex % 4 >= 2) charValue = -charValue;
    value += charValue;
  }
  return value;
}

function getNameColor(name) {
  const colorIndex = ((getNameValue(name) % NAME_COLORS.length) + NAME_COLORS.length) % NAME_COLORS.length;
  return NAME_COLORS[colorIndex];
}

function colorWithAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applyChatSettings() {
  const fontSize = THREE.MathUtils.clamp(Number(chatFontSize.value) || 13, 10, 28);
  chatFontSize.value = String(fontSize);
  const strokeWidth = Number(chatStrokeWidth.value);
  const strokeAlpha = Number(chatStrokeAlpha.value);
  const strokeSoftness = Number(chatStrokeSoftness.value);
  chatRoot.style.setProperty("--chat-font-size", `${fontSize}px`);
  chatRoot.style.setProperty("--chat-message-color", chatMessageColor.value);
  chatRoot.style.setProperty("--chat-bar-color", chatBarColor.value);
  chatRoot.style.setProperty("--chat-align", chatAlign.value);
  chatRoot.style.setProperty("--chat-stroke-color", colorWithAlpha(chatStrokeColor.value, strokeAlpha));
  chatRoot.style.setProperty("--chat-stroke-width", `${strokeWidth}px`);
  chatRoot.style.setProperty("--chat-stroke-softness", `${strokeSoftness}px`);
  chatFontSizeValue.value = String(fontSize);
  chatFontSizeValue.textContent = String(fontSize);
  chatStrokeWidthValue.value = String(strokeWidth);
  chatStrokeWidthValue.textContent = String(strokeWidth);
  chatStrokeAlphaValue.value = String(strokeAlpha);
  chatStrokeAlphaValue.textContent = String(strokeAlpha);
  chatStrokeSoftnessValue.value = String(strokeSoftness);
  chatStrokeSoftnessValue.textContent = String(strokeSoftness);
  applyChatFontMetrics(fontSize);
  resizeChatInput();
}

function getChatBubbleFontSize() {
  return THREE.MathUtils.clamp(Number(bubbleChatFontSize?.value) || CHAT_BUBBLE_FONT_SIZE, 12, 36);
}

function getChatBubbleScale() {
  return THREE.MathUtils.clamp(Number(bubbleChatScale?.value) || 100, 50, 150) / 100;
}

function getChatBubbleSliceScale() {
  return THREE.MathUtils.clamp(Number(bubbleChatSliceScale?.value) || 100, 50, 200) / 100;
}

function getPlayerListSliceScale() {
  return THREE.MathUtils.clamp(Number(playerListSliceScale?.value) || 100, 50, 200) / 100;
}

function refreshChatBubbleMetrics() {
  for (const stack of chatBubbleStacks.values()) {
    for (const line of stack) {
      const metrics = measureChatBubbleText(line.text);
      line.width = metrics.width;
      line.mainHeight = metrics.height;
      line.metricsLines = metrics.lines;
      line.renderSignature = "";
    }
  }
  updateChatBubbles();
}

function applyPlayerListSettings() {
  const fontSize = THREE.MathUtils.clamp(Number(playerListFontSize.value) || 14, 10, 24);
  const sliceScale = getPlayerListSliceScale();
  playerListFontSize.value = String(fontSize);
  playerListSliceScale.value = String(Math.round(sliceScale * 100));
  playerList.style.setProperty("--player-list-font-size", `${fontSize}px`);
  playerList.style.setProperty("--player-list-cap-size", `${4 * sliceScale}px`);
  playerList.style.setProperty("--player-list-cap-offset", `${-4 * sliceScale}px`);
  playerList.style.setProperty("--player-list-mask-size", `${16 * sliceScale}px ${12 * sliceScale}px`);
  playerList.style.setProperty("--player-list-body-inset", `${8 * sliceScale}px`);
  playerListFontSizeValue.value = String(fontSize);
  playerListFontSizeValue.textContent = String(fontSize);
  playerListSliceScaleValue.value = `${Math.round(sliceScale * 100)}%`;
  playerListSliceScaleValue.textContent = `${Math.round(sliceScale * 100)}%`;
}

function applyBackpackSettings() {
  const fontSize = THREE.MathUtils.clamp(Number(backpackFontSize?.value) || 14, 10, 24);
  if (backpackFontSize) backpackFontSize.value = String(fontSize);
  if (backpackFontSizeValue) {
    backpackFontSizeValue.value = String(fontSize);
    backpackFontSizeValue.textContent = String(fontSize);
  }
  globalThis.WebbloxInventory?.setFontSize?.(fontSize);
}

function applyBubbleChatSettings() {
  const fontSize = getChatBubbleFontSize();
  const scale = getChatBubbleScale();
  const sliceScale = getChatBubbleSliceScale();
  bubbleChatFontSize.value = String(fontSize);
  bubbleChatScale.value = String(Math.round(scale * 100));
  bubbleChatSliceScale.value = String(Math.round(sliceScale * 100));
  chatBubblesRoot.style.setProperty("--chat-bubble-font-size", `${fontSize}px`);
  // Font size changes glyphs only; slice scale is controlled independently.
  chatBubblesRoot.style.setProperty("--chat-bubble-line-height", `${CHAT_BUBBLE_LINE_HEIGHT}px`);
  chatBubblesRoot.style.setProperty("--chat-bubble-scale", String(scale));
  chatBubblesRoot.style.setProperty("--chat-bubble-slice-scale", String(sliceScale));
  bubbleChatFontSizeValue.value = String(fontSize);
  bubbleChatFontSizeValue.textContent = String(fontSize);
  bubbleChatScaleValue.value = `${Math.round(scale * 100)}%`;
  bubbleChatScaleValue.textContent = `${Math.round(scale * 100)}%`;
  bubbleChatSliceScaleValue.value = `${Math.round(sliceScale * 100)}%`;
  bubbleChatSliceScaleValue.textContent = `${Math.round(sliceScale * 100)}%`;
  refreshChatBubbleMetrics();
}

function applyMaterialSettings() {
  materialSettings.roughness = Number(materialRoughness.value);
  materialSettings.metalness = Number(materialMetalness.value);
  materialSettings.reflectivity = Number(materialReflectivity.value);
  materialSettings.specular = Number(materialSpecular.value);
  // Phong has no native roughness/metalness/reflectivity fields. Keep the
  // editor useful by translating them into Roblox-style low-specular values:
  // roughness controls the tightness of the small highlight, reflectivity
  // increases its strength, and metalness tints it toward the base color.
  const shininess = THREE.MathUtils.clamp(
    Math.round(9 + (0.5 - materialSettings.roughness) * 13.333),
    1,
    32
  );
  const highlightStrength = THREE.MathUtils.clamp(
    materialSettings.specular * (1 + materialSettings.reflectivity * 9),
    0,
    1
  );

  for (const material of editableMaterials) {
    if (material.isMeshPhysicalMaterial || material.isMeshStandardMaterial) {
      material.roughness = materialSettings.roughness;
      material.metalness = materialSettings.metalness;
      material.envMapIntensity = 1 + materialSettings.reflectivity;
      if (material.isMeshPhysicalMaterial) {
        material.specularIntensity = materialSettings.specular;
        material.clearcoat = materialSettings.reflectivity;
        material.clearcoatRoughness = materialSettings.roughness;
      }
      material.needsUpdate = true;
      continue;
    }

    material.shininess = shininess;
    const specularColor = new THREE.Color(highlightStrength, highlightStrength, highlightStrength);
    if (materialSettings.metalness > 0) {
      specularColor.lerp(material.color, materialSettings.metalness);
    }
    material.specular.copy(specularColor);
    material.needsUpdate = true;
  }

  materialRoughnessValue.textContent = materialSettings.roughness.toFixed(2);
  materialMetalnessValue.textContent = materialSettings.metalness.toFixed(2);
  materialReflectivityValue.textContent = materialSettings.reflectivity.toFixed(2);
  materialSpecularValue.textContent = materialSettings.specular.toFixed(2);
}

function applySSAOSettings() {
  ssaoPass.kernelRadius = Number(ssaoRadius.value);
  ssaoPass.ssaoMaterial.uniforms.ssaoStrength.value = Number(ssaoStrength.value);
  ssaoPass.minDistance = Number(ssaoMinDistance.value);
  ssaoPass.maxDistance = Number(ssaoMaxDistance.value);
  ssaoRadiusValue.textContent = String(ssaoPass.kernelRadius);
  ssaoStrengthValue.textContent = Number(ssaoStrength.value).toFixed(2);
  ssaoMinDistanceValue.textContent = ssaoPass.minDistance.toFixed(2);
  ssaoMaxDistanceValue.textContent = ssaoPass.maxDistance.toFixed(2);
}

function applyGraphicsSettings() {
  ssaoPass.enabled = ssaoEnabled.checked;
  renderer.shadowMap.enabled = shadowsEnabled.checked;
  keyLight.castShadow = shadowsEnabled.checked;
  colorGradePass.enabled = colorGradingEnabled.checked;
  setCollisionDebugVisible(collisionBoxesEnabled.checked);
  const quality = THREE.MathUtils.clamp(Number(renderQuality.value) || 100, 50, 200) / 100;
  const deviceRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelRatio = Math.max(0.5, deviceRatio * quality);
  renderer.setPixelRatio(pixelRatio);
  composer.setPixelRatio(pixelRatio);
  syncNametagResolution(quality);
  renderQuality.value = String(Math.round(quality * 100));
  renderQualityValue.textContent = `${renderQuality.value}%`;

  const shadowMapSize = THREE.MathUtils.clamp(Number(shadowQuality.value) || 1024, 512, 2048);
  if (keyLight.shadow.mapSize.x !== shadowMapSize || keyLight.shadow.mapSize.y !== shadowMapSize) {
    keyLight.shadow.map?.dispose();
    keyLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  }
  renderer.shadowMap.needsUpdate = true;
}

function syncNametagResolution(quality = null) {
  const scale = THREE.MathUtils.clamp(
    Number(quality ?? (Number(renderQuality.value) || 100) / 100),
    0.5,
    2
  );
  nametagResolutionScale = scale;
  // Keep the overlay viewport tied to the actual WebGL canvas, not to the
  // window's nominal size. This prevents a fractional browser viewport or a
  // canvas resize from introducing a one-pixel drift between both layers.
  const rect = renderer.domElement.getBoundingClientRect();
  nametagsRoot.style.width = `${rect.width}px`;
  nametagsRoot.style.height = `${rect.height}px`;
  nametagsRoot.style.transform = "none";
}

function applyPostProcessingSettings() {
  const toneMappingModes = {
    none: THREE.NoToneMapping,
    linear: THREE.LinearToneMapping,
    reinhard: THREE.ReinhardToneMapping,
    cineon: THREE.CineonToneMapping,
    aces: THREE.ACESFilmicToneMapping,
  };
  renderer.toneMapping = toneMappingModes[toneMapping.value] ?? THREE.NoToneMapping;
  renderer.toneMappingExposure = Number(toneMappingExposure.value);
  colorGradePass.uniforms.saturation.value = Number(colorSaturation.value);
  colorGradePass.uniforms.contrast.value = Number(colorContrast.value);
  colorGradePass.uniforms.brightness.value = Number(colorBrightness.value);
  toneMappingExposureValue.textContent = Number(toneMappingExposure.value).toFixed(2);
  colorSaturationValue.textContent = Number(colorSaturation.value).toFixed(2);
  colorContrastValue.textContent = Number(colorContrast.value).toFixed(2);
  colorBrightnessValue.textContent = Number(colorBrightness.value).toFixed(2);
}

const SETTINGS_KEY = "rbxplay_settings";
// Older builds saved chat values with different layout/scale behavior. Do
// not let those values leak into the current chat; graphics settings remain
// compatible and are still restored normally.
const CHAT_SETTINGS_VERSION = 1;
const BUBBLE_CHAT_DEFAULT_VERSION = 2;
const BUBBLE_CHAT_SLICE_DEFAULT_VERSION = 3;
const settingsControls = [
  ...document.querySelectorAll("#graphics-settings input, #graphics-settings select, #chat-settings input, #chat-settings select"),
];
const defaultSettings = settingsControls.map((control) => ({
  control,
  value: control.type === "checkbox"
    ? null
    : control.tagName === "SELECT"
      ? [...control.options].find((option) => option.defaultSelected)?.value ?? control.options[0]?.value
      : control.defaultValue,
  checked: control.type === "checkbox" ? control.defaultChecked : null,
}));

function saveAllSettings() {
  const settings = {
    chatSettingsVersion: CHAT_SETTINGS_VERSION,
    chatFontSize: chatFontSize.value,
    playerListFontSize: playerListFontSize.value,
    backpackFontSize: backpackFontSize?.value,
    playerListSliceScale: playerListSliceScale.value,
    bubbleChatFontSize: bubbleChatFontSize.value,
    bubbleChatDefaultVersion: BUBBLE_CHAT_DEFAULT_VERSION,
    bubbleChatScale: bubbleChatScale.value,
    bubbleChatSliceScale: bubbleChatSliceScale.value,
    bubbleChatSliceDefaultVersion: BUBBLE_CHAT_SLICE_DEFAULT_VERSION,
    chatMessageColor: chatMessageColor.value,
    chatBarColor: chatBarColor.value,
    chatAlign: chatAlign.value,
    chatStrokeColor: chatStrokeColor.value,
    chatStrokeWidth: chatStrokeWidth.value,
    chatStrokeAlpha: chatStrokeAlpha.value,
    chatStrokeSoftness: chatStrokeSoftness.value,
    materialRoughness: materialRoughness.value,
    materialMetalness: materialMetalness.value,
    materialReflectivity: materialReflectivity.value,
    materialSpecular: materialSpecular.value,
    ssaoRadius: ssaoRadius.value,
    ssaoStrength: ssaoStrength.value,
    ssaoMinDistance: ssaoMinDistance.value,
    ssaoMaxDistance: ssaoMaxDistance.value,
    ssaoEnabled: ssaoEnabled.checked,
    shadowsEnabled: shadowsEnabled.checked,
    colorGradingEnabled: colorGradingEnabled.checked,
    collisionBoxesEnabled: collisionBoxesEnabled.checked,
    playerCollisionsEnabled: playerCollisionsEnabled.checked,
    renderQuality: renderQuality.value,
    shadowQuality: shadowQuality.value,
    fpsLimit: fpsLimit.value,
    toneMapping: toneMapping.value,
    toneMappingExposure: toneMappingExposure.value,
    colorSaturation: colorSaturation.value,
    colorContrast: colorContrast.value,
    colorBrightness: colorBrightness.value,
    chatEnabled,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    /* storage unavailable */
  }
}

function restoreAllSettings() {
  let saved = null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (error) {
    saved = null;
  }
  if (!saved) return;

  const setValue = (control, value) => {
    if (control && value != null) control.value = value;
  };
  if (saved.chatSettingsVersion === CHAT_SETTINGS_VERSION) {
    setValue(chatFontSize, saved.chatFontSize);
    setValue(playerListFontSize, saved.playerListFontSize);
    setValue(backpackFontSize, saved.backpackFontSize);
    setValue(playerListSliceScale, saved.playerListSliceScale);
    setValue(bubbleChatFontSize, saved.bubbleChatFontSize);
    setValue(bubbleChatScale, saved.bubbleChatScale);
    setValue(bubbleChatSliceScale, saved.bubbleChatSliceScale);
    // The first slice-scale build used 100% as its default. Migrate that
    // untouched value to the new 50% default once.
    if (
      saved.bubbleChatSliceDefaultVersion == null
      && saved.bubbleChatSliceScale === "100"
    ) {
      bubbleChatSliceScale.value = "50";
    }
    // Migrate the old untouched 24px default to the new 18px default once;
    // later changes are preserved normally through bubbleChatDefaultVersion.
    if (
      saved.bubbleChatDefaultVersion == null
      && saved.bubbleChatFontSize === "24"
    ) {
      bubbleChatFontSize.value = "18";
    }
    setValue(chatMessageColor, saved.chatMessageColor);
    setValue(chatBarColor, saved.chatBarColor);
    setValue(chatAlign, saved.chatAlign);
    setValue(chatStrokeColor, saved.chatStrokeColor);
    setValue(chatStrokeWidth, saved.chatStrokeWidth);
    setValue(chatStrokeAlpha, saved.chatStrokeAlpha);
    setValue(chatStrokeSoftness, saved.chatStrokeSoftness);
  }
  setValue(materialRoughness, saved.materialRoughness);
  setValue(materialMetalness, saved.materialMetalness);
  setValue(materialReflectivity, saved.materialReflectivity);
  setValue(materialSpecular, saved.materialSpecular);
  setValue(ssaoRadius, saved.ssaoRadius);
  setValue(ssaoStrength, saved.ssaoStrength);
  setValue(ssaoMinDistance, saved.ssaoMinDistance);
  setValue(ssaoMaxDistance, saved.ssaoMaxDistance);
  setValue(toneMapping, saved.toneMapping);
  setValue(toneMappingExposure, saved.toneMappingExposure);
  setValue(colorSaturation, saved.colorSaturation);
  setValue(colorContrast, saved.colorContrast);
  setValue(colorBrightness, saved.colorBrightness);
  if (typeof saved.ssaoEnabled === "boolean") ssaoEnabled.checked = saved.ssaoEnabled;
  if (typeof saved.shadowsEnabled === "boolean") shadowsEnabled.checked = saved.shadowsEnabled;
  if (typeof saved.colorGradingEnabled === "boolean") colorGradingEnabled.checked = saved.colorGradingEnabled;
  if (typeof saved.collisionBoxesEnabled === "boolean") collisionBoxesEnabled.checked = saved.collisionBoxesEnabled;
  if (typeof saved.playerCollisionsEnabled === "boolean") playerCollisionsEnabled.checked = saved.playerCollisionsEnabled;
  setValue(renderQuality, saved.renderQuality);
  setValue(shadowQuality, saved.shadowQuality);
  setValue(fpsLimit, saved.fpsLimit);
  if (saved.chatSettingsVersion === CHAT_SETTINGS_VERSION && typeof saved.chatEnabled === "boolean") {
    chatEnabled = saved.chatEnabled;
    chatRoot.classList.toggle("chat-disabled", !chatEnabled);
    chatToggle.setAttribute("aria-pressed", String(chatEnabled));
  }
}

function wireSettingsPersistence() {
  [
    chatFontSize, playerListFontSize, playerListSliceScale,
    backpackFontSize,
    bubbleChatFontSize, bubbleChatScale, bubbleChatSliceScale,
    chatMessageColor, chatBarColor, chatAlign,
    chatStrokeColor, chatStrokeWidth, chatStrokeAlpha, chatStrokeSoftness,
    materialRoughness, materialMetalness, materialReflectivity, materialSpecular,
    ssaoRadius, ssaoStrength, ssaoMinDistance, ssaoMaxDistance,
    toneMapping, toneMappingExposure, colorSaturation, colorContrast, colorBrightness,
    renderQuality, shadowQuality, fpsLimit,
  ].forEach((control) => {
    control.addEventListener("input", saveAllSettings);
    control.addEventListener("change", saveAllSettings);
  });
  [ssaoEnabled, shadowsEnabled, colorGradingEnabled, collisionBoxesEnabled, playerCollisionsEnabled].forEach((control) => {
    control.addEventListener("change", saveAllSettings);
  });
}

function resetSettingsToDefaults() {
  for (const setting of defaultSettings) {
    if (setting.control.type === "checkbox") {
      setting.control.checked = setting.checked;
    } else if (setting.value != null) {
      setting.control.value = setting.value;
    }
  }

  chatEnabled = true;
  chatRoot.classList.remove("chat-disabled");
  chatToggle.setAttribute("aria-pressed", "true");
  applyChatSettings();
  applyPlayerListSettings();
  applyBackpackSettings();
  applyBubbleChatSettings();
  applyMaterialSettings();
  applySSAOSettings();
  applyGraphicsSettings();
  updateGripSettingAccess();
  applyGripSetting();
  applyPostProcessingSettings();
  saveAllSettings();
}

graphicsSettingsReset?.addEventListener("click", resetSettingsToDefaults);
chatSettingsReset?.addEventListener("click", resetSettingsToDefaults);

[chatFontSize, chatMessageColor, chatBarColor, chatAlign, chatStrokeColor, chatStrokeWidth, chatStrokeAlpha, chatStrokeSoftness]
  .forEach((control) => control.addEventListener("input", applyChatSettings));
applyChatSettings();

playerListFontSize.addEventListener("input", applyPlayerListSettings);
playerListSliceScale.addEventListener("input", applyPlayerListSettings);
backpackFontSize?.addEventListener("input", applyBackpackSettings);
bubbleChatFontSize.addEventListener("input", applyBubbleChatSettings);
bubbleChatScale.addEventListener("input", applyBubbleChatSettings);
bubbleChatSliceScale.addEventListener("input", applyBubbleChatSettings);
applyPlayerListSettings();
applyBackpackSettings();
applyBubbleChatSettings();

[materialRoughness, materialMetalness, materialReflectivity, materialSpecular]
  .forEach((control) => control.addEventListener("input", applyMaterialSettings));
applyMaterialSettings();

[ssaoRadius, ssaoStrength, ssaoMinDistance, ssaoMaxDistance]
  .forEach((control) => control.addEventListener("input", applySSAOSettings));
applySSAOSettings();

[ssaoEnabled, shadowsEnabled, colorGradingEnabled, collisionBoxesEnabled]
  .forEach((control) => control.addEventListener("change", applyGraphicsSettings));
playerCollisionsEnabled.addEventListener("change", () => {
  if (!playerCollisionsEnabled.checked) {
    player.vel.x = 0;
    player.vel.z = 0;
  }
  saveAllSettings();
  multiplayer.lastSentAt = 0;
  sendMultiplayerState(Date.now());
});
renderQuality.addEventListener("input", applyGraphicsSettings);
[shadowQuality, fpsLimit]
  .forEach((control) => control.addEventListener("change", applyGraphicsSettings));
applyGraphicsSettings();

[toneMapping, toneMappingExposure, colorSaturation, colorContrast, colorBrightness]
  .forEach((control) => control.addEventListener("input", applyPostProcessingSettings));
applyPostProcessingSettings();

restoreAllSettings();
applyChatSettings();
applyPlayerListSettings();
applyBackpackSettings();
applyBubbleChatSettings();
applyMaterialSettings();
applySSAOSettings();
applyGraphicsSettings();
applyPostProcessingSettings();
updateGripSettingAccess();
applyGripSetting();
wireSettingsPersistence();
saveAllSettings();

function touchChat() {
  if (!chatEnabled) return;
  lastChatInteraction = Date.now();
  chatRoot.classList.remove("chat-faded");
}

function setChatEnabled(enabled) {
  chatRoot.classList.add("chat-toggle-immediate");
  chatEnabled = enabled;
  chatToggle.setAttribute("aria-pressed", String(enabled));
  chatToggle.title = enabled ? "Hide chat" : "Show chat";
  chatRoot.classList.toggle("chat-disabled", !enabled);
  if (enabled) {
    unreadChatCount = 0;
    updateUnreadChatBadge();
    touchChat();
  }
  requestAnimationFrame(() => chatRoot.classList.remove("chat-toggle-immediate"));
}

chatToggle.addEventListener("click", () => setChatEnabled(!chatEnabled));

function closeChatImageViewer() {
  if (!chatImageViewer) return;
  chatImageViewer.hidden = true;
  if (chatImageViewerImage) chatImageViewerImage.removeAttribute("src");
}

function openChatImageViewer(source, alt = "Expanded chat image") {
  if (!chatImageViewer || !chatImageViewerImage || !isShareableAvatarUrl(source)) return;
  chatImageViewerImage.src = source;
  chatImageViewerImage.alt = alt;
  chatImageViewer.hidden = false;
  chatImageViewerClose?.focus();
}

chatImageViewerClose?.addEventListener("click", closeChatImageViewer);
chatImageViewer?.addEventListener("click", (event) => {
  if (event.target === chatImageViewer) closeChatImageViewer();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && chatImageViewer && !chatImageViewer.hidden) {
    closeChatImageViewer();
  }
});

function appendSafeHardcoreRichText(parent, richText) {
  if (!parent || typeof richText !== "string") return;
  const template = document.createElement("template");
  template.innerHTML = richText;
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "S", "SPAN", "BR"]);
  const appendNode = (node, target) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(document.createTextNode(node.nodeValue || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tagName = node.tagName.toUpperCase();
    if (!allowedTags.has(tagName)) {
      // Unknown tags are discarded, but their plain text remains visible.
      for (const child of node.childNodes) appendNode(child, target);
      return;
    }
    const safeElement = document.createElement(tagName.toLowerCase());
    if (tagName === "SPAN") {
      const color = node.getAttribute("style")?.match(/^\s*color\s*:\s*(#[0-9a-f]{3,8})\s*$/i)?.[1];
      if (color) safeElement.style.color = color;
    }
    for (const child of node.childNodes) appendNode(child, safeElement);
    target.append(safeElement);
  };
  for (const child of template.content.childNodes) appendNode(child, parent);
}

function appendChatMessage(name, text, color = getNameColor(name), extraClass = "", isAdmin = false, whisper = null, nametagPrefix = null, nametagPrefixColor = null, showRankPrefix = true, checkmarkVisible = true, imageUrl = null, richText = null) {
  const displayText = replaceChatEmojiShortcodes(text);
  const displayName = formatChatSpeaker(name, isAdmin, nametagPrefix, showRankPrefix);
  const whisperLabel = whisper
    ? `[${whisper.direction === "sent" ? "To" : "From"} ${whisper.peer}]`
    : "";
  const line = document.createElement("div");
  line.className = `chat-message ${extraClass}`.trim();
  const outline = document.createElement("span");
  outline.className = "chat-outline";
  outline.setAttribute("aria-hidden", "true");
  outline.textContent = `${whisperLabel ? `${whisperLabel} ` : ""}${displayName}: ${displayText || (imageUrl ? "[image]" : "")}`;
  const content = document.createElement("span");
  content.className = "chat-content";
  if (whisperLabel) {
    const whisperElement = document.createElement("span");
    whisperElement.className = "chat-whisper-label";
    whisperElement.textContent = `${whisperLabel} `;
    content.append(whisperElement);
  }
  const nameElement = document.createElement("span");
  nameElement.className = "chat-name";
  nameElement.style.color = "";
  appendRankedName(nameElement, name, isAdmin, true, nametagPrefix, nametagPrefixColor, color, showRankPrefix, checkmarkVisible);
  const separator = document.createElement("span");
  separator.textContent = ": ";
  separator.style.color = color;
  nameElement.append(separator);
  content.append(nameElement);
  if (isOwnerName(name) && typeof richText === "string" && richText) {
    const richTextElement = document.createElement("span");
    richTextElement.className = "chat-richtext";
    appendSafeHardcoreRichText(richTextElement, richText);
    content.append(richTextElement);
  } else {
    const textElement = document.createElement("span");
    textElement.textContent = displayText;
    content.append(textElement);
  }
  if (imageUrl && isShareableAvatarUrl(imageUrl)) {
    const image = document.createElement("img");
    image.className = "chat-message-image";
    image.src = imageUrl;
    image.alt = "Chat image";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("click", () => openChatImageViewer(imageUrl, image.alt));
    content.append(document.createElement("br"), image);
  }
  line.append(outline, content);
  const fontSize = Number(chatFontSize.value) || 13;
  setChatFontMetrics(line, fontSize);
  setChatFontMetrics(outline, fontSize);
  setChatFontMetrics(content, fontSize);
  chatLog.append(line);
  parseChatTwemoji(line);
  chatLog.scrollTop = chatLog.scrollHeight;
  notifyUnreadChat();
}

function appendSystemMessage(text, extraClass = "") {
  const line = document.createElement("div");
  line.className = `chat-message chat-system ${extraClass}`.trim();
  const outline = document.createElement("span");
  outline.className = "chat-outline";
  outline.setAttribute("aria-hidden", "true");
  outline.textContent = text;
  const content = document.createElement("span");
  content.className = "chat-content";
  content.textContent = text;
  line.append(outline, content);
  const fontSize = Number(chatFontSize.value) || 13;
  setChatFontMetrics(line, fontSize);
  setChatFontMetrics(outline, fontSize);
  setChatFontMetrics(content, fontSize);
  chatLog.append(line);
  parseChatTwemoji(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function resetChatForGameEntry() {
  const firstSystemMessage = chatLog.querySelector(".chat-system");
  chatLog.replaceChildren();
  if (firstSystemMessage) chatLog.append(firstSystemMessage);
  clearChatBubbles();
  multiplayer.pendingChatMessages.length = 0;
  cancelPendingChatFlush();
  unreadChatCount = 0;
  updateUnreadChatBadge();
  whisperTarget = null;
  if (chatMode) {
    chatMode.textContent = "";
    chatMode.classList.remove("active");
  }
  if (chatInput) chatInput.value = "";
  updateChatModeLayout?.();
  updateChatInputLayout();
  lastChatInteraction = Date.now();
}

function resetClientChatAntiSpamState() {
  if (chatClientAntiSpam.lockoutTimer) {
    window.clearTimeout(chatClientAntiSpam.lockoutTimer);
    chatClientAntiSpam.lockoutTimer = null;
  }
  chatClientAntiSpam.nextAllowedAt = 0;
  chatClientAntiSpam.violationCount = 0;
  chatClientAntiSpam.lockoutUntil = 0;
}

function scheduleClientChatLockoutExpiry(lockoutUntil) {
  if (chatClientAntiSpam.lockoutTimer) window.clearTimeout(chatClientAntiSpam.lockoutTimer);
  chatClientAntiSpam.lockoutTimer = window.setTimeout(() => {
    if (chatClientAntiSpam.lockoutUntil !== lockoutUntil) return;
    resetClientChatAntiSpamState();
  }, Math.max(0, lockoutUntil - Date.now()));
}

function syncClientChatAntiSpamState(snapshot = {}) {
  const now = Date.now();
  const lockoutUntil = Number(snapshot.lockoutUntil) || 0;
  const nextAllowedAt = Number(snapshot.nextAllowedAt) || 0;
  const violationCount = Number(snapshot.violationCount);

  if (lockoutUntil > now) {
    chatClientAntiSpam.lockoutUntil = lockoutUntil;
    chatClientAntiSpam.nextAllowedAt = Math.max(nextAllowedAt, lockoutUntil);
    chatClientAntiSpam.violationCount = Math.max(
      CHAT_CLIENT_MAX_VIOLATIONS,
      Number.isFinite(violationCount) ? violationCount : CHAT_CLIENT_MAX_VIOLATIONS
    );
    scheduleClientChatLockoutExpiry(lockoutUntil);
    return;
  }

  if (chatClientAntiSpam.lockoutUntil && chatClientAntiSpam.lockoutUntil <= now) {
    resetClientChatAntiSpamState();
  }
  if (nextAllowedAt > now) chatClientAntiSpam.nextAllowedAt = nextAllowedAt;
  if (Number.isFinite(violationCount)) chatClientAntiSpam.violationCount = Math.max(0, violationCount);
}

function showChatAntiSpamMessage(text) {
  appendSystemMessage(text, "chat-antispam");
  touchChat();
}

function requestClientChatPermit() {
  const now = Date.now();
  if (chatClientAntiSpam.lockoutUntil > now) {
    showChatAntiSpamMessage(CHAT_HARD_LOCKOUT_MESSAGE);
    return false;
  }
  if (chatClientAntiSpam.lockoutUntil && chatClientAntiSpam.lockoutUntil <= now) {
    resetClientChatAntiSpamState();
  }

  if (now < chatClientAntiSpam.nextAllowedAt) {
    chatClientAntiSpam.violationCount += 1;
    if (chatClientAntiSpam.violationCount >= CHAT_CLIENT_MAX_VIOLATIONS) {
      chatClientAntiSpam.lockoutUntil = now + CHAT_CLIENT_HARD_LOCKOUT_MS;
      chatClientAntiSpam.nextAllowedAt = chatClientAntiSpam.lockoutUntil;
      scheduleClientChatLockoutExpiry(chatClientAntiSpam.lockoutUntil);
      showChatAntiSpamMessage(CHAT_HARD_LOCKOUT_MESSAGE);
      return false;
    }
    showChatAntiSpamMessage(CHAT_SOFT_VIOLATION_MESSAGE);
    return false;
  }

  chatClientAntiSpam.violationCount = 0;
  chatClientAntiSpam.lockoutUntil = 0;
  chatClientAntiSpam.nextAllowedAt = now + CHAT_CLIENT_COOLDOWN_MS;
  return true;
}

function setWhisperTarget(name) {
  whisperTarget = name || null;
  chatMode.textContent = whisperTarget ? `[To ${whisperTarget}] ` : "";
  chatMode.classList.toggle("active", Boolean(whisperTarget));
  updateChatModeLayout();
}

function updateChatModeLayout() {
  if (!whisperTarget) {
    chatMode.style.width = "";
    chatMode.style.maxWidth = "";
    chatRoot.style.setProperty("--chat-mode-width", "0px");
    return;
  }
  const availableWidth = Math.max(96, chatMode.parentElement?.clientWidth || chatRoot.clientWidth || 180);
  const maxWidth = Math.max(80, availableWidth - 12);
  chatMode.style.maxWidth = `${maxWidth}px`;
  chatMode.style.width = "max-content";
  const modeWidth = Math.min(maxWidth, Math.ceil(chatMode.scrollWidth) + 6);
  chatMode.style.width = `${modeWidth}px`;
  chatRoot.style.setProperty("--chat-mode-width", `${modeWidth}px`);
}

window.addEventListener("resize", updateChatModeLayout);

function getWhisperCandidates() {
  const candidates = new Map();
  if (multiplayer.username && multiplayer.username !== "guest") {
    candidates.set(multiplayer.username.toLowerCase(), multiplayer.username);
  }
  for (const state of multiplayer.latestStates.values()) {
    const username = String(state?.username || "").trim();
    if (username && username !== "guest") candidates.set(username.toLowerCase(), username);
  }
  return [...candidates.values()].sort((a, b) => a.localeCompare(b));
}

function resolveWhisperTarget(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return { target: null, candidates: [] };
  const candidates = getWhisperCandidates().filter((name) => name.toLowerCase().startsWith(normalized));
  const exact = candidates.find((name) => name.toLowerCase() === normalized);
  if (exact) return { target: exact, candidates: [exact] };
  return { target: candidates.length === 1 ? candidates[0] : null, candidates };
}

function autoCompleteWhisperInput() {
  const match = chatInput.value.match(/^(\/w(?:hisper)?\s+)([^\s]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return;
  const result = resolveWhisperTarget(match[2]);
  if (!result.target) return;
  // Once the target is resolved, the command becomes the chat mode label.
  // Keep only a possible message in the input so /w never overlaps it.
  chatInput.value = match[3] || "";
  setWhisperTarget(result.target);
  chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
  updateChatInputLayout();
}

function openChat() {
  touchChat();
  chatPlaceholder.style.display = "none";
  chatInput.focus();
}

function requestChatFullscreen() {
  const activeFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
  if (activeFullscreen) {
    appendSystemMessage("Fullscreen is already active.");
    return;
  }

  const target = document.documentElement;
  const request = target.requestFullscreen
    || target.webkitRequestFullscreen
    || target.msRequestFullscreen;
  if (typeof request !== "function") {
    appendSystemMessage("Fullscreen is not supported by this browser.");
    return;
  }

  let result;
  try {
    // navigationUI is supported by modern desktop and Android browsers.
    // Older mobile WebKit implementations may reject the options object, so
    // retry the vendor method without arguments below.
    result = request.call(target, { navigationUI: "hide" });
  } catch {
    try {
      result = request.call(target);
    } catch {
      appendSystemMessage("The browser blocked fullscreen.");
      return;
    }
  }

  Promise.resolve(result).then(() => {
    // Orientation lock is optional and mainly helps mobile landscape mode;
    // fullscreen itself still works when the browser does not expose it.
    const orientationLock = globalThis.screen?.orientation?.lock?.("landscape");
    orientationLock?.catch?.(() => {});
  }).catch(() => {
    appendSystemMessage("The browser blocked fullscreen.");
  });
}

async function uploadChatImage(file) {
  if (!file || !file.type.startsWith("image/")) return null;
  if (!isOwnerName(multiplayer.username)) {
    appendSystemMessage("Only hardcore can send images in chat.");
    return null;
  }
  if (file.size > 6 * 1024 * 1024) {
    appendSystemMessage("That chat image is too large (6 MB maximum).");
    return null;
  }
  try {
    const response = await fetch("/api/chat-image-upload", {
      method: "POST",
      headers: { "content-type": file.type },
      body: file,
    });
    let body = null;
    try { body = await response.json(); } catch { /* ignore malformed error body */ }
    if (!response.ok || !isShareableAvatarUrl(body?.url)) {
      throw new Error(body?.error || `Image upload failed (${response.status})`);
    }
    return body.url;
  } catch (error) {
    console.warn("Chat image upload failed", error);
    appendSystemMessage("The chat image could not be uploaded.");
    return null;
  }
}

function handleChatImagePaste(event) {
  const items = [...(event.clipboardData?.items || [])];
  const item = items.find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  const file = item?.getAsFile?.() || [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  if (!isOwnerName(multiplayer.username)) {
    appendSystemMessage("Only hardcore can send images in chat.");
    return;
  }
  if (pendingChatImageUpload) pendingChatImageUpload = null;
  chatPlaceholder.textContent = "Uploading image…";
  pendingChatImageUpload = uploadChatImage(file).then((url) => {
    pendingChatImageUpload = null;
    if (url) {
      pendingChatImageUrl = url;
      chatPlaceholder.textContent = "Image ready — press Enter to send";
    } else if (!pendingChatImageUrl) {
      chatPlaceholder.textContent = defaultChatPlaceholderText;
    }
    return url;
  });
}

function clearPendingChatImage() {
  pendingChatImageUrl = null;
  pendingChatImageUpload = null;
  chatPlaceholder.textContent = defaultChatPlaceholderText;
}

function sendChatMessage() {
  if (guestModeRequested) {
    appendSystemMessage("Guests cannot use chat.");
    chatInput.value = "";
    return;
  }
  const message = replaceChatEmojiShortcodes(chatInput.value.trim());
  if (!message && !pendingChatImageUrl) return;
  if (pendingChatImageUpload) {
    appendSystemMessage("Wait for the image upload to finish, then press Enter again.");
    return;
  }
  const imageUrl = pendingChatImageUrl;
  let didSend = false;
  if (message.toLowerCase() === "/fullscreen") {
    requestChatFullscreen();
  } else if (message === "/clear" || message === "/cls") {
    chatLog.replaceChildren();
  } else if (message === "/?" || message === "/help") {
    appendSystemMessage("Chat '/?' or '/help' for commands. Emotes: /e dance, /e dance1, /e dance2, /e dance3, /e wave, /e point, /e laugh, /e cheer. You can also use /emote. Whisper: /w username message. Fullscreen: /fullscreen");
  } else if (/^\/(?:e|emote)\s+(dance[123]?|wave|point|laugh|cheer)\s*$/i.test(message)) {
    // Emotes are public chat actions, not administrator commands. The server
    // validates the small allow-list and broadcasts the exact selected clip.
    didSend = sendRoomEmote(message.match(/^\/(?:e|emote)\s+(dance[123]?|wave|point|laugh|cheer)\s*$/i)[1]);
  } else if (
    /^(?:[:;!][^\s]+|\/(?!w(?:hisper)?(?:\s|$))[^\s]+)(?:\s|$)/iu.test(message)
  ) {
    // Admin commands are intentionally sent through the room so the server
    // remains the authority. The explicit permission message prevents the
    // old silent failure when a non-admin typed a command.
    if (!multiplayer.isAdmin) {
      appendSystemMessage("You do not have permission to use administrator commands.");
    } else {
      didSend = sendRoomChat(message, null, imageUrl);
    }
  } else {
    const whisperMatch = message.match(/^\/(?:w|whisper)\s+([^\s]+)\s+(.+)/i);
    if (whisperMatch) {
      const result = resolveWhisperTarget(whisperMatch[1]);
      if (!result.target) {
        appendSystemMessage(result.candidates.length > 1
          ? `Whisper target is ambiguous: ${result.candidates.join(", ")}`
          : `Whisper target not found: ${whisperMatch[1]}`);
        return;
      }
      setWhisperTarget(result.target);
      didSend = sendRoomChat(whisperMatch[2], result.target, imageUrl);
    } else if (whisperTarget) {
      didSend = sendRoomChat(message, whisperTarget, imageUrl);
    } else {
      didSend = sendRoomChat(message, null, imageUrl);
    }
  }
  if (didSend) clearPendingChatImage();
  chatInput.value = "";
  updateChatInputLayout();
  touchChat();
  chatInput.blur();
}

function sendRoomChat(text, whisperTo = null, imageUrl = null) {
  text = replaceChatEmojiShortcodes(text);
  if (!requestClientChatPermit()) return false;
  if (!multiplayer.connected || !multiplayer.room) {
    if (!whisperTo && /^(?:[:;!][^\s]+|\/(?!w(?:hisper)?(?:\s|$))[^\s]+)(?:\s|$)/iu.test(String(text || ""))) {
      appendSystemMessage("Connecting to the server… command queued for delivery.");
    }
    queueChatMessage(text, whisperTo, imageUrl);
    return true;
  }
  try {
    multiplayer.room.send({ type: "chat", text, ...(whisperTo ? { whisperTo } : {}), ...(imageUrl ? { imageUrl } : {}) });
    return true;
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "chat send failed");
    queueChatMessage(text, whisperTo, imageUrl);
    return true;
  }
}

document.addEventListener("visibilitychange", () => {
  if (multiplayer.permanentlyDisconnected || multiplayer.pageClosing) return;
  if (!gamePresenceVisible || document.visibilityState === "hidden") return;
  // Returning to a tab refreshes the existing session only. Reconnecting
  // after a closed transport remains an explicit button action.
  if (multiplayer.connected && multiplayer.room) {
    sendMultiplayerHeartbeat();
    sendMultiplayerState(Date.now());
  }
});

// Heartbeats must not depend on the render loop: background tabs throttle
// animation frames, which was allowing the server to remove an AFK player.
window.setInterval(sendMultiplayerHeartbeat, 15000);
window.setInterval(sendMultiplayerPing, 2000);

window.addEventListener("online", () => {
  if (multiplayer.permanentlyDisconnected || multiplayer.pageClosing) return;
  if (!gamePresenceVisible) return;
  // Coming back online does not reconnect automatically; the user must
  // press Reconnect on the disconnect screen.
});

window.addEventListener("offline", () => {
  if (multiplayer.permanentlyDisconnected || multiplayer.pageClosing) return;
  if (multiplayer.room) {
    handleMultiplayerDisconnect(multiplayer.room, "internet offline");
  }
});

window.addEventListener("pageshow", (event) => {
  if (multiplayer.permanentlyDisconnected) return;
  if (!event.persisted && multiplayer.pageClosing) return;
  multiplayer.pageClosing = false;
  multiplayer.intentionalClose = false;
  // A bfcache restore must also wait for the explicit Reconnect action.
});

function leaveMultiplayerOnPageExit() {
  if (multiplayer.pageClosing) return;
  multiplayer.pageClosing = true;
  multiplayer.intentionalClose = true;
  const room = multiplayer.room;
  if (!room) return;
  try {
    // Explicitly tell the room before closing the transport. This is the
    // intentional leave path; AFK and visibility changes never call it.
    room.send({ type: "leave" });
  } catch {
    // The socket may already be closed while the page is leaving.
  }
  try {
    room.close?.();
  } catch {
    // The browser may have already torn down the transport.
  }
  multiplayer.connected = false;
  multiplayer.ready = false;
  multiplayer.room = null;
}

window.addEventListener("pagehide", (event) => {
  // A bfcache page is coming back, so keep its room alive until pageshow.
  if (!event.persisted) leaveMultiplayerOnPageExit();
});

window.addEventListener("beforeunload", () => {
  leaveMultiplayerOnPageExit();
});

chatInput.addEventListener("focus", touchChat);
chatInput.addEventListener("focus", () => {
  chatPlaceholder.style.display = "none";
});
chatInput.addEventListener("blur", () => {
  if (!chatInput.value) chatPlaceholder.style.display = "block";
});
chatInput.addEventListener("input", touchChat);
chatInput.addEventListener("paste", handleChatImagePaste);
chatInput.addEventListener("input", () => {
  autoCompleteWhisperInput();
  updateChatInputLayout();
});
chatInput.addEventListener("keydown", (e) => {
  touchChat();
  if (e.key === "Enter") {
    if (e.shiftKey) return;
    e.preventDefault();
    sendChatMessage();
  } else if (e.key === "Escape") {
    e.preventDefault();
    chatInput.value = "";
    updateChatInputLayout();
    setWhisperTarget(null);
    chatInput.blur();
  } else if (e.key === "Backspace" && chatInput.value === "" && whisperTarget) {
    setWhisperTarget(null);
  }
});

chatMode.addEventListener("click", () => {
  setWhisperTarget(null);
  chatInput.focus();
});

chatInput.parentElement.parentElement.addEventListener("click", (e) => {
  if (e.target !== chatResize) openChat();
});

let resizingChat = false;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;
chatResize.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  resizingChat = true;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  resizeStartWidth = chatRoot.getBoundingClientRect().width;
  resizeStartHeight = chatRoot.getBoundingClientRect().height;
  chatResize.setPointerCapture(e.pointerId);
});
chatResize.addEventListener("pointermove", (e) => {
  if (!resizingChat) return;
  const width = THREE.MathUtils.clamp(resizeStartWidth + e.clientX - resizeStartX, window.innerWidth * 0.3, window.innerWidth);
  const height = THREE.MathUtils.clamp(resizeStartHeight + e.clientY - resizeStartY, window.innerHeight * 0.25, window.innerHeight);
  chatRoot.style.width = `${width}px`;
  chatRoot.style.height = `${height}px`;
  updateChatModeLayout();
});
function stopChatResize(e) {
  if (!resizingChat) return;
  resizingChat = false;
  if (chatResize.hasPointerCapture(e.pointerId)) chatResize.releasePointerCapture(e.pointerId);
}
chatResize.addEventListener("pointerup", stopChatResize);
chatResize.addEventListener("pointercancel", stopChatResize);

chatRoot.addEventListener("mouseenter", touchChat);
setInterval(() => {
  // Chat: On means the chat must remain fully visible. Chat: Off already
  // applies .chat-disabled, so there is nothing for the idle fade to do.
  if (chatEnabled) return;
  if (document.activeElement !== chatInput && Date.now() - lastChatInteraction > 5000) {
    chatRoot.classList.add("chat-faded");
  }
}, 250);

new GLTFLoader().load("uploads/r6_roblox_noob_animated.glb", (gltf) => {
  modelRoot = gltf.scene;
  r6ModelRoot = modelRoot;
  avatarClips = gltf.animations;
  avatarBindPose = captureAvatarBindPose(modelRoot);
  captureEmoteBindPose(modelRoot);

  player.model = new THREE.Group();
  player.model.rotation.order = "YXZ";
  player.model.add(modelRoot);
  player.model.position.copy(player.pos);
  scene.add(player.model);
  const localState = multiplayer.latestStates.get(multiplayer.id) || {
    checkmarkVisible: isOwnerName(multiplayer.username),
  };
  setLocalNametag(multiplayer.username, multiplayer.isAdmin, localState);

  // Animation mixer
  mixer = new THREE.AnimationMixer(modelRoot);
  mixer.addEventListener("finished", (event) => {
    if (activeToolAnimation?.action === event.action) {
      if (activeToolAnimation.phase === "releasing") {
        finishToolAnimation();
      } else {
        // Hold the rig at Tool's final frame while the item is still held.
        event.action.time = event.action.getClip().duration;
        event.action.paused = true;
        activeToolAnimation.phase = "held";
      }
      return;
    }
    if (activeLocalEmote?.action !== event.action) return;
    stopLocalEmote(true);
  });
  for (const clip of gltf.animations) {
    actions[clip.name] = mixer.clipAction(clip);
  }
  r6Mixer = mixer;
  r6Actions = actions;
  emoteLibraryPromise.then(installEmoteAnimations);
  // This asset has one skinned mesh, so the head is part of the same mesh.
  // We use the vertices weighted to the head joint only once to find the real
  // head center, then never read the animated bone for the camera again.
  modelRoot.traverse((o) => {
    if (!skinnedMesh && o.isSkinnedMesh) skinnedMesh = o;
    if (!headBone && o.isBone && /head/i.test(o.name)) headBone = o;
    if (!torsoBone && o.isBone && /torso|spine|chest/i.test(o.name)) torsoBone = o;
    if (o.isMesh) {
      const hadMaterialArray = Array.isArray(o.material);
      const materials = hadMaterialArray ? o.material : [o.material];
      let physicalMaterials = materials.map((source, index) => {
        return createAvatarPlasticMaterial(source, index);
      });
      if (o.isSkinnedMesh && physicalMaterials.length === 1) {
        physicalMaterials = splitAvatarMeshByBodyPart(o, physicalMaterials[0]);
      }
      o.material = hadMaterialArray || physicalMaterials.length > 1
        ? physicalMaterials
        : physicalMaterials[0];
      o.castShadow = true;
      // Skinned meshes can self-shadow with shadow-map acne/banding.
      // Keep the avatar casting onto the floor, but do not make it receive
      // its own shadow.
      o.receiveShadow = false;
    }
  });
  r6TextureSourceImage = avatarTextureSourceImage;
  initializeAvatarTextureEditor();
  if (isGuestPlayer()) applyGuestAvatarAppearance();
  else if (multiplayer.avatarUrl) applyLocalAvatarSource(multiplayer.avatarUrl);
  updateAvatarEditorAccess();
  applyAvatarBodyPartVisibility();
  initHatSystem();
  applyAnimationImmediate("Idle");
  if (toolAnimPending || globalThis.WebbloxInventory?.getEquippedItem?.()?.animation === "ToolAnim") {
    startToolAnimation();
  }
  // Preload the optional R15 rig for remote players too. Without this, a
  // client using R6 could receive an R15 snapshot during the asset race and
  // keep that remote avatar pending until a later appearance update.
  void ensureR15AssetsLoaded();
  if (multiplayer.id && multiplayer.latestStates.size) {
    applyMultiplayerSnapshot({ players: [...multiplayer.latestStates.values()] });
  }

  // Hide until we can measure the real rendered size, then scale to 5 studs
  player.model.visible = false;
  pendingScale = true;
  if (activeRigType === "r15") {
    void switchAvatarRig("r15").catch((error) => {
      console.warn("Could not activate saved R15 avatar", error);
      activeRigType = "r6";
      for (const button of avatarRigButtons) button.classList.toggle("active", button.dataset.avatarRig === "r6");
      try { localStorage.setItem("webbox_avatar_rig", "r6"); } catch { /* ignore unavailable storage */ }
    });
  }
});

let pendingScale = false;
const _ray = new THREE.Raycaster();
const _headVertex = new THREE.Vector3();
const _headSum = new THREE.Vector3();

function captureStaticHeadCenter() {
  if (!player.model || !skinnedMesh || !headBone) {
    staticHeadOffset.set(0, 4.25, 0);
    return;
  }

  const headJointIndex = skinnedMesh.skeleton.bones.indexOf(headBone);
  const position = skinnedMesh.geometry.attributes.position;
  const skinIndex = skinnedMesh.geometry.attributes.skinIndex;
  const skinWeight = skinnedMesh.geometry.attributes.skinWeight;
  if (headJointIndex < 0 || !position || !skinIndex || !skinWeight) {
    staticHeadOffset.set(0, 4.25, 0);
    return;
  }

  _headSum.set(0, 0, 0);
  let samples = 0;
  for (let i = 0; i < position.count; i++) {
    let headInfluence = 0;
    for (let j = 0; j < 4; j++) {
      if (skinIndex.getComponent(i, j) === headJointIndex) {
        headInfluence = Math.max(headInfluence, skinWeight.getComponent(i, j));
      }
    }
    if (headInfluence < 0.35) continue;
    skinnedMesh.getVertexPosition(i, _headVertex);
    _headVertex.applyMatrix4(skinnedMesh.matrixWorld);
    _headSum.add(_headVertex);
    samples++;
  }

  if (samples) {
    staticHeadOffset.copy(_headSum).multiplyScalar(1 / samples).sub(player.model.position);
  } else {
    staticHeadOffset.set(0, 4.25, 0);
  }
}

function measureRenderedHeight() {
  const c = player.pos;
  const upDir = new THREE.Vector3(0, -1, 0);
  _ray.set(new THREE.Vector3(c.x, c.y + 500, c.z), upDir);
  _ray.far = 1200;
  const hitsDown = _ray.intersectObject(player.model, true);
  const downDir = new THREE.Vector3(0, 1, 0);
  _ray.set(new THREE.Vector3(c.x, c.y - 500, c.z), downDir);
  const hitsUp = _ray.intersectObject(player.model, true);
  const top = hitsDown.length ? hitsDown[0].point.y : c.y;
  const bottom = hitsUp.length ? hitsUp[0].point.y : c.y;
  return { top, bottom, height: top - bottom };
}

function measureR15RigHeight(root) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const topBone = root.getObjectByName?.("Head_end") || root.getObjectByName?.("Head");
  const footBones = ["LeftFoot_end", "RightFoot_end", "LeftFoot", "RightFoot"]
    .map((name) => root.getObjectByName?.(name))
    .filter(Boolean);
  if (!topBone || !footBones.length) return null;
  const top = topBone.getWorldPosition(new THREE.Vector3()).y;
  const bottom = Math.min(...footBones.map((bone) => bone.getWorldPosition(new THREE.Vector3()).y));
  const height = top - bottom;
  return Number.isFinite(height) && height > 0.01 ? { top, bottom, height } : null;
}

function scalePlayerToStuds() {
  const m = activeRigType === "r15" ? measureR15RigHeight(modelRoot) : measureRenderedHeight();
  let height = Number(m?.height);
  let bottom = Number(m?.bottom);
  if (!Number.isFinite(height) || height < 0.01) {
    // FBX rigid-part exports can be missed by a vertical ray while their
    // meshes are still settling under the imported hierarchy. The bounding
    // box is a reliable fallback and keeps the avatar from becoming Infinity
    // scaled/invisible during a rig swap.
    const bounds = new THREE.Box3().setFromObject(player.model);
    height = bounds.max.y - bounds.min.y;
    bottom = bounds.min.y;
  }
  if (!Number.isFinite(height) || height < 0.01) {
    modelRoot.visible = true;
    player.model.visible = gamePresenceVisible;
    pendingScale = false;
    return;
  }
  const s = 5 / height;
  modelRoot.scale.multiplyScalar(s);
  localAvatarScale = modelRoot.scale.x || s;
  modelRoot.position.y = -bottom * s;
  player.model.updateMatrixWorld(true);
  captureStaticHeadCenter();
  player.model.visible = gamePresenceVisible;
  pendingScale = false;
  if (gamePresenceVisible && loadingActive && multiplayer.ready) finishLoadingScreen();
}

function buildEmoteClip(asset) {
  if (!asset?.name || !Array.isArray(asset.frames)) return null;
  const tracks = [];
  for (const [sourceBone, boneName] of Object.entries(EMOTE_BONE_MAP)) {
    const bindData = modelRoot?.userData?.emoteBindPose?.get(boneName);
    const bindPosition = bindData?.position?.clone?.() || new THREE.Vector3();
    const bindQuaternion = bindData?.quaternion?.clone?.() || new THREE.Quaternion();
    const samples = [];
    for (const frame of asset.frames) {
      const time = Number(frame?.[0]);
      const poses = Array.isArray(frame?.[1]) ? frame[1] : [];
      const pose = poses.find((entry) => entry?.[0] === sourceBone);
      if (!Number.isFinite(time) || !pose) continue;
      const posePosition = new THREE.Vector3(
        Number(pose[1]) || 0,
        Number(pose[2]) || 0,
        Number(pose[3]) || 0
      ).add(bindPosition);
      const poseQuaternion = new THREE.Quaternion(
        Number(pose[4]) || 0,
        Number(pose[5]) || 0,
        Number(pose[6]) || 0,
        Number(pose[7]) || 1
      );
      samples.push({
        time,
        position: posePosition.toArray(),
        quaternion: bindQuaternion.clone().multiply(poseQuaternion).normalize().toArray(),
      });
    }
    if (!samples.length) continue;
    tracks.push(new THREE.VectorKeyframeTrack(
      `${boneName}.position`,
      samples.map((sample) => sample.time),
      samples.flatMap((sample) => sample.position)
    ));
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${boneName}.quaternion`,
      samples.map((sample) => sample.time),
      samples.flatMap((sample) => sample.quaternion)
    ));
  }
  return tracks.length
    ? new THREE.AnimationClip(`Emote|${asset.name}`, Number(asset.duration) || -1, tracks)
    : null;
}

function bindEmoteActionsToRemote(remote) {
  if (!remote?.mixer || !remote.model) return;
  for (const clip of emoteClips.values()) {
    remote.actions[clip.name] = remote.mixer.clipAction(clip, remote.model);
  }
}

function installEmoteAnimations(assets) {
  if (!assets || typeof assets !== "object") return;
  emoteAssets = assets;
  emoteClips = new Map(
    Object.values(assets)
      .map(buildEmoteClip)
      .filter(Boolean)
      .map((clip) => [clip.name.replace(/^Emote\|/, ""), clip])
  );
  for (const remote of multiplayer.remotePlayers.values()) {
    bindEmoteActionsToRemote(remote);
    syncRemoteEmote(remote, multiplayer.latestStates.get(remote.id));
  }
  if (pendingLocalEmote) {
    const name = pendingLocalEmote;
    pendingLocalEmote = null;
    playLocalEmote(name);
  }
}

function stopLocalEmote(resume = true, notifyServer = true) {
  pendingLocalEmote = null;
  if (!activeLocalEmote) {
    multiplayer.pendingEmote = null;
    return;
  }
  multiplayer.pendingEmote = null;
  const action = activeLocalEmote.action;
  const wasR15Emote = activeLocalEmote.r15 === true;
  activeLocalEmote = null;
  if (action?.fadeOut) action.fadeOut(BLEND);
  if (wasR15Emote) restoreR15Animation(modelRoot);
  else restoreEmoteBindPose(modelRoot);
  if (currentAction === action) {
    currentAction = null;
    currentName = null;
  }
  if (notifyServer && multiplayer.connected && multiplayer.room) {
    multiplayer.emoteToken += 1;
    try {
      multiplayer.room.send({ type: "emoteStop", token: multiplayer.emoteToken });
    } catch {
      handleMultiplayerSendFailure(multiplayer.room, "emote stop failed");
    }
  }
  if (resume && !player.respawning && !player.flyMode) setAnimation(desiredState(), true);
}

function buildToolAnimClip() {
  if (toolAnimClip || !modelRoot) return toolAnimClip;
  const rigToolClip = avatarClips.find((clip) => /(?:^|[|:_])tool(?:anim)?(?:$|[|:_])/i.test(String(clip.name || "")))
    || avatarClips.find((clip) => /tool/i.test(String(clip.name || "")));
  if (rigToolClip) {
    toolAnimClip = rigToolClip.clone();
    toolAnimClip.name = `${rigToolClip.name}|Overlay`;
    THREE.AnimationUtils.makeClipAdditive(toolAnimClip, 0);
    return toolAnimClip;
  }
  const bindPose = modelRoot.userData?.emoteBindPose;
  if (!bindPose) return null;
  const times = [0, 0.28, 0.72, 1.1];
  const poseTrack = (boneName, rotations) => {
    const bind = bindPose.get(boneName);
    if (!bind?.bone) return null;
    const values = rotations.flatMap((rotation) => {
      const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        rotation[0], rotation[1], rotation[2], "XYZ"
      ));
      return bind.quaternion.clone().multiply(delta).toArray();
    });
    return new THREE.QuaternionKeyframeTrack(`${bind.bone.name}.quaternion`, times, values);
  };
  const tracks = [
    poseTrack("Right Arm_03", [
      [0, 0, 0],
      [-0.82, 0.12, -0.95],
      [-0.92, 0.18, -0.82],
      [-0.92, 0.18, -0.82],
    ]),
    poseTrack("Left Arm_02", [
      [0, 0, 0],
      [-0.18, -0.08, 0.15],
      [-0.24, -0.12, 0.2],
      [-0.24, -0.12, 0.2],
    ]),
  ].filter(Boolean);
  if (!tracks.length) return null;
  toolAnimClip = new THREE.AnimationClip("ToolAnim", 1.1, tracks);
  THREE.AnimationUtils.makeClipAdditive(toolAnimClip, 0);
  return toolAnimClip;
}

function finishToolAnimation(resume = true) {
  toolAnimPending = false;
  if (!activeToolAnimation) return;
  const action = activeToolAnimation.action;
  activeToolAnimation = null;
  action?.stop?.();
  applyBurgerToRoot(player.model, false);
  if (resume && !player.respawning && !player.flyMode) setAnimation(desiredState(), true);
}

function stopToolAnimation(resume = true) {
  toolAnimPending = false;
  if (!activeToolAnimation) {
    applyBurgerToRoot(player.model, false);
    return;
  }
  const action = activeToolAnimation.action;
  if (activeToolAnimation.phase === "releasing") return;
  activeToolAnimation.phase = "releasing";
  action.enabled = true;
  action.paused = false;
  action.setLoop(THREE.LoopOnce, 1);
  action.setEffectiveTimeScale(-1);
  action.clampWhenFinished = true;
  action.play();
  // The mixer finished event calls finishToolAnimation after the reverse pass.
  void resume;
}

function isBurgerEquipped() {
  return globalThis.WebbloxInventory?.getEquippedItem?.()?.id === BURGER_ITEM_ID;
}

function activateBurger() {
  if (!isBurgerEquipped() || !burgerUseEnabled) return;
  burgerUseEnabled = false;
  const useToken = ++burgerUseToken;
  burgerGripActive = true;
  removeBurgerFromRoot(player.model);
  applyBurgerToRoot(player.model, true);
  toolAnimToken += 1;
  multiplayer.lastSentAt = 0;
  // Eating changes the burger grip, but should not restart the Tool overlay.
  // The equip event already starts it and leaves it on its final frame.
  startToolAnimation();
  emitSound("burger");
  window.dispatchEvent(new CustomEvent("webblox:burger-activated", {
    detail: { itemId: BURGER_ITEM_ID, delay: BURGER_USE_DELAY },
  }));
  window.setTimeout(() => {
    if (useToken !== burgerUseToken) return;
    // Match the requested timed reset: after the exact .8s wait, restore the
    // default Tool grip instead of leaving the activated grip stuck forever.
    burgerGripActive = false;
    multiplayer.lastSentAt = 0;
    if (isBurgerEquipped()) {
      removeBurgerFromRoot(player.model);
      applyBurgerToRoot(player.model, true);
    }
    if (isBurgerEquipped()) {
      const previousHealth = player.health;
      player.health = Math.min(player.maxHealth, player.health + BURGER_HEAL_AMOUNT);
      if (player.health !== previousHealth) {
        window.dispatchEvent(new CustomEvent("webblox:health-changed", {
          detail: { health: player.health, maxHealth: player.maxHealth, source: BURGER_ITEM_ID },
        }));
      }
    }
    burgerUseEnabled = true;
  }, BURGER_USE_DELAY * 1000);
}

function startToolAnimation(restart = false) {
  if (!mixer || !modelRoot) {
    toolAnimPending = true;
    return;
  }
  const clip = buildToolAnimClip();
  if (!clip) return;
  if (activeToolAnimation) {
    if (restart || activeToolAnimation.phase === "releasing") {
      activeToolAnimation.phase = "forward";
      activeToolAnimation.action.enabled = true;
      activeToolAnimation.action.paused = false;
      activeToolAnimation.action.reset();
      activeToolAnimation.action.setEffectiveTimeScale(1);
      activeToolAnimation.action.setLoop(THREE.LoopOnce, 1).play();
    }
    return;
  }
  toolAnimPending = false;
  const wasEmoting = Boolean(activeLocalEmote);
  stopLocalEmote(false, false);
  if (wasEmoting && !player.respawning && !player.flyMode) setAnimation(desiredState(), true);
  const action = mixer.clipAction(clip, modelRoot);
  action.blendMode = THREE.AdditiveAnimationBlendMode;
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  activeToolAnimation = { action, phase: "forward", rotationTracks: null };
  applyBurgerToRoot(player.model, true);
}

window.addEventListener("webblox:tool-equipped", (event) => {
  if (event.detail?.equipped && event.detail.item?.animation === "ToolAnim") {
    if (event.detail.item?.id === BURGER_ITEM_ID) {
      applyBurgerToRoot(player.model, true);
      emitSound("burger");
      toolAnimToken += 1;
    }
    startToolAnimation();
  } else {
    burgerUseToken += 1;
    burgerUseEnabled = true;
    burgerGripActive = false;
    stopToolAnimation();
  }
  multiplayer.lastSentAt = 0;
  sendMultiplayerState(Date.now());
});

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !avatarEditor.hidden) return;
  activateBurger();
});

function playLocalEmote(name, token = null) {
  const normalized = String(name || "").trim();
  if (activeRigType === "r15") {
    const asset = r15AnimationData?.[normalized];
    if (!asset || !modelRoot) {
      pendingLocalEmote = normalized;
      return false;
    }
    if (activeLocalEmote?.name === normalized && (token === null || activeLocalEmote.token === token)) return true;
    stopLocalEmote(false, false);
    if (currentAction) currentAction.fadeOut(BLEND);
    currentAction = null;
    currentName = `Emote:${normalized}`;
    activeLocalEmote = { name: normalized, action: null, token, elapsed: 0, looping: normalized.startsWith("Dance"), r15: true };
    setR15Animation(modelRoot, normalized, 0, r15AnimationData);
    return true;
  }
  const asset = emoteAssets?.[normalized];
  if (!asset || !mixer || !modelRoot) {
    pendingLocalEmote = normalized;
    return false;
  }
  if (activeLocalEmote?.name === normalized && (token === null || activeLocalEmote.token === token)) return true;
  stopLocalEmote(false, false);
  const looping = normalized.startsWith("Dance");
  if (currentAction) currentAction.fadeOut(BLEND);
  currentAction = null;
  currentName = `Emote:${normalized}`;
  activeLocalEmote = { name: normalized, action: null, token, elapsed: 0, looping };
  applyEmotePose(modelRoot, asset, 0);
  return true;
}

function sendRoomEmote(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!["dance", "dance1", "dance2", "dance3", "wave", "point", "laugh", "cheer"].includes(normalized)) return false;
  const selected = normalized === "dance"
    ? `Dance${1 + Math.floor(Math.random() * 3)}`
    : /^dance[123]$/i.test(normalized)
      ? `Dance${normalized.slice(-1)}`
      : normalized[0].toUpperCase() + normalized.slice(1);
  const serverEmoteName = selected.startsWith("Dance") ? "dance" : normalized;
  multiplayer.emoteToken += 1;
  const token = multiplayer.emoteToken;
  playLocalEmote(selected, token);
  if (!multiplayer.connected || !multiplayer.room) {
    multiplayer.pendingEmote = { emote: serverEmoteName, variant: selected, token };
    appendSystemMessage("Connecting to the server… emote queued for delivery.");
    return true;
  }
  try {
    multiplayer.room.send({ type: "emote", emote: serverEmoteName, variant: selected, token });
    return true;
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "emote send failed");
    return true;
  }
}

function flushPendingEmote() {
  const queued = multiplayer.pendingEmote;
  if (!queued || !multiplayer.connected || !multiplayer.room) return;
  try {
    multiplayer.room.send({ type: "emote", ...queued });
    multiplayer.pendingEmote = null;
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "queued emote send failed");
  }
}

function playClip(clipName, label = clipName, immediate = false) {
  const next = actions[clipName];
  if (!next) return;
  if (!immediate && currentAction && currentAction.getClip().name === clipName) return;

  next.reset().setLoop(THREE.LoopRepeat, Infinity);
  if (currentAction) {
    if (immediate) {
      currentAction.stop();
      next.play();
    } else {
      currentAction.fadeOut(BLEND);
      next.fadeIn(BLEND).play();
    }
  } else {
    next.play();
  }
  currentAction = next;
  currentName = label;
}

function setAnimation(name) {
  if (avatarAnimationLocked) return;
  if (activeLocalEmote) {
    if (name === "Idle") return;
    stopLocalEmote(false);
  }
  if (activeRigType === "r15") {
    const r15Name = name === "Walk" ? "Walk" : name;
    // updatePlayer calls this every frame. Only change clips when the state
    // changes; resetting the direct R15 timeline here freezes it on frame zero.
    if (modelRoot?.userData?.r15Animation?.name === r15Name && currentName === name) return;
    if (setR15Animation(modelRoot, r15Name, 0, r15AnimationData)) {
      currentName = name;
    }
    return;
  }
  const clip = ANIM_MAP[name];
  if (!clip) return;
  playClip(clip, name);
}

function applyAnimationImmediate(name) {
  if (avatarAnimationLocked) return;
  if (activeRigType === "r15") {
    if (setR15Animation(modelRoot, name === "Walk" ? "Walk" : name, 0, r15AnimationData, { immediate: true })) {
      currentName = name;
    }
    return;
  }
  const clip = ANIM_MAP[name];
  if (clip) playClip(clip, name, true);
}

function desiredState() {
  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (!player.onGround) return player.vel.y > 0 ? "Jump" : "Fall";
  if (hSpeed > 0.5) return hSpeed > player.runSpeed ? "Run" : "Walk";
  return "Idle";
}

function overlapsHorizontal(collider) {
  return (
    player.pos.x - player.halfWidth < collider.maxX &&
    player.pos.x + player.halfWidth > collider.minX &&
    player.pos.z - player.halfDepth < collider.maxZ &&
    player.pos.z + player.halfDepth > collider.minZ
  );
}

function overlapsGround() {
  return (
    player.pos.x + player.halfWidth > -GROUND_LIMIT &&
    player.pos.x - player.halfWidth < GROUND_LIMIT &&
    player.pos.z + player.halfDepth > -GROUND_LIMIT &&
    player.pos.z - player.halfDepth < GROUND_LIMIT
  );
}

function getRemotePlayerColliders() {
  const remoteColliders = [];
  if (!playerCollisionsEnabled.checked) return remoteColliders;
  for (const remote of multiplayer.remotePlayers.values()) {
    if (remote.collisionNearby === false) continue;
    remoteColliders.push({
      playerId: remote.id,
      isPlayerCollider: true,
      isCircularPlayerCollider: true,
      centerX: remote.collisionCenter.x,
      centerY: remote.collisionCenter.y,
      centerZ: remote.collisionCenter.z,
      radius: PLAYER_COLLISION_RADIUS,
      minY: remote.group.position.y + PLAYER_COLLISION_BOTTOM_OFFSET,
      maxY: remote.group.position.y + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT,
    });
  }
  return remoteColliders;
}

function getLocalPlayerCollisionBounds() {
  return {
    radius: PLAYER_COLLISION_RADIUS,
    minX: player.pos.x - PLAYER_COLLISION_RADIUS,
    maxX: player.pos.x + PLAYER_COLLISION_RADIUS,
    minY: player.pos.y + PLAYER_COLLISION_BOTTOM_OFFSET,
    maxY: player.pos.y + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT,
    minZ: player.pos.z - PLAYER_COLLISION_RADIUS,
    maxZ: player.pos.z + PLAYER_COLLISION_RADIUS,
  };
}

function overlapsPlayerHorizontal(collider) {
  const dx = player.pos.x - collider.centerX;
  const dz = player.pos.z - collider.centerZ;
  return Math.hypot(dx, dz) < PLAYER_COLLISION_RADIUS + collider.radius;
}

function overlapsPlayerVertical(collider) {
  return player.pos.y < collider.maxY && player.pos.y + PLAYER_COLLISION_HEIGHT > collider.minY;
}

function pushRemotePlayer(playerId, directionX, directionZ) {
  if (!playerCollisionsEnabled?.checked || !multiplayer.connected || !multiplayer.room) return;
  const now = performance.now();
  const lastPush = localPushCooldowns.get(playerId) || 0;
  if (now - lastPush < PLAYER_PUSH_COOLDOWN_MS) return;
  const length = Math.hypot(directionX, directionZ);
  if (!length) return;
  localPushCooldowns.set(playerId, now);
  try {
    multiplayer.room.send({
      type: "push",
      targetId: playerId,
      dx: directionX / length,
      dz: directionZ / length,
      distance: PLAYER_PUSH_DISTANCE,
    });
  } catch {
    handleMultiplayerSendFailure(multiplayer.room, "push send failed");
  }
}

function overlapsVertical(collider) {
  return player.pos.y < collider.maxY && player.pos.y + player.height > collider.minY;
}

function resolveHorizontalCollisions(axis) {
  for (const collider of colliders) {
    if (!overlapsVertical(collider)) continue;
    if (!overlapsHorizontal(collider)) continue;

    if (axis === "x") {
      if (player.vel.x === 0) continue;
      const direction = player.vel.x > 0 ? 1 : -1;
      player.pos.x = direction > 0 ? collider.minX - player.halfWidth : collider.maxX + player.halfWidth;
      player.vel.x = 0;
      if (collider.playerId) pushRemotePlayer(collider.playerId, direction, 0);
    } else {
      if (player.vel.z === 0) continue;
      const direction = player.vel.z > 0 ? 1 : -1;
      player.pos.z = direction > 0 ? collider.minZ - player.halfDepth : collider.maxZ + player.halfDepth;
      player.vel.z = 0;
      if (collider.playerId) pushRemotePlayer(collider.playerId, 0, direction);
    }
  }
}

function resolvePlayerHorizontalCollisions() {
  if (!playerCollisionsEnabled?.checked) return;
  for (const collider of getRemotePlayerColliders()) {
    if (!overlapsPlayerVertical(collider) || !overlapsPlayerHorizontal(collider)) continue;
    if (
      player.vel.y <= 0 &&
      player.pos.y < collider.maxY &&
      player.pos.y >= collider.maxY - PLAYER_STEP_UP_HEIGHT
    ) {
      player.pos.y = collider.maxY;
      player.vel.y = 0;
      player.onGround = true;
      continue;
    }
    let dx = player.pos.x - collider.centerX;
    let dz = player.pos.z - collider.centerZ;
    let distance = Math.hypot(dx, dz);
    if (distance < 0.0001) {
      dx = player.vel.x || (String(multiplayer.id) < String(collider.playerId) ? -1 : 1);
      dz = player.vel.z || 0;
      distance = Math.hypot(dx, dz) || 1;
    }
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const correction = PLAYER_COLLISION_RADIUS + collider.radius - distance + 0.002;
    player.pos.x += normalX * correction;
    player.pos.z += normalZ * correction;
    const velocityIntoContact = player.vel.x * normalX + player.vel.z * normalZ;
    if (velocityIntoContact < 0) {
      player.vel.x -= velocityIntoContact * normalX;
      player.vel.z -= velocityIntoContact * normalZ;
    }
    // Jumping into the upper part of another avatar is a climb/landing
    // attempt, not a horizontal shove. Sending a push impulse here makes the
    // other player slide away just because someone tried to jump on them.
    const isClimbContact =
      player.vel.y > 0 ||
      player.pos.y >= collider.maxY - PLAYER_STEP_UP_HEIGHT;
    if (!isClimbContact) pushRemotePlayer(collider.playerId, normalX, normalZ);
  }
}

function resolveVerticalCollisions(previousY) {
  player.onGround = false;

  if (player.vel.y <= 0) {
    let landingHeight = null;
    if (overlapsGround() && player.pos.y <= GROUND_Y) {
      landingHeight = GROUND_Y;
    }
    for (const collider of [...colliders, ...getRemotePlayerColliders()]) {
      if (collider.isPlayerCollider) {
        const previousPlayerBottom = previousY + PLAYER_COLLISION_BOTTOM_OFFSET;
        const currentPlayerBottom = player.pos.y + PLAYER_COLLISION_BOTTOM_OFFSET;
        if (
          overlapsPlayerHorizontal(collider) &&
          currentPlayerBottom <= collider.maxY &&
          (previousPlayerBottom >= collider.maxY ||
            (player.pos.y >= collider.maxY - PLAYER_STEP_UP_HEIGHT && player.vel.y <= 0))
        ) {
          const playerBase = collider.maxY - PLAYER_COLLISION_BOTTOM_OFFSET;
          landingHeight = landingHeight === null ? playerBase : Math.max(landingHeight, playerBase);
        }
        continue;
      }
      if (
        overlapsHorizontal(collider) &&
        previousY >= collider.maxY &&
        player.pos.y <= collider.maxY
      ) {
        landingHeight = landingHeight === null ? collider.maxY : Math.max(landingHeight, collider.maxY);
      }
    }
    if (landingHeight !== null) {
      player.pos.y = landingHeight;
      player.vel.y = 0;
      player.onGround = true;
    }
  } else {
    const previousTop = previousY + player.height;
    const currentTop = player.pos.y + player.height;
    for (const collider of [...colliders, ...getRemotePlayerColliders()]) {
      if (collider.isPlayerCollider) {
        const previousPlayerTop = previousY + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT;
        const currentPlayerTop = player.pos.y + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT;
        if (
          overlapsPlayerHorizontal(collider) &&
          // A side-by-side player is not an underside collision. Requiring
          // the local player's top to be below the other player's feet
          // prevents a jump from teleporting the player through the floor.
          previousPlayerTop <= collider.minY &&
          currentPlayerTop >= collider.minY
        ) {
          player.pos.y = collider.minY - PLAYER_COLLISION_BOTTOM_OFFSET - PLAYER_COLLISION_HEIGHT;
          player.vel.y = 0;
        }
        continue;
      }
      if (
        overlapsHorizontal(collider) &&
        previousTop <= collider.minY &&
        currentTop >= collider.minY
      ) {
        player.pos.y = collider.minY - player.height;
        player.vel.y = 0;
        break;
      }
    }
  }
}

function updateFlyingPlayer(dt) {
  const keys = player.keys;
  const firstPersonView = cam.isFirstPerson && !cam.shiftLock;
  const activeCameraPitch = firstPersonView ? cam.firstPersonPitch : cam.pitch;
  const forward = new THREE.Vector3(
    -Math.sin(cam.yaw) * Math.cos(activeCameraPitch),
    // Match updateCamera's actual view vector. In third person and Shift
    // Lock, a positive camera pitch looks downward; in first person the
    // first-person pitch uses the opposite convention.
    firstPersonView ? Math.sin(activeCameraPitch) : -Math.sin(activeCameraPitch),
    -Math.cos(cam.yaw) * Math.cos(activeCameraPitch)
  );
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const wish = new THREE.Vector3();
  if (keys["KeyW"] || keys["ArrowUp"] || mobileInput.y < -0.15) wish.add(forward);
  if (keys["KeyS"] || keys["ArrowDown"] || mobileInput.y > 0.15) wish.sub(forward);
  if (keys["KeyA"] || mobileInput.x < -0.15) wish.sub(right);
  if (keys["KeyD"] || mobileInput.x > 0.15) wish.add(right);
  if (keys["KeyE"]) wish.y += 1;
  if (keys["KeyQ"]) wish.y -= 1;
  const moving = wish.lengthSq() > 0;
  if (moving) stopLocalEmote();
  if (moving) wish.normalize();

  player.vel.lerp(wish.multiplyScalar(player.flySpeed), Math.min(1, 12 * dt));
  if (player.flyNoclip) {
    player.pos.addScaledVector(player.vel, dt);
  } else {
    // Normal fly collides with world parts on all three axes. Fly2 sets
    // flyNoclip and takes the direct path above instead.
    player.pos.x += player.vel.x * dt;
    resolveHorizontalCollisions("x");
    player.pos.z += player.vel.z * dt;
    resolveHorizontalCollisions("z");
    const previousY = player.pos.y;
    player.pos.y += player.vel.y * dt;
    resolveVerticalCollisions(previousY);
    resolvePlayerHorizontalCollisions();
  }
  player.onGround = false;
  player.airborneFromJump = false;
  player.fallTime = 0;
  player.fallingSoundPlayed = false;
  updateFootsteps(false);
  if (player.model) {
    player.model.position.copy(player.pos);
    // In fly mode, align the whole avatar with the camera's view direction.
    // Write each axis explicitly so the visible pitch is also replicated.
    const bodyPitch = firstPersonView ? -activeCameraPitch : activeCameraPitch;
    const bodyYaw = cam.yaw + Math.PI;
    if (cam.isFirstPerson || cam.shiftLock) {
      player.model.rotation.set(bodyPitch, bodyYaw, 0);
    } else {
      const orientationSmoothing = 1 - Math.exp(-18 * dt);
      let yawDelta = bodyYaw - player.model.rotation.y;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      player.model.rotation.x += (bodyPitch - player.model.rotation.x) * orientationSmoothing;
      player.model.rotation.y += yawDelta * orientationSmoothing;
      player.model.rotation.z += (0 - player.model.rotation.z) * orientationSmoothing;
    }

    // Keep the networked facing value synchronized with the horizontal part
    // of the same 3D orientation for other clients.
    const targetYaw = cam.yaw + Math.PI;
    if (cam.isFirstPerson || cam.shiftLock) {
      player.facing = targetYaw;
    } else {
      let diff = targetYaw - player.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.facing += diff * Math.min(1, 16 * dt);
    }
  }
  // Flying intentionally has no local animation. Keep the network state
  // idle so other clients do not see a walking cycle in mid-air.
  player.state = "Idle";
}

function updatePlayer(dt) {
  if (player.respawning) return;
  const keys = player.keys;

  // Camera-relative movement direction (toward where the camera looks)
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const wish = new THREE.Vector3();
  if (keys["KeyW"] || keys["ArrowUp"] || mobileInput.y < -0.15) wish.add(fwd);
  if (keys["KeyS"] || keys["ArrowDown"] || mobileInput.y > 0.15) wish.sub(fwd);
  if (keys["KeyA"] || mobileInput.x < -0.15) wish.sub(right);
  if (keys["KeyD"] || mobileInput.x > 0.15) wish.add(right);
  const moving = wish.lengthSq() > 0;
  if (moving) stopLocalEmote();
  if (moving) wish.normalize();

  if (player.flyMode) {
    updateFlyingPlayer(dt);
    return;
  }

  // Horizontal movement with smooth accel
  const targetVx = wish.x * player.speed;
  const targetVz = wish.z * player.speed;
  const accel = player.onGround ? 16 : 6;
  player.vel.x += (targetVx - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (targetVz - player.vel.z) * Math.min(1, accel * dt);

  // Jump + gravity
  if (player.onGround && (keys["Space"] || mobileInput.jumpQueued)) {
    stopLocalEmote();
    player.vel.y = player.jumpSpeed;
    player.onGround = false;
    mobileInput.jumpQueued = false;
    player.airborneFromJump = true;
    player.fallTime = 0;
    player.fallingSoundPlayed = false;
    emitSound("jump");
  }
  player.vel.y -= player.gravity * dt;

  // Integrate one axis at a time so the player slides cleanly along blocks.
  player.pos.x += player.vel.x * dt;
  resolveHorizontalCollisions("x");
  player.pos.z += player.vel.z * dt;
  resolveHorizontalCollisions("z");
  const previousY = player.pos.y;
  player.pos.y += player.vel.y * dt;
  resolveVerticalCollisions(previousY);
  resolvePlayerHorizontalCollisions();

  if (player.onGround) {
    if (player.airborneFromJump) emitSound("land");
    player.airborneFromJump = false;
    player.fallTime = 0;
    player.fallingSoundPlayed = false;
  } else if (player.vel.y < 0) {
    player.fallTime += dt;
    if (!player.fallingSoundPlayed && player.fallTime >= 5) {
      emitSound("falling");
      player.fallingSoundPlayed = true;
    }
  } else {
    player.fallTime = 0;
    player.fallingSoundPlayed = false;
  }

  if (!player.flyMode && player.pos.y < VOID_RESPAWN_Y) {
    startPlayerRespawn();
    return;
  }

  if (!player.model) return;
  player.model.position.copy(player.pos);
  // Ground movement is always upright. Fly mode is the only path that is
  // allowed to write pitch/roll on the avatar group; clear any values left
  // by a previous fly transition before applying Walk/Run poses.
  player.model.rotation.x = 0;
  player.model.rotation.z = 0;

  // Face the direction the player is trying to walk. Collision resolution can
  // shorten or redirect the actual displacement along a wall, but it should
  // not turn the avatar away from the held input. When there is no input,
  // preserve the useful physical-push behavior for moving objects.
  if (moving) {
    const directionX = wish.x;
    const directionZ = wish.z;
    const targetYaw = Math.atan2(directionX, directionZ);
    let diff = targetYaw - player.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (cam.isFirstPerson || cam.shiftLock) {
      player.facing = targetYaw;
    } else {
      // A thumbstick can change direction by small, noisy amounts as the
      // finger moves. Keep the softer response only for third person.
      const joystickActive = Math.hypot(mobileInput.x, mobileInput.y) > 0.15;
      const turnSharpness = joystickActive ? 6 : 12;
      player.facing += diff * (1 - Math.exp(-turnSharpness * dt));
    }
    player.model.rotation.y = player.facing;
  }

  // Keep the state sent to the room in sync with the animation actually
  // playing locally. Without this, remotes only ever received "Idle".
  player.state = desiredState();
  setAnimation(player.state);
  updateFootsteps(player.onGround && moving && Math.hypot(player.vel.x, player.vel.z) > 0.5);
}

const _headTarget = new THREE.Vector3();
const _headEndTarget = new THREE.Vector3();

function headWorldPositionForRoot(root, target = _headTarget, ignoreAnimation = false) {
  if (!root) return target.set(player.pos.x, player.pos.y + 4.25, player.pos.z);
  root.updateMatrixWorld(true);
  if (ignoreAnimation) {
    // The camera must not jitter with a body/head animation pose. Anchor it at
    // a static offset from the avatar root so walking, dancing, emotes, etc.
    // never move the camera.
    const offset = root.userData?.r15CameraHeadOffset || staticHeadOffset;
    target.copy(offset);
    root.localToWorld(target);
    return target;
  }
  // Both imported rigs expose a real animated head bone. Use it for the
  // nametag/bubble anchor instead of the old static R6 offset, which floated
  // above the avatar and ignored custom R6 poses.
  const animatedHead = root.userData?.r15Bones?.Head || root.getObjectByName?.("Head") || findHeadBone(root);
  if (animatedHead) {
    animatedHead.getWorldPosition(target);
    let headEnd = root.getObjectByName?.("Head_end");
    if (!headEnd) {
      root.traverse((object) => {
        if (!headEnd && object.isBone && /head[ _-]*end/i.test(object.name || "")) headEnd = object;
      });
    }
    if (headEnd) {
      headEnd.getWorldPosition(_headEndTarget);
      // Head can be the neck joint on R15; midpointing to its end gives the
      // actual animated head center while still following R6 end bones.
      target.lerp(_headEndTarget, 0.5);
    }
    return target;
  }
  target.copy(staticHeadOffset);
  root.localToWorld(target);
  return target;
}

function headWorldPos() {
  if (player.model) {
    return headWorldPositionForRoot(modelRoot?.userData?.r15 ? modelRoot : player.model, _headTarget, true);
  }
  return _headTarget.set(player.pos.x, player.pos.y + 4.25, player.pos.z);
}

// Third-person orbit camera (follows the player's head)
const cam = {
  yaw: -Math.PI / 4,
  targetYaw: -Math.PI / 4,
  pitch: 0.35,
  // First person has its own vertical camera axis. Third person and
  // ShiftLock keep using `pitch`, so changing this cannot invert ShiftLock.
  firstPersonPitch: -0.35,
  dist: 14,
  targetDist: 14,
  minDist: 0.04,
  maxDist: 48,
  firstPersonDistance: 1.0,
  transparencyStartDistance: 2.0,
  isFirstPerson: false,
  shiftLock: false,
  shiftLockOffset: 2,
};

const cameraPositionTarget = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const cameraLookDirection = new THREE.Vector3();
const cameraRightDirection = new THREE.Vector3();
const cameraCollisionDirection = new THREE.Vector3();
const cameraCollisionRay = new THREE.Raycaster();
const shiftLockToggle = document.getElementById("shiftlock-toggle");
const CAMERA_STEP = Math.PI / 4;
const CAMERA_TURN_SPEED = 2.4;
const CAMERA_ZOOM_SPEED = 2.6;

function rotateCameraByStep(direction) {
  if (avatarCameraLocked) return;
  const roundedYaw = Math.round(cam.targetYaw / CAMERA_STEP) * CAMERA_STEP;
  cam.targetYaw = roundedYaw + direction * CAMERA_STEP;
  cam.yaw = cam.targetYaw;
}

function updateCamera(dt) {
  if (avatarCameraLocked && avatarCameraLockSnapshot) {
    camera.position.copy(avatarCameraLockSnapshot.position);
    camera.quaternion.copy(avatarCameraLockSnapshot.quaternion);
    // DOM overlays project against the camera before the WebGL pass runs.
    // Refresh the camera matrix here so rotation never leaves them one frame
    // behind the locked view.
    camera.updateMatrixWorld(true);
    return;
  }
  const t = headWorldPos();
  const zoomSmoothing = 1 - Math.exp(-14 * dt);
  // Arrow keys orbit continuously while held. The sign is intentionally
  // reversed from the old step controls so left/right match the screen.
  const turnDirection = (player.keys["ArrowLeft"] ? 1 : 0) + (player.keys["ArrowRight"] ? -1 : 0);
  if (turnDirection) cam.targetYaw += turnDirection * CAMERA_TURN_SPEED * dt;
  const zoomDirection = (player.keys["KeyO"] ? 1 : 0) + (player.keys["KeyI"] ? -1 : 0);
  if (zoomDirection) {
    cam.targetDist = THREE.MathUtils.clamp(
      cam.targetDist * Math.exp(zoomDirection * CAMERA_ZOOM_SPEED * dt),
      cam.minDist,
      cam.maxDist
    );
  }
  cam.yaw = cam.targetYaw;
  cam.dist += (cam.targetDist - cam.dist) * zoomSmoothing;
  const wasFirstPerson = cam.isFirstPerson;
  cam.isFirstPerson = cam.dist <= cam.firstPersonDistance;
  if (cam.isFirstPerson && !wasFirstPerson && !cam.shiftLock) {
    // Third person looks from the orbit camera toward the head, while first
    // person looks outward from the head. Negate the pitch once at the
    // boundary so the view direction stays continuous.
    cam.firstPersonPitch = -cam.pitch;
    if (!document.documentElement.classList.contains("is-mobile")) requestShiftLockPointer();
  } else if (!cam.isFirstPerson && wasFirstPerson && !cam.shiftLock) {
    cam.pitch = -cam.firstPersonPitch;
    if (document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock?.();
    }
  }
  const firstPersonCamera = cam.isFirstPerson && !cam.shiftLock;
  const activeCameraPitch = firstPersonCamera ? cam.firstPersonPitch : cam.pitch;
  cameraLookDirection.set(
    -Math.sin(cam.yaw) * Math.cos(activeCameraPitch),
    firstPersonCamera ? Math.sin(activeCameraPitch) : -Math.sin(activeCameraPitch),
    -Math.cos(cam.yaw) * Math.cos(activeCameraPitch)
  ).normalize();
  cameraRightDirection.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));

  if (cam.isFirstPerson) {
    // Put the camera just inside the head. The local avatar fades out as the
    // camera approaches, so this remains a clean client-side first-person
    // view without changing what other players see.
    cameraPositionTarget.copy(t).addScaledVector(cameraLookDirection, 0.05);
    cameraLookTarget.copy(cameraPositionTarget).addScaledVector(cameraLookDirection, 10);
  } else {
    cameraPositionTarget.set(
      t.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      t.y + cam.dist * Math.sin(cam.pitch),
      t.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
    );
    cameraLookTarget.copy(t);
  }

  if (cam.shiftLock) {
    // Roblox-style shoulder camera: move both the camera and its focus to the
    // player's right so the avatar stays offset from the screen center.
    cameraPositionTarget.addScaledVector(cameraRightDirection, cam.shiftLockOffset);
    cameraLookTarget.addScaledVector(cameraRightDirection, cam.shiftLockOffset);
  }

  // Keep the third-person camera on the near side of blocks instead of
  // letting it pass through the world geometry.
  if (!cam.isFirstPerson) {
    cameraCollisionDirection.subVectors(cameraPositionTarget, t);
    const desiredDistance = cameraCollisionDirection.length();
    cameraCollisionDirection.normalize();
    cameraCollisionRay.set(t, cameraCollisionDirection);
    cameraCollisionRay.far = desiredDistance;
    const cameraHits = cameraCollisionRay.intersectObjects(bricks, false);
    if (cameraHits.length) {
      const safeDistance = Math.max(0.75, cameraHits[0].distance - 0.35);
      cameraPositionTarget.copy(t).addScaledVector(cameraCollisionDirection, safeDistance);
    }
    if (player.pos.y >= GROUND_Y) {
      cameraPositionTarget.y = Math.max(0.35, cameraPositionTarget.y);
    }
  }
  camera.position.copy(cameraPositionTarget);
  camera.lookAt(cameraLookTarget);
  // `lookAt()` changes the camera quaternion, while Vector3.project() reads
  // camera.matrixWorldInverse. The renderer normally refreshes that matrix
  // later in the frame, but nametags and bubbles are projected before then.
  // Update it now so they follow camera rotation with zero-frame latency.
  camera.updateMatrixWorld(true);

  // This intentionally touches only local materials. Multiplayer snapshots
  // still send position/facing, while each remote player keeps an opaque copy.
  const fade = cam.isFirstPerson
    ? 0
    : THREE.MathUtils.clamp(
      (cam.dist - cam.firstPersonDistance) /
        (cam.transparencyStartDistance - cam.firstPersonDistance),
      0,
      1
    );
  for (const material of avatarLocalMaterials) {
    const bodyPart = material.userData.avatarBodyPart;
    const bodyPartHidden = !avatarEditor.hidden && avatarEditorMode === "world"
      && bodyPart && avatarBodyPartVisibility.get(bodyPart) === false;
    // R15 maps are baked opaque, so this material fade cannot expose the PNG's
    // transparent atlas padding. Keep the fade enabled for a smooth close zoom.
    const opacity = bodyPartHidden ? 0 : material.userData.originalOpacity * fade;
    const transparent = bodyPartHidden || material.userData.originalTransparent || fade < 0.999;
    const depthWrite = bodyPartHidden ? false : (fade < 0.999 ? false : (material.userData.originalDepthWrite ?? true));
    const signature = `${fade > 0.001}:${transparent}:${Math.round(opacity * 1000)}:${depthWrite}:${bodyPartHidden}`;
    material.visible = fade > 0.001 && !bodyPartHidden;
    if (material.userData.visualSignature === signature) continue;
    material.userData.visualSignature = signature;
    material.transparent = transparent;
    material.opacity = opacity;
    material.depthWrite = depthWrite;
    material.needsUpdate = true;
  }

  // Mirror the body fade for the player's own hats/hair. Without this, a
  // zoomed first-person-ish camera would hide the torso/head but leave a solid
  // hat or hair floating over the viewfinder like an opaque blob.
  if (localHatMaterials.length) {
    // Keep accessories visible in 3D World mode so the raycaster can hit them
    // and the user can paint their UVs directly on the live accessory mesh.
    const hideAllHats = false;
    for (const material of localHatMaterials) {
      if (!material) continue;
      const hidden = hideAllHats;
      const opacity = hidden ? 0 : material.userData.originalOpacity * fade;
      const transparent = hidden || material.userData.originalTransparent || fade < 0.999;
      const depthWrite = hidden ? false : (material.userData.originalDepthWrite ?? true);
      const signature = `h${fade > 0.001}:${transparent}:${Math.round(opacity * 1000)}:${depthWrite}:${hidden}`;
      material.visible = fade > 0.001 && !hidden;
      if (material.userData.visualSignature === signature) continue;
      material.userData.visualSignature = signature;
      material.transparent = transparent;
      material.opacity = opacity;
      material.depthWrite = depthWrite;
      material.needsUpdate = true;
    }
  }

  if (player.model && !player.flyMode && (cam.isFirstPerson || cam.shiftLock)) {
    const targetFacing = cam.yaw + Math.PI;
    player.facing = targetFacing;
    player.model.rotation.y = player.facing;
  }
}

function requestShiftLockPointer() {
  // Touch devices orbit by dragging; Pointer Lock can swallow touch input.
  if (document.documentElement.classList.contains("is-mobile")) return;
  if (document.pointerLockElement === renderer.domElement) return;
  if (typeof renderer.domElement.requestPointerLock !== "function") return;
  try {
    const result = renderer.domElement.requestPointerLock();
    result?.catch?.(() => {});
  } catch {
    // Pointer Lock can be unavailable in embedded or restricted previews.
  }
}

function setShiftLock(enabled) {
  if (avatarCameraLocked && enabled) return;
  if (enabled && cam.isFirstPerson && !cam.shiftLock) {
    cam.pitch = -cam.firstPersonPitch;
  } else if (!enabled && cam.isFirstPerson && cam.shiftLock) {
    cam.firstPersonPitch = -cam.pitch;
  }
  cam.shiftLock = enabled;
  document.documentElement.classList.toggle("shift-lock-active", enabled);
  shiftLockToggle?.setAttribute("aria-pressed", String(enabled));
  if (shiftLockToggle) {
    shiftLockToggle.title = enabled ? "Disable ShiftLock" : "Enable ShiftLock";
    shiftLockToggle.setAttribute("aria-label", enabled ? "Disable ShiftLock" : "Enable ShiftLock");
    const stateIcon = shiftLockToggle.querySelector(".shiftlock-toggle-image");
    if (stateIcon) stateIcon.src = enabled ? "uploads/ToggleOn.png" : "uploads/ToggleOff.png";
  }
  if (shiftLockCenterIndicator) {
    shiftLockCenterIndicator.hidden = !enabled || document.documentElement.classList.contains("is-mobile");
  }
  cameraFreeLastX = null;
  cameraFreeLastY = null;
  cameraDragging = false;
  renderer.domElement.style.cursor = "";
  if (enabled) {
    requestShiftLockPointer();
  } else if (!cam.isFirstPerson && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock?.();
  }
}

document.addEventListener("pointerlockchange", () => {
  cameraFreeLastX = null;
  cameraFreeLastY = null;
});

shiftLockToggle?.addEventListener("click", () => {
  setShiftLock(!cam.shiftLock);
});

// ---------------------------------------------------------------------------
// 3D AVATAR PAINTING — raycast the live avatar, then paint its UV texture
// ---------------------------------------------------------------------------
const avatarPaintRaycaster = new THREE.Raycaster();
const avatarPaintNdc = new THREE.Vector2();
const avatarPaintPoint = new THREE.Vector2();
const avatarPaintLastPoint = new THREE.Vector2();
let avatar3DPainting = false;
let avatar3DTextureDirty = false;
let hat3DTextureDirty = false;
let avatar3DPaintTarget = null;
let avatar3DDragMode = false;
let avatar3DDragging = false;
let avatar3DDragLastUv = null;
let hat3DPaintLastUv = null;

function avatarPaintIntersection(event, objects) {
  const rect = renderer.domElement.getBoundingClientRect();
  avatarPaintNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  avatarPaintRaycaster.setFromCamera(avatarPaintNdc, camera);
  return avatarPaintRaycaster.intersectObjects(objects, true)[0] || null;
}

function uvToAvatarCanvas(uv, target = avatarPaintPoint) {
  target.set(
    THREE.MathUtils.clamp(uv.x, 0, 1) * (avatarEditorCanvas.width - 1),
    (activeRigType === "r15"
      ? 1 - THREE.MathUtils.clamp(uv.y, 0, 1)
      : THREE.MathUtils.clamp(uv.y, 0, 1)) * (avatarEditorCanvas.height - 1)
  );
  return target;
}

function paintAvatarUV(uv, previousUv = null, surface = null) {
  if (!uv || !avatarEditorReady) return false;
  const point = uvToAvatarCanvas(uv, avatarPaintPoint);
  if (previousUv) {
    paintAvatarSegment(uvToAvatarCanvas(previousUv, avatarPaintLastPoint), point, surface);
  } else {
    paintAvatarDot(point, surface);
  }
  return true;
}

function getGeometryFace(geometry, faceIndex) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  if (!position || !Number.isInteger(faceIndex) || faceIndex < 0) return null;
  const readVertex = (offset) => index ? index.getX(offset) : offset;
  const start = faceIndex * 3;
  if (start + 2 >= (index ? index.count : position.count)) return null;
  return [readVertex(start), readVertex(start + 1), readVertex(start + 2)];
}

function getAvatarFlatSideSurface(intersection) {
  const object = intersection?.object;
  const geometry = object?.geometry;
  const uvAttribute = geometry?.attributes?.uv;
  const seedVertices = getGeometryFace(geometry, intersection?.faceIndex);
  if (!geometry || !uvAttribute || !seedVertices) return null;

  const position = geometry.attributes.position;
  const index = geometry.index;
  const faceCount = (index ? index.count : position.count) / 3;
  const readVertex = (offset) => index ? index.getX(offset) : offset;
  const faceVertices = (face) => [readVertex(face * 3), readVertex(face * 3 + 1), readVertex(face * 3 + 2)];
  const vertexToFaces = new Map();
  for (let face = 0; face < faceCount; face += 1) {
    for (const vertex of faceVertices(face)) {
      const linked = vertexToFaces.get(vertex) || [];
      linked.push(face);
      vertexToFaces.set(vertex, linked);
    }
  }

  const faceNormal = (face, target = new THREE.Vector3()) => {
    const vertices = faceVertices(face);
    const a = new THREE.Vector3().fromBufferAttribute(position, vertices[0]);
    const b = new THREE.Vector3().fromBufferAttribute(position, vertices[1]);
    const c = new THREE.Vector3().fromBufferAttribute(position, vertices[2]);
    return THREE.Triangle.getNormal(a, b, c, target);
  };
  const seedFace = intersection.faceIndex;
  const seedNormal = faceNormal(seedFace);
  const visited = new Uint8Array(faceCount);
  const stack = [seedFace];
  const sideFaces = [];
  while (stack.length) {
    const face = stack.pop();
    if (visited[face]) continue;
    visited[face] = 1;
    const normal = faceNormal(face);
    // A side is the connected, flat surface under the cursor. This avoids
    // flood-filling every matching color in the atlas.
    if (normal.dot(seedNormal) < 0.985) continue;
    sideFaces.push(face);
    for (const vertex of faceVertices(face)) {
      for (const linkedFace of vertexToFaces.get(vertex) || []) {
        if (!visited[linkedFace]) stack.push(linkedFace);
      }
    }
  }

  return { uvAttribute, faceVertices, faces: sideFaces };
}

function paintAvatarSide(intersection) {
  const surface = getAvatarFlatSideSurface(intersection);
  if (!surface) return false;
  const paintLayer = getAvatarPaintLayer(true);
  const paintContext = paintLayer?.canvas.getContext("2d");
  if (!paintContext) return false;
  paintContext.save();
  paintContext.globalCompositeOperation = "source-over";
  paintContext.fillStyle = avatarBrushColor.value;
  for (const face of surface.faces) {
    const points = getAvatarUvTrianglePoints(surface, face);
    if (!points) continue;
    paintContext.beginPath();
    for (let indexInFace = 0; indexInFace < 3; indexInFace += 1) {
      const point = points[indexInFace];
      if (indexInFace === 0) paintContext.moveTo(point.x, point.y);
      else paintContext.lineTo(point.x, point.y);
    }
    paintContext.closePath();
    paintContext.fill();
  }
  paintContext.restore();
  updateAvatarCanvasTexture();
  return surface.faces.length > 0;
}

function findHatIdFromIntersection(intersection) {
  let object = intersection?.object || null;
  while (object) {
    if (object.userData?.hatGroup && object.userData.hatId) return object.userData.hatId;
    object = object.parent;
  }
  return null;
}

function uvToHatCanvas(uv, target = new THREE.Vector2()) {
  // Hat textures use flipY=true to preserve the authored OBJ orientation, so
  // convert the raycast UV back to the source canvas row before painting.
  target.set(
    THREE.MathUtils.clamp(uv.x, 0, 1) * (hairCanvas.width - 1),
    (1 - THREE.MathUtils.clamp(uv.y, 0, 1)) * (hairCanvas.height - 1)
  );
  return target;
}

function getHatUvTrianglePoints(surface, face) {
  const vertices = surface.faceVertices(face);
  const uvs = vertices.map((vertex) => new THREE.Vector2().fromBufferAttribute(surface.uvAttribute, vertex));
  const uValues = uvs.map((uv) => uv.x);
  const vValues = uvs.map((uv) => uv.y);
  if (Math.max(...uValues) - Math.min(...uValues) > 0.5 ||
      Math.max(...vValues) - Math.min(...vValues) > 0.5) return null;
  return uvs.map((uv) => uvToHatCanvas(uv));
}

function clipHatUvSurface(context, surface) {
  if (!surface?.faces?.length || !surface.uvAttribute) return false;
  context.beginPath();
  for (const face of surface.faces) {
    const points = getHatUvTrianglePoints(surface, face);
    if (!points) continue;
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
  }
  context.clip();
  return true;
}

function paintHatSegment(hatId, fromUv, toUv, surface = null) {
  const hat = hatItemMap.get(hatId);
  if (!hat || hatPaintTargetId !== hatId || hatPaintReadyId !== hatId) return false;
  const paintContext = activeHatPaintLayer()?.context;
  if (!paintContext) return false;
  const from = uvToHatCanvas(fromUv);
  const to = uvToHatCanvas(toUv);
  paintContext.save();
  if (avatarEditorTool === "eraser") {
    paintContext.globalCompositeOperation = "destination-out";
  } else {
    paintContext.globalCompositeOperation = "source-over";
    paintContext.strokeStyle = avatarBrushColor.value;
  }
  paintContext.lineWidth = Number(avatarBrushSize.value);
  paintContext.lineCap = "round";
  paintContext.lineJoin = "round";
  clipHatUvSurface(paintContext, surface);
  paintContext.beginPath();
  paintContext.moveTo(from.x, from.y);
  paintContext.lineTo(to.x, to.y);
  paintContext.stroke();
  paintContext.restore();
  renderHatPaintLayers();
  refreshHairTexture();
  rebuildLocalHats();
  return true;
}

function paintHatSide(intersection, hatId) {
  const surface = getAvatarFlatSideSurface(intersection);
  if (!surface || hatPaintTargetId !== hatId || hatPaintReadyId !== hatId) return false;
  const paintContext = activeHatPaintLayer()?.context;
  if (!paintContext) return false;
  paintContext.save();
  paintContext.globalCompositeOperation = avatarEditorTool === "eraser" ? "destination-out" : "source-over";
  paintContext.fillStyle = avatarBrushColor.value;
  for (const face of surface.faces) {
    const points = getHatUvTrianglePoints(surface, face);
    if (!points) continue;
    paintContext.beginPath();
    points.forEach((point, index) => {
      if (index === 0) paintContext.moveTo(point.x, point.y);
      else paintContext.lineTo(point.x, point.y);
    });
    paintContext.closePath();
    paintContext.fill();
  }
  paintContext.restore();
  renderHatPaintLayers();
  refreshHairTexture();
  rebuildLocalHats();
  return surface.faces.length > 0;
}

function paintWorldSide(intersection) {
  const mesh = intersection?.object;
  if (!mesh?.userData.paintableSides || !Array.isArray(mesh.material)) return false;
  const geometry = mesh.geometry;
  const offset = (intersection.faceIndex || 0) * 3;
  const group = geometry.groups.find((candidate) => (
    offset >= candidate.start && offset < candidate.start + candidate.count
  ));
  const material = mesh.material[group?.materialIndex ?? 0];
  if (!material) return false;
  material.color.set(avatarBrushColor.value);
  material.needsUpdate = true;
  return true;
}

function setAvatar3DDragMode(enabled) {
  avatar3DDragMode = Boolean(enabled);
  avatar3DDragModeButton.setAttribute("aria-pressed", String(avatar3DDragMode));
  avatar3DDragModeButton.classList.toggle("active", avatar3DDragMode);
  avatar3DDragModeButton.textContent = avatar3DDragMode ? "3D drag mode: On" : "3D drag mode";
  if (avatar3DDragMode) {
    setAvatarEditorStatus("3D drag mode • select an image or shape layer, then drag it on the avatar");
  }
}

function dragAvatarLayerAtPointer(intersection) {
  const layer = getSelectedAvatarLayer();
  if (!layer || layer.kind === "paint" || !intersection?.uv) return false;
  const currentUv = intersection.uv;
  if (!avatar3DDragging || !avatar3DDragLastUv) {
    avatar3DDragLastUv = currentUv.clone();
    avatar3DDragging = true;
    return true;
  }
  const dx = (currentUv.x - avatar3DDragLastUv.x) * avatarEditorCanvas.width;
  const dy = (currentUv.y - avatar3DDragLastUv.y) * avatarEditorCanvas.height;
  layer.x += dx;
  layer.y += dy;
  avatar3DDragLastUv.copy(currentUv);
  updateAvatarCanvasTexture();
  avatar3DTextureDirty = true;
  return true;
}

function paint3DAtPointer(event) {
  if (!avatarEditorReady || avatarEditorMode !== "world") return null;
  const avatarHit = player.model
    ? avatarPaintIntersection(event, [player.model])
    : null;
  if (avatarHit) {
    const hitHatId = findHatIdFromIntersection(avatarHit);
    if (hitHatId) {
      const hat = hatItemMap.get(hitHatId);
      if (!hat) return null;
      if (avatar3DDragMode || avatarEditorTool === "select" || avatarEditorTool === "shape") return null;
      if (hatPaintTargetId !== hitHatId || hatPaintReadyId !== hitHatId) {
        if (hatPaintTargetId !== hitHatId) selectHatPaintTarget(hat);
        return "hat-select";
      }
      if (avatarEditorTool === "bucket") {
        if (paintHatSide(avatarHit, hitHatId)) {
          hat3DTextureDirty = true;
          avatar3DPaintTarget = hitHatId;
          return "hat-side";
        }
        return null;
      }
      if (!avatarHit.uv) return null;
      const previous = avatar3DPainting && avatar3DPaintTarget === hitHatId && hat3DPaintLastUv &&
        hat3DPaintLastUv.distanceTo(avatarHit.uv) <= 0.22
        ? hat3DPaintLastUv
        : null;
      paintHatSegment(hitHatId, previous || avatarHit.uv, avatarHit.uv);
      hat3DPaintLastUv = avatarHit.uv.clone();
      hat3DTextureDirty = true;
      avatar3DPaintTarget = hitHatId;
      return "hat-brush";
    }
    if (avatar3DDragMode) {
      return dragAvatarLayerAtPointer(avatarHit) ? "avatar-drag" : null;
    }
    if (avatarEditorTool === "select" || avatarEditorTool === "shape") return null;
    if (avatarEditorTool === "bucket") {
      return paintAvatarSide(avatarHit) ? "avatar-side" : null;
    }
    if (!avatarHit.uv) return null;
    const uvDistance = avatarPaintLastPoint.distanceTo(avatarHit.uv);
    // Paint the actual UV hit instead of clipping to the current triangle.
    // The raycast already identifies every avatar part; a triangle-only mask
    // made the brush appear to work on just one face of the model. The UV
    // distance guard still prevents jumps between atlas islands from becoming
    // giant diagonal streaks.
    const previous = avatar3DPainting &&
      uvDistance <= 0.22
      ? avatarPaintLastPoint
      : null;
    paintAvatarUV(avatarHit.uv, previous);
    avatarPaintLastPoint.copy(avatarHit.uv);
    avatar3DTextureDirty = true;
    avatar3DPaintTarget = "avatar";
    return "avatar-brush";
  }

  const worldHit = avatarPaintIntersection(event, [ground, ...bricks]);
  if (worldHit) {
    if (avatarEditorTool === "bucket" && paintWorldSide(worldHit)) return "world-side";
  }
  return null;
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || avatarEditor.hidden || avatarEditorMode !== "world") return;
  const result = paint3DAtPointer(event);
  if (!result) return;
  event.preventDefault();
  if (result === "avatar-drag") {
    renderer.domElement.setPointerCapture(event.pointerId);
    return;
  }
  if (result === "avatar-brush") {
    avatar3DPainting = true;
    avatar3DTextureDirty = true;
    renderer.domElement.setPointerCapture(event.pointerId);
  } else if (result === "hat-brush") {
    avatar3DPainting = true;
    hat3DTextureDirty = true;
    renderer.domElement.setPointerCapture(event.pointerId);
  } else {
    if (result === "avatar-side") recordAvatarHistory();
    if (result === "hat-side") publishHairTexture();
    setAvatarEditorStatus(
      result === "world-side" ? "World side painted" :
        result === "hat-side" ? "Hat side painted" :
          result === "hat-select" ? "Hat selected — paint it again to draw" : "Avatar side painted"
    );
  }
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!avatar3DPainting && !avatar3DDragging) return;
  event.preventDefault();
  paint3DAtPointer(event);
});

function stopAvatar3DPainting(event) {
  if (avatar3DDragging) {
    avatar3DDragging = false;
    avatar3DDragLastUv = null;
    if (avatar3DTextureDirty) recordAvatarHistory();
    avatar3DTextureDirty = false;
    setAvatarEditorStatus("3D layer moved");
    if (event?.pointerId !== undefined && renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    return;
  }
  if (!avatar3DPainting) return;
  avatar3DPainting = false;
  if (avatar3DTextureDirty && avatar3DPaintTarget === "avatar") recordAvatarHistory();
  if (hat3DTextureDirty && typeof avatar3DPaintTarget === "string" && avatar3DPaintTarget !== "avatar") {
    publishHairTexture();
  }
  avatar3DTextureDirty = false;
  hat3DTextureDirty = false;
  hat3DPaintLastUv = null;
  setAvatarEditorStatus(avatar3DPaintTarget === "avatar" ? "3D stroke painted" : "Hat stroke painted");
  avatar3DPaintTarget = null;
  if (event?.pointerId !== undefined && renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
}

renderer.domElement.addEventListener("pointerup", stopAvatar3DPainting);
renderer.domElement.addEventListener("pointercancel", stopAvatar3DPainting);

let cameraDragging = false;
let cameraLastX = 0;
let cameraLastY = 0;
let cameraFreeLastX = null;
let cameraFreeLastY = null;
const mobileCameraPointers = new Map();
let mobilePinchDistance = null;

function updateMobilePinchZoom() {
  if (mobileCameraPointers.size < 2) return;
  const [first, second] = [...mobileCameraPointers.values()];
  const distance = Math.hypot(second.x - first.x, second.y - first.y);
  if (distance < 1) return;
  if (mobilePinchDistance !== null) {
    cam.targetDist = THREE.MathUtils.clamp(
      cam.targetDist * (mobilePinchDistance / distance),
      cam.minDist,
      cam.maxDist
    );
  }
  mobilePinchDistance = distance;
}

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (avatarCameraLocked) return;
  const mobilePrimaryDrag = document.documentElement.classList.contains("is-mobile") && e.button === 0;
  if (mobilePrimaryDrag && e.pointerType === "touch") {
    mobileCameraPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mobileCameraPointers.size >= 2) {
      const [first, second] = [...mobileCameraPointers.values()];
      mobilePinchDistance = Math.hypot(second.x - first.x, second.y - first.y);
      cameraDragging = false;
      return;
    }
  }
  if (cam.shiftLock && !mobilePrimaryDrag) {
    requestShiftLockPointer();
    return;
  }
  if (e.button !== 2 && !mobilePrimaryDrag) return;
  e.preventDefault();
  cameraDragging = true;
  cameraLastX = e.clientX;
  cameraLastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
  renderer.domElement.style.cursor = "grabbing";
});

renderer.domElement.addEventListener("pointermove", (e) => {
  if (avatarCameraLocked) return;
  if (document.documentElement.classList.contains("is-mobile") && e.pointerType === "touch") {
    const pointer = mobileCameraPointers.get(e.pointerId);
    if (pointer) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
    if (mobileCameraPointers.size >= 2) {
      updateMobilePinchZoom();
      cameraDragging = false;
      return;
    }
  }

  if (cameraDragging) {
    cam.yaw -= (e.clientX - cameraLastX) * 0.008;
    cam.targetYaw = cam.yaw;
    const firstPersonCamera = cam.isFirstPerson && !cam.shiftLock;
    const pitchKey = firstPersonCamera ? "firstPersonPitch" : "pitch";
    const verticalDirection = firstPersonCamera ? -1 : 1;
    cam[pitchKey] = THREE.MathUtils.clamp(
      cam[pitchKey] + (e.clientY - cameraLastY) * 0.006 * verticalDirection,
      -1.05,
      1.15
    );
    cameraLastX = e.clientX;
    cameraLastY = e.clientY;
    return;
  }

  if (cam.shiftLock) {
    cameraFreeLastX = null;
    cameraFreeLastY = null;
    if (avatarEditor.hidden === false || e.pointerType !== "mouse") return;
    if (document.pointerLockElement !== renderer.domElement) return;
    cam.yaw -= e.movementX * 0.008;
    cam.targetYaw = cam.yaw;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.006, -1.05, 1.15);
    return;
  }

  if (cam.isFirstPerson) {
    cameraFreeLastX = null;
    cameraFreeLastY = null;
    if (avatarEditor.hidden === false || e.pointerType !== "mouse") return;
    cam.yaw -= e.movementX * 0.008;
    cam.targetYaw = cam.yaw;
    cam.firstPersonPitch = THREE.MathUtils.clamp(
      cam.firstPersonPitch - e.movementY * 0.006,
      -1.05,
      1.15
    );
    return;
  }

  // Third person only rotates while the right mouse button is held, which is
  // handled by the cameraDragging branch above.
  cameraFreeLastX = null;
  cameraFreeLastY = null;
});

function stopCameraDrag(e) {
  if (!cameraDragging) return;
  cameraDragging = false;
  if (e?.pointerId !== undefined && renderer.domElement.hasPointerCapture(e.pointerId)) {
    renderer.domElement.releasePointerCapture(e.pointerId);
  }
  renderer.domElement.style.cursor = "";
}

renderer.domElement.addEventListener("pointerup", stopCameraDrag);
renderer.domElement.addEventListener("pointercancel", stopCameraDrag);
function releaseMobileCameraPointer(e) {
  if (e.pointerType !== "touch") return;
  mobileCameraPointers.delete(e.pointerId);
  if (mobileCameraPointers.size < 2) {
    mobilePinchDistance = null;
    const remaining = mobileCameraPointers.values().next().value;
    if (remaining) {
      cameraDragging = true;
      cameraLastX = remaining.x;
      cameraLastY = remaining.y;
    }
  }
}
renderer.domElement.addEventListener("pointerup", releaseMobileCameraPointer);
renderer.domElement.addEventListener("pointercancel", releaseMobileCameraPointer);
renderer.domElement.addEventListener("pointerdown", () => {
  if (!document.documentElement.classList.contains("is-mobile") && (cam.shiftLock || cam.isFirstPerson)) {
    requestShiftLockPointer();
  }
});

window.addEventListener("keydown", (e) => {
  if (document.activeElement === chatInput) return;
  if (e.target.closest?.("#avatar-editor")) return;
  if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) {
    e.preventDefault();
    setShiftLock(!cam.shiftLock);
    return;
  }
  if (e.code === "Slash" && !e.repeat) {
    e.preventDefault();
    openChat();
    return;
  }
  if (e.code === "KeyI" && !cam.shiftLock && cam.targetDist <= cam.firstPersonDistance * 1.2) {
    requestShiftLockPointer();
  }
  player.keys[e.code] = true;
});
window.addEventListener("keyup", (e) => {
  if (document.activeElement === chatInput) return;
  player.keys[e.code] = false;
});
window.addEventListener("keydown", (e) => {
  if (document.activeElement === chatInput) return;
  if (e.target.closest?.("#avatar-editor")) return;
  if (e.repeat) return;
  // Third person keeps the requested inverted direction. Shift Lock and
  // first person use the normal direction instead.
  const invertThirdPersonControls = !cam.isFirstPerson && !cam.shiftLock;
  if (e.code === "Period" || e.key === ">") {
    e.preventDefault();
    rotateCameraByStep(invertThirdPersonControls ? 1 : -1);
  } else if (e.code === "Comma" || e.key === "<") {
    e.preventDefault();
    rotateCameraByStep(invertThirdPersonControls ? -1 : 1);
  } else if (e.code === "Backspace") {
    // While holding the burger, drop it into the world (with collision) so
    // another player can pick it up.
    e.preventDefault();
    dropEquippedBurger();
  }
});
window.addEventListener(
  "wheel",
  (e) => {
    if (avatarCameraLocked) return;
    cam.targetDist = Math.max(
      cam.minDist,
      Math.min(cam.maxDist, cam.targetDist * (e.deltaY > 0 ? 1.18 : 0.82))
    );
    if (cam.targetDist <= cam.firstPersonDistance && !cam.shiftLock) {
      requestShiftLockPointer();
    } else if (cam.targetDist > cam.firstPersonDistance && !cam.shiftLock) {
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
  },
  { passive: true }
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  syncNametagResolution();
});

// ---------------------------------------------------------------------------
// 6. LOOP
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let lastRenderAt = 0;
// The home page keeps this iframe mounted, but it must not join the room
// while hidden. A hidden join can remain pending and make the real
// enter/reconnect attempt return early as if another connection were active.
// Standalone game.html still connects immediately.
  if (window.parent === window) showUsernameScreen();
function tick() {
  requestAnimationFrame(tick);
  updatePerformanceHud();
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = Date.now();
  // Remote transforms must be current before local collision resolution uses
  // their colliders; updating them afterward caused a visible one-frame lag.
  updateRemotePlayers(dt);
  updatePlayer(dt);
  updateDroppedBurgers(dt);
  updateCamera(dt);
  updateAudioListener();
  if (mixer && !avatarAnimationLocked && !player.flyMode) {
    mixer.update(dt);
    if (activeToolAnimation) lockToolBoneRotations(modelRoot, activeToolAnimation);
  }
  if (activeRigType === "r15" && modelRoot && !avatarAnimationLocked && !player.flyMode) {
    const finished = updateR15Animation(modelRoot, dt);
    if (finished && activeLocalEmote?.r15) stopLocalEmote(true);
  }
  updateLocalEmote(dt);
  syncLocalCollisionProxy();
  updateNametags();
  updateChatBubbles();
  sendMultiplayerState(Date.now());
  const renderNow = performance.now();
  const fps = Number(fpsLimit.value) || 0;
  if (!fps || renderNow - lastRenderAt >= 1000 / fps) {
    composer.render();
    lastRenderAt = renderNow;
  }
  if (pendingScale) scalePlayerToStuds();
  renderHatPreview();
}

tick();
