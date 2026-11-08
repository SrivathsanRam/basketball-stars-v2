(function () {
  "use strict";

  const button = document.getElementById("play-evolved");
  const name = document.getElementById("profile-name");
  const result = document.getElementById("match-result");
  const again = document.getElementById("play-again");
  let profile;
  let starting = false;

  // The stock menu is never exposed by this wrapper. Returning from a match
  // shows this same Play button, which always loads the single release profile.
  setInterval(() => {
    const game = window.Phaser?.GAMES?.[0];
    if (!starting && game?.state?.current !== "gameplay") {
      document.body.classList.remove("evolved-match");
    }
  }, 150);

  async function initialize() {
    try {
      const response = await fetch("./evolved-profile.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Profile request failed with ${response.status}`);
      profile = await response.json();
      name.textContent = profile.name || `Generation ${profile.generation || 0}`;
      if (window.__BS2019_TRAINER__?.ready) button.disabled = false;
    } catch (error) {
      name.textContent = error.message;
    }
  }

  window.addEventListener("bs2019-trainer-ready", () => {
    if (profile) button.disabled = false;
  });

  async function play() {
    if (starting || !profile) return;
    button.disabled = true;
    again.disabled = true;
    starting = true;
    result.hidden = true;
    document.body.classList.remove("match-complete");
    try {
      await window.__BS2019_TRAINER__.startHumanMatch({
        parameters: profile.parameters,
        tactics: profile.tactics
      });
      document.body.classList.add("evolved-match");
      button.textContent = "Restart evolved match";
    } catch (error) {
      name.textContent = error.message;
    } finally {
      starting = false;
      button.disabled = false;
      again.disabled = false;
    }
  }

  button.addEventListener("click", play);
  again.addEventListener("click", play);
  window.addEventListener("bs2019-match-ended", (event) => {
    const score = event.detail.score;
    document.getElementById("result-you").textContent = String(score[0]);
    document.getElementById("result-bot").textContent = String(score[1]);
    document.getElementById("result-title").textContent = score[0] > score[1] ? "You win!" : score[0] < score[1] ? "Bot wins" : "Draw";
    document.body.classList.add("match-complete");
    result.hidden = false;
    again.focus({ preventScroll: true });
  });

  initialize();
})();
