(function () {
  "use strict";

  const CANDIDATE_SKILL = 9;
  const CUSTOM_OPPONENT_SKILL = 10;
  const originalRandom = Math.random;
  const activeTacticsBySide = new Map();
  const activeLearnedDefenseBySide = new Map();
  const activeLearnedPolicyBySide = new Map();
  let matchMechanics = {};
  let simulationRate = 1;
  let simulationAccumulator = 0;
  let animationClock = null;
  let originalAnimationAdvance = null;
  let humanMode = false;
  let lastHumanResult = null;
  const SHARED_ULTIMATE_COOLDOWN = 18;
  const tacticalDefaults = Object.freeze({
    predictiveDefense: 0,
    contestAwareness: 0,
    blockReactDelay: 0.025,
    blockLead: 0.12,
    contestRange: 120,
    shotRiskRange: 105,
    jitterPeriod: 0.1,
    feintWait: 0.25,
    threeShotMode: 0,
    threeTakeoffDistance: 535,
    threeReleaseHeight: 280,
    threeForwardTravel: 40,
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
    // Recharge is a match rule, never an evolvable AI advantage. This is the
    // stock human duration, applied to every human and AI skill used here.
    result.coolDown = SHARED_ULTIMATE_COOLDOWN;
    return result;
  }

  function unpackAgent(agent) {
    if (agent && agent.parameters) {
      const tactics = agent.tactics
        ? Object.fromEntries(Object.entries({ ...tacticalDefaults, ...agent.tactics }).filter(
          ([, value]) => Number.isFinite(Number(value))
        ))
        : null;
      return { parameters: agent.parameters, tactics, learnedDefense: agent.learnedDefense || null, learnedPolicy: agent.learnedPolicy || null };
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
    controller.__decisionStats = matchMechanics[side];
    if (!player.withBall) window.__BS2019_SHOTS__.reset(controller);
    else {
      controller.__duelDefense = null;
      controller.__learnedDefenseState = null;
    }
    if (Number.isFinite(tactics.threePointChance)) {
      controller.chanceForThree = Math.max(0, Math.min(1, tactics.threePointChance));
    }

    controller.__stepBackCooldown = Math.max(0, (controller.__stepBackCooldown || 0) - delta);

    if (!tactics.threeShotMode && controller.__stepBackPhase) {
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

    const learnedDefense = activeLearnedDefenseBySide.get(side);
    const learnedPolicy = learnedDefense?.schema === "residual-defense-v1"
      ? window.__BS2019_RESIDUAL_DEFENSE__ : window.__BS2019_LEARNED_DEFENSE__;
    if (learnedDefense && !player.withBall && learnedPolicy?.defend(controller, delta, learnedDefense)) return;
    // Residual inference already advances the base defender, even when it
    // yields to loose-ball pursuit. Do not advance its timers a second time.
    const residualAdvancedBase = learnedDefense?.schema === "residual-defense-v1" &&
      learnedDefense.weights?.length === 96 && learnedPolicy;
    if (!residualAdvancedBase && tactics.predictiveDefense && !player.withBall && window.__BS2019_DUEL__.defend(controller, tactics, delta)) return;

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
    if (tactics.contestAwareness && !controller.__plannedThree && basketDistance >= 500 &&
      (controller.currentJump || controller.currentAction) && window.__BS2019_DUEL__.blockThreat(controller, tactics)) {
      controller.__plannedThree = true;
      controller.__threePlan = player.isGrounded ? null : {
        phase: "rise", elapsed: 0, takeoff: side === 1 ? player.pointOfThrow : controller.width - player.pointOfThrow
      };
    }
    if (tactics.threeShotMode && window.__BS2019_SHOTS__.update(controller, tactics, delta)) return;
    const nearArc = basketDistance >= 430 && basketDistance <= 650;
    if (
      !tactics.threeShotMode && player.isGrounded &&
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
      const tactics = activeTacticsBySide.get(this.SIDE);
      if (tactics) this.chanceForThree = tactics.threePointChance;
      originalUpdate.call(this, delta);
      if (tactics) {
        this.__tacticalDelta = delta;
        applyTacticalPolicy(this, tactics);
      }
      const learnedPolicy = activeLearnedPolicyBySide.get(this.SIDE);
      if (learnedPolicy) window.__BS2019_SELFPLAY__?.update(this, delta, learnedPolicy);
    };
    const originalSetAttackPoint = basePrototype.setAttackPoint;
    basePrototype.setAttackPoint = function tacticalAttackPoint(requested, jumpPoint) {
      const tactics = activeTacticsBySide.get(this.SIDE);
      if (tactics) this.chanceForThree = tactics.threePointChance;
      originalSetAttackPoint.call(this, requested, jumpPoint);
      const stockThreePoint = this.SIDE === 1 ? 510 : 290;
      const choseThree = requested === 0 && Math.abs(this.attackPoint - stockThreePoint) < 0.001;
      if (tactics?.threeShotMode) {
        this.__threePlan = null;
        const possessionDistance = this.SIDE === 1 ? this.player.getX() : this.width - this.player.getX();
        this.__plannedThree = requested === 0 && possessionDistance >= 380 && Math.random() < tactics.threePointChance;
        if (this.__plannedThree) {
          const distance = Math.max(510, Math.min(555, tactics.threeTakeoffDistance));
          this.attackPoint = this.SIDE === 1 ? distance : this.width - distance;
          this.jumpPoint = this.attackPoint;
        }
        return;
      }
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
    const originalReleasePump = basePrototype.releaseBlockOrPump;
    basePrototype.releaseBlockOrPump = function tacticalPumpRelease(delta) {
      if (activeTacticsBySide.get(this.SIDE)?.contestAwareness && this.player.withBall && this.player.isBlockedOrPump) return true;
      return originalReleasePump.call(this, delta);
    };
    const originalThrow = engine.PlayerObject.prototype.makeThrow;
    engine.PlayerObject.prototype.makeThrow = function measuredThrow() {
      const stats = matchMechanics[this.SIDE];
      if (stats && this.withBall) {
        stats.shots += 1;
        const takeoff = this.isGrounded ? this.getX() : this.pointOfThrow;
        const isThree = (takeoff - this.threePointDistance) * this.SIDE >= 0;
        if (isThree) {
          stats.threeAttempts += 1;
          if (stats.threeReleases.length < 100) stats.threeReleases.push({
            takeoffDistance: this.SIDE === 1 ? takeoff : 800 - takeoff,
            releaseDistance: this.SIDE === 1 ? this.getX() : 800 - this.getX(),
            height: this.getY(), velocityX: this.body.velocity.x
          });
        }
      }
      return originalThrow.call(this);
    };
    const originalSuper = engine.PlayerObject.prototype.startSuper;
    engine.PlayerObject.prototype.startSuper = function measuredSuper() {
      const stats = matchMechanics[this.SIDE];
      if (stats) {
        stats.ultimateUses += 1;
        stats.ultimateCharges.push({ elapsedCharge: this.energyBar.curTime, requiredCharge: this.energyBar.fullTime });
      }
      return originalSuper.call(this);
    };
    window.__BS2019_REQUIRE__(17).Signals.MatchProcessorSignal.add((basketSide, points) => {
      if (points === 3 && matchMechanics[-basketSide]) matchMechanics[-basketSide].threeMakes += 1;
    });
    const originalBlock = engine.NapePhysics.prototype.onBallBlock;
    engine.NapePhysics.prototype.onBallBlock = function measuredBlock(collision) {
      const ball = collision.int1.castBody.userData.owner;
      const shooterSide = ball.SIDE;
      const before = ball.state;
      const defender = collision.int2.castShape.body?.userData.owner;
      originalBlock.call(this, collision);
      if (before !== "block" && ball.state === "block" && defender) {
        if (matchMechanics[defender.SIDE]) matchMechanics[defender.SIDE].blocks += 1;
        if (matchMechanics[shooterSide]) matchMechanics[shooterSide].shotsBlocked += 1;
      }
    };
    const originalDispossessed = engine.PlayerObject.prototype.getBeStolen;
    engine.PlayerObject.prototype.getBeStolen = function measuredDispossession(...args) {
      const hadBall = this.withBall;
      const result = originalDispossessed.apply(this, args);
      if (hadBall && !this.withBall && matchMechanics[this.SIDE]) matchMechanics[this.SIDE].dispossessions += 1;
      return result;
    };
  }

  function installHumanResults() {
    const { engine, states } = modules();
    const originalFinish = engine.MainGameCore.prototype.finishMatch;
    engine.MainGameCore.prototype.finishMatch = function persistentHumanResult() {
      if (humanMode && this.nextState === "PostMatch" && !this.isOvertime && !lastHumanResult) {
        lastHumanResult = { score: engine.Inventory.instance.matchData.matchScore.slice() };
      }
      originalFinish.call(this);
      if (humanMode && lastHumanResult) {
        phaserGame().paused = true;
        window.dispatchEvent(new CustomEvent("bs2019-match-ended", { detail: lastHumanResult }));
      }
    };
    const originalPostMatch = states.Gameplay.prototype.onPostMatch;
    states.Gameplay.prototype.onPostMatch = function keepHumanScoreVisible() {
      if (humanMode && lastHumanResult) {
        this.closePopup();
        return;
      }
      return originalPostMatch.call(this);
    };
  }

  function installEvaluationClock() {
    const { states, engine } = modules();
    const prototype = states.Gameplay.prototype;
    const originalStep = prototype.updateGameController;
    prototype.updateGameController = function evaluationStep(delta) {
      if (simulationRate === 1) return originalStep.call(this, delta);
      // Gameplay uses Date.now(), independently of Phaser's slowMotion. Repeat
      // its original fixed step and animation clock together for evaluation.
      // Human play keeps the original timing path above.
      if (!animationClock) {
        animationClock = dragonBones.PhaserFactory.factory.dragonBones;
        originalAnimationAdvance = animationClock.advanceTime;
        animationClock.advanceTime = function evaluationAnimation(time) {
          if (simulationRate === 1) return originalAnimationAdvance.call(this, time);
        };
      }
      simulationAccumulator += simulationRate;
      while (simulationAccumulator >= 1) {
        originalStep.call(this, delta);
        const scale = engine.MainGameCore.instance.timeScale;
        originalAnimationAdvance.call(animationClock, delta * (scale === 0 ? 0.3 : scale));
        simulationAccumulator -= 1;
      }
    };
  }

  function configureMatch({ candidate, opponent, opponentSkill = 8, candidateSide = 0, human = false }) {
    humanMode = human;
    lastHumanResult = null;
    const { engine, aiSkills } = modules();
    ensureSkillProfiles(aiSkills);

    const strongestNative = aiSkills.botsSkills[8];
    for (const profile of aiSkills.botsSkills) profile.coolDown = SHARED_ULTIMATE_COOLDOWN;
    const candidateAgent = unpackAgent(candidate);
    const opponentAgent = unpackAgent(opponent);
    // Native difficulty 0 is the human profile; 1–8 are the original bots.
    const nativeCandidateSkill = Number.isInteger(candidate?.nativeSkill)
      ? Math.max(1, Math.min(8, candidate.nativeSkill)) : null;
    const resolvedCandidateSkill = nativeCandidateSkill ?? CANDIDATE_SKILL;
    aiSkills.botsSkills[CANDIDATE_SKILL] = sanitizeProfile(candidateAgent.parameters, strongestNative);
    let resolvedOpponentSkill = Math.max(1, Math.min(8, Number(opponentSkill) || 8));
    if (opponent) {
      aiSkills.botsSkills[CUSTOM_OPPONENT_SKILL] = sanitizeProfile(opponentAgent.parameters, strongestNative);
      resolvedOpponentSkill = CUSTOM_OPPONENT_SKILL;
    }

    activeTacticsBySide.clear();
    activeLearnedDefenseBySide.clear();
    activeLearnedPolicyBySide.clear();
    matchMechanics = Object.fromEntries([-1, 1].map((side) => [side, {
      shots: 0, threeAttempts: 0, threeMakes: 0, threeReleases: [], ultimateUses: 0, ultimateCharges: [],
      blocks: 0, shotsBlocked: 0, dispossessions: 0, contestDeferrals: 0, pumpFakes: 0, jitterChanges: 0, defensiveJumps: 0
    }]));
    const candidateControllerSide = candidateSide === 0 ? -1 : 1;
    if (candidateAgent.tactics && nativeCandidateSkill === null) activeTacticsBySide.set(candidateControllerSide, candidateAgent.tactics);
    if (opponentAgent.tactics) activeTacticsBySide.set(-candidateControllerSide, opponentAgent.tactics);
    if (candidateAgent.learnedDefense && nativeCandidateSkill === null) activeLearnedDefenseBySide.set(candidateControllerSide, candidateAgent.learnedDefense);
    if (opponentAgent.learnedDefense) activeLearnedDefenseBySide.set(-candidateControllerSide, opponentAgent.learnedDefense);
    if (candidateAgent.learnedPolicy && nativeCandidateSkill === null) activeLearnedPolicyBySide.set(candidateControllerSide, candidateAgent.learnedPolicy);
    if (opponentAgent.learnedPolicy) activeLearnedPolicyBySide.set(-candidateControllerSide, opponentAgent.learnedPolicy);

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
      ? [[0], [resolvedCandidateSkill]]
      : candidateSide === 0
        ? [[resolvedCandidateSkill], [resolvedOpponentSkill]]
        : [[resolvedOpponentSkill], [resolvedCandidateSkill]];
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
      ballState: core.ball ? core.ball.state : null,
      mechanics: {
        candidate: matchMechanics[candidateSide === 0 ? -1 : 1],
        opponent: matchMechanics[candidateSide === 0 ? 1 : -1],
        policies: [-1, 1].map((side) => ({
          side,
          tactical: activeTacticsBySide.has(side),
          learnedDefense: activeLearnedDefenseBySide.get(side)?.schema || null,
          learnedPolicy: activeLearnedPolicyBySide.get(side)?.schema || null
        })),
        cooldowns: [...core.playersLeft, ...core.playersRight].map((player) => ({
          side: player.SIDE, isHuman: player.isHuman, seconds: player.energyBar.fullTime,
          charge: player.energyBar.curTime, ready: Boolean(player.readyForSuper)
        }))
      }
    };
  }

  async function startConfiguredMatch({ duration = 12, overtime = 4, speed = 0.25, candidateSide = 0, waitForCountdown = true }) {
    const { engine, states, constants } = modules();
    const game = phaserGame();
    game.paused = false;
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
    const previousBall = engine.MainGameCore.instance.ball;
    game.state.start(states.Gameplay.Name, true, false);
    const core = await waitFor(
      () => {
        const instance = engine.MainGameCore.instance;
        // Phaser queues state transitions. A paused, unfinished match can still
        // report isPlaying until the next frame, so wait for the NEW world.
        return instance.ball && instance.ball !== previousBall &&
          instance.playersLeft.length && instance.playersRight.length && instance;
      },
      12000,
      "gameplay objects"
    );
    if (waitForCountdown) await waitFor(() => core.isPlaying, 20000, "match countdown");
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
    simulationRate = Math.max(1, Math.min(20, 1 / (Number(options.speed) || 0.25)));
    simulationAccumulator = 0;
    const seed = Number(options.seed) || 1;
    Math.random = mulberry32(seed);
    const candidateSide = Number(options.candidateSide) === 1 ? 1 : 0;
    configureMatch({ ...options, candidateSide, human: false });
    await startConfiguredMatch({ ...options, candidateSide });
    const duration = Math.max(2, Number(options.duration) || 12);
    const overtime = Math.max(1, Number(options.overtime) || 4);
    const speed = Math.max(0.05, Number(options.speed) || 0.25);
    const timeout = Math.max(20000, (duration + overtime + 20) * speed * 5000);
    return waitForMatchResult(candidateSide, timeout);
  }

  async function startHumanMatch(candidate, options = {}) {
    simulationRate = 1;
    simulationAccumulator = 0;
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

  async function prepareFastEvaluation(options) {
    simulationRate = 1;
    simulationAccumulator = 0;
    Math.random = mulberry32(Number(options.seed) || 1);
    const candidateSide = Number(options.candidateSide) === 1 ? 1 : 0;
    configureMatch({ ...options, candidateSide, human: false });
    await startConfiguredMatch({ ...options, candidateSide, speed: 1, waitForCountdown: false });
    // The evaluator advances native logic, animations and tweens explicitly.
    // Avoid Phaser's pause event, which freezes the tween callbacks it needs.
    phaserGame()._paused = true;
    return snapshot(candidateSide);
  }

  const api = {
    ready: false,
    ultimateCooldown: SHARED_ULTIMATE_COOLDOWN,
    lastResult: () => lastHumanResult,
    runEvaluation,
    prepareFastEvaluation,
    startHumanMatch,
    pauseHumanMatch() {
      if (humanMode) phaserGame().paused = true;
    },
    snapshot,
    nativeProfiles() {
      const { aiSkills } = modules();
      ensureSkillProfiles(aiSkills);
      return aiSkills.botsSkills.map((profile) => ({ ...profile }));
    }
  };
  window.__BS2019_TRAINER__ = api;

  installTacticalOverlay();
  installEvaluationClock();
  installHumanResults();

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
