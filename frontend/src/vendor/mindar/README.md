# MindAR image tracking 1.2.5

Unmodified image-only distribution from the official npm `mind-ar@1.2.5` tarball:
https://www.npmjs.com/package/mind-ar/v/1.2.5

Files: `mindar-image.prod.js`, `controller-mGt1s8dJ.js`, `ui-fBadYuor.js`, `LICENSE`.
The upstream MIT license and embedded third-party license notices are retained.
The controller bundle includes TensorFlow.js (Apache-2.0) and inline workers.
No face-tracking package, CDN request or API key is used.

We use the public Controller API with our own Three.js renderer. The upstream
Three.js wrapper imports `sRGBEncoding`, removed from our version of Three.js.
Camera tracking runs in a separate same-origin document (`ar-camera.html`),
destroyed on close to release its TensorFlow contexts, tensors and workers.

To update, download the exact official npm tarball, inspect its imports, replace
these files and retain license notices. Recompile the target and run the AR
browser checks. Do not replace the source photo without recompiling `.mind`.
