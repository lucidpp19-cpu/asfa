const players = new Map();
let nextGuestNumber = 1;
let gameCommentMigrationDone = false;
export const schema = `
  CREATE TABLE IF NOT EXISTS game_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    parent_comment_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS game_comment_pins (
    game_id TEXT NOT NULL,
    comment_id INTEGER NOT NULL,
    pinned_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (game_id, comment_id)
  );
  CREATE INDEX IF NOT EXISTS game_comments_game_created
    ON game_comments (game_id, created_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS game_comment_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    comment_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS game_comment_audit_comment
    ON game_comment_audit (game_id, comment_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS game_votes (
    game_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    vote_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (game_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS game_votes_game ON game_votes (game_id);
  CREATE TABLE IF NOT EXISTS game_favorites (
    game_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (game_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS game_favorites_game ON game_favorites (game_id);
`;
const MAX_SPEED = 35;
const VOID_RESET_Y = -20;
const STALE_PLAYER_MS = 30000;
// A player remains in the room while its transport is alive, even when it is
// AFK or the browser throttles its background timers. Disconnects are handled
// by the room transport's onClose callback; inactivity is not a disconnect.
// Chat throttling is deliberately a strict no-burst policy. A token bucket
// would allow bursts, which conflicts with the requested Roblox-style
// minimum gap between messages. In a multi-instance deployment, this state
// should move behind one atomic Redis/Lua operation keyed by chatUserId.
const CHAT_COOLDOWN_MS = 1200;
const CHAT_MAX_VIOLATIONS = 4;
const CHAT_HARD_LOCKOUT_MS = 15000;
const CHAT_SOFT_VIOLATION_MESSAGE = "You are sending messages too fast. Please try again later.";
const CHAT_HARD_LOCKOUT_MESSAGE = "Your chat has been temporarily disabled for spamming. Please wait 15 seconds.";
const chatAntiSpamStates = new Map();
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const SOUND_NAMES = new Set(["jump", "falling", "footsteps", "land"]);
const SOUND_ACTIONS = new Set(["play", "start", "stop"]);
const BURGER_ITEM_ID = "cheezburger";
// Dropped burgers rest on the ground as simple shared world objects. Any
// player who walks over one collects it (the server validates proximity),
// and a player who dies without a burger gets their burger handed back so a
// drop can never be duplicated.
const droppedBurgers = [];
const DROPPED_BURGER_PICKUP_RADIUS = 4.2;
const DROPPED_BURGER_PICKUP_Y = 7;
function droppedBurgersSnapshot() {
  return droppedBurgers.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z }));
}
const BURGER_GRIP_SETTINGS = Object.freeze({
  grip1: Object.freeze({ rotation: -30, x: 0, y: 0, z: 0 }),
  grip2: Object.freeze({ rotation: -135, x: 1, y: -0.6, z: 0.8 }),
});
const BURGER_GRIP_DURATION_MS = 800;
// Roblox does not define one universal avatar mass; it derives assembly mass
// from part volume and density. Use a conservative effective player mass of
// 10 RMU and a small, rate-limited impulse so players can push each other
// without feeling weightless.
const PLAYER_MASS_RMU = 10;
const PLAYER_PUSH_FORCE_RMU = 6;
const PLAYER_PUSH_DISTANCE = 0.48;
const PLAYER_PUSH_COOLDOWN_MS = 140;
const PLAYER_PUSH_RANGE = 2.2;
const AVATAR_PREVIEW_MAX_LENGTH = 60000;
const GUEST_AVATAR_TEXTURE = "uploads/avatar-template__3_.png";
const GUEST_HAT_ID = "guest_cap";
const GUEST_HAT_ADJUST = Object.freeze({
  offset: Object.freeze([0, 1.05, 0.2]),
  rotation: Object.freeze([0, 91, 0]),
  scale: 1,
});
// Live paint previews travel through the realtime room, whose frames are
// intentionally small. Full-resolution paint is uploaded through the HTTP
// endpoint and replicated as a URL in hatTextures/customHats.
const LIVE_HAT_PAINT_MAX_LENGTH = 56000;
// Match the client's upright character collider. Both sides use the same
// radius and full height so contact cannot disagree across the network.
// Keep this collider identical to the client: one upright rounded character
// volume is much closer to Roblox's Humanoid contact than two unrelated boxes.
const PLAYER_COLLISION_HEIGHT = 3.5;
const PLAYER_COLLISION_BOTTOM_OFFSET = 0;
const PLAYER_COLLISION_RADIUS = 0.82;
const PLAYER_STEP_UP_HEIGHT = 0.8;

function applyGuestAppearance(player) {
  if (!player?.isGuest) return;
  player.avatarUrl = GUEST_AVATAR_TEXTURE;
  player.avatarPreview = null;
  player.hats = [GUEST_HAT_ID];
  player.hatStyles = {};
  player.hatAdjusts = { [GUEST_HAT_ID]: {
    offset: [...GUEST_HAT_ADJUST.offset],
    rotation: [...GUEST_HAT_ADJUST.rotation],
    scale: GUEST_HAT_ADJUST.scale,
  } };
  player.customHat = null;
  player.customHats = [];
  player.hairTexture = null;
  player.hatTarget = null;
  player.hatTextures = {};
}
const ADMIN_USERNAMES = new Set(["hardcore", "whatfarm123", "bookxd", "frango", "altdoelter10", "sasa", "honesttome2280430", "funniestguyever", "loldog"]);
const ADMIN_COMMAND_PATTERN = /^(?:[:;!]|\/(?!w(?:hisper)?(?:\s|$)))([^\s]+)(?:\s+([\s\S]*))?$/iu;
const ALLOWED_CHAT_LINK_HOSTS = new Set([
  "amazon.com", "apple.com", "discord.com", "discord.gg", "facebook.com",
  "github.com", "google.com", "instagram.com", "linkedin.com", "microsoft.com",
  "npmjs.com", "openai.com", "reddit.com", "roblox.com", "spotify.com",
  "stackoverflow.com", "steampowered.com", "steamcommunity.com", "tiktok.com",
  "twitch.tv", "twitter.com", "wikipedia.org", "x.com", "youtube.com", "youtu.be",
]);
const CHAT_LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|gg|tv|br)(?:\/[^\s<>"']*)?/gi;
const BLOCKED_CHAT_WORDS = [
  "fuck", "fucking", "shit", "shitty", "bitch", "bastard", "asshole",
  "dick", "piss", "cunt", "whore", "slut", "motherfucker", "nigger",
  "nigga", "negro", "chink", "spic", "kike", "gook", "wetback", "faggot",
  "dyke", "retard",
  // Derived and compound forms (notably "dipshit"/"fuckers" had been sneaking
  // past the exact-word matcher).
  "dipshit", "bullshit", "horseshit", "shithead", "shitbag", "shithole",
  "shitfaced", "shitting", "shitshow",
  "fucker", "fuckers", "fucked", "fuckup", "fuckhead", "fuckface", "fuckwit",
  "dumbfuck", "clusterfuck", "fuckshit",
  "asshat", "dumbass", "jackass", "badass", "smartass", "asswipe", "assface",
"asshole", "sonofabitch", "bitchass", "bitchboy", "dickhead", "dickwad", "dickface", "dickbag",
  // Portuguese abbreviations / short forms
  "fdp", "krl", "crlh", "caralh", "porr", "tnc", "vtnc", "pqp", "merd",
  // Portuguese
  "porra", "caralho", "puta", "puto", "merda", "buceta", "viado", "foda",
  "fodase", "arrombado", "desgracado", "piranha", "vadia", "filhodaputa",
  "bosta", "cacete", "cuzao", "corno",
  // Spanish
  "mierda", "joder", "cabron", "maricon", "pendejo", "verga", "cojones",
  "gilipollas", "zorra", "chingar", "chingada",
  // French
  "putain", "salope", "connard", "encule", "batard", "nique", "pute", "bordel",
  // German
  "scheisse", "arschloch", "hure", "fotze", "wichser", "schwuchtel", "fick", "hurensohn",
  // Italian
  "cazzo", "stronzo", "puttana", "troia", "bastardo", "vaffanculo",
  // Dutch, Russian transliterations, and Turkish
  "klootzak", "hoer", "neuk", "blyat", "suka", "pizda", "ebat", "khuy",
  "orospu", "yarrak", "ibne",
];
const BLOCKED_CHAT_PHRASES = [
  ["filho", "da", "puta"],
  ["hijo", "de", "puta"],
  ["son", "of", "a", "bitch"],
  ["fils", "de", "pute"],
  ["figlio", "di", "puttana"],
  ["mother", "fucker"],
];
const BLOCKED_NATIVE_CHAT_WORDS = [
  // Russian
  "блядь", "бля", "сука", "пизда", "хуй", "ебать", "ебаный", "мудак", "шлюха",
  // Arabic
  "شرموطة", "كس", "خول",
  // Hindi
  "चूत", "भोसड़ी", "मादरचोद", "बहनचोद", "गांड", "लंड",
  // Chinese, Japanese, and Korean
  "傻逼", "妈的", "他妈的", "操你妈", "くそ", "死ね", "ちんこ", "씨발", "개새끼", "병신",
];
const CHAT_CONFUSABLES = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", з: "z", и: "i",
  й: "i", к: "k", л: "l", м: "m", н: "h", о: "o", п: "n", р: "p", с: "c",
  т: "t", у: "y", ф: "f", х: "x", ц: "c", ч: "4", ш: "w", щ: "w", ъ: "b",
  ы: "i", ь: "b", э: "e", ю: "u", я: "r", і: "i", ї: "i", є: "e", ґ: "g",
  α: "a", β: "b", γ: "y", δ: "d", ε: "e", η: "n", ι: "i", κ: "k", ο: "o",
  ρ: "p", τ: "t", υ: "u", χ: "x", ν: "v", μ: "m",
};
const CHAT_LEETSPEAK = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t",
  "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "+": "t", "|": "i",
};
const CHAT_LEETSPEAK_VARIANTS = {
  "0": ["o", "u"],
  "o": ["u"],
  "1": ["i", "l"],
  "3": ["e"],
  "4": ["a"],
  "5": ["s"],
  "6": ["g"],
  "7": ["t"],
  "8": ["b"],
  "9": ["g"],
  "@": ["a"],
  "$": ["s"],
  "!": ["i"],
  "+": ["t"],
  "|": ["i", "l"],
};

function getConnectionIdentityNames(conn) {
  return [
    conn?.username,
    conn?.displayName,
    conn?.name,
    conn?.user?.username,
    conn?.user?.displayName,
  ]
    .map((name) => String(name || "").trim().replace(/^@/u, "").toLowerCase())
    .filter(Boolean);
}

function getConnectionUserId(conn, username, isGuest = false) {
  if (isGuest) return `session:${String(conn?.id || "unknown")}`;

  const identityCandidates = [
    conn?.userId,
    conn?.user?.id,
    conn?.user?.userId,
    conn?.user?.userIdString,
  ];
  const authenticatedId = identityCandidates
    .map((value) => String(value ?? "").trim())
    .find((value) => value && value !== "0" && value !== "undefined" && value !== "null");
  if (authenticatedId) return `user:${authenticatedId}`;

  // The room runtime normally exposes a stable account id. Keep a stable
  // username fallback for runtimes that only expose the authenticated name;
  // guests remain session-scoped so one guest cannot inherit another guest's
  // moderation state.
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (normalizedUsername && normalizedUsername !== "guest") return `username:${normalizedUsername}`;
  return `session:${String(conn?.id || "unknown")}`;
}

function getChatAntiSpamState(chatUserId, now = Date.now()) {
  let state = chatAntiSpamStates.get(chatUserId);
  if (!state) {
    state = {
      nextAllowedAt: 0,
      violationCount: 0,
      lockoutUntil: 0,
      lockoutTimer: null,
    };
    chatAntiSpamStates.set(chatUserId, state);
  }

  // Expiry is lazy as well as timer-driven. This keeps correctness intact if
  // a backgrounded process delays its timer callback.
  if (state.lockoutUntil && now >= state.lockoutUntil) {
    if (state.lockoutTimer) clearTimeout(state.lockoutTimer);
    state.lockoutTimer = null;
    state.lockoutUntil = 0;
    state.nextAllowedAt = 0;
    state.violationCount = 0;
  }
  return state;
}

function scheduleChatLockoutExpiry(chatUserId, state, lockoutUntil) {
  if (state.lockoutTimer) clearTimeout(state.lockoutTimer);
  const delay = Math.max(0, lockoutUntil - Date.now());
  state.lockoutTimer = setTimeout(() => {
    const current = chatAntiSpamStates.get(chatUserId);
    if (current !== state || current.lockoutUntil !== lockoutUntil) return;
    current.lockoutTimer = null;
    current.lockoutUntil = 0;
    current.nextAllowedAt = 0;
    current.violationCount = 0;
  }, delay);
}

function serializeChatAntiSpamState(chatUserId, now = Date.now()) {
  const state = getChatAntiSpamState(chatUserId, now);
  return {
    nextAllowedAt: state.nextAllowedAt,
    violationCount: state.violationCount,
    lockoutUntil: state.lockoutUntil,
  };
}

