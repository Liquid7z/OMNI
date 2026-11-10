/**
 * REWIND RADIO — 21st.dev Animated Gradient Component
 * Implementation reference: Harsh Jadhav (@harshjadhavconnect)
 * Custom warm liquid-glass shader with WebGL, subtle paper-grain overlay,
 * visibilitychange pause handling, prefers-reduced-motion support, and CSS gradient fallback.
 */

function startGradient() {
  const container = document.getElementById('rrAmbientBackdrop') || document.getElementById('animatedGradientContainer');
  if (!container) return;

  // Respect prefers-reduced-motion
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    applyFallbackCSS(container);
    return;
  }

  function applyFallbackCSS(target) {
    target.style.background = 'linear-gradient(135deg, #07090e 0%, #0a1122 35%, #0d2038 65%, #141028 100%)';
    target.style.backgroundSize = '300% 300%';
    target.style.animation = 'rrWarmGradientShift 22s ease-in-out infinite alternate';
  }

  // Obtain Three.js instance (from window.THREE or dynamic import)
  async function getThree() {
    if (window.THREE) return window.THREE;
    try {
      return await import('three');
    } catch (e) {
      return null;
    }
  }

  getThree().then((THREE) => {
    if (!THREE) {
      applyFallbackCSS(container);
      return;
    }

    try {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.className = 'rr-gradient-canvas';
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.inset = '0';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.pointerEvents = 'none';
      renderer.domElement.style.zIndex = '0';

      // Clear any prior canvas
      const oldCanvas = container.querySelector('.rr-gradient-canvas');
      if (oldCanvas) container.removeChild(oldCanvas);
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      // Dark Glassmorphic Aurora Palette:
      // color1: #07090e (space obsidian)
      // color2: #0a1122 (midnight navy)
      // color3: #082136 (deep cyan mesh)
      // color4: #150f28 (subtle violet nebula)
      const c1 = new THREE.Color('#07090e');
      const c2 = new THREE.Color('#0a1122');
      const c3 = new THREE.Color('#082136');
      const c4 = new THREE.Color('#150f28');

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(width, height) },
          uColor1: { value: c1 },
          uColor2: { value: c2 },
          uColor3: { value: c3 },
          uColor4: { value: c4 },
          // speed: 10, distortion: 10, swirl: 20, swirl_iterations: 8, softness: 95, scale: 0.7
          uSpeed: { value: 0.00065 },
          uDistortion: { value: 1.15 },
          uSwirl: { value: 1.85 },
          uSoftness: { value: 0.95 },
          uScale: { value: 0.72 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec2 uResolution;
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          uniform vec3 uColor3;
          uniform vec3 uColor4;
          uniform float uSpeed;
          uniform float uDistortion;
          uniform float uSwirl;
          uniform float uSoftness;
          uniform float uScale;
          varying vec2 vUv;

          // Simplex-inspired 2D smooth noise
          vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
          float snoise(vec2 v){
            const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v -   i + dot(i, C.xx);
            vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod(i, 289.0);
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                  + i.x + vec3(0.0, i1.x, 1.0 ));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
              dot(x12.zw,x12.zw)), 0.0);
            m = m*m ;
            m = m*m ;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
          }

          void main() {
            vec2 st = gl_FragCoord.xy / uResolution.xy;
            float aspect = uResolution.x / uResolution.y;
            st.x *= aspect;

            float t = uTime * uSpeed;

            // Swirl coordinates
            vec2 center = vec2(0.5 * aspect, 0.5);
            vec2 toCenter = st - center;
            float dist = length(toCenter);
            float angle = atan(toCenter.y, toCenter.x) + sin(dist * 3.1415 - t) * uSwirl;
            vec2 swirledSt = center + vec2(cos(angle), sin(angle)) * dist * uScale;

            // Multi-octave organic noise
            float n1 = snoise(swirledSt * 1.5 + vec2(t * 0.7, -t * 0.5)) * uDistortion;
            float n2 = snoise(swirledSt * 3.0 - vec2(-t * 0.4, t * 0.6));
            float n = (n1 * 0.7 + n2 * 0.3) * 0.5 + 0.5;

            // Gentle color blending across the 4 warm palette tones
            float t1 = smoothstep(0.0, 0.45 * uSoftness, n);
            float t2 = smoothstep(0.35, 0.75 * uSoftness, n);
            float t3 = smoothstep(0.65, 1.0, n);

            vec3 col = mix(uColor1, uColor2, t1);
            col = mix(col, uColor3, t2);
            col = mix(col, uColor4, t3 * 0.65);

            // Subtle vignette warmth
            float vignette = smoothstep(1.4, 0.2, dist);
            col = mix(col * 0.94, col, vignette);

            gl_FragColor = vec4(col, 1.0);
          }
        `,
        depthWrite: false,
        depthTest: false
      });

      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      scene.add(plane);

      let animId = null;
      let isVisible = true;
      let lastTime = performance.now();

      function animate(now) {
        if (!isVisible) return;
        const delta = now - lastTime;
        material.uniforms.uTime.value += delta;
        lastTime = now;
        renderer.render(scene, camera);
        animId = requestAnimationFrame(animate);
      }

      animId = requestAnimationFrame(animate);

      // Handle visibility changes to preserve battery/GPU
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          isVisible = false;
          if (animId) cancelAnimationFrame(animId);
        } else {
          isVisible = true;
          lastTime = performance.now();
          animId = requestAnimationFrame(animate);
        }
      });

      // Handle resize smoothly
      const handleResize = () => {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        renderer.setSize(w, h);
        material.uniforms.uResolution.value.set(w, h);
      };

      window.addEventListener('resize', handleResize, { passive: true });

      // Expose ready hook
      window.__REWIND_GRADIENT_READY = true;
    } catch (err) {
      console.warn('WebGL animated gradient failed, applying CSS fallback', err);
      applyFallbackCSS(container);
    }
  }).catch((err) => {
    console.warn('Three.js failed to load, applying CSS fallback', err);
    applyFallbackCSS(container);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startGradient);
} else {
  startGradient();
}
