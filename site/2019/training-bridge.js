(function () {
  "use strict";

  const CANDIDATE_SKILL = 9;
  const CUSTOM_OPPONENT_SKILL = 10;
  const originalRandom = Math.random;
  const activeTacticsBySide = new Map();
  const tacticalDefaults = Object.freeze({
    threePointChance: 0.2,
    longThreeOffset: 0,
    stepBackTriggerRange: 0,
    stepBackChance: 0,
    stepBackDuration: 0.16,
    stepBackReleaseDelay: 0.08,
    defenseGap: 60,
    stealRange: 80,
    blockRange: 180,
    reboundRange: 60,
    reboundHeight: 70,
    reboundLead: 0,
    dunkDashDistance: 0,
    dunkLaunchDistance: 0,
    dashPressureRange: 100
  });
  const statusElement = () => document.getElementById("trainer-status");

  function status(message) {
    const element = statusElement();
    if (element) element.textContent = message;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitFor(predicate, timeout = 30000, label = "condition") {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      try {
        const value = predicate();
        if (value) return value;
      } catch {
        // The game is still constructing this object graph.
      }
      await sleep(25);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function seededRandom() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function modules() {
    const requireModule = window.__BS2019_REQUIRE__;
    if (!requireModule) throw new Error("The patched 2019 module loader is unavailable");
    return {
      engine: requireModule(2),
      states: requireModule(11),
      constants: requireModule(3).default,
      aiSkills: requireModule(52).AISkillsData
    };
  }

  function phaserGame() {
    const game = window.Phaser?.GAMES?.[0];
    if (!game) throw new Error("Phaser game instance is unavailable");
    return game;
  }

  function ensureSkillProfiles(aiSkills) {
    if (aiSkills.botsSkills.length < 9) {
      throw new Error(`Expected at least 9 native skill profiles, found ${aiSkills.botsSkills.length}`);
    }
  }

  function sanitizeProfile(parameters, fallback) {
    const result = { ...fallback };
    for (const [key, value] of Object.entries(parameters || {})) {
      if (Object.hasOwn(fallback, key) && Number.isFinite(Number(value))) {
        result[key] = Number(value);
      }
    }
    return result;
  }

  function unpackAgent(agent) {
    if (agent && agent.parameters) {
      const tactics = agent.tactics
        ? Object.fromEntries(Object.entries({ ...tacticalDefaults, ...agent.tactics }).filter(
          ([, value]) => Number.isFinite(Number(value))
        ))
        : null;
      return { parameters: agent.parameters, tactics };
    }
    return { parameters: agent, tactics: null };
  }

  function applyTacticalPolicy(controller, tactics) {
    const player = controller.player;
    const opponent = controller.opponent;
    const ball = controller.ball;
    if (!player || !opponent || !ball || !player.body || !opponent.body || !ball.body) return;

    const playerX = player.getX();
    const opponentX = opponent.getX();
    const distance = Math.abs(playerX - opponentX);
    const side = controller.SIDE;
    const delta = Number(controller.__tacticalDelta) || 0.025;
    if (Number.isFinite(tactics.threePointChance)) {
      controller.chanceForThree = Math.max(0, Math.min(1, tactics.threePointChance));
    }

    controller.__stepBackCooldown = Math.max(0, (controller.__stepBackCooldown || 0) - delta);

    if (controller.__stepBackPhase) {
      if (!player.withBall) {
        controller.__stepBackPhase = 0;
        controller.__stepBackCooldown = 0.8;
      } else if (controller.__stepBackPhase === 1) {
        controller.currentMove = side;
        controller.currentAction = false;
        controller.currentJump = false;
        if (player.readyForDash) controller.currentDash = side;
        controller.__stepBackTimer -= delta;
        if (controller.__stepBackTimer <= 0) controller.__stepBackPhase = 2;
        return;
      } else if (controller.__stepBackPhase === 2) {
        controller.currentMove = 0;
        controller.currentAction = false;
        controller.currentJump = true;
        if (!player.isGrounded) {
          controller.__stepBackPhase = 3;
          controller.__stepBackTimer = tactics.stepBackReleaseDelay;
        }
        return;
      } else if (controller.__stepBackPhase === 3) {
        controller.currentMove = 0;
        controller.currentJump = false;
        controller.__stepBackTimer -= delta;
        controller.currentAction = controller.__stepBackTimer <= 0 && player.canThrow;
        return;
      }
    }

    if (opponent.withBall) {
      controller.__stepBackConsidered = false;
      const target = opponentX + side * tactics.defenseGap;
      controller.currentMove = controller.moveToo(target);
      if (player.canAct && opponent.isGrounded && distance <= tactics.stealRange) {
        controller.currentAction = true;
      }
      const realShot = !opponent.isGrounded &&
        (opponent.canThrow || ball.state === "inHands" || ball.state === "shooting");
      if (player.isGrounded && realShot && distance <= tactics.blockRange) {
        controller.currentAction = false;
        controller.currentJump = true;
      }
      return;
    }

    if (!player.withBall) {
      controller.__stepBackConsidered = false;
      const ballX = ball.getX();
      const ballAbove = player.getY() - ball.getY();
      const velocityX = Number(ball.body.velocity?.x) || 0;
      const velocityY = Number(ball.body.velocity?.y) || 0;
      const predictedBallX = Math.max(0, Math.min(controller.width, ballX + velocityX * tactics.reboundLead));
      controller.currentMove = controller.moveToo(predictedBallX);
      if (
        player.isGrounded &&
        Math.abs(playerX - ballX) <= tactics.reboundRange &&
        ballAbove >= tactics.reboundHeight &&
        ballAbove <= 190 &&
        velocityY >= -40
      ) {
        controller.currentJump = true;
      }
      return;
    }

    const basketDistance = side === 1 ? playerX : controller.width - playerX;
    const nearArc = basketDistance >= 430 && basketDistance <= 650;
    if (
      player.isGrounded &&
      controller.__stepBackCooldown <= 0 &&
      !controller.__stepBackConsidered &&
      nearArc &&
      distance <= tactics.stepBackTriggerRange
    ) {
      controller.__stepBackConsidered = true;
      if (Math.random() <= tactics.stepBackChance) {
        controller.__stepBackPhase = 1;
        controller.__stepBackTimer = tactics.stepBackDuration;
        controller.currentMove = side;
        controller.currentAction = false;
        controller.currentJump = false;
        if (player.readyForDash) controller.currentDash = side;
        return;
      }
    }

    if (
      player.isGrounded &&
      basketDistance <= tactics.dunkDashDistance &&
      basketDistance > tactics.dunkLaunchDistance &&
      player.readyForDash
    ) {
      controller.currentDash = -side;
      controller.currentMove = -side;
      controller.currentAction = false;
      controller.currentJump = false;
      return;
    }

    if (player.isGrounded && basketDistance <= tactics.dunkLaunchDistance) {
      controller.currentMove = -side;
      controller.currentJump = true;
      controller.currentAction = false;
      return;
    }

    if (
      player.isGrounded &&
      player.readyForDash &&
      controller.isOpponentCloseBehind(tactics.dashPressureRange)
    ) {
      controller.currentDash = -side;
      controller.currentMove = 0;
    }
  }

  function installTacticalOverlay() {
    const { engine } = modules();
    const basePrototype = Object.getPrototypeOf(engine.AIController.prototype);
    if (basePrototype.__bs2019TacticalOverlay) return;
    const originalUpdate = basePrototype.update;
    basePrototype.update = function tacticalUpdate(delta) {
      originalUpdate.call(this, delta);
      const tactics = activeTacticsBySide.get(this.SIDE);
      if (tactics) {
        this.__tacticalDelta = delta;
        applyTacticalPolicy(this, tactics);
      }
    };
    const originalSetAttackPoint = basePrototype.setAttackPoint;
    basePrototype.setAttackPoint = function tacticalAttackPoint(requested, jumpPoint) {
      originalSetAttackPoint.call(this, requested, jumpPoint);
      const tactics = activeTacticsBySide.get(this.SIDE);
      const stockThreePoint = this.SIDE === 1 ? 510 : 290;
      if (
        tactics &&
        requested === 0 &&
        Math.abs(this.attackPoint - stockThreePoint) < 0.001 &&
        Number.isFinite(tactics.longThreeOffset)
      ) {
        this.attackPoint += this.SIDE * tactics.longThreeOffset;
        this.jumpPoint = this.attackPoint;
      }
    };
    basePrototype.__bs2019TacticalOverlay = true;
  }

  function configureMatch({ candidate, opponent, opponentSkill = 8, candidateSide = 0, human = false }) {
    const { engine, aiSkills } = modules();
    ensureSkillProfiles(aiSkills);

    const strongestNative = aiSkills.botsSkills[8];
    const candidateAgent = unpackAgent(candidate);
    const opponentAgent = unpackAgent(opponent);
    aiSkills.botsSkills[CANDIDATE_SKILL] = sanitizeProfile(candidateAgent.parameters, strongestNative);
    let resolvedOpponentSkill = Math.max(1, Math.min(8, Number(opponentSkill) || 8));
    if (opponent) {
      aiSkills.botsSkills[CUSTOM_OPPONENT_SKILL] = sanitizeProfile(opponentAgent.parameters, strongestNative);
      resolvedOpponentSkill = CUSTOM_OPPONENT_SKILL;
    }

    activeTacticsBySide.clear();
    const candidateControllerSide = candidateSide === 0 ? -1 : 1;
    if (candidateAgent.tactics) activeTacticsBySide.set(candidateControllerSide, candidateAgent.tactics);
    if (opponentAgent.tactics) activeTacticsBySide.set(-candidateControllerSide, opponentAgent.tactics);

    const inventory = engine.Inventory.instance;
    const match = inventory.matchData;
    inventory.gameMode = 2;
    if (inventory.save) {
      inventory.save.firstRun = false;
      inventory.save.firstRun2 = false;
    }

    match.resetAll();
    match.matchMode = 0;
    match.teams = [1, 2];
    match.players = [[0], [0]];
    match.forms = [0, 1];
    match.pb = human ? [["P0"], ["B0"]] : [["B0"], ["B0"]];
    match.skills = human
      ? [[0], [CANDIDATE_SKILL]]
      : candidateSide === 0
        ? [[CANDIDATE_SKILL], [resolvedOpponentSkill]]
        : [[resolvedOpponentSkill], [CANDIDATE_SKILL]];
    match.restarted = true;
    return { inventory, candidateSide };
  }

  function snapshot(candidateSide) {
    const { engine } = modules();
    const core = engine.MainGameCore.instance;
    const score = engine.Inventory.instance.matchData.matchScore.slice();
    const player = candidateSide === 0 ? core.playersLeft[0] : core.playersRight[0];
    const opponent = candidateSide === 0 ? core.playersRight[0] : core.playersLeft[0];
    const position = (object) => object ? { x: object.getX(), y: object.getY() } : null;
    return {
      score,
      candidateScore: score[candidateSide],
      opponentScore: score[1 - candidateSide],
      differential: score[candidateSide] - score[1 - candidateSide],
      isPlaying: core.isPlaying,
      isEnd: core.isEnd,
      isPaused: core.isPaused,
      nextState: core.nextState,
      matchTime: core.matchTime,
      player: position(player),
      opponent: position(opponent),
      ball: position(core.ball),
      ballState: core.ball ? core.ball.state : null
    };
  }

  async function startConfiguredMatch({ duration = 12, overtime = 4, speed = 0.25, candidateSide = 0 }) {
    const { engine, states, constants } = modules();
    const game = phaserGame();
    constants.MATCH_TIME = Math.max(2, Number(duration));
    constants.OVERTIME_TIME = Math.max(1, Number(overtime));
    game.time.slowMotion = Math.max(0.05, Number(speed));
    game.sound.mute = true;

    status("Starting 2019 evaluation match…");
    // The menu can appear before the background character-art loader finishes.
    // Starting directly from our Play button during that window constructs null
    // DragonBones armatures. Wait for the same art flag the stock flow relies on.
    await waitFor(() => window.__BS2019_REQUIRE__(22).default.isArtReady, 60000, "character artwork");
    engine.PlayersData.initDragonBones();
    game.state.start(states.Gameplay.Name, true, false);
    const core = await waitFor(
      () => {
        const instance = engine.MainGameCore.instance;
        return instance.ball && instance.playersLeft.length && instance.playersRight.length && instance;
      },
      12000,
      "gameplay objects"
    );
    await waitFor(() => core.isPlaying, 20000, "match countdown");
    status("2019 evaluation match running");
    return { core, candidateSide };
  }

  async function waitForMatchResult(candidateSide, timeout) {
    let truncated = false;
    try {
      await waitFor(() => {
        const { engine } = modules();
        const core = engine.MainGameCore.instance;
        return core.nextState === "PostMatch" && (core.isPaused || !core.isPlaying);
      }, timeout, "match result");
    } catch {
      truncated = true;
    }
    const result = snapshot(candidateSide);
    status(`${truncated ? "Capped" : "Finished"} ${result.candidateScore}–${result.opponentScore}`);
    return { ...result, truncated };
  }

  async function runEvaluation(options) {
    const seed = Number(options.seed) || 1;
    Math.random = mulberry32(seed);
    const candidateSide = Number(options.candidateSide) === 1 ? 1 : 0;
    configureMatch({ ...options, candidateSide, human: false });
    await startConfiguredMatch({ ...options, candidateSide });
    const duration = Math.max(2, Number(options.duration) || 12);
    const overtime = Math.max(1, Number(options.overtime) || 4);
    const speed = Math.max(0.05, Number(options.speed) || 0.25);
    const timeout = Math.max(10000, (duration + overtime + 8) * speed * 3000);
    return waitForMatchResult(candidateSide, timeout);
  }

  async function startHumanMatch(candidate, options = {}) {
    Math.random = originalRandom;
    configureMatch({ candidate, human: true, candidateSide: 1 });
    await startConfiguredMatch({
      duration: options.duration || 60,
      overtime: options.overtime || 15,
      speed: 1,
      candidateSide: 1
    });
    status("You are playing the evolved 2019 bot");
  }

  const api = {
    ready: false,
    runEvaluation,
    startHumanMatch,
    snapshot,
    nativeProfiles() {
      const { aiSkills } = modules();
      ensureSkillProfiles(aiSkills);
      return aiSkills.botsSkills.map((profile) => ({ ...profile }));
    }
  };
  window.__BS2019_TRAINER__ = api;

  installTacticalOverlay();

  waitFor(() => {
    const { engine, states, aiSkills } = modules();
    const inventory = engine.Inventory.instance;
    return phaserGame().state.current === states.Menu.Name &&
      inventory.matchData &&
      inventory.save &&
      window.__BS2019_REQUIRE__(22).default.isArtReady &&
      aiSkills.botsSkills.length >= 9;
  }, 60000, "game menu")
    .then(() => {
      api.ready = true;
      status("2019 training bridge ready");
      window.dispatchEvent(new CustomEvent("bs2019-trainer-ready"));
    })
    .catch((error) => {
      let detail = {};
      try {
        const { engine, aiSkills } = modules();
        detail = {
          state: phaserGame().state.current,
          hasMatchData: Boolean(engine.Inventory.instance.matchData),
          hasSave: Boolean(engine.Inventory.instance.save),
          nativeProfiles: aiSkills.botsSkills.length
        };
      } catch (debugError) {
        detail = { debugError: debugError.message };
      }
      api.error = `${error.message}; ${JSON.stringify(detail)}`;
      status(`2019 training bridge error: ${api.error}`);
      console.error(error);
    });
})();
