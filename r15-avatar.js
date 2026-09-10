import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { FBXLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js";

const MAIN_BONES = [
  "HumanoidRootPart", "LowerTorso", "UpperTorso", "Head",
  "LeftUpperArm", "LeftLowerArm", "LeftHand", "RightUpperArm", "RightLowerArm", "RightHand",
  "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot",
];
const R15_BODY_YAW_CORRECTION = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI
);

function loadTexture(url) {
  return new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));
}

// Roblox R15 body parts are solid geometry. Some avatar PNGs still contain
// transparent atlas padding, which makes the mesh look sliced or disappear
// when the camera fades it. Bake the image onto an opaque canvas once, while
// keeping the normal material opacity available for the first-person fade.
export function makeR15TextureOpaque(texture) {
  const image = texture?.image;
  const width = image?.naturalWidth || image?.videoWidth || image?.width;
  const height = image?.naturalHeight || image?.videoHeight || image?.height;
  if (!texture || !image || !width || !height || typeof document === "undefined") return texture;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return texture;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const opaque = new THREE.CanvasTexture(canvas);
  opaque.colorSpace = texture.colorSpace || THREE.SRGBColorSpace;
  opaque.flipY = texture.flipY;
  opaque.wrapS = texture.wrapS;
  opaque.wrapT = texture.wrapT;
  opaque.minFilter = texture.minFilter;
  opaque.magFilter = texture.magFilter;
  opaque.anisotropy = texture.anisotropy;
  opaque.generateMipmaps = texture.generateMipmaps;
  opaque.needsUpdate = true;
  texture.dispose();
  return opaque;
}

function prepareTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  // This Roblox atlas is authored in the canvas orientation used by the FBX
  // UVs. Keep the vertical flip enabled so torso UVs do not land on the
  // transparent padding around the atlas islands.
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return makeR15TextureOpaque(texture);
}

function collectBones(root) {
  const bones = {};
  root.traverse((object) => {
    if (object.isBone && MAIN_BONES.includes(object.name)) bones[object.name] = object;
  });
  return bones;
}

