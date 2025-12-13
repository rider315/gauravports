// Premium Noise Texture Animation
(function() {
  const canvas = document.getElementById('noise-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  function createNoise() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const buffer32 = new Uint32Array(imageData.data.buffer);
    const len = buffer32.length;
    
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.5) {
        buffer32[i] = 0xff000000;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  function animate() {
    createNoise();
    setTimeout(() => {
      requestAnimationFrame(animate);
    }, 100);
  }
  
  resizeCanvas();
  animate();
  
  window.addEventListener('resize', resizeCanvas);
})();

// Interactive Mouse Effect
(function() {
  const home = document.querySelector('.home');
  if (!home) return;
  
  let mouseX = 0, mouseY = 0;
  let currentX = 0, currentY = 0;
  
  home.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 30;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 30;
  });
  
  function animate() {
    currentX += (mouseX - currentX) * 0.05;
    currentY += (mouseY - currentY) * 0.05;
    
    const orbs = document.querySelectorAll('.gradient-orb');
    orbs.forEach((orb, index) => {
      const speed = (index + 1) * 0.5;
      orb.style.transform = `translate(${currentX * speed}px, ${currentY * speed}px)`;
    });
    
    requestAnimationFrame(animate);
  }
  
  animate();
})();
