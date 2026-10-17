/**
 * GLSL for the Earth, its cloud shell and its atmosphere. Kept apart from the renderer so the numbers that set the
 * look (ocean grade, terminator softness, rim colour, glow reach) sit in one reviewable place.
 *
 * Colour: the day texture is sRGB and arrives here already decoded to linear; the shaders end with
 * three.js's colour-space chunk, which encodes for the screen.
 *
 * Lighting: one sun, fixed in the camera's frame (`uSunDir`, world space), so the side facing the camera is always
 * lit and the terminator sits near the limb, as in a photograph from space. The globe turns under it.
 */

export const EARTH_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const EARTH_FRAGMENT = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uOcean;
uniform vec3 uSunDir;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunDir);

  vec3 base = texture2D(uDay, vUv).rgb;

  // The bathymetry shading is dark; lift and saturate the open water toward the reference's blue.
  float ocean = texture2D(uOcean, vUv).r;
  vec3 sea = base * vec3(1.05, 1.5, 2.55) + vec3(0.002, 0.012, 0.045);
  base = mix(base, sea, ocean * 0.8);

  float ndl = dot(N, L);
  float diffuse = smoothstep(-0.10, 0.60, ndl);
  vec3 colour = base * (diffuse * 1.35) + base * 0.025 + vec3(0.002, 0.005, 0.014);

  // Sun glint on open water only.
  vec3 H = normalize(L + V);
  float glint = pow(max(dot(N, H), 0.0), 70.0) * ocean;
  colour += vec3(0.75, 0.88, 1.0) * glint * 0.5 * diffuse;

  // Atmospheric rim, brighter on the lit side.
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  colour += vec3(0.20, 0.45, 1.0) * fresnel * (0.20 + 0.95 * smoothstep(-0.35, 0.6, ndl));

  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}
`;

export const CLOUD_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

export const CLOUD_FRAGMENT = /* glsl */ `
uniform sampler2D uClouds;
uniform vec3 uSunDir;
uniform float uOpacity;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  float c = texture2D(uClouds, vUv).r;
  float alpha = smoothstep(0.18, 0.95, c) * uOpacity;
  float diffuse = smoothstep(-0.15, 0.55, dot(normalize(vNormalW), normalize(uSunDir)));
  vec3 colour = vec3(0.97, 0.98, 1.0) * (diffuse * 1.05 + 0.03);
  gl_FragColor = vec4(colour, alpha);
  #include <colorspace_fragment>
}
`;

export const GLOW_VERTEX = /* glsl */ `
varying vec3 vPosW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Glow from the ray's closest approach to the globe's centre (the impact parameter), so it is exact under
 * perspective: full at the Earth's limb, falling to nothing at the shell's edge.
 */
export const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform float uThickness;
uniform float uFade;
varying vec3 vPosW;
void main() {
  vec3 ray = normalize(vPosW - cameraPosition);
  float along = dot(-cameraPosition, ray);
  vec3 closest = cameraPosition + ray * along;
  float b = length(closest);
  float f = clamp(1.0 - (b - 1.0) / uThickness, 0.0, 1.0);
  float lit = 0.30 + 0.70 * smoothstep(-0.45, 0.65, dot(normalize(closest), normalize(uSunDir)));
  float a = pow(f, 2.6) * lit * uFade;
  gl_FragColor = vec4(vec3(0.24, 0.52, 1.0) * a * 1.15, a);
}
`;