function correctBodyGeometryOrientation(mesh) {
  const sourceGeometry = mesh?.geometry;
  if (!sourceGeometry) return;
  const geometry = sourceGeometry.clone();
  geometry.computeBoundingBox();
  const center = geometry.boundingBox?.getCenter(new THREE.Vector3());
  if (!center) return;
  // The FBX stores each part's lateral bind-pose offset in the geometry. A
  // plain rotateY() would rotate that offset around the bone pivot, moving
  // limbs and breaking the animation. Rotate around the part's own center so
  // only its front/back orientation changes.
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.rotateY(Math.PI);
  geometry.translate(center.x, center.y, center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
}

function captureBindPose(root) {
  const bones = root.userData.r15Bones || collectBones(root);
  root.userData.r15Bones = bones;
  const rootWorldQuaternion = new THREE.Quaternion();
  root.getWorldQuaternion(rootWorldQuaternion);
  root.userData.r15BindPose = new Map(
    Object.entries(bones).map(([name, bone]) => {
      const parentWorldQuaternion = new THREE.Quaternion();
      bone.parent?.getWorldQuaternion(parentWorldQuaternion);
      const parentQuaternion = rootWorldQuaternion.clone()
        .invert()
        .multiply(parentWorldQuaternion)
        .normalize();
      return [name, {
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        parentQuaternion,
        parentInverseQuaternion: parentQuaternion.clone().invert(),
      }];
    })
  );
}

function applyTexture(root, texture) {
  root.userData.r15Texture = texture;
  root.userData.r15TextureImage = texture.image;
  root.userData.r15TextureMaterials = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const sources = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sources.map((source) => {
      // The FBX material is only an import container. Rebuild it as the same
      // low-specular Phong/Plastic material used by R6 so R15 does not bring
      // along a different PBR, emissive, or environment-light response.
      const material = new THREE.MeshPhongMaterial({
        map: texture,
        color: 0xffffff,
        specular: new THREE.Color(0.1, 0.1, 0.1),
        shininess: 8,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        alphaTest: 0,
        depthWrite: true,
      });
      material.vertexColors = false;
      // The body is made from solid rigid meshes. Ignore alpha flags exported
      // by the FBX so the skin cannot disappear while the texture is sampled.
      material.transparent = false;
      material.alphaTest = 0;
      material.side = THREE.DoubleSide;
      material.depthWrite = true;
      material.needsUpdate = true;
      material.name = `R15_${object.name}`;
      material.userData = {
        ...(source?.userData || {}),
        avatarBodyPart: bodyPartFromBoneName(object.name),
        avatarBaseMap: texture,
        originalOpacity: 1,
        originalTransparent: false,
        originalDepthWrite: source?.depthWrite ?? true,
      };
      root.userData.r15TextureMaterials.push(material);
      return material;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
    object.visible = true;
    object.frustumCulled = false;
    object.castShadow = true;
    object.receiveShadow = false;
  });
}

function bindRigidPartsToBones(root) {
  // The supplied FBX contains a real R15 bone hierarchy and rigid body-part
  // meshes. The mesh vertices are already authored in the avatar's shared
  // bind-pose space (the mesh object transforms themselves are at the
  // imported root). Preserve that exact world transform when parenting each
  // piece to its matching bone; moving it again to a bone midpoint shifts
  // every segment away from its joint.
  root.updateMatrixWorld(true);
  const bones = root.userData.r15Bones || collectBones(root);
  const parts = [];
  root.traverse((object) => {
    if (object.isMesh && bones[object.name]) parts.push(object);
  });
  for (const part of parts) {
    part.matrixAutoUpdate = true;
    bones[part.name].attach(part);
    // Fix only the visual mesh orientation. The animation clips already use
    // the correct bone frame, so rotating the root or a bone would turn the
    // whole animated avatar backwards.
    if (part.name !== "Head") {
      correctBodyGeometryOrientation(part);
    }
  }
  root.updateMatrixWorld(true);
}

function captureR15CameraHeadOffset(root) {
  const head = root.userData.r15Bones?.Head;
  if (!head) return;
  const center = new THREE.Vector3();
  head.getWorldPosition(center);
  const end = root.getObjectByName("Head_end");
  if (end) {
    const endPosition = new THREE.Vector3();
    end.getWorldPosition(endPosition);
    center.lerp(endPosition, 0.5);
  }
  root.worldToLocal(center);
  root.userData.r15CameraHeadOffset = center;
}

function bodyPartFromBoneName(name) {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("head")) return "head";
  if (normalized.includes("leftupperarm") || normalized.includes("leftlowerarm") || normalized.includes("lefthand")) return "leftArm";
  if (normalized.includes("rightupperarm") || normalized.includes("rightlowerarm") || normalized.includes("righthand")) return "rightArm";
  if (normalized.includes("leftupperleg") || normalized.includes("leftlowerleg") || normalized.includes("leftfoot")) return "leftLeg";
  if (normalized.includes("rightupperleg") || normalized.includes("rightlowerleg") || normalized.includes("rightfoot")) return "rightLeg";
  return "torso";
}

function prepareRoot(root, texture) {
  root.name = "R15Avatar";
  root.userData.r15 = true;
  applyTexture(root, texture);
  root.userData.r15Bones = collectBones(root);
  bindRigidPartsToBones(root);
  // Keep the established head correction, but leave the root and animation
  // bones in their authored frame. The body-part meshes are corrected locally
  // in bindRigidPartsToBones above.
  const headBone = root.userData.r15Bones.Head;
  if (headBone) headBone.quaternion.multiply(R15_BODY_YAW_CORRECTION).normalize();
  root.updateMatrixWorld(true);
  // Camera target for the local player: follow the avatar's actual head
  // anchor, but keep this bind-pose offset while animations are running.
  captureR15CameraHeadOffset(root);
  captureBindPose(root);
  root.userData.r15Animation = { name: "Idle", time: 0, data: null };
  return root;
}

export async function loadR15Avatar(modelUrl, textureUrl) {
  const [root, texture] = await Promise.all([
    new Promise((resolve, reject) => new FBXLoader().load(modelUrl, resolve, undefined, reject)),
    loadTexture(textureUrl).then(prepareTexture),
  ]);
  return prepareRoot(root, texture);
}

export function cloneR15Avatar(root) {
  const clone = SkeletonUtils.clone(root);
  clone.name = "R15Avatar";
  clone.userData.r15 = true;
  clone.userData.r15Bones = collectBones(clone);
  // SkeletonUtils copies the current transforms. Restore the source bind
  // transforms before capturing the clone's own parent-frame conversion, so a
  // remote created while the local R15 is walking never starts invisible or
  // with a bent pose baked into its bind state.
  const sourceBind = root.userData.r15BindPose;
  if (sourceBind) {
    for (const [name, pose] of sourceBind) {
      const bone = clone.userData.r15Bones[name];
      if (!bone) continue;
      bone.position.copy(pose.position);
      bone.quaternion.copy(pose.quaternion);
    }
    clone.updateMatrixWorld(true);
  }
  captureBindPose(clone);
  clone.userData.r15AnimationData = root.userData.r15AnimationData || null;
  clone.userData.r15Animation = { name: "Idle", time: 0, data: root.userData.r15Animation?.data || null };
  clone.userData.r15TextureMaterials = [];
  clone.traverse((object) => {
    if (object.isMesh) {
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      clone.userData.r15TextureMaterials.push(...materials);
    }
  });
  return clone;
}

