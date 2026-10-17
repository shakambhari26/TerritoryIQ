/**
 * The globe camera as a small state machine over a pose (longitude, latitude, distance). No three.js: the
 * renderer reads `pose` each frame and rotates the globe to match, so every rule here is tested with plain numbers.
 *
 *   idle     the globe turns slowly on its own. Spin speed eases in, so resuming never jumps.
 *   flying   an eased move to a target pose. Idle spin is suspended. A new target replaces the old one, starting
 *            from the current pose, so a second selection never snaps or restarts from a far point.
 *   arrived  the pose is held still. Nothing moves until the next selection or a reset.
 *
 * A flight takes the shortest way round the globe (never more than half a turn), has no overshoot, and never
 * loops. With reduced motion a flight completes at once and idle spin is off.
 */

import { angularDistance, clamp, lngDelta, smootherstep, wrapLng, type Pose } from "./geo-math.ts";
import type { Phase } from "./types.ts";

export const IDLE_POSE_LAT = 17;
export const IDLE_DIST = 4.3;
/** Degrees of longitude per second while idle: one turn in three minutes. */
export const IDLE_SPIN_DEG_PER_S = 2;
const SPIN_EASE_IN_S = 1.6;

export interface CameraOptions {
  reducedMotion: boolean;
}

export type FlightKind = "select" | "home";

interface Flight {
  from: Pose;
  to: Pose;
  elapsed: number;
  duration: number;
  kind: FlightKind;
  lift: number;
}

export class CameraController {
  pose: Pose;
  phase: Phase = "idle";
  /** Fires once when a flight completes, with the kind of flight it was. */
  onArrive: ((kind: FlightKind) => void) | null = null;

  private reducedMotion: boolean;
  private spin = 0;
  private flight: Flight | null = null;
  private spinPause = 0;

  constructor(start: Pose, options: CameraOptions) {
    this.pose = { ...start };
    this.reducedMotion = options.reducedMotion;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    if (value) this.spin = 0;
  }

  /** True while the pose is changing, so the renderer knows a frame is needed. */
  get moving(): boolean {
    return this.phase === "flying" || (this.phase === "idle" && !this.reducedMotion);
  }

  flyTo(target: Pose, kind: FlightKind = "select"): void {
    const to: Pose = { lng: wrapLng(target.lng), lat: clamp(target.lat, -85, 85), dist: target.dist };
    if (this.reducedMotion) {
      this.pose = to;
      this.flight = null;
      this.spin = 0;
      this.finish(kind);
      return;
    }
    const arc = angularDistance(this.pose.lng, this.pose.lat, to.lng, to.lat);
    const zoom = Math.abs(Math.log(to.dist / this.pose.dist));
    // Longer for a longer way and a bigger zoom, within a range that feels deliberate but never slow.
    const duration = clamp(1.1 + (arc / 180) * 1.5 + zoom * 0.55, 1.2, 3.4);
    // A long hop rises a little mid-flight so it reads as travel; a short one does not.
    const lift = arc > 25 ? Math.min(0.35, (arc / 180) * 0.6) : 0;
    this.flight = { from: { ...this.pose }, to, elapsed: 0, duration, kind, lift };
    this.phase = "flying";
    this.spin = 0;
  }

  /**
   * A drag while idle: turns the globe by hand and holds the automatic spin for `holdSeconds`, after which it
   * eases back in. Ignored during a flight and after arrival, so a target is never knocked off by a stray drag.
   */
  nudge(dLng: number, dLat: number, holdSeconds = 2.5): void {
    if (this.phase !== "idle") return;
    this.pose = { ...this.pose, lng: wrapLng(this.pose.lng + dLng), lat: clamp(this.pose.lat + dLat, -65, 65) };
    this.spinPause = holdSeconds;
    this.spin = 0;
  }

  /** Cancels any flight and resumes idle spin from where the globe is. */
  resumeIdle(): void {
    this.flight = null;
    this.phase = "idle";
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.1);
    if (this.phase === "flying" && this.flight) {
      const flight = this.flight;
      flight.elapsed += step;
      const t = clamp(flight.elapsed / flight.duration, 0, 1);
      const e = smootherstep(t);
      this.pose = {
        lng: wrapLng(flight.from.lng + lngDelta(flight.from.lng, flight.to.lng) * e),
        lat: flight.from.lat + (flight.to.lat - flight.from.lat) * e,
        // Interpolate the distance in log space so a zoom feels even, then add the mid-flight lift.
        dist:
          Math.exp(Math.log(flight.from.dist) + (Math.log(flight.to.dist) - Math.log(flight.from.dist)) * e) +
          flight.lift * Math.sin(Math.PI * e),
      };
      if (t >= 1) {
        this.pose = { ...flight.to };
        this.flight = null;
        this.finish(flight.kind);
      }
      return;
    }
    if (this.phase === "idle" && !this.reducedMotion) {
      if (this.spinPause > 0) {
        this.spinPause -= step;
        return;
      }
      this.spin = Math.min(1, this.spin + step / SPIN_EASE_IN_S);
      // The Earth turns eastward under the camera, so the longitude facing it decreases.
      this.pose = { ...this.pose, lng: wrapLng(this.pose.lng - IDLE_SPIN_DEG_PER_S * smootherstep(this.spin) * step) };
    }
  }

  private finish(kind: FlightKind): void {
    this.phase = kind === "home" ? "idle" : "arrived";
    this.onArrive?.(kind);
  }
}