function validateChatAttempt(chatUserId, now = Date.now()) {
  const state = getChatAntiSpamState(chatUserId, now);

  if (state.lockoutUntil > now) {
    return {
      allowed: false,
      code: "hardLockout",
      message: CHAT_HARD_LOCKOUT_MESSAGE,
      retryAfterMs: state.lockoutUntil - now,
      violationCount: state.violationCount,
      lockoutUntil: state.lockoutUntil,
      nextAllowedAt: state.nextAllowedAt,
    };
  }

  if (now < state.nextAllowedAt) {
    state.violationCount += 1;
    if (state.violationCount >= CHAT_MAX_VIOLATIONS) {
      // Set this once. Attempts during the lockout never recalculate or
      // extend it, so the original 15-second deadline remains authoritative.
      state.lockoutUntil = now + CHAT_HARD_LOCKOUT_MS;
      state.nextAllowedAt = state.lockoutUntil;
      scheduleChatLockoutExpiry(chatUserId, state, state.lockoutUntil);
      return {
        allowed: false,
        code: "hardLockout",
        message: CHAT_HARD_LOCKOUT_MESSAGE,
        retryAfterMs: state.lockoutUntil - now,
        violationCount: state.violationCount,
        lockoutUntil: state.lockoutUntil,
        nextAllowedAt: state.nextAllowedAt,
      };
    }
    return {
      allowed: false,
      code: "softViolation",
      message: CHAT_SOFT_VIOLATION_MESSAGE,
      retryAfterMs: state.nextAllowedAt - now,
      violationCount: state.violationCount,
      lockoutUntil: 0,
      nextAllowedAt: state.nextAllowedAt,
    };
  }

  // A cleanly accepted message breaks the consecutive violation streak.
  state.violationCount = 0;
  state.lockoutUntil = 0;
  state.nextAllowedAt = now + CHAT_COOLDOWN_MS;
  return {
    allowed: true,
    code: "allowed",
    retryAfterMs: CHAT_COOLDOWN_MS,
    violationCount: 0,
    lockoutUntil: 0,
    nextAllowedAt: state.nextAllowedAt,
  };
}

function sendChatAntiSpamRejection(conn, result) {
  conn.send({
    type: "chatAntiSpam",
    code: result.code,
    message: result.message,
    retryAfterMs: result.retryAfterMs,
    violationCount: result.violationCount,
    lockoutUntil: result.lockoutUntil,
    nextAllowedAt: result.nextAllowedAt,
  });
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const HAT_STYLE_NUMERIC_LIMITS = {
  hue: [-180, 180],
  saturation: [0, 2],
  lightness: [0.2, 2],
  opacity: [0.1, 1],
  shininess: [0, 100],
  roughness: [0, 1],
  metalness: [0, 1],
  specularScale: [0, 1],
};

function sanitizeHatStyles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [id, rawStyle] of Object.entries(value).slice(0, 20)) {
    if (!/^[a-z0-9_-]{1,64}$/iu.test(id) || !rawStyle || typeof rawStyle !== "object") continue;
    const style = {};
    if (typeof rawStyle.tint === "string" && /^#[0-9a-f]{6}$/iu.test(rawStyle.tint)) {
      style.tint = rawStyle.tint;
    }
    if (typeof rawStyle.specular === "string" && /^#[0-9a-f]{6}$/iu.test(rawStyle.specular)) {
      style.specular = rawStyle.specular;
    }
    for (const [key, [min, max]] of Object.entries(HAT_STYLE_NUMERIC_LIMITS)) {
      const number = Number(rawStyle[key]);
      if (Number.isFinite(number)) style[key] = clamp(number, min, max);
    }
    result[id] = style;
  }
  return result;
}

function sanitizeHatAdjusts(value, isAdmin = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const maxScale = isAdmin ? 25 : 4;
  const result = {};
  for (const [id, rawAdjust] of Object.entries(value).slice(0, 20)) {
    if (!/^[a-z0-9_-]{1,64}$/iu.test(id) || !rawAdjust || typeof rawAdjust !== "object") continue;
    const offset = Array.isArray(rawAdjust.offset)
      ? rawAdjust.offset.slice(0, 3).map((number) => clamp(Number(number) || 0, -3, 3))
      : [0, 0, 0];
    const rotation = Array.isArray(rawAdjust.rotation)
      ? rawAdjust.rotation.slice(0, 3).map((number) => clamp(Number(number) || 0, -180, 180))
      : [0, 0, 0];
    result[id] = {
      offset: offset.length === 3 ? offset : [0, 0, 0],
      rotation: rotation.length === 3 ? rotation : [0, 0, 0],
      scale: clamp(Number(rawAdjust.scale) || 1, 0.1, maxScale),
    };
  }
  return result;
}

// Per-hat painted/uploaded textures (hatId -> texture URL). Unlike hatStyles
// these carry actual image URLs and replicate to every client through the
// snapshot so painted/uploaded hat textures are shared with everyone.
function sanitizeHatTextures(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [id, url] of Object.entries(value).slice(0, 24)) {
    if (!/^[a-z0-9_-]{1,64}$/iu.test(id)) continue;
    if (typeof url === "string" && /^https?:\/\//iu.test(url.trim()) && url.trim().length <= 4096) {
      result[id] = url.trim();
    }
  }
  return result;
}

function sanitizeCustomHat(value, isOwner, fallbackId = "hardcore_custom_hat_1") {
  if (!isOwner || value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawId = typeof value.id === "string" ? value.id.trim().toLowerCase() : "";
  const id = /^hardcore_custom_hat_\d+$/i.test(rawId) ? rawId : fallbackId;
  const mesh = typeof value.mesh === "string" && /^https?:\/\//i.test(value.mesh.trim())
    ? value.mesh.trim().slice(0, 2048)
    : "";
  if (!mesh) return null;
  const mtl = typeof value.mtl === "string" && /^https?:\/\//i.test(value.mtl.trim())
    ? value.mtl.trim().slice(0, 2048)
    : null;
  const texture = typeof value.texture === "string" && /^https?:\/\//i.test(value.texture.trim())
    ? value.texture.trim().slice(0, 2048)
    : null;
  const customHatAttachments = new Set(["Head", "Torso", "LeftArm", "RightArm", "LeftLeg", "RightLeg"]);
  const attachTo = customHatAttachments.has(value.attachTo) ? value.attachTo : "Head";
  const vector = (input, min, max) => Array.isArray(input) && input.length === 3
    ? input.map((number) => clamp(Number(number) || 0, min, max))
    : [0, 0, 0];
  const styles = sanitizeHatStyles({ custom: value.style });
  return {
    id,
    name: `Custom hat ${Math.max(1, Number(id.match(/(\d+)$/)?.[1]) || 1)}`,
    mesh,
    mtl,
    texture,
    enabled: value.enabled === true,
    position: vector(value.position, -3, 3),
    rotation: vector(value.rotation, -180, 180),
    scale: clamp(Number(value.scale) || 1, 0.1, 25),
    attachTo,
    style: styles.custom || {},
  };
}

function sanitizeCustomHats(value, isOwner) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const result = [];
  const usedIds = new Set();
  for (let index = 0; index < values.length && result.length < 20; index += 1) {
    const hat = sanitizeCustomHat(values[index], isOwner, `hardcore_custom_hat_${index + 1}`);
    if (!hat || usedIds.has(hat.id)) continue;
    usedIds.add(hat.id);
    result.push(hat);
  }
  return result;
}

function expandChatWordVariants(value) {
  let variants = [""];
  for (const character of value) {
    const mappedCharacter = CHAT_CONFUSABLES[character] ?? character;
    const replacements = [mappedCharacter, ...(CHAT_LEETSPEAK_VARIANTS[character] || [])];
    variants = variants.flatMap((prefix) => replacements.map((replacement) => `${prefix}${replacement}`));
    // Keep deliberately ambiguous chat text bounded while covering the
    // common substitutions used to evade the swear filter.
    if (variants.length > 64) variants = variants.slice(0, 64);
  }
  return variants;
}

function removePlayer(id, room, options = {}) {
  if (!players.delete(id)) return false;
  const except = Array.isArray(options.except) ? options.except : [];
  const broadcastOptions = except.length ? { except } : undefined;
  if (broadcastOptions) room.broadcast({ type: "left", id }, broadcastOptions);
  else room.broadcast({ type: "left", id });
  const snapshot = {
    type: "snapshot",
    t: Date.now(),
    players: getVisiblePlayers().map((player) => serializeSnapshotPlayer(player)),
    droppedBurgers: droppedBurgersSnapshot(),
  };
  if (broadcastOptions) room.broadcast(snapshot, broadcastOptions);
  else room.broadcast(snapshot);
  return true;
}

function getVisiblePlayers() {
  return [...players.values()].filter((player) => player.inGame !== false);
}

function integrateServerPush(player, dt) {
  let velocityX = Number(player.pushVelocityX) || 0;
  let velocityZ = Number(player.pushVelocityZ) || 0;
  const previous = { x: player.x, z: player.z };
  player.x += velocityX * dt;
  player.z += velocityZ * dt;
  resolveServerPlayerHorizontalOverlap(player, players.values(), previous);
  player.pushVelocityX = velocityX;
  player.pushVelocityZ = velocityZ;
}

function resolveServerPlayerHorizontalOverlap(player, others, previous = player) {
  const candidates = [...others];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    let moved = false;
    for (const other of candidates) {
      if (other === player || player.collisionsEnabled === false || other.collisionsEnabled === false) continue;
      const verticalOverlap =
        player.y < other.y + PLAYER_COLLISION_HEIGHT &&
        player.y + PLAYER_COLLISION_HEIGHT > other.y;
      if (!verticalOverlap) continue;
      let dx = player.x - other.x;
      let dz = player.z - other.z;
      let distance = Math.hypot(dx, dz);
      const minimumDistance = PLAYER_COLLISION_RADIUS * 2;
      if (distance >= minimumDistance) continue;
      if (distance < 0.0001) {
        dx = player.x - (Number(previous.x) || 0) || (String(player.id) < String(other.id) ? -1 : 1);
        dz = player.z - (Number(previous.z) || 0) || 0;
        distance = Math.hypot(dx, dz) || 1;
      }
      const penetration = minimumDistance - distance + 0.001;
      player.x += (dx / distance) * penetration;
      player.z += (dz / distance) * penetration;
      moved = true;
    }
    if (!moved) break;
  }
}

// Resolve both vertical crossings and the final horizontal contact against
// players. Crossing tests stop a jump below a character and place a falling
// character on top instead of allowing the client to tunnel through.
function resolveServerPlayerMotion(player, requested, previous) {
  player.x = finite(requested.x) ? requested.x : player.x;
  player.y = clamp(requested.y, 0, 80);
  player.z = finite(requested.z) ? requested.z : player.z;
  for (const other of players.values()) {
    if (other === player || player.collisionsEnabled === false || other.collisionsEnabled === false) continue;
    const horizontalDistance = Math.hypot(player.x - other.x, player.z - other.z);
    if (horizontalDistance >= PLAYER_COLLISION_RADIUS * 2) continue;
    const previousBottom = previous.y + PLAYER_COLLISION_BOTTOM_OFFSET;
    const previousTop = previous.y + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT;
    const currentBottom = player.y + PLAYER_COLLISION_BOTTOM_OFFSET;
    const currentTop = player.y + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT;
    const otherBottom = other.y + PLAYER_COLLISION_BOTTOM_OFFSET;
    const otherTop = otherBottom + PLAYER_COLLISION_HEIGHT;
    if (previousTop <= otherBottom && currentTop > otherBottom) {
      player.y = other.y - PLAYER_COLLISION_BOTTOM_OFFSET - PLAYER_COLLISION_HEIGHT;
    } else if (previousBottom >= otherTop && currentBottom < otherTop) {
      player.y = other.y + PLAYER_COLLISION_HEIGHT;
    } else if (
      player.y < otherTop &&
      player.y >= otherTop - PLAYER_STEP_UP_HEIGHT &&
      previous.y < otherTop &&
      player.y <= previous.y &&
      currentBottom > otherBottom
    ) {
      // A short Roblox-like step lets a jump crest a nearby avatar instead
      // of being pushed away forever at its rounded side.
      player.y = otherTop;
    }
  }
  resolveServerPlayerHorizontalOverlap(player, players.values(), previous);
}

function closeDuplicateSession(username, chatUserId, connection, room) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized || normalized === "guest") return;
  for (const [id, player] of players) {
    const sameAuthenticatedUser = chatUserId && !chatUserId.startsWith("session:")
      ? player.chatUserId === chatUserId || player.username.toLowerCase() === normalized
      : player.username.toLowerCase() === normalized;
    if (!sameAuthenticatedUser || player.connection === connection) continue;
    players.delete(id);
    // Tell the other clients immediately. Waiting for the next snapshot made
    // a reconnect briefly render both the old and the new avatar.
    room?.broadcast({ type: "left", id });
    try {
      // This is a stale transport being replaced, not a moderation kick. Do
      // not send `kicked`: this has its own reconnect-safe client handling.
      player.connection?.send({ type: "sessionReplaced", id, reason: "Session replaced" });
      player.connection?.close?.(4001, "Session replaced");
    } catch {
      // The old transport may already be gone.
    }
  }
}

function normalizeChatText(value) {
  const rawNormalized = value.normalize("NFKC").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const rawWords = rawNormalized.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  let normalized = rawNormalized;
  normalized = [...normalized].map((character) => CHAT_CONFUSABLES[character] ?? character).join("");
  normalized = [...normalized].map((character) => CHAT_LEETSPEAK[character] ?? character).join("");
  const words = normalized.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const variantWords = rawWords.flatMap(expandChatWordVariants);
  return { words, rawWords, variantWords };
}

function collapseRepeatedLetters(value) {
  return value.replace(/([a-z])\1+/g, "$1");
}

function tokenMatchesBlockedWord(token, word, allowCollapse = true) {
  const candidate = allowCollapse ? collapseRepeatedLetters(token) : token;
  if (candidate === word || candidate === collapseRepeatedLetters(word)) return true;

  // Catch the requested inserted-character evasion without fuzzy-matching
  // ordinary words that merely start with a blocked sequence (for example,
  // "spice" contains "spic").
  if (word !== "fuck" || candidate.length !== word.length + 1) return false;
  for (let index = 0; index < candidate.length; index += 1) {
    if (`${candidate.slice(0, index)}${candidate.slice(index + 1)}` === word) return true;
  }
  return false;
}

function containsSeparatedBlockedWord(words) {
  for (let start = 0; start < words.length; start += 1) {
    if (words[start].length !== 1) continue;
    for (const word of BLOCKED_CHAT_WORDS) {
      const parts = words.slice(start, start + word.length);
      if (parts.length === word.length && parts.every((part) => part.length === 1) && parts.join("") === word) {
        return true;
      }
    }
  }
  return false;
}

function containsBlockedPhrase(words) {
  return BLOCKED_CHAT_PHRASES.some((phrase) =>
    words.some((_, start) => phrase.every((word, offset) => words[start + offset] === word))
  );
}

function containsSpacedBlockedWord(words) {
  // Check contiguous runs after punctuation/whitespace is removed, so
  // variants such as "fu ck", "f-u-c-k", and "f u c k" cannot bypass the
  // same filter that catches the unbroken word.
  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    for (let end = start; end < words.length && joined.length <= 32; end += 1) {
      joined += words[end];
      if (joined.length < 3) continue;
      if (BLOCKED_CHAT_WORDS.some((word) => tokenMatchesBlockedWord(joined, word))) return true;
    }
  }
  return false;
}

function isBlockedChatMessage(_player, text) {
  const normalized = normalizeChatText(text);
  return normalized.words.some((token) =>
    BLOCKED_CHAT_WORDS.some((word) => tokenMatchesBlockedWord(token, word))
  ) || normalized.variantWords.some((token) =>
    // Variant tokens are synthesized from every letter substitution, so
    // collapsing repeats there fabricates false positives (e.g. "count"
    // expands "o" to "u", giving "cuunt", which collapses to "cunt"). The
    // genuine repeated-letter evasions are still caught on the raw words.
    BLOCKED_CHAT_WORDS.some((word) => tokenMatchesBlockedWord(token, word, false))
  ) || normalized.rawWords.some((token) => BLOCKED_NATIVE_CHAT_WORDS.includes(token))
    || containsSeparatedBlockedWord(normalized.words) || containsSpacedBlockedWord(normalized.words)
    || containsBlockedPhrase(normalized.words);
}

function maskChatText(text) {
  return [...text].map((character) => (/\s/u.test(character) ? character : "#")).join("");
}

function isAllowedChatLink(value) {
  const candidate = /^www\./i.test(value) ? `https://${value}` : value;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_CHAT_LINK_HOSTS.has(hostname) || [...ALLOWED_CHAT_LINK_HOSTS].some(
    (domain) => hostname.endsWith(`.${domain}`)
  );
}

function filterChatLinks(text) {
  return text.replace(CHAT_LINK_PATTERN, (rawLink) => {
    const trailing = rawLink.match(/[.,!?;:)\]}]+$/u)?.[0] ?? "";
    const link = trailing ? rawLink.slice(0, -trailing.length) : rawLink;
    if (isAllowedChatLink(link)) return rawLink;
    return `${"#".repeat([...link].length)}${trailing}`;
  });
}

function escapeChatHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Hardcore can use a deliberately tiny, inert rich-text subset. Do not pass
// arbitrary HTML through the room: event handlers, scripts, URLs and CSS can
// execute in every other player's page if raw XSS is replicated.
function sanitizeHardcoreRichText(value) {
  const raw = String(value || "").slice(0, 2000);
  const allowedTag = /^<\s*(\/?)\s*(b|strong|i|em|u|s|br|span)(?:\s+style\s*=\s*["']\s*(color\s*:\s*#[0-9a-f]{3,8})\s*["'])?\s*(\/?)\s*>$/iu;
  return raw.split(/(<[^>]*>)/gu).map((part) => {
    if (!part.startsWith("<")) return escapeChatHtml(part);
    const match = part.match(allowedTag);
    if (!match) return escapeChatHtml(part);
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const selfClosing = match[4] === "/" || tag === "br";
    if (closing) return `</${tag}>`;
    if (tag === "span" && match[3]) return `<span style="${match[3].replace(/\s+/g, " ")}">`;
    return selfClosing ? `<${tag}>` : `<${tag}>`;
  }).join("");
}

function extractChatImageUrl(text) {
  const candidates = String(text || "").match(/https?:\/\/[^\s<>"']+/giu) || [];
  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.replace(/[.,!?;:)\]}]+$/u, "");
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const path = url.pathname.toLowerCase();
      const imageHost = /(?:^|\.)((?:i\.)?imgur\.com|(?:media\.)?discordapp\.net|cdn\.discordapp\.com|images\.unsplash\.com|pbs\.twimg\.com|i\.postimg\.cc)$/iu.test(url.hostname);
      if (/\.(?:png|jpe?g|gif|webp|bmp|svg)$/iu.test(path) || imageHost) {
        return candidate.slice(0, 2048);
      }
    } catch {
      // Ignore malformed links and continue looking for another image URL.
    }
  }
  return null;
}

function parseCommentImages(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string") : [];
  } catch {
    return [];
  }
}

function sanitizeCommentImages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const candidate of raw.slice(0, 10)) {
    if (typeof candidate !== "string") continue;
    let url;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const path = url.pathname.toLowerCase();
    const isWebsimHost = /(^|\.)websim\.(ai|com)$/iu.test(url.hostname);
    const isImageExt = /\.(?:png|jpe?g|gif|webp)$/iu.test(path);
    if (isImageExt || isWebsimHost) {
      out.push(candidate.slice(0, 2048));
    }
    if (out.length >= 10) break;
  }
  return out;
}

function getAdminTargets(selector, me) {
  const normalized = String(selector || "").trim().replace(/^@/u, "").toLowerCase();
  if (!normalized || normalized === "self" || normalized === "me") return [me];
  if (normalized === "all") return [...players.values()];
  if (normalized === "others") return [...players.values()].filter((player) => player.id !== me.id);
  if (normalized === "admins") return [...players.values()].filter((player) => player.isAdmin);
  const available = [...players.values()];
  const namesFor = (player) => [player.username, player.displayName]
    .map((name) => String(name || "").trim().toLowerCase())
    .filter(Boolean);
  const exact = available.filter((player) => namesFor(player).includes(normalized));
  if (exact.length) return exact;
  // Accept an unambiguous username prefix so commands still work when the
  // visible player name is shortened in the HUD.
  const prefixMatches = available.filter((player) =>
    namesFor(player).some((name) => name.startsWith(normalized))
  );
  return prefixMatches.length === 1 ? prefixMatches : [];
}

function adminNotice(conn, text) {
  conn.send({ type: "adminNotice", text: String(text).slice(0, 240) });
}

function normalizeAdminCommandText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  return ADMIN_COMMAND_PATTERN.test(text) ? text : null;
}

function broadcastPlayerUpdate(room, player, opts = {}) {
  // A player connected from the supplied home page may keep sending its
  // state, but its appearance must not create a visible remote avatar before
  // the visitor actually enters the game. The one exception is a guest
  // downgrade: those must reach other clients immediately so nobody is left
  // showing a stale authenticated identity while the player is in the game.
  if (player.inGame === false && !opts.forceGuest) return;
  room.broadcast({
    type: "playerUpdate",
    id: player.id,
    username: player.username,
    isGuest: player.isGuest === true,
    isAdmin: player.isAdmin,
    nametagColor: player.nametagColor || null,
    nametagText: player.nametagText || null,
    nametagPrefixVisible: player.nametagPrefixVisible !== false,
    playerListIconVisible: player.playerListIconVisible !== false,
    checkmarkVisible: player.checkmarkVisible !== false,
    avatarUrl: player.avatarUrl,
    avatarPreview: player.avatarPreview,
    teleportRevision: player.teleportRevision || 0,
    hats: Array.isArray(player.hats) ? player.hats : [],
    hatStyles: player.hatStyles || {},
    hatAdjusts: player.hatAdjusts || {},
    customHats: Array.isArray(player.customHats) ? player.customHats : [],
    customHat: player.customHat || null,
    hairTexture: player.hairTexture || null,
    hatTarget: player.hatTarget || null,
    hatTextures: player.hatTextures || {},
    forcedAvatar: player.forcedAvatar === true,
    emote: player.emote || null,
    emoteToken: Number(player.emoteToken) || 0,
    animationTime: Number(player.animationTime) || 0,
    rigType: player.rigType === "r15" ? "r15" : "r6",
    toolAnim: player.toolAnim === true,
    toolAnimToken: Number(player.toolAnimToken) || 0,
    burgerEquipped: player.burgerEquipped === true,
    burgerGripActive: player.burgerGripActive === true,
  });
}

function playerAppearanceSignature(player) {
  return JSON.stringify({
    rigType: player.rigType === "r15" ? "r15" : "r6",
    avatarUrl: player.avatarUrl || null,
    avatarPreview: player.forcedAvatar ? (player.avatarPreview || null) : null,
    hats: Array.isArray(player.hats) ? player.hats : [],
    hatStyles: player.hatStyles || {},
    hatAdjusts: player.hatAdjusts || {},
    customHats: Array.isArray(player.customHats) ? player.customHats : [],
    customHat: player.customHat || null,
    hairTexture: player.forcedAvatar ? (player.hairTexture || null) : null,
    hatTarget: player.hatTarget || null,
    hatTextures: player.hatTextures || {},
    forcedAvatar: player.forcedAvatar === true,
  });
}

function cloneAvatarAppearance(player) {
  return {
    avatarUrl: player.avatarUrl || null,
    avatarPreview: player.avatarPreview || null,
    hats: Array.isArray(player.hats) ? [...player.hats] : [],
    hatStyles: { ...(player.hatStyles || {}) },
    hatAdjusts: { ...(player.hatAdjusts || {}) },
    customHats: Array.isArray(player.customHats)
      ? player.customHats.map((hat) => (hat && typeof hat === "object" ? { ...hat } : hat)).filter(Boolean)
      : [],
    hairTexture: player.hairTexture || null,
    hatTarget: player.hatTarget || null,
    hatTextures: { ...(player.hatTextures || {}) },
  };
}

function applyAvatarAppearance(player, appearance) {
  player.avatarUrl = appearance?.avatarUrl || null;
  player.avatarPreview = appearance?.avatarPreview || null;
  player.hats = Array.isArray(appearance?.hats) ? [...appearance.hats] : [];
  player.hatStyles = { ...(appearance?.hatStyles || {}) };
  player.hatAdjusts = { ...(appearance?.hatAdjusts || {}) };
  player.customHats = Array.isArray(appearance?.customHats)
    ? appearance.customHats.map((hat) => (hat && typeof hat === "object" ? { ...hat } : hat)).filter(Boolean)
    : [];
  player.customHat = player.customHats[0] || null;
  player.hairTexture = appearance?.hairTexture || null;
  player.hatTarget = appearance?.hatTarget || null;
  player.hatTextures = { ...(appearance?.hatTextures || {}) };
}

function serializeSnapshotPlayer(player, includeAppearance = true) {
  // Position/animation snapshots are sent often. Keep them deliberately
  // compact; sending hats, style maps and uploaded URLs for every player on
  // every tick made crowded rooms spend most of their time serializing and
  // broadcasting unchanged data.
  const safePlayer = {
    id: player.id,
    username: player.username,
    displayName: player.displayName,
    isGuest: player.isGuest === true,
    isAdmin: player.isAdmin,
    nametagColor: player.nametagColor || null,
    nametagText: player.nametagText || null,
    nametagPrefixVisible: player.nametagPrefixVisible !== false,
    playerListIconVisible: player.playerListIconVisible !== false,
    checkmarkVisible: player.checkmarkVisible !== false,
    x: player.x,
    y: player.y,
    z: player.z,
    facing: player.facing,
    pitch: player.pitch,
    roll: player.roll,
    state: player.state,
    animation: player.state,
    animationTime: Number(player.animationTime) || 0,
    rigType: player.rigType === "r15" ? "r15" : "r6",
    toolAnim: player.toolAnim === true,
    toolAnimToken: Number(player.toolAnimToken) || 0,
    burgerEquipped: player.burgerEquipped === true,
    burgerGripActive: player.burgerGripActive === true,
    emote: player.emote || null,
    emoteToken: Number(player.emoteToken) || 0,
    facingSnap: player.facingSnap === true,
    collisionsEnabled: player.collisionsEnabled !== false,
    teleportRevision: player.teleportRevision || 0,
    fly: player.fly === true,
    flyNoclip: player.flyNoclip === true,
    flySpeed: player.flySpeed,
    forcedAvatar: player.forcedAvatar === true,
  };
  // Guests always carry their fixed avatar everywhere (even compact snapshots),
  // so an observer who only ever receives movement ticks still applies the
  // guest texture instead of falling back to the default noob model.
  if (player.isGuest === true) {
    safePlayer.avatarUrl = player.avatarUrl || GUEST_AVATAR_TEXTURE;
    safePlayer.isGuestAppearance = true;
  }
  if (!includeAppearance) return safePlayer;

  safePlayer.avatarUrl = player.avatarUrl || null;
  // Keep the last editor preview in the full join snapshot so players who
  // join after an edit do not fall back to the default avatar.
  safePlayer.avatarPreview = player.avatarPreview || null;
  safePlayer.hats = Array.isArray(player.hats) ? player.hats : [];
  safePlayer.hatStyles = player.hatStyles || {};
  safePlayer.hatAdjusts = player.hatAdjusts || {};
  safePlayer.customHats = Array.isArray(player.customHats) ? player.customHats : [];
  safePlayer.customHat = player.customHat || null;
  safePlayer.hatTarget = player.hatTarget || null;
  safePlayer.hatTextures = player.hatTextures || {};
  // Forced appearance data must be available to a player joining later.
  if (player.forcedAvatar) {
    if (player.avatarPreview) safePlayer.avatarPreview = player.avatarPreview;
    if (player.hairTexture) safePlayer.hairTexture = player.hairTexture;
  }
  return safePlayer;
}

function setServerTeleport(player, x, y, z, facing) {
  player.teleportRevision = (Number(player.teleportRevision) || 0) + 1;
  const position = {
    x: finite(Number(x)) ? Number(x) : player.x,
    y: clamp(Number(y), 0, 80),
    z: finite(Number(z)) ? Number(z) : player.z,
    facing: finite(Number(facing)) ? Number(facing) : 0,
    revision: player.teleportRevision,
  };
  player.x = position.x;
  player.y = position.y;
  player.z = position.z;
  player.facing = position.facing;
  player.pitch = 0;
  player.roll = 0;
  player.state = "Idle";
  player.animationTime = 0;
  player.lastUpdate = Date.now();
  // Ignore the stale position from the client until it has received and
  // acknowledged the authoritative teleport.
  const now = Date.now();
  player.teleportOverride = {
    ...position,
    createdAt: now,
    // Keep the server position authoritative long enough for an active
    // client to receive the command, render it, and echo the new position.
    releaseAt: now + 1500,
  };
  return position;
}

