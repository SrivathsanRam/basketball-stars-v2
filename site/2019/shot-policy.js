(function (root) {
  "use strict";

  function reset(controller) {
    controller.__threePlan = null;
    controller.__plannedThree = false;
  }

  // All output goes through the normal player movement/jump/action controls.
  // In particular, move=2 is the engine's immediate brake; move=0 only coasts.
  function update(controller, tactics, delta) {
    const player = controller.player;
    if (!player.withBall || player.isSuperShot) {
      reset(controller);
      return false;
    }
    if (!controller.__plannedThree || (controller.currentSuper && player.readyForSuper)) return false;
    const side = controller.SIDE;
    const distance = side === 1 ? player.getX() : controller.width - player.getX();
    const arc = side === 1 ? player.threePointDistance : controller.width - player.threePointDistance;
    const takeoff = Math.max(arc + 10, Math.min(arc + 55, tactics.threeTakeoffDistance));
    let plan = controller.__threePlan;
    if (!plan) {
      if (!player.isGrounded) return false;
      plan = controller.__threePlan = { phase: "approach", elapsed: 0, takeoff: 0, checkedRetreat: false };
    }
    plan.elapsed += delta;
    if (plan.elapsed > 4) {
      reset(controller);
      return false;
    }
    controller.currentAction = false;
    controller.currentJump = false;
    controller.currentJumpSkip = false;
    controller.currentDash = 0;
    controller.currentBlockOrPump = false;

    if (plan.phase === "approach") {
      if (distance < arc - 130) {
        reset(controller);
        return false;
      }
      if (distance > takeoff + 6) {
        controller.currentMove = -side;
        return true;
      }
      if (distance < takeoff - 6) {
        // Set up at the arc from midfield with ordinary dribbling, rather than
        // only shooting threes when a prior dash happened to land out here.
        controller.currentMove = side;
        return true;
      }
      if (!plan.checkedRetreat) {
        plan.checkedRetreat = true;
        const gap = Math.abs(player.getX() - controller.opponent.getX());
        if (distance < takeoff && gap < tactics.stepBackTriggerRange && Math.random() < tactics.stepBackChance) {
          plan.retreatTarget = Math.min(takeoff, distance + 18);
          plan.phase = "retreat";
        }
      }
      if (plan.phase === "approach") plan.phase = "jump";
    }
    if (plan.phase === "retreat") {
      if (distance < plan.retreatTarget && distance < arc + 55) {
        controller.currentMove = side;
        return true;
      }
      plan.phase = "jump";
    }
    if (plan.phase === "jump") {
      controller.currentMove = 2;
      if (player.isGrounded) {
        controller.currentJump = true;
        plan.takeoff = distance;
        return true;
      }
      plan.phase = "rise";
    }
    if (plan.phase === "rise") {
      if (player.isGrounded) {
        reset(controller);
        return false;
      }
      const travel = tactics.threeShotMode === 2 ? Math.max(0, Math.min(60, tactics.threeForwardTravel)) : 0;
      const target = Math.max(arc - 20, plan.takeoff - travel);
      if (distance > target + 2 && travel > 0) {
        controller.currentMove = -side;
      } else {
        controller.currentMove = 2;
        // The native jump apex is around y=252. A lower target is unreachable.
        const highEnough = player.getY() <= Math.max(260, tactics.threeReleaseHeight);
        if (highEnough && player.canThrow) controller.currentAction = true;
      }
      return true;
    }
    return true;
  }

  root.__BS2019_SHOTS__ = Object.freeze({ update, reset });
})(typeof window === "undefined" ? globalThis : window);
