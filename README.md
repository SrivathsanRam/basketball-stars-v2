# Basketball Stars — Evolved Opponent

[Play the evolved bot](https://srivathsanram.github.io/basketball-stars-v2/)

This release contains one selected evolved opponent for Basketball Stars 2019.
Click **Play** to start against it immediately. The stock difficulty-selection
menu is hidden; the same evolved profile is loaded on every restart.

You control the player on the left. Use the arrow keys or WASD to move and jump,
X to shoot or steal, and Z for the special move. Double-tap left/right to dash.

The opponent combines evolved skill parameters with a tactical controller for
close defence, steals, jump contests, pressure dashes, rebounds and dunks. For a
planned three it sets up near the arc, takes off outside the line, jumps forward,
brakes and releases high enough to avoid the game's low-release accuracy penalty.
Short step-backs are limited to 18 pixels and never use a backward dash. Shot
physics, random dispersion and the game's three-point scoring rules are unchanged.

Both players have the same **18-second ultimate recharge**. Cooldown is enforced
as a shared match rule and cannot be reduced by an evolved bot profile. The
previous bot's 12-second cooldown advantage has been removed.

The selected model lives in `site/2019/evolved-profile.json`. Its saved evaluation
and `site/2019/release-audit.json` record the match evidence used for selection.
Current validation uses completed 30-second regulation games with swapped court
sides, equal ultimate cooldowns, and measured three-point attempts/makes. Earlier
audit figures were produced by an evaluator that could cap games early and are
superseded. The corrected evaluator advances the engine and character animations
together; regular human play retains the game's original timing.

On 24 fresh, completed games against the previous controller (also using the fair
18-second cooldown), this release won 15 and lost 9, averaging +1.417 points. It
made 18 of 19 recorded threes, compared with the old controller's 0 of 26. No deep
releases or early ultimates were recorded for the new bot. This is a small match
sample rather than a guaranteed shooting percentage. A separate controlled drill
produced 68 made threes in 80 attempts for its forward-jump release.
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
