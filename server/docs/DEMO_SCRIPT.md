# Demo script (what is demonstrable today)
1. `uvicorn app.main:app`, open `/docs`.
2. Set `MARS_ALLOW_SYNTHETIC_FIXTURES=true`; POST `/routes/plan` with region `synthetic-demo`, start (0,0),
   target (0.18,-0.15). Point out the SYNTHETIC warning and `hazards_evaluated: ["slope"]`.
3. Same call with a target beyond the grid -> clear 422; unknown region -> 404 `terrain_unavailable`.
4. Sync: disconnect, enqueue, sync (0 delivered), reconnect, sync (delivered). Say it is simulated.
5. Assistant with no data -> `no_evidence` (no invented answer).
Not yet demonstrable: 3D map, real NASA layers, offline caching in a browser, AI-generated answers.
