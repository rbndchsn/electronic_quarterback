---
title: Emu_Retro_Football
subtitle: A free browser game that plays like a 1978 LED handheld football game
author: Robin
date: 2026-11-25
version: 0.2.0
status: First playable build, defense and odds not yet tuned
source_files: index.html, details.html, style.css, src/engine.js, src/tuning.js, src/display.js, src/sound.js, src/main.js, test/engine.test.js
---

# What this is

Emu_Retro_Football is an original, free, fan-made browser game. Its rules follow the instruction manual of a 1978 LED handheld football game (1): you always play offense, the computer always plays defense, and the whole game is shown on nine red LED digits.

It is a clean-room build. It contains no code, ROM data, artwork, name or logo from the original product, and it is not affiliated with or endorsed by any toy maker.

# How to play

Open `index.html` from a web server, or use the GitHub Pages site once Pages is switched on for this repository. Slide the switch to 1 (beginner) or 2 (pro) to power on. The page has a full "How to play" panel and a keyboard map.

# How it is built

| File | Role |
| --- | --- |
| `src/engine.js` | Rules engine. A pure state machine with no display code. Time enters through `advance(ms)` and randomness through an injected generator, so every rule can be tested. |
| `src/tuning.js` | Every value the manual does not specify: defender speed, field goal odds, punt distance, short-kickoff chance, clock rate. Change the feel here. |
| `src/display.js` | The nine-digit display. Each column is a seven-segment digit plus two bars; the four player rows are the digit's top bar, bottom bar and the two extra bars. |
| `src/sound.js` | Generated square-wave effects: tick, whistle, triple whistle, score fanfare. |
| `src/main.js` | Keyboard, touch and the frame loop. |
| `test/engine.test.js` | One test per manual rule. Run with `npm test` (Node 20 or later, no dependencies). |

# What is taken from the manual and what is estimated

Taken from the manual (1): the 9-yard wrapping window, the yardage rule (the first two forward steps only cancel a 2-yard loss, a full crossing is 6 yards, each further crossing 9), tandem run formation, blockers and tacklers removing each other, receiver-only movement on pass plays, catches and interceptions along the quarterback's row, the 2-yard sack, kicks on 4th down only, a missed field goal becoming a punt, scoring (7, 3, 2), kickoffs, the two status readouts, and four 15-minute quarters with a clock that runs only during play.

Estimated, and held in `src/tuning.js`: how fast and how cleverly the defense moves, field goal odds by distance, punt distance, how often a kickoff is short, and how much real time one simulated minute takes.

# References

1. Coleco Industries, Inc. *Electronic Quarterback Game Instructions*, Guide No. 76660A, Model No. 2020. Amsterdam, N.Y., 1978.

# Releasing a change

Browsers keep old copies of the script and style files for a while. Every file link carries a version number (`?v=9`) so a new release loads fresh files. When you change any file in `src/` or `style.css`, raise that number everywhere it appears in `index.html`, `details.html` and the `import` lines in `src/`.