export function installR15AnimationData(root, data) {
  if (!root?.userData?.r15) return;
  root.userData.r15AnimationData = data || {};
  if (root.userData.r15Animation) root.userData.r15Animation.data = data || {};
}

export function restoreR15Texture(root) {
  const texture = root?.userData?.r15Texture;
  if (!texture) return false;
  texture.flipY = true;
  texture.needsUpdate = true;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.userData?.avatarBodyPart) continue;
      setR15BodyTextureMaterial(material, texture);
    }
  });
  return true;
}

export function setR15BodyTextureMaterial(material, texture) {
  if (!material?.userData?.avatarBodyPart || !texture) return false;
  // R15 body textures are always opaque. Ignore alpha from the PNG and let
  // the camera/body visibility system hide the whole material when needed.
  material.map = texture;
  material.color.set(0xffffff);
  material.opacity = 1;
  material.transparent = false;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.visible = true;
  material.needsUpdate = true;
  return true;
}

function restoreBindPose(root) {
  const bones = root?.userData?.r15Bones || {};
  const bind = root?.userData?.r15BindPose;
  if (!bind) return;
  for (const [name, pose] of bind) {
    const bone = bones[name];
    if (!bone) continue;
    bone.position.copy(pose.position);
    bone.quaternion.copy(pose.quaternion);
  }
}

function identityPose() {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
}

function poseForEntry(entry) {
  if (!entry) return identityPose();
  return {
    position: new THREE.Vector3(Number(entry[1]) || 0, Number(entry[2]) || 0, Number(entry[3]) || 0),
    quaternion: new THREE.Quaternion(
      Number(entry[4]) || 0,
      Number(entry[5]) || 0,
      Number(entry[6]) || 0,
      Number(entry[7]) || 1
    ).normalize(),
  };
}

function animationShouldLoop(name) {
  return ["Idle", "Walk", "Run", "Fall"].includes(name) || String(name || "").startsWith("Dance");
}

function keepTorsoUprightForLocomotion(poseMap, animationName) {
  if (!["Walk", "Run", "Jump", "Fall"].includes(animationName)) return;
  // These imported locomotion clips contain a large forward/side tilt in the
  // torso frames. It was authored for a different R15 joint frame than this
  // rigid-part FBX, so applying it directly makes the whole avatar walk bent.
  // Keep only the vertical yaw; limbs and their timing remain untouched.
  for (const boneName of ["HumanoidRootPart", "LowerTorso", "UpperTorso", "Head"]) {
    const pose = poseMap.get(boneName);
    if (!pose) continue;
    const euler = new THREE.Euler().setFromQuaternion(pose.quaternion, "YXZ");
    pose.quaternion.setFromEuler(new THREE.Euler(0, euler.y, 0, "YXZ"));
  }
}

function sampleAnimation(asset, time, looping = asset?.loop === true, animationName = "") {
  const frames = asset?.frames || [];
  const result = new Map();
  if (!frames.length) return result;
  const duration = Math.max(0.001, Number(asset.duration) || Number(frames[frames.length - 1][0]) || 0.001);
  const sampleTime = looping
    ? ((Number(time) || 0) % duration + duration) % duration
    : THREE.MathUtils.clamp(Number(time) || 0, 0, duration);
  let index = 0;
  while (index + 1 < frames.length && Number(frames[index + 1][0]) <= sampleTime) index += 1;
  const current = frames[index];
  const atEnd = index === frames.length - 1;
  const next = atEnd && looping ? frames[0] : frames[Math.min(index + 1, frames.length - 1)];
  const currentTime = Number(current[0]) || 0;
  const nextTime = atEnd && looping ? (Number(next[0]) || 0) + duration : Number(next[0]) || currentTime;
  const span = Math.max(0.00001, nextTime - currentTime);
  const alpha = THREE.MathUtils.clamp((sampleTime - currentTime) / span, 0, 1);
  const currentEntries = new Map((current[1] || []).map((entry) => [entry[0], entry]));
  const nextEntries = new Map((next[1] || []).map((entry) => [entry[0], entry]));
  for (const name of MAIN_BONES) {
    const from = poseForEntry(currentEntries.get(name));
    const to = poseForEntry(nextEntries.get(name) || currentEntries.get(name));
    result.set(name, {
      position: from.position.lerp(to.position, alpha),
      quaternion: from.quaternion.slerp(to.quaternion, alpha).normalize(),
    });
  }
  keepTorsoUprightForLocomotion(result, animationName);
  return result;
}

