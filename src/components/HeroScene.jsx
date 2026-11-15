// Escena 3D del inicio (three.js), cinematográfica: Marte con textura real (Viking, NASA/USGS) y relieve,
// atmósfera, Fobos y Deimos en órbita (periodos reales a escala), polvo, estrellas que titilan,
// estrellas fugaces. La escena aparece completa de una vez (fundido) cuando la textura ligera de Marte ya cargó.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const MODELS = {
  astronaut: '/models/astronaut.glb', // solo para las fichas de la EVA; el Inicio usa la foto 2D
  rover: '/models/perseverance.glb',
  marsMap: '/img/mars-texture.jpg',
  marsMapLow: '/img/mars-texture-1k.jpg',
};

// Periodos orbitales (NASA): Fobos 7.66 h, Deimos 30.35 h. Se conserva su proporción.
const PHOBOS_H = 7.66;
const DEIMOS_H = 30.35;

/**
 * Punto de la esfera unitaria de three.js para lon/lat (grados, lon −180…180 positiva al Este).
 * La textura Viking va de −180° (borde izquierdo) a +180°: u = (lon + 180) / 360 (verificado con el Monte Olimpo).
 */
export function lonLatToVec(lon, lat, r = 1) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const la = (lat * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(la) * r, Math.sin(la) * r, Math.sin(phi) * Math.cos(la) * r);
}

function label(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.font = '500 44px "JetBrains Mono", monospace';
  g.fillStyle = 'rgba(255,215,160,0.95)';
  g.fillText(text, 12, 62);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
  sp.scale.set(0.5, 0.094, 1);
  return sp;
}

/** Escala un modelo a la altura dada y lo apoya en y=0, centrado en x/z. */
export function normalize(obj, height) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(height / (size.y || 1));
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
  return obj;
}

const glowMat = (color, power, alpha) =>
  new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { c: { value: new THREE.Color(color) }, sunDir: { value: new THREE.Vector3(-1, 0.4, 0.6).normalize() } },
    vertexShader:
      'varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vN = normalize(normalMatrix*normal); vW = normalize((modelMatrix*vec4(normal,0.)).xyz); vec4 p = modelViewMatrix*vec4(position,1.); vP = p.xyz; gl_Position = projectionMatrix*p; }',
    fragmentShader: `uniform vec3 c; uniform vec3 sunDir; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){ float f = pow(1.0 - abs(dot(normalize(-vP), vN)), ${power.toFixed(1)});
      float lit = 0.35 + 0.65*smoothstep(-0.4, 0.6, dot(-vW, sunDir));
      gl_FragColor = vec4(c, f*${alpha.toFixed(2)}*lit); }`,
  });

function twinkleStars(n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const ph = new Float32Array(n);
  const sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(70 + Math.random() * 30);
    pos.set([v.x, v.y, v.z], i * 3);
    ph[i] = Math.random() * 6.28;
    sz[i] = Math.random() < 0.06 ? 3.2 : 1 + Math.random() * 1.4;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { t: { value: 0 }, dpr: { value: 1 } },
    vertexShader:
      'attribute float ph; attribute float sz; uniform float t; uniform float dpr; varying float a; void main(){ a = 0.45 + 0.55*sin(t*1.6 + ph*3.0); vec4 p = modelViewMatrix*vec4(position,1.); gl_PointSize = sz*dpr; gl_Position = projectionMatrix*p; }',
    fragmentShader: 'varying float a; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(vec3(1.0,0.97,0.92), a*(1.0-d*2.0)); }',
  });
  return new THREE.Points(g, m);
}

function dust(n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, Math.random() * 6 - 1], i * 3);
    vel.set([0.05 + Math.random() * 0.12, (Math.random() - 0.5) * 0.03, 0], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffb27a, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m);
  p.userData.vel = vel;
  return p;
}

function orbit(radius, tilt) {
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x9fc7ff, transparent: true, opacity: 0.18 }),
  );
  const g = new THREE.Group();
  g.add(line);
  g.rotation.x = tilt;
  return g;
}

