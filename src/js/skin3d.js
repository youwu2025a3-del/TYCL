const PARTS = [
  {
    name: 'head',
    x: 4, y: 0, w: 8, h: 8, d: 8,
    uv: {
      right: [0, 8, 8, 8], front: [8, 8, 8, 8], left: [16, 8, 8, 8], back: [24, 8, 8, 8],
      top: [8, 0, 8, 8], bottom: [16, 0, 8, 8],
    },
  },
  {
    name: 'body',
    x: 4, y: 8, w: 8, h: 12, d: 4,
    uv: {
      right: [16, 20, 4, 12], front: [20, 20, 8, 12], left: [28, 20, 4, 12], back: [32, 20, 8, 12],
      top: [20, 16, 8, 4], bottom: [28, 16, 8, 4],
    },
  },
  {
    name: 'arm-right',
    x: 0, y: 8, w: 4, h: 12, d: 4,
    uv: {
      right: [40, 20, 4, 12], front: [44, 20, 4, 12], left: [48, 20, 4, 12], back: [52, 20, 4, 12],
      top: [44, 16, 4, 4], bottom: [48, 16, 4, 4],
    },
  },
  {
    name: 'arm-left',
    x: 12, y: 8, w: 4, h: 12, d: 4,
    uv: {
      right: [32, 52, 4, 12], front: [36, 52, 4, 12], left: [40, 52, 4, 12], back: [44, 52, 4, 12],
      top: [36, 48, 4, 4], bottom: [40, 48, 4, 4],
    },
  },
  {
    name: 'leg-right',
    x: 4, y: 20, w: 4, h: 12, d: 4,
    uv: {
      right: [0, 20, 4, 12], front: [4, 20, 4, 12], left: [8, 20, 4, 12], back: [12, 20, 4, 12],
      top: [4, 16, 4, 4], bottom: [8, 16, 4, 4],
    },
  },
  {
    name: 'leg-left',
    x: 8, y: 20, w: 4, h: 12, d: 4,
    uv: {
      right: [16, 52, 4, 12], front: [20, 52, 4, 12], left: [24, 52, 4, 12], back: [28, 52, 4, 12],
      top: [20, 48, 4, 4], bottom: [24, 48, 4, 4],
    },
  },
];

function faceMarkup(part, scale, dataUrl, slim) {
  const w = part.name.startsWith('arm') && slim ? 3 : part.w;
  const left = part.name === 'arm-right' ? part.x : part.x;
  const p = (value) => `${Math.round(value * 1000) / 1000}px`;
  const safeUrl = String(dataUrl).replaceAll("'", '%27');
  const bg = `background-image:url('${safeUrl}');background-size:${64 * scale}px ${64 * scale}px;`;
  const buildFace = (cls, uv, width, height, offsetLeft, offsetTop, transform, brightness) => {
    const [u, v, uw, uh] = uv;
    return `<div class="skin-face ${cls}" style="${bg}width:${p(width * scale)};height:${p(height * scale)};left:${p(offsetLeft * scale)};top:${p(offsetTop * scale)};transform:${transform};filter:brightness(${brightness});background-position:${-u * scale}px ${-v * scale}px;"></div>`;
  };
  const faces = [];
  faces.push(buildFace('front', part.uv.front, w, part.h, 0, 0, `translateZ(${p((part.d / 2) * scale)})`, 1));
  faces.push(buildFace('back', part.uv.back, w, part.h, 0, 0, `rotateY(180deg) translateZ(${p((part.d / 2) * scale)})`, 0.86));
  faces.push(
    buildFace('side-r', part.uv.left, part.d, part.h, (w - part.d) / 2, 0, `rotateY(90deg) translateZ(${p((w / 2) * scale)})`, 0.92),
  );
  faces.push(
    buildFace('side-l', part.uv.right, part.d, part.h, (w - part.d) / 2, 0, `rotateY(-90deg) translateZ(${p((w / 2) * scale)})`, 0.95),
  );
  faces.push(buildFace('top', part.uv.top, w, part.d, 0, (part.h - part.d) / 2, `rotateX(90deg) translateZ(${p((part.h / 2) * scale)})`, 1.04));
  faces.push(buildFace('bottom', part.uv.bottom, w, part.d, 0, (part.h - part.d) / 2, `rotateX(-90deg) translateZ(${p((part.h / 2) * scale)})`, 0.78));
  return `<div class="skin-part skin-${part.name}" style="left:${p(left * scale)};top:${p(part.y * scale)};width:${p(w * scale)};height:${p(part.h * scale)};">${faces.join('')}</div>`;
}

function createCssSkinViewer(container, options = {}) {
  let dataUrl = options.dataUrl || '';
  let slim = options.model === 'slim';
  let rotX = -7;
  let rotY = -24;
  let spinning = true;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let animationId = 0;
  let lastFrame = performance.now();

  const scale = 8.6;
  container.innerHTML = `
    <div class="skin-model" style="width:${16 * scale}px;height:${32 * scale}px;"></div>
  `;
  const model = container.querySelector('.skin-model');

  function render() {
    model.innerHTML = `<div class="skin-floor"></div>${PARTS.map((part) => faceMarkup(part, scale, dataUrl, slim)).join('')}`;
    updateTransform();
  }

  function updateTransform() {
    model.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  }

  function tick(now) {
    const delta = Math.min(40, now - lastFrame);
    lastFrame = now;
    if (spinning && !dragging) {
      rotY += delta * 0.012;
      if (rotY > 360) rotY -= 360;
      updateTransform();
    }
    animationId = requestAnimationFrame(tick);
  }

  function onPointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    container.setPointerCapture?.(event.pointerId);
    container.style.cursor = 'grabbing';
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    rotY += dx * 0.5;
    rotX = Math.max(-28, Math.min(22, rotX - dy * 0.25));
    updateTransform();
  }

  function onPointerUp(event) {
    dragging = false;
    container.style.cursor = 'grab';
    try {
      container.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
  container.addEventListener('dblclick', () => {
    rotX = -7;
    rotY = -24;
    updateTransform();
  });

  render();
  animationId = requestAnimationFrame(tick);

  return {
    setSkin(nextDataUrl, modelType) {
      dataUrl = nextDataUrl;
      if (modelType) slim = modelType === 'slim';
      render();
    },
    setModel(modelType) {
      slim = modelType === 'slim';
      render();
    },
    setSpin(value) {
      spinning = Boolean(value);
    },
    isSpinning() {
      return spinning;
    },
    reset() {
      rotX = -7;
      rotY = -24;
      updateTransform();
    },
    setAngle(x, y) {
      rotX = x;
      rotY = y;
      updateTransform();
    },
    destroy() {
      cancelAnimationFrame(animationId);
      container.replaceChildren();
    },
  };
}

export function createSkinViewer(container, options = {}) {
  const lib = window.skinview3d;
  if (!lib || !window.WebGLRenderingContext) return createCssSkinViewer(container, options);
  try {
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    const width = container.clientWidth || 420;
    const height = container.clientHeight || 520;
    container.appendChild(canvas);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    const viewer = new lib.SkinViewer({
      canvas,
      width,
      height,
      skin: options.dataUrl || undefined,
      model: options.model === 'slim' ? 'slim' : 'classic',
      enableControls: true,
    });
    viewer.autoRotate = false;
    viewer.autoRotateSpeed = 0.45;
    viewer.zoom = 0.9;
    viewer.camera.position.set(0, 12, 62);
    viewer.controls.target.set(0, 12, 0);
    viewer.controls.update();
    viewer.controls.enablePan = false;
    viewer.controls.enableZoom = false;
    if (lib.IdleAnimation) viewer.animation = new lib.IdleAnimation();
    viewer.renderer?.setClearColor?.(0x000000, 0);
    const resize = () => {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      viewer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return {
      setSkin(nextDataUrl, modelType) {
        viewer.loadSkin(nextDataUrl, { model: modelType === 'slim' ? 'slim' : 'classic' });
      },
      setModel(modelType) {
        viewer.loadSkin(viewer.skin?.image?.src || options.dataUrl, { model: modelType === 'slim' ? 'slim' : 'classic' });
      },
      setSpin(value) {
        viewer.autoRotate = Boolean(value);
      },
      isSpinning() {
        return Boolean(viewer.autoRotate);
      },
      reset() {
        viewer.autoRotate = false;
        viewer.camera.position.set(0, 12, 62);
        viewer.controls.target.set(0, 10, 0);
        viewer.controls.update();
      },
      setAngle() {},
      dispose() {
        observer.disconnect();
        viewer.dispose();
      },
    };
  } catch (error) {
    console.warn('skinview3d failed, using CSS fallback', error);
    return createCssSkinViewer(container, options);
  }
}