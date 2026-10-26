# Artemis II — Launch & Dodge

A 3D browser game built with Three.js and Vite: launch the Artemis II rocket (SLS + Orion) from its pad, follow it into space without a cut, then dodge asteroids in a third-person view.

Play it at https://javinwittig.github.io/Artemis-2-game/

## How it plays

1. **Title screen**: the camera circles the rocket on the pad. Click **Start** (or press `Space` / `Enter`).
2. **Countdown 10 → 0**: the camera moves around the pad and stops where no tower blocks the view. The main engines start at T–3.5, the boosters ignite at T–0. **Skip** runs the launch at 6× speed.
3. **Liftoff**: flames from all six nozzles, exhaust clouds from the flame trench, camera shake, a smoke column and a roll program. The sky darkens with altitude until stars and the curve of the Earth appear.
4. **Transition (about 3 s, no cut)**: the rocket pitches over, the boosters separate and tumble away, the camera swings behind the rocket and the HUD fades in.
5. **Gameplay**: the rocket flies forward on its own. Asteroids come at you; over time there are more of them, they get bigger and faster, and some aim at you. Your score is the distance flown in km. The Earth falls behind, the Moon is ahead.
6. **Power-up**: rare glowing crystals give you a **5 second shield**. Asteroids that touch the shield are destroyed. Shield and HUD bar blink during the last second.
7. **Game over**: explosion, then your score and best score. **Try again** goes straight back into gameplay, **Back to start** plays the full launch again.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Steer | `WASD` / arrow keys | Drag anywhere (floating joystick) |
| Start | Button, `Space`, `Enter` | Button |
| Try again | Button, `R`, `Space` | Button |
| Back to start | Button, `L`, `Esc` | Button |
| Sound on/off | `M`, button | Button |

## Running it

```bash
npm install
npm run dev
```

Production build: `npm run build`, then `npm run preview`. The `dist/` folder is fully static and also works from a sub-path.

After `npm install` you can also open `index.html` with a plain static server such as VS Code's Live Server. An import map in `index.html` points `three` at `node_modules/`, so no build step is needed for that.

Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Modules (`src/`)

| File | Purpose |
|---|---|
| `main.js` | Renderer, lights, model loading, state machine, main loop, adaptive quality |
| `config.js` | All tuning values (timing, camera, difficulty, particles, power-ups) and small math helpers |
| `rocketModel.js` | Splits the GLB into launch site, core stage, two boosters and six nozzles |
| `environment.js` | Sky gradient, procedural Earth with atmosphere (GLSL), Moon, star field, speed streaks |
| `launch.js` | Title orbit, countdown, ignition, ascent, camera moves |
| `transition.js` | Pitch-over, booster separation, camera swing into gameplay |
| `exhaust.js` | Engine plumes (shader cones with shock diamonds) plus fire, smoke and steam |
| `game.js` | Gameplay: steering, collisions, shield, score/best score, chase camera, explosion |
| `asteroids.js` | Procedural asteroids (displaced icospheres with craters), instanced pool |
| `powerups.js` | Power-up crystals |
| `particles.js` | Instanced billboard particle system (fire, smoke, sparks) |
| `input.js` | Keyboard and touch input |
| `hud.js` / `style.css` | HUD, overlays, buttons |
| `audio.js` | Synthesized sound (Web Audio, no audio files) |

## Notes

- The only asset is the Blender model `assets/Nasa_Rakete_small.glb`. Asteroids, power-ups, Earth, Moon, stars, particles and sounds are generated in code. Nothing is loaded from the internet at runtime.
- Both boosters are a single object in the model (`Circle.001`). They are split by side on load so they can separate individually. The six nozzles are cut out of the launch tower object (`Circle.008`).
- In the export the rocket floats about 200 units above the launch platform; it is lowered onto the deck on load (`CONFIG.model.deckY`).
- The best score is stored in `localStorage` under `artemis2-best-km`.
- On touch devices: pixel ratio capped at 1.5, no bloom, no shadows, fewer particles. If the frame rate drops below ~45 fps the game lowers the resolution, then turns bloom off.
- Test mode: add `?test` to the URL to get `window.__t` for fast-forwarding and automated tests.
