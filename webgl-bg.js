const canvas = document.querySelector('.webgl-bg');
if (canvas) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreen = window.matchMedia('(max-width: 768px)');

  // A dense field of glowing points reads as a bright wash on a light
  // background (the same reason .cursor-orb and .language-particles get
  // theme overrides elsewhere) -- rather than repaint a WebGL scene for
  // light mode, this effect stays dark-theme-only, like the Spotify widget
  // and code panel stay dark regardless of theme.
  const isDarkTheme = () => document.documentElement.getAttribute('data-theme') !== 'light';
  const shouldRun = () => !prefersReducedMotion.matches && !smallScreen.matches && isDarkTheme();

  let THREE = null;
  let PostFX = null;
  let loadPromise = null;
  let renderer = null;
  let composer = null;
  let scene = null;
  let camera = null;
  let group = null;
  let points = null;
  let links = null;
  let core = null;
  let ring1 = null;
  let ring2 = null;
  let comet = null;
  let cometState = null;
  let rafId = null;
  let lastTime = 0;
  let nextCometAt = 6 + Math.random() * 6;
  let elapsed = 0;
  let targetRotX = 0;
  let targetRotY = 0;
  let ndcX = 0;
  let ndcY = 0;
  let scrollFraction = 0;
  let scrollVelocity = 0;
  let lastScrollY = 0;
  let lastScrollTime = 0;
  let wantsToRun = false;
  let failed = false;
  const raycaster = { instance: null, plane: null, hit: null };

  const PARTICLE_COUNT = 2200;
  const HUB_COUNT = 360;
  const MAX_LINK_DIST = 3.4;
  const MAX_LINKS_PER_HUB = 2;
  const PALETTE = [0x74f7ff, 0xff5f9c, 0xc084fc, 0xffb347];

  function makeSpriteTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(c);
    texture.needsUpdate = true;
    return texture;
  }

  const POINTS_VERTEX = `
    uniform float uTime;
    uniform float uBaseSize;
    uniform vec3 uMouseLocal;
    uniform float uMouseRadius;
    uniform float uMouseStrength;
    uniform vec3 uBurstOriginLocal;
    uniform float uBurstTime;
    uniform float uBurstStrength;
    uniform float uBurstDecay;

    attribute vec3 color;
    attribute float aSize;
    attribute float aSeed;

    varying vec3 vColor;

    void main() {
      vColor = color;
      vec3 pos = position;

      pos.x += sin(uTime * 0.18 + aSeed * 6.2831) * 0.14;
      pos.y += cos(uTime * 0.14 + aSeed * 6.2831) * 0.14;

      vec3 toMouse = pos - uMouseLocal;
      float mouseDist = length(toMouse) + 0.0001;
      float falloff = smoothstep(uMouseRadius, 0.0, mouseDist);
      pos += (toMouse / mouseDist) * falloff * uMouseStrength;

      vec3 toBurst = pos - uBurstOriginLocal;
      float burstDist = length(toBurst) + 0.0001;
      float burstEnv = exp(-uBurstTime * uBurstDecay) * uBurstStrength;
      pos += (toBurst / burstDist) * burstEnv * (2.0 / (1.0 + burstDist * 0.4));

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = aSize * uBaseSize * (320.0 / -mvPosition.z);
    }
  `;

  const POINTS_FRAGMENT = `
    uniform sampler2D map;
    varying vec3 vColor;
    void main() {
      vec4 tex = texture2D(map, gl_PointCoord);
      if (tex.a < 0.02) discard;
      gl_FragColor = vec4(vColor, 1.0) * tex;
    }
  `;

  const CORE_VERTEX = `
    uniform float uTime;
    void main() {
      vec3 pos = position;
      float n = sin(pos.x * 1.6 + uTime) * cos(pos.y * 1.6 + uTime * 0.8) * sin(pos.z * 1.6 + uTime * 1.1);
      pos += normalize(position) * n * 0.4;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const CORE_FRAGMENT = `
    uniform vec3 uColor;
    uniform float uOpacity;
    void main() {
      gl_FragColor = vec4(uColor, uOpacity);
    }
  `;

  function buildParticles() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const color = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const radius = 5 + Math.random() * 15;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.6;
      positions[i * 3 + 2] = radius * Math.cos(phi) - 6;

      color.set(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = 0.35 + Math.random() * 0.75;
      seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBaseSize: { value: 1 },
        map: { value: makeSpriteTexture() },
        uMouseLocal: { value: new THREE.Vector3(9999, 9999, 9999) },
        uMouseRadius: { value: 2.4 },
        uMouseStrength: { value: 1.1 },
        uBurstOriginLocal: { value: new THREE.Vector3(9999, 9999, 9999) },
        uBurstTime: { value: 999 },
        uBurstStrength: { value: 3.2 },
        uBurstDecay: { value: 1.6 }
      },
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    points = new THREE.Points(geometry, material);
    return positions;
  }

  function buildLinks(positions) {
    // A full nearest-neighbour search over every particle is O(n^2) on the
    // full set (2200^2 ~= 4.8M) -- fine as a one-off, but to keep first
    // paint snappy this only wires up a subset of "hub" particles into a
    // constellation network, computed once at startup (never per-frame).
    const hubCount = Math.min(HUB_COUNT, PARTICLE_COUNT);
    const linePositions = [];
    const lineColors = [];
    const color = new THREE.Color();

    for (let i = 0; i < hubCount; i += 1) {
      const ix = i * 3;
      let bestDists = [Infinity, Infinity];
      let bestIdx = [-1, -1];

      for (let j = 0; j < hubCount; j += 1) {
        if (i === j) continue;
        const jx = j * 3;
        const dx = positions[ix] - positions[jx];
        const dy = positions[ix + 1] - positions[jx + 1];
        const dz = positions[ix + 2] - positions[jx + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bestDists[0]) {
          bestDists[1] = bestDists[0];
          bestIdx[1] = bestIdx[0];
          bestDists[0] = distSq;
          bestIdx[0] = j;
        } else if (distSq < bestDists[1]) {
          bestDists[1] = distSq;
          bestIdx[1] = j;
        }
      }

      for (let k = 0; k < MAX_LINKS_PER_HUB; k += 1) {
        const j = bestIdx[k];
        if (j < 0 || Math.sqrt(bestDists[k]) > MAX_LINK_DIST) continue;
        const jx = j * 3;
        linePositions.push(
          positions[ix], positions[ix + 1], positions[ix + 2],
          positions[jx], positions[jx + 1], positions[jx + 2]
        );
        color.set(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
        lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    links = new THREE.LineSegments(geometry, material);
  }

  function buildCore() {
    const geometry = new THREE.IcosahedronGeometry(3.6, 1);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x74f7ff) },
        uOpacity: { value: 0.16 }
      },
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      wireframe: true,
      transparent: true,
      depthWrite: false
    });
    core = new THREE.Mesh(geometry, material);
    core.position.set(0, 0, -6);
  }

  function makeCometTexture() {
    // A horizontal gradient: solid bright at the head (right edge), fading
    // to transparent at the tail (left edge). Stretching a plane mapped
    // with this is far cheaper than a real particle trail and reads just
    // as well at the size/speed this renders at.
    const w = 256;
    const h = 16;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.75, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const texture = new THREE.CanvasTexture(c);
    texture.needsUpdate = true;
    return texture;
  }

  function buildComet() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: makeCometTexture(),
      color: 0xbff4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    comet = new THREE.Mesh(geometry, material);
    comet.visible = false;
    cometState = { active: false, t: 0, duration: 1, start: new THREE.Vector3(), end: new THREE.Vector3(), length: 4 };
  }

  function spawnComet() {
    if (!cometState) return;
    // Straight diagonal pass through the field, from one side to the
    // other, at a random height/depth so it doesn't retrace the same path.
    const fromLeft = Math.random() > 0.5;
    const y = 6 + Math.random() * 6;
    const z = -14 + Math.random() * 10;
    const startX = fromLeft ? -16 : 16;
    const endX = fromLeft ? 16 : -16;
    cometState.start.set(startX, y, z);
    cometState.end.set(endX, y - (4 + Math.random() * 4), z);
    cometState.length = 3.5 + Math.random() * 2.5;
    cometState.duration = 1 + Math.random() * 0.6;
    cometState.t = 0;
    cometState.active = true;
    comet.visible = true;
  }

  function updateComet(delta) {
    if (!cometState || !cometState.active) return;
    cometState.t += delta;
    const p = Math.min(1, cometState.t / cometState.duration);

    comet.position.lerpVectors(cometState.start, cometState.end, p);

    const dir = new THREE.Vector3().subVectors(cometState.end, cometState.start).normalize();
    const angle = Math.atan2(dir.y, dir.x);
    comet.rotation.set(0, 0, angle);
    comet.scale.set(cometState.length, 0.09, 1);

    // Fade in over the first 12% of the flight, out over the last 25% --
    // linear motion (it's constant-velocity, like a real object in
    // flight) with only the opacity eased at the edges so it doesn't pop.
    const fadeIn = Math.min(1, p / 0.12);
    const fadeOut = p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.25) : 1;
    comet.material.opacity = Math.min(fadeIn, fadeOut) * 0.85;

    if (p >= 1) {
      cometState.active = false;
      comet.visible = false;
    }
  }

  function buildRings() {
    const ring1Geometry = new THREE.TorusGeometry(6.2, 0.02, 8, 96);
    const ring1Material = new THREE.MeshBasicMaterial({
      color: 0xff5f9c,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    });
    ring1 = new THREE.Mesh(ring1Geometry, ring1Material);
    ring1.position.set(0, 0, -6);
    ring1.rotation.x = Math.PI / 2.4;

    const ring2Geometry = new THREE.TorusGeometry(7.4, 0.015, 8, 96);
    const ring2Material = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
      depthWrite: false
    });
    ring2 = new THREE.Mesh(ring2Geometry, ring2Material);
    ring2.position.set(0, 0, -6);
    ring2.rotation.x = Math.PI / 1.7;
    ring2.rotation.y = Math.PI / 5;
  }

  function buildScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 14;

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'low-power'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);

    group = new THREE.Group();
    const positions = buildParticles();
    buildLinks(positions);
    buildCore();
    buildRings();
    buildComet();

    group.add(points, links, core, ring1, ring2, comet);
    scene.add(group);

    raycaster.instance = new THREE.Raycaster();
    raycaster.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 6);
    raycaster.hit = new THREE.Vector3();

    const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = PostFX;
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,  // strength
      0.3,  // radius
      0.45  // threshold -- the field is dense and additively blended, so
            // overlapping particles already read as bright; a low
            // threshold here made nearly the whole frame bloom and washed
            // out the DOM text sitting on top of the canvas. Only the
            // genuinely brightest points (particle cores, the comet)
            // should bloom.
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  function updateMouseWorld() {
    if (!raycaster.instance) return null;
    raycaster.instance.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hit = raycaster.instance.ray.intersectPlane(raycaster.plane, raycaster.hit);
    return hit;
  }

  function handlePointerMove(event) {
    ndcX = (event.clientX / window.innerWidth) * 2 - 1;
    ndcY = -((event.clientY / window.innerHeight) * 2 - 1);
    targetRotY = ndcX * 0.22;
    targetRotX = ndcY * 0.13;
  }

  function handlePointerDown(event) {
    if (!points || !camera) return;
    ndcX = (event.clientX / window.innerWidth) * 2 - 1;
    ndcY = -((event.clientY / window.innerHeight) * 2 - 1);
    const hit = updateMouseWorld();
    if (!hit) return;
    const local = points.worldToLocal(hit.clone());
    points.material.uniforms.uBurstOriginLocal.value.copy(local);
    points.material.uniforms.uBurstTime.value = 0;
  }

  function handleScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollFraction = max > 0 ? window.scrollY / max : 0;

    const now = performance.now();
    if (lastScrollTime === 0) {
      // First call (fired once at startup): establish the baseline instead
      // of computing velocity from an untracked scroll position, which
      // would otherwise register as a false jump if the page was already
      // scrolled before the WebGL scene finished loading.
      lastScrollY = window.scrollY;
      lastScrollTime = now;
      return;
    }
    const dt = Math.max(now - lastScrollTime, 1);
    const dy = window.scrollY - lastScrollY;
    // Clamped so a huge jump-scroll can't spike the rotation speed --
    // this only nudges the existing idle rotation, never replaces it.
    scrollVelocity = Math.max(-2.5, Math.min(2.5, scrollVelocity + (dy / dt) * 0.6));
    lastScrollY = window.scrollY;
    lastScrollTime = now;
  }

  function handleResize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
      composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  function animate(now) {
    rafId = requestAnimationFrame(animate);
    if (document.hidden || !renderer || !scene || !camera) return;

    const time = now * 0.001;
    const delta = lastTime ? Math.min(time - lastTime, 0.1) : 0;
    lastTime = time;
    elapsed += delta;

    scrollVelocity *= 0.92;

    group.rotation.y += 0.0009 + scrollVelocity * 0.0025;
    core.rotation.y -= 0.0016;
    core.rotation.x += 0.0007;
    ring1.rotation.z += 0.0012 + Math.abs(scrollVelocity) * 0.002;
    ring2.rotation.z -= 0.0009 + Math.abs(scrollVelocity) * 0.0018;

    camera.rotation.y += (targetRotY - camera.rotation.y) * 0.04;
    camera.rotation.x += (targetRotX - camera.rotation.x) * 0.04;
    // Kept subtle on purpose: scrolling deep into the page brings the
    // camera closer to the core/rings, and since they render behind
    // project cards whose backgrounds are only ~90% opaque, too strong a
    // dolly makes the glow bright enough to bleed through and fight with
    // the card text on top of it.
    camera.position.z = 14 - scrollFraction * 2.2;

    const hit = updateMouseWorld();
    const pointsUniforms = points.material.uniforms;
    pointsUniforms.uTime.value = time;
    if (hit) {
      pointsUniforms.uMouseLocal.value.copy(points.worldToLocal(hit.clone()));
    }
    pointsUniforms.uBurstTime.value += delta;

    core.material.uniforms.uTime.value = time;

    if (elapsed >= nextCometAt) {
      spawnComet();
      nextCometAt = elapsed + 9 + Math.random() * 10;
    }
    updateComet(delta);

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  function startRendering() {
    if (renderer) return;
    try {
      buildScene();
    } catch (error) {
      // WebGL unavailable/blocked, or a shader failed to compile -- fail
      // silently, the CSS background effects already carry the page
      // without this layer.
      failed = true;
      canvas.style.display = 'none';
      return;
    }
    canvas.classList.add('is-active');
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    handleScroll();
    rafId = requestAnimationFrame(animate);
  }

  function start() {
    if (renderer || failed) return;

    if (!THREE) {
      // Three.js (~750KB combined) is only worth fetching once we know the
      // scene will actually run -- most of the time that's true (dark theme
      // is the default), but this keeps light-mode/mobile/reduced-motion
      // visitors from paying for it at all.
      if (!loadPromise) {
        loadPromise = Promise.all([
          import('./vendor/three.module.min.js'),
          import('./vendor/postprocessing/EffectComposer.js'),
          import('./vendor/postprocessing/RenderPass.js'),
          import('./vendor/postprocessing/UnrealBloomPass.js'),
          import('./vendor/postprocessing/OutputPass.js')
        ]).then(([three, effectComposer, renderPass, unrealBloomPass, outputPass]) => {
          THREE = three;
          PostFX = {
            EffectComposer: effectComposer.EffectComposer,
            RenderPass: renderPass.RenderPass,
            UnrealBloomPass: unrealBloomPass.UnrealBloomPass,
            OutputPass: outputPass.OutputPass
          };
        }).catch(() => {
          failed = true;
        });
      }
      wantsToRun = true;
      loadPromise.then(() => {
        if (wantsToRun && THREE && shouldRun()) {
          startRendering();
        }
      });
      return;
    }

    startRendering();
  }

  function stop() {
    wantsToRun = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTime = 0;
    scrollVelocity = 0;
    lastScrollTime = 0;
    if (renderer) {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (composer) {
        composer.dispose();
        composer = null;
      }
      renderer.dispose();
      [points, links, core, ring1, ring2, comet].forEach((mesh) => {
        mesh.geometry.dispose();
        if (mesh.material.uniforms && mesh.material.uniforms.map) {
          mesh.material.uniforms.map.value.dispose();
        }
        if (mesh.material.map) {
          mesh.material.map.dispose();
        }
        mesh.material.dispose();
      });
      renderer = null;
      scene = null;
      camera = null;
      group = null;
      points = null;
      links = null;
      core = null;
      ring1 = null;
      ring2 = null;
      comet = null;
      cometState = null;
      elapsed = 0;
      nextCometAt = 6 + Math.random() * 6;
    }
    canvas.classList.remove('is-active');
  }

  function sync() {
    if (shouldRun()) {
      start();
    } else {
      stop();
    }
  }

  sync();

  const handleMediaChange = () => sync();
  [prefersReducedMotion, smallScreen].forEach((mql) => {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleMediaChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handleMediaChange);
    }
  });

  // The theme toggle sets data-theme via attribute, not a media query --
  // watch it directly so switching to light mode tears the scene down.
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
}
