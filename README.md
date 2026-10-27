# Artemis 2 Game

A browser game where you launch NASA's Artemis II rocket from the pad and then steer it through an asteroid field on the way to the Moon.

![The SLS core stage flying over the Earth through an asteroid field, with the Moon ahead](docs/gameplay.jpg)

### **[▶ Play it in your browser](https://javinwittig.github.io/Artemis-2-game/)**

## Quick start

Open **https://javinwittig.github.io/Artemis-2-game/** and press **Start**. It runs on desktop and mobile. The first load fetches a 17 MB model, so give it a few seconds.

- **Desktop:** steer with `WASD` or the arrow keys
- **Mobile:** drag anywhere on the screen

## Features

First a countdown counts from 10 seconds down and then the rockets launches and the boosters seperate from the rocket and the actual game starts.

As you dogde the asteroids, there will sometimes spawn stars which gives you a shield which protects you

When you die, you can instanly restart and don't need to rewatch the starting animation which you can skip in case you want

## Run it locally

Requires **Node.js 18 or newer** (tested with Node 24) and npm. There are no other dependencies and no environment variables.

```bash
git clone https://github.com/javinwittig/Artemis-2-game.git
cd Artemis-2-game
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

- **Production build:** `npm run build` writes a static site to `dist/`, and `npm run preview` serves it.
- **Without Vite:** after `npm install`, you can also open `index.html` with any static server, for example VS Code's Live Server. An import map in `index.html` resolves `three` from `node_modules/`.
- **Deployment:** every push to `main` is built and published to GitHub Pages by `.github/workflows/deploy.yml`.

| Key | Action |
|---|---|
| `WASD` / arrow keys | Steer |
| `Space` / `Enter` | Start, or try again after a crash |
| `R` | Try again |
| `L` / `Esc` | Back to the launch pad |
| `M` | Sound on/off |

## How it works

**I cut my rocket model apart when the game loads.** I modeled the rocket and launch pad in Blender. The two boosters were one object, the engine nozzles were part of the launch tower, and the rocket was hovering above the pad. Instead of rebuilding the model, the game sorts its pieces by position when it loads: it pulls the nozzles off the tower, splits the boosters into a left and a right one, and sets the rocket down on the pad. That's how the boosters can fall away during the flight, I was a bit messy in my Blender scene.

**The camera never cuts.** The intro and the game use the same camera. When the countdown ends, it follows the rocket up, then turns around behind it once the rocket tips over. You go from the launch straight into steering without a loading screen, so when you play it, you go from the launch straight into the actual game without a loading screen. Waiting between scenes annoys me in other games, so it was important to me that this one doesn't have any in the game.

**The Earth moves, not the rocket.** Rockets fly fast, and 3D graphics get glitchy far away from the center of the scene, so the rocket stays in place and the Earth turns underneath it. The launch pad sits on top of a big globe, and as you fly, the globe rolls away below you until you only see its curved edge.

**It's built to run smoothly on phones too.** Fire, smoke and asteroids are drawn in large batches instead of one by one. Hits are checked with simple shapes instead of the exact model. Everything is prepared before you press Start, so the game doesn't stutter when an effect shows up for the first time. Phones get fewer effects, and if any device starts to lag, my game lowers the quality on its own.

Besides my rocket model, which I modeled in Blender was everything made in code: the asteroids, the Earth and Moon, the stars, the fire and smoke, and even the sounds.

## Credits

- Rocket and launch pad model: my own Blender model of the Artemis II SLS and Orion.
- [three.js](https://threejs.org/) for rendering, glTF loading with meshopt decoding, and the bloom post-processing.
- [Vite](https://vite.dev/) for the dev server and build.
- The value-noise hash in the shaders follows [Inigo Quilez's](https://iquilezles.org/) widely used formulation.
- Inspired by NASA's [Artemis II mission](https://www.nasa.gov/mission/artemis-ii/). This is a fan project and is not affiliated with NASA.




#I Hope you enjoyed playing my game