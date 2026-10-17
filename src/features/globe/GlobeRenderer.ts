/**
 * The WebGL side of the globe: scene, textures, overlay meshes, picking, labels and the frame loop. Imperative and
 * framework-free; the React component creates one, calls its methods, and disposes it on unmount. Browser only:
 * nothing here runs on the server.
 *
 * What it owns
 *   Earth, cloud shell, atmosphere glow, stars   built once; textures are loaded from same-origin files.
 *   overlay meshes                               built lazily, once per feature, cached, released on dispose.
 *   camera pose                                  a CameraController (camera.ts); the globe is rotated, not the camera.
 *   frame loop                                   renders only while something moves or changed, so a held view is idle.
 *
 * It never contacts a network: textures come from /globe/*.jpg|png on this origin, through three.js's image loader.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  Raycaster,
  Scene,
  ShaderMaterial,
  ShapeUtils,
  SphereGeometry,
  SRGBColorSpace,
  Sphere,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { CameraController, IDLE_POSE_LAT, type FlightKind } from "./camera";
import {
  angularDistance,
  distanceForBox,
  boxCentre,
  faceRotation,
  homeDistance,
  lngLatToVector,
  smootherstep,
  vectorToLngLat,
  type Pose,
} from "./geo-math";
import { CLOUD_FRAGMENT, CLOUD_VERTEX, EARTH_FRAGMENT, EARTH_VERTEX, GLOW_FRAGMENT, GLOW_VERTEX } from "./shaders";
import { decodeGeometry, inBox, pointInPolygons, type Polygon } from "./shapes";
import { BLOCK_STYLE, DISTRICT_STYLE, HOVER_COLOUR, SELECTED_COLOUR, type StateStyle } from "./styles";
import type { BBox, GlobeOverlay, OverlayBlock, OverlayDistrict, Phase, UnitState } from "./types";

export type FeatureRef = { kind: "state" | "district" | "block"; id: string };

export interface RendererEvents {
  onPhase(phase: Phase): void;
  onArrive(kind: FlightKind): void;
  onHover(ref: FeatureRef | null): void;
  /** A click or tap. `null` means the globe itself or empty space. */
  onPick(ref: FeatureRef | null): void;
  onContextLost(): void;
}

export interface RendererOptions {
  reducedMotion: boolean;
}

export const FOV = 32;

// Layering. Every overlay sits at one radius, just above the sphere, and render order stacks them. Separate radii
// would shift the layers against each other (parallax) when the camera is close: at the closest zoom a height
// difference of 0.002 is a visible fraction of the screen. The margin only has to clear the sphere's own facets
// (about 1.3e-4 at this tessellation) and the flat fill triangles' dip between vertices.
const R_DISTRICT_FILL = 1.0008;
const R_DISTRICT_EDGE = 1.0008;
const R_BLOCK_FILL = 1.0008;
const R_BLOCK_EDGE = 1.0008;
const R_HIGHLIGHT = 1.0008;

const REVEAL_SECONDS = 1.4;
const HIDE_SECONDS = 0.45;

const SUN = new Vector3(-0.55, 0.38, 0.75).normalize();

type LayerName = "districts" | "blocks";

interface FeatureObject {
  ref: FeatureRef;
  name: string;
  state: UnitState;
  style: StateStyle;
  polygons: Polygon[];
  bbox: BBox;
  anchor: readonly [number, number] | null;
  radius: number;
  fill: Mesh;
  fillMaterial: MeshBasicMaterial;
  edges: LineSegments;
  edgeMaterial: LineBasicMaterial;
  edgeVertexCount: number;
  highlightGeometry: LineSegmentsGeometry | null;
}

interface Layer {
  name: LayerName;
  group: Group;
  features: FeatureObject[];
  /** 0 hidden, 1 fully revealed. */
  progress: number;
  target: 0 | 1;
  /** Seconds the current reveal or hide has run. */
  elapsed: number;
  startProgress: number;
  /** Per-feature start delay in 0..1 of the reveal, so outlines draw one after another. */
  stagger: Map<string, number>;
  /** Fill dimming applied to the layer's features while it is only context. */
  dim: number;
  dimTarget: number;
}

interface LabelItem {
  element: HTMLElement;
  feature: FeatureObject;
  radius: number;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function loadTexture(manager: LoadingManager, url: string, colour: typeof SRGBColorSpace | typeof NoColorSpace): Promise<Texture> {
  return new Promise((resolve, reject) => {
    new TextureLoader(manager).load(
      url,
      (texture) => {
        texture.colorSpace = colour;
        resolve(texture);
      },
      undefined,
      () => reject(new Error(`Could not load ${url}`)),
    );
  });
}

export class GlobeRenderer {
  readonly camera: CameraController;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly view: PerspectiveCamera;
  private readonly earth = new Group();
  private readonly stars: Points;
  private readonly labelLayer: HTMLDivElement;
  private readonly textures: Texture[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly layers: Record<LayerName, Layer>;
  private readonly clouds: Mesh;
  private readonly cloudMaterial: ShaderMaterial;
  private readonly glowMaterial: ShaderMaterial;
  private readonly raycaster = new Raycaster();
  private readonly sphere = new Sphere(new Vector3(), 1);
  private readonly highlights: { hover: LineSegments2; focus: LineSegments2; selected: LineSegments2 };
  private readonly featureById = new Map<string, FeatureObject>();
  private readonly resizeObserver: ResizeObserver;
  private readonly intersection: IntersectionObserver;
  private readonly labels: LabelItem[] = [];

  /** The validated, joined outlines. Null until the outline file has loaded and passed validation. */
  private overlay: GlobeOverlay | null = null;
  private readonly events: RendererEvents;
  private readonly host: HTMLElement;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private onScreen = true;
  private disposed = false;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private slowFrames = 0;
  private frameCount = 0;
  private hovered: FeatureRef | null = null;
  private focused: FeatureRef | null = null;
  private selected: FeatureRef | null = null;
  private blocksDistrictId: string | null = null;
  private labelMode: "none" | "districts" | "blocks" = "none";
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  private reportedPhase: Phase = "idle";
  private marker: { group: Group; ring: Mesh; ref: FeatureRef; lng: number; lat: number; label: HTMLElement } | null = null;
  private markerOn = false;
  private clock = 0;
  private frameInfoAt = 0;

  /** Cheap read-outs for the page's data attributes and tests. */
  info = { lng: 0, lat: 0, dist: 0, phase: "idle" as Phase, frames: 0, pixelRatio: 1, textureSize: "" };

  private constructor(
    host: HTMLElement,
    renderer: WebGLRenderer,
    events: RendererEvents,
    options: RendererOptions,
    textures: { day: Texture; ocean: Texture; clouds: Texture },
    textureSize: string,
  ) {
    this.host = host;
    this.renderer = renderer;
    this.events = events;
    this.view = new PerspectiveCamera(FOV, 1, 0.01, 200);
    this.textures.push(textures.day, textures.ocean, textures.clouds);
    this.camera = new CameraController({ lng: 40, lat: IDLE_POSE_LAT, dist: homeDistance(FOV, 1.4) }, { reducedMotion: options.reducedMotion });
    this.info.textureSize = textureSize;

    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "pan-y";
    host.appendChild(canvas);

    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "pointer-events-none absolute inset-0 overflow-hidden";
    this.labelLayer.setAttribute("aria-hidden", "true");
    host.appendChild(this.labelLayer);

    // Earth.
    const earthMaterial = new ShaderMaterial({
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
      uniforms: {
        uDay: { value: textures.day },
        uOcean: { value: textures.ocean },
        uSunDir: { value: SUN.clone() },
      },
    });
    const earthGeometry = new SphereGeometry(1, 192, 128);
    const earthMesh = new Mesh(earthGeometry, earthMaterial);
    earthMesh.renderOrder = 0;
    this.earth.add(earthMesh);
    this.disposables.push(earthGeometry, earthMaterial);

    // Clouds: a 2001 composite, drawn only as atmosphere, fading out as the camera comes close.
    this.cloudMaterial = new ShaderMaterial({
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: { uClouds: { value: textures.clouds }, uSunDir: { value: SUN.clone() }, uOpacity: { value: 0.5 } },
    });
    const cloudGeometry = new SphereGeometry(1.011, 96, 72);
    this.clouds = new Mesh(cloudGeometry, this.cloudMaterial);
    this.clouds.renderOrder = 1;
    this.earth.add(this.clouds);
    this.disposables.push(cloudGeometry, this.cloudMaterial);

    // Atmosphere: lives outside the rotating group so it is always symmetric about the view.
    this.glowMaterial = new ShaderMaterial({
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      uniforms: { uSunDir: { value: SUN.clone() }, uThickness: { value: 0.16 }, uFade: { value: 1 } },
    });
    const glowGeometry = new SphereGeometry(1.16, 96, 72);
    const glow = new Mesh(glowGeometry, this.glowMaterial);
    glow.renderOrder = 0.5;
    this.scene.add(glow);
    this.disposables.push(glowGeometry, this.glowMaterial);

    // Stars: restrained, fixed in space, deterministic.
    const random = mulberry32(20260101);
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = random() * 2 - 1;
      const t = random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      positions.set([r * Math.cos(t) * 90, u * 90, r * Math.sin(t) * 90], i * 3);
      const level = 0.25 + Math.pow(random(), 3) * 0.75;
      const tint = random();
      colours.set([level * (0.85 + 0.15 * tint), level * 0.92, level * (1 - 0.1 * tint)], i * 3);
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute("position", new BufferAttribute(positions, 3));
    starGeometry.setAttribute("color", new BufferAttribute(colours, 3));
    const starMaterial = new PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
    this.stars = new Points(starGeometry, starMaterial);
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
    this.disposables.push(starGeometry, starMaterial);

    this.scene.add(this.earth);

    // Overlay layers (empty until revealed).
    const makeLayer = (name: LayerName): Layer => {
      const group = new Group();
      group.visible = false;
      this.earth.add(group);
      return { name, group, features: [], progress: 0, target: 0, elapsed: 1e9, startProgress: 0, stagger: new Map(), dim: 1, dimTarget: 1 };
    };
    this.layers = { districts: makeLayer("districts"), blocks: makeLayer("blocks") };

    // Highlights: fat lines, one each for hover, keyboard focus and the selection.
    const makeHighlight = (colour: string, width: number, order: number) => {
      const material = new LineMaterial({ color: new Color(colour).getHex(), linewidth: width, transparent: true, depthWrite: false, worldUnits: false });
      const initial = new LineSegmentsGeometry();
      const line = new LineSegments2(initial, material);
      this.disposables.push(initial);
      line.visible = false;
      line.renderOrder = order;
      this.earth.add(line);
      this.disposables.push(material);
      return line;
    };
    this.highlights = {
      hover: makeHighlight(HOVER_COLOUR, 2.5, 6),
      focus: makeHighlight(HOVER_COLOUR, 3.5, 6.1),
      selected: makeHighlight(SELECTED_COLOUR, 3.5, 6.2),
    };

    // Events and observers.
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.intersection = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((e) => e.isIntersecting);
      if (this.onScreen) this.dirty = true;
    });
    this.intersection.observe(host);

