"use client";

import { Button, EASE, Eyebrow, MONO, Section } from "@/components/landing/ui";
import {
  type Icon,
  IconActivity,
  IconArrowRight,
  IconRefresh,
  IconRoute,
  IconWorld,
} from "@tabler/icons-react";
import DottedMap from "dotted-map";
import {
  AnimatePresence,
  type MotionValue,
  animate,
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type Lab = {
  lab: string;
  place: string;
  models: number;
  lat: number;
  lng: number;
};

const LABS: Lab[] = [
  {
    lab: "Anthropic",
    place: "San Francisco",
    models: 8,
    lat: 37.77,
    lng: -122.42,
  },
  { lab: "OpenAI", place: "San Francisco", models: 6, lat: 37.79, lng: -122.4 },
  { lab: "Google DeepMind", place: "London", models: 5, lat: 51.5, lng: -0.12 },
  { lab: "Groq", place: "Mountain View", models: 4, lat: 37.42, lng: -122.08 },
  { lab: "DeepSeek", place: "Hangzhou", models: 3, lat: 30.25, lng: 120.17 },
  { lab: "Moonshot AI", place: "Beijing", models: 2, lat: 39.9, lng: 116.4 },
];

const FEATURES: { icon: Icon; title: string; body: string }[] = [
  {
    icon: IconRoute,
    title: "One thread, any model",
    body: "Switch between Claude, GPT, Gemini, DeepSeek and more without starting over.",
  },
  {
    icon: IconWorld,
    title: "History that fits each model",
    body: "When you switch, Void Agent adapts the conversation and tool calls so the next model can read them.",
  },
  {
    icon: IconRefresh,
    title: "Automatic fallback",
    body: "If a model fails mid-reply, Void Agent retries on a backup model so the task keeps moving.",
  },
  {
    icon: IconActivity,
    title: "The right model per task",
    body: "Use a fast model for drafts and a reasoning model for the hard parts, in the same chat.",
  },
];

const MAP = (() => {
  const map = new DottedMap({ height: 92, grid: "vertical" });
  const { width, height } = map.image;
  const mask = new Uint8Array(width * height);
  for (const point of map.getPoints()) mask[point.y * width + point.x] = 255;
  const pins = LABS.map((lab) => {
    const pin = map.getPin({ lat: lab.lat, lng: lab.lng });
    return pin
      ? { u: (pin.x + 0.5) / width, v: (pin.y + 0.5) / height }
      : { u: 0.5, v: 0.5 };
  });
  return { width, height, mask, pins };
})();

const CYCLE_MS = 3600;
const LIVE = LABS.map((_, i) => i);
const CAMERA_SPRING = {
  stiffness: 26,
  damping: 14,
  mass: 1,
  restDelta: 0.00001,
  restSpeed: 0.00001,
};
const DEFAULT_VIEW = { w: 1440, h: 780 };

const zoomFor = (width: number) =>
  width < 640 ? 2.4 : width < 1024 ? 1.8 : 1.35;
const focusFor = (width: number) =>
  width < 1024 ? { x: 0.5, y: 0.55 } : { x: 0.62, y: 0.56 };

function cameraTarget(pin: { u: number; v: number }, vw: number, vh: number) {
  const mapW = vw * zoomFor(vw);
  const mapH = (mapW * MAP.height) / MAP.width;
  const focus = focusFor(vw);
  const clamp = (value: number, half: number) =>
    half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, value));
  return {
    u: clamp(pin.u - ((focus.x - 0.5) * vw) / mapW, vw / 2 / mapW),
    v: clamp(pin.v - ((focus.y - 0.5) * vh) / mapH, vh / 2 / mapH),
  };
}

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uMapSize;
uniform vec2 uCam;
uniform vec2 uGrid;
uniform sampler2D uMask;
uniform float uTime;
uniform float uMotion;
uniform vec2 uFocus;
uniform float uFocusAmt;
uniform float uDpr;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = (px - uRes * 0.5) / uMapSize + uCam;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

  vec2 g = uv * uGrid;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float land = texture2D(uMask, (cell + 0.5) / uGrid).r;
  if (land < 0.5) discard;

  vec2 center = (cell + 0.5) / uGrid;
  vec2 aspect = vec2(uGrid.x / uGrid.y, 1.0);
  float h = hash(cell);
  float h2 = hash(cell + 17.31);
  float h3 = hash(cell + 91.7);

  float base = 0.06 + 0.14 * h;
  float blip = pow(max(0.0, sin(uTime * (0.3 + h2 * 1.3) + h * 60.0)), 30.0) * uMotion;
  float hot = step(0.93, h3);

  float sweepX = fract(uTime * 0.02) * 1.6 - 0.3;
  float sweep = exp(-pow((uv.x - sweepX) * 6.0, 2.0)) * 0.1 * uMotion;

  float lum = base + blip * (0.5 + hot * 0.35) + sweep;
  float size = 0.2 + 0.07 * h + blip * 0.1;
  float alpha = smoothstep(size, size - 0.07, length(f)) * clamp(lum, 0.0, 1.0);

  vec2 fromFocus = (center - uFocus) * uMapSize / uDpr;
  float boxX = smoothstep(-56.0, -20.0, fromFocus.x) * (1.0 - smoothstep(210.0, 270.0, fromFocus.x));
  float boxY = 1.0 - smoothstep(16.0, 46.0, abs(fromFocus.y));
  alpha *= 1.0 - 0.9 * boxX * boxY * uFocusAmt;

  vec3 paper = vec3(0.949, 0.937, 0.914);
  vec3 brand = vec3(0.0, 0.6, 1.0);
  float warm = clamp(blip * hot, 0.0, 1.0);
  vec3 color = mix(paper, brand, warm);

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

