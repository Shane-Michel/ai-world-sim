# AI World Simulation Game

A browser-based AI-driven world simulation featuring lightweight ECS, procedural world tiles, and interactive mode toggles for god-mode, kingdom influence, and RPG hero spawning.

## Project Structure
- `index.html`: Canvas-based UI and HUD wiring.
- `engine/`: ECS core, world state, AI logic, and simulation loop.
- `render/`: Canvas renderer and biome coloring helpers.
- `gameplay/`: Mode-specific interactions (god, kingdom, RPG).
- `assets/`: Placeholder for images and audio.

## Running the Simulation
No build step is required. Serve the repository with any static file server or open `index.html` directly in a modern browser:

```bash
# using python
python -m http.server 8000
# then visit http://localhost:8000
```

## Controls
- **God Mode**: Blesses the world, boosting population mood and energy.
- **Kingdom Mode**: Strengthens all kingdoms by increasing their influence.
- **RPG Mode**: Spawns a new hero and focuses the HUD on them.
- **Click on the world**: Selects a citizen and focuses HUD details.

## Simulation Notes
- World time advances continuously with changing seasons, weather, and temperature.
- Citizens pursue simple goals (wander, gather, socialize, rest) with memories and needs.
- The renderer visualizes biomes and citizens on a 2D grid.

MIT licensed; ready to extend with deeper AI, story events, and richer mechanics.
