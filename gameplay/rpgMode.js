export function initializeRpgMode(world, simulation) {
  const button = document.getElementById('rpg-mode');
  button.addEventListener('click', () => {
    const name = `Hero-${Math.floor(Math.random() * 999)}`;
    simulation.spawnHero(name);
  });

  button.title = 'Spawn a controllable hero and focus the HUD on them';
}
