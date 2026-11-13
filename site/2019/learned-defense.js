(function (root) {
  "use strict";
  const FEATURES = 24;
  const ACTIONS = 4;
  const clamp = (n, low = -2, high = 2) => Math.max(low, Math.min(high, n));
  const velocity = (actor, axis) => Number(actor.body?.velocity?.[axis]) || 0;
  function observe(controller, delta = 0.025) {
    const p = controller.player, o = controller.opponent, b = controller.ball, side = controller.SIDE;
    const state = controller.__learnedDefenseState ||= { airborne: 0 };
    state.airborne = o.isGrounded ? 0 : Math.min(1.5, state.airborne + delta);
    const dx = clamp((o.getX() - p.getX()) * side / 200);
    const vy = clamp(-velocity(o, "y") / 600);
    const airborne = o.isGrounded ? 0 : 1;
    return [1, dx, Math.abs(dx), dx * Math.abs(dx),
      clamp(velocity(o, "x") * side / 400), clamp(velocity(p, "x") * side / 400),
      clamp((385 - p.getY()) / 200), clamp((385 - o.getY()) / 200),
      clamp(-velocity(p, "y") / 600), vy, p.isGrounded ? 1 : 0, airborne,
      o.withBall ? 1 : 0, b.state === "shooting" ? 1 : 0,
      clamp((b.getX() - p.getX()) * side / 200), clamp((p.getY() - b.getY()) / 200),
      clamp(velocity(b, "x") * side / 600), clamp(-velocity(b, "y") / 600),
      dx * vy, Math.abs(dx) * vy, Math.abs(dx) * airborne, state.airborne,
      p.canAct ? 1 : 0, p.readyForDash ? 1 : 0];
  }
  function predict(observation, model) {
    if (model?.schema !== "linear-defense-v1" || model.weights?.length !== FEATURES * ACTIONS) return null;
    const values = new Array(ACTIONS).fill(0);
    for (let action = 0; action < ACTIONS; action += 1) {
      for (let i = 0; i < FEATURES; i += 1) values[action] += observation[i] * model.weights[action * FEATURES + i];
    }
    return values;
  }
  function defend(controller, delta, model) {
    const p = controller.player, o = controller.opponent, b = controller.ball;
    if (p.withBall || (!o.withBall && !(b.state === "shooting" && b.SIDE === o.SIDE))) {
      controller.__learnedDefenseState = null;
      return false;
    }
    const output = predict(observe(controller, delta), model);
    if (!output) return false;
    const move = Math.abs(output[0]) < 0.12 ? 2 : Math.sign(output[0]) * controller.SIDE;
    controller.currentMove = move;
    controller.currentJump = p.isGrounded && p.canAct && output[1] > 0;
    controller.currentAction = p.canAct && output[2] > 0 && !controller.currentJump;
    controller.currentDash = p.isGrounded && p.readyForDash && move !== 2 && output[3] > 0 ? move : 0;
    controller.currentBlockOrPump = false;
    if (controller.currentJump && controller.__decisionStats) controller.__decisionStats.defensiveJumps += 1;
    return true;
  }
  root.__BS2019_LEARNED_DEFENSE__ = Object.freeze({ observe, predict, defend, FEATURES, ACTIONS });
})(typeof window === "undefined" ? globalThis : window);
