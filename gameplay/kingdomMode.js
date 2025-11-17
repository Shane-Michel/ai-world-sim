export function initializeKingdomMode(world, simulation) {
  const button = document.getElementById('kingdom-mode');
  button.addEventListener('click', () => {
    world.kingdoms.forEach((kingdom) => {
      kingdom.influence = Math.min(1, kingdom.influence + 0.02);
    });
    simulation.statusListeners.forEach((fn) => fn('Kingdom investments increase influence.'));
  });

  button.title = 'Stabilize kingdoms to gradually increase their influence';
}
