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
python manage.py seed_catalog
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
- **Mass → launch:** `TWR = thrust / ((rocket + spacecraft) · g)` must be over 1.2. The spacecraft's wet mass must fit
  `payload_leo × lv_factor` for the destination (Mars is about 22% of LEO capacity).
- **Mass → orbit insertion:** Tsiolkovsky `Δv = Isp · g0 · ln(wet/dry)`. Heavier parts mean less Δv from the same tank.
- **Distance → power:** solar output scales with `1 / AU²` (Mars gets 43%, Venus 193%). RTGs give constant power.
- **Eclipses → batteries:** `(draw − RTG) × eclipse_hours` must be at most 80% of battery capacity.
- **Cameras → data → comms → power:** a HiRes camera makes 10 GB/day. X-band downlinks only about 3 GB/day at Mars (`1/d²`).
  Ka-band carries more but draws 120 W, which means bigger arrays, more mass and a bigger rocket.
- **Environment → thermal:** Venus needs thermal rating 4 (heavy active cooling, plus 50 W).
- **Score:** `min(science%, 150%) × 1000 + 2 × leftover $M + 250 for full success`. Elo rating feeds the leaderboard.

Tune the balance in `game/catalog.py`, then run `python manage.py seed_catalog` again (it upserts),
or edit the parts live in `/admin`.

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
| `/ws/lobby/` | `find_match`, `cancel` | `presence {users}`, `queued`, `cancelled`, `match_found {match_id}` |
| `/ws/match/<id>/` | `pick {component_id}`, `release {component_id}`, `ready`, `unready`, `tick`, `forfeit` | `state {state}`, `result {state, results, winner_id}`, `error {message}`, `opponent_status {online}` |

`tick` is sent by the client when its countdown hits 0. The server then checks the deadline and launches.
This is good enough for a hackathon. For production, move it to a Celery or asyncio timer.

### REST endpoints (`/api/…`)
`auth/guest/`, `auth/register/`, `auth/login/`, `auth/me/`, `components/`, `missions/`,
`leaderboard/`, `matches/mine/`, `practice/` (solo analyze or launch with the same simulator).

---

## Ideas for the next 48 hours
- [ ] Mission-specific art (a Mars crater photo reveal when imaging succeeds)
- [ ] "Engineer's notebook" pop-ups that explain each ratio with real NASA mission examples (MRO, Magellan, LRO)
- [ ] Ban phase: each player removes one part from the pool before drafting
- [ ] Sound effects plus screen shake on launch
- [ ] Deploy: Daphne/Uvicorn on Railway/Render, managed Postgres and Redis, `npm run build` served by any static host
