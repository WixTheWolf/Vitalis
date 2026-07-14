"use client";

// VITALIS observatory: the whole client side engine.
// Three.js scene (fresnel orb, light ring, god rays, particles, device
// anchors), PQRST ECG generator with a beat clock that pulses the orb on
// every R peak, lens palette system via --accent and --accent-rgb, drag
// orbit camera with idle dolly, DOM to 3D projection for device tags, and
// the swappable vitals source adapter.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as THREE from "three";
import {
  DEFAULT_VITALS,
  HealthKitBridgeSource,
  OuraSource,
  SimulatedSource,
  type LensId,
  type Vitals,
  type VitalsSource,
} from "@/lib/vitals";

type SourceKind = "simulated" | "oura" | "healthkit";

export type VitalisObservatoryProps = {
  source?: SourceKind;
  initialLens?: LensId;
};

const LENS_DEFS: Record<LensId, { label: string; accent: string; rgb: string }> = {
  recovery: { label: "Recovery", accent: "#34d2a4", rgb: "52, 210, 164" },
  cardio: { label: "Cardio", accent: "#ff5d73", rgb: "255, 93, 115" },
  sleep: { label: "Sleep", accent: "#8b7bff", rgb: "139, 123, 255" },
};

const LENS_ORDER: LensId[] = ["recovery", "cardio", "sleep"];

const LENS_ICONS: Record<LensId, ReactNode> = {
  recovery: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M5 21c0-9 4.5-16 15-16 0 10.5-5.5 15-12.5 15" />
      <path d="M5 21c3-5.5 7-9.5 11.5-12" />
    </svg>
  ),
  cardio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 8.6c0-2.5-2-4.6-4.5-4.6-1.7 0-3.2 1-4.3 2.4C10.9 5 9.4 4 7.7 4 5.2 4 3.2 6.1 3.2 8.6c0 6 8.8 11.4 8.8 11.4s8.8-5.4 8.8-11.4z" />
    </svg>
  ),
  sleep: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  ),
};

