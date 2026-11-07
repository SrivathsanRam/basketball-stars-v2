(function () {
  "use strict";

  const completeAd = (_kind, callbacks = {}) => {
    callbacks.adStarted?.();
    queueMicrotask(() => callbacks.adFinished?.());
  };
  const noOp = () => {};

  window.CrazyGames = window.CrazyGames || {};
  window.CrazyGames.SDK = {
    game: {
      sdkGameLoadingStart: noOp,
      sdkGameLoadingStop: noOp,
      gameplayStart: noOp,
      gameplayStop: noOp,
      happytime: noOp
    },
    ad: { requestAd: completeAd },
    banner: { requestBanner: async () => {} }
  };
})();
