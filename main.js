/* ============================================================
   SMALL WORLDS — interaction layer
   ============================================================ */
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* per-world theme — drives the accent that washes the whole page */
  const THEMES = {
    intro: { a:'#d8cdb8', b:'#8a8170', g:'rgba(216,205,184,.18)', bg:'#0b0b0f' },
    ocean: { a:'#48d6c6', b:'#1f7d86', g:'rgba(72,214,198,.22)',  bg:'#06121b' },
    train: { a:'#f0a84e', b:'#9a4f3a', g:'rgba(240,168,78,.20)',  bg:'#160d15' },
    vela:  { a:'#ff2e88', b:'#21e6ff', g:'rgba(255,46,136,.22)',  bg:'#06030c' },
    contact:{a:'#d8cdb8', b:'#8a8170', g:'rgba(216,205,184,.16)', bg:'#0b0b0f' },
  };
  const root = document.documentElement;
  function applyTheme(key){
    const t = THEMES[key] || THEMES.intro;
    root.style.setProperty('--accent',  t.a);
    root.style.setProperty('--accent-2',t.b);
    root.style.setProperty('--glow',    t.g);
    document.body.style.background = t.bg;
  }

  /* ---------- ready / load reveal ---------- */
  window.addEventListener('load', () => {
    document.body.classList.add('is-ready');
  });
  // failsafe so reveals never get stuck hidden
  setTimeout(() => document.body.classList.add('is-ready'), 1200);

  /* ---------- custom cursor ---------- */
  if (fine && !reduce) {
    const cur = document.querySelector('.cursor');
    const dot = cur.querySelector('.cursor__dot');
    const ring = cur.querySelector('.cursor__ring');
    let mx = innerWidth/2, my = innerHeight/2, rx = mx, ry = my;

    addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
    }, { passive:true });

    (function loop(){
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();

    const hot = 'a, button, .enter, .mailto, .spine__mark';
    addEventListener('mouseover', e => {
      if (e.target.closest(hot)) cur.classList.add('is-hover');
    });
    addEventListener('mouseout', e => {
      if (e.target.closest(hot)) cur.classList.remove('is-hover');
    });
    addEventListener('mousedown', () => cur.classList.add('is-down'));
    addEventListener('mouseup',   () => cur.classList.remove('is-down'));
  }

  /* ---------- spine: active world, progress, theme ---------- */
  const sections = [...document.querySelectorAll('.intro, .world, .outro')];
  const links = [...document.querySelectorAll('.spine__index a')];

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const id = en.target.id;
      const key = en.target.dataset.world || id; // intro/contact use id
      applyTheme(key);
      // highlight matching spine link (worlds only)
      links.forEach(l => l.classList.toggle(
        'is-active', l.getAttribute('href') === '#' + id));
    });
  }, { threshold: 0.55 });
  sections.forEach(s => io.observe(s));

  /* scroll progress on the spine */
  const bar = document.querySelector('.spine__progress span');
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.height = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
      ticking = false;
    });
  }, { passive:true });

  /* ---------- subtle pointer parallax on dioramas ---------- */
  if (fine && !reduce) {
    const dioramas = [...document.querySelectorAll('.diorama')];
    addEventListener('mousemove', e => {
      const nx = (e.clientX / innerWidth  - 0.5);
      const ny = (e.clientY / innerHeight - 0.5);
      dioramas.forEach(d => {
        d.style.transform = `translate(${nx * -22}px, ${ny * -14}px) scale(1.06)`;
      });
    }, { passive:true });
    document.querySelectorAll('.diorama').forEach(d => {
      d.style.transition = 'transform .6s cubic-bezier(.2,.7,.2,1)';
      d.style.transform = 'scale(1.06)';
    });
  }

  /* ---------- magnetic enter buttons ---------- */
  if (fine && !reduce) {
    document.querySelectorAll('.enter').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width/2;
        const y = e.clientY - r.top - r.height/2;
        btn.style.transform = `translate(${x*0.12}px, ${y*0.18 - 3}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- intro constellation ---------- */
  const canvas = document.querySelector('.intro__sky');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let W, H, stars = [], dpr = Math.min(devicePixelRatio || 1, 2);
    let pointer = { x:-999, y:-999 };

    function resize(){
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const count = Math.min(120, Math.floor(W * H / 14000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random()*W, y: Math.random()*H,
        z: Math.random()*0.8 + 0.2,
        tw: Math.random()*Math.PI*2,
      }));
    }
    resize();
    addEventListener('resize', resize);
    canvas.closest('.intro').addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    });
    canvas.closest('.intro').addEventListener('mouseleave', () => {
      pointer.x = pointer.y = -999;
    });

    let t = 0;
    function draw(){
      ctx.clearRect(0,0,W,H);
      // faint nebula wash
      const g = ctx.createRadialGradient(W*0.7, H*0.35, 0, W*0.7, H*0.35, W*0.6);
      g.addColorStop(0, 'rgba(120,110,150,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

      t += 0.005;
      // connecting lines near the pointer
      for (let i=0;i<stars.length;i++){
        const s = stars[i];
        s.x += s.z*0.12; if (s.x > W+4) s.x = -4;
        const dx = s.x - pointer.x, dy = s.y - pointer.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < 22000){
          ctx.strokeStyle = `rgba(216,205,184,${(1 - d2/22000)*0.4})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
        const tw = 0.5 + Math.sin(t*3 + s.tw)*0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.z*1.4, 0, Math.PI*2);
        ctx.fillStyle = `rgba(243,237,225,${0.25 + tw*0.55*s.z})`;
        ctx.fill();
      }
      if (!reduce) requestAnimationFrame(draw);
    }
    if (reduce){ draw(); } else { requestAnimationFrame(draw); }
  }

  /* ---------- smooth-jump for spine links (respects snap) ---------- */
  links.forEach(l => l.addEventListener('click', e => {
    const id = l.getAttribute('href');
    const el = document.querySelector(id);
    if (el){ e.preventDefault(); el.scrollIntoView({ behavior: reduce ? 'auto':'smooth' }); }
  }));
})();
