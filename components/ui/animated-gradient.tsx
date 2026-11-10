// components/ui/animated-gradient.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface AnimatedGradientProps {
  className?: string;
  speed?: number;
  distortion?: number;
  swirl?: number;
  softness?: number;
  scale?: number;
  colors?: string[];
}

/**
 * REWIND RADIO — 21st.dev Animated Gradient Component
 * Reference: Harsh Jadhav (@harshjadhavconnect)
 * Custom warm liquid-glass shader with WebGL, paper-grain overlay,
 * visibilitychange pause handling, prefers-reduced-motion support, and CSS gradient fallback.
 */
export const AnimatedGradient: React.FC<AnimatedGradientProps> = ({
  className = '',
  speed = 10,
  distortion = 10,
  swirl = 20,
  softness = 95,
  scale = 0.7,
  colors = ['#F6EBDD', '#D7BE98', '#A5A17A', '#EBD9B9']
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    // Respect prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsFallback(true);
      return;
    }

    let isDisposed = false;
    let animId: number | null = null;

    async function init() {
      try {
        const container = mountRef.current;
        if (!container) return;

        // Dynamic three import
        const THREE = (window as any).THREE || (await import('three'));
        if (!THREE || isDisposed) return;

        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'low-power'
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '0';

        container.appendChild(canvas);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const c1 = new THREE.Color(colors[0] || '#F6EBDD');
        const c2 = new THREE.Color(colors[1] || '#D7BE98');
        const c3 = new THREE.Color(colors[2] || '#A5A17A');
        const c4 = new THREE.Color(colors[3] || '#EBD9B9');

        const material = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2(width, height) },
            uColor1: { value: c1 },
            uColor2: { value: c2 },
            uColor3: { value: c3 },
            uColor4: { value: c4 },
            uSpeed: { value: 0.000065 * speed },
            uDistortion: { value: distortion * 0.115 },
            uSwirl: { value: swirl * 0.0925 },
            uSoftness: { value: softness * 0.01 },
            uScale: { value: scale }
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

            vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
            float snoise(vec2 v){
              const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy) );
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod(i, 289.0);
              vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
              vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
              m = m*m ; m = m*m ;
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
              vec2 center = vec2(0.5 * aspect, 0.5);
              vec2 toCenter = st - center;
              float dist = length(toCenter);
              float angle = atan(toCenter.y, toCenter.x) + sin(dist * 3.1415 - t) * uSwirl;
              vec2 swirledSt = center + vec2(cos(angle), sin(angle)) * dist * uScale;

              float n1 = snoise(swirledSt * 1.5 + vec2(t * 0.7, -t * 0.5)) * uDistortion;
              float n2 = snoise(swirledSt * 3.0 - vec2(-t * 0.4, t * 0.6));
              float n = (n1 * 0.7 + n2 * 0.3) * 0.5 + 0.5;

              float t1 = smoothstep(0.0, 0.45 * uSoftness, n);
              float t2 = smoothstep(0.35, 0.75 * uSoftness, n);
              float t3 = smoothstep(0.65, 1.0, n);

              vec3 col = mix(uColor1, uColor2, t1);
              col = mix(col, uColor3, t2);
              col = mix(col, uColor4, t3 * 0.65);

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

        let lastTime = performance.now();
        let isVisible = true;

        const animate = (now: number) => {
          if (!isVisible || isDisposed) return;
          const delta = now - lastTime;
          material.uniforms.uTime.value += delta;
          lastTime = now;
          renderer.render(scene, camera);
          animId = requestAnimationFrame(animate);
        };
        animId = requestAnimationFrame(animate);

        const onVisibility = () => {
          if (document.hidden) {
            isVisible = false;
            if (animId) cancelAnimationFrame(animId);
          } else {
            isVisible = true;
            lastTime = performance.now();
            animId = requestAnimationFrame(animate);
          }
        };
        document.addEventListener('visibilitychange', onVisibility);

        const onResize = () => {
          if (!container || isDisposed) return;
          const w = container.clientWidth || window.innerWidth;
          const h = container.clientHeight || window.innerHeight;
          renderer.setSize(w, h);
          material.uniforms.uResolution.value.set(w, h);
        };
        window.addEventListener('resize', onResize);

        return () => {
          isDisposed = true;
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('resize', onResize);
          if (animId) cancelAnimationFrame(animId);
          renderer.dispose();
          if (container.contains(canvas)) {
            container.removeChild(canvas);
          }
        };
      } catch (err) {
        console.warn('AnimatedGradient initialization failed, using CSS fallback', err);
        setIsFallback(true);
      }
    }

    const cleanupPromise = init();
    return () => {
      isDisposed = true;
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, [speed, distortion, swirl, softness, scale, colors]);

  if (isFallback) {
    return (
      <div
        className={`rr-animated-gradient-fallback ${className}`}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          background: 'linear-gradient(135deg, #F6EBDD 0%, #EBD9B9 28%, #D7BE98 56%, #C88C52 82%, #A5A17A 100%)',
          backgroundSize: '300% 300%',
          animation: 'rrWarmGradientShift 22s ease-in-out infinite alternate',
          pointerEvents: 'none'
        }}
      />
    );
  }

  return (
    <div
      ref={mountRef}
      className={`rr-animated-gradient-container ${className}`}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0
      }}
    />
  );
};

export default AnimatedGradient;