const ORB_VERTEX = /* glsl */ `
uniform float uPulse;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec3 p = position * (1.0 + uPulse * 0.035);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ORB_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uRimPower;
uniform vec3 uColor;
uniform vec3 uLightColor;
uniform vec3 uLightPos;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uRimPower);
  vec3 L = normalize(uLightPos - vWorldPos);
  float lambert = clamp(dot(N, L), 0.0, 1.0);
  float bands = 0.5 + 0.5 * sin(vWorldPos.y * 6.0 + vWorldPos.x * 2.0 - uTime * 0.6);
  vec3 col = uColor * fres * (1.15 + uPulse * 0.9);
  col += uColor * bands * 0.05;
  col += uLightColor * pow(lambert, 1.6) * 0.4;
  col += uColor * uPulse * 0.16;
  float alpha = clamp(fres * 1.35 + 0.07 + uPulse * 0.12, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

function makeGlowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.25, "rgba(255,255,255,0.32)");
  g.addColorStop(0.6, "rgba(255,255,255,0.07)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// PQRST waveform: a sum of five gaussians over one normalized beat phase.
// The R spike sits at phase 0.28; the beat clock fires there.
const R_PHASE = 0.28;
function pqrst(ph: number): number {
  const g = (c: number, w: number, a: number) => a * Math.exp(-((ph - c) * (ph - c)) / (2 * w * w));
  return (
    g(0.16, 0.03, 0.14) +
    g(0.255, 0.012, -0.11) +
    g(R_PHASE, 0.011, 1.0) +
    g(0.305, 0.013, -0.22) +
    g(0.52, 0.05, 0.24)
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Glass card with a gentle pointer tracked 3D tilt, capped at 4 degrees.
// Reduced motion CSS forces transform: none, neutralizing the tilt vars.
function GlassCard({
  index,
  className = "",
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tilt-y", `${(px * 8).toFixed(2)}deg`);
    el.style.setProperty("--tilt-x", `${(-py * 8).toFixed(2)}deg`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div
      ref={ref}
      className={`glass card hud-el ${className}`}
      style={{ "--i": index } as CSSProperties}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </div>
  );
}

export default function VitalisObservatory({
  source = "simulated",
  initialLens = "recovery",
}: VitalisObservatoryProps) {
  const [lens, setLens] = useState<LensId>(initialLens);
  const [display, setDisplay] = useState<Vitals>(() => structuredClone(DEFAULT_VITALS));
  const [stamp, setStamp] = useState("Simulated live stream");
  const [sourceKind, setSourceKind] = useState<SourceKind>("simulated");
  const [introPhase, setIntroPhase] = useState<"boot" | "hold" | "retract" | "done">("boot");
  const [hudReady, setHudReady] = useState(false);
  const [noAnim, setNoAnim] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const ecgRef = useRef<HTMLCanvasElement>(null);
  const tagOuraRef = useRef<HTMLDivElement>(null);
  const tagWatchRef = useRef<HTMLDivElement>(null);
  const lineOuraRef = useRef<SVGLineElement>(null);
  const lineWatchRef = useRef<SVGLineElement>(null);

  const lensRef = useRef<LensId>(initialLens);
  const vitalsRef = useRef<Vitals>(structuredClone(DEFAULT_VITALS));
  const sourceRef = useRef<VitalsSource | null>(null);
  const lastEmitRef = useRef(Date.now());
  const activeKindRef = useRef<SourceKind>("simulated");
  const initialSourceRef = useRef<SourceKind>(source);

  // ----- lens palette: keep --accent and --accent-rgb in sync -----
  useEffect(() => {
    lensRef.current = lens;
    const def = LENS_DEFS[lens];
    document.documentElement.style.setProperty("--accent", def.accent);
    document.documentElement.style.setProperty("--accent-rgb", def.rgb);
  }, [lens]);

  // ----- swappable vitals sources -----
  const startSource = useCallback((kind: SourceKind) => {
    sourceRef.current?.stop();
    const merge = (p: Partial<Vitals>) => {
      lastEmitRef.current = Date.now();
      const v = vitalsRef.current;
      const { battery, ...rest } = p;
      Object.assign(v, rest);
      if (battery) v.battery = { ...v.battery, ...battery };
    };
    let src: VitalsSource;
    if (kind === "oura") src = new OuraSource();
    else if (kind === "healthkit") src = new HealthKitBridgeSource();
    else src = new SimulatedSource(() => lensRef.current);
    sourceRef.current = src;
    activeKindRef.current = kind;
    lastEmitRef.current = Date.now();
    setSourceKind(kind);
    setStamp(kind === "simulated" ? "Simulated live stream" : `Live · ${src.label}`);
    src.start(merge);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oura") === "connected") {
      startSource("oura");
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      startSource(initialSourceRef.current);
    }
    return () => sourceRef.current?.stop();
  }, [startSource]);

  // Stall watchdog: a real source that stays silent for 90 seconds gets
  // replaced by the simulated engine, and the stamp says so.
  useEffect(() => {
    const timer = setInterval(() => {
      if (activeKindRef.current === "simulated") return;
      if (Date.now() - lastEmitRef.current > 90_000) {
        const stalled = sourceRef.current?.label ?? "source";
        startSource("simulated");
        setStamp(`Simulated · ${stalled} stalled`);
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [startSource]);

  // HUD numbers refresh at 2Hz from the mutable vitals object.
  useEffect(() => {
    const timer = setInterval(() => {
      const v = vitalsRef.current;
      setDisplay({ ...v, battery: { ...v.battery } });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // ----- cinematic intro, skipped entirely under reduced motion -----
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNoAnim(true);
      setIntroPhase("done");
      setHudReady(true);
      return;
    }
    const t1 = setTimeout(() => setIntroPhase("hold"), 450);
    const t2 = setTimeout(() => setIntroPhase("retract"), 2650);
    const t3 = setTimeout(() => {
      setIntroPhase("done");
      setHudReady(true);
    }, 3560);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // ----- the Three.js engine -----
  useEffect(() => {
    const stage = stageRef.current;
    const ecgCanvas = ecgRef.current;
    if (!stage || !ecgCanvas) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mql.matches;
    const onMql = () => {
      reduced = mql.matches;
    };
    mql.addEventListener("change", onMql);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06080b, 0.036);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const camTarget = new THREE.Vector3(0, 0.2, 0);

    const amber = new THREE.Color("#ffb46b");
    const accent = new THREE.Color(LENS_DEFS[lensRef.current].accent);
    const accentTarget = new THREE.Color(LENS_DEFS[lensRef.current].accent);

    // Orb: fresnel shell plus additive inner core.
    const orbUniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uRimPower: { value: 2.6 },
      uColor: { value: accent.clone() },
      uLightColor: { value: accent.clone().lerp(amber, 0.4) },
      uLightPos: { value: new THREE.Vector3(0, 1.15, -1.7) },
    };
    const orbMat = new THREE.ShaderMaterial({
      vertexShader: ORB_VERTEX,
      fragmentShader: ORB_FRAGMENT,
      uniforms: orbUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 5), orbMat);
    orb.position.set(0, 0.15, 0);
    scene.add(orb);

    const coreMat = new THREE.MeshBasicMaterial({
      color: accent.clone(),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 3), coreMat);
    core.position.copy(orb.position);
    scene.add(core);

    // Light ring: emissive torus, additive glow sprite, and a real point
    // light parented to the group so it genuinely lights the scene.
    const ringGroup = new THREE.Group();
    ringGroup.position.set(0, 1.15, -1.7);
    ringGroup.rotation.x = THREE.MathUtils.degToRad(12);
    const ringMat = new THREE.MeshBasicMaterial({
      color: accent.clone(),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.05, 24, 220), ringMat);
    ringGroup.add(ring);

    const glowTex = makeGlowTexture();
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: accent.clone(),
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(8.5);
    glow.position.set(0, 0, -0.45);
    ringGroup.add(glow);

    const ringLight = new THREE.PointLight(accent.getHex(), 60, 30, 1.8);
    ringGroup.add(ringLight);
    scene.add(ringGroup);
    scene.add(new THREE.AmbientLight(0x28323e, 0.7));

    // God rays: warm amber regardless of lens so the grade stays filmic.
    const beamDefs = [
      { x: -3.2, z: -3.6, r: 1.7, h: 11, o: 0.05, tilt: 0.2, speed: 0.05 },
      { x: 0.6, z: -4.4, r: 2.3, h: 12, o: 0.032, tilt: -0.1, speed: -0.034 },
      { x: 3.4, z: -3.2, r: 1.5, h: 10, o: 0.06, tilt: 0.26, speed: 0.068 },
    ];
    const beams: THREE.Mesh[] = [];
    for (const d of beamDefs) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb46b,
        transparent: true,
        opacity: d.o,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(new THREE.ConeGeometry(d.r, d.h, 24, 1, true), mat);
      beam.position.set(d.x, 2.4, d.z);
      beam.rotation.z = d.tilt;
      scene.add(beam);
      beams.push(beam);
    }

    // Atmosphere particles, denser inside the beam volumes.
    const COUNT = window.innerWidth < 700 ? 380 : 720;
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      if (i % 5 < 3) {
        const d = beamDefs[i % beamDefs.length];
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * d.r * 0.85;
        positions[i * 3] = d.x + Math.cos(a) * rr;
        positions[i * 3 + 1] = -2.5 + Math.random() * 9.5;
        positions[i * 3 + 2] = d.z + Math.sin(a) * rr;
      } else {
        positions[i * 3] = (Math.random() - 0.5) * 14;
        positions[i * 3 + 1] = -3 + Math.random() * 9;
        positions[i * 3 + 2] = -6 + Math.random() * 9;
      }
      speeds[i] = 0.05 + Math.random() * 0.16;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffd9ae,
      size: 0.035,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Device anchors: standard materials so the ring light actually hits them.
    const ouraAnchor = new THREE.Group();
    const ouraMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.045, 24, 48),
      new THREE.MeshStandardMaterial({ color: 0xc9ccd4, metalness: 0.9, roughness: 0.25 }),
    );
    ouraMesh.rotation.x = 1.05;
    ouraAnchor.add(ouraMesh);
    ouraAnchor.position.set(-2.25, -0.55, 0.7);
    scene.add(ouraAnchor);

    const watchAnchor = new THREE.Group();
    const watchBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.21, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x22262d, metalness: 0.7, roughness: 0.35 }),
    );
    const watchScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x0c1218 }),
    );
    watchScreen.position.z = 0.037;
    watchAnchor.add(watchBody, watchScreen);
    watchAnchor.rotation.y = -0.5;
    watchAnchor.position.set(2.3, -0.1, 0.6);
    scene.add(watchAnchor);

    // Camera controls: damped drag orbit, wheel dolly, idle sinusoidal drift.
    let theta = 0.55;
    let phi = 1.32;
    let radius = 7.4;
    let thetaT = 0;
    let phiT = phi;
    let radiusT = radius;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastInteract = 0;
    let driftT = 0;
    let driftAmp = 0;

    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      lastInteract = performance.now();
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      thetaT -= (e.clientX - lastX) * 0.005;
      phiT = clamp(phiT - (e.clientY - lastY) * 0.004, 0.72, 1.85);
      lastX = e.clientX;
      lastY = e.clientY;
      lastInteract = performance.now();
    };
    const onUp = () => {
      dragging = false;
      lastInteract = performance.now();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radiusT = clamp(radiusT + e.deltaY * 0.004, 4.8, 11);
      lastInteract = performance.now();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    // Inverse mouse parallax for the ghosted wordmark.
    const mouse = { x: 0, y: 0 };
    let wordX = 0;
    let wordY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMouseMove);

    // Sizing
    let w = 1;
    let h = 1;
    const resize = () => {
      w = stage.clientWidth || 1;
      h = stage.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const wrap = ecgCanvas.parentElement;
      if (wrap) {
        const dpr = Math.min(window.devicePixelRatio, 2);
        ecgCanvas.width = Math.max(1, Math.floor(wrap.clientWidth * dpr));
        ecgCanvas.height = Math.max(1, Math.floor(wrap.clientHeight * dpr));
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // ECG state: a scrolling ring buffer of waveform samples.
    const ecgCtx = ecgCanvas.getContext("2d");
    const SAMPLES_PER_PX = 2;
    const PX_PER_SEC = 110;
    const ecgSamples: number[] = [];
    let sampleCarry = 0;

    // Beat clock: unwrapped phase, R peak crossings fire the pulse.
    let phaseAbs = 0;
    let pulse = 0;

    const worldV = new THREE.Vector3();
    const projectTag = (
      obj: THREE.Object3D,
      tag: HTMLDivElement | null,
      line: SVGLineElement | null,
      dx: number,
      dy: number,
    ) => {
      if (!tag || !line) return;
      obj.getWorldPosition(worldV).project(camera);
      const sx = (worldV.x * 0.5 + 0.5) * w;
      const sy = (-worldV.y * 0.5 + 0.5) * h;
      const visible = worldV.z < 1 && sx > -80 && sx < w + 80 && sy > -80 && sy < h + 80;
      tag.style.visibility = visible ? "visible" : "hidden";
      line.style.visibility = visible ? "visible" : "hidden";
      if (!visible) return;
      const tagW = tag.offsetWidth || 160;
      const cx = clamp(sx + dx, 8, Math.max(8, w - tagW - 8));
      const cy = clamp(sy + dy, 96, h - 24);
      tag.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      line.setAttribute("x1", sx.toFixed(1));
      line.setAttribute("y1", sy.toFixed(1));
      line.setAttribute("x2", (cx + 10).toFixed(1));
      line.setAttribute("y2", (cy + 2).toFixed(1));
    };

    const drawEcg = (dt: number) => {
      if (!ecgCtx) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const cw = ecgCanvas.width;
      const ch = ecgCanvas.height;
      const cap = Math.ceil((cw / dpr) * SAMPLES_PER_PX);

      sampleCarry += dt * PX_PER_SEC * SAMPLES_PER_PX;
      const n = Math.floor(sampleCarry);
      sampleCarry -= n;
      const ph = phaseAbs % 1;
      for (let i = 0; i < n; i++) {
        ecgSamples.push(pqrst(ph) + (Math.random() - 0.5) * 0.016);
      }
      while (ecgSamples.length > cap) ecgSamples.shift();

      ecgCtx.clearRect(0, 0, cw, ch);
      const base = ch * 0.62;
      ecgCtx.strokeStyle = "rgba(255,255,255,0.06)";
      ecgCtx.lineWidth = 1;
      ecgCtx.beginPath();
      ecgCtx.moveTo(0, base);
      ecgCtx.lineTo(cw, base);
      ecgCtx.stroke();

      const accentCss = `#${accent.getHexString()}`;
      ecgCtx.strokeStyle = accentCss;
      ecgCtx.lineWidth = 1.5 * dpr;
      ecgCtx.lineJoin = "round";
      ecgCtx.shadowColor = accentCss;
      ecgCtx.shadowBlur = 7 * dpr;
      ecgCtx.beginPath();
      const xOffset = cw - (ecgSamples.length / SAMPLES_PER_PX) * dpr;
      for (let i = 0; i < ecgSamples.length; i++) {
        const x = xOffset + (i / SAMPLES_PER_PX) * dpr;
        const y = base - ecgSamples[i] * ch * 0.42;
        if (i === 0) ecgCtx.moveTo(x, y);
        else ecgCtx.lineTo(x, y);
      }
      ecgCtx.stroke();
      ecgCtx.shadowBlur = 0;
    };

    const clock = new THREE.Clock();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const v = vitalsRef.current;

      // Lens accent cross fade, shared by every 3D accent consumer.
      accentTarget.set(LENS_DEFS[lensRef.current].accent);
      accent.lerp(accentTarget, 1 - Math.exp(-dt * 3));
      orbUniforms.uColor.value.copy(accent);
      orbUniforms.uLightColor.value.copy(accent).lerp(amber, 0.4);
      coreMat.color.copy(accent);
      ringMat.color.copy(accent);
      glowMat.color.copy(accent);
      ringLight.color.copy(accent);

      // Beat clock: link ECG R peaks to the orb pulse.
      const hr = clamp(v.hr, 30, 200);
      const before = Math.floor(phaseAbs - R_PHASE);
      phaseAbs += dt / (60 / hr);
      if (Math.floor(phaseAbs - R_PHASE) > before) pulse = 1;
      pulse *= Math.exp(-dt * 3.4);
      orbUniforms.uPulse.value = reduced ? pulse * 0.2 : pulse;
      orbUniforms.uTime.value = t;

      if (!reduced) orb.rotation.y += dt * 0.05;

      // The ring breathes with the beat and drives the light.
      ring.scale.setScalar(1 + (reduced ? 0 : Math.sin(t * 0.8) * 0.01) + pulse * 0.02);
      glowMat.opacity = 0.42 + pulse * 0.22;
      ringLight.intensity = 55 + pulse * 40;
      ringGroup.getWorldPosition(orbUniforms.uLightPos.value);

      if (!reduced) {
        beams.forEach((b, i) => {
          b.rotation.y += dt * beamDefs[i].speed;
        });
        const pos = particleGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < COUNT; i++) {
          let y = pos.getY(i) + speeds[i] * dt;
          if (y > 7) y = -3;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
        ouraAnchor.position.y = -0.55 + Math.sin(t * 0.7) * 0.06;
        ouraAnchor.rotation.y += dt * 0.3;
        watchAnchor.position.y = -0.1 + Math.sin(t * 0.6 + 2) * 0.06;
      }

      // Orbit damping plus the idle dolly drift (about 20s period), which
      // eases out while dragging and is off entirely under reduced motion.
      const idle = !dragging && performance.now() - lastInteract > 3000 && !reduced;
      driftAmp += ((idle ? 1 : 0) - driftAmp) * Math.min(1, dt * 1.4);
      if (idle) driftT += dt;
      const k = Math.min(1, dt * 7);
      theta += (thetaT - theta) * k;
      phi += (phiT - phi) * k;
      radius += (radiusT - radius) * k;
      const rEff = radius + Math.sin((driftT * Math.PI * 2) / 20) * 0.13 * driftAmp;
      camera.position.set(
        camTarget.x + rEff * Math.sin(phi) * Math.sin(theta),
        camTarget.y + rEff * Math.cos(phi),
        camTarget.z + rEff * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(camTarget);

      // Ghosted wordmark inverse parallax, up to 24px.
      const word = wordRef.current;
      if (word) {
        if (!reduced) {
          wordX += (-mouse.x * 24 - wordX) * Math.min(1, dt * 4);
          wordY += (-mouse.y * 24 - wordY) * Math.min(1, dt * 4);
        }
        word.style.transform = `translate3d(${wordX.toFixed(2)}px, ${wordY.toFixed(2)}px, 0)`;
      }

      projectTag(ouraAnchor, tagOuraRef.current, lineOuraRef.current, 36, -52);
      projectTag(watchAnchor, tagWatchRef.current, lineWatchRef.current, 30, -60);

      drawEcg(dt);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      mql.removeEventListener("change", onMql);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      glowTex.dispose();
      glowMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === stage) stage.removeChild(renderer.domElement);
    };
  }, []);

  const connectOura = () => {
    window.location.href = "/api/oura/auth";
  };

  const fmtDelta = (d: number) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}`;
  const rootClass = [
    "vitalis-root",
    hudReady ? "hud-ready" : "",
    noAnim ? "no-anim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <div className="bg" />
      <div className="wordmark" aria-hidden="true">
        <span ref={wordRef}>VITALIS</span>
      </div>
      <div className="stage" ref={stageRef} aria-label="3D biometric scene" role="img" />

      <svg className="leaders" aria-hidden="true">
        <line ref={lineOuraRef} stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
        <line ref={lineWatchRef} stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
      </svg>

      <div className="tag" ref={tagOuraRef}>
        <div className="tag-card glass">
          <div className="tag-name">
            <span className="tag-dot" />
            Oura Ring
          </div>
          <div className="tag-meta">{Math.round(display.battery.oura)}% · Signal strong</div>
        </div>
      </div>
      <div className="tag" ref={tagWatchRef}>
        <div className="tag-card glass">
          <div className="tag-name">
            <span className="tag-dot" />
            Apple Watch
          </div>
          <div className="tag-meta">{Math.round(display.battery.watch)}% · Paired</div>
        </div>
      </div>

      <div className="grade" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar hud-el" style={{ "--i": 0 } as CSSProperties}>
        <div className="brand">
          <span className="brand-name">VITALIS</span>
          <span className="brand-sub">Biometric Observatory</span>
        </div>
        <div className="top-actions">
          <div className="stamp glass" role="status">
            <span className="stamp-dot" />
            {stamp}
          </div>
          {sourceKind !== "oura" && (
            <button type="button" className="connect-btn glass" onClick={connectOura}>
              Connect Oura
            </button>
          )}
        </div>
      </header>

      <div className="cards">
        <aside className="col col-left">
          <GlassCard index={1}>
            <div className="metric-label">Heart rate</div>
            <div className="metric-value accent">
              {Math.round(display.hr)}
              <span className="metric-unit">bpm</span>
            </div>
            <div className="metric-foot">R peak sync · beat clock</div>
          </GlassCard>
          <GlassCard index={2}>
            <div className="metric-row">
              <div className="metric-cell">
                <div className="metric-label">HRV</div>
                <div className="metric-value">
                  {Math.round(display.hrv)}
                  <span className="metric-unit">ms</span>
                </div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">RHR</div>
                <div className="metric-value">
                  {Math.round(display.rhr)}
                  <span className="metric-unit">bpm</span>
                </div>
              </div>
            </div>
          </GlassCard>
          <GlassCard index={3}>
            <div className="metric-row">
              <div className="metric-cell">
                <div className="metric-label">SpO2</div>
                <div className="metric-value">
                  {display.spo2.toFixed(1)}
                  <span className="metric-unit">%</span>
                </div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Resp</div>
                <div className="metric-value">
                  {display.respRate.toFixed(1)}
                  <span className="metric-unit">/min</span>
                </div>
              </div>
            </div>
            <div className="metric-foot">Skin temp {fmtDelta(display.skinTempDelta)} °C</div>
          </GlassCard>
        </aside>

        <aside className="col col-right">
          <GlassCard index={4}>
            <div className="metric-label">Readiness</div>
            <div className="metric-value accent">
              {Math.round(display.readiness)}
              <span className="metric-unit">/100</span>
            </div>
          </GlassCard>
          <GlassCard index={5}>
            <div className="metric-label">Sleep</div>
            <div className="metric-value">
              {display.sleepHours.toFixed(1)}
              <span className="metric-unit">h</span>
            </div>
            <div className="metric-foot">Score {Math.round(display.sleepScore)} /100</div>
          </GlassCard>
          <GlassCard index={6}>
            <div className="metric-row">
              <div className="metric-cell">
                <div className="metric-label">Cardio load</div>
                <div className="metric-value">{Math.round(display.cardioLoad)}</div>
              </div>
              <div className="metric-cell">
                <div className="metric-label">Steps</div>
                <div className="metric-value">{Math.round(display.steps).toLocaleString("en-US")}</div>
              </div>
            </div>
          </GlassCard>
        </aside>
      </div>

      <nav className="dock glass hud-el" style={{ "--i": 7 } as CSSProperties} aria-label="Lens switcher">
        {LENS_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={lens === id ? "active" : ""}
            aria-pressed={lens === id}
            onClick={() => setLens(id)}
          >
            {LENS_ICONS[id]}
            <span>{LENS_DEFS[id].label}</span>
          </button>
        ))}
      </nav>

      <div className="ecg-wrap hud-el" style={{ "--i": 8 } as CSSProperties}>
        <canvas ref={ecgRef} aria-label="Live electrocardiogram trace" role="img" />
      </div>

      {introPhase !== "done" && (
        <div
          className={`intro ${introPhase === "retract" ? "retract" : ""} ${introPhase !== "boot" ? "lift" : ""}`}
          aria-hidden="true"
        >
          <div className="intro-veil" />
          <div className="intro-bar top" />
          <div className="intro-bar bottom" />
          {introPhase !== "boot" && (
            <>
              <div className="intro-title">VITALIS</div>
              <div className="intro-sub">Biometric Observatory</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
