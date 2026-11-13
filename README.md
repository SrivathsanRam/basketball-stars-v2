# Basketball Stars 2019

[Play Basketball Stars 2019](https://srivathsanram.github.io/basketball-stars-v2/)

The title screen uses the original game's logo, player artwork and font.
Choose a difficulty, then press **Play**. Hard is selected by default.

| Difficulty | Opponent |
| --- | --- |
| Easy | Original 2019 standard single-match AI (native skill 3) |
| Medium | Previous evolved bot, with calibrated jump-shot threes (v6) |
| Hard | Preserved smart-contest and shot-fake bot (v7) |
| Extreme | Hard's offense with learned defensive corrections (v8) |

The difficulty manifest is `site/2019/difficulties.json`. Frozen model files live
in `site/2019/profiles/`. Hard and Medium retain their previous parameters and
tactics. `evolved-profile.json` remains a compatibility copy of Hard; the menu
loads the explicit difficulty profiles.

You control the player on the left. Arrow keys or WASD move and jump, X shoots
or steals, Z uses the special move, and a double-tap left/right dashes.
Both players have an **18-second ultimate recharge on every difficulty**.
The runtime applies this common rule to the original AI as well as evolved bots.
Movement speed, jumping, collisions, shot physics and normal human match timing
remain those of the original game.

At full time a persistent score card displays both scores and the winner.
**Play again** retains the chosen difficulty; **Choose difficulty** returns to
the title screen. The in-match **Menu** button also returns to the title screen.

## Learning experiment

The new experiments optimize observation-to-action policy weights through
cross-entropy evolution using rewards from the actual game engine. This is
evolutionary policy search, not PPO. It evaluates starting from random weights,
initializing from demonstrations of Hard, and learning corrections to Hard.
Movement, jumping, stealing and dashing are policy outputs. Offense and rebounds
remain inherited from Hard, so this is a hybrid learned defender, not a complete
bot learned from scratch.

Training uses visible positions, velocities and player/ball state. The policy
cannot inspect human key presses or future random shots. The varied possession
tests include wide closeouts, trailing defenders, retreating shots, retreat
dashes, forward jumps, pump fakes and direction changes, on both court sides.
Separate seeds are used for training, candidate selection and final tests.
The isolated defense drills disable both ultimates equally. Complete-game tests
retain the shared 18-second recharge and reject truncated matches.

A difficulty is promoted to Extreme only after stronger defense and a positive
full-game comparison against Hard have been verified. Scripted drills and bot
matches are measurements, not a guarantee of beating every human strategy.

Extreme's residual policy trained on **57,600 possessions**. In 256 fresh
scripted possessions, it allowed **24 made threes versus Hard's 63**, and recorded
**180 blocks versus 124**. In a separate 256-possession fast-release stress test,
made threes fell from **97 to 77**. These counts use starting possessions as the
denominator, including possessions ending in steals or blocks.

Each learning approach received 57,600 evolutionary training possessions.
The frozen candidates were then compared on new seeds, with a fresh game world
per policy. Lower numbers below mean fewer made threes allowed:

| Defender | Varied attacks (256 possessions) | Fast releases (256 possessions) |
| --- | ---: | ---: |
| Hard | 63 | 97 |
| Learned from random initialization | 70 | 171 |
| Learned from imitation of Hard | 58 | 152 |
| Learned corrections to Hard (Extreme) | 24 | 77 |

Within this experiment, replacing the whole defender with a learned policy did
not generalize well to quick shots. Learning corrections preserved useful block
timing while improving it. This does not establish a limit on larger neural RL
models or longer, broader training. The comparison concerns these compact
evolutionary policies and this fixed training budget.

The selected candidate won **13 of 24 completed 60-second games** against Hard,
averaging **+0.708 points**, with court sides swapped and fresh random seeds.
That is a modest overall advantage; the more substantial gain is in the
three-point drills. Neither player used an ultimate before its 18-second charge.
Fast retreat-dash shots and some direction changes can still escape the defense.
The [machine-readable experiment report](site/2019/learning-audit.json) records
the comparisons, conditions and limitations.

## Deployment

GitHub Actions publishes the static `site/` directory to GitHub Pages on pushes
to `main`. No server or installation is needed to play. Relative asset paths
support the `/basketball-stars-v2/` project URL, and content hashes refresh
updated scripts and styles.

## Credits

The underlying game engine, artwork, animations and audio are by MadPuffers,
from the Basketball Stars 2019 build served by CrazyGames. This repository adds
the evolved profiles, learned policy runtime, tactical overlay and play wrapper.
Original game assets retain their original ownership.
