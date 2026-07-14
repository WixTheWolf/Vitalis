// Source agnostic vitals model for the observatory.
// Every source emits Partial<Vitals>; the component merges emissions into
// one mutable vitals object, so sources are swappable at runtime.

export type LensId = "recovery" | "cardio" | "sleep";

export type Vitals = {
  hr: number;
  hrv: number;
  rhr: number;
  readiness: number;
  sleepHours: number;
  sleepScore: number;
  cardioLoad: number;
  spo2: number;
  respRate: number;
  skinTempDelta: number;
  steps: number;
  battery: { oura: number; watch: number };
};

export interface VitalsSource {
  start(cb: (v: Partial<Vitals>) => void): void;
  stop(): void;
  label: string;
}

export const DEFAULT_VITALS: Vitals = {
  hr: 62,
  hrv: 74,
  rhr: 49,
  readiness: 82,
  sleepHours: 7.2,
  sleepScore: 84,
  cardioLoad: 38,
  spo2: 98,
  respRate: 14.2,
  skinTempDelta: -0.1,
  steps: 6480,
  battery: { oura: 84, watch: 67 },
};

// Per lens target profiles for the simulated engine. The engine eases every
// value toward the active profile and layers organic noise on top.
const LENS_PROFILES: Record<LensId, Partial<Omit<Vitals, "battery">>> = {
  recovery: {
    hr: 56, hrv: 96, rhr: 47, readiness: 88, sleepHours: 7.6, sleepScore: 85,
    cardioLoad: 32, spo2: 98.4, respRate: 13.6, skinTempDelta: -0.2,
  },
  cardio: {
    hr: 128, hrv: 38, rhr: 47, readiness: 74, sleepHours: 7.1, sleepScore: 79,
    cardioLoad: 78, spo2: 97.2, respRate: 21.5, skinTempDelta: 0.3,
  },
  sleep: {
    hr: 47, hrv: 108, rhr: 45, readiness: 91, sleepHours: 7.9, sleepScore: 90,
    cardioLoad: 22, spo2: 97.8, respRate: 12.4, skinTempDelta: -0.4,
  },
};

// Port of the lens driven easing engine: the default data source.
export class SimulatedSource implements VitalsSource {
  label = "Simulated";
  private timer: ReturnType<typeof setInterval> | null = null;
  private v: Vitals = structuredClone(DEFAULT_VITALS);
  private t = 0;

  constructor(private getLens: () => LensId) {}

  start(cb: (v: Partial<Vitals>) => void): void {
    this.stop();
    const TICK = 250;
    this.timer = setInterval(() => {
      const dt = TICK / 1000;
      this.t += dt;
      const target = LENS_PROFILES[this.getLens()];
      const ease = 1 - Math.exp(-dt * 0.55);
      const v = this.v;
      const wobble = (freq: number, amp: number, seed: number) =>
        Math.sin(this.t * freq + seed) * amp + Math.sin(this.t * freq * 2.7 + seed * 3.1) * amp * 0.4;

      v.hr += ((target.hr ?? v.hr) - v.hr) * ease + wobble(0.9, 0.35, 1);
      v.hrv += ((target.hrv ?? v.hrv) - v.hrv) * ease + wobble(0.31, 0.5, 2);
      v.rhr += ((target.rhr ?? v.rhr) - v.rhr) * ease * 0.4;
      v.readiness += ((target.readiness ?? v.readiness) - v.readiness) * ease * 0.6;
      v.sleepHours += ((target.sleepHours ?? v.sleepHours) - v.sleepHours) * ease * 0.5;
      v.sleepScore += ((target.sleepScore ?? v.sleepScore) - v.sleepScore) * ease * 0.5;
      v.cardioLoad += ((target.cardioLoad ?? v.cardioLoad) - v.cardioLoad) * ease + wobble(0.2, 0.25, 4);
      v.spo2 += ((target.spo2 ?? v.spo2) - v.spo2) * ease + wobble(0.17, 0.03, 5);
      v.respRate += ((target.respRate ?? v.respRate) - v.respRate) * ease + wobble(0.4, 0.06, 6);
      v.skinTempDelta += ((target.skinTempDelta ?? v.skinTempDelta) - v.skinTempDelta) * ease * 0.5;
      v.steps += this.getLens() === "cardio" ? dt * 2.4 : dt * 0.25;
      v.battery.oura = Math.max(1, v.battery.oura - dt * 0.0006);
      v.battery.watch = Math.max(1, v.battery.watch - dt * 0.0011);

      cb({ ...v, battery: { ...v.battery } });
    }, TICK);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// Polls our own server side proxy. api.ouraring.com is CORS blocked in the
// browser, so the browser only ever talks to /api/oura/daily.
export class OuraSource implements VitalsSource {
  label = "Oura";
  private timer: ReturnType<typeof setInterval> | null = null;
  private aborted = false;

  start(cb: (v: Partial<Vitals>) => void): void {
    this.stop();
    this.aborted = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/oura/daily", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { vitals?: Partial<Vitals> };
        if (!this.aborted && data.vitals && Object.keys(data.vitals).length > 0) {
          cb(data.vitals);
        }
      } catch {
        // Swallow network errors; the stall watchdog handles fallback.
      }
    };
    void poll();
    this.timer = setInterval(poll, 60_000);
  }

  stop(): void {
    this.aborted = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// Bridge for a future iOS WKWebView wrapper. The wrapper evaluates:
//   window.postMessage({ type: "vitalis:vitals", payload: { hr: 62, ... } }, "*")
// with any Partial<Vitals> payload, as often as HealthKit delivers samples.
export class HealthKitBridgeSource implements VitalsSource {
  label = "HealthKit";
  private handler: ((e: MessageEvent) => void) | null = null;

  start(cb: (v: Partial<Vitals>) => void): void {
    this.stop();
    this.handler = (e: MessageEvent) => {
      const data = e.data as { type?: string; payload?: Partial<Vitals> } | null;
      if (data && data.type === "vitalis:vitals" && data.payload && typeof data.payload === "object") {
        cb(data.payload);
      }
    };
    window.addEventListener("message", this.handler);
  }

  stop(): void {
    if (this.handler) window.removeEventListener("message", this.handler);
    this.handler = null;
  }
}
