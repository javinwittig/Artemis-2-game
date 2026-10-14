# Artemis II: Rocket Game

An interactive 3D website built around my own Blender model of the **Artemis II SLS
rocket**, with an asteroid-dodging game and a cinematic launch sequence. No build step
and no framework — plain ES modules + [three.js](https://threejs.org/) loaded from a
CDN, so you can run it with any static file server.

---

## Play

You need to serve the folder over HTTP (ES modules and the `.glb` model do not
load from `file://`). Any static server works, for example:

```powershell
# from the project folder — Python 3
python -m http.server 8000
# then open http://localhost:8000/
```

The site opens on the 3D view of the rocket standing on its launch pad (slow
orbiting camera). Press **PLAY GAME** to start.

### Game flow

1. **Countdown** — a short 3-2-1 countdown appears over the rocket on the pad.
2. **Liftoff** — the rocket accelerates upward with fire and smoke from the
   engines; the camera follows and the launch pad falls away behind it. As it
   climbs, the sky **gradually darkens** into space and the star field fades in.
3. **Asteroid dodging** — after a short quiet coast, asteroids begin to rain
   down from above, slowly at first and then faster.
   - **Steer:** `←` / `→` or `A` / `D` (the rocket banks into turns).
   - **Score:** +10 points per second survived, +5 per asteroid dodged.
   - **One hit ends the game.** The game-over screen shows your final score,
     your best score (saved in `localStorage`), a **RESTART** button and a
     **BACK TO MENU** button.
   - `Esc` also returns to the 3D view at any time.

---

## Deploying

It is fully static. Upload the whole folder (minus `node_modules/` and the
`inspect_*` helper scripts) to any static host — GitHub Pages, Netlify, Vercel,
Cloudflare Pages, or a plain web server — and serve it from the root. All asset
paths are **relative**, so it works from a sub-path too. The only runtime
dependency on the internet is the three.js CDN (see `index.html` import map).

---

## Project structure

```
index.html          # page shell: menu, in-game HUD, countdown, game-over overlay
styles.css          # HUD + overlay styling
js/
  main.js           # bootstrap: scene, lights, model loading, mode switching, render loop
  game.js           # the game: launch sequence, steering, asteroids, stars, scoring, collision
assets/
  Nasa_Rakete_small.glb   # my Blender SLS model (Draco + Meshopt compressed)
renders/
  Blender_Render.png      # Blender render used as the menu background
blender/            # original Blender source files
inspect_*           # dev-only helper scripts for inspecting the .glb (not needed to run)
```

### How the Blender model is used

The exported `.glb` is a single flat scene with **no animations**, so the site
does the rigging at runtime:

- Meshes are classified **by name** — `Circle` is the core + Orion stack,
  `Circle001` is *both* solid boosters in one mesh, everything else is
  launch-pad scenery.
- Because the two boosters share one mesh, the mesh is **split at runtime** into
  left and right halves (triangles bucketed by their world-space `z`).
- The whole stack is lowered onto the launch mount for the menu view.
- For the launch sequence the rocket is at full scale on the pad; when the
  asteroid phase begins it is scaled down and centred on the gameplay plane, the
  launch-pad scenery is hidden, and the background switches to dark space with a
  scrolling star field.
- The engine flame is **generated in code** (additive sprite + point light) —
  the model was exported without it.

---

## Hitboxes (tuning aid)

`js/game.js` has a `DEBUG` flag at the top (default `false`). Set it to `true`
to render the collision hitboxes as wireframes:

- **Rocket** — three green spheres stacked along the body, narrower than the
  visual model.
- **Asteroids** — a red sphere sized to the *actual* visible rock (the hitbox is
  a fraction of the rock, so near-misses do not kill you).

```js
// js/game.js
const DEBUG = true; // flip for wireframe debugging
```

Tuning knobs live in `GAME_CONFIG`: `rocketHitboxRadiusFactor` (rocket solid
fraction), `asteroidHitboxFactor` (rock fraction that is solid), `hitGrace`
(seconds of immunity when the asteroid phase starts) and `spawnWarmup` (quiet
seconds before the first rock).

---

## Notes

- The old launch-simulation game (checklist, countdown, ascent, separation,
  orbit insertion) was removed and replaced by this launch + asteroid game.
- `js/game.js` holds every tunable gameplay constant in `GAME_CONFIG`.