// === SETUP ===
let currentSection = 0;
let atlasData = [];
let color3List = [];
let webcamStarted = false;
let mode = "mosaic";
const CELL_SIZE = 12;

const hiddenCanvas = document.createElement("canvas");
const ctxHidden = hiddenCanvas.getContext("2d");
const atlasImg = new Image();

function hexToRGB(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function drawMosaic(source, targetCanvas, isVideo = true, mirror = false) {
  const w = source.videoWidth || source.width;
  const h = source.videoHeight || source.height;
  if (!w || !h) {
    if (isVideo) requestAnimationFrame(() => drawMosaic(source, targetCanvas, isVideo, mirror));
    return;
  }

  hiddenCanvas.width = w;
  hiddenCanvas.height = h;
  targetCanvas.width = w;
  targetCanvas.height = h;

  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  if (isVideo && mirror) {
    ctxHidden.save();
    ctxHidden.translate(w, 0);
    ctxHidden.scale(-1, 1);
    ctxHidden.drawImage(source, 0, 0, w, h);
    ctxHidden.restore();
  } else {
    ctxHidden.drawImage(source, 0, 0, w, h);
  }

  for (let y = 0; y < h; y += CELL_SIZE) {
    for (let x = 0; x < w; x += CELL_SIZE) {
      const pixel = ctxHidden.getImageData(x, y, 1, 1).data;
      const [r, g, b] = [pixel[0], pixel[1], pixel[2]];

      if (mode === "mosaic") {
        const best = atlasData.reduce((acc, tile) => {
          const dist = Math.hypot(tile.r - r, tile.g - g, tile.b - b);
          return dist < acc.dist ? { tile, dist } : acc;
        }, { tile: atlasData[0], dist: Infinity }).tile;

        ctx.save();
        ctx.translate(x + CELL_SIZE / 2, y + CELL_SIZE / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(
          atlasImg,
          best.x, best.y, best.width, best.height,
          -CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE
        );
        ctx.restore();

      } else if (mode === "color1") {
        const best = atlasData.reduce((acc, tile) => {
          const dist = Math.hypot(tile.r - r, tile.g - g, tile.b - b);
          return dist < acc.dist ? { tile, dist } : acc;
        }, { tile: atlasData[0], dist: Infinity }).tile;
        ctx.fillStyle = `rgb(${best.r},${best.g},${best.b})`;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

      } else if (mode === "color3") {
        let best = color3List[0];
        let minDist = Infinity;
        for (const entry of color3List) {
          const dist = Math.hypot(entry.r - r, entry.g - g, entry.b - b);
          if (dist < minDist) {
            minDist = dist;
            best = entry;
          }
        }
        ctx.fillStyle = `rgb(${best.r},${best.g},${best.b})`;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  if (isVideo) requestAnimationFrame(() => drawMosaic(source, targetCanvas, isVideo, mirror));
}

// === NAVIGAZIONE ===
document.addEventListener("DOMContentLoaded", () => {
  const sections = document.querySelectorAll(".section");
  const menuButtons = document.querySelectorAll(".menu-btn");
  const avanti = document.querySelector(".btn-avanti");
  const indietro = document.querySelector(".btn-indietro");
  const iniziaBtn = document.querySelector('.section-intro .btn-avanti');

  const video = document.getElementById("webcam");
  const mosaicCanvas = document.getElementById("mosaicCanvas");
  const startWebcamBtn = document.getElementById("startWebcamBtn");
  const waitingText = document.getElementById("waitingText");
  const modeSwitchWebcam = document.querySelector(".section-webcam .mode-switch");

  function showSection(index) {
    window.scrollTo(0, 0);
    sections.forEach((sec, i) => sec.classList.toggle("active", i === index));
    menuButtons.forEach((btn, i) => btn.classList.toggle("active", i === index));
    document.getElementById("bottomNav").style.display = index === 0 ? "none" : "flex";
    avanti.textContent = index === sections.length - 1 ? "Ricomincia" : "Avanti >";
    currentSection = index;
  }

  iniziaBtn?.addEventListener("click", () => showSection(1));
  avanti.addEventListener("click", () => showSection(currentSection < sections.length - 1 ? currentSection + 1 : 0));
  indietro.addEventListener("click", () => {
    if (currentSection > 0) showSection(currentSection - 1);
  });

  menuButtons.forEach((btn, i) => btn.addEventListener("click", () => showSection(i)));
  showSection(currentSection);

  // === WEBCAM ===
  startWebcamBtn.addEventListener("click", async () => {
    if (webcamStarted) return;
    webcamStarted = true;

    startWebcamBtn.style.display = "none";
    waitingText.style.display = "none";
    video.style.display = "block";
    modeSwitchWebcam.classList.remove("hidden");

    const [atlasJson, colors3Json] = await Promise.all([
      fetch("atlas_with_avgColor.json").then(r => r.json()),
      fetch("data_colors_3.json").then(r => r.json())
    ]);

    atlasData = atlasJson.map(tile => {
      const { r, g, b } = hexToRGB(tile.avgColor);
      return { ...tile, r, g, b };
    });

    color3List = [];
    colors3Json.forEach(entry => {
      entry.Colors.forEach(hex => {
        color3List.push(hexToRGB(hex));
      });
    });

    atlasImg.src = "atlas_16.jpg";
    await new Promise(res => (atlasImg.onload = res));

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.style.transform = "scaleX(-1)";
      mode = "mosaic";
      document.querySelectorAll(".section-webcam .mode-btn").forEach(b => b.classList.remove("active"));
      document.querySelector('.section-webcam .mode-btn[data-mode="mosaic"]')?.classList.add("active");
      drawMosaic(video, mosaicCanvas, true, true);
    };
  });

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      const container = btn.closest(".section");
      container.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (webcamStarted && container.classList.contains("section-webcam")) {
        drawMosaic(video, mosaicCanvas, true, true);
      }
    });
  });

  // === COLOR WHEEL ===
  const canvasWheel = document.querySelector("#colorWheelCanvas");
  if (canvasWheel) {
    const ctx = canvasWheel.getContext("2d");
    const radius = canvasWheel.width / 2;
    const cx = radius;
    const cy = radius;

    let currentWheelMode = "mosaic";
    let currentFilter = "tutti";

    function drawWheel() {
      ctx.clearRect(0, 0, canvasWheel.width, canvasWheel.height);
      for (let i = 0; i < 360; i++) {
        const startAngle = (i - 1) * Math.PI / 180;
        const endAngle = i * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, endAngle, false);

        let color = `hsl(${i}, 100%, 50%)`;
        if (currentWheelMode === "avg1") color = `hsl(${i}, 60%, 70%)`;
        if (currentWheelMode === "avg3") color = `hsl(${i}, 30%, 60%)`;

        if (currentFilter === "frequenti" && i % 30 !== 0) color = "#222";
        if (currentFilter === "presenti" && i % 10 !== 0) color = "#222";
        if (currentFilter === "assenti" && i % 45 !== 0) color = "#222";

        ctx.fillStyle = color;
        ctx.fill();
        ctx.closePath();
      }
    }

    drawWheel();

    document.querySelectorAll(".wheel-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".wheel-mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentWheelMode = btn.dataset.mode;
        drawWheel();
      });
    });

    document.querySelectorAll(".palette-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".palette-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        drawWheel();
      });
    });
  }

  // === GRIGLIA COMPARATIVA ===
  Promise.all([
    fetch("atlas_with_avgColor.json").then(r => r.json()),
    fetch("data_colors_3.json").then(r => r.json())
  ]).then(([atlasJson, colors3Json]) => {
    const container = document.getElementById("comparativeGrid");
    if (!container) return;

    for (let i = 0; i < atlasJson.length; i++) {
      const tile = atlasJson[i];
      const colorEntry = colors3Json[i];

      const col = document.createElement("div");
      col.className = "color-col";

      const img = document.createElement("img");
      img.src = "atlas_16.jpg";
      img.style.objectPosition = `-${tile.x}px -${tile.y}px`;
      img.style.objectFit = "none";
      img.style.width = tile.width + "px";
      img.style.height = tile.height + "px";
      col.appendChild(img);

      const avgColor = document.createElement("div");
      avgColor.className = "avg";
      avgColor.style.backgroundColor = tile.avgColor;
      col.appendChild(avgColor);

      colorEntry.Colors.forEach(c => {
        const block = document.createElement("div");
        block.className = "color3";
        block.style.backgroundColor = c;
        col.appendChild(block);
      });

      container.appendChild(col);
    }
  });
});


