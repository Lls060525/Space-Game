# The Space Race - submission kit (NASA Space Apps 2026, "Space Mission Design Game")

Submission checklist (check your local event's exact cutoff):
- [ ] Project page: title, one-line summary, the text below, **link to the public GitHub repo**
- [ ] Demo video or slides (follow the format the submission form asks for)
- [ ] List of NASA data / resources used (copy from the in-app "Science & data" page)
- [ ] Public, playable link if possible (see "Deploy" in README.md); otherwise make the video show everything
- [ ] Run `python manage.py nasa_check` on demo day and commit `backend/.nasa_backup.json`

## One-liner
A competitive mission-design game where two engineers draft parts from one shared pool and fly them
through a physics simulator driven by **live NASA data**: today's real planet positions, launch windows
and space weather.

## Judging criteria → what to show
| Criterion | Our evidence (show it, don't just say it) |
|---|---|
| **Impact** | Teaches real mission engineering (rocket equation, mass margins, power, thermal, cost) to anyone. **Classroom mode** lets a teacher share a code and the whole class flies the same mission with the same dice. The **mission coach** guides beginners. |
| **Creativity** | A *shared, limited* parts pool: your rival taking the light solar array makes *your* probe heavier, and that cascades through rocket, Δv, power and cost. An AI rival steals last copies. A rover mode drives at real landing sites in real local time. |
| **Validity** | **Science & data page:** 21 checks against published numbers (Falcon 9/Heavy/Vulcan/New Glenn performance, Hohmann times, solar irradiance, Curiosity's MMRTG decay, Mars24). Each check is labelled independent / calibrated / input. The validation caught a real bug in our RTG model (we fixed it). Live JPL Horizons + DONKI + Mars24. Real 2026 launch prices. |
| **Relevance** | Mission design trade-offs are the whole game: mass ↔ launch ↔ propulsion ↔ power ↔ thermal ↔ comms ↔ cost, with NASA practices (MGA, 15 % margin, 25 % cost reserves). |
| **Presentation** | One story (below), the live equations panel, the failure debrief. |

## 2-minute demo script
1. **(0:00) Hook.** "Every kilogram on a spacecraft costs you three times over. Let's prove it."
2. **(0:10) Live NASA strip.** "This is today's real geometry from JPL Horizons. The Mars window is open, C3 is X, and space weather comes from NASA DONKI."
3. **(0:25) Draft vs AI.** The AI grabs the last GaAs array. "Now I'm stuck with heavy silicon panels…"
4. **(0:40) Equations panel.** Mass closure → the launch margin turns yellow → Tsiolkovsky goes red → the fix card says "you need 140 kg more propellant". "Players learn the real equations because the game forces them to."
5. **(1:05) Launch.** Cinematic. The as-built mass grew 18 %, so fuel gets off-loaded.
6. **(1:20) Debrief.** "Missed orbit by 60 m/s. Here's the equation and the fix." Then win the rematch.
7. **(1:35) Rover.** Jezero at the real local time (Mars24): it's night, so solar gives 0 W and the RTG wins. Data waits until Earth rises above the horizon.
8. **(1:50) Validation page.** "21 of 21 checks against published NASA and launch-provider numbers." Close: "Real data, real physics, real trade-offs."

## Honest limitations (say these; judges respect it)
- Part prices marked "est." are our estimates; launch prices and some parts (HiRISE, MMRTG) are real figures.
- The thermal model is a lumped heat balance. The launch-window penalty is Hohmann-based, not a full porkchop plot.
- Rover terrain is procedural (next step: NASA Mars Trek elevation tiles). Rover energy runs 120× faster than real time.

## Next steps (roadmap slide)
Real Mars Trek / Moon Trek terrain · porkchop-plot trajectory picker · aerobraking · gravity assists · teacher dashboard.
