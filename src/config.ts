// Every gameplay number lives here. Systems read `cfg` live each frame, so dev menu edits apply instantly.

export const defaults = {
  player: {
    moveSpeed: 200,
    shootSpeedMult: 0.5,
    shootSlowTime: 0.25,
    uniformScreenSpeed: true,
    screenSpeedMult: 1,
    accel: 4000,
    hitRadius: 6,
    bodyRadius: 10,
    invulnAfter: 0.2,
  },
  bow: {
    fireRate: 1,
    damage: 5,
    pierce: 0,
    arrowsPerShot: 1,
    spreadDeg: 3.5,
    arrowSpeed: 1000,
    arrowRange: 400,
    arrowHitRadius: 15,
    fireWhileDashing: true,
  },
  dash: {
    duration: 0.075,
    distance: 150,
    cooldown: 0.3,
    inputBuffer: 0.12,
    lockTime: 0,
    slideStartMult: 1,
    slideEndMult: 1,
    afterimages: 6,
    afterimageFade: 0.3,
  },
  abilities: {
    dash: true,
    teleport: true,
    fireFairy: true,
    iceFairy: true,
    swordSlash: true,
    doomsday: true,
  },
  teleport: {
    distance: 200,
    cooldown: 0.1,
    speed: 1667,
    lockTime: 0.2,
    slideStartMult: 1.5,
    slideEndMult: 0.3,
    armsUpTime: 0.6,
    zipTime: 0.06,
    lineFade: 0.1,
    lineWidth: 5,
    puffs: 5,
  },
  fireWave: {
    damage: 100,
    width: 150,
    length: 50,
    speed: 1000,
    cooldown: 8,
    tongueSpacing: 6,
    embers: 180,
    burnDps: 5,
    burnTime: 5,
    burnTick: 1,
    groundTime: 3,
    groundSpacing: 40,
  },
  swordSlash: {
    coneDamage: 100,
    slamDamage: 250,
    coneAngle: 200,
    coneRange: 200,
    slamWidth: 100,
    slamLength: 500,
    telegraphTime: 0.15,
    slashTime: 0.1,
    armTime: 5,
    charges: 3,
    effectTime: 1.25,
    cooldown: 10,
    windupAngle: 30,
    sweepPower: 2.5,
    slamShake: 6,
    orbitRadius: 70,
    orbitSpeed: 1.1,
    height: 14,
  },
  world: {
    despawnRadius: 3000,
  },
  run: {
    baseTime: 15,
    lengthOverride: 0,
    deathShake: 10,
    deathSmoke: 30,
  },
  xp: {
    perKill: 1,
    curveBase: 10,
    curveExp: 1.5,
    pointsPerLevel: 1,
  },
  gold: {
    perKill: 1,
    pickupRadius: 90,
    pullSpeed: 500,
    pullAccel: 1800,
    maxPiles: 600,
    cellSize: 128,
    scale: 1,
    glow: 0.9,
    valueScale: 0.12,
    glowSize: 0.45,
  },
  upgrade: {
    fireRate: 0.25,
    pierce: 1,
    time: 10,
    moveSpeed: 0.25,
    damage: 1,
    range: 0.25,
    moreFireRate: 0.5,
    moreBullets: 1,
    killTime: 0.5,
    moreDamage: 10,
    goldValue: 1,
    doubleGold: 1,
    quadGold: 2,
    moreMoreBullets: 1,
    moreMorePierce: 1,
    biggerArrows: 0.1,
    pickupRadius: 0.5,
    dustPerKill: 0.01,
    dustCap: 0.25,
    dustHold: 1,
    dustDuration: 3,
  },
  tree: {
    free: false,
    costScale: 1.5,
    revealAll: false,
    nodeSize: 1,
    showLines: true,
  },
  spawn: {
    enabled: true,
    maxEnemies: 250,
    startRate: 2,
    holdTime: 10,
    maxRate: 50,
    rampEnd: 180,
    rateCurve: 2,
    hpStart: 10,
    hpMax: 100,
    hpCurve: 3,
    directionBias: 0.8,
    screenMargin: 60,
    despawnMargin: 500,
  },
  enemy: {
    uniformScreenSpeed: true,
    turnRate: 6,
    separation: 0.5,
    separationRate: 14,
    contactScale: 0.6,
    knockback: 80,
    knockbackDecay: 12,
    avoidLookahead: 70,
    bobHeight: 1.5,
    bobSpeed: 3,
    hemFlicker: 6,
    deathSmoke: 8,
    deathFlash: 0.6,
  },
  wraith: {
    speedMult: 0.6,
    hpMult: 1,
    radius: 20,
    scale: 1,
    appearAt: 0,
    weight: 1,
  },
  shade: {
    speedMult: 0.85,
    hpMult: 0.5,
    radius: 20,
    scale: 0.85,
    appearAt: 30,
    weight: 0.35,
  },
  husk: {
    speedMult: 0.4,
    hpMult: 3,
    radius: 20,
    scale: 1.6,
    appearAt: 90,
    weight: 0.2,
  },
  map: {
    seed: 1,
    chunkSize: 512,
    decorPerChunk: 5,
    burningChance: 0.2,
    obstacleChance: 0,
    obstacleMinRadius: 30,
    obstacleMaxRadius: 60,
    safeRadius: 300,
    lightRadius: 140,
    lightAlpha: 0.35,
    lightFlicker: 0.3,
    flameRate: 10,
  },
  iceStorm: {
    damage: 10,
    radius: 160,
    duration: 5,
    ticksPerSecond: 5,
    slow: 0.5,
    cooldown: 20,
    snow: 45,
    bossFreeze: 1,
    bossFreezeCooldown: 6,
  },
  doomsday: {
    damage: 100,
    radius: 150,
    stunRadiusMult: 1.5,
    knockback: 1400,
    cooldown: 8,
    maxRange: 700,
    windup: 0.55,
    shake: 28,
    flash: 0.6,
  },
  fairy: {
    orbitRadius: 30,
    orbitSpeed: 1.5,
    height: 28,
    bob: 3,
    followRate: 3,
    glowSize: 15,
    glowWave: 0.3,
    trailRate: 20,
    flareTime: 0.4,
    travelRate: 5,
    attachHeight: 14,
  },
  cloak: {
    segments: 4,
    length: 9,
    width: 8,
    gravity: 760,
    drag: 20,
    eyeGlow: 0.4,
  },
  camera: {
    followRate: 12,
    shakeOnCast: 4,
    shakeOnHit: 2,
    shakeDecay: 18,
  },
  feel: {
    hitFlashTime: 0.06,
    bowKickTime: 0.5,
    strideLength: 140,
    walkBob: 1.5,
    armReadyTime: 0.6,
    shootPoseTime: 0.08,
    shootArmSpread: 7,
    shootArmDrop: -10,
    shootFlapRate: 8,
    bowFloatDistance: 30,
    bowPhaseInTime: 0.06,
    bowPhaseOutTime: 0.3,
    handGlow: 0.8,
    bowFloatBob: 1.5,
    drawTime: 0.3,
    drawDistance: 6,
    armLength: 3,
    walkArmSpread: 14,
    walkArmDrop: 2,
    walkArmFlap: 7.5,
    damageNumbers: true,
  },
  dummy: {
    hp: 50,
    count: 8,
    ringRadius: 220,
    radius: 12,
    respawnTime: 1,
  },
  render: {
    isoScale: Math.SQRT1_2,
    pixelScale: 2,
    tileSize: 64,
    arrowScale: 3.375,
    bowScale: 1,
    arrowHeight: 20,
    aimHeight: 20,
    vignette: 0.85,
  },
  boss: {
    enabled: true,
    spawnTime: 80,
    waveTime: 78,
    resumeTime: 90,
    waveSpeed: 1600,
    waveRadius: 1500,
    waveShake: 14,
    hp: 2000,
    radius: 22,
    size: 1.5625,
    flicker: 0.45,
    auraSize: 34,
    auraWave: 0.3,
    auraAlpha: 0.7,
    portalRadius: 70,
    portalTime: 1.5,
    riseTime: 1,
    closeTime: 0.4,
    teleportLineWidth: 8,
    spawnDistance: 320,
    closeDistance: 150,
    chaseRangeMult: 2.5,
    walkSpeedMult: 0.8,
    teleportGap: 0.2,
    windup: 0.8,
    aimLockTime: 0.12,
    recover: 1.2,
    dodgeChance: 0.25,
    rewardGold: 100,
    rewardSkillPoints: 1,
    deathSmoke: 90,
    deathShake: 14,
  },
  stun: {
    duration: 1,
  },
  hub: {
    shakeInterval: 3,
    shakeStrength: 5,
    walkSpeed: 190,
    hintTime: 2,
    skipIntro: false,
    cutsceneSpeed: 1,
    heartbeatPeriod: 1.6,
    ambientStart: 0.95,
    ambientHall: 0.28,
    ambientThrone: 0.5,
    lightRadius: 300,
    textSize: 34,
    zoom: 1.25,
  },
  entry: {
    swirlTime: 1.2,
    swirlTurns: 0.75,
    swirlZoom: 2.2,
    diveTime: 1,
    diveHeight: 900,
    blastRadius: 260,
    blastShake: 26,
    blastFlash: 0.55,
    hintTime: 4,
  },
  time: {
    timeScale: 1,
  },
  debug: {
    showHitboxes: false,
    showStats: true,
    godMode: false,
    skillMove: false,
    unlockAll: false,
  },
};

