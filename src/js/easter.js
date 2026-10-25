import { openModal, toast } from './components.js';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let keyBuffer = [];
let logoClicks = [];
let lastTriggered = 0;

function creeperMarkup() {
  return `<svg class="egg-creeper" viewBox="0 0 80 80" aria-hidden="true">
    <rect width="80" height="80" rx="14" fill="#65a84a"/>
    <rect x="14" y="14" width="14" height="14" fill="#4d8b39"/>
    <rect x="42" y="8" width="10" height="10" fill="#79bd5a"/>
    <rect x="58" y="28" width="12" height="12" fill="#4d8b39"/>
    <rect x="8" y="42" width="9" height="9" fill="#79bd5a"/>
    <rect x="42" y="52" width="14" height="10" fill="#4d8b39"/>
    <rect x="18" y="60" width="8" height="8" fill="#79bd5a"/>
    <rect x="24" y="22" width="10" height="12" fill="#162415"/>
    <rect x="46" y="22" width="10" height="12" fill="#162415"/>
    <rect x="34" y="38" width="12" height="14" fill="#162415"/>
    <rect x="28" y="52" width="8" height="16" fill="#162415"/>
    <rect x="44" y="52" width="8" height="16" fill="#162415"/>
  </svg>`;
}

function appleMarkup() {
  return `<svg class="egg-apple" viewBox="0 0 80 80" aria-hidden="true">
    <defs>
      <linearGradient id="appleGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffe89a"/><stop offset=".45" stop-color="#f6c445"/><stop offset="1" stop-color="#d99a1f"/>
      </linearGradient>
    </defs>
    <path d="M40 22c-6-8-20-6-23 4-4 14 3 31 11 37 4 3 8 2 12-1 4 3 8 4 12 1 8-6 15-23 11-37-3-10-17-12-23-4Z" fill="url(#appleGold)"/>
    <path d="M40 23c0-8 4-12 11-15" fill="none" stroke="#7a5420" stroke-width="4" stroke-linecap="round"/>
    <path d="M47 13c6-5 13-4 17-1-3 6-10 9-17 7Z" fill="#77b76b"/>
    <ellipse cx="30" cy="36" rx="6" ry="10" fill="#fff4c4" opacity=".55" transform="rotate(-25 30 36)"/>
    <circle cx="54" cy="50" r="2" fill="#fff8d8" opacity=".8"/>
    <circle cx="28" cy="55" r="1.5" fill="#fff8d8" opacity=".65"/>
  </svg>`;
}

function flowerMarkup() {
  return `<div class="egg-herobrine-face" aria-hidden="true">
    <span class="egg-hb-eye left"></span>
    <span class="egg-hb-eye right"></span>
    <span class="egg-hb-mouth"></span>
  </div>`;
}

function confetti() {
  const layer = document.createElement('div');
  layer.className = 'egg-confetti';
  const colors = ['#19a97f', '#f2c14e', '#d75c76', '#78b7ff', '#8fd3b8', '#ffffff'];
  for (let i = 0; i < 42; i += 1) {
    const piece = document.createElement('i');
    piece.style.left = `${8 + Math.random() * 84}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    piece.style.transform = `rotate(${Math.random() * 180}deg)`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3400);
}

function goldSparkles() {
  const layer = document.createElement('div');
  layer.className = 'egg-gold-layer';
  for (let i = 0; i < 26; i += 1) {
    const spark = document.createElement('i');
    spark.style.left = `${10 + Math.random() * 80}%`;
    spark.style.top = `${20 + Math.random() * 60}%`;
    spark.style.animationDelay = `${Math.random() * 0.7}s`;
    layer.appendChild(spark);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2400);
}

function openCreeperEgg() {
  const modal = openModal({
    title: '嘶——',
    subtitle: '你好像踩到了什么',
    size: 'modal-md',
    body: `
      <div class="egg-body">
        ${creeperMarkup()}
        <div>
          <h3>你找到了藏在 TYCL 里的苦力怕。</h3>
          <p>它一直站在这里，只是你刚好点到了它。</p>
          <span class="egg-sign">A3Y8 · 2026</span>
        </div>
      </div>
    `,
    footer: `<button class="btn btn-secondary btn-sm" data-egg-fire>放个烟花</button>
      <button class="btn btn-primary btn-sm" data-modal-close>溜了</button>`,
  });
  modal.root.querySelector('[data-egg-fire]')?.addEventListener('click', () => {
    confetti();
    toast({ title: '苦力怕害羞地跑开了' });
  });
}

function openDeveloperEgg() {
  const modal = openModal({
    title: '一颗金苹果',
    subtitle: '代码角落里的一点甜',
    size: 'modal-md',
    body: `
      <div class="egg-body">
        ${appleMarkup()}
        <div>
          <h3>A3Y8 把它留在了这里。</h3>
          <p>没有任务，没有提示，也没有成就。只是在漫长的加载和下载之间，留一点奖励。</p>
          <span class="egg-sign">A3Y8 · 2026 · 谢谢路过</span>
        </div>
      </div>
    `,
    footer: `<button class="btn btn-primary btn-sm" data-egg-gold>收下金苹果</button>
      <button class="btn btn-secondary btn-sm" data-modal-close>下次吧</button>`,
  });
  modal.root.querySelector('[data-egg-gold]')?.addEventListener('click', () => {
    goldSparkles();
    toast({ title: '金苹果 +1', message: '饥饿值已恢复。' });
    modal.close();
  });
}

function openHerobrineEgg() {
  const shade = document.createElement('div');
  shade.className = 'egg-herobrine';
  shade.innerHTML = '<span></span><span></span>';
  document.body.appendChild(shade);
  setTimeout(() => {
    shade.remove();
    const modal = openModal({
      title: '你看见了什么',
      subtitle: '可能只是显卡驱动',
      size: 'modal-md',
      body: `
        <div class="egg-herobrine-card">
          ${flowerMarkup()}
          <h3>Herobrine was here.</h3>
          <p>雾里有两盏白色的灯。你确定刚才那里没有人。</p>
          <span class="egg-sign">别回头</span>
        </div>
      `,
      footer: `<button class="btn btn-secondary btn-sm" data-egg-brave>盯着它</button>
        <button class="btn btn-primary btn-sm" data-modal-close>假装没看见</button>`,
    });
    modal.root.querySelector('[data-egg-brave]')?.addEventListener('click', () => {
      toast({ title: '……它眨了一下眼。', type: 'info' });
      modal.close();
    });
  }, 450);
}

function openEgg(kind) {
  if (Date.now() - lastTriggered < 1200) return;
  if (document.querySelector('#modal-root .modal')) return;
  lastTriggered = Date.now();
  if (kind === 'dev') openDeveloperEgg();
  else if (kind === 'herobrine') openHerobrineEgg();
  else openCreeperEgg();
}

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function setupEasterEggs() {
  const logo = document.querySelector('.chrome-logo');
  logo?.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  logo?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    logoClicks = logoClicks.filter((time) => now - time < 2600);
    logoClicks.push(now);
    if (logoClicks.length >= 5) {
      logoClicks = [];
      openEgg('creeper');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (isTyping(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keyBuffer = [...keyBuffer, key].slice(-KONAMI.length);
    if (keyBuffer.join('|') === KONAMI.join('|')) {
      keyBuffer = [];
      openEgg('herobrine');
      return;
    }
    if (keyBuffer.join('').endsWith('a3y8')) {
      keyBuffer = [];
      openEgg('dev');
    }
  });
}
