# Basketball Stars — Evolved Opponent

[Play the evolved bot](https://srivathsanram.github.io/basketball-stars-v2/)

This release contains one selected evolved opponent for Basketball Stars 2019.
Click **Play** to start against it immediately. The stock difficulty-selection
menu is hidden; the same evolved profile is loaded on every restart.

You control the player on the left. Use the arrow keys or WASD to move and jump,
X to shoot or steal, and Z for the special move. Double-tap left/right to dash.

The opponent combines trained native skill parameters with a tactical controller
for close defence, steals, jump contests, three-point shot selection, pressure
dashes, rebounds and possession protection. The controller also supports trained
step-back and dunk decisions when they improve held-out match results. Movement
and shots use the game's normal physics.

The selected model lives in `site/2019/evolved-profile.json`. Its saved evaluation
and `site/2019/release-audit.json` record the match evidence used for selection.
The release candidate beat the previous evolved champion with 8 wins, 10 draws
and 6 losses across 24 fresh matches (average score margin +0.333). A separate
40-match audit against the strongest built-in bot produced 18 wins, 12 draws and
10 losses (average score margin +0.375). Both audits swapped court sides for
each seed and used 18-second regulation matches.
The training method is an evolution strategy over the game's parameters and
tactical decisions, rather than a neural RL network.

Only the selected profile and the runtime needed to play it are published here.
Earlier profiles and the separate original-game project remain in the local
training workspace.

## Deployment

GitHub Actions publishes the static `site/` directory to GitHub Pages whenever
`main` changes. No server or installation is needed to play. Relative asset paths
support the `/basketball-stars-v2/` project URL.

## Credits

The underlying game engine, artwork, animations and audio are by MadPuffers,
from the Basketball Stars 2019 build served by CrazyGames. This repository adds
the evolved profile, tactical overlay and standalone play wrapper. Original
game assets retain their original ownership.