    this.camera.onArrive = (kind) => this.events.onArrive(kind);
    this.resize();
    this.camera.pose = { ...this.camera.pose, dist: this.homePose().dist };
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /**
   * Loads the textures, then builds the renderer. It needs no outline data: the globe turns and flies on its own, and
   * the outlines arrive later through `setOverlay`. Rejects with a readable message if a texture or WebGL fails, and
   * by then every texture that did load and the WebGL context are released, so "Try again" starts from nothing.
   */
  static async create(host: HTMLElement, events: RendererEvents, options: RendererOptions, onProgress?: (fraction: number) => void): Promise<GlobeRenderer> {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      throw new Error("WebGL is not available in this browser.");
    }
    renderer.setClearColor(0x02060f, 1);
    renderer.outputColorSpace = SRGBColorSpace;

    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowMemory = (nav.deviceMemory ?? 8) <= 2;
    const use8k = renderer.capabilities.maxTextureSize >= 8192 && !lowMemory;
    const manager = new LoadingManager();
    let finished = 0;
    const total = 3;
    const track = <T,>(promise: Promise<T>) =>
      promise.then((value) => {
        finished += 1;
        onProgress?.(finished / total);
        return value;
      });
    // Settled, not Promise.all: when one texture fails the others are still arriving, and each one that does must be disposed.
    const settled = await Promise.allSettled([
      track(loadTexture(manager, use8k ? "/globe/earth-day-8k.jpg" : "/globe/earth-day-4k.jpg", SRGBColorSpace)),
      track(loadTexture(manager, "/globe/earth-ocean-mask.png", NoColorSpace)),
      track(loadTexture(manager, "/globe/earth-clouds.jpg", NoColorSpace)),
    ]);
    const loaded = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    const failure = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    if (failure) {
      for (const texture of loaded) texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      throw failure.reason instanceof Error ? failure.reason : new Error("A globe texture could not be loaded.");
    }
    const [day, ocean, clouds] = loaded;
    try {
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      for (const texture of loaded) texture.anisotropy = anisotropy;
      return new GlobeRenderer(host, renderer, events, options, { day, ocean, clouds }, use8k ? "8192x4096" : "4096x2048");
    } catch (error) {
      for (const texture of loaded) texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      throw error;
    }
  }

  // ------------------------------------------------------------------ view --

  private homePose(): Pose {
    return { lng: this.camera.pose.lng, lat: IDLE_POSE_LAT, dist: homeDistance(FOV, this.width / Math.max(this.height, 1)) };
  }

  get aspect(): number {
    return this.width / Math.max(this.height, 1);
  }

  /** The pose that frames a longitude / latitude box. */
  poseForBox(box: BBox, fill = 0.6): Pose {
    const centre = boxCentre(box);
    return { lng: centre.lng, lat: centre.lat, dist: distanceForBox(box, FOV, this.aspect, fill) };
  }

  flyTo(pose: Pose): void {
    this.camera.flyTo(pose, "select");
    this.dirty = true;
  }

  flyHome(): void {
    this.camera.flyTo(this.homePose(), "home");
    this.dirty = true;
  }

