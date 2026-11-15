<div align="center">

# 🚀 The Space Race

### Draft a spacecraft against a rival. Fly it through live NASA data. Learn real mission engineering.

**NASA Space Apps Challenge 2026 · Challenge: _Space Mission Design Game_ · Team GENESIS Z**

[**▶ Play now**](https://space-game-ten-rho.vercel.app) · [🎬 30-second demo video](https://youtu.be/q7to-Z4LpRY) · [🎥 5-minute project & product video](PROJECT_5MIN_LINK) · [🔬 Slide](#-how-we-validate-the-physics)

</div>

---

## What is it?

**The Space Race** is a competitive browser game that teaches how real space missions are designed.

Two players get the **same mission** (for example *"Photograph Jezero Crater on Mars"*) and the **same budget**, then
draft spacecraft parts **live from one shared, limited pool**. If your rival grabs the light solar array, you fly the
heavy one, and that extra mass ripples through your rocket, Δv, power, thermal design and cost.

When both players hit **LAUNCH**, a physics simulator flies both probes through **today's real NASA conditions**
(planet positions, launch windows, space weather). Both players roll the **same dice**, so only engineering decides
who wins. Then a debrief explains every success and failure with the real equation and a real mission that hit the
same problem.

> *"Every kilogram on a spacecraft costs you three times over."* The game makes you feel it.

## 🎮 Game modes

| Mode | What you do |
|---|---|
| ⚔️ **Space Race (PvP)** | Same mission, same budget, one shared parts pool. Draft live against a friend, then launch. |
| 🤖 **Vs AI engineer** | A greedy AI drafts from the same pool and steals your last copies. |
| 🚙 **Rover Expedition** | Build a rover, then drive it in 3D on Mars, the Moon or Venus at real landing sites and real local solar time. Keyboard or touch. |
| 🛰️ **Solo lab** | Practise freely and take Mission Control physics challenges for extra budget. |
| 🏫 **Classroom mode** | A teacher shares a code: the whole class flies the same mission with the same NASA data and dice, on one leaderboard. |
| 🔬 **Science & data** | Every data source, and the model tested against published numbers. |

## 🧠 What players learn

- **Live flight-dynamics notebook:** every equation the simulator uses (rocket equation, launch margin, inverse-square
  solar power and radio link, battery depth of discharge, heat balance, cost) with *your* design's numbers plugged in.
  Key equations have **🎛 slider sandboxes**.
- **Mission Control challenges:** physics questions graded by the server. Each right answer adds **$10M** to your
  budget, so understanding the physics helps you win.
- **Flight director's debrief:** every failure names the equation and the fix, plus an *"it happened for real"* story:
  Akatsuki missing Venus orbit, Galileo's stuck antenna, Opportunity's last dust storm, Cassini's gravity assists…
- **Share cards:** a result image to challenge your friends ("I reached Mars with a 18% mass margin. Can you beat it?").

## 🛰️ Real NASA data, tested physics

| NASA source | What it drives in the game |
|---|---|
| [JPL Horizons API](https://ssd.jpl.nasa.gov/horizons/) | Live positions of Earth, Mars, Venus and the Moon: launch windows, departure energy (C3), light-time delay |
| [NASA DONKI](https://api.nasa.gov/) | Solar flares, CMEs and geomagnetic storms from the last 30 days: radiation risk and solar-array wear |
| [Mars24 (NASA GISS)](https://www.giss.nasa.gov/tools/mars24/) | Local solar time and Sun elevation at real rover landing sites |
| [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | Gravity, sunlight and temperatures at each destination |
| [NASA Radioisotope Power Systems](https://science.nasa.gov/planetary-science/programs/radioisotope-power-systems/) | MMRTG power, mass and decay |

The simulator is tested against **21 published numbers**, including Falcon Heavy's 16,800 kg to Mars, the 259-day
Hohmann transfer to Mars, solar irradiance at Mars and Venus, Earth–Mars light time and Curiosity's MMRTG output
after 12 years. Each check is shown in-game with our value, the published value and the error, and is labelled as an
independent prediction, a calibration or input data.

### 🔬 How we validate the physics

We don't just say the game is realistic; we check it. `space-race/backend/game/validation.py` runs the simulator's **own equations** against numbers published by NASA, JPL, textbooks and launch providers, and reports the error for each one. The same checks run in the automated tests (`tests.py`), so if anyone breaks the physics, the build fails, and they are shown live in the game on the **Science & data** page.

**Result: 21 of 21 checks pass** within their tolerance. Every check is labelled honestly:

- **Prediction** (11): an independent result of our equations that we never tuned to the answer.
- **Calibration** (5): we fitted one parameter (for example a rocket's upper stage) to this number, so it shows the fit is consistent.
- **Input data** (5): a published value we use directly, listed so judges can trace it.

| Area | Check | Our model | Published | Error | Tolerance | Type | Source |
|---|---|---|---|---|---|---|---|
| Launch | Falcon 9 expendable → Mars | 4,188 kg | 4,020 kg | +4.2% | ±10% | Calibration | SpaceX published capability |
| Launch | Falcon Heavy expendable → Mars | 17,205 kg | 16,800 kg | +2.4% | ±10% | Calibration | SpaceX published capability |
| Launch | Falcon 9 (reusable) → GTO | 5,616 kg | 5,500 kg | +2.1% | ±10% | Prediction | SpaceX Capabilities & Services 2026 ($74M up to 5.5 t GTO) |
| Launch | Falcon Heavy expendable → GTO | 27,253 kg | 26,700 kg | +2.1% | ±10% | Prediction | SpaceX published capability |
| Launch | Vulcan VC6 → GTO | 14,419 kg | 14,400 kg | +0.1% | ±10% | Calibration | ULA published capability |
| Launch | New Glenn → GTO | 12,995 kg | 13,000 kg | 0.0% | ±10% | Calibration | Blue Origin published capability |
| Launch | Falcon 9 lift-off TWR (no payload) | 1.41 | 1.41 | +0.2% | ±5% | Prediction | 7,607 kN thrust / 549 t (SpaceX) |
| Orbits | Earth→Mars Hohmann transfer time | 258.9 days | 259 days | -0.1% | ±3% | Prediction | Textbook (Curtis, Orbital Mechanics) |
| Orbits | Earth→Venus Hohmann transfer time | 146.1 days | 146 days | +0.0% | ±3% | Prediction | Textbook (Curtis, Orbital Mechanics) |
| Orbits | Escape Δv from 200 km LEO | 3,224 m/s | 3,226 m/s | -0.1% | ±2% | Prediction | Vis-viva equation |
| Orbits | Max Earth-Mars light time | 22.31 min | 22.3 min | +0.1% | ±5% | Prediction | NASA: 3 to 22 minutes |
| Orbits | Min Earth-Mars light time | 3.31 min | 3 min | +10.4% | ±15% | Prediction | NASA: 3 to 22 minutes |
| Power | Solar irradiance at Mars | 586.2 W/m² | 586.2 W/m² | +0.0% | ±2% | Prediction | NASA Mars Fact Sheet |
| Power | Solar irradiance at Venus | 2,601 W/m² | 2,601 W/m² | 0.0% | ±2% | Prediction | NASA Venus Fact Sheet |
| Power | Curiosity MMRTG after ~12.3 years | 77.57 W | 77.2 W | +0.5% | ±5% | Calibration | NASA RPS Program update 2024 (F1 on Curiosity: 77.2 We) |
| Power | MMRTG specific power | 2.44 W/kg | 2.8 W/kg | -12.7% | ±15% | Input data | NASA MMRTG fact sheet |
| Mars time | Mars season at Perseverance landing (Ls) | 5.7 ° | 5.2 ° | +9.6% | ±25% | Prediction | NASA/JPL: landed in northern spring, Ls ≈ 5° |
| Mass | HiRISE-class camera mass | 65 kg | 65 kg | +0.0% | ±2% | Input data | HiRISE on MRO (Ball Aerospace) |
| Cost | HiRISE-class camera cost | 40 $M | 40 $M | +0.0% | ±5% | Input data | HiRISE on MRO |
| Cost | MMRTG cost | 75 $M | 75 $M | +0.0% | ±5% | Input data | U.S. DOE (Perseverance's MMRTG) |
| Cost | Falcon 9 list price | 74 $M | 74 $M | +0.0% | ±1% | Input data | SpaceX 2026 list price |

**It already caught a real bug.** Our first RTG decay rate (4.8% a year) predicted that Curiosity's MMRTG would give 59 W after 12 years. NASA reports 77.2 W, so we corrected the model to 2.8% a year, and every nuclear-powered mission in the game became more accurate.

Run the checks yourself:

```bash
cd space-race/backend
python manage.py test game
```

## 🏗️ How it works

```mermaid
flowchart LR
  A["Browser<br/>React + TypeScript + Three.js"] -- "REST (auth, parts, missions)" --> B["Django + DRF"]
  A -- "WebSockets (lobby, live draft)" --> C["Django Channels"]
  C --> D["Match service<br/>shared parts pool"]
  D --> E["Physics simulator<br/>launch → cruise → insertion → operations"]
  F["NASA APIs<br/>JPL Horizons · DONKI"] --> E
  B --> G[("Database")]
  D --> G
```

- **Frontend:** React, TypeScript, Vite, Three.js (3D menu, hangar, launch cinematic, rover), Web Audio sound effects.
- **Backend:** Python, Django, Django REST Framework, Django Channels (WebSockets), SQLite or PostgreSQL, Redis.
- **Fair play:** the server owns the shared pool (row-locked, so two players can't take the last part), grades the
  quiz, and gives both players the same random seed.
- **Hosting:** frontend on Vercel, backend on Render.

## 🚀 Run it locally

```bash
# 1. Backend
cd space-race/backend
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_catalog
python manage.py runserver          # http://localhost:8000

# 2. Frontend (second terminal)
cd space-race/frontend
npm install
npm run dev                         # http://localhost:5173
```

To test PvP alone, open two browser windows (one normal, one incognito), log in as a guest in each and click
**Find a rival** in both. Full setup, the WebSocket protocol, Postgres/Redis and deployment are in
[`space-race/README.md`](space-race/README.md).

## 📁 Project structure

```
space-race/
├── backend/            Django project
│   └── game/           models, simulator (sim.py), NASA data (nasa.py), validation, quiz, WebSocket consumers
├── frontend/           React + Vite app
│   └── src/
│       ├── components/ menu, drafting board, equations notebook, 3D launch, results, share cards
│       ├── rover/      Rover Expedition: parts, terrain, 3D driving
│       └── three/      procedural 3D models and particle effects
├── PITCH.md            submission kit and demo script
└── README.md           full technical documentation
```

## ⚠️ Honest limitations

- Part prices marked "est." are our estimates; launch prices and some parts (HiRISE, MMRTG) are real figures.
- The thermal model is a lumped heat balance, and launch windows use Hohmann geometry rather than a full porkchop plot.
- Rover terrain is procedural, and rover energy runs faster than real time so a drive fits in 3 minutes.

## 🔭 Next steps

NASA Mars Trek and Moon Trek terrain for the rover · porkchop-plot trajectory picker · aerobraking and gravity
assists · teacher dashboard.

## 👩‍🚀 Team GENESIS Z

Built for the NASA Space Apps Challenge 2026.

We used an AI assistant (Claude, by Anthropic) as a coding and writing partner; the team designed the game, chose the
physics models, and reviewed, tested and fact-checked everything. The game's 3D art is drawn in code and its sounds
are synthesized in the browser: no AI-generated images.
