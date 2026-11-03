"use client";

import { useEffect, useRef } from "react";

const MAP_URL = "/overview/earth-map.webp";
/** Degrees of longitude per second: one turn in two minutes. */
const SPEED = 3;
/** Longitude and latitude (degrees) at the centre of the first frame, close to the still picture it fades in over. */
const START_LON = 60;
const TILT = 18;
/** Where the light comes from (unit vector, x right, y up, z toward the viewer). */
const LIGHT = [-0.45, 0.5, 0.74] as const;
const MAX_PIXEL_RATIO = 2;

/**
 * The Overview's Earth, turning. The still picture (the `earth-preview` background the card paints) is what shows until
 * the world map has loaded, with scripts off, and for a visitor who asks for reduced motion; this draws over it.
 *
 * It is the orthographic view of a sphere from one small equirectangular map, on a plain 2D canvas: no Three.js, no
 * boundary or place data, and no figure. Because the sphere only turns about its own axis, the projection (which map row,
 * which map column, how lit) is worked out once per size and each frame only slides the longitude. It stops when it is off
 * screen or the tab is hidden, and never starts under `prefers-reduced-motion`.
 */
export function RotatingEarth() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let texture: { data: Uint8ClampedArray; width: number } | null = null;
    let projection: ReturnType<typeof project> | null = null;
    let frame = 0;
    let onScreen = false;
    // Time spent turning, and the timestamp of the last frame (0 while stopped), so a stop and a start do not jump the angle.
    let elapsed = 0;
    let last = 0;
    let revealed = false;
    let disposed = false;

    let requested = false;

    // It turns only while it is seen and motion is welcome; the map is fetched the first time that is so, so a visitor who
    // asked for reduced motion never downloads it.
    const wanted = () => !disposed && onScreen && !document.hidden && !reduced.matches;
    const running = () => wanted() && texture !== null;

    function project(size: number, mapWidth: number, mapHeight: number) {
      const count = size * size;
      const u = new Float32Array(count); // map column at longitude 0 rotation, in texels
      const row = new Int32Array(count); // byte offset of the map row
      const lit = new Float32Array(count); // 0..1 brightness
      const rim = new Float32Array(count); // atmosphere glow
      const alpha = new Uint8ClampedArray(count); // anti-aliased edge; 0 outside the disc
      const tilt = (TILT * Math.PI) / 180;
      const [lx, ly, lz] = LIGHT;
      const radius = size / 2;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const i = py * size + px;
          const x = (px + 0.5 - radius) / radius;
          const y = -(py + 0.5 - radius) / radius;
          const d2 = x * x + y * y;
          const edge = Math.sqrt(d2);
          alpha[i] = Math.max(0, Math.min(1, (1 - edge) * radius)) * 255;
          if (d2 >= 1) continue;
          const z = Math.sqrt(1 - d2);
          const yw = y * Math.cos(tilt) + z * Math.sin(tilt);
          const zw = -y * Math.sin(tilt) + z * Math.cos(tilt);
          const lat = Math.asin(Math.max(-1, Math.min(1, yw)));
          const lon = Math.atan2(x, zw);
          u[i] = (lon / (2 * Math.PI) + 0.5) * mapWidth;
          row[i] = Math.min(mapHeight - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * mapHeight))) * mapWidth * 4;
          const diffuse = Math.max(0, x * lx + y * ly + z * lz);
          lit[i] = 0.5 + 0.62 * diffuse - 0.1 * (1 - z) * (1 - z);
          rim[i] = Math.pow(1 - z, 3) * 0.55;
        }
      }
      return { size, u, row, lit, rim, alpha, image: context!.createImageData(size, size) };
    }

    function size() {
      const css = canvas!.clientWidth;
      return Math.max(1, Math.round(css * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)));
    }

    function draw() {
      if (!texture) return;
      const px = size();
      if (!projection || projection.size !== px) {
        canvas!.width = px;
        canvas!.height = px;
        projection = project(px, texture.width, texture.data.length / 4 / texture.width);
      }
      const { u, row, lit, rim, alpha, image } = projection;
      const { data, width } = texture;
      const out = image.data;
      // The Earth turns eastward, so the longitude at the centre falls with time.
      const centre = (START_LON - (SPEED * elapsed) / 1000) / 360;
      const shift = centre * width;
      for (let i = 0; i < alpha.length; i++) {
        const a = alpha[i];
        if (a === 0) {
          out[i * 4 + 3] = 0;
          continue;
        }
        let column = (u[i] + shift) % width;
        if (column < 0) column += width;
        const left = Math.floor(column);
        const next = left + 1 === width ? 0 : left + 1;
        const t = column - left;
        const r0 = row[i];
        const a0 = r0 + left * 4;
        const a1 = r0 + next * 4;
        const shade = lit[i];
        const glow = rim[i] * 255;
        const o = i * 4;
        out[o] = (data[a0] * (1 - t) + data[a1] * t) * shade + glow * 0.45;
        out[o + 1] = (data[a0 + 1] * (1 - t) + data[a1 + 1] * t) * shade + glow * 0.7;
        out[o + 2] = (data[a0 + 2] * (1 - t) + data[a1 + 2] * t) * shade + glow;
        out[o + 3] = a;
      }
      context!.putImageData(image, 0, 0);
      if (!revealed) {
        revealed = true;
        canvas!.style.opacity = "1";
      }
    }

    const tick = (now: number) => {
      frame = 0;
      if (!running()) return;
      // A long gap (a throttled tab) is not turned through in one step.
      if (last !== 0) elapsed += Math.min(now - last, 100);
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const image = new Image();
    const load = () => {
      requested = true;
      image.decoding = "async";
      image.onload = () => {
        if (disposed) return;
        const scratch = document.createElement("canvas");
        scratch.width = image.naturalWidth;
        scratch.height = image.naturalHeight;
        const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
        if (!scratchContext) return;
        scratchContext.drawImage(image, 0, 0);
        texture = { data: scratchContext.getImageData(0, 0, scratch.width, scratch.height).data, width: scratch.width };
        update();
      };
      image.src = MAP_URL;
    };
    const update = () => {
      if (!requested && wanted()) load();
      if (running() && frame === 0) {
        frame = requestAnimationFrame(tick);
      } else if (!running() && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      } else if (!running()) {
        last = 0;
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
      image.onload = null;
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="rotating-earth" className="absolute inset-0 size-full rounded-full opacity-0 transition-opacity duration-500" />;
}