export type Config = typeof defaults;
export type Section = keyof Config;

export type Param = { min: number; max: number; step: number } | 'bool';

function kindMeta() {
  return {
    speedMult: { min: 0.05, max: 2, step: 0.05 },
    hpMult: { min: 0.05, max: 20, step: 0.05 },
    radius: { min: 2, max: 80, step: 1 },
    scale: { min: 0.3, max: 4, step: 0.05 },
    appearAt: { min: 0, max: 600, step: 5 },
    weight: { min: 0, max: 5, step: 0.05 },
  };
}

// Ranges for the dev menu. The type forces an entry for every config value.
export const meta: { [S in Section]: { [K in keyof Config[S]]: Param } } = {
  player: {
    moveSpeed: { min: 50, max: 800, step: 5 },
    shootSpeedMult: { min: 0.1, max: 1.5, step: 0.05 },
    shootSlowTime: { min: 0, max: 2, step: 0.05 },
    uniformScreenSpeed: 'bool',
    screenSpeedMult: { min: 0.3, max: 2, step: 0.05 },
    accel: { min: 200, max: 20000, step: 100 },
    hitRadius: { min: 1, max: 30, step: 1 },
    invulnAfter: { min: 0, max: 2, step: 0.05 },
    bodyRadius: { min: 1, max: 40, step: 1 },
  },
  bow: {
    fireRate: { min: 0.1, max: 20, step: 0.1 },
    damage: { min: 1, max: 500, step: 1 },
    pierce: { min: 0, max: 20, step: 1 },
    arrowsPerShot: { min: 1, max: 15, step: 1 },
    spreadDeg: { min: 0, max: 45, step: 0.5 },
    arrowSpeed: { min: 100, max: 3000, step: 10 },
    arrowRange: { min: 50, max: 2000, step: 10 },
    arrowHitRadius: { min: 1, max: 40, step: 1 },
    fireWhileDashing: 'bool',
  },
  dash: {
    duration: { min: 0.02, max: 1, step: 0.01 },
    distance: { min: 0, max: 800, step: 5 },
    cooldown: { min: 0, max: 5, step: 0.05 },
    inputBuffer: { min: 0, max: 0.5, step: 0.01 },
    lockTime: { min: 0, max: 1, step: 0.05 },
    slideStartMult: { min: 0, max: 4, step: 0.05 },
    slideEndMult: { min: 0, max: 4, step: 0.05 },
    afterimages: { min: 0, max: 20, step: 1 },
    afterimageFade: { min: 0.05, max: 1.5, step: 0.05 },
  },
  abilities: {
    dash: 'bool',
    teleport: 'bool',
    fireFairy: 'bool',
    iceFairy: 'bool',
    swordSlash: 'bool',
    doomsday: 'bool',
  },
  teleport: {
    distance: { min: 50, max: 1000, step: 10 },
    cooldown: { min: 0, max: 10, step: 0.05 },
    speed: { min: 0, max: 8000, step: 50 },
    lockTime: { min: 0, max: 1, step: 0.05 },
    slideStartMult: { min: 0, max: 4, step: 0.05 },
    slideEndMult: { min: 0, max: 4, step: 0.05 },
    armsUpTime: { min: 0, max: 3, step: 0.05 },
    zipTime: { min: 0.01, max: 0.5, step: 0.01 },
    lineFade: { min: 0.05, max: 2, step: 0.05 },
    lineWidth: { min: 0.5, max: 10, step: 0.5 },
    puffs: { min: 0, max: 60, step: 1 },
  },
  fireWave: {
    damage: { min: 1, max: 5000, step: 1 },
    width: { min: 40, max: 800, step: 10 },
    length: { min: 10, max: 300, step: 5 },
    speed: { min: 50, max: 2000, step: 10 },
    cooldown: { min: 0, max: 30, step: 0.1 },
    tongueSpacing: { min: 6, max: 60, step: 1 },
    embers: { min: 0, max: 300, step: 5 },
    burnDps: { min: 0, max: 500, step: 1 },
    burnTime: { min: 0, max: 30, step: 0.5 },
    burnTick: { min: 0.1, max: 3, step: 0.1 },
    groundTime: { min: 0, max: 30, step: 0.5 },
    groundSpacing: { min: 20, max: 300, step: 10 },
  },
  swordSlash: {
    coneDamage: { min: 1, max: 2000, step: 1 },
    slamDamage: { min: 1, max: 2000, step: 1 },
    coneAngle: { min: 10, max: 360, step: 1 },
    coneRange: { min: 40, max: 600, step: 5 },
    slamWidth: { min: 10, max: 400, step: 5 },
    slamLength: { min: 40, max: 800, step: 5 },
    telegraphTime: { min: 0.02, max: 2, step: 0.01 },
    slashTime: { min: 0.02, max: 1, step: 0.01 },
    armTime: { min: 1, max: 30, step: 0.5 },
    charges: { min: 1, max: 9, step: 1 },
    effectTime: { min: 0.05, max: 2, step: 0.05 },
    cooldown: { min: 0, max: 30, step: 0.1 },
    windupAngle: { min: 0, max: 90, step: 1 },
    sweepPower: { min: 1, max: 5, step: 0.1 },
    slamShake: { min: 0, max: 30, step: 0.5 },
    orbitRadius: { min: 20, max: 200, step: 1 },
    orbitSpeed: { min: 0, max: 8, step: 0.1 },
    height: { min: 0, max: 60, step: 1 },
  },
  world: {
    despawnRadius: { min: 300, max: 4000, step: 50 },
  },
  run: {
    baseTime: { min: 1, max: 600, step: 1 },
    lengthOverride: { min: 0, max: 900, step: 5 },
    deathShake: { min: 0, max: 40, step: 1 },
    deathSmoke: { min: 0, max: 100, step: 1 },
  },
  xp: {
    perKill: { min: 0, max: 100, step: 1 },
    curveBase: { min: 1, max: 500, step: 1 },
    curveExp: { min: 0.5, max: 3, step: 0.05 },
    pointsPerLevel: { min: 0, max: 10, step: 1 },
  },
  gold: {
    perKill: { min: 0, max: 100, step: 1 },
    pickupRadius: { min: 10, max: 600, step: 5 },
    pullSpeed: { min: 50, max: 3000, step: 10 },
    pullAccel: { min: 0, max: 10000, step: 100 },
    maxPiles: { min: 50, max: 3000, step: 50 },
    cellSize: { min: 32, max: 512, step: 16 },
    scale: { min: 0.3, max: 4, step: 0.1 },
    glow: { min: 0, max: 2, step: 0.05 },
    valueScale: { min: 0, max: 1, step: 0.01 },
    glowSize: { min: 0.1, max: 2, step: 0.05 },
  },
  upgrade: {
    fireRate: { min: 0, max: 2, step: 0.05 },
    pierce: { min: 0, max: 10, step: 1 },
    time: { min: 0, max: 60, step: 1 },
    moveSpeed: { min: 0, max: 2, step: 0.05 },
    damage: { min: 0, max: 100, step: 1 },
    range: { min: 0, max: 2, step: 0.05 },
    moreFireRate: { min: 0, max: 2, step: 0.05 },
    moreBullets: { min: 0, max: 10, step: 1 },
    killTime: { min: 0, max: 10, step: 0.1 },
    moreDamage: { min: 0, max: 200, step: 1 },
    goldValue: { min: 0, max: 20, step: 1 },
    doubleGold: { min: 0, max: 5, step: 0.5 },
    quadGold: { min: 0, max: 10, step: 0.5 },
    moreMoreBullets: { min: 0, max: 10, step: 1 },
    moreMorePierce: { min: 0, max: 10, step: 1 },
    biggerArrows: { min: 0, max: 1, step: 0.05 },
    pickupRadius: { min: 0, max: 2, step: 0.05 },
    dustPerKill: { min: 0, max: 0.2, step: 0.005 },
    dustCap: { min: 0, max: 2, step: 0.05 },
    dustHold: { min: 0, max: 10, step: 0.5 },
    dustDuration: { min: 0.5, max: 20, step: 0.5 },
  },
  tree: {
    free: 'bool',
    costScale: { min: 1, max: 4, step: 0.05 },
    revealAll: 'bool',
    nodeSize: { min: 0.4, max: 2, step: 0.05 },
    showLines: 'bool',
  },
  spawn: {
    enabled: 'bool',
    maxEnemies: { min: 0, max: 1000, step: 10 },
    startRate: { min: 0, max: 50, step: 0.5 },
    holdTime: { min: 0, max: 120, step: 1 },
    maxRate: { min: 0, max: 200, step: 1 },
    rampEnd: { min: 30, max: 900, step: 10 },
    rateCurve: { min: 0.2, max: 5, step: 0.1 },
    hpStart: { min: 1, max: 1000, step: 1 },
    hpMax: { min: 1, max: 20000, step: 10 },
    hpCurve: { min: 0.2, max: 8, step: 0.1 },
    directionBias: { min: 0, max: 1, step: 0.05 },
    screenMargin: { min: 0, max: 400, step: 10 },
    despawnMargin: { min: 50, max: 2000, step: 25 },
  },
  enemy: {
    uniformScreenSpeed: 'bool',
    turnRate: { min: 0.5, max: 30, step: 0.5 },
    separation: { min: 0, max: 1, step: 0.05 },
    separationRate: { min: 0, max: 60, step: 1 },
    contactScale: { min: 0.1, max: 1.5, step: 0.05 },
    knockback: { min: 0, max: 500, step: 5 },
    knockbackDecay: { min: 1, max: 40, step: 1 },
    avoidLookahead: { min: 0, max: 300, step: 5 },
    bobHeight: { min: 0, max: 8, step: 0.5 },
    bobSpeed: { min: 0, max: 12, step: 0.5 },
    hemFlicker: { min: 0, max: 20, step: 0.5 },
    deathSmoke: { min: 0, max: 40, step: 1 },
    deathFlash: { min: 0, max: 2, step: 0.05 },
  },
  wraith: kindMeta(),
  shade: kindMeta(),
  husk: kindMeta(),
  map: {
    seed: { min: 1, max: 9999, step: 1 },
    chunkSize: { min: 128, max: 2048, step: 64 },
    decorPerChunk: { min: 0, max: 40, step: 1 },
    burningChance: { min: 0, max: 1, step: 0.05 },
    obstacleChance: { min: 0, max: 1, step: 0.01 },
    obstacleMinRadius: { min: 10, max: 200, step: 5 },
    obstacleMaxRadius: { min: 10, max: 300, step: 5 },
    safeRadius: { min: 0, max: 1500, step: 25 },
    lightRadius: { min: 20, max: 500, step: 5 },
    lightAlpha: { min: 0, max: 1, step: 0.05 },
    lightFlicker: { min: 0, max: 1, step: 0.05 },
    flameRate: { min: 0, max: 60, step: 1 },
  },
  iceStorm: {
    damage: { min: 1, max: 1000, step: 1 },
    radius: { min: 30, max: 600, step: 5 },
    duration: { min: 0.5, max: 30, step: 0.5 },
    ticksPerSecond: { min: 0.5, max: 30, step: 0.5 },
    slow: { min: 0, max: 0.95, step: 0.05 },
    cooldown: { min: 0, max: 60, step: 0.5 },
    snow: { min: 0, max: 200, step: 5 },
    bossFreeze: { min: 0, max: 10, step: 0.1 },
    bossFreezeCooldown: { min: 0, max: 30, step: 0.5 },
  },
  doomsday: {
    damage: { min: 1, max: 10000, step: 10 },
    radius: { min: 40, max: 600, step: 5 },
    stunRadiusMult: { min: 1, max: 4, step: 0.1 },
    knockback: { min: 0, max: 4000, step: 50 },
    cooldown: { min: 0, max: 60, step: 0.5 },
    maxRange: { min: 100, max: 2000, step: 50 },
    windup: { min: 0.05, max: 2, step: 0.05 },
    shake: { min: 0, max: 80, step: 1 },
    flash: { min: 0, max: 1, step: 0.05 },
  },
  fairy: {
    orbitRadius: { min: 10, max: 120, step: 1 },
    orbitSpeed: { min: 0, max: 8, step: 0.1 },
    height: { min: 0, max: 80, step: 1 },
    bob: { min: 0, max: 15, step: 0.5 },
    glowSize: { min: 2, max: 60, step: 1 },
    glowWave: { min: 0, max: 1, step: 0.05 },
    followRate: { min: 1, max: 30, step: 0.5 },
    trailRate: { min: 0, max: 100, step: 1 },
    flareTime: { min: 0.05, max: 2, step: 0.05 },
    travelRate: { min: 0.5, max: 30, step: 0.5 },
    attachHeight: { min: 0, max: 60, step: 1 },
  },
  cloak: {
    segments: { min: 3, max: 12, step: 1 },
    length: { min: 8, max: 50, step: 1 },
    width: { min: 4, max: 30, step: 1 },
    gravity: { min: 0, max: 2000, step: 20 },
    drag: { min: 0, max: 20, step: 0.2 },
    eyeGlow: { min: 0, max: 1.5, step: 0.05 },
  },
  camera: {
    followRate: { min: 1, max: 60, step: 1 },
    shakeOnCast: { min: 0, max: 30, step: 0.5 },
    shakeOnHit: { min: 0, max: 20, step: 0.5 },
    shakeDecay: { min: 1, max: 60, step: 1 },
  },
  feel: {
    hitFlashTime: { min: 0, max: 0.5, step: 0.01 },
    bowKickTime: { min: 0, max: 0.5, step: 0.01 },
    strideLength: { min: 40, max: 400, step: 5 },
    walkBob: { min: 0, max: 5, step: 0.1 },
    armReadyTime: { min: 0, max: 3, step: 0.05 },
    shootPoseTime: { min: 0.005, max: 1, step: 0.005 },
    shootArmSpread: { min: 0, max: 30, step: 0.5 },
    shootArmDrop: { min: -20, max: 15, step: 0.5 },
    shootFlapRate: { min: 0, max: 60, step: 1 },
    bowFloatDistance: { min: 0, max: 80, step: 1 },
    bowPhaseInTime: { min: 0.005, max: 1, step: 0.005 },
    bowPhaseOutTime: { min: 0.005, max: 2, step: 0.05 },
    handGlow: { min: 0, max: 2, step: 0.05 },
    bowFloatBob: { min: 0, max: 8, step: 0.5 },
    drawTime: { min: 0.02, max: 1.5, step: 0.01 },
    drawDistance: { min: 0, max: 12, step: 0.5 },
    armLength: { min: 3, max: 15, step: 0.5 },
    walkArmSpread: { min: 0, max: 30, step: 0.5 },
    walkArmDrop: { min: -10, max: 15, step: 0.5 },
    walkArmFlap: { min: 0, max: 8, step: 0.5 },
    damageNumbers: 'bool',
  },
  dummy: {
    hp: { min: 1, max: 5000, step: 1 },
    count: { min: 1, max: 64, step: 1 },
    ringRadius: { min: 40, max: 800, step: 10 },
    radius: { min: 2, max: 60, step: 1 },
    respawnTime: { min: 0, max: 10, step: 0.1 },
  },
  render: {
    isoScale: { min: 0.3, max: 1.5, step: 0.01 },
    pixelScale: { min: 1, max: 6, step: 1 },
    tileSize: { min: 16, max: 256, step: 8 },
    arrowScale: { min: 0.5, max: 10, step: 0.125 },
    bowScale: { min: 0.3, max: 3, step: 0.05 },
    arrowHeight: { min: 0, max: 40, step: 1 },
    aimHeight: { min: 0, max: 80, step: 1 },
    vignette: { min: 0, max: 1, step: 0.05 },
  },
  boss: {
    enabled: 'bool',
    spawnTime: { min: 10, max: 600, step: 5 },
    waveTime: { min: 5, max: 600, step: 1 },
    resumeTime: { min: 5, max: 600, step: 1 },
    waveSpeed: { min: 200, max: 6000, step: 100 },
    waveRadius: { min: 300, max: 4000, step: 100 },
    waveShake: { min: 0, max: 40, step: 1 },
    hp: { min: 100, max: 100000, step: 100 },
    radius: { min: 8, max: 60, step: 1 },
    size: { min: 0.5, max: 3, step: 0.05 },
    flicker: { min: 0, max: 1, step: 0.05 },
    auraSize: { min: 5, max: 120, step: 1 },
    auraWave: { min: 0, max: 1, step: 0.05 },
    auraAlpha: { min: 0, max: 1, step: 0.05 },
    portalRadius: { min: 10, max: 150, step: 5 },
    portalTime: { min: 0.1, max: 3, step: 0.05 },
    riseTime: { min: 0.1, max: 4, step: 0.05 },
    closeTime: { min: 0.1, max: 3, step: 0.05 },
    teleportLineWidth: { min: 1, max: 30, step: 1 },
    spawnDistance: { min: 100, max: 1500, step: 10 },
    closeDistance: { min: 50, max: 400, step: 5 },
    chaseRangeMult: { min: 1, max: 6, step: 0.1 },
    walkSpeedMult: { min: 0.2, max: 2, step: 0.05 },
    teleportGap: { min: 0, max: 5, step: 0.1 },
    windup: { min: 0.1, max: 2, step: 0.05 },
    aimLockTime: { min: 0, max: 1, step: 0.01 },
    recover: { min: 0, max: 3, step: 0.05 },
    dodgeChance: { min: 0, max: 1, step: 0.05 },
    rewardGold: { min: 0, max: 10000, step: 10 },
    rewardSkillPoints: { min: 0, max: 50, step: 1 },
    deathSmoke: { min: 0, max: 300, step: 5 },
    deathShake: { min: 0, max: 40, step: 1 },
  },
  stun: {
    duration: { min: 0, max: 10, step: 0.1 },
  },
  hub: {
    shakeInterval: { min: 0.5, max: 10, step: 0.5 },
    shakeStrength: { min: 0, max: 20, step: 0.5 },
    walkSpeed: { min: 50, max: 500, step: 10 },
    hintTime: { min: 0.5, max: 8, step: 0.5 },
    skipIntro: 'bool',
    cutsceneSpeed: { min: 0.5, max: 4, step: 0.1 },
    heartbeatPeriod: { min: 0.6, max: 4, step: 0.1 },
    ambientStart: { min: 0, max: 1, step: 0.01 },
    ambientHall: { min: 0, max: 1, step: 0.01 },
    ambientThrone: { min: 0, max: 1, step: 0.01 },
    lightRadius: { min: 100, max: 700, step: 10 },
    textSize: { min: 18, max: 64, step: 1 },
    zoom: { min: 0.8, max: 2.5, step: 0.05 },
  },
  entry: {
    swirlTime: { min: 0.2, max: 4, step: 0.1 },
    swirlTurns: { min: 0, max: 3, step: 0.05 },
    swirlZoom: { min: 1, max: 5, step: 0.1 },
    diveTime: { min: 0.1, max: 2, step: 0.05 },
    diveHeight: { min: 200, max: 2000, step: 50 },
    blastRadius: { min: 40, max: 400, step: 10 },
    blastShake: { min: 0, max: 40, step: 1 },
    blastFlash: { min: 0, max: 1, step: 0.05 },
    hintTime: { min: 0.5, max: 8, step: 0.5 },
  },
  time: {
    timeScale: { min: 0, max: 4, step: 0.05 },
  },
  debug: {
    showHitboxes: 'bool',
    showStats: 'bool',
    godMode: 'bool',
    skillMove: 'bool',
    unlockAll: 'bool',
  },
};