  setReducedMotion(value: boolean): void {
    this.camera.setReducedMotion(value);
    this.dirty = true;
  }

  private resize(): void {
    if (this.disposed) return;
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
    const cap = lowEnd ? 1.25 : 2;
    if (this.pixelRatio === 1 && this.info.pixelRatio === 1 && this.frameCount === 0) this.pixelRatio = Math.min(window.devicePixelRatio || 1, cap);
    this.pixelRatio = Math.min(this.pixelRatio, window.devicePixelRatio || 1, cap);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.info.pixelRatio = this.pixelRatio;
    this.view.aspect = this.width / this.height;
    this.view.updateProjectionMatrix();
    for (const line of Object.values(this.highlights)) (line.material as LineMaterial).resolution.set(this.width, this.height);
    if (this.camera.phase === "idle" && this.camera.pose.dist > 2) this.camera.pose = { ...this.camera.pose, dist: this.homePose().dist };
    this.dirty = true;
  }

  // --------------------------------------------------------------- marker --

  /**
   * The one place on the whole globe that can be chosen before any outline exists: a small ring and dot at the
   * validated West Bengal target. It is shown only while the whole globe is in view.
   */
  setMarker(target: { ref: FeatureRef; lng: number; lat: number; name: string } | null): void {
    if (this.marker) {
      this.earth.remove(this.marker.group);
      this.marker.label.remove();
      this.marker = null;
    }
    if (!target) {
      this.dirty = true;
      return;
    }
    const group = new Group();
    const dotGeometry = new CircleGeometry(0.0085, 28);
    const ringGeometry = new RingGeometry(0.0165, 0.0198, 48);
    const dotMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const ringMaterial = new MeshBasicMaterial({ color: new Color(HOVER_COLOUR), transparent: true, depthWrite: false, side: DoubleSide });
    const dot = new Mesh(dotGeometry, dotMaterial);
    const ring = new Mesh(ringGeometry, ringMaterial);
    dot.renderOrder = ring.renderOrder = 6.5;
    group.add(dot, ring);
    const normal = new Vector3(...lngLatToVector(target.lng, target.lat));
    group.position.copy(normal).multiplyScalar(1.006);
    group.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal);
    this.earth.add(group);
    this.disposables.push(dotGeometry, ringGeometry, dotMaterial, ringMaterial);
    const label = document.createElement("span");
    label.className = "absolute left-0 top-0 whitespace-nowrap rounded bg-navy-950/70 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white opacity-0 transition-opacity duration-300";
    label.textContent = target.name;
    this.labelLayer.appendChild(label);
    this.marker = { group, ring, ref: target.ref, lng: target.lng, lat: target.lat, label };
    this.dirty = true;
  }

  /** Whether the marker can be seen and picked. */
  setMarkerEnabled(enabled: boolean): void {
    this.markerOn = enabled;
    this.dirty = true;
  }

  // ------------------------------------------------------------- overlays --

  private buildFeature(ref: FeatureRef, item: OverlayDistrict | OverlayBlock, layer: LayerName): FeatureObject | null {
    const cached = this.featureById.get(`${ref.kind}:${ref.id}`);
    if (cached) return cached;
    if (!item.geometry) return null;
    const polygons = decodeGeometry(item.geometry);
    if (polygons.length === 0) return null;
    const style = (ref.kind === "district" ? DISTRICT_STYLE : BLOCK_STYLE)[item.state];
    const fillRadius = layer === "districts" ? R_DISTRICT_FILL : R_BLOCK_FILL;
    const edgeRadius = layer === "districts" ? R_DISTRICT_EDGE : R_BLOCK_EDGE;

    const positions: number[] = [];
    const indices: number[] = [];
    for (const polygon of polygons) {
      const contour = polygon.outer.map(([lng, lat]) => new Vector2(lng, lat));
      const holes = polygon.holes.map((hole) => hole.map(([lng, lat]) => new Vector2(lng, lat)));
      const faces = ShapeUtils.triangulateShape(contour, holes);
      const vertices = [...contour, ...holes.flat()];
      const base = positions.length / 3;
      for (const v of vertices) positions.push(...lngLatToVector(v.x, v.y, fillRadius));
      for (const face of faces) indices.push(base + face[0], base + face[1], base + face[2]);
    }
    const fillGeometry = new BufferGeometry();
    fillGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    fillGeometry.setIndex(indices);
    const fillMaterial = new MeshBasicMaterial({ color: style.fill, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const fill = new Mesh(fillGeometry, fillMaterial);
    fill.renderOrder = layer === "districts" ? 2 : 4;

    const edgePositions: number[] = [];
    const rings = polygons.flatMap((p) => [p.outer, ...p.holes]);
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        edgePositions.push(...lngLatToVector(a[0], a[1], edgeRadius), ...lngLatToVector(b[0], b[1], edgeRadius));
      }
    }
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute("position", new Float32BufferAttribute(edgePositions, 3));
    edgeGeometry.setDrawRange(0, 0);
    const edgeMaterial = new LineBasicMaterial({ color: style.edge, transparent: true, opacity: 0, depthWrite: false });
    const edges = new LineSegments(edgeGeometry, edgeMaterial);
    edges.renderOrder = layer === "districts" ? 3 : 5;

    this.disposables.push(fillGeometry, fillMaterial, edgeGeometry, edgeMaterial);
    const feature: FeatureObject = {
      ref,
      name: item.name,
      state: item.state,
      style,
      polygons,
      bbox: item.geometry.bbox,
      anchor: item.geometry.anchor,
      radius: edgeRadius,
      fill,
      fillMaterial,
      edges,
      edgeMaterial,
      edgeVertexCount: edgePositions.length / 3,
      highlightGeometry: null,
    };
    this.featureById.set(`${ref.kind}:${ref.id}`, feature);
    return feature;
  }

  private fillLayer(layer: Layer, items: Array<{ ref: FeatureRef; item: OverlayDistrict | OverlayBlock }>): void {
    for (const f of layer.features) {
      layer.group.remove(f.fill, f.edges);
    }
    layer.features = [];
    layer.stagger.clear();
    const built = items.map(({ ref, item }) => this.buildFeature(ref, item, layer.name)).filter((f): f is FeatureObject => f !== null);
    // Outlines draw one after another from west to east, over the first 55% of the reveal.
    const ordered = [...built].sort((a, b) => a.bbox[0] - b.bbox[0]);
    ordered.forEach((feature, index) => layer.stagger.set(feature.ref.id, ordered.length > 1 ? (index / (ordered.length - 1)) * 0.55 : 0));
    for (const feature of built) layer.group.add(feature.fill, feature.edges);
    layer.features = built;
  }

  /** Whether validated outlines have been handed over, so there is something to reveal. */
  get hasOutlines(): boolean {
    return this.overlay !== null;
  }

  /**
   * Hands over (or withdraws, with null) the validated outlines. Nothing is drawn by this call: the outlines appear only
   * when `showDistricts` / `showBlocks` are called, which the page does once the flight has arrived. Replacing an
   * overlay first hides and releases everything built from the old one.
   */
  setOverlay(overlay: GlobeOverlay | null): void {
    if (overlay === this.overlay) return;
    for (const layer of Object.values(this.layers)) {
      for (const f of layer.features) layer.group.remove(f.fill, f.edges);
      layer.features = [];
      layer.stagger.clear();
      layer.group.visible = false;
      layer.progress = 0;
      layer.target = 0;
      layer.elapsed = 1e9;
      layer.dimTarget = 1;
    }
    for (const feature of this.featureById.values()) {
      feature.fillMaterial.dispose();
      feature.edgeMaterial.dispose();
      feature.fill.geometry.dispose();
      feature.edges.geometry.dispose();
      feature.highlightGeometry?.dispose();
    }
    this.featureById.clear();
    this.blocksDistrictId = null;
    this.overlay = overlay;
    this.updateLabels();
    this.applyHighlights();
  }

  /** Reveals (or hides) the district outlines. A no-op until `setOverlay` has been given validated outlines. */
  showDistricts(visible: boolean): void {
    const overlay = this.overlay;
    if (!overlay) return;
    const layer = this.layers.districts;
    if (visible && layer.features.length === 0) {
      this.fillLayer(layer, overlay.districts.map((d) => ({ ref: { kind: "district", id: d.id } as FeatureRef, item: d })));
    }
    this.startReveal(layer, visible ? 1 : 0);
    this.updateLabels();
  }

  /** Reveals the block outlines of one district, or hides them with `null`. A no-op until there are outlines. */
  showBlocks(districtId: string | null): void {
    const overlay = this.overlay;
    if (!overlay) return;
    const layer = this.layers.blocks;
    if (districtId === this.blocksDistrictId && districtId !== null && layer.target === 1) return;
    this.blocksDistrictId = districtId;
    if (districtId === null) {
      this.startReveal(layer, 0);
      this.layers.districts.dimTarget = 1;
    } else {
      this.fillLayer(
        layer,
        overlay.blocks.filter((b) => b.districtId === districtId).map((b) => ({ ref: { kind: "block", id: b.id } as FeatureRef, item: b })),
      );
      layer.progress = 0;
      this.startReveal(layer, 1);
      this.layers.districts.dimTarget = 0.4;
    }
    this.updateLabels();
  }

  private startReveal(layer: Layer, target: 0 | 1): void {
    layer.group.visible = true;
    layer.startProgress = layer.progress;
    layer.target = target;
    layer.elapsed = 0;
    if (this.reducedMotionNow()) {
      layer.progress = target;
      layer.elapsed = 1e9;
      if (target === 0) this.releaseLayer(layer);
    }
    this.dirty = true;
  }

  /** After a layer has faded out: hide it, and drop a block layer's features so memory follows what is shown. */
  private releaseLayer(layer: Layer): void {
    layer.group.visible = false;
    if (layer.name === "blocks") {
      for (const f of layer.features) layer.group.remove(f.fill, f.edges);
      layer.features = [];
    }
  }

  private reducedMotionNow(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  setSelected(ref: FeatureRef | null): void {
    this.selected = ref;
    this.applyHighlights();
  }

  setFocus(ref: FeatureRef | null): void {
    this.focused = ref;
    this.applyHighlights();
  }

  /** Names shown next to the outlines of the layer in view. */
  setLabels(mode: "none" | "districts" | "blocks"): void {
    this.labelMode = mode;
    this.updateLabels();
  }

  private updateLabels(): void {
    for (const label of this.labels) label.element.remove();
    this.labels.length = 0;
    const layer = this.labelMode === "districts" ? this.layers.districts : this.labelMode === "blocks" ? this.layers.blocks : null;
    if (layer) {
      for (const feature of layer.features) {
        if (!feature.anchor) continue;
        const element = document.createElement("span");
        element.className = "absolute left-0 top-0 whitespace-nowrap text-[11px] font-medium leading-none text-white opacity-0 transition-opacity duration-300 [text-shadow:0_1px_3px_rgba(2,6,15,0.95),0_0_2px_rgba(2,6,15,0.9)]";
        element.textContent = feature.name;
        this.labelLayer.appendChild(element);
        this.labels.push({ element, feature, radius: Math.hypot(feature.bbox[2] - feature.bbox[0], feature.bbox[3] - feature.bbox[1]) });
      }
      // Larger areas claim label space first.
      this.labels.sort((a, b) => b.radius - a.radius);
    }
    this.dirty = true;
  }

  private highlightGeometryFor(feature: FeatureObject): LineSegmentsGeometry {
    if (!feature.highlightGeometry) {
      const positions: number[] = [];
      for (const polygon of feature.polygons) {
        for (const ring of [polygon.outer, ...polygon.holes]) {
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            positions.push(...lngLatToVector(a[0], a[1], R_HIGHLIGHT), ...lngLatToVector(b[0], b[1], R_HIGHLIGHT));
          }
        }
      }
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      feature.highlightGeometry = geometry;
      this.disposables.push(geometry);
    }
    return feature.highlightGeometry;
  }

  private featureFor(ref: FeatureRef | null): FeatureObject | null {
    if (!ref) return null;
    const feature = this.featureById.get(`${ref.kind}:${ref.id}`) ?? null;
    if (!feature) return null;
    const layer = ref.kind === "district" ? this.layers.districts : this.layers.blocks;
    return layer.features.includes(feature) && layer.progress > 0.02 ? feature : null;
  }

  private applyHighlights(): void {
    const set = (line: LineSegments2, ref: FeatureRef | null) => {
      const feature = this.featureFor(ref);
      line.visible = feature !== null;
      if (feature) line.geometry = this.highlightGeometryFor(feature);
    };
    set(this.highlights.hover, this.hovered && !sameRef(this.hovered, this.selected) ? this.hovered : null);
    set(this.highlights.focus, this.focused && !sameRef(this.focused, this.selected) ? this.focused : null);
    set(this.highlights.selected, this.selected);
    this.dirty = true;
  }

  // -------------------------------------------------------------- picking --

  /** Longitude / latitude under a pointer, or null off the globe. */
  private lngLatAt(clientX: number, clientY: number): { lng: number; lat: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new Vector2(x, y), this.view);
    const hit = this.raycaster.ray.intersectSphere(this.sphere, new Vector3());
    if (!hit) return null;
    const local = hit.applyQuaternion(this.earth.quaternion.clone().invert());
    return vectorToLngLat(local.x, local.y, local.z);
  }

  private pick(clientX: number, clientY: number): FeatureRef | null {
    const at = this.lngLatAt(clientX, clientY);
    if (!at) return null;
    if (this.marker && this.markerOn && this.camera.phase !== "flying") {
      const reach = Math.max(2, Math.min(6, this.camera.pose.dist * 0.7));
      if (angularDistance(at.lng, at.lat, this.marker.lng, this.marker.lat) < reach) return this.marker.ref;
    }
    const order: Layer[] = [this.layers.blocks, this.layers.districts];
    for (const layer of order) {
      if (layer.progress < 0.6 || layer.target === 0) continue;
      for (const feature of layer.features) {
        if (inBox(at.lng, at.lat, feature.bbox) && pointInPolygons(at.lng, at.lat, feature.polygons)) return feature.ref;
      }
    }
    return null;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.drag && this.drag.id === event.pointerId) {
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < 5) return;
      this.drag.moved = true;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      // Degrees per pixel scales with how much of the sky the globe covers at the current distance.
      const perPixel = (FOV / this.height) * 0.55 * Math.max(0.6, this.camera.pose.dist / 4);
      this.camera.nudge(-dx * perPixel * 1.5, dy * perPixel * 1.5);
      this.dirty = true;
      return;
    }
    const ref = this.pick(event.clientX, event.clientY);
    if (!sameRef(ref, this.hovered)) {
      this.hovered = ref;
      this.renderer.domElement.style.cursor = ref ? "pointer" : this.camera.phase === "idle" ? "grab" : "default";
      this.applyHighlights();
      this.events.onHover(ref);
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    this.drag = null;
    this.renderer.domElement.releasePointerCapture?.(event.pointerId);
    if (!drag || drag.moved) return;
    this.events.onPick(this.pick(event.clientX, event.clientY));
  };

  private readonly handlePointerCancel = (): void => {
    this.drag = null;
  };

  private readonly handlePointerLeave = (): void => {
    if (this.hovered) {
      this.hovered = null;
      this.applyHighlights();
      this.events.onHover(null);
    }
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.events.onContextLost();
  };

  // ----------------------------------------------------------- frame loop --

  private readonly tick = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (!this.onScreen || document.hidden) return;

    this.camera.update(dt);
    const animating = this.advanceLayers(dt);
    if (this.camera.phase !== this.reportedPhase) {
      this.reportedPhase = this.camera.phase;
      this.events.onPhase(this.camera.phase);
      this.renderer.domElement.style.cursor = this.camera.phase === "idle" ? "grab" : "default";
    }
    const needsFrame = this.dirty || this.camera.moving || animating;
    if (!needsFrame) return;
    this.dirty = false;

    const started = performance.now();
    this.applyPose(dt);
    this.renderer.render(this.scene, this.view);
    this.frameCount += 1;
    this.info.frames = this.frameCount;
    this.watchFrameTime(performance.now() - started, dt);

    if (now - this.frameInfoAt > 120) {
      this.frameInfoAt = now;
      this.info.lng = this.camera.pose.lng;
      this.info.lat = this.camera.pose.lat;
      this.info.dist = this.camera.pose.dist;
      this.info.phase = this.camera.phase;
      this.host.dataset.view = `${this.info.lng.toFixed(2)},${this.info.lat.toFixed(2)},${this.info.dist.toFixed(3)}`;
    }
  };

  /** Lowers the pixel ratio once, if frames keep taking too long on this device. */
  private watchFrameTime(renderMs: number, dt: number): void {
    if (this.camera.phase !== "idle" || this.pixelRatio <= 1) return;
    this.slowFrames = renderMs > 14 || dt > 0.034 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90) {
      this.slowFrames = 0;
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height, false);
      this.info.pixelRatio = this.pixelRatio;
    }
  }

  private applyPose(dt: number): void {
    const pose = this.camera.pose;
    const rotation = faceRotation(pose.lng, pose.lat);
    this.earth.rotation.set(rotation.x, rotation.y, 0, "XYZ");
    this.earth.updateMatrixWorld(true);
    this.view.position.set(0, 0, pose.dist);
    this.view.lookAt(0, 0, 0);
    this.view.updateMatrixWorld(true);
    // The cloud shell drifts a little only while the globe is idle; a held view stays perfectly still.
    if (this.camera.phase === "idle" && !this.reducedMotionNow()) this.clouds.rotation.y += dt * 0.0035;
    this.cloudMaterial.uniforms.uOpacity.value = 0.5 * (1 - smootherstep((2.4 - pose.dist) / 1.0));
    this.clouds.visible = this.cloudMaterial.uniforms.uOpacity.value > 0.01;
    this.glowMaterial.uniforms.uFade.value = smootherstep((pose.dist - 1.17) / 0.2);
    this.clock += dt;
    if (this.marker) {
      const visible = this.markerOn && pose.dist > 2.4;
      this.marker.group.visible = visible;
      const pulse = this.camera.phase === "idle" && !this.reducedMotionNow() ? 1 + 0.3 * Math.sin(this.clock * 2.4) : 1;
      this.marker.ring.scale.setScalar(pulse);
    }
    this.updateLabelPositions();
  }

  private advanceLayers(dt: number): boolean {
    let active = false;
    for (const layer of Object.values(this.layers)) {
      if (layer.dim !== layer.dimTarget) {
        const delta = layer.dimTarget - layer.dim;
        layer.dim = Math.abs(delta) < 0.01 ? layer.dimTarget : layer.dim + delta * Math.min(1, dt * 5);
        active = true;
      }
      if (layer.progress !== layer.target || layer.elapsed < 1e8) {
        const duration = layer.target === 1 ? REVEAL_SECONDS : HIDE_SECONDS;
        layer.elapsed += dt;
        const t = Math.min(1, layer.elapsed / duration);
        layer.progress = layer.startProgress + (layer.target - layer.startProgress) * smootherstep(t);
        if (t >= 1) {
          layer.progress = layer.target;
          layer.elapsed = 1e9;
          if (layer.target === 0) this.releaseLayer(layer);
        }
        active = true;
      }
      this.paintLayer(layer);
    }
    if (active) this.applyHighlights();
    return active;
  }

  private paintLayer(layer: Layer): void {
    for (const feature of layer.features) {
      // Per-feature progress with its stagger: it starts later in the reveal and finishes by the end.
      const delay = layer.stagger.get(feature.ref.id) ?? 0;
      const local = layer.target === 1 ? smootherstep((layer.progress - delay) / (1 - delay + 1e-6)) : layer.progress;
      const isSelected = sameRef(feature.ref, this.selected);
      const dim = layer.name === "districts" ? layer.dim : 1;
      const emphasis = isSelected ? 1.25 : sameRef(feature.ref, this.hovered) ? 1.18 : 1;
      feature.fillMaterial.opacity = Math.min(0.95, feature.style.fillOpacity * local * dim * emphasis);
      feature.edgeMaterial.opacity = Math.min(1, 0.85 * local * (layer.name === "districts" && dim < 1 ? 0.75 : 1));
      // Edges draw along their length; fills fade in behind them.
      const edgeProgress = layer.target === 1 ? smootherstep((layer.progress - delay) / (0.6 * (1 - delay) + 1e-6)) : layer.progress;
      const segments = Math.floor((feature.edgeVertexCount / 2) * Math.min(1, edgeProgress));
      feature.edges.geometry.setDrawRange(0, segments * 2);
    }
  }

  private readonly tmp = new Vector3();
  private readonly tmpQuat = new Quaternion();

  private updateMarkerLabel(): void {
    const marker = this.marker;
    if (!marker) return;
    const [x, y, z] = lngLatToVector(marker.lng, marker.lat, 1.006);
    this.earth.getWorldQuaternion(this.tmpQuat);
    this.tmp.set(x, y, z).applyQuaternion(this.tmpQuat);
    const facing = this.tmp.clone().normalize().dot(this.view.position.clone().sub(this.tmp).normalize());
    this.tmp.project(this.view);
    const sx = (this.tmp.x * 0.5 + 0.5) * this.width;
    const sy = (-this.tmp.y * 0.5 + 0.5) * this.height;
    const visible = this.markerOn && this.camera.pose.dist > 2.4 && facing > 0.25;
    marker.label.style.transform = `translate(${(sx + 16).toFixed(1)}px, ${sy.toFixed(1)}px) translate(0, -50%)`;
    marker.label.style.opacity = visible ? "1" : "0";
  }

  private updateLabelPositions(): void {
    this.updateMarkerLabel();
    if (this.labels.length === 0) return;
    const layer = this.labelMode === "districts" ? this.layers.districts : this.layers.blocks;
    const placed: Array<[number, number, number]> = [];
    this.earth.getWorldQuaternion(this.tmpQuat);
    const camera = this.view.position;
    for (const label of this.labels) {
      const anchor = label.feature.anchor;
      if (!anchor) continue;
      const [x, y, z] = lngLatToVector(anchor[0], anchor[1], 1.004);
      this.tmp.set(x, y, z).applyQuaternion(this.tmpQuat);
      // Facing the camera: the surface normal against the direction to the camera.
      const facing = this.tmp.clone().normalize().dot(camera.clone().sub(this.tmp).normalize());
      this.tmp.project(this.view);
      const sx = (this.tmp.x * 0.5 + 0.5) * this.width;
      const sy = (-this.tmp.y * 0.5 + 0.5) * this.height;
      const inside = sx > 8 && sx < this.width - 8 && sy > 8 && sy < this.height - 8;
      let visible = facing > 0.3 && inside && layer.progress > 0.55;
      if (visible) {
        const width = label.feature.name.length * 6.2 + 10;
        for (const [px, py, pw] of placed) {
          if (Math.abs(px - sx) < (pw + width) / 2 && Math.abs(py - sy) < 16) {
            visible = false;
            break;
          }
        }
        if (visible) placed.push([sx, sy, width]);
      }
      label.element.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
      label.element.style.opacity = visible ? "1" : "0";
    }
  }

  // -------------------------------------------------------------- teardown --

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersection.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    for (const item of this.disposables) item.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const feature of this.featureById.values()) feature.highlightGeometry?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
    this.marker?.label.remove();
    this.labelLayer.remove();
  }
}

const sameRef = (a: FeatureRef | null, b: FeatureRef | null): boolean => (a === null && b === null) || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