type Camera = {
  u: MotionValue<number>;
  v: MotionValue<number>;
  vw: MotionValue<number>;
  vh: MotionValue<number>;
};

function useDotShader({
  canvasRef,
  camera,
  active,
  reduceMotion,
  inView,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  camera: Camera;
  active: number;
  reduceMotion: boolean;
  inView: boolean;
}) {
  const glRef = useRef<{
    gl: WebGLRenderingContext;
    uniforms: Record<string, WebGLUniformLocation | null>;
  } | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!gl) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      MAP.width,
      MAP.height,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      MAP.mask,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const uniforms = Object.fromEntries(
      [
        "uRes",
        "uMapSize",
        "uCam",
        "uGrid",
        "uMask",
        "uTime",
        "uMotion",
        "uFocus",
        "uFocusAmt",
        "uDpr",
      ].map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    gl.uniform2f(uniforms.uGrid, MAP.width, MAP.height);
    gl.uniform1i(uniforms.uMask, 0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    glRef.current = { gl, uniforms };
    return () => {
      observer.disconnect();
      glRef.current = null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [canvasRef]);

  const focusAmt = useMotionValue(1);

  useEffect(() => {
    if (reduceMotion) {
      focusAmt.jump(1);
      return;
    }
    focusAmt.jump(0);
    const controls = animate(focusAmt, 1, {
      duration: 0.5,
      ease: EASE,
      delay: 0.15,
    });
    return () => controls.stop();
  }, [active, reduceMotion, focusAmt]);

  useAnimationFrame(() => {
    const ctx = glRef.current;
    if (!ctx || !inView) return;
    const { gl, uniforms } = ctx;
    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const vw = camera.vw.get();
    const mapW = vw * zoomFor(vw);
    const now = performance.now() / 1000;
    gl.uniform2f(
      uniforms.uMapSize,
      mapW * dpr,
      ((mapW * MAP.height) / MAP.width) * dpr,
    );
    gl.uniform2f(uniforms.uCam, camera.u.get(), camera.v.get());
    gl.uniform1f(uniforms.uTime, reduceMotion ? 0 : now);
    gl.uniform1f(uniforms.uMotion, reduceMotion ? 0 : 1);
    gl.uniform1f(uniforms.uDpr, dpr);
    gl.uniform2f(uniforms.uFocus, MAP.pins[active].u, MAP.pins[active].v);
    gl.uniform1f(uniforms.uFocusAmt, focusAmt.get());
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  });
}

export function Network() {
  const reduceMotion = !!useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const inView = useInView(viewRef, { margin: "200px" });
  const [active, setActive] = useState(LIVE[0]);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(false);

  const start = cameraTarget(MAP.pins[LIVE[0]], DEFAULT_VIEW.w, DEFAULT_VIEW.h);
  const vw = useMotionValue(DEFAULT_VIEW.w);
  const vh = useMotionValue(DEFAULT_VIEW.h);
  const camU = useSpring(start.u, CAMERA_SPRING);
  const camV = useSpring(start.v, CAMERA_SPRING);
  const camera: Camera = { u: camU, v: camV, vw, vh };

  useDotShader({ canvasRef, camera, active, reduceMotion, inView });

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      vw.set(entry.contentRect.width);
      vh.set(entry.contentRect.height);
      const target = cameraTarget(
        MAP.pins[active],
        entry.contentRect.width,
        entry.contentRect.height,
      );
      camU.jump(target.u);
      camV.jump(target.v);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const target = cameraTarget(MAP.pins[active], vw.get(), vh.get());
    if (reduceMotion) {
      camU.jump(target.u);
      camV.jump(target.v);
    } else {
      camU.set(target.u);
      camV.set(target.v);
    }
  }, [active, reduceMotion, camU, camV, vw, vh]);

  useEffect(() => {
    if (reduceMotion || paused || manual || !inView) return;
    const timer = setInterval(() => {
      setActive((current) => LIVE[(LIVE.indexOf(current) + 1) % LIVE.length]);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, paused, manual, inView]);

  const lab = LABS[active];

  return (
    <Section
      id="network"
      labelledBy={`${id}-heading`}
      className="relative overflow-hidden pb-24 sm:pb-32"
    >
      <div className="relative">
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-10">
          <div className="lg:pointer-events-auto lg:max-w-xl">
            <Eyebrow>Multi-model</Eyebrow>
            <h2
              id={`${id}-heading`}
              className="mt-6 max-w-[20ch] text-4xl tracking-tight text-balance sm:text-5xl"
            >
              Every frontier lab, one <br className="max-sm:hidden" />
              workspace
            </h2>
            <Button
              href="#models"
              variant="secondary"
              scheme="dark"
              size="lg"
              rounded
              className="mt-10"
            >
              See the models
              <IconArrowRight data-icon="inline-end" aria-hidden />
            </Button>
          </div>
        </div>

        <div
          ref={viewRef}
          className="relative mt-10 h-[520px] overflow-hidden sm:h-[640px] lg:mt-0 lg:h-[820px]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="World map of the AI labs whose models run in Void Agent, across the United States, the United Kingdom and China. Dots blink as messages are answered."
            className="absolute inset-0 size-full [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_82%,transparent),linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] [mask-composite:intersect]"
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 bg-radial-[at_15%_20%] from-(--ink) from-10% to-transparent to-60% lg:block" />

          {LABS.map((item, i) => (
            <LabMarker
              key={item.lab}
              lab={item}
              pin={MAP.pins[i]}
              camera={camera}
              active={i === active}
              reduceMotion={reduceMotion}
              onSelect={() => {
                setActive(i);
                setManual(true);
              }}
              onFocusChange={setPaused}
            />
          ))}

          <div className="pointer-events-none absolute inset-x-0 bottom-8">
            <div className="mx-auto flex max-w-7xl items-end justify-end gap-6 px-6">
              <div className="flex gap-8 sm:gap-10">
                <Readout label="Models in one workspace">30+</Readout>
                <Readout label="AI labs">12</Readout>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {lab.lab}, {lab.place}, {lab.models} model families in the Void Agent
        catalog.
      </p>

      <div className="mx-auto max-w-7xl px-6">
        <ul
          role="list"
          className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4"
        >
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <feature.icon
                className="size-5 text-(--brand)"
                stroke={1.5}
                aria-hidden
              />
              <p className="mt-5 text-base font-medium text-(--paper)">
                {feature.title}
              </p>
              <p className="mt-2 max-w-[34ch] text-base text-pretty text-(--paper)/55">
                {feature.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function LabMarker({
  lab,
  pin,
  camera,
  active,
  reduceMotion,
  onSelect,
  onFocusChange,
}: {
  lab: Lab;
  pin: { u: number; v: number };
  camera: Camera;
  active: boolean;
  reduceMotion: boolean;
  onSelect: () => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const x = useTransform(() => {
    const vw = camera.vw.get();
    return (pin.u - camera.u.get()) * vw * zoomFor(vw) + vw / 2;
  });
  const y = useTransform(() => {
    const vw = camera.vw.get();
    const mapH = (vw * zoomFor(vw) * MAP.height) / MAP.width;
    return (pin.v - camera.v.get()) * mapH + camera.vh.get() / 2;
  });

  return (
    <motion.button
      type="button"
      aria-label={`${lab.lab}, ${lab.place}, ${lab.models} model families`}
      aria-pressed={active}
      onClick={onSelect}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      className="absolute top-0 left-0 grid size-8 -translate-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-(--paper)"
      style={{ x, y }}
    >
      <motion.span
        className="relative block text-(--brand)"
        initial={false}
        animate={{ scale: active ? 1.4 : 1, opacity: active ? 1 : 0.55 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        <Hexagon className="size-3.5" />
      </motion.span>
      <AnimatePresence initial={false}>
        {active && (
          <motion.span
            initial={{ opacity: 0, x: reduceMotion ? 0 : -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="pointer-events-none absolute top-1/2 left-full ml-1.5 -translate-y-1/2 text-sm font-medium tracking-wider whitespace-nowrap text-(--brand) uppercase"
            style={MONO}
          >
            <Shimmer reduceMotion={reduceMotion}>{lab.lab}</Shimmer>
            <span className="ml-3 text-(--paper)/65 tabular-nums">
              {lab.models} families
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function Shimmer({
  children,
  reduceMotion,
}: { children: ReactNode; reduceMotion: boolean }) {
  if (reduceMotion) return <span>{children}</span>;
  return (
    <motion.span
      className="bg-clip-text text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(100deg, var(--brand) 0%, var(--brand) 40%, #e6f5ff 50%, var(--brand) 60%, var(--brand) 100%)",
        backgroundSize: "250% 100%",
      }}
      initial={{ backgroundPosition: "100% 0%" }}
      animate={{ backgroundPosition: "-50% 0%" }}
      transition={{
        duration: 1.8,
        ease: "easeInOut",
        repeat: Infinity,
        repeatDelay: 0.8,
      }}
    >
      {children}
    </motion.span>
  );
}

function Hexagon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 2.2 20.5 7.1v9.8L12 21.8 3.5 16.9V7.1Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-right">
      <p className="text-xs text-(--paper)/45">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight text-(--paper) tabular-nums">
        {children}
      </p>
    </div>
  );
}
