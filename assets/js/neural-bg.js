/**
 * Neural Network Background Animation
 * Creates an AI-themed animated canvas with interconnected nodes
 * and glowing neural pathways for the hero section.
 */
(function () {
  const canvas = document.getElementById('neural-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height, nodes, mouse, animationId;

  const CONFIG = {
    nodeCount: 80,
    connectionDistance: 180,
    nodeSpeed: 0.4,
    nodeMinRadius: 2,
    nodeMaxRadius: 4,
    mouseRadius: 250,
    colors: {
      node: 'rgba(0, 212, 255, 0.8)',
      nodeGlow: 'rgba(0, 212, 255, 0.3)',
      line: 'rgba(0, 212, 255,',
      activeLine: 'rgba(124, 58, 237,',
      pulse: 'rgba(0, 212, 255, 0.6)',
    },
  };

  mouse = { x: -1000, y: -1000 };

  function resize() {
    width = canvas.width = canvas.parentElement.offsetWidth;
    height = canvas.height = canvas.parentElement.offsetHeight;
  }

  class Node {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * CONFIG.nodeSpeed;
      this.vy = (Math.random() - 0.5) * CONFIG.nodeSpeed;
      this.radius = CONFIG.nodeMinRadius + Math.random() * (CONFIG.nodeMaxRadius - CONFIG.nodeMinRadius);
      this.pulsePhase = Math.random() * Math.PI * 2;
      this.pulseSpeed = 0.02 + Math.random() * 0.02;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.pulsePhase += this.pulseSpeed;

      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;

      // Mouse repulsion
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONFIG.mouseRadius && dist > 0) {
        const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius;
        this.vx += (dx / dist) * force * 0.3;
        this.vy += (dy / dist) * force * 0.3;
      }

      // Dampen velocity
      this.vx *= 0.99;
      this.vy *= 0.99;

      // Ensure minimum speed
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed < CONFIG.nodeSpeed * 0.3) {
        this.vx += (Math.random() - 0.5) * 0.1;
        this.vy += (Math.random() - 0.5) * 0.1;
      }
    }

    draw() {
      const pulse = Math.sin(this.pulsePhase) * 0.5 + 0.5;
      const r = this.radius + pulse * 1.5;

      // Outer glow
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colors.nodeGlow;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colors.node;
      ctx.shadowBlur = 15;
      ctx.shadowColor = CONFIG.colors.node;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function initNodes() {
    nodes = [];
    const count = width < 600 ? Math.floor(CONFIG.nodeCount * 0.5) : CONFIG.nodeCount;
    for (let i = 0; i < count; i++) {
      nodes.push(new Node());
    }
  }

  function drawConnections() {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.connectionDistance) {
          const opacity = (1 - dist / CONFIG.connectionDistance) * 0.5;

          // Check if near mouse for highlight
          const midX = (nodes[i].x + nodes[j].x) / 2;
          const midY = (nodes[i].y + nodes[j].y) / 2;
          const mouseDist = Math.sqrt(
            (midX - mouse.x) ** 2 + (midY - mouse.y) ** 2
          );

          let color;
          if (mouseDist < CONFIG.mouseRadius) {
            const blend = 1 - mouseDist / CONFIG.mouseRadius;
            color = `rgba(${Math.round(124 * blend)}, ${Math.round(58 * blend + 212 * (1 - blend))}, ${Math.round(237 * blend + 255 * (1 - blend))}, ${opacity})`;
          } else {
            color = CONFIG.colors.line + opacity + ')';
          }

          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = color;
          ctx.lineWidth = opacity * 2;
          ctx.stroke();
        }
      }
    }
  }

  // Data pulse animation along connections
  let pulses = [];

  function spawnPulse() {
    if (nodes.length < 2) return;
    const i = Math.floor(Math.random() * nodes.length);
    let j;
    let minDist = Infinity;
    // Find nearest neighbor
    for (let k = 0; k < nodes.length; k++) {
      if (k === i) continue;
      const dx = nodes[i].x - nodes[k].x;
      const dy = nodes[i].y - nodes[k].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < CONFIG.connectionDistance && d < minDist) {
        minDist = d;
        j = k;
      }
    }
    if (j !== undefined) {
      pulses.push({
        from: i,
        to: j,
        progress: 0,
        speed: 0.015 + Math.random() * 0.01,
      });
    }
  }

  function drawPulses() {
    pulses = pulses.filter((p) => p.progress <= 1);
    for (const p of pulses) {
      p.progress += p.speed;
      const x = nodes[p.from].x + (nodes[p.to].x - nodes[p.from].x) * p.progress;
      const y = nodes[p.from].y + (nodes[p.to].y - nodes[p.from].y) * p.progress;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.colors.pulse;
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(0, 212, 255, 0.8)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  let frameCount = 0;

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (const node of nodes) {
      node.update();
    }

    drawConnections();
    drawPulses();

    for (const node of nodes) {
      node.draw();
    }

    frameCount++;
    if (frameCount % 30 === 0) {
      spawnPulse();
    }

    animationId = requestAnimationFrame(animate);
  }

  // Event listeners
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  canvas.addEventListener('touchmove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.touches[0].clientX - rect.left;
    mouse.y = e.touches[0].clientY - rect.top;
  });

  canvas.addEventListener('touchend', () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  window.addEventListener('resize', () => {
    resize();
    initNodes();
  });

  // Initialize
  resize();
  initNodes();
  animate();

  // Pause when not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animationId);
    } else {
      animate();
    }
  });
})();