function getClosestColor(targetRGB, palette) {
  return palette.reduce((closest, color) => {
    const dist = Math.hypot(color.r - targetRGB.r, color.g - targetRGB.g, color.b - targetRGB.b);
    return dist < closest.dist ? { color, dist } : closest;
  }, { color: palette[0], dist: Infinity }).color;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s == 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function drawFilteredColorWheel(canvas, palette) {
  const ctx = canvas.getContext("2d");
  const radius = canvas.width / 2;
  const cx = radius;
  const cy = radius;

  for (let i = 0; i < 360; i++) {
    const baseColor = hslToRgb(i / 360, 1, 0.5);
    const closest = getClosestColor(baseColor, palette);
    const fill = `rgb(${closest.r},${closest.g},${closest.b})`;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, (i - 1) * Math.PI / 180, i * Math.PI / 180);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.closePath();
  }
}

// Setup dinamico nel caricamento
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.querySelector("#colorWheelCanvas");
  if (!canvas) return;

  Promise.all([
    fetch("atlas_with_avgColor.json").then(r => r.json()),
    fetch("data_colors_3.json").then(r => r.json())
  ]).then(([atlasJson, color3Json]) => {
    const palette1 = atlasJson.map(e => {
      const hex = e.avgColor;
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
      };
    });

    const palette3 = color3Json.flatMap(obj => obj.Colors.map(hex => {
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
      };
    }));

    // Default: Average Color 3
    drawFilteredColorWheel(canvas, palette3);
  });
});

// === GESTIONE CARICAMENTO DATI ===
let colorData3 = [];
let currentFiltro = 'tutti';

