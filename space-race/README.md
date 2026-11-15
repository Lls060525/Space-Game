# Space Race: Mission Design PvP

NASA Space Apps Challenge: **Space Mission Design Game**

Two players get the same mission and budget and draft parts from **one shared, limited pool**.
If your rival takes the light GaAs solar array, you are left with the heavy generator, and
that extra mass ripples through your thrust-to-weight, launch capacity and delta-v.
When both players hit **LAUNCH**, the server runs a statistical simulation. Both players
watch a 2D replay to see whose engineering survived.

```
frontend/  React + TypeScript + Vite (native WebSockets)
backend/   Django + DRF + Django Channels (+ PostgreSQL, Redis)
```

---

## Quick start

### Option A: zero setup (SQLite + in-memory channels)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py makemigrations game
python manage.py migrate
python manage.py seed_catalog          # re-run after pulling: prices/rockets changed
python manage.py createsuperuser        # optional, for /admin to tweak parts
python manage.py runserver              # daphne makes this an ASGI server (HTTP + WS)

cd ../frontend
npm install
npm run dev                             # http://localhost:5173
```
To test PvP alone, open two browser windows with different profiles (or one normal and one
incognito). Log in as a different guest in each and click **Find a rival** in both.

### Option B: the real stack (Postgres + Redis)
```bash
docker compose up -d                    # postgres:5432, redis:6379
cd backend && cp .env.example .env && set -a && source .env && set +a
python manage.py migrate && python manage.py seed_catalog && python manage.py runserver
```
With `REDIS_URL` set, Channels uses `channels_redis` for broadcast and presence uses a
Redis set. That is what lets you run several server processes.

Run the tests: `python manage.py test game` (the simulator tests also run with plain
`python -m unittest game.tests` from `backend/`).

---

## The game loop

| Phase | Where | What happens |
|---|---|---|
| 1. Drafting board | `DraftBoard.tsx` ↔ `services.apply_action` | Pick from a shared pool with limited stock. Budget and per-category limits are enforced on the server. 3-minute timer. |
| 2. Engineering trade-off | `sim.analyze()` | After every pick, the server recalculates mass, TWR, launch capacity, delta-v, power, battery, data and thermal, and sends gauges and plain-language warnings to **both** players. |
| 3. Launch & operate | `sim.simulate()` → `LaunchSim.tsx` | Each margin becomes a probability, then seeded dice are rolled. Both players get the **same seed**, so luck is identical and only engineering decides the winner. The canvas replays the timeline. |

### The cascading consequences (from `game/sim.py`)
- **Mass → launch:** `TWR = thrust / ((rocket + spacecraft) · g)` must be over 1.2. The launch mass must fit what the
  upper stage can push to today's C3 (rocket equation, see below).
- **Mass → orbit insertion:** Tsiolkovsky `Δv = Isp · g0 · ln(wet/dry)`. Heavier parts mean less Δv from the same tank.
- **Distance → power:** solar output scales with `1 / AU²` (Mars gets 43%, Venus 193%). RTGs give constant power.
- **Eclipses → batteries:** `(draw − RTG) × eclipse_hours` must be at most 80% of battery capacity.
- **Cameras → data → comms → power:** a HiRes camera makes 10 GB/day. X-band downlinks only about 3 GB/day at Mars (`1/d²`).
  Ka-band carries more but draws 120 W, which means bigger arrays, more mass and a bigger rocket.
- **Environment → thermal:** Venus needs thermal rating 4 (heavy active cooling, plus 50 W).
- **Score:** `min(science%, 150%) × 1000 + 2 × leftover $M + 250 for full success`. Elo rating feeds the leaderboard.

Tune the balance in `game/catalog.py`, then run `python manage.py seed_catalog` again (it upserts),
or edit the parts live in `/admin`.

### Realistic physics + live NASA data (`game/nasa.py`, `game/sim.py`, `rover/parts.ts`)
**Live data** (cached 3 h in `backend/.nasa_cache.json`, falls back to JPL Keplerian elements offline):
- **JPL Horizons API**: real positions of Earth, Mars, Venus and the Moon from today to ~17 months out.
  This gives today's launch-window phase angle and departure **C3**, the arrival date, the Sun distance on every
  day of operations (solar power), Earth distance (link budget, light time) and solar-conjunction blackouts.
- **NASA DONKI**: solar flares, CMEs, SEP events and geomagnetic storms from the last 30 days. These drive radiation
  risk in cruise, solar-array degradation and rover radiation damage. Set `NASA_API_KEY` (free at api.nasa.gov);
  `DEMO_KEY` works but is rate limited.
- `GET /api/nasa/conditions/` returns all of it. Each match snapshots the data at creation, so both players fly
  under identical conditions.

**Every kg counts (spacecraft):**
- Predicted mass = parts CBE + avionics/ADCS + structure (22 %) + harness (6 %) + **mass growth allowance**
  (5-30 % per part by heritage, AIAA S-120). The drafting board shows the full mass budget with the share of each
  subsystem.
- Launch: `m_pl = (m_LEO + m_stage)·e^(−Δv/(Isp·g0)) − m_stage`, where Δv runs from LEO to today's C3. The 60 kg
  payload adapter counts too. NASA-style ≥15 % launch margin warning.
- Monte Carlo: the as-built probe grows by a random share of its MGA. Overweight means propellant is off-loaded,
  and too overweight means the launch is scrubbed. Arrival Δv includes Isp and navigation dispersions, propellant
  residuals, gravity losses and the ion spiral penalty.
- Batteries follow Li-ion cycle life vs depth of discharge and lose capacity. Power-negative probes throttle their
  instruments. Redundant antennas or power units only fail when all of them fail.

**Every kg counts (rover):** F = ma with real surface gravity. Traction is μ·m·g·cosθ. Rolling resistance
grows with ground pressure (wheels sink). Grade is m·g·sinθ. Drag is ½ρC_dAv² (Venus air is 65 kg/m³). Motors are
limited by stall force and by power (F ≤ P/v). Jump-jet gas per hop is m·Δv/(Isp·g0). Crash damage is
proportional to kinetic energy. Solar power uses today's real Sun distance × atmospheric transmission. Only
energy is time-compressed (1 drive-second = 2 mission minutes).

**Real prices (`catalog.py`, `sim.cost_model`):** rockets are real vehicles at real 2020-2026 prices: Falcon 9 ($74M list,
2026), New Glenn ($68-110M), Vulcan VC6 ($110-200M) and Falcon Heavy (NASA paid $117M, $178M and $257M). Their
performance is calibrated so the rocket equation reproduces the published GTO and Mars numbers. Mission cost =
launch (+$50M nuclear approval if you carry an RTG) + bus (1.6·dry_kg^0.7, a mass-based cost estimating relation) +
parts (HiRISE-class camera $40M, MMRTG $75M...) + 30% management/I&T + 25% reserves + operations. Cost caps are
$800M for Mars, $650M for Venus and $560M for the Moon (MRO $717M, LRO $590M). Each launch rolls shared cost growth
(historical mean about 12%), and an overrun above the cap plus 10% cancels the mission.

**Live equations notebook (`EquationsPanel.tsx`):** about 25 equations (TWR, C3, escape Δv, rocket equation, mass
closure, propellant fraction, Tsiolkovsky, solar 1/r², power balance, RTG decay, battery DoD and cycle life, link
budget, light time, heat balance, heaters, radiation, cost CER and more). Each one shows your live numbers plugged in,
the optimum range, a suggested fix and a real-mission reference.

**Rover telecom and cameras:** science only scores once its data reaches Earth. Data goes either through the lander's
UHF relay (drive back to it) or through the high-gain antenna direct to Earth. The antenna only works while Earth is
above the site's horizon, its rate falls as 1/d² using the live Earth distance, data arrives after the real light-time
(compressed), and it draws +60 W while transmitting. Navcams spot samples at 90 m instead of 25 m, brake
automatically before rocks (AutoNav), map nearby hazards and add context images (×1.25 value, ×1.5 data).

**Thermal:** a real heat balance. Sunlight absorbed through the MLI, planet glow (Venus clouds, lunar IR) and
electronics + RTG waste heat must be rejected by the body, bus radiators and radiator panels. In the cold, heat leaks
out and heaters burn power unless you fit MLI or carry an RTG.

**Rover sites:** Jezero Crater, Taurus-Littrow (Apollo 17) and the Venera 13 site. Mars local solar time and season
come from NASA GISS's Mars24 algorithm; lunar Sun elevation comes from the ephemeris. Solar output follows the real
Sun angle, night needs heaters, and Mars dust storms only happen in the real dust-storm season (Ls 180-360°).
Terrain is still procedurally generated, not real elevation data.

### 3D + game feel (Three.js)
- `components/Hangar3D.tsx` shows your spacecraft in 3D, and **every part you draft appears on it** (solar wings sized
  by wattage, dish sized by bandwidth, tanks sized by propellant, glowing RTG and so on). Drag to rotate.
- `components/Launch3D.tsx` plays the cinematic: countdown, ignition, both rockets lifting off side by side with exhaust
  particles and camera shake, explosions, a flash cut to space, transfer arcs, a retro-burn, orbit and data beams home,
  plus a live HUD and event pop-ups.
- `three/models.ts` builds the procedural models and planet textures (no asset files). `three/particles.ts` handles fire,
  smoke and explosions.
- `lib/sfx.ts` synthesizes every sound with Web Audio (no files). Mute with 🔊 in the top bar.
- A live rival feed ("⚡ took the LAST Ka-Band antenna!"), final-10-second ticks, and confetti when you win.

---

## Realtime architecture

```
React ──ws /ws/lobby/?token=…──► TokenAuthMiddleware ─► PresenceMiddleware ─► LobbyConsumer
      ──ws /ws/match/<id>/────►        (DRF token)        (Redis SADD/SREM)     MatchConsumer
                                                                                   │
                         Postgres (select_for_update on Match row = atomic pool) ◄─┘
                         Redis channel layer: group_send("match_<id>") ─► both sockets
