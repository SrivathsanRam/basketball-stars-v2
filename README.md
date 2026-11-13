# Basketball Stars 2019

[Play Basketball Stars 2019](https://srivathsanram.github.io/basketball-stars-v2/)

Choose a difficulty on the original-style title screen, then press **Play**.
Hard remains selected by default.

| Difficulty | Opponent |
| --- | --- |
| Easy | Original 2019 standard single-match AI (native skill 3) |
| Medium | Preserved evolved jump-shot opponent (v6) |
| Hard | Preserved smart-contest and shot-fake opponent (v7) |
| Extreme | Hard-descended opponent improved through genetic self-play (v9) |

The manifest is `site/2019/difficulties.json`; models are in
`site/2019/profiles/`. Hard and Medium remain byte-for-byte unchanged.
`evolved-profile.json` remains a compatibility copy of Hard.

You control the left player. Arrow keys or WASD move and jump, X shoots or
steals, Z uses the special move, and double-tapping left/right dashes.
Both players share an **18-second ultimate recharge on every difficulty**.
Original movement, jumping, collision and shot physics remain unchanged.

The final score and winner remain visible after a match. **Play again** keeps
the selected difficulty; **Choose difficulty** and the in-match **Menu** button
return to the title screen.

## How Extreme learned

This run started from Hard's parameters and tactics with zero residual weights.
Genetic self-play evolved decision parameters, tactics and **216 general control
weights**. Opponents included frozen Hard and earlier self-play champions.
The previous Extreme was an evaluation opponent, never a genetic ancestor.

Fitness used completed-match outcomes only: +1 for a win, -1 for a loss, 0 for
a draw, plus 0.01 times score difference clipped to [-20, 20]. There were no
rewards for particular moves and no mechanic-specific drills in this run.
The model still refines Hard's existing controller; it was not learned entirely
from scratch. Accuracy, dunk skill and the shared ultimate cooldown were fixed.

Training completed **2,714 games across 18 generations**. The released candidate
comes from generation 17. Training used shorter matches; final evaluation used
the playable rules of **60 seconds plus 15-second overtime**, with paired seeds
and the candidate playing both court sides.

## Final evaluation

Development results selected the candidate; the table below contains only the
separate final audit. Every required match must complete, and both players'
ultimate telemetry must satisfy the same recharge rule.

| Final audit cohort | Wins / completed games | Mean score difference |
| --- | ---: | ---: |
| Synchronized engine versus Hard | 81 / 100 | +2.48 |
| Synchronized engine versus previous Extreme | 36 / 40 | +5.30 |
| Native speed-1 confirmation versus Hard | 22 / 24 | +4.46 |
| Native speed-1 confirmation versus previous Extreme | 10 / 12 | +3.67 |

Promotion required at least 65% wins and +2 mean points against Hard, positive
paired-bootstrap lower bounds, acceptable results on both sides, and no observed
regression against the previous Extreme. The primary cohorts contain 100 Hard
games and 40 previous-Extreme games. Native confirmation adds 24 and 12 games;
it checks transfer to normal rendering rather than claiming separate significance.

An earlier candidate's final audit won **69/100** against Hard but averaged only
**+1.12 points**, so it failed promotion. Audit 2 uses a frozen new candidate and
untouched seeds. The predeclared repeated-audit rule spends
`alpha_k = 0.05 / [k(k+1)]`; audit 2 uses a lower-tail allowance of **0.008333**.
Pair-bootstrap intervals are approximate; the prior-Extreme comparison is an
observed regression guard, not a statistical proof of noninferiority.

The [current self-play audit](site/2019/selfplay-audit.json) records raw matches,
paired schedules, candidate and runtime hashes, gates, and limitations. The old
`learning-audit.json` defense-drill report is archival evidence for the previous
Extreme, not evidence for this model. Bot comparisons cannot guarantee victory
against every human strategy.

## Deployment and credits

GitHub Actions publishes the static `site/` directory on pushes to `main`.
No server or installation is needed to play. Relative paths support the GitHub
project URL, and content hashes refresh updated scripts and styles.

The original engine, artwork, animations and audio are by MadPuffers, from the
Basketball Stars 2019 build served by CrazyGames. This repository adds evolved
profiles, policy code, a tactical overlay and the play wrapper. Original assets
retain their original ownership.
