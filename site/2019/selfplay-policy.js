(function (root) {
  "use strict";

  // These are observations and native controls, not rewards or basketball
  // patterns. Evolution chooses all coefficients from complete match results.
  const FEATURE_NAMES = Object.freeze([
    "bias", "playerX", "opponentX", "ballX", "opponentDX", "opponentDY", "opponentDistanceX",
    "ballDX", "ballDY", "playerY", "opponentY", "ballY", "playerVX", "opponentVX", "ballVX",
    "playerVY", "opponentVY", "ballVY", "playerGrounded", "opponentGrounded", "playerPossession",
    "opponentPossession", "ballInFlight", "canAct", "canThrow", "dashReady", "ultimateReady",
    "ultimateCharge", "playerSpecialActive", "opponentSpecialActive", "baseMove", "baseJump",
    "baseAction", "baseDash", "basePump", "baseUltimate"
  ]);
  const ACTION_NAMES = Object.freeze(["move", "jump", "action", "dash", "pump", "ultimate"]);
  const FEATURES = FEATURE_NAMES.length;
  const ACTIONS = ACTION_NAMES.length;
  const DIMENSIONS = FEATURES * ACTIONS;
  const SCHEMA = "selfplay-residual-v1";
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, low = -2, high = 2) => Math.max(low, Math.min(high, finite(value)));
  const velocity = (actor, axis) => finite(actor.body?.velocity?.[axis]);
  const direction = (value, side) => value === 0 || value === 2 ? 0 : Math.sign(finite(value)) * side;

  function observe(controller) {
    const p = controller.player, o = controller.opponent, b = controller.ball;
    const side = controller.SIDE === -1 ? -1 : 1;
    const width = finite(controller.width) || 800;
    const canonicalX = (actor) => clamp((side === 1 ? actor.getX() : width - actor.getX()) / width);
    const opponentDX = clamp((o.getX() - p.getX()) * side / 200);
    const charge = p.energyBar?.fullTime > 0 ? p.energyBar.curTime / p.energyBar.fullTime : 0;
    return [
      1, canonicalX(p), canonicalX(o), canonicalX(b), opponentDX,
      clamp((o.getY() - p.getY()) / 200), Math.abs(opponentDX),
      clamp((b.getX() - p.getX()) * side / 200), clamp((b.getY() - p.getY()) / 200),
      clamp(p.getY() / 500), clamp(o.getY() / 500), clamp(b.getY() / 500),
      clamp(velocity(p, "x") * side / 400), clamp(velocity(o, "x") * side / 400), clamp(velocity(b, "x") * side / 800),
      clamp(velocity(p, "y") / 600), clamp(velocity(o, "y") / 600), clamp(velocity(b, "y") / 800),
      p.isGrounded ? 1 : 0, o.isGrounded ? 1 : 0, p.withBall ? 1 : 0, o.withBall ? 1 : 0,
      b.state === "shooting" ? 1 : 0, p.canAct ? 1 : 0, p.canThrow ? 1 : 0,
      p.readyForDash ? 1 : 0, p.readyForSuper ? 1 : 0, clamp(charge, 0, 1),
      p.isSuperShot ? 1 : 0, o.isSuperShot ? 1 : 0,
      direction(controller.currentMove, side), controller.currentJump ? 1 : 0,
      controller.currentAction ? 1 : 0, Math.sign(finite(controller.currentDash)) * side,
      controller.currentBlockOrPump ? 1 : 0, controller.currentSuper ? 1 : 0
    ];
  }

  function valid(model) {
    return model?.schema === SCHEMA && Array.isArray(model.weights) &&
      model.weights.length === DIMENSIONS && model.weights.every(Number.isFinite);
  }

  function predict(observation, model) {
    if (!valid(model) || observation.length !== FEATURES) return null;
    const result = new Array(ACTIONS).fill(0);
    for (let action = 0; action < ACTIONS; action += 1) {
      for (let feature = 0; feature < FEATURES; feature += 1) {
        result[action] += observation[feature] * model.weights[action * FEATURES + feature];
      }
    }
    return result.every(Number.isFinite) ? result : null;
  }

  function update(controller, delta, model) {
    // Preserve the starting Hard policy exactly, including coasting, pending
    // planner state and occasionally redundant native input flags.
    if (!valid(model) || model.weights.every((value) => value === 0)) return false;
    const p = controller.player;
    if (!p || !controller.opponent || !controller.ball) return false;
    const correction = predict(observe(controller), model);
    if (!correction || correction.every((value) => value === 0)) return false;
    const side = controller.SIDE === -1 ? -1 : 1;
    const baseJump = Boolean(controller.currentJump);
    const baseAction = Boolean(controller.currentAction);
    const enabled = (value, offset) => (value ? 1 : -1) + offset > 0;

    if (correction[0] !== 0) {
      const value = direction(controller.currentMove, side) + correction[0];
      controller.currentMove = Math.abs(value) < 0.5 ? 2 : Math.sign(value) * side;
    }
    if (correction[1] !== 0) {
      controller.currentJump = Boolean(p.canAct && p.isGrounded && enabled(baseJump, correction[1]));
    }
    if (correction[2] !== 0) {
      controller.currentAction = Boolean(p.canAct && enabled(baseAction, correction[2]));
    }
    if (correction[3] !== 0) {
      const value = Math.sign(finite(controller.currentDash)) * side * 2 + correction[3];
      controller.currentDash = p.canAct && p.isGrounded && p.readyForDash && Math.abs(value) > 1
        ? Math.sign(value) * side : 0;
    }
    if (correction[4] !== 0) {
      controller.currentBlockOrPump = Boolean(p.canAct && enabled(controller.currentBlockOrPump, correction[4]));
    }
    if (correction[5] !== 0) {
      controller.currentSuper = Boolean(p.canAct && p.readyForSuper && enabled(controller.currentSuper, correction[5]));
    }

    // Reconcile only Hard's internal intention bookkeeping. These are AI
    // planning flags, not the player's native cooldowns or animation state.
    const state = controller.__duelDefense;
    const stats = controller.__decisionStats;
    if (!p.withBall && p.isGrounded && baseJump !== controller.currentJump) {
      if (state) state.jumped = Boolean(controller.currentJump);
      if (stats) stats.defensiveJumps = Math.max(0, (stats.defensiveJumps || 0) + (controller.currentJump ? 1 : -1));
    }
    if (state && baseAction && !controller.currentAction && state.stealCooldown === 0.65) {
      state.stealCooldown = 0;
    }
    return true;
  }

  root.__BS2019_SELFPLAY__ = Object.freeze({ update, observe, predict, valid, FEATURE_NAMES, ACTION_NAMES,
    FEATURES, ACTIONS, DIMENSIONS, WEIGHT_COUNT: DIMENSIONS, SCHEMA });
})(typeof window === "undefined" ? globalThis : window);
