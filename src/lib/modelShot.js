// Render único de un modelo 3D a imagen (para las fichas): evita tener varios contextos WebGL vivos.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { gltfLoader } from './gltf.js';
import { normalize } from '../components/HeroScene.jsx';

const cache = new Map();

function shoot(url, { yaw = 0.6, w = 480, h = 360 } = {}) {
  return new Promise((resolve) => {
    gltfLoader().load(
      url,
      (g) => {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(w, h, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const scene = new THREE.Scene();
        const key = new THREE.DirectionalLight(0xfff1dc, 3);
        key.position.set(-3, 4, 4);
        const rim = new THREE.DirectionalLight(0xff9a5c, 2.4);
        rim.position.set(3, 2, -4);
        scene.add(key, rim, new THREE.AmbientLight(0x50586e, 0.6));
        const m = normalize(g.scene, 2);
        m.rotation.y = yaw;
        scene.add(m);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        const cam = new THREE.PerspectiveCamera(30, w / h, 0.01, 100);
        const dist = (Math.max(size.y, size.x / (w / h)) / 2 / Math.tan((15 * Math.PI) / 180)) * 1.15;
        cam.position.set(c.x, c.y + size.y * 0.05, c.z + dist);
        cam.lookAt(c);
        renderer.render(scene, cam);
        const url2 = renderer.domElement.toDataURL('image/png');
        renderer.dispose();
        renderer.forceContextLoss();
        resolve(url2);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/** Devuelve la imagen renderizada del modelo, o `fallback` mientras carga / si falla. */
export function useModelShot(url, fallback, opts) {
  const [img, setImg] = useState(() => cache.get(url) || null);
  useEffect(() => {
    if (cache.has(url)) return undefined;
    let alive = true;
    shoot(url, opts).then((d) => {
      cache.set(url, d);
      if (alive) setImg(d);
    });
    return () => {
      alive = false;
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return img || fallback;
}
