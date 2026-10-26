# Artemis II — Launch & Dodge

Ein 3D-Browser-Raketenspiel mit Three.js und Vite: cineastischer Start der Artemis-II-Rakete (SLS + Orion) von der eigenen Startrampe, fließender Übergang ins All und ein Asteroiden-Ausweichspiel in der Third-Person-Ansicht.

## Ablauf

1. **Startbildschirm**: „ARTEMIS II“, die Kamera kreist langsam um die Rakete. Auf **Start** klicken (oder `Leertaste` / `Enter`).
2. **Countdown 10 → 0**: Die Kamera fährt etwa eine halbe Runde um die Rakete in die tiefe Startperspektive und hält dabei an einer Stelle, an der kein Turm die Sicht verdeckt. Bei T-3,5 zünden die Haupttriebwerke (Dampf, wachsende Flamme), bei T-0 die Booster. Mit **Überspringen** läuft der Start sechsmal so schnell.
3. **Liftoff**: Feuer an allen sechs Düsen, Rauchwolken aus dem Flammenkanal, Kamerawackeln, Rauchsäule am Himmel, Rollmanöver. Die Kamera folgt nach oben, der Himmel wird mit der Höhe dunkler, Sterne und Erdkrümmung erscheinen.
4. **Übergang (ca. 3 s, ohne Schnitt)**: Die Rakete neigt sich in die Horizontale, die Booster werden abgesprengt und trudeln davon, die Kamera schwenkt auf einem Bogen hinter die Rakete, das HUD blendet ein.
5. **Gameplay**: Die Rakete fliegt automatisch vorwärts. Asteroiden kommen von vorne, mit der Zeit werden es mehr, sie werden größer und schneller, ein Teil zielt auf die Rakete. Der Score ist die geflogene Distanz in km. Die Erde bleibt zurück, der Mond liegt voraus.
6. **Power-up**: Seltene, leuchtende Kristalle geben **5 s Schild**. Mit Schild zerschellen Asteroiden bei Kontakt, in der letzten Sekunde blinken Schild und HUD-Balken.
7. **Game Over**: Explosion, danach Score und Rekord. **Nochmal** startet direkt das Gameplay (die Rakete fliegt von hinten ins Bild), **Zurück zum Start** zeigt die komplette Startanimation erneut.

## Steuerung

| Aktion | Desktop | Mobile |
|---|---|---|
| Lenken | `WASD` / Pfeiltasten | Ziehen/Wischen (schwebender Joystick) |
| Start | Button, `Leertaste`, `Enter` | Button |
| Nochmal | Button, `R`, `Leertaste` | Button |
| Zurück zum Start | Button, `L`, `Esc` | Button |
| Ton an/aus | `M`, 🔊-Button | 🔊-Button |

## Projekt starten

```bash
npm install
npm run dev
```

Produktions-Build: `npm run build` und danach `npm run preview`. Der Ordner `dist/` ist komplett statisch und funktioniert auch aus einem Unterordner.

## Module (`src/`)

| Datei | Aufgabe |
|---|---|
| `main.js` | Renderer, Licht, Laden des Modells, State Machine, Hauptschleife, adaptive Qualität |
| `config.js` | Alle Einstellwerte (Timing, Kamera, Schwierigkeit, Partikel, Power-ups) und kleine Mathe-Helfer |
| `rocketModel.js` | Teilt das GLB in Startgelände, Core-Stufe, zwei Booster und sechs Düsen auf |
| `environment.js` | Himmelsverlauf, prozedurale Erde mit Atmosphäre (GLSL), Mond, Sternenfeld, Speed-Streaks |
| `launch.js` | Titel-Orbit, Countdown, Zündung, Aufstieg, Kamerafahrt |
| `transition.js` | Pitch-Over, Booster-Trennung, Kameraschwenk ins Gameplay |
| `exhaust.js` | Triebwerksflammen (Shader-Kegel, Mach-Diamanten) sowie Feuer, Rauch und Dampf |
| `game.js` | Gameplay: Steuerung, Kollision, Schild, Score/Rekord, Chase-Kamera, Explosion |
| `asteroids.js` | Prozedurale Asteroiden (verformte Icosaeder mit Kratern), InstancedMesh-Pool |
| `powerups.js` | Power-up-Kristalle |
| `particles.js` | Instanziertes Billboard-Partikelsystem (Feuer, Rauch, Funken) |
| `input.js` | Tastatur- und Touch-Steuerung |
| `hud.js` / `style.css` | HUD, Overlays, Buttons |
| `audio.js` | Synthetisierte Sounds (Web Audio, keine Audiodateien) |

## Hinweise

- Als einziges Asset wird das eigene Modell `assets/Nasa_Rakete_small.glb` genutzt. Asteroiden, Power-ups, Erde, Mond, Sterne, Partikel und Sounds werden im Code erzeugt. Zur Laufzeit wird nichts aus dem Internet geladen.
- Booster sind im Modell ein gemeinsames Objekt (`Circle.001`). Sie werden beim Laden nach Seite getrennt, damit sie einzeln abgesprengt werden können. Die sechs Düsen werden aus dem Startturm-Objekt (`Circle.008`) herausgelöst.
- Im Export schwebt die Rakete ca. 200 Einheiten über dem Starttisch. Sie wird beim Laden auf das Deck abgesenkt (`CONFIG.model.deckY`).
- Der Rekord liegt in `localStorage` unter dem Schlüssel `artemis2-best-km`.
- Auf Touch-Geräten: Pixel-Ratio höchstens 1,5, kein Bloom, keine Schatten, weniger Partikel. Fällt die Bildrate unter ~45 FPS, senkt das Spiel automatisch die Auflösung und schaltet danach Bloom ab.
- Testmodus: `?test` an die URL hängen, dann steht `window.__t` zum Vorspulen und für automatische Tests bereit.