function handleAdminCommand(me, rawText, room) {
  const match = normalizeAdminCommandText(rawText)?.match(ADMIN_COMMAND_PATTERN);
  if (!match) return false;
  const command = match[1].toLowerCase();
  const rawArgs = (match[2] || "").trim();
  const args = rawArgs ? rawArgs.split(/\s+/u) : [];
  const targetSelector = args[0] || "self";
  const targets = () => {
    const selected = getAdminTargets(targetSelector, me);
    if (!selected.length) adminNotice(me.connection, `No players matched: ${targetSelector}`);
    return selected;
  };

  if (command === "help" || command === "commands" || command === "admin") {
    adminNotice(me.connection, "Commands: ;fly [player] [speed], ;fly2 [player] [speed], ;unfly [player], ;flyspeed [player] [speed], ;respawn [player], ;bring player, ;kick [player] [reason], ;forceavatar victim player, ;unforceavatar [player], ;forcechat, ;setnametag, ;setnametagcolor, ;toggleNametag [player], ;togglePlayerlistIcon [player], ;toggleCheckmark [player], ;username");
    return true;
  }

  if (command === "fly" || command === "fly2") {
    let selector = targetSelector;
    let speedToken = args[1];
    if (args.length === 1 && /^\d+(?:\.\d+)?$/u.test(args[0])) {
      selector = "self";
      speedToken = args[0];
    }
    const selectedTargets = getAdminTargets(selector, me);
    const speed = speedToken === undefined ? 13 : Number(speedToken);
    if (!selectedTargets.length) {
      adminNotice(me.connection, `No players matched: ${selector}`);
      return true;
    }
    if (!finite(speed) || speed < 1 || speed > 10000000) {
      adminNotice(me.connection, "Usage: ;fly [player] [speed] or ;fly2 [player] [speed] (speed 1-100)");
      return true;
    }
    const noclip = command === "fly2";
    for (const target of selectedTargets) {
      target.fly = true;
      target.flyNoclip = noclip;
      target.adminFlyGranted = true;
      target.adminFlyNoclip = noclip;
      target.flySpeed = clamp(speed, 1, 10000000);
      target.flyOverride = true;
      target.flyOverrideState = true;
      target.connection?.send({
        type: "adminEffect",
        action: "fly",
        id: target.id,
        enabled: true,
        noclip,
        speed: target.flySpeed,
      });
    }
    adminNotice(me.connection, `${command} enabled for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "flyspeed") {
    const selectedTargets = args.length === 1 && /^\d+(?:\.\d+)?$/u.test(args[0])
      ? [me]
      : targets();
    const speed = Number(args[1] ?? args[0]);
    if (!selectedTargets.length || !finite(speed) || speed < 1 || speed > 10000000) {
      adminNotice(me.connection, "Usage: ;flyspeed player speed (1-10000000)");
      return true;
    }
    for (const target of selectedTargets) {
      target.flySpeed = clamp(speed, 1, 10000000);
      target.connection?.send({ type: "adminEffect", action: "flySpeed", id: target.id, speed: target.flySpeed });
    }
    adminNotice(me.connection, `Fly speed set to ${speed} for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "unfly" || command === "unfly2") {
    const selectedTargets = targets();
    for (const target of selectedTargets) {
      target.fly = false;
      target.flyNoclip = false;
      target.adminFlyGranted = false;
      target.adminFlyNoclip = false;
      target.flyOverride = true;
      target.flyOverrideState = false;
      target.connection?.send({ type: "adminEffect", action: "fly", id: target.id, enabled: false, noclip: false });
    }
    adminNotice(me.connection, `Fly disabled for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "respawn") {
    const selectedTargets = targets();
    for (const target of selectedTargets) {
      target.fly = false;
      target.flyNoclip = false;
      target.adminFlyGranted = false;
      target.adminFlyNoclip = false;
      target.flyOverride = true;
      target.flyOverrideState = false;
      const position = setServerTeleport(target, 0, 0, 0, 0);
      target.connection?.send({ type: "adminEffect", action: "respawn", id: target.id, ...position });
      room.broadcast({ type: "teleport", id: target.id, ...position });
    }
    room.broadcast({ type: "snapshot", t: Date.now(), players: getVisiblePlayers().map(serializeSnapshotPlayer) });
    adminNotice(me.connection, `Respawned ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "bring") {
    const selectedTargets = targets();
    if (!selectedTargets.length) return true;
    // Avatar yaw 0 points toward +Z in the rendered model. Keep this vector
    // in the same coordinate system as the client's player rotation.
    const forwardX = Math.sin(me.facing);
    const forwardZ = Math.cos(me.facing);
    for (const target of selectedTargets) {
      if (target.id === me.id) continue;
      const x = me.x + forwardX * 2;
      const z = me.z + forwardZ * 2;
      // Make the brought player look back at the admin who used the command.
      const facing = Math.atan2(me.x - x, me.z - z);
      const position = setServerTeleport(target, x, me.y, z, facing);
      target.fly = false;
      target.flyNoclip = false;
      target.adminFlyGranted = false;
      target.adminFlyNoclip = false;
      target.flyOverride = true;
      target.flyOverrideState = false;
      target.connection?.send({ type: "adminEffect", action: "teleport", id: target.id, ...position });
      room.broadcast({ type: "teleport", id: target.id, ...position });
    }
    room.broadcast({ type: "snapshot", t: Date.now(), players: getVisiblePlayers().map(serializeSnapshotPlayer) });
    adminNotice(me.connection, `Brought ${selectedTargets.filter((target) => target.id !== me.id).length} player(s)`);
    return true;
  }

  if (command === "kick") {
    const selectedTargets = targets();
    const kickReason = args.slice(1).join(" ").trim().slice(0, 180);
    for (const target of selectedTargets) {
      target.connection?.send({
        type: "kicked",
        ...(kickReason ? { reason: kickReason } : {}),
      });
      // Do not let the ordinary `left` packet race the kick packet on the
      // target connection and replace the reason with Error 277.
      removePlayer(target.id, room, { except: [target.id] });
      // Let the kicked packet flush before closing the transport. Closing in
      // the same tick could race the packet and leave the client connected.
      setTimeout(() => target.connection?.close?.(), 100);
    }
    adminNotice(me.connection, `Kicked ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "forceavatar" || command === "forecavatar") {
    const selectedTargets = targets();
    const sourceSelector = args[1] || "self";
    const source = getAdminTargets(sourceSelector, me)[0] || me;
    if (!source.avatarUrl && !source.avatarPreview) {
      adminNotice(me.connection, `No avatar is available for ${source.username}`);
      return true;
    }
    for (const target of selectedTargets) {
      if (!target.forcedAvatar) target.forcedAvatarBackup = cloneAvatarAppearance(target);
      applyAvatarAppearance(target, cloneAvatarAppearance(source));
      target.forcedAvatar = true;
      target.connection?.send({
        type: "adminEffect",
        action: "forceAvatar",
        id: target.id,
        forcedAvatar: true,
        avatarUrl: target.avatarUrl,
        avatarPreview: target.avatarPreview,
        hats: target.hats,
        hatStyles: target.hatStyles,
        hatAdjusts: target.hatAdjusts,
        customHats: target.customHats,
        customHat: target.customHat,
        hairTexture: target.hairTexture,
        hatTarget: target.hatTarget,
        hatTextures: target.hatTextures,
      });
      broadcastPlayerUpdate(room, target);
    }
    adminNotice(me.connection, `Avatar from ${source.username} applied to ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "unforceavatar") {
    const selectedTargets = targets();
    let restored = 0;
    for (const target of selectedTargets) {
      if (!target.forcedAvatar) continue;
      applyAvatarAppearance(target, target.forcedAvatarBackup || {});
      target.forcedAvatar = false;
      target.forcedAvatarBackup = null;
      target.connection?.send({
        type: "adminEffect",
        action: "unforceAvatar",
        id: target.id,
        forcedAvatar: false,
        avatarUrl: target.avatarUrl,
        avatarPreview: target.avatarPreview,
        hats: target.hats,
        hatStyles: target.hatStyles,
        hatAdjusts: target.hatAdjusts,
        customHats: target.customHats,
        customHat: target.customHat,
        hairTexture: target.hairTexture,
        hatTarget: target.hatTarget,
        hatTextures: target.hatTextures,
      });
      broadcastPlayerUpdate(room, target);
      restored += 1;
    }
    adminNotice(me.connection, restored
      ? `Forced avatar removed from ${restored} player(s)`
      : "No forced avatar found for the selected player(s)");
    return true;
  }

  if (command === "forcechat") {
    const explicitTargets = args.length ? getAdminTargets(args[0], me) : [];
    const selectedTargets = explicitTargets.length ? explicitTargets : [me];
    const message = (explicitTargets.length ? args.slice(1) : args).join(" ").trim().slice(0, 200);
    if (!message) {
      adminNotice(me.connection, "Usage: :forcechat player message");
      return true;
    }
    const safeText = filterChatLinks(message);
    for (const target of selectedTargets) {
      const filtered = isBlockedChatMessage(target, safeText);
      room.broadcast({
        type: "chat",
        id: target.id,
        username: target.username,
        isAdmin: target.isAdmin,
        nametagColor: target.nametagColor || null,
        nametagText: target.nametagText || null,
        nametagPrefixVisible: target.nametagPrefixVisible !== false,
        text: filtered ? maskChatText(safeText) : safeText,
        forced: true,
        t: Date.now(),
      });
    }
    adminNotice(me.connection, `Forced chat for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "nametagcolor" || command === "setnametagcolor") {
    const selectedTargets = targets();
    const rawValue = args[1] || "";
    const value = rawValue.toLowerCase() === "none"
      ? "none"
      : (rawValue.startsWith("#") ? rawValue : `#${rawValue}`);
    if (!selectedTargets.length || (value !== "none" && !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu.test(value))) {
      adminNotice(me.connection, "Usage: :nametagcolor player #rgb/#rrggbb or none");
      return true;
    }
    for (const target of selectedTargets) {
      target.nametagColor = value === "none" ? null : value.toLowerCase();
      broadcastPlayerUpdate(room, target);
    }
    adminNotice(me.connection, `Nametag color updated for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "nametagtext" || command === "setnametag") {
    const selectedTargets = targets();
    const value = args.slice(1).join(" ").trim().replace(/^\[([\s\S]*)\]$/u, "$1").trim().slice(0, 48);
    if (!selectedTargets.length || !value) {
      adminNotice(me.connection, "Usage: :nametagtext player text");
      return true;
    }
    for (const target of selectedTargets) {
      target.nametagText = value.toLowerCase() === "none" ? null : value;
      broadcastPlayerUpdate(room, target);
    }
    adminNotice(me.connection, `Nametag updated for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "togglenametag") {
    const selectedTargets = targets();
    for (const target of selectedTargets) {
      target.nametagPrefixVisible = target.nametagPrefixVisible === false;
      broadcastPlayerUpdate(room, target);
    }
    adminNotice(me.connection, `Nametag visibility toggled for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "toggleplayerlisticon") {
    const selectedTargets = targets();
    for (const target of selectedTargets) {
      target.playerListIconVisible = target.playerListIconVisible === false;
      broadcastPlayerUpdate(room, target);
    }
    adminNotice(me.connection, `Player list icon toggled for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "togglecheckmark" || command === "toglgecheckmark") {
    const selectedTargets = targets();
    for (const target of selectedTargets) {
      target.checkmarkVisible = target.checkmarkVisible === false;
      broadcastPlayerUpdate(room, target);
    }
    adminNotice(me.connection, `Verification checkmark toggled for ${selectedTargets.length} player(s)`);
    return true;
  }

  if (command === "username" || command === "setusername" || command === "user") {
    const selectedTargets = targets();
    const value = args[1] || "";
    if (!selectedTargets.length || !/^[A-Za-z0-9_]{1,20}$/u.test(value)) {
      adminNotice(me.connection, "Usage: :username player newname");
      return true;
    }
    const taken = new Set([...players.values()]
      .filter((player) => !selectedTargets.includes(player))
      .map((player) => player.username.toLowerCase()));
    for (const target of selectedTargets) {
      if (taken.has(value.toLowerCase())) continue;
      target.username = value;
      taken.add(value.toLowerCase());
      broadcastPlayerUpdate(room, target);
    }
    return true;
  }

  adminNotice(me.connection, `Unknown admin command: :${command}`);
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/game-stats") {
      return Response.json({
        game: "baseplate",
        rating: 100,
        players: getVisiblePlayers().length,
      }, {
        headers: { "cache-control": "no-store" },
      });
    }

    const GAME_ID = "baseplate";

    // GET current vote + favorite state for the visiting user
    if (request.method === "GET" && url.pathname === "/api/game-social") {
      if (!env?.DB?.prepare) {
        return Response.json({ error: "Storage unavailable" }, { status: 503 });
      }
      const userId = request.headers.get("x-websim-user-id") || null;
      const likeRes = await env.DB
        .prepare("SELECT COUNT(*) AS c FROM game_votes WHERE game_id = ? AND vote_type = 'like'")
        .bind(GAME_ID).first("c");
      const dislikeRes = await env.DB
        .prepare("SELECT COUNT(*) AS c FROM game_votes WHERE game_id = ? AND vote_type = 'dislike'")
        .bind(GAME_ID).first("c");
      const favRes = await env.DB
        .prepare("SELECT COUNT(*) AS c FROM game_favorites WHERE game_id = ?")
        .bind(GAME_ID).first("c");
      let myLike = 0, myDislike = 0, myFavorite = 0;
      if (userId) {
        const myVote = await env.DB
          .prepare("SELECT vote_type FROM game_votes WHERE game_id = ? AND user_id = ?")
          .bind(GAME_ID, userId).first("vote_type");
        if (myVote === "like") myLike = 1;
        else if (myVote === "dislike") myDislike = 1;
        const myFav = await env.DB
          .prepare("SELECT 1 AS x FROM game_favorites WHERE game_id = ? AND user_id = ?")
          .bind(GAME_ID, userId).first();
        myFavorite = myFav ? 1 : 0;
      }
      const likes = likeRes || 0;
      const dislikes = dislikeRes || 0;
      const favorites = favRes || 0;
      const total = likes + dislikes;
      return Response.json({
        likes,
        dislikes,
        favorites,
        total,
        percent: total > 0 ? Math.round((likes / total) * 100) : 100,
        myLike,
        myDislike,
        myFavorite,
      }, { headers: { "cache-control": "no-store" } });
    }

    // Toggle a like/dislike. Mutually exclusive per user.
    if (request.method === "POST" && url.pathname === "/api/game-vote") {
      if (!env?.DB?.prepare) {
        return Response.json({ error: "Storage unavailable" }, { status: 503 });
      }
      const userId = request.headers.get("x-websim-user-id");
      const voteAnonymous = request.headers.get("x-websim-user-is-anonymous") === "true";
      if (!userId || voteAnonymous) return Response.json({ error: "Sign in to vote" }, { status: 401 });
      let body;
      try { body = await request.json(); } catch { body = {}; }
      const voteType = String(body.type || "").toLowerCase();
      if (voteType !== "like" && voteType !== "dislike") {
        return Response.json({ error: "Bad vote type" }, { status: 400 });
      }
      const username = String(request.headers.get("x-websim-username") || "anon");
      const now = new Date().toISOString();
      const existing = await env.DB
        .prepare("SELECT vote_type FROM game_votes WHERE game_id = ? AND user_id = ?")
        .bind(GAME_ID, userId).first("vote_type");
      if (existing === voteType) {
        await env.DB
          .prepare("DELETE FROM game_votes WHERE game_id = ? AND user_id = ?")
          .bind(GAME_ID, userId).run();
        return Response.json({ ok: true, action: "removed", type: voteType });
      }
      await env.DB
        .prepare("DELETE FROM game_votes WHERE game_id = ? AND user_id = ?")
        .bind(GAME_ID, userId).run();
      await env.DB
        .prepare("INSERT INTO game_votes (game_id, user_id, username, vote_type, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(GAME_ID, userId, username, voteType, now).run();
      return Response.json({ ok: true, action: "set", type: voteType });
    }

    // Toggle favorite
    if (request.method === "POST" && url.pathname === "/api/game-favorite") {
      if (!env?.DB?.prepare) {
        return Response.json({ error: "Storage unavailable" }, { status: 503 });
      }
      const userId = request.headers.get("x-websim-user-id");
      if (!userId) return Response.json({ error: "Sign in to favorite" }, { status: 401 });
      const favAnonymous = request.headers.get("x-websim-user-is-anonymous") === "true";
      if (favAnonymous) return Response.json({ error: "Sign in to favorite" }, { status: 401 });
      const username = String(request.headers.get("x-websim-username") || "anon");
      const now = new Date().toISOString();
      const existing = await env.DB
        .prepare("SELECT 1 AS x FROM game_favorites WHERE game_id = ? AND user_id = ?")
        .bind(GAME_ID, userId).first();
      if (existing) {
        await env.DB
          .prepare("DELETE FROM game_favorites WHERE game_id = ? AND user_id = ?")
          .bind(GAME_ID, userId).run();
        return Response.json({ ok: true, action: "removed" });
      }
      await env.DB
        .prepare("INSERT INTO game_favorites (game_id, user_id, username, created_at) VALUES (?, ?, ?, ?)")
        .bind(GAME_ID, userId, username, now).run();
      return Response.json({ ok: true, action: "added" });
    }

    // Votes management — who liked/disliked, plus owner-only edit/delete controls.
    if (url.pathname === "/api/game-votes") {
      if (!env?.DB?.prepare) {
        return Response.json({ error: "Storage unavailable" }, { status: 503 });
      }
      const visitorUsername = String(request.headers.get("x-websim-username") || "").trim().toLowerCase();
      const ownerUsername = String(request.headers.get("x-websim-project-owner-username") || "").trim().toLowerCase();
      const isOwner = ownerUsername === visitorUsername;
      const isModerator = isOwner || ADMIN_USERNAMES.has(visitorUsername);

      if (request.method === "GET") {
        if (!isModerator) return Response.json({ error: "Only the owner or an admin can view votes" }, { status: 403 });
        const { results: votes } = await env.DB
          .prepare("SELECT user_id, username, vote_type, created_at FROM game_votes WHERE game_id = ? ORDER BY created_at DESC")
          .bind(GAME_ID).all();
        const { results: favorites } = await env.DB
          .prepare("SELECT user_id, username, created_at FROM game_favorites WHERE game_id = ? ORDER BY created_at DESC")
          .bind(GAME_ID).all();
        return Response.json({ votes: votes || [], favorites: favorites || [], isOwner }, { headers: { "cache-control": "no-store" } });
      }

      if (request.method === "POST") {
        const userId = request.headers.get("x-websim-user-id");
        if (!userId) return Response.json({ error: "Sign in required" }, { status: 401 });
        if (!isOwner) return Response.json({ error: "Only the owner can change a user's vote" }, { status: 403 });
        let body;
        try { body = await request.json(); } catch { body = {}; }
        const rawTargetUser = String(body.userId || "").trim();
        const targetUsername = String(body.username || "").trim().replace(/^@+/u, "");
        const action = String(body.action || "").toLowerCase();
        let vid = rawTargetUser;
        if (!vid) {
          if (!targetUsername) return Response.json({ error: "User id or username is required" }, { status: 400 });
          const known = await env.DB
            .prepare(
              "SELECT user_id, username FROM game_votes WHERE game_id = ? AND LOWER(username) = LOWER(?) LIMIT 1"
            )
            .bind(GAME_ID, targetUsername).first();
          const knownFav = known || await env.DB
            .prepare(
              "SELECT user_id, username FROM game_favorites WHERE game_id = ? AND LOWER(username) = LOWER(?) LIMIT 1"
            )
            .bind(GAME_ID, targetUsername).first();
          const knownComment = knownFav || await env.DB
            .prepare(
              "SELECT user_id, username FROM game_comments WHERE game_id = ? AND LOWER(username) = LOWER(?) LIMIT 1"
            )
            .bind(GAME_ID, targetUsername).first();
          const resolved = knownComment;
          if (!resolved) return Response.json({ error: `No user "${targetUsername}" has interacted yet` }, { status: 404 });
          vid = resolved.user_id;
        }
        if (action === "setFavorite") {
          await env.DB
            .prepare("DELETE FROM game_favorites WHERE game_id = ? AND user_id = ?")
            .bind(GAME_ID, vid).run();
          await env.DB
            .prepare("INSERT INTO game_favorites (game_id, user_id, username, created_at) VALUES (?, ?, ?, ?)")
            .bind(GAME_ID, vid, targetUsername.slice(0, 50) || "hardcore", new Date().toISOString()).run();
          return Response.json({ ok: true, action: "setFavorite" });
        }
        if (action === "removeFavorite") {
          await env.DB
            .prepare("DELETE FROM game_favorites WHERE game_id = ? AND user_id = ?")
            .bind(GAME_ID, vid).run();
          return Response.json({ ok: true, action: "removedFavorite" });
        }
        if (action === "remove") {
          await env.DB
            .prepare("DELETE FROM game_votes WHERE game_id = ? AND user_id = ?")
            .bind(GAME_ID, vid).run();
          return Response.json({ ok: true, action: "removed" });
        }
        if (action === "set") {
          const voteType = String(body.voteType || "").toLowerCase();
          if (voteType !== "like" && voteType !== "dislike") {
            return Response.json({ error: "Bad vote type" }, { status: 400 });
          }
          await env.DB
            .prepare("DELETE FROM game_votes WHERE game_id = ? AND user_id = ?")
            .bind(GAME_ID, vid).run();
          await env.DB
            .prepare("INSERT INTO game_votes (game_id, user_id, username, vote_type, created_at) VALUES (?, ?, ?, ?, ?)")
            .bind(GAME_ID, vid, (targetUsername).slice(0, 50) || "hardcore", voteType, new Date().toISOString()).run();
          return Response.json({ ok: true, action: "set", type: voteType });
        }
        return Response.json({ error: "Bad action" }, { status: 400 });
      }
      return new Response("Method not allowed", { status: 405 });
    }
    const gameCommentMatch = url.pathname.match(/^\/api\/game-comments(?:\/(\d+|audit|trash))?(?:\/(pin|restore))?$/u);
    if (gameCommentMatch) {
      if (!env?.DB?.prepare) {
        return Response.json({ error: "Game comment storage is unavailable" }, { status: 503 });
      }
      const gameId = "baseplate";
      const commentId = gameCommentMatch[1] || null;
      const isPinRoute = gameCommentMatch[2] === "pin";
      const visitorUsername = String(request.headers.get("x-websim-username") || "").trim().toLowerCase();
      const ownerUsername = String(request.headers.get("x-websim-project-owner-username") || "").trim().toLowerCase();
      const isModerator = ownerUsername === visitorUsername || ADMIN_USERNAMES.has(visitorUsername);
      if (!gameCommentMigrationDone) {
        gameCommentMigrationDone = true;
        try {
          const cols = await env.DB.prepare("PRAGMA table_info(game_comments)").all();
          const hasDeleted = (cols?.results || []).some((row) => row.name === "deleted_at");
          if (!hasDeleted) {
            await env.DB.prepare("ALTER TABLE game_comments ADD COLUMN deleted_at TEXT").run();
          }
          const hasParent = (cols?.results || []).some((row) => row.name === "parent_comment_id");
          if (!hasParent) {
            await env.DB.prepare("ALTER TABLE game_comments ADD COLUMN parent_comment_id INTEGER").run();
          }
          const hasImages = (cols?.results || []).some((row) => row.name === "images");
          if (!hasImages) {
            await env.DB.prepare("ALTER TABLE game_comments ADD COLUMN images TEXT").run();
          }
        } catch { /* migration is best-effort; soft-delete rows will just fall through to hide separately */ }
      }
      // Pin / unpin a comment — allowed for the project owner and all admins.
      if (request.method === "POST" && (gameCommentMatch[2] === "restore")) {
        if (!isModerator) return Response.json({ error: "Only the owner or an admin can restore comments" }, { status: 403 });
        if (!commentId) return Response.json({ error: "Comment id is required" }, { status: 400 });
        const found = await env.DB
          .prepare("SELECT id FROM game_comments WHERE id = ? AND game_id = ?")
          .bind(Number(commentId), gameId)
          .first();
        if (!found) return Response.json({ error: "Comment not found (or never existed)" }, { status: 404 });
        await env.DB
          .prepare("UPDATE game_comments SET deleted_at = NULL WHERE id = ? AND game_id = ?")
          .bind(Number(commentId), gameId)
          .run();
        await env.DB
          .prepare("INSERT INTO game_comment_audit (game_id, comment_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(gameId, Number(commentId), "restore", visitorUsername, null, new Date().toISOString())
          .run();
        return Response.json({ ok: true, restored: true });
      }
      if (commentId && isPinRoute) {
        if (request.method === "POST" || request.method === "PUT") {
          let body;
          try {
            body = await request.json();
          } catch {
            body = {};
          }
          if (body?.pinned === false) {
            if (!isModerator) return Response.json({ error: "Only the owner or an admin can unpin comments" }, { status: 403 });
            await env.DB
              .prepare("DELETE FROM game_comment_pins WHERE game_id = ? AND comment_id = ?")
              .bind(gameId, Number(commentId))
              .run();
            await env.DB
              .prepare("INSERT INTO game_comment_audit (game_id, comment_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
              .bind(gameId, Number(commentId), "unpin", visitorUsername, null, new Date().toISOString())
              .run();
            return Response.json({ ok: true, pinned: false });
          }
          if (!isModerator) return Response.json({ error: "Only the owner or an admin can pin comments" }, { status: 403 });
          const found = await env.DB
            .prepare("SELECT id, parent_comment_id FROM game_comments WHERE id = ? AND game_id = ?")
            .bind(Number(commentId), gameId)
            .first();
          if (!found) return Response.json({ error: "Comment not found" }, { status: 404 });
          if (found.parent_comment_id) return Response.json({ error: "Replies cannot be pinned" }, { status: 400 });
          const pinnedAt = new Date().toISOString();
          // Only a single comment may be pinned at a time in this game. Pinning
          // a new comment unpins the previously pinned one.
          await env.DB
            .prepare("DELETE FROM game_comment_pins WHERE game_id = ?")
            .bind(gameId)
            .run();
          await env.DB
            .prepare("INSERT OR REPLACE INTO game_comment_pins (game_id, comment_id, pinned_by, created_at) VALUES (?, ?, ?, ?)")
            .bind(gameId, Number(commentId), visitorUsername, pinnedAt)
            .run();
          await env.DB
            .prepare("INSERT INTO game_comment_audit (game_id, comment_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(gameId, Number(commentId), "pin", visitorUsername, null, new Date().toISOString())
            .run();
          return Response.json({ ok: true, pinned: true });
        }
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }
      if (request.method === "DELETE") {
        if (!isModerator) return Response.json({ error: "Only the owner or an admin can delete comments" }, { status: 403 });
        if (!commentId) return Response.json({ error: "Comment id is required" }, { status: 400 });
        const found = await env.DB
          .prepare("SELECT id FROM game_comments WHERE id = ? AND game_id = ?")
          .bind(Number(commentId), gameId)
          .first();
        if (!found) return Response.json({ error: "Comment not found" }, { status: 404 });
        const deletedAt = new Date().toISOString();
        await env.DB
          .prepare("UPDATE game_comments SET deleted_at = ? WHERE id = ? AND game_id = ?")
          .bind(deletedAt, Number(commentId), gameId)
          .run();
        await env.DB
          .prepare("INSERT INTO game_comment_audit (game_id, comment_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(gameId, Number(commentId), "delete", visitorUsername, null, deletedAt)
          .run();
        return Response.json({ ok: true, deleted: true });
      }
      if (request.method === "GET" && url.pathname === "/api/game-comments/trash") {
        if (!isModerator) return Response.json({ error: "Only the owner or an admin can view deleted comments" }, { status: 403 });
        const { results } = await env.DB
          .prepare("SELECT id, username, content, images, created_at, deleted_at, parent_comment_id FROM game_comments WHERE game_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC LIMIT 200")
          .bind(gameId)
          .all();
        return Response.json({ comments: (results || []).map((c) => ({
          id: String(c.id),
          raw_content: c.content,
          author: { username: c.username },
          images: c.images ? parseCommentImages(c.images) : [],
          created_at: c.created_at,
          deleted_at: c.deleted_at,
          parent_id: c.parent_comment_id ? String(c.parent_comment_id) : null,
        })) });
      }
      if (request.method === "GET" && url.pathname === "/api/game-comments/audit") {
        if (!isModerator) return Response.json({ error: "Only the owner or an admin can view the audit log" }, { status: 403 });
        const { results } = await env.DB
          .prepare("SELECT id, comment_id, action, actor, detail, created_at FROM game_comment_audit WHERE game_id = ? ORDER BY created_at DESC, id DESC LIMIT 200")
          .bind(gameId)
          .all();
        return Response.json({ events: results || [] });
      }
      if (commentId) return Response.json({ error: "Not found" }, { status: 404 });
      if (request.method === "GET") {
        const { results } = await env.DB
          .prepare("SELECT id, username, content, images, created_at, parent_comment_id FROM game_comments WHERE game_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 500")
          .bind(gameId)
          .all();
        const rows = results || [];
        let pinnedIds = new Set();
        const pinRequest = await env.DB
          .prepare("SELECT comment_id FROM game_comment_pins WHERE game_id = ?")
          .bind(gameId)
          .all();
        if (pinRequest?.results) {
          pinnedIds = new Set(pinRequest.results.map((row) => String(row.comment_id)));
        }
        const byId = new Map();
        rows.forEach((comment) => {
          byId.set(comment.id, {
            id: String(comment.id),
            raw_content: comment.content,
            author: { username: comment.username },
            images: comment.images ? parseCommentImages(comment.images) : [],
            created_at: comment.created_at,
            pinned: pinnedIds.has(String(comment.id)),
            parent_id: comment.parent_comment_id ? String(comment.parent_comment_id) : null,
            replies: [],
          });
        });
        const comments = [];
        rows.forEach((comment) => {
          const node = byId.get(comment.id);
          if (comment.parent_comment_id && byId.has(comment.parent_comment_id)) {
            byId.get(comment.parent_comment_id).replies.push(node);
          } else {
            comments.push(node);
          }
        });
        comments.forEach((comment) => {
          comment.replies.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        });
        comments.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
        return Response.json({ comments, canModerate: isModerator, canPostImages: ADMIN_USERNAMES.has(visitorUsername) });
      }
      if (request.method === "POST") {
        const userId = request.headers.get("x-websim-user-id");
        const anonymous = request.headers.get("x-websim-user-is-anonymous") === "true";
        const usernameHeader = String(request.headers.get("x-websim-username") || "").trim().toLowerCase();
        if (!userId || anonymous || usernameHeader === "guest") {
          return Response.json({ error: "Sign in to comment" }, { status: 401 });
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid comment" }, { status: 400 });
        }
        const content = typeof body?.content === "string" ? body.content.trim() : "";
        if (!content || content.length > 200) {
          return Response.json({ error: "Comment must be between 1 and 200 characters" }, { status: 400 });
        }
        let parentId = null;
        if (body?.parent_comment_id) {
          const parsedParent = Number(body.parent_comment_id);
          if (!Number.isFinite(parsedParent) || parsedParent <= 0) {
            return Response.json({ error: "Invalid parent comment" }, { status: 400 });
          }
          const parent = await env.DB
            .prepare("SELECT id FROM game_comments WHERE id = ? AND game_id = ? AND deleted_at IS NULL")
            .bind(parsedParent, gameId)
            .first();
          if (!parent) return Response.json({ error: "Parent comment not found" }, { status: 404 });
          parentId = parsedParent;
        }
        const username = String(request.headers.get("x-websim-username") || "guest").trim() || "guest";
        const createdAt = new Date().toISOString();
        let images = [];
        if (ADMIN_USERNAMES.has(usernameHeader)) {
          images = sanitizeCommentImages(body?.images);
        }
        const result = await env.DB
          .prepare("INSERT INTO game_comments (game_id, user_id, username, content, images, created_at, parent_comment_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(gameId, userId, username, content, images.length ? JSON.stringify(images) : null, createdAt, parentId)
          .run();
        return Response.json({
          comment: {
            id: String(result?.meta?.last_row_id || ""),
            raw_content: content,
            author: { username },
            images,
            created_at: createdAt,
            parent_id: parentId ? String(parentId) : null,
            replies: [],
          },
        });
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    if (request.method === "GET" && url.pathname === "/api/captcha/config") {
      return Response.json({
        sitekey: String(env?.TURNSTILE_SITEKEY || TURNSTILE_TEST_SITEKEY),
      });
    }
    if (request.method === "POST" && url.pathname === "/api/captcha/verify") {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid request" }, { status: 400 });
      }
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!token || token.length > 4096) {
        return Response.json({ success: false, error: "Missing CAPTCHA token" }, { status: 400 });
      }
      const form = new URLSearchParams();
      form.set("secret", String(env?.TURNSTILE_SECRET_KEY || env?.TURNSTILE_SECRET || TURNSTILE_TEST_SECRET));
      form.set("response", token);
      const remoteIp = request.headers.get("CF-Connecting-IP");
      if (remoteIp) form.set("remoteip", remoteIp);
      try {
        const validationResponse = await fetch(TURNSTILE_VERIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
        });
        const validation = await validationResponse.json().catch(() => ({}));
        return Response.json({
          success: validationResponse.ok && validation.success === true,
          errorCodes: Array.isArray(validation["error-codes"]) ? validation["error-codes"] : [],
        }, { status: validationResponse.ok && validation.success === true ? 200 : 400 });
      } catch {
        return Response.json({ success: false, error: "CAPTCHA service unavailable" }, { status: 502 });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/chat-image-upload") {
      const username = String(request.headers.get("x-websim-username") || "").trim().toLowerCase();
      if (username !== "hardcore") {
        return Response.json({ error: "Only hardcore can upload chat images" }, { status: 403 });
      }
      const contentType = String(request.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        return Response.json({ error: "Chat attachment must be an image" }, { status: 400 });
      }
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 6 * 1024 * 1024) {
        return Response.json({ error: "Chat image is too large" }, { status: 400 });
      }
      if (!env?.BLOB?.put) {
        return Response.json({ error: "Server file storage is unavailable" }, { status: 503 });
      }
      const extension = contentType.includes("webp")
        ? "webp"
        : contentType.includes("jpeg")
          ? "jpg"
          : contentType.includes("gif")
            ? "gif"
            : "png";
      const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const stored = await env.BLOB.put(`chat-images/${token}.${extension}`, bytes, { contentType });
      return Response.json({ url: stored.url });
    }
    if (request.method === "POST" && url.pathname === "/api/hardcore-hat-upload") {
      const username = String(request.headers.get("x-websim-username") || "").trim().toLowerCase();
      if (username !== "hardcore") {
        return Response.json({ error: "Only hardcore can upload custom hats" }, { status: 403 });
      }
      const requestedKind = request.headers.get("x-upload-kind");
      const kind = requestedKind === "texture" || requestedKind === "mtl" ? requestedKind : "model";
      const contentType = String(request.headers.get("content-type") || "application/octet-stream").toLowerCase();
      const validModelType = !contentType.startsWith("image/") && contentType !== "text/html";
      const validTextureType = contentType.startsWith("image/");
      const validMtlType = contentType.startsWith("text/") || contentType === "application/octet-stream";
      if ((kind === "model" && !validModelType) || (kind === "texture" && !validTextureType) || (kind === "mtl" && !validMtlType)) {
        return Response.json({ error: "Unsupported custom hat file type" }, { status: 400 });
      }
      const bytes = await request.arrayBuffer();
      const maxBytes = kind === "model" ? 8 * 1024 * 1024 : kind === "mtl" ? 4 * 1024 * 1024 : 6 * 1024 * 1024;
      if (!bytes.byteLength || bytes.byteLength > maxBytes) {
        return Response.json({ error: "Custom hat file is too large" }, { status: 400 });
      }
      if (!env?.BLOB?.put) {
        return Response.json({ error: "Server file storage is unavailable" }, { status: 503 });
      }
      const extension = kind === "model"
        ? "obj"
        : kind === "mtl"
          ? "mtl"
          : (contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png");
      const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const stored = await env.BLOB.put(`hardcore-custom-hat/${token}.${extension}`, bytes, { contentType });
      return Response.json({ url: stored.url });
    }
    if (request.method === "POST" && url.pathname === "/api/hat-texture-upload") {
      const username = String(request.headers.get("x-websim-username") || "").trim().toLowerCase();
      if (!username || username.startsWith("guest ")) {
        return Response.json({ error: "Guests cannot edit avatar accessories" }, { status: 403 });
      }
      const contentType = String(request.headers.get("content-type") || "application/octet-stream").toLowerCase();
      if (!contentType.startsWith("image/")) {
        return Response.json({ error: "Hat texture must be an image" }, { status: 400 });
      }
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 6 * 1024 * 1024) {
        return Response.json({ error: "Hat texture is too large" }, { status: 400 });
      }
      if (!env?.BLOB?.put) {
        return Response.json({ error: "Server file storage is unavailable" }, { status: 503 });
      }
      const extension = contentType.includes("webp")
        ? "webp"
        : contentType.includes("jpeg")
          ? "jpg"
          : contentType.includes("gif")
            ? "gif"
            : "png";
      const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const stored = await env.BLOB.put(`hat-texture/${username}/${token}.${extension}`, bytes, { contentType });
      return Response.json({ url: stored.url });
    }
    return new Response("Not found", { status: 404 });
  },
};

export const room = {
  // Ten snapshots per second are enough for the client's short prediction
  // window and keep large rooms from broadcasting full state at 20 Hz.
  tickMs: 100,
  // The client sends a heartbeat every 15 seconds. This fallback removes a
  // transport that vanished without firing onClose, while leaving enough
  // margin for one delayed heartbeat.
  stalePlayerMs: STALE_PLAYER_MS,

  async onConnect(conn, room) {
    const identityNames = getConnectionIdentityNames(conn);
    const isGuest = conn?.identity !== "user";
    const providedUsername = String(conn.username ?? conn.displayName ?? "").trim();
    const username = isGuest
      ? `Guest ${nextGuestNumber++}`
      : (providedUsername || "guest");
    const chatUserId = getConnectionUserId(conn, username, isGuest);
    if (!isGuest) closeDuplicateSession(username, chatUserId, conn, room);
    const isAdmin = !isGuest && identityNames.some((name) => ADMIN_USERNAMES.has(name));
    players.set(conn.id, {
      id: conn.id,
      chatUserId,
      connection: conn,
      username,
      displayName: isGuest ? username : (String(conn.displayName ?? username).trim() || username),
      isGuest,
      isAdmin,
      avatarUrl: null,
      avatarPreview: null,
      forcedAvatar: false,
      rigType: "r6",
      forcedAvatarBackup: null,
      hats: [],
      hatStyles: {},
      hatAdjusts: {},
      customHat: null,
      customHats: [],
      hairTexture: null,
      hatTarget: null,
      hatTextures: {},
      fly: false,
      flyNoclip: false,
      adminFlyGranted: false,
      adminFlyNoclip: false,
      flySpeed: 13,
      flyOverride: false,
      flyOverrideState: null,
      teleportOverride: null,
      teleportRevision: 0,
      // Keep the home connection alive without exposing it to players.
      inGame: false,
    nametagColor: null,
    nametagText: null,
      nametagPrefixVisible: true,
      playerListIconVisible: true,
      // The owner starts verified; regular admins must be granted the badge
      // explicitly with the server-side :toggleCheckmark command.
      checkmarkVisible: username.toLowerCase() === "hardcore",
      x: 0,
      y: 0,
      z: 0,
      facing: 0,
      pitch: 0,
      roll: 0,
      state: "Idle",
      animationTime: 0,
      toolAnim: false,
      toolAnimToken: 0,
      burgerEquipped: false,
      burgerGripActive: false,
      burgerGripUntil: 0,
      // The welcome packet grants every connection one burger. Players can now
      // collect extra burgers dropped by others and hold several at once.
      burgerCount: 1,
      emote: null,
      emoteToken: 0,
      facingSnap: false,
      collisionsEnabled: true,
      lastUpdate: Date.now(),
      pushCooldownUntil: 0,
      pushVelocityX: 0,
      pushVelocityZ: 0,
      pushPhysicsAt: Date.now(),
    });
    const player = players.get(conn.id);
    applyGuestAppearance(player);
    player.appearanceSignature = playerAppearanceSignature(player);
    conn.send({
      type: "welcome",
      id: conn.id,
      username,
      isGuest,
      isAdmin,
      checkmarkVisible: username.toLowerCase() === "hardcore",
      backpackItems: [BURGER_ITEM_ID],
      burgerGripSettings: BURGER_GRIP_SETTINGS,
      chatAntiSpam: serializeChatAntiSpamState(chatUserId),
    });
    conn.send({
      type: "snapshot",
      t: Date.now(),
      players: getVisiblePlayers().map(serializeSnapshotPlayer),
      droppedBurgers: droppedBurgersSnapshot(),
    });
  },

  async onMessage(conn, message, room) {
    const me = players.get(conn.id);
    if (!me) return;

    let input;
    try {
      input = typeof message === "string" ? JSON.parse(message) : message;
    } catch {
      return;
    }
    if (!input) return;

    // "Play as a Guest" — an authenticated visitor opts into an anonymous
    // guest session for the CURRENT connection. The server (not the client)
    // assigns the "Guest <number>" name, drops admin, and forces the guest
    // appearance, so a client can never spoof an arbitrary username. The
    // client simply asks; everything is authoritative here.
    if (input.type === "guest" && !me.isGuest) {
      const guestName = `Guest ${nextGuestNumber++}`;
      me.isGuest = true;
      me.isAdmin = false;
      me.username = guestName;
      me.displayName = guestName;
      me.chatUserId = getConnectionUserId(conn, guestName, true);
      me.avatarUrl = null;
      me.avatarPreview = null;
      me.hairTexture = null;
      me.hats = [];
      me.hatStyles = {};
      me.hatAdjusts = {};
      me.customHat = null;
      me.customHats = [];
      me.hatTarget = null;
      me.hatTextures = {};
      me.nametagColor = null;
      me.nametagText = null;
      me.checkmarkVisible = false;
      me.forcedAvatar = false;
      me.emote = null;
      applyGuestAppearance(me);
      me.appearanceSignature = playerAppearanceSignature(me);
      broadcastPlayerUpdate(room, me, { forceGuest: true });
      conn.send({ type: "adminNotice", text: `You are now playing as ${guestName}` });
      conn.send({
        type: "welcome",
        id: me.id,
        username: guestName,
        isGuest: true,
        isAdmin: false,
        checkmarkVisible: false,
        backpackItems: [BURGER_ITEM_ID],
        burgerGripSettings: BURGER_GRIP_SETTINGS,
        chatAntiSpam: serializeChatAntiSpamState(me.chatUserId),
      });
      return;
    }

    if (input.type === "presence") {
      // "Play as a Guest": an authenticated visitor opts into an anonymous
      // guest session. Processed here (not as a separate message type) because
      // presence is provably delivered by every client transport. Requesting
      // this more than once is idempotent — the second time isGuest is already
      // true and we just keep the existing guest identity.
      if (input.guest === true) {
        try {
          if (me.isGuest) {
            conn.send({ type: "adminNotice", text: `Already playing as ${me.username}` });
          } else {
            const guestName = `Guest ${nextGuestNumber++}`;
            me.isGuest = true;
            me.isAdmin = false;
            me.username = guestName;
            me.displayName = guestName;
            me.chatUserId = getConnectionUserId(conn, guestName, true);
            me.avatarUrl = null;
            me.avatarPreview = null;
            me.hairTexture = null;
            me.hats = [];
            me.hatStyles = {};
            me.hatAdjusts = {};
            me.customHat = null;
            me.customHats = [];
            me.hatTarget = null;
            me.hatTextures = {};
            me.nametagColor = null;
            me.nametagText = null;
            me.checkmarkVisible = false;
            me.forcedAvatar = false;
            me.emote = null;
            applyGuestAppearance(me);
            me.appearanceSignature = playerAppearanceSignature(me);
            broadcastPlayerUpdate(room, me, { forceGuest: true });
            conn.send({ type: "adminNotice", text: `You are now playing as ${guestName}` });
            conn.send({
              type: "welcome",
              id: me.id,
              username: guestName,
              isGuest: true,
              isAdmin: false,
              checkmarkVisible: false,
              backpackItems: [BURGER_ITEM_ID],
              burgerGripSettings: BURGER_GRIP_SETTINGS,
              chatAntiSpam: serializeChatAntiSpamState(me.chatUserId),
            });
          }
        } catch (error) {
          conn.send({ type: "adminNotice", text: `Guest error: ${String(error && error.message ? error.message : error).slice(0, 120)}` });
        }
        // Continue on to update inGame below so entering the game still works.
      }
      const nextInGame = input.visible === true;
      const changed = me.inGame !== nextInGame;
      me.inGame = nextInGame;
      me.lastUpdate = Date.now();
      if (!changed) return;
      room.broadcast({
        type: "presence",
        id: me.id,
        username: me.username,
        visible: nextInGame,
      });
room.broadcast({
      type: "snapshot",
      t: Date.now(),
      players: getVisiblePlayers().map(serializeSnapshotPlayer),
      droppedBurgers: droppedBurgersSnapshot(),
    });
    return;
  }

  if (input.type === "leave") {
      removePlayer(conn.id, room);
      return;
    }

    // Keep the hidden home session alive and authoritative, but do not let it
    // emit chat, emotes, effects, or appearance events into the game room.
    // State/heartbeat are handled silently so entering the game is seamless.
    if (me.inGame === false && input.type !== "state" && input.type !== "heartbeat") return;

    if (input.type === "avatar") {
      const avatarUrl = typeof input.url === "string" ? input.url.trim() : "";
      if (!/^https?:\/\//i.test(avatarUrl) || avatarUrl.length > 2048) return;
      if (me.forcedAvatar || me.isGuest) return;
      me.avatarUrl = avatarUrl;
      me.avatarPreview = null;
      room.broadcast({
        type: "avatar",
        id: conn.id,
        username: me.username,
        avatarUrl,
        avatarPreview: null,
      });
      return;
    }

    if (input.type === "avatarPreview") {
      const preview = typeof input.data === "string" ? input.data.trim() : "";
      if (me.forcedAvatar || me.isGuest) return;
      if (
        preview.length > AVATAR_PREVIEW_MAX_LENGTH ||
        !/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(preview)
      ) return;
      if (me.avatarPreview === preview) return;
      me.avatarPreview = preview;
      room.broadcast({
        type: "avatarPreview",
        id: conn.id,
        username: me.username,
        data: preview,
      });
      return;
    }

    if (input.type === "hairTexture") {
      const preview = typeof input.data === "string" ? input.data.trim() : "";
      const hatTarget = typeof input.hatTarget === "string" && /^[a-z0-9_-]{1,64}$/iu.test(input.hatTarget)
        ? input.hatTarget
        : null;
      if (
        !hatTarget ||
        preview.length > LIVE_HAT_PAINT_MAX_LENGTH ||
        !/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(preview)
      ) return;
      if (me.forcedAvatar || me.isGuest) return;
      // Live paint is an ephemeral event. Do not put the base64 preview into
      // the player snapshot: snapshots are broadcast to everyone and must
      // stay small. The full texture is uploaded over HTTP and arrives later
      // through hatTextures/customHats.
      room.broadcast({
        type: "hairTexture",
        id: conn.id,
        username: me.username,
        data: preview,
        hatTarget,
      });
      return;
    }

    if (input.type === "admin") {
      if (!me.isAdmin) return;
      if (input.action === "fly") {
        me.fly = input.enabled === true;
        me.flyNoclip = false;
        me.adminFlyGranted = false;
        me.adminFlyNoclip = false;
        me.flyOverride = false;
        me.flyOverrideState = null;
      } else if (input.action === "resetSelf") {
        me.x = 0;
        me.y = 0;
        me.z = 0;
        me.facing = 0;
        me.pitch = 0;
        me.roll = 0;
        me.state = "Idle";
        me.fly = false;
        me.flyNoclip = false;
        me.adminFlyGranted = false;
        me.adminFlyNoclip = false;
        me.flySpeed = 13;
        me.flyOverride = false;
        me.flyOverrideState = null;
        conn.send({ type: "adminReset", id: conn.id, x: 0, y: 0, z: 0, facing: 0, pitch: 0, roll: 0 });
      }
      return;
    }

    if (input.type === "sound") {
      const sound = typeof input.sound === "string" ? input.sound : "";
      const action = typeof input.action === "string" ? input.action : "play";
      // Burger audio is emitted only by the authoritative Tool-token path
      // below; clients cannot spoof it through the generic sound channel.
      if (sound === "burger") return;
      if (!SOUND_NAMES.has(sound) || !SOUND_ACTIONS.has(action)) return;
      const now = Date.now();
      me.lastUpdate = now;
      room.broadcast({
        type: "sound",
        id: conn.id,
        sound,
        action,
        // Use the server's last trusted position instead of a client-supplied
        // location so distance-based audio cannot be spoofed.
        x: me.x,
        y: me.y,
        z: me.z,
        t: now,
      });
      return;
    }

    if (input.type === "push") {
      const targetId = typeof input.targetId === "string" ? input.targetId : "";
      const target = players.get(targetId);
      if (!target || targetId === conn.id) return;
      if (me.collisionsEnabled === false || target.collisionsEnabled === false) return;
      const dx = Number(input.dx);
      const dz = Number(input.dz);
      const directionLength = Math.hypot(dx, dz);
      if (!finite(dx) || !finite(dz) || directionLength < 0.5) return;

      const now = Date.now();
      if (now < me.pushCooldownUntil) return;
      const horizontalX = target.x - me.x;
      const horizontalZ = target.z - me.z;
      const horizontalDistance = Math.hypot(horizontalX, horizontalZ);
      const verticalOverlap =
        me.y + PLAYER_COLLISION_BOTTOM_OFFSET < target.y + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT &&
        me.y + PLAYER_COLLISION_BOTTOM_OFFSET + PLAYER_COLLISION_HEIGHT > target.y + PLAYER_COLLISION_BOTTOM_OFFSET;
      if (!verticalOverlap || horizontalDistance > PLAYER_PUSH_RANGE) return;
      const directionX = dx / directionLength;
      const directionZ = dz / directionLength;
      // A player can only push toward the other player's current position.
      if (horizontalDistance > 0.001 &&
          (horizontalX * directionX + horizontalZ * directionZ) < -0.2) return;

      me.pushCooldownUntil = now + PLAYER_PUSH_COOLDOWN_MS;
      // Integrate the push as a short-lived velocity. Moving the authoritative
      // position by a fixed amount in this handler looked like teleporting on
      // the next snapshot, especially for the pushed player.
      const pushDecay = 10;
      const pushSpeed = PLAYER_PUSH_DISTANCE * Math.min(1, PLAYER_PUSH_FORCE_RMU / PLAYER_MASS_RMU) * pushDecay;
      target.pushVelocityX += directionX * pushSpeed;
      target.pushVelocityZ += directionZ * pushSpeed;
      target.lastUpdate = now;
      room.broadcast({
        type: "push",
        id: target.id,
        sourceId: conn.id,
        x: target.x,
        y: target.y,
        z: target.z,
        impulseX: directionX * pushSpeed,
        impulseZ: directionZ * pushSpeed,
        t: now,
      });
      return;
    }

    if (input.type === "emote") {
      const requested = typeof input.emote === "string" ? input.emote.trim().toLowerCase() : "";
      if (!["dance", "wave", "point", "laugh", "cheer"].includes(requested)) return;
      const variant = requested === "dance"
        ? (/^Dance[123]$/.test(input.variant) ? input.variant : `Dance${1 + Math.floor(Math.random() * 3)}`)
        : requested[0].toUpperCase() + requested.slice(1);
      me.emote = variant;
      me.emoteToken = Number.isFinite(Number(input.token)) ? Math.max(0, Math.floor(Number(input.token))) : (me.emoteToken || 0) + 1;
      room.broadcast({
        type: "emote",
        id: me.id,
        username: me.username,
        emote: variant,
        token: me.emoteToken,
        t: Date.now(),
      });
      return;
    }

    if (input.type === "emoteStop") {
      me.emote = null;
      me.emoteToken = (Number(me.emoteToken) || 0) + 1;
      room.broadcast({
        type: "emoteStop",
        id: me.id,
        token: me.emoteToken,
        t: Date.now(),
      });
      return;
    }

    if (input.type === "chat") {
      if (me.isGuest) return;
      const isHardcore = me.username.toLowerCase() === "hardcore";
      const rawText = typeof input.text === "string" ? input.text.trim().slice(0, 200) : "";
      const linkedImageUrl = isHardcore ? extractChatImageUrl(rawText) : null;
      const text = linkedImageUrl ? rawText.replace(linkedImageUrl, "").trim() : rawText;
      const imageUrl = isHardcore &&
        typeof input.imageUrl === "string" &&
        /^https?:\/\//i.test(input.imageUrl.trim()) &&
        input.imageUrl.trim().length <= 2048
        ? input.imageUrl.trim()
        : linkedImageUrl;
      if (!text && !imageUrl) return;
      const now = Date.now();
      const antiSpamResult = validateChatAttempt(me.chatUserId, now);
      if (!antiSpamResult.allowed) {
        sendChatAntiSpamRejection(conn, antiSpamResult);
        return;
      }

      const adminCommandText = normalizeAdminCommandText(text);
      if (adminCommandText) {
        if (!me.isAdmin) {
          adminNotice(conn, "You do not have permission to use administrator commands.");
          return;
        }
        room.broadcast({
          type: "chat",
          id: me.id,
          username: me.username,
          isAdmin: me.isAdmin,
          nametagColor: me.nametagColor || null,
          nametagText: me.nametagText || null,
          nametagPrefixVisible: me.nametagPrefixVisible !== false,
          checkmarkVisible: me.checkmarkVisible !== false,
          text,
          imageUrl,
          richText: isHardcore ? sanitizeHardcoreRichText(text) : null,
          command: true,
          t: Date.now(),
        });
        handleAdminCommand(me, adminCommandText, room);
        return;
      }
      const filtered = isBlockedChatMessage(me, text);
      const safeText = filterChatLinks(text);
      const renderedText = filtered ? maskChatText(safeText) : safeText;
      const richText = isHardcore ? sanitizeHardcoreRichText(renderedText) : null;

      const whisperTo = typeof input.whisperTo === "string"
        ? input.whisperTo.trim().slice(0, 32)
        : "";
      if (whisperTo) {
        const target = [...players.values()].find((player) =>
          player.username.toLowerCase() === whisperTo.toLowerCase()
        );
        if (!target) {
          conn.send({ type: "chatError", code: "whisperTargetNotFound", username: whisperTo });
          return;
        }
        const safeMessage = {
          type: "chat",
          id: conn.id,
          username: me.username,
          isAdmin: me.isAdmin,
          nametagColor: me.nametagColor || null,
          nametagText: me.nametagText || null,
          nametagPrefixVisible: me.nametagPrefixVisible !== false,
          checkmarkVisible: me.checkmarkVisible !== false,
          text: renderedText,
          imageUrl,
          richText,
          whisper: true,
          whisperPeer: target.username,
          whisperDirection: "sent",
          t: now,
        };
        // Route the received copy through the room transport instead of a
        // connection object cached in `players`. A reconnect can replace the
        // underlying connection while the player entry is still being
        // observed by this handler; room.broadcast always addresses the
        // current connection for each id.
        conn.send(safeMessage);
        if (target.id !== conn.id) {
          const excludedIds = [...players.keys()].filter((id) => id !== target.id);
          room.broadcast({
            ...safeMessage,
            whisperPeer: me.username,
            whisperDirection: "received",
          }, { except: excludedIds });
        }
        return;
      }

      // Chat is ephemeral room state: fan it out to every connected player.
      room.broadcast({
        type: "chat",
        id: conn.id,
        username: me.username,
        isAdmin: me.isAdmin,
        nametagColor: me.nametagColor || null,
        nametagText: me.nametagText || null,
        nametagPrefixVisible: me.nametagPrefixVisible !== false,
        checkmarkVisible: me.checkmarkVisible !== false,
        text: renderedText,
        imageUrl,
        richText,
        t: now,
      });
      return;
    }

    if (input.type === "heartbeat") {
      me.lastUpdate = Date.now();
      return;
    }

    if (input.type === "ping") {
      me.lastUpdate = Date.now();
      conn.send({ type: "pong", clientTime: Number(input.clientTime) || 0, serverTime: Date.now() });
      return;
    }

    if (input.type === "dropBurger") {
      if (!me.burgerCount || me.burgerCount <= 0) return;
      me.burgerCount -= 1;
      const providedId = typeof input.id === "string" && /^[\w:-]{1,80}$/.test(input.id.trim())
        ? input.id.trim()
        : `${me.id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const drop = {
        id: providedId,
        x: finite(input.x) ? input.x : me.x,
        y: finite(input.y) ? input.y : me.y,
        z: finite(input.z) ? input.z : me.z,
        ownerId: me.id,
      };
      droppedBurgers.push(drop);
      // The dropper renders its own burger immediately with this same id, so
      // everyone (including the dropper) is told to spawn it. Keeping one id
      // on both sides lets the dropper pick their own drop back up.
      room.broadcast(
        { type: "burgerDropped", id: drop.id, x: drop.x, y: drop.y, z: drop.z },
        { except: [me.id] }
      );
      return;
    }

    if (input.type === "pickupBurger") {
      const index = droppedBurgers.findIndex((b) => b.id === input.id);
      // Only block when the burger is unknown. A player is now free to pick up
      // dropped burgers even while already carrying one, so stray drops never
      // get stuck, and holding several burgers (duplicates) is allowed.
      if (index < 0) {
        return;
      }
      const burger = droppedBurgers[index];
      const dx = burger.x - me.x;
      const dy = burger.y - me.y;
      const dz = burger.z - me.z;
      if (Math.hypot(dx, dz) > DROPPED_BURGER_PICKUP_RADIUS || Math.abs(dy) > DROPPED_BURGER_PICKUP_Y) return;
      droppedBurgers.splice(index, 1);
      me.burgerCount += 1;
      room.broadcast({ type: "burgerTaken", id: burger.id });
      conn.send({ type: "burgerGranted" });
      if (me.inGame) {
        room.broadcast({
          type: "sound",
          id: me.id,
          sound: "burger",
          action: "play",
          x: me.x,
          y: me.y,
          z: me.z,
          t: Date.now(),
        });
      }
      return;
    }

    if (input.type !== "state") return;
    if (![input.x, input.y, input.z, input.facing].every(finite)) return;

    // "Play as a Guest": the client pins the wantGuest flag on its state
    // packets until the server confirms. State is a channel the game sends
    // constantly and provably reaches the server, unlike a standalone message
    // type. The server downgrades exactly once, then the client stops setting
    // the flag. This is server-authoritative — it can only downgrade to a
    // guest, never to an arbitrary name.
    if (input.wantGuest === true && !me.isGuest) {
      const guestName = `Guest ${nextGuestNumber++}`;
      me.isGuest = true;
      me.isAdmin = false;
      me.username = guestName;
      me.displayName = guestName;
      me.chatUserId = getConnectionUserId(conn, guestName, true);
      me.avatarUrl = null;
      me.avatarPreview = null;
      me.hairTexture = null;
      me.hats = [];
      me.hatStyles = {};
      me.hatAdjusts = {};
      me.customHat = null;
      me.customHats = [];
      me.hatTarget = null;
      me.hatTextures = {};
      me.nametagColor = null;
      me.nametagText = null;
      me.checkmarkVisible = false;
      me.forcedAvatar = false;
      me.emote = null;
      applyGuestAppearance(me);
      me.appearanceSignature = playerAppearanceSignature(me);
      broadcastPlayerUpdate(room, me, { forceGuest: true });
      conn.send({ type: "adminNotice", text: `You are now playing as ${guestName}` });
      conn.send({
        type: "welcome",
        id: me.id,
        username: guestName,
        isGuest: true,
        isAdmin: false,
        checkmarkVisible: false,
        backpackItems: [BURGER_ITEM_ID],
        burgerGripSettings: BURGER_GRIP_SETTINGS,
        chatAntiSpam: serializeChatAntiSpamState(me.chatUserId),
      });
    }

    if (input.y < VOID_RESET_Y) {
      const position = setServerTeleport(me, 0, 0, 0, 0);
      me.fly = false;
      me.flyNoclip = false;
      me.adminFlyGranted = false;
      me.adminFlyNoclip = false;
      me.flySpeed = 13;
      me.flyOverride = true;
      me.flyOverrideState = false;
      conn.send({ type: "adminReset", id: conn.id, ...position, pitch: 0, roll: 0 });
      // Anti-duplication: a player who falls to their death without a burger
      // gets one handed back, exactly once, so a dropped burger is never lost
      // or duplicated.
      if (!me.burgerCount || me.burgerCount <= 0) {
        me.burgerCount = 1;
        conn.send({ type: "burgerGranted" });
      }
      return;
    }

    const now = Date.now();
    if (me.teleportOverride) {
      const override = me.teleportOverride;
      const acknowledged = [input.x, input.y, input.z].every(finite) &&
        Math.hypot(input.x - override.x, input.y - override.y, input.z - override.z) < 1.25;
      // A command teleport must win over the stale local state that may have
      // been sent while the client was still processing the server event.
      me.x = override.x;
      me.y = override.y;
      me.z = override.z;
      me.facing = override.facing;
      me.pitch = 0;
      me.roll = 0;
      me.state = "Idle";
      me.animationTime = 0;
      me.lastUpdate = now;
      if (now >= me.teleportOverride.releaseAt && (acknowledged || now - me.teleportOverride.createdAt > 3000)) {
        me.teleportOverride = null;
      }
      return;
    }

    if (!me.forcedAvatar) {
      const previousAppearanceSignature = me.appearanceSignature || playerAppearanceSignature(me);
      if (me.isGuest) {
        applyGuestAppearance(me);
      } else {
        if (typeof input.avatarUrl === "string" &&
          /^https?:\/\//i.test(input.avatarUrl.trim()) &&
          input.avatarUrl.trim().length <= 2048) {
          me.avatarUrl = input.avatarUrl.trim();
        }
        if (input.rigType === "r15" || input.rigType === "r6") me.rigType = input.rigType;

        if (Array.isArray(input.hats)) {
          me.hats = input.hats.filter((id) => typeof id === "string").slice(0, 20);
        }
        if (input.hatStyles !== undefined) {
          me.hatStyles = sanitizeHatStyles(input.hatStyles);
        }
        if (input.hatAdjusts !== undefined) {
          me.hatAdjusts = sanitizeHatAdjusts(input.hatAdjusts, me.isAdmin);
        }
        if (input.customHats !== undefined && me.username.toLowerCase() === "hardcore") {
          me.customHats = sanitizeCustomHats(input.customHats, true);
          me.customHat = me.customHats[0] || null;
        } else if (input.customHat !== undefined && me.username.toLowerCase() === "hardcore") {
          me.customHats = sanitizeCustomHats(input.customHat, true);
          me.customHat = me.customHats[0] || null;
        }
        if (typeof input.hairTexture === "string" &&
          input.hairTexture.length <= LIVE_HAT_PAINT_MAX_LENGTH &&
          /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(input.hairTexture)) {
          me.hairTexture = input.hairTexture;
        }
        if (typeof input.hatTarget === "string" && /^[a-z0-9_-]{1,64}$/iu.test(input.hatTarget)) {
          me.hatTarget = input.hatTarget;
        }
        if (input.hatTextures !== undefined && input.hatTextures && typeof input.hatTextures === "object") {
          me.hatTextures = sanitizeHatTextures(input.hatTextures);
        }
      }
      const nextAppearanceSignature = playerAppearanceSignature(me);
      if (nextAppearanceSignature !== previousAppearanceSignature) {
        me.appearanceSignature = nextAppearanceSignature;
        broadcastPlayerUpdate(room, me);
      }
    }

    const elapsed = clamp((now - me.lastUpdate) / 1000, 0.05, 1);
    const previousPosition = { x: me.x, y: me.y, z: me.z };
    const dx = input.x - me.x;
    const dy = input.y - me.y;
    const dz = input.z - me.z;
    const distance = Math.hypot(dx, dy, dz);
    const maxDistance = MAX_SPEED * elapsed + 1.5;
    const scale = distance > maxDistance ? maxDistance / distance : 1;

    const requestedPosition = {
      x: me.x + dx * scale,
      y: me.y + dy * scale,
      z: me.z + dz * scale,
    };
    // Keep the same continuous character volume on the server so an update
    // cannot tunnel through another avatar between two 100ms snapshots.
    resolveServerPlayerMotion(me, requestedPosition, previousPosition);
    me.facing = input.facing;
    me.facingSnap = input.facingSnap === true;
    if (typeof input.collisionsEnabled === "boolean") {
      me.collisionsEnabled = input.collisionsEnabled;
      if (!me.collisionsEnabled) {
        me.pushVelocityX = 0;
        me.pushVelocityZ = 0;
      }
    }
    me.pitch = finite(input.pitch) ? clamp(input.pitch, -Math.PI / 2, Math.PI / 2) : 0;
    me.roll = finite(input.roll) ? clamp(input.roll, -Math.PI, Math.PI) : 0;
    const animation = typeof input.animation === "string" ? input.animation : input.state;
    me.state = typeof animation === "string" ? animation.slice(0, 16) : "Idle";
    me.animationTime = Number.isFinite(Number(input.animationTime))
      ? Math.max(0, Math.min(Number(input.animationTime), 120))
      : 0;
    // Keep the equipped flag separate from Tool animation; the server never
    // broadcasts a Tool animation without an equipped burger.
    const previousToolAnimToken = Number(me.toolAnimToken) || 0;
    me.burgerEquipped = input.burgerEquipped === true;
    if (!me.burgerEquipped || input.burgerGripActive !== true) {
      me.burgerGripUntil = 0;
      me.burgerGripActive = false;
    }
    me.toolAnim = input.toolAnim === true && me.burgerEquipped;
    if (Number.isFinite(Number(input.toolAnimToken))) {
      me.toolAnimToken = Math.max(me.toolAnimToken || 0, Math.floor(Number(input.toolAnimToken)));
    }
    if (me.burgerEquipped && input.burgerGripActive === true && me.toolAnimToken > previousToolAnimToken) {
      me.burgerGripUntil = now + BURGER_GRIP_DURATION_MS;
    }
    me.burgerGripActive = me.burgerEquipped && now < me.burgerGripUntil;
    // A token change is the authoritative burger equip/use event. The local
    // client plays its own copy immediately; this server broadcast makes the
    // same sound reach every other player at the trusted server position.
    if (
      me.burgerEquipped
      && me.toolAnim
      && me.toolAnimToken > previousToolAnimToken
    ) {
      if (me.inGame) {
        room.broadcast({
          type: "sound",
          id: conn.id,
          sound: "burger",
          action: "play",
          x: me.x,
          y: me.y,
          z: me.z,
          t: now,
        });
      }
    }
    if (typeof input.emote === "string" && /^Dance[123]$|^(?:Wave|Point|Laugh|Cheer)$/u.test(input.emote)) {
      me.emote = input.emote;
      if (Number.isFinite(Number(input.emoteToken))) {
        me.emoteToken = Math.max(0, Math.floor(Number(input.emoteToken)));
      }
    } else if (me.emote) {
      me.emote = null;
      me.emoteToken = (Number(me.emoteToken) || 0) + 1;
    }
    if (me.flyOverride) {
      const forcedFlyState = me.flyOverrideState === true;
      me.fly = forcedFlyState;
      me.flyNoclip = forcedFlyState && me.adminFlyNoclip;
      if (input.fly === forcedFlyState) {
        me.flyOverride = false;
        me.flyOverrideState = null;
      }
    } else if (me.adminFlyGranted) {
      // A grant from an admin is persistent for non-admin accounts. The
      // client cannot revoke or spoof it; only ;unfly, ;respawn, or another
      // server-side action can clear the grant.
      me.fly = true;
      me.flyNoclip = me.adminFlyNoclip === true;
    } else {
      me.fly = me.isAdmin && input.fly === true;
      me.flyNoclip = false;
    }
    me.lastUpdate = now;
  },

  async onTick(room) {
    const now = Date.now();
    for (const [id, player] of players) {
      if (now - Number(player.lastUpdate || 0) > STALE_PLAYER_MS) {
        removePlayer(id, room);
      }
    }
    for (const [id, player] of players) {
      if (player.burgerGripActive && now >= Number(player.burgerGripUntil || 0)) {
        player.burgerGripActive = false;
        player.burgerGripUntil = 0;
      }
      const physicsDt = clamp((now - (player.pushPhysicsAt || now)) / 1000, 0, 0.1);
      if (physicsDt > 0 && (Math.abs(player.pushVelocityX) > 0.001 || Math.abs(player.pushVelocityZ) > 0.001)) {
        integrateServerPush(player, physicsDt);
        const damping = Math.exp(-10 * physicsDt);
        player.pushVelocityX *= damping;
        player.pushVelocityZ *= damping;
      }
      player.pushPhysicsAt = now;
    }
    room.broadcast({
      type: "snapshot",
      t: now,
      players: getVisiblePlayers().map((player) => serializeSnapshotPlayer(player, false)),
      droppedBurgers: droppedBurgersSnapshot(),
    });
  },

  async onClose(conn, room) {
    // A transport may close just after a replacement session has already
    // claimed the same account. Never let the old close callback remove the
    // replacement player entry.
    if (players.get(conn.id)?.connection !== conn) return;
    removePlayer(conn.id, room);
  },
};
