import * as THREE from "three";

/**
 * Shared uniforms driven by the render loop / scrollBinding so nodes, lines
 * and particles breathe and shift mood in lockstep instead of drifting
 * independently.
 */
export interface BrainUniforms {
  uTime: { value: number };
  uBreatheAmp: { value: number }; // per-node wobble amplitude — rises on inhale
  uColorA: { value: THREE.Color }; // resting / "cool" state
  uColorB: { value: THREE.Color }; // active / "hot" state
  uMoodMix: { value: number }; // 0..1, nudged slowly by scroll to shift ambient tint
  uPixelRatio: { value: number };
  uLightDir: { value: THREE.Vector3 }; // key light, world space — reveals depth/volume
  uBreathIntensity: { value: number }; // 0..1 breathing envelope: brighter/bigger on inhale
}

export function createSharedUniforms(): BrainUniforms {
  return {
    uTime: { value: 0 },
    uBreatheAmp: { value: 0.022 },
    uColorA: { value: new THREE.Color("#4d7cff") },
    uColorB: { value: new THREE.Color("#8b5cf6") },
    uMoodMix: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uLightDir: { value: new THREE.Vector3(0.45, 0.78, 0.62).normalize() },
    uBreathIntensity: { value: 0 },
  };
}

const BREATHE_GLSL = /* glsl */ `
  vec3 breathe(vec3 pos, float phase, float weight, float t, float amp) {
    float len = max(length(pos), 0.0001);
    vec3 dir = pos / len;
    float wobble = sin(t * 0.35 + phase) * 0.6
                 + sin(t * 0.13 + phase * 1.7) * 0.4;
    float offset = wobble * amp * weight;
    return pos + dir * offset;
  }
`;

/** Lambert-ish lighting term: ambient floor + directional key light, darkened further in
 * valleys (negative foldDepth) so the network reads as volume, not a flat glow. */
const LIGHTING_GLSL = /* glsl */ `
  float foldLight(vec3 worldNormal, vec3 lightDir, float fold) {
    float lambert = max(dot(worldNormal, lightDir), 0.0);
    float base = 0.4 + lambert * 0.6;
    float ao = clamp(1.0 + fold * 0.9, 0.35, 1.25);
    return base * ao;
  }
`;

export function createNodeMaterial(uniforms: BrainUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uSize: { value: 3.2 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aWeight;
      attribute float aHeat;
      attribute float aFold;
      attribute vec3 aNormal;

      uniform float uTime;
      uniform float uBreatheAmp;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform vec3 uLightDir;
      uniform float uBreathIntensity;

      varying float vHeat;
      varying float vWeight;
      varying float vLight;

      ${BREATHE_GLSL}
      ${LIGHTING_GLSL}

      void main() {
        vHeat = aHeat;
        vWeight = aWeight;

        vec3 breathed = breathe(position, aPhase, aWeight, uTime, uBreatheAmp);
        vec4 mvPosition = modelViewMatrix * vec4(breathed, 1.0);

        vec3 worldNormal = normalize(mat3(modelMatrix) * aNormal);
        vLight = foldLight(worldNormal, uLightDir, aFold) * (1.0 + uBreathIntensity * 0.35);

        float size = uSize * (0.65 + aWeight * 0.6) * (1.0 + aHeat * 0.9) * (1.0 + uBreathIntensity * 0.16);
        // 4.4 == the camera's resting distance (scene.ts); keeps points a stable
        // few pixels wide instead of the runaway sizes a large constant produces.
        gl_PointSize = size * uPixelRatio * (4.4 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uMoodMix;

      varying float vHeat;
      varying float vWeight;
      varying float vLight;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv) * 2.0;
        float core = smoothstep(1.0, 0.0, d);
        float glow = smoothstep(1.0, 0.4, d) * 0.5;
        float alpha = (core * 0.9 + glow * 0.4) * (0.4 + vWeight * 0.5) * vLight;

        vec3 color = mix(uColorA, uColorB, clamp(uMoodMix + vHeat, 0.0, 1.0));
        // the brightest crests bloom toward white — the only place white appears,
        // so it reads as illumination/energy, never a decorative gradient.
        color = mix(color, vec3(1.0), clamp((vLight - 0.85) * 1.8, 0.0, 1.0) * 0.6);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export function createLineMaterial(uniforms: BrainUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aWeight;
      attribute float aHeat;
      attribute float aFold;
      attribute vec3 aNormal;

      uniform float uTime;
      uniform float uBreatheAmp;
      uniform vec3 uLightDir;
      uniform float uBreathIntensity;

      varying float vHeat;
      varying float vWeight;
      varying float vLight;

      ${BREATHE_GLSL}
      ${LIGHTING_GLSL}

      void main() {
        vHeat = aHeat;
        vWeight = aWeight;
        vec3 breathed = breathe(position, aPhase, aWeight, uTime, uBreatheAmp);

        vec3 worldNormal = normalize(mat3(modelMatrix) * aNormal);
        vLight = foldLight(worldNormal, uLightDir, aFold) * (1.0 + uBreathIntensity * 0.35);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(breathed, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uMoodMix;

      varying float vHeat;
      varying float vWeight;
      varying float vLight;

      void main() {
        float baseAlpha = (0.06 + vWeight * 0.07) * vLight;
        float alpha = baseAlpha + vHeat * 0.65;
        vec3 color = mix(uColorA, uColorB, clamp(uMoodMix + vHeat * 1.3, 0.0, 1.0));
        color = mix(color, vec3(1.0), clamp((vLight - 0.9) * 2.0, 0.0, 1.0) * 0.4);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export function createParticleMaterial(uniforms: BrainUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColorA: uniforms.uColorA,
      uColorB: uniforms.uColorB,
      uPixelRatio: uniforms.uPixelRatio,
      uBreathIntensity: uniforms.uBreathIntensity,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aProgress; // 0..1 along its current edge, drives color + fade
      attribute float aActive; // 0..1 per-particle activation — more come "alive" on inhale
      uniform float uPixelRatio;
      uniform float uBreathIntensity;

      varying float vProgress;
      varying float vActive;

      void main() {
        vProgress = aProgress;
        vActive = clamp(aActive + uBreathIntensity * 0.55, 0.0, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float fade = sin(aProgress * 3.14159265);
        float size = (2.0 + fade * 1.6) * (1.0 + uBreathIntensity * 0.3);
        gl_PointSize = size * uPixelRatio * (4.4 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vProgress;
      varying float vActive;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv) * 2.0;
        float core = smoothstep(1.0, 0.0, d);
        float fade = sin(vProgress * 3.14159265);
        vec3 color = mix(uColorA, uColorB, vProgress);
        gl_FragColor = vec4(color, core * fade * vActive);
      }
    `,
  });
}