```

- **Broadcast:** a player picks a part. React sends `{"type":"pick","component_id":7}`. `MatchConsumer` locks the
  Match row, decrements the pool and saves, then calls `group_send` through Redis. Both screens re-render from the
  same authoritative state. If both players click the last copy at the same moment, the row lock makes one of them get
  "Sold out!".
- **Presence:** `PresenceMiddleware` wraps `receive()`, catches `websocket.connect` and `websocket.disconnect`, and keeps a
  per-user connection counter in Redis (`HINCRBY`). The user goes in the `presence:online` set only on the 0→1 change
  and comes out on 1→0, so a user with a lobby tab and a match tab open still counts once. Each change triggers a
  `presence.changed` broadcast to the `lobby` group.
- **Matchmaking:** the `QueueEntry` table in Postgres uses `select_for_update(skip_locked=True)`. When two players are
  paired, a `match.found` message goes to each player's `user_<id>` group.

### WebSocket protocol

| Socket | Client → Server | Server → Client |
|---|---|---|
| `/ws/lobby/` | `find_match`, `play_ai`, `cancel` | `presence {users}`, `queued`, `cancelled`, `match_found {match_id}` |
| `/ws/match/<id>/` | `pick {component_id}`, `release {component_id}`, `ready`, `unready`, `tick`, `forfeit` | `state {state}`, `result {state, results, winner_id}`, `error {message}`, `opponent_status {online}` |

`tick` is sent by the client when its countdown hits 0. The server then checks the deadline and launches.
This is good enough for a hackathon. For production, move it to a Celery or asyncio timer.

### REST endpoints (`/api/…`)
`auth/guest/`, `auth/register/`, `auth/login/`, `auth/me/`, `components/`, `missions/`,
`leaderboard/`, `matches/mine/`, `practice/` (solo analyze or launch with the same simulator, optional `class_code`),
`nasa/conditions/` (live NASA data), `validation/` (model vs published numbers), `class/` (POST: create a class
challenge), `class/<code>/` (class info + leaderboard).

---

## Ideas for the next 48 hours
- [ ] Mission-specific art (a Mars crater photo reveal when imaging succeeds)
- [ ] "Engineer's notebook" pop-ups that explain each ratio with real NASA mission examples (MRO, Magellan, LRO)
- [ ] Ban phase: each player removes one part from the pool before drafting
- [ ] Sound effects plus screen shake on launch
- [ ] Deploy: Daphne/Uvicorn on Railway/Render, managed Postgres and Redis, `npm run build` served by any static host


---

## New in the final sprint
- **AI rival** (`game/bot.py`): click "🤖 Play vs AI rival". It is a greedy designer that evaluates every pool part with
  the same simulator, respects budget and limits, and likes to steal last copies. It picks one part per move you make
  and finishes its build when you ready up.
- **Science & data page**: `/api/validation/` runs 21 checks of our equations against published numbers, labelled as
  independent / calibrated / input, plus every data source.
- **Mission coach** (Practice), a **flight director's debrief** after every launch (what failed, which equation, the fix),
  and "est." vs ✓ real price labels.
- **Classroom mode**: in Practice, click "Create class challenge" to get a code. Students who join fly the same mission
  with the same NASA snapshot and the same dice, so the class leaderboard ranks engineering only.
- `python manage.py nasa_check`: tests the live NASA connection and saves `backend/.nasa_backup.json`, which is used
  automatically if NASA is unreachable later. Commit that file before demo day.

After pulling: `python manage.py migrate && python manage.py seed_catalog`.

## Deploy (public link for judges)
1. Push the repo to GitHub (public: Space Apps requires a public code link).
2. **Backend on Render** (or Railway): New Web Service → root `space-race/backend`.
   Build: `pip install -r requirements.txt && python manage.py migrate && python manage.py seed_catalog`.
   Start: `daphne -b 0.0.0.0 -p $PORT spacerace.asgi:application`.
   Env: `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY=<random>`, `DJANGO_ALLOWED_HOSTS=<your-app>.onrender.com`,
   `CORS_ALLOWED_ORIGINS=https://<your-frontend>`, `NASA_API_KEY=<key>`. Without `POSTGRES_DB` it uses SQLite,
   which is fine for a demo (data resets on redeploy).
3. **Frontend (same host, no proxy needed)**: run `cd frontend && npm run build` locally and commit the build with
   `git add -f frontend/dist` (dist/ is git-ignored by default). When `frontend/dist` exists, Django serves the game at
   `/` itself, so the API and WebSockets share one origin and everything, PvP included, works from one Render URL.
4. Test the public link in an incognito window: guest login → Practice → test launch.
