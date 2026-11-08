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

The current version leads visible forward movement to contest jump shots, keeps
the jump available instead of wasting distant steal animations, and checks the
defender's blocking lane before a release. Against a close guard it can pump fake,
change direction in short bursts, wait for the defender to commit, or drive
instead of forcing a covered three. These decisions use positions and visible
motion, not the human player's key presses.

At full time a persistent final-score card shows both scores and the winner.
**Play again** starts a new match against the same selected evolved opponent.

Both players have the same **18-second ultimate recharge**. Cooldown is enforced
as a shared match rule and cannot be reduced by an evolved bot profile. The
previous bot's 12-second cooldown advantage has been removed.

The selected model lives in `site/2019/evolved-profile.json`. Its saved evaluation
and `site/2019/release-audit.json` record the match evidence used for selection.
Three variants were screened on 30-second games, then the leader played 24 fresh,
completed 40-second games with court sides swapped. It won 23 and lost 1,
averaging +3.042 points against the previous release. It recorded 7 blocks, had
zero shots blocked, and was dispossessed 2 times versus 46 for the previous bot.
Both used the same 18-second ultimate recharge; no early activation was recorded.

In a separate 36-possession scripted reactive-blocker drill, the selected version
had zero shots blocked versus 12 for the previous release. The controlled jumper
drills and bot matches are repeatable test scenarios, not guarantees against all
human play. The evaluator advances the engine and animations together and rejects
capped final-audit games; normal human play retains the original timing.
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