function loadColorData3() {
  fetch('data_colors_3.json')
    .then(response => response.json())
    .then(data => {
      colorData3 = data;
      drawSaturationLightnessChart(currentFiltro);
      aggiornaBottoniFiltro(currentFiltro);
    })
    .catch(error => console.error("Errore nel caricamento dei dati:", error));
}

// === FUNZIONE DI DISEGNO CON FILTRO ===
function drawSaturationLightnessChart(filtroColore) {
  currentFiltro = filtroColore;
  const canvas = document.getElementById('saturationLightnessCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let count = 0;

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, originX, originY);

  for (const entry of colorData3) {
    const hexList = entry.Colors || entry.colors || [];
    for (const hex of hexList) {
      const rgb = hexToRgb(hex);
      const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);

      const passaFiltro =
        filtroColore === 'tutti' ||
        (filtroColore === 'rosso' && h < 30) ||
        (filtroColore === 'verde' && h >= 90 && h < 150) ||
        (filtroColore === 'blu' && h >= 210 && h < 270);

      if (passaFiltro) {
        const x = s * canvas.width;
        const y = (1 - l) * canvas.height;

        ctx.fillStyle = hex;
        ctx.fillRect(x - 2, y - 2, 4, 4);
        count++;
      }
    }
  }

  ctx.restore();

  const countText = `Colori mostrati: ${count}`;
  ctx.fillStyle = '#000';
  ctx.font = '16px IBM Plex Mono';
  ctx.fillText(countText, 10, 30);

  const countElement = document.getElementById('colorCount');
  if (countElement) countElement.textContent = countText;
}

// === AGGIORNA CLASSE ATTIVA FILTRI ===
function aggiornaBottoniFiltro(attivo) {
  document.querySelectorAll('.canvas-buttons.left button').forEach(btn => {
    btn.classList.remove('active');
  });
  const attivoBtn = document.getElementById(`filtro-${attivo}`);
  if (attivoBtn) attivoBtn.classList.add('active');
}

// === UTILITIES PER COLORI ===
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
  const bigint = parseInt(hex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }

  return [h, s, l];
}

// === ZOOM E DRAG ===
let scale = 1;
let originX = 0;
let originY = 0;
let isDragging = false;
let startX, startY;

const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('saturationLightnessCanvas');

function zoomChart(delta) {
  scale += delta;
  scale = Math.min(Math.max(0.5, scale), 5);
  drawSaturationLightnessChart(currentFiltro);
}

canvasContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = -e.deltaY * 0.001;
  zoomChart(delta);
});

canvasContainer.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  canvasContainer.style.cursor = 'grabbing';
});

canvasContainer.addEventListener('mouseup', () => {
  isDragging = false;
  canvasContainer.style.cursor = 'grab';
});

canvasContainer.addEventListener('mouseleave', () => {
  isDragging = false;
  canvasContainer.style.cursor = 'grab';
});

canvasContainer.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = (e.clientX - startX);
  const dy = (e.clientY - startY);
  originX += dx;
  originY += dy;
  startX = e.clientX;
  startY = e.clientY;
  drawSaturationLightnessChart(currentFiltro);
});

// === RESET ===
function resetSaturationChart() {
  scale = 1;
  originX = 0;
  originY = 0;
  drawSaturationLightnessChart(currentFiltro);
}

// === AVVIO ===
window.addEventListener('DOMContentLoaded', () => {
  loadColorData3();

  document.getElementById('filtro-tutti')?.addEventListener('click', () => {
    drawSaturationLightnessChart('tutti');
    aggiornaBottoniFiltro('tutti');
  });

  document.getElementById('filtro-rosso')?.addEventListener('click', () => {
    drawSaturationLightnessChart('rosso');
    aggiornaBottoniFiltro('rosso');
  });

  document.getElementById('filtro-verde')?.addEventListener('click', () => {
    drawSaturationLightnessChart('verde');
    aggiornaBottoniFiltro('verde');
  });

  document.getElementById('filtro-blu')?.addEventListener('click', () => {
    drawSaturationLightnessChart('blu');
    aggiornaBottoniFiltro('blu');
  });

  document.getElementById('zoom-in')?.addEventListener('click', () => {
    scale = Math.min(scale + 0.2, 5);
    drawSaturationLightnessChart(currentFiltro);
  });

  document.getElementById('zoom-out')?.addEventListener('click', () => {
    scale = Math.max(scale - 0.2, 0.5);
    drawSaturationLightnessChart(currentFiltro);
  });

  document.getElementById('reset-chart')?.addEventListener('click', resetSaturationChart);
});
const webcamModeSwitch = document.getElementById("webcamModeSwitch");
const webcamModeButtons = webcamModeSwitch.querySelectorAll(".mode-btn");

webcamModeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const selectedMode = btn.getAttribute("data-mode");
    currentMode = selectedMode;
    applyCurrentMode(); // tua funzione per disegnare in base al filtro

    // aggiorna stile attivo
    webcamModeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

const modeButtons = document.querySelectorAll('.btn-style[data-mode]');

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // cambia modalità visualizzazione...
  });
});