(function (root) {
  "use strict";

  // Learned corrections to the frozen Hard controller. A zero vector is an
  // exact behavioral baseline, allowing the optimizer to retain useful skills.
  function defend(controller, delta, model) {
    if (model?.schema !== "residual-defense-v1" || model.weights?.length !== 96) return false;
    const player = controller.player;
    if (player.withBall) { controller.__learnedDefenseState = null; return false; }
    const previous = controller.__duelDefense ? { ...controller.__duelDefense } : null;
    const handled = root.__BS2019_DUEL__.defend(controller, model.baseTactics, delta);
    if (!handled) return false;
    const observation = root.__BS2019_LEARNED_DEFENSE__.observe(controller, delta);
    const corrections = root.__BS2019_LEARNED_DEFENSE__.predict(observation, {
      schema: "linear-defense-v1", weights: model.weights
    });
    if (corrections.every((value) => value === 0)) return handled;
    const baseJump = Boolean(controller.currentJump);
    const baseSteal = Boolean(controller.currentAction);
    const movement = controller.currentMove === 2 ? 0 : controller.currentMove * controller.SIDE;
    const move = movement + corrections[0];
    controller.currentMove = Math.abs(move) < 0.5 ? 2 : Math.sign(move) * controller.SIDE;
    controller.currentJump = player.isGrounded && player.canAct && (baseJump ? 1 : -1) + corrections[1] > 0;
    controller.currentAction = player.canAct && !controller.currentJump && (baseSteal ? 1 : -1) + corrections[2] > 0;
    controller.currentDash = player.isGrounded && player.readyForDash && !controller.currentJump &&
      controller.currentMove !== 2 && corrections[3] > 1 ? controller.currentMove : 0;
    if (controller.currentDash) controller.currentAction = false;

    // The original controller commits a jump and charges its steal timer while
    // deciding. Undo those commitments when the learned correction cancels it.
    const state = controller.__duelDefense;
    if (baseJump !== controller.currentJump) {
      if (state) state.jumped = controller.currentJump || Boolean(previous?.jumped);
      if (controller.__decisionStats) controller.__decisionStats.defensiveJumps += controller.currentJump ? 1 : -1;
    }
    if (baseSteal && !controller.currentAction && state) {
      state.stealCooldown = Math.max(0, (previous?.stealCooldown || 0) - delta);
    }
    return true;
  }
  root.__BS2019_RESIDUAL_DEFENSE__ = Object.freeze({ defend });
})(typeof window === "undefined" ? globalThis : window);
