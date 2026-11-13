(function () {
  "use strict";

  const button = document.getElementById("play-evolved");
  const name = document.getElementById("profile-name");
  const result = document.getElementById("match-result");
  const again = document.getElementById("play-again");
  const choices = document.getElementById("difficulty-options");
  const errorLabel = document.getElementById("menu-error");
  const profiles = new Map();
  let levels = [];
  let selected;
  let active;
  let starting = false;

  function updateReady() {
    button.disabled = starting || !window.__BS2019_TRAINER__?.ready || !profiles.has(selected?.id);
    again.disabled = starting;
  }

  function selectDifficulty(id) {
    selected = levels.find((level) => level.id === id) || levels[0];
    for (const input of choices.querySelectorAll("input")) input.checked = input.value === selected.id;
    name.textContent = selected.description;
    button.dataset.difficulty = selected.id;
    updateReady();
  }

  function showMenu() {
    if (starting) return;
    if (window.__BS2019_TRAINER__?.pauseHumanMatch) window.__BS2019_TRAINER__.pauseHumanMatch();
    else {
      const game = window.Phaser?.GAMES?.[0];
      if (game) game.paused = true;
    }
    result.hidden = true;
    document.body.classList.remove("evolved-match", "match-complete");
    document.getElementById("start-screen").inert = false;
    updateReady();
    button.focus({ preventScroll: true });
  }

  // A native pause-menu exit also returns here, keeping difficulty selection
  // in one place instead of exposing a second menu with different opponents.
  setInterval(() => {
    const game = window.Phaser?.GAMES?.[0];
    if (!starting && document.body.classList.contains("evolved-match") && game?.state?.current !== "gameplay") showMenu();
  }, 150);

  async function initialize() {
    try {
      const response = await fetch("./difficulties.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load opponents (${response.status}).`);
      const manifest = await response.json();
      levels = manifest.levels;
      if (!Array.isArray(levels) || !levels.length) throw new Error("No opponents are available.");
      for (const level of levels) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "difficulty";
        input.value = level.id;
        input.id = `difficulty-${level.id}`;
        input.addEventListener("change", () => selectDifficulty(level.id));
        const text = document.createElement("span");
        text.textContent = level.label;
        label.append(input, text);
        choices.append(label);
      }
      selectDifficulty(manifest.default || "hard");
      await Promise.all(levels.map(async (level) => {
        if (Number.isInteger(level.nativeSkill)) {
          profiles.set(level.id, { nativeSkill: level.nativeSkill });
        } else {
          const profileResponse = await fetch(level.profile, { cache: "no-store" });
          if (!profileResponse.ok) throw new Error(`Could not load ${level.label} (${profileResponse.status}).`);
          profiles.set(level.id, await profileResponse.json());
        }
        updateReady();
      }));
    } catch (error) {
      errorLabel.textContent = `${error.message} Please reload to try again.`;
      errorLabel.hidden = false;
    }
  }

  window.addEventListener("bs2019-trainer-ready", updateReady);

  async function play() {
    if (starting || !profiles.has(selected?.id)) return;
    const profile = profiles.get(selected.id);
    starting = true;
    active = selected;
    updateReady();
    result.hidden = true;
    errorLabel.hidden = true;
    document.body.classList.remove("match-complete");
    try {
      await window.__BS2019_TRAINER__.startHumanMatch(profile);
      document.getElementById("active-difficulty").textContent = active.label.toUpperCase();
      document.getElementById("result-difficulty").textContent = active.label.toUpperCase();
      document.getElementById("result-opponent").textContent = `${active.label} bot`;
      document.body.classList.add("evolved-match");
      document.getElementById("start-screen").inert = true;
      document.activeElement?.blur();
    } catch (error) {
      errorLabel.textContent = error.message;
      errorLabel.hidden = false;
      document.body.classList.remove("evolved-match");
      document.getElementById("start-screen").inert = false;
    } finally {
      starting = false;
      updateReady();
    }
  }

  button.addEventListener("click", play);
  again.addEventListener("click", play);
  document.getElementById("return-menu").addEventListener("click", showMenu);
  document.getElementById("result-menu").addEventListener("click", showMenu);
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