function applyPose(root, poseMap) {
  const bones = root.userData.r15Bones || {};
  const bind = root.userData.r15BindPose || new Map();
  for (const name of MAIN_BONES) {
    const bone = bones[name];
    if (!bone) continue;
    const pose = poseMap.get(name) || identityPose();
    const original = bind.get(name);
    // R15 KeyframeSequence poses are Motor6D.Transform offsets in the bone's
    // local frame. Conjugating them with the imported parent's world frame
    // mixes the FBX bind roll into every keyframe, which makes the torso lean
    // and sends limbs to the wrong side while hats still look correct.
    bone.position.copy(original?.position || new THREE.Vector3()).add(pose.position);
    bone.quaternion.copy(original?.quaternion || new THREE.Quaternion()).multiply(pose.quaternion).normalize();
  }
  root.updateMatrixWorld(true);
  root.traverse((object) => { if (object.isSkinnedMesh) object.skeleton.update(); });
}

function applyR15Animation(root) {
  const state = root.userData.r15Animation;
  const asset = state?.data?.[state.name];
  if (!asset?.frames?.length) return;
  const targetPose = sampleAnimation(asset, state.time, animationShouldLoop(state.name), state.name);
  if (state.transition) {
    state.transition.elapsed += Math.max(0, state.delta || 0);
    const alpha = THREE.MathUtils.clamp(
      state.transition.elapsed / state.transition.duration,
      0,
      1
    );
    const blended = new Map();
    for (const name of MAIN_BONES) {
      const from = state.transition.from.get(name) || identityPose();
      const to = targetPose.get(name) || identityPose();
      blended.set(name, {
        position: from.position.clone().lerp(to.position, alpha),
        quaternion: from.quaternion.clone().slerp(to.quaternion, alpha).normalize(),
      });
    }
    applyPose(root, blended);
    state.delta = 0;
    if (alpha >= 1) state.transition = null;
    return;
  }
  applyPose(root, targetPose);
}

export function setR15Animation(root, name, time = 0, data = null, options = {}) {
  if (!root?.userData?.r15) return false;
  const animations = data || root.userData.r15AnimationData || {};
  const asset = animations[name] || animations.Idle;
  if (!asset?.frames?.length) return false;
  const nextName = animations[name] ? name : "Idle";
  const previous = root.userData.r15Animation;
  if (previous?.name === nextName && previous.data === animations) {
    // Snapshots arrive more often than animation frames. Keep the timeline
    // alive instead of restarting a remote avatar on every network update.
    if (options.immediate) {
      previous.time = Math.max(0, time);
      previous.transition = null;
      previous.delta = 0;
      applyR15Animation(root);
    }
    return true;
  }
  const from = previous?.data?.[previous.name]
    ? sampleAnimation(previous.data[previous.name], previous.time, animationShouldLoop(previous.name), previous.name)
    : null;
  root.userData.r15Animation = {
    name: nextName,
    time: Math.max(0, time),
    data: animations,
    delta: 0,
    transition: !options.immediate && from
      ? { from, elapsed: 0, duration: 0.2 }
      : null,
  };
  applyR15Animation(root);
  return true;
}

export function updateR15Animation(root, dt) {
  const state = root?.userData?.r15Animation;
  const asset = state?.data?.[state.name];
  if (!asset?.frames?.length) return false;
  const duration = Math.max(0.001, Number(asset.duration) || 0.001);
  state.time += Math.max(0, dt);
  state.delta = Math.max(0, dt);
  const looping = animationShouldLoop(state.name);
  const finished = !looping && state.time >= duration;
  if (looping) state.time %= duration;
  else state.time = Math.min(state.time, duration);
  applyR15Animation(root);
  return finished;
}

export function restoreR15Animation(root) {
  restoreBindPose(root);
  root?.updateMatrixWorld(true);
  root?.traverse((object) => { if (object.isSkinnedMesh) object.skeleton.update(); });
}

export function getR15BodyMaterials(root) {
  return root?.userData?.r15TextureMaterials || [];
}
