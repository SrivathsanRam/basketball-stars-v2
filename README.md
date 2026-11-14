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
| Impossible | Human-style challenge with contextual shooting and defensive controls (v10) |

The manifest is `site/2019/difficulties.json`; models are in
`site/2019/profiles/`. Hard, Medium and Extreme remain byte-for-byte unchanged.
`evolved-profile.json` remains a compatibility copy of Hard.

You control the left player. Arrow keys or WASD move and jump, X shoots or
steals, Z uses the special move, and double-tapping left/right dashes.
Both players share an **18-second ultimate recharge on every difficulty**.
Original movement, jumping, collision and shot physics remain unchanged.

The final score and winner remain visible after a match. **Play again** keeps
the selected difficulty; **Choose difficulty** and the in-match **Menu** button
return to the title screen.

## Impossible (v10)

Impossible is intended as the tougher opponent for human play. It combines a
genetically evolved checkpoint with contextual controls for forward-jump
threes, high close-range jump shots, genuine takeoff contests, exposed steals,
dashes and adaptive pump fakes. Both players retain normal physics and the
same 18-second ultimate recharge.

The search completed eight new generations and 896 full training games from
the preserved Extreme ancestor. Generation 5 was selected. The shooting and
action safeguards were added after training and tested as part of the complete
controller; this is a hybrid, not a policy learned from scratch. Supporting
source reviews used Qwen3 Coder Next through the user's SoCLaaS gateway.

| Final check | Wins / games | Mean score difference |
| --- | ---: | ---: |
| Impossible vs independent human-style attacks | 47 / 48 | +10.35 |
| Existing Extreme vs those same attacks | 18 / 48 | -1.42 |
| Impossible vs Hard | 23 / 24 | +6.25 |
| Impossible vs existing Extreme | 2 / 16 | -4.44 |
| Normal-speed Impossible vs human-style attacks | 16 / 16 | +9.88 |
| Normal-speed existing Extreme vs those attacks | 10 / 16 | +0.75 |

The four synthetic styles use quick jumpers, pump fakes, retreating threes and
drives. Every final cohort swaps sides and uses fresh seeds. These are scripted
test opponents, not human participants. The paired mean-margin improvement
against the scripts passed the declared lower-bound check. Impossible still
loses the direct matchup against Extreme more often: the release improves the
tested human-play matchup, rather than dominating every bot strategy.

Open-shot diagnostics recorded 103 made threes in 120 attempts and
60/60 close-range possessions ending in a score. Possession outcomes can
include recoveries. Original dispersion remains, so this is not perfect accuracy
or an unbeatable opponent. Defense-only drills did not show universal block
improvement.

All 68 code checks passed. The five-difficulty menu, rematches, persistent final
score and equal ultimate recharge are also verified in the built site. The
[Impossible audit](site/2019/impossible-audit.json) includes raw matches,
checksums, diagnostics, the synthetic opponent source and rejected-attempt
summaries. An earlier run was rejected for incomplete games; another failed
its Hard thresholds. The final release uses a separate untouched seed set.

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