type Values = { [section: string]: { [key: string]: number | boolean } };

export const cfg: Config = structuredClone(defaults);

const CURRENT_KEY = 'heaven.config.v1';
const PRESETS_KEY = 'heaven.configPresets.v1';

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked; tweaks just won't persist.
  }
}

export function getValue(section: string, key: string): number | boolean {
  return (cfg as unknown as Values)[section][key];
}

export function getDefault(section: string, key: string): number | boolean {
  return (defaults as unknown as Values)[section][key];
}

export function setValue(section: string, key: string, value: number | boolean): void {
  (cfg as unknown as Values)[section][key] = value;
  scheduleSave();
}

// Copies only known keys with matching types, so old or hand-edited JSON can't break the config.
export function applyValues(src: unknown): void {
  if (!src || typeof src !== 'object') return;
  const target = cfg as unknown as Values;
  for (const [section, entries] of Object.entries(src as Values)) {
    if (!(section in target) || !entries || typeof entries !== 'object') continue;
    for (const [key, value] of Object.entries(entries)) {
      if (key in target[section] && typeof value === typeof target[section][key]) {
        target[section][key] = value;
      }
    }
  }
  scheduleSave();
}

// Only values that differ from defaults, so changing a default in code still takes effect.
export function overrides(): Values {
  const out: Values = {};
  const cur = cfg as unknown as Values;
  const def = defaults as unknown as Values;
  for (const section of Object.keys(def)) {
    for (const key of Object.keys(def[section])) {
      if (cur[section][key] !== def[section][key]) (out[section] ??= {})[key] = cur[section][key];
    }
  }
  return out;
}

export function resetAll(): void {
  applyValues(structuredClone(defaults));
}

let saveTimer: number | undefined;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => storageSet(CURRENT_KEY, JSON.stringify(overrides())), 250);
}

export function loadSavedConfig(): void {
  const raw = storageGet(CURRENT_KEY);
  if (!raw) return;
  try {
    applyValues(JSON.parse(raw));
  } catch {
    storageSet(CURRENT_KEY, null);
  }
}

export function exportJson(): string {
  return JSON.stringify(overrides(), null, 2);
}

export function importJson(text: string): void {
  resetAll();
  applyValues(JSON.parse(text));
}

export function listPresets(): Record<string, Values> {
  try {
    return JSON.parse(storageGet(PRESETS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function savePreset(name: string): void {
  const presets = listPresets();
  presets[name] = overrides();
  storageSet(PRESETS_KEY, JSON.stringify(presets));
}

export function loadPreset(name: string): void {
  const preset = listPresets()[name];
  if (!preset) return;
  resetAll();
  applyValues(preset);
}

export function deletePreset(name: string): void {
  const presets = listPresets();
  delete presets[name];
  storageSet(PRESETS_KEY, JSON.stringify(presets));
}