export default function HeroScene() {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35; // sin el contraluz azul hace falta más exposición
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Fundido de entrada: el lienzo arranca invisible y se muestra cuando ya hay algo completo que ver.
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      requestAnimationFrame(() => el.classList.add('ready'));
    };
    const safety = setTimeout(reveal, 2500);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
    camera.position.set(0, 0.3, 11);

    // Luz: Sol desde la izquierda (terminador marcado), contraluz frío, relleno mínimo.
    const sunDir = new THREE.Vector3(-1, 0.4, 0.6).normalize();
    const sun = new THREE.DirectionalLight(0xfff0dc, 3.6);
    sun.position.copy(sunDir).multiplyScalar(10);
    const rim = new THREE.DirectionalLight(0xffb08a, 0.9); // contraluz cálido tenue (el azul lo hacía parecer gigante gaseoso)
    rim.position.set(5, 3, -6);
    const warm = new THREE.PointLight(0xff7a3c, 18, 12, 2);
    warm.position.set(1.5, -2.5, 3);
    scene.add(sun, rim, warm, new THREE.AmbientLight(0x2a2f45, 0.25));

    const stars = twinkleStars(1400);
    stars.material.uniforms.dpr.value = dpr;
    scene.add(stars);

    // Marte
    const tl = new THREE.TextureLoader();
    const mat = new THREE.MeshStandardMaterial({ color: 0xb3532c, roughness: 0.95, metalness: 0 });
    // Primero la textura ligera (≈100 KB) para que Marte aparezca de inmediato; luego la de 4K.
    let hiLoaded = false;
    const setMap = (tx, hi) => {
      if (!hi && hiLoaded) return tx.dispose();
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const old = mat.map;
      mat.map = tx;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      if (old && old !== tx) old.dispose();
      if (hi) hiLoaded = true;
    };
    tl.load(
      MODELS.marsMapLow,
      (tx) => {
        setMap(tx, false);
        reveal();
      },
      undefined,
      reveal,
    );
    tl.load(MODELS.marsMap, (tx) => setMap(tx, true));
    const mars = new THREE.Group();
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), mat);
    const tiltG = new THREE.Group();
    tiltG.rotation.z = (25.19 * Math.PI) / 180; // inclinación axial de Marte
    tiltG.add(globe);
    // Jezero (18.4° N, 77.5° E): marcador que gira con el planeta.
    const jz = new THREE.Group();
    const jp = lonLatToVec(77.5, 18.4, 1.004);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffd28c }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.036, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd28c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.lookAt(jp.clone().multiplyScalar(2));
    const tag = label('JEZERO 18.4°N 77.5°E');
    tag.center.set(-0.12, 0.5); // anclada a la izquierda: el texto sale a la derecha del punto
    tag.position.copy(jp.clone().multiplyScalar(1.03));
    jz.add(dot, ring, tag);
    jz.children.forEach((o) => { if (o !== tag) o.position.copy(jp); });
    globe.add(jz);
    // Atmósfera de Marte: delgada (~1 % de la Tierra), solo un limbo tenue de polvo; sin halo grande ni bandas.
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.015, 64, 64), glowMat(0xf2a27a, 4.0, 0.55));
    mars.add(tiltG, atmo);

    // Fobos y Deimos (tamaño exagerado para verse; órbitas no a escala).
    const moonMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6c, roughness: 1 });
    const phobos = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 2), moonMat);
    const deimos = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 2), moonMat);
    const o1 = orbit(1.55, 0.32);
    const o2 = orbit(2.1, 0.28);
    o1.children[0].visible = false; // sin anillos dibujados: Marte no tiene anillos
    o2.children[0].visible = false;
    o1.add(phobos);
    o2.add(deimos);
    mars.add(o1, o2);

    mars.scale.setScalar(3.9);
    mars.position.set(-4.2, -2.2, -6);
    scene.add(mars);

    const motes = dust(320);
    scene.add(motes);

    // Estrella fugaz
    const streakGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(-1.6, -0.5, 0)]);
    const streak = new THREE.Line(streakGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    scene.add(streak);
    let streakT = -1;

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 1.2 ? 16 : 11;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const mouse = { x: 0, y: 0 };
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      mouse.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf && !document.hidden) raf = requestAnimationFrame(frame);
    });
    io.observe(el);
    const onVis = () => {
      if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVis);
    let last = performance.now();
    const t0 = last;
    let lastFrame = 0;
    const frame = (now) => {
      if (now - lastFrame < 33) {
        raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0; // ~30 cuadros/s: la mitad de GPU en laptops
        return;
      }
      lastFrame = now;
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000); // tope: al reanudar no hay saltos
      last = now;
      stars.material.uniforms.t.value = t;
      if (!reduce) {
        globe.rotation.y = Math.PI + 0.5 + t * 0.02; // empieza con Jezero de frente
        ring.scale.setScalar(1 + ((t * 0.8) % 1) * 1.6);
        ring.material.opacity = 0.9 * (1 - ((t * 0.8) % 1));
        // Un «día» de Fobos ≈ 40 s en pantalla; Deimos conserva la proporción real.
        const w1 = (Math.PI * 2) / 40;
        phobos.position.set(Math.cos(t * w1) * 1.55, 0, Math.sin(t * w1) * 1.55);
        const w2 = w1 * (PHOBOS_H / DEIMOS_H);
        deimos.position.set(Math.cos(t * w2 + 2) * 2.1, 0, Math.sin(t * w2 + 2) * 2.1);
        // polvo a la deriva
        const p = motes.geometry.attributes.position;
        const v = motes.userData.vel;
        for (let i = 0; i < p.count; i++) {
          let x = p.array[i * 3] + v[i * 3] * dt;
          if (x > 9) x = -9;
          p.array[i * 3] = x;
          p.array[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.0008 + v[i * 3 + 1] * dt;
        }
        p.needsUpdate = true;
        // estrella fugaz cada ~7 s
        if (streakT < 0 && Math.random() < dt / 7) {
          streakT = 0;
          streak.position.set(-2 + Math.random() * 10, 3 + Math.random() * 2.5, -8);
        }
        if (streakT >= 0) {
          streakT += dt;
          streak.position.x -= dt * 9;
          streak.position.y -= dt * 2.8;
          streak.material.opacity = Math.max(0, Math.sin((streakT / 0.8) * Math.PI)) * 0.9;
          if (streakT > 0.8) streakT = -1;
        }
        camera.position.x += (mouse.x * 0.45 + Math.sin(t * 0.07) * 0.3 - camera.position.x) * 0.03;
        camera.position.y += (0.3 - mouse.y * 0.25 - camera.position.y) * 0.03;
      }
      camera.lookAt(0, -0.2, 0);
      renderer.render(scene, camera);
      raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0; // pausa fuera de vista / pestaña oculta
    };
    raf = requestAnimationFrame(frame);

    return () => {
      clearTimeout(safety);
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.bumpMap?.dispose(); m.dispose(); });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div ref={box} className="hero-3d" aria-hidden="true">
      <div className="hero-grain" />
    </div>
  );
}
