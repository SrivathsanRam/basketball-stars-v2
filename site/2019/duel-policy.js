(function (root) {
  "use strict";

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const velocity = (object, axis) => Number(object.body?.velocity?.[axis]) || 0;
  const note = (controller, name) => {
    if (controller.__decisionStats) controller.__decisionStats[name] = (controller.__decisionStats[name] || 0) + 1;
  };
  function moveTo(player, target, tolerance = 7) {
    const difference = target - player.getX();
    return Math.abs(difference) <= tolerance ? 2 : Math.sign(difference);
  }

  // Geometry and visible motion only: no human input or future random shot is read.
  function blockThreat(controller, tactics) {
    const player = controller.player;
    const defender = controller.opponent;
    const side = controller.SIDE;
    const range = tactics.shotRiskRange || 105;
    const front = (player.getX() - defender.getX()) * side;
    if (front < -14 || front > range) return false;
    const recovering = /stun|steal|landing/.test(defender.state || "") || defender.canAct === false;
    if (player.isGrounded) {
      if (defender.isGrounded) return !recovering;
      return velocity(defender, "y") < -60;
    }
    if (defender.isGrounded || recovering) return false;
    const originX = player.getX() - side * 35;
    const flight = clamp((originX - defender.getX()) * side / 500, 0, 0.18);
    const defenderY = defender.getY() + velocity(defender, "y") * flight + 546.75 * flight * flight;
    const defenderX = defender.getX() + velocity(defender, "x") * flight;
    const ballY = player.getY() - 50 - 360 * flight + 364.5 * flight * flight;
    const inLane = (originX - defenderX) * side >= -20 && Math.abs(originX - defenderX) <= range;
    return inLane && ballY >= defenderY - 100 && ballY <= defenderY + 22;
  }

  function defend(controller, tactics, delta) {
    const player = controller.player;
    const opponent = controller.opponent;
    const ball = controller.ball;
    let state = controller.__duelDefense;
    if (!state) state = controller.__duelDefense = { airborneTime: 0, jumped: false, stealCooldown: 0, flightTime: 0 };
    state.stealCooldown = Math.max(0, state.stealCooldown - delta);
    const gap = Math.abs(player.getX() - opponent.getX());
    if (opponent.withBall) {
      controller.currentJump = false;
      controller.currentAction = false;
      controller.currentDash = 0;
      controller.currentBlockOrPump = false;
      state.flightTime = 0;
      if (opponent.isGrounded) {
        state.airborneTime = 0;
        state.jumped = false;
      } else {
        state.airborneTime += delta;
      }
      const lead = opponent.isGrounded ? 0.04 : (tactics.blockLead || 0.12);
      const target = clamp(opponent.getX() + controller.SIDE * 35 + velocity(opponent, "x") * lead, 20, controller.width - 20);
      controller.currentMove = moveTo(player, target);
      const nearThree = (opponent.SIDE === 1 ? opponent.getX() : controller.width - opponent.getX()) >= 460;
      // A futile steal animation can lock out the very next jump contest.
      const movingIntoReach = Math.abs(velocity(opponent, "x")) > 95;
      if (player.isGrounded && opponent.isGrounded && gap <= 48 && player.canAct && state.stealCooldown === 0 && (!nearThree || movingIntoReach)) {
        controller.currentAction = true;
        state.stealCooldown = 0.65;
      }
      const rising = velocity(opponent, "y") < -45;
      if (player.isGrounded && !opponent.isGrounded && rising && !state.jumped &&
        state.airborneTime >= (tactics.blockReactDelay || 0.025) && gap <= (tactics.contestRange || 120)) {
        controller.currentAction = false;
        controller.currentJump = true;
        state.jumped = true;
        note(controller, "defensiveJumps");
      }
      return true;
    }
    if (ball.state === "shooting" && ball.SIDE === opponent.SIDE) {
      state.flightTime += delta;
      if (state.flightTime <= 0.22 && Math.abs(ball.getX() - player.getX()) < 135 && ball.getY() > player.getY() - 190) {
        controller.currentAction = false;
        controller.currentJump = player.isGrounded && !state.jumped;
        if (controller.currentJump) { state.jumped = true; note(controller, "defensiveJumps"); }
        controller.currentMove = moveTo(player, clamp(ball.getX() + velocity(ball, "x") * 0.08, 20, controller.width - 20));
        return true;
      }
    }
    state.airborneTime = 0;
    state.jumped = false;
    return false;
  }

  function startFeint(controller, plan, tactics, distance) {
    plan.phase = "hesitate";
    plan.feintLeft = (tactics.feintWait || 0.25) + Math.random() * 0.12;
    plan.anchor = distance;
    plan.jitterLeft = 0;
    plan.jitterDirection = Math.random() < 0.5 ? -1 : 1;
    controller.currentBlockOrPump = true;
    controller.currentMove = 2;
    controller.currentJump = false;
    controller.currentAction = false;
    note(controller, "pumpFakes");
    note(controller, "contestDeferrals");
  }

  function hesitation(controller, plan, tactics, delta, arc, distance) {
    plan.feintLeft -= delta;
    plan.jitterLeft -= delta;
    if (!blockThreat(controller, tactics)) {
      plan.phase = "jump";
      return false;
    }
    if (plan.feintLeft <= 0) {
      plan.phase = "drive";
      plan.driveLeft = 0.3;
      controller.attackPoint = controller.SIDE === 1 ? 180 : controller.width - 180;
      controller.jumpPoint = controller.SIDE === 1 ? 260 : controller.width - 260;
      return false;
    }
    if (plan.jitterLeft <= 0) {
      plan.jitterDirection *= -1;
      plan.jitterLeft = (tactics.jitterPeriod || 0.1) * (0.8 + Math.random() * 0.4);
      plan.jitterTarget = clamp(plan.anchor + plan.jitterDirection * 12, arc + 10, arc + 55);
      note(controller, "jitterChanges");
    }
    controller.currentMove = Math.abs(distance - plan.jitterTarget) < 3 ? 2 : Math.sign(plan.jitterTarget - distance) * controller.SIDE;
    return true;
  }

  root.__BS2019_DUEL__ = Object.freeze({ blockThreat, defend, startFeint, hesitation, note });
})(typeof window === "undefined" ? globalThis : window);
