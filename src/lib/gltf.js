// Cargador glTF compartido. Los modelos de NASA vienen con compresión Draco (KHR_draco_mesh_compression):
// sin DRACOLoader fallan en silencio. El decodificador glTF se sirve desde /draco/ (copiado de three/examples/jsm/libs/draco/gltf).
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let loader = null;
export function gltfLoader() {
  if (!loader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath({ js: '/draco/draco_wasm_wrapper.js', wasm: '/draco/draco_decoder.wasm' });
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
  }
  return loader;
}
