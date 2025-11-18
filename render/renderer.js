import { spriteForBiome } from './sprites.js';

export function setupRenderer(canvas, world, simulation) {
  const ctx = canvas.getContext('2d');
  let selectHandler = () => {};

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
  }

  function drawGrid() {
    const cellWidth = canvas.width / world.width;
    const cellHeight = canvas.height / world.height;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[y][x];
        const color = spriteForBiome(tile.biome, tile.resources);
        ctx.fillStyle = color;
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth + 1, cellHeight + 1);

        if (tile.controlledBy) {
          const banner = world.kingdoms.find((k) => k.id === tile.controlledBy);
          if (banner) {
            ctx.fillStyle = `${banner.color}33`;
            ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth + 1, cellHeight + 1);

            ctx.strokeStyle = `${banner.color}aa`;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.65;
            if (!world.tiles[y - 1]?.[x] || world.tiles[y - 1][x].controlledBy !== tile.controlledBy) {
              ctx.beginPath();
              ctx.moveTo(x * cellWidth, y * cellHeight);
              ctx.lineTo((x + 1) * cellWidth, y * cellHeight);
              ctx.stroke();
            }
            if (!world.tiles[y + 1]?.[x] || world.tiles[y + 1][x].controlledBy !== tile.controlledBy) {
              ctx.beginPath();
              ctx.moveTo(x * cellWidth, (y + 1) * cellHeight);
              ctx.lineTo((x + 1) * cellWidth, (y + 1) * cellHeight);
              ctx.stroke();
            }
            if (!world.tiles[y]?.[x - 1] || world.tiles[y][x - 1].controlledBy !== tile.controlledBy) {
              ctx.beginPath();
              ctx.moveTo(x * cellWidth, y * cellHeight);
              ctx.lineTo(x * cellWidth, (y + 1) * cellHeight);
              ctx.stroke();
            }
            if (!world.tiles[y]?.[x + 1] || world.tiles[y][x + 1].controlledBy !== tile.controlledBy) {
              ctx.beginPath();
              ctx.moveTo((x + 1) * cellWidth, y * cellHeight);
              ctx.lineTo((x + 1) * cellWidth, (y + 1) * cellHeight);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }
        }
      }
    }
  }

  function drawEntities() {
    const cellWidth = canvas.width / world.width;
    const cellHeight = canvas.height / world.height;
    const citizens = simulation.ecs.query(['Position', 'Brain', 'Identity']);
    citizens.forEach(({ Position, Brain, Identity, id }) => {
      ctx.fillStyle = Brain.kingdom === 'ember' ? '#ffad61' : '#6dd5ff';
      const px = Position.x * cellWidth;
      const py = Position.y * cellHeight;
      const size = Math.max(4, Math.min(cellWidth, cellHeight) * 0.4);
      ctx.beginPath();
      ctx.arc(px + cellWidth / 2, py + cellHeight / 2, size, 0, Math.PI * 2);
      ctx.fill();

      if (simulation.focusedEntity?.id === id) {
        ctx.strokeStyle = '#fff1a8';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, cellWidth - 4, cellHeight - 4);
      }
    });
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawEntities();
    requestAnimationFrame(render);
  }

  resize();
  render();
  window.addEventListener('resize', resize);

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * world.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * world.height);
    const [entity] = simulation.ecs.query(['Position', 'Identity']).filter((e) => e.Position.x === x && e.Position.y === y);
    if (entity) {
      selectHandler({ id: entity.id, name: entity.Identity.name });
    }
  });

  return {
    onSelectEntity: (fn) => {
      selectHandler = fn;
    },
  };
}
