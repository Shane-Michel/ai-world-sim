export function initializeGodMode(world, simulation) {
  const button = document.getElementById('god-mode');
  button.addEventListener('click', () => {
    simulation.applyBlessing();
  });

  button.title = 'Bless the world to improve mood and energy instantly';
}
