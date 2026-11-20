"use client";

import { Button, EASE, Section } from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import {
  type Icon,
  IconBookmarks,
  IconBox,
  IconBrandGithub,
  IconCalendar,
  IconCheck,
  IconCpu,
  IconGripVertical,
  IconMessage2,
  IconMessageCircle,
  IconPlug,
  IconRocket,
} from "@tabler/icons-react";
import {
  AnimatePresence,
  motion,
  useAnimate,
  useAnimationFrame,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type Kind = "model" | "sandbox" | "tools" | "prompt";
type DestId = "chat" | "github" | "library" | "schedules";
type NodeId = Kind | DestId | "target";
type Point = { x: number; y: number };

const STAGE = { w: 1520, h: 560 };
const BRAND = "#0099ff";
const LANES = [16, 192, 368, 544];
const DASHED_GRID = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="104" height="104"><g fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="4 4"><path d="M0.5 0V104"/><path d="M0 0.5H104"/></g></svg>',
)}")`;
const TARGET_ROW = 56;
const NODE_W = 232;
const HEADER = 44;
const BODY = 52;
const OUT_ROW = 36;
const NODE_H = HEADER + BODY + OUT_ROW + 12;
const TARGET = { w: 256, h: 6 + 38 + 12 + TARGET_ROW * 4 + 12 + 48 + 6 };
const SNAP = 72;
const NUDGE = 16;

const STRING_SPRING = { stiffness: 140, damping: 7, mass: 1 };

const COLORS: Record<Kind, string> = {
  model: "#f0b24a",
  sandbox: "#ef7a45",
  tools: "#e8578f",
  prompt: "#9b87f5",
};

const INPUTS: Kind[] = ["model", "sandbox", "tools", "prompt"];
const DEFAULT_CONNECTED: Kind[] = ["model"];

const INPUT_LABELS: Record<Kind, string> = {
  model: "Model",
  sandbox: "Sandbox",
  tools: "Tools",
  prompt: "Instructions",
};

type Source = {
  kind: Kind;
  title: string;
  icon: Icon;
  content: ReactNode;
};

const SOURCES: Source[] = [
  {
    kind: "model",
    title: "Model",
    icon: IconBox,
    content: (
      <Meta
        primary="claude-sonnet-5.5"
        secondary="30+ models, switch any time"
      />
    ),
  },
  {
    kind: "sandbox",
    title: "Sandbox",
    icon: IconCpu,
    content: (
      <Meta primary="E2B Linux sandbox" secondary="Node.js, Python, git" />
    ),
  },
  {
    kind: "tools",
    title: "Tools",
    icon: IconPlug,
    content: (
      <div className="flex flex-wrap gap-1">
        {["github", "notion", "web-search", "slack"].map((tool) => (
          <span
            key={tool}
            className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-(--paper)/70 ring-1 ring-white/5"
          >
            {tool}
          </span>
        ))}
      </div>
    ),
  },
  {
    kind: "prompt",
    title: "Instructions",
    icon: IconMessage2,
    content: (
      <p className="rounded-lg bg-black/25 px-3 py-1.5 text-xs/5 text-(--paper)/70 ring-1 ring-white/5">
        Triage the inbox and label each bug by severity.
      </p>
    ),
  },
];

type Destination = {
  id: DestId;
  title: string;
  icon: Icon;
  primary: string;
  secondary: string;
};

const DESTINATIONS: Destination[] = [
  {
    id: "chat",
    title: "Chat thread",
    icon: IconMessageCircle,
    primary: "Answers with sources",
    secondary: "In your workspace",
  },
  {
    id: "github",
    title: "GitHub",
    icon: IconBrandGithub,
    primary: "Fixes become pull requests",
    secondary: "Via your MCP server",
  },
  {
    id: "library",
    title: "Library",
    icon: IconBookmarks,
    primary: "Saves what it learned",
    secondary: "Searchable memory",
  },
  {
    id: "schedules",
    title: "Schedules",
    icon: IconCalendar,
    primary: "Every weekday at 9:00",
    secondary: "Runs on its own",
  },
];

const mirror = (x: number) => STAGE.w - x - NODE_W;

const INITIAL_POSITIONS: Record<NodeId, Point> = {
  model: { x: 300, y: LANES[0] + 16 },
  sandbox: { x: 40, y: LANES[1] + 16 },
  tools: { x: 340, y: LANES[1] + 16 },
  prompt: { x: 320, y: LANES[2] + 16 },
  target: { x: (STAGE.w - TARGET.w) / 2, y: 110 },
  chat: { x: mirror(300), y: LANES[0] + 16 },
  github: { x: mirror(340), y: LANES[1] + 16 },
  library: { x: mirror(40), y: LANES[1] + 16 },
  schedules: { x: mirror(320), y: LANES[2] + 16 },
};

const NODE_SIZE = { w: NODE_W, h: NODE_H };

const SIZES: Record<NodeId, { w: number; h: number }> = {
  model: NODE_SIZE,
  sandbox: NODE_SIZE,
  tools: NODE_SIZE,
  prompt: NODE_SIZE,
  target: TARGET,
  chat: NODE_SIZE,
  github: NODE_SIZE,
  library: NODE_SIZE,
  schedules: NODE_SIZE,
};

const clampPosition = (id: NodeId, p: Point): Point => ({
  x: Math.min(Math.max(0, p.x), STAGE.w - SIZES[id].w),
  y: Math.min(Math.max(0, p.y), STAGE.h - SIZES[id].h),
});

const outputPoint = (p: Point) => ({
  x: p.x + NODE_W,
  y: p.y + HEADER + BODY + OUT_ROW / 2,
});

const rowY = (index: number, target: Point) =>
  target.y + HEADER + 12 + index * TARGET_ROW + TARGET_ROW / 2;

const inputPoint = (kind: Kind, target: Point) => ({
  x: target.x,
  y: rowY(INPUTS.indexOf(kind), target),
});

const endpointOutput = (index: number, target: Point) => ({
  x: target.x + TARGET.w,
  y: rowY(index, target),
});

const destInput = (p: Point) => ({
  x: p.x,
  y: p.y + HEADER + BODY + OUT_ROW / 2,
});

const handles = (a: Point, b: Point) => {
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.5);
  return { c1: { x: a.x + dx, y: a.y }, c2: { x: b.x - dx, y: b.y } };
};

const cable = (a: Point, b: Point) => {
  const { c1, c2 } = handles(a, b);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
};

const cableMid = (a: Point, b: Point) => {
  const { c1, c2 } = handles(a, b);
  return {
    x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8,
    y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8,
  };
};

const restSag = (a: Point, b: Point) =>
  Math.min(56, Math.hypot(b.x - a.x, b.y - a.y) * 0.09);

const stringPath = (a: Point, b: Point, mid: Point) => {
  const { c1, c2 } = handles(a, b);
  const g = cableMid(a, b);
  const ox = ((mid.x - g.x) * 4) / 3;
  const oy = ((mid.y - g.y) * 4) / 3;
  const f = (n: number) => n.toFixed(1);
  return `M ${f(a.x)} ${f(a.y)} C ${f(c1.x + ox)} ${f(c1.y + oy)}, ${f(c2.x + ox)} ${f(c2.y + oy)}, ${f(b.x)} ${f(b.y)}`;
};

type Drag = { kind: Kind; x: number; y: number; moved: boolean };
type Hover = { kind: Kind; valid: boolean } | null;

export function Workflows() {
  const reduceMotion = useReducedMotion();
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [connected, setConnected] = useState<Kind[]>(DEFAULT_CONNECTED);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [armed, setArmed] = useState<Kind | null>(null);
  const [pulse, setPulse] = useState<{ kind: Kind; n: number } | null>(null);
  const [positions, setPositions] = useState(INITIAL_POSITIONS);
  const [moving, setMoving] = useState<NodeId | null>(null);
  const moveStart = useRef<{ pointer: Point; node: Point } | null>(null);

  const ready = connected.length === INPUTS.length;
  const target = positions.target;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / STAGE.w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toStage = (event: PointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  };

  const moveHandlers = (nodeId: NodeId): MoveHandlers => ({
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      moveStart.current = { pointer: toStage(event), node: positions[nodeId] };
      setMoving(nodeId);
    },
    onPointerMove: (event) => {
      if (moving !== nodeId || !moveStart.current) return;
      const point = toStage(event);
      const { pointer, node } = moveStart.current;
      setPositions((current) => ({
        ...current,
        [nodeId]: clampPosition(nodeId, {
          x: node.x + point.x - pointer.x,
          y: node.y + point.y - pointer.y,
        }),
      }));
    },
    onPointerUp: () => {
      moveStart.current = null;
      setMoving(null);
    },
    onPointerCancel: () => {
      moveStart.current = null;
      setMoving(null);
    },
    onKeyDown: (event) => {
      const delta: Record<string, Point> = {
        ArrowUp: { x: 0, y: -NUDGE },
        ArrowDown: { x: 0, y: NUDGE },
        ArrowLeft: { x: -NUDGE, y: 0 },
        ArrowRight: { x: NUDGE, y: 0 },
      };
      const step = delta[event.key];
      if (!step) return;
      event.preventDefault();
      setPositions((current) => ({
        ...current,
        [nodeId]: clampPosition(nodeId, {
          x: current[nodeId].x + step.x,
          y: current[nodeId].y + step.y,
        }),
      }));
    },
  });

  const connect = (kind: Kind) => {
    setConnected((list) => (list.includes(kind) ? list : [...list, kind]));
    setPulse((p) => ({ kind, n: (p?.n ?? 0) + 1 }));
    setArmed(null);
  };

  const findInput = (point: Point, kind: Kind): Hover => {
    const distance = (input: Kind) => {
      const p = inputPoint(input, target);
      return Math.hypot(p.x - point.x, p.y - point.y);
    };
    if (distance(kind) < SNAP) return { kind, valid: true };
    const nearest = INPUTS.reduce((a, b) =>
      distance(a) < distance(b) ? a : b,
    );
    return distance(nearest) < SNAP / 2
      ? { kind: nearest, valid: false }
      : null;
  };

  const onPortDown =
    (kind: Kind) => (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ kind, ...toStage(event), moved: false });
    };

  const onPortMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const point = toStage(event);
    setDrag({ ...drag, ...point, moved: true });
    setHover(findInput(point, drag.kind));
  };

  const onPortUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const hit = findInput(toStage(event), drag.kind);
    if (hit?.valid) connect(hit.kind);
    else if (!drag.moved)
      setArmed((current) => (current === drag.kind ? null : drag.kind));
    setDrag(null);
    setHover(null);
  };

  const onPortKeyClick = (kind: Kind) => (event: MouseEvent) => {
    if (event.detail !== 0) return;
    setArmed((current) => (current === kind ? null : kind));
  };

  const onInputClick = (kind: Kind) => {
    if (armed === kind) connect(kind);
    else if (connected.includes(kind))
      setConnected((list) => list.filter((k) => k !== kind));
  };

  const dragSource = drag && SOURCES.find((s) => s.kind === drag.kind)!;

  return (
    <Section
      id="workflows"
      labelledBy={`${id}-heading`}
      className="overflow-x-clip py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2
              id={`${id}-heading`}
              className="max-w-[20ch] text-4xl font-medium tracking-tight text-balance sm:text-5xl"
            >
              Wire up an agent in a minute
            </h2>
            <p className="mt-6 max-w-[48ch] text-base text-pretty text-(--paper)/65 sm:text-lg">
              Connect a model, a sandbox, your MCP tools and instructions. Void
              Agent turns the graph into a live agent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              scheme="dark"
              rounded
              disabled={
                connected === DEFAULT_CONNECTED &&
                positions === INITIAL_POSITIONS
              }
              onClick={() => {
                setConnected(DEFAULT_CONNECTED);
                setArmed(null);
                setPositions(INITIAL_POSITIONS);
              }}
            >
              Reset
            </Button>
            <Button
              variant="outline"
              scheme="dark"
              rounded
              disabled={ready}
              onClick={() => INPUTS.forEach((kind) => connect(kind))}
            >
              Connect all
            </Button>
          </div>
        </div>
      </div>

      <MobileWorkflow
        connected={connected}
        ready={ready}
        pulse={pulse}
        reduceMotion={!!reduceMotion}
        onToggle={(kind) =>
          connected.includes(kind)
            ? setConnected((list) => list.filter((k) => k !== kind))
            : connect(kind)
        }
      />

      <div className="relative mt-16 px-6 max-md:hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2"
        >
          <div
            className="absolute inset-x-0"
            style={{
              top: LANES[0] * scale,
              height: (LANES[LANES.length - 1] - LANES[0]) * scale,
              backgroundImage: DASHED_GRID,
              backgroundPosition: "center top",
            }}
          />
          {LANES.map((y) => (
            <span
              key={y}
              className="absolute inset-x-0 h-px bg-white/[0.08]"
              style={{ top: y * scale }}
            />
          ))}
        </div>
        <div ref={wrapRef} className="relative">
          <div
            className="mx-auto"
            style={{ width: STAGE.w * scale, height: STAGE.h * scale }}
          >
            <div
              ref={stageRef}
              className="relative origin-top-left select-none"
              style={{
                width: STAGE.w,
                height: STAGE.h,
                transform: `scale(${scale})`,
              }}
            >
              <svg
                width={STAGE.w}
                height={STAGE.h}
                className="pointer-events-none absolute inset-0 overflow-visible"
                aria-hidden
              >
                <defs>
                  <filter
                    id={`${id}-glow`}
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feGaussianBlur stdDeviation="4" />
                  </filter>
                </defs>
                {SOURCES.filter((s) => connected.includes(s.kind)).map(
                  (source) => (
                    <StringCable
                      key={source.kind}
                      from={outputPoint(positions[source.kind])}
                      to={inputPoint(source.kind, target)}
                      color={COLORS[source.kind]}
                      filterId={`${id}-glow`}
                      reduceMotion={!!reduceMotion}
                    />
                  ),
                )}
                {DESTINATIONS.map((dest, i) => {
                  const from = endpointOutput(i, target);
                  const to = destInput(positions[dest.id]);
                  return ready ? (
                    <StringCable
                      key={dest.id}
                      from={from}
                      to={to}
                      color={BRAND}
                      filterId={`${id}-glow`}
                      reduceMotion={!!reduceMotion}
                    />
                  ) : (
                    <path
                      key={dest.id}
                      d={cable(from, to)}
                      stroke="white"
                      strokeOpacity={0.12}
                      strokeWidth={1.5}
                      strokeDasharray="3 6"
                      strokeLinecap="round"
                      fill="none"
                    />
                  );
                })}
                {drag && dragSource && drag.moved && (
                  <>
                    <path
                      d={cable(outputPoint(positions[dragSource.kind]), {
                        x: drag.x,
                        y: drag.y,
                      })}
                      stroke="white"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle cx={drag.x} cy={drag.y} r={4} fill="white" />
                    {hover?.valid && (
                      <Spark
                        from={{ x: drag.x, y: drag.y }}
                        to={inputPoint(hover.kind, target)}
                        color={COLORS[hover.kind]}
                        filterId={`${id}-glow`}
                        still={!!reduceMotion}
                      />
                    )}
                  </>
                )}
              </svg>

              {SOURCES.map((source) => (
                <NodeCard
                  key={source.kind}
                  title={source.title}
                  icon={source.icon}
                  position={positions[source.kind]}
                  moving={moving === source.kind}
                  handlers={moveHandlers(source.kind)}
                >
                  <div className="px-3.5" style={{ height: BODY }}>
                    {source.content}
                  </div>
                  <div className="flex h-9 items-center justify-end gap-2 pr-5 text-xs text-(--paper)/55">
                    {source.kind}
                  </div>
                  <div className="h-3" />
                </NodeCard>
              ))}

              <TargetCard
                ready={ready}
                connected={connected}
                pulse={pulse}
                reduceMotion={!!reduceMotion}
                position={target}
                moving={moving === "target"}
                handlers={moveHandlers("target")}
              />

              {DESTINATIONS.map((dest) => (
                <NodeCard
                  key={dest.id}
                  title={dest.title}
                  icon={dest.icon}
                  position={positions[dest.id]}
                  moving={moving === dest.id}
                  handlers={moveHandlers(dest.id)}
                  dim={!ready}
                >
                  <div className="px-3.5" style={{ height: BODY }}>
                    <Meta primary={dest.primary} secondary={dest.secondary} />
                  </div>
                  <div className="flex h-9 items-center gap-2 pl-5 text-xs text-(--paper)/55">
                    <span
                      className={cn(
                        "size-1.5 rounded-full transition-colors duration-300",
                        ready
                          ? "bg-(--brand) shadow-[0_0_8px_var(--brand)]"
                          : "bg-white/25",
                      )}
                    />
                    {ready ? "Receiving runs" : "Waiting for agent"}
                  </div>
                  <div className="h-3" />
                </NodeCard>
              ))}

              {DESTINATIONS.map((dest, i) => {
                const out = endpointOutput(i, target);
                const inp = destInput(positions[dest.id]);
                return [out, inp].map((p, j) => (
                  <span
                    key={`${dest.id}-${j}`}
                    aria-hidden
                    className="pointer-events-none absolute z-20 grid size-7 place-items-center"
                    style={{ left: p.x - 14, top: p.y - 14 }}
                  >
                    <Dot color={ready ? BRAND : undefined} />
                  </span>
                ));
              })}

              {SOURCES.map((source) => {
                const p = outputPoint(positions[source.kind]);
                const isConnected = connected.includes(source.kind);
                const isArmed = armed === source.kind;
                return (
                  <button
                    key={source.kind}
                    type="button"
                    aria-label={`Connect ${INPUT_LABELS[source.kind]}`}
                    aria-pressed={isArmed}
                    onPointerDown={onPortDown(source.kind)}
                    onPointerMove={onPortMove}
                    onPointerUp={onPortUp}
                    onPointerCancel={() => {
                      setDrag(null);
                      setHover(null);
                    }}
                    onClick={onPortKeyClick(source.kind)}
                    className="group absolute z-20 grid size-7 cursor-grab touch-none place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-(--paper) active:cursor-grabbing"
                    style={{ left: p.x - 14, top: p.y - 14 }}
                  >
                    <Dot
                      color={
                        isConnected || isArmed || drag?.kind === source.kind
                          ? COLORS[source.kind]
                          : undefined
                      }
                      ring={isArmed}
                    />
                  </button>
                );
              })}

              {INPUTS.map((kind) => {
                const p = inputPoint(kind, target);
                const isConnected = connected.includes(kind);
                const isHover = hover?.kind === kind;
                const acceptsArmed = armed === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-label={
                      isConnected
                        ? `${INPUT_LABELS[kind]} connected. Activate to disconnect`
                        : `${INPUT_LABELS[kind]} input`
                    }
                    tabIndex={isConnected || acceptsArmed ? 0 : -1}
                    onClick={() => onInputClick(kind)}
                    className="group absolute z-20 grid size-7 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-(--paper)"
                    style={{ left: p.x - 14, top: p.y - 14 }}
                  >
                    <Dot
                      color={isConnected ? COLORS[kind] : undefined}
                      ring={acceptsArmed || (isHover && hover?.valid)}
                      ringColor={COLORS[kind]}
                      invalid={isHover && !hover?.valid}
                    />
                    <AnimatePresence>
                      {pulse?.kind === kind && (
                        <motion.span
                          key={pulse.n}
                          initial={{ scale: 0.6, opacity: 0.9 }}
                          animate={{
                            scale: reduceMotion ? 1 : 2.4,
                            opacity: 0,
                          }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="pointer-events-none absolute size-3 rounded-full ring-2"
                          style={
                            { "--tw-ring-color": COLORS[kind] } as CSSProperties
                          }
                        />
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {ready
          ? "All inputs connected. The agent is ready to run."
          : armed
            ? `Now select the ${INPUT_LABELS[armed].toLowerCase()} input on the agent.`
            : `Drag from a dot to the matching input. ${connected.length} of ${INPUTS.length} connected.`}
      </p>
    </Section>
  );
}

function MobileWorkflow({
  connected,
  ready,
  pulse,
  reduceMotion,
  onToggle,
}: {
  connected: Kind[];
  ready: boolean;
  pulse: { kind: Kind; n: number } | null;
  reduceMotion: boolean;
  onToggle: (kind: Kind) => void;
}) {
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 26 };

  return (
    <div className="mx-auto mt-10 max-w-md px-6 md:hidden">
      <ul role="list" className="grid gap-2">
        {SOURCES.map((source) => {
          const on = connected.includes(source.kind);
          const color = COLORS[source.kind];
          return (
            <li key={source.kind}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(source.kind)}
                className="flex w-full items-center gap-3 rounded-xl bg-[#171717] p-3 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_12px_32px_-12px_rgba(0,0,0,0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--paper)"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-(--paper)/70">
                  <source.icon className="size-5" stroke={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">
                    {source.title}
                  </span>
                  <span className="block truncate text-sm text-(--paper)/50">
                    {INPUT_LABELS[source.kind]}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-200",
                    on
                      ? "bg-white/[0.06] text-(--paper)"
                      : "text-(--paper)/45 ring-1 ring-white/10",
                  )}
                >
                  <motion.span
                    className="size-2 rounded-full"
                    animate={{
                      backgroundColor: on ? color : "rgba(255,255,255,0.25)",
                      boxShadow: on
                        ? `0 0 8px ${color}`
                        : "0 0 0px transparent",
                      scale:
                        pulse?.kind === source.kind && !reduceMotion
                          ? [1, 1.8, 1]
                          : 1,
                    }}
                    transition={{ duration: 0.35 }}
                  />
                  {on ? "Connected" : "Connect"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Connector active={connected.length > 0} />

      <div className="rounded-2xl bg-[#141414] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex h-10 items-center gap-2 px-2.5 text-sm">
          <IconRocket
            className="size-4 text-(--paper)/60"
            stroke={1.75}
            aria-hidden
          />
          <span className="font-medium">Agent</span>
          <span className="text-(--paper)/40">issue-triage</span>
        </div>
        <ul
          role="list"
          className="rounded-xl bg-[#0a0a0a] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)]"
        >
          {INPUTS.map((kind) => {
            const on = connected.includes(kind);
            return (
              <li
                key={kind}
                className="flex h-11 items-center gap-3 px-2 text-sm"
              >
                <span
                  className="size-2 shrink-0 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor: on
                      ? COLORS[kind]
                      : "rgba(255,255,255,0.2)",
                  }}
                />
                <span
                  className={cn(
                    "flex-1",
                    on ? "text-(--paper)" : "text-(--paper)/45",
                  )}
                >
                  {INPUT_LABELS[kind]}
                </span>
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.span
                      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
                      transition={spring}
                    >
                      <IconCheck
                        className="size-4"
                        style={{ color: COLORS[kind] }}
                        stroke={2.5}
                        aria-hidden
                      />
                    </motion.span>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
        <div className="flex h-10 items-center justify-between px-2.5 text-sm">
          <span className="flex items-center gap-2 text-(--paper)/55">
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors duration-300",
                ready
                  ? "bg-(--brand) shadow-[0_0_8px_var(--brand)]"
                  : "bg-white/25",
              )}
            />
            {ready
              ? "Ready to run"
              : `Awaiting inputs · ${connected.length}/${INPUTS.length}`}
          </span>
        </div>
      </div>

      <Connector active={ready} />

      <ul role="list" className="grid grid-cols-2 gap-2">
        {DESTINATIONS.map((dest) => (
          <li
            key={dest.id}
            className={cn(
              "rounded-xl bg-[#171717] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_12px_32px_-12px_rgba(0,0,0,0.7)] transition-opacity duration-300",
              !ready && "opacity-55",
            )}
          >
            <dest.icon
              className="size-5 text-(--paper)/60"
              stroke={1.75}
              aria-hidden
            />
            <p className="mt-2.5 truncate text-sm font-medium">{dest.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-(--paper)/50">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-colors duration-300",
                  ready
                    ? "bg-(--brand) shadow-[0_0_8px_var(--brand)]"
                    : "bg-white/25",
                )}
              />
              {ready ? "Receiving" : "Waiting"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="flex justify-center py-1.5">
      <span
        className={cn(
          "h-8 w-px transition-colors duration-300",
          active
            ? "bg-(--brand) shadow-[0_0_8px_var(--brand)]"
            : "bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.2)_0_3px,transparent_3px_7px)]",
        )}
      />
    </div>
  );
}

function StringCable({
  from,
  to,
  color,
  filterId,
  reduceMotion,
}: {
  from: Point;
  to: Point;
  color: string;
  filterId: string;
  reduceMotion: boolean;
}) {
  const taut = cableMid(from, to);
  const rest = { x: taut.x, y: taut.y + restSag(from, to) };
  const midX = useSpring(rest.x, STRING_SPRING);
  const midY = useSpring(reduceMotion ? rest.y : taut.y, STRING_SPRING);
  const ends = useRef({ from, to });
  ends.current = { from, to };

  useEffect(() => {
    if (reduceMotion) {
      midX.jump(rest.x);
      midY.jump(rest.y);
      return;
    }
    midX.set(rest.x);
    midY.set(rest.y);
  }, [rest.x, rest.y, reduceMotion, midX, midY]);

  const d = useTransform(() =>
    stringPath(ends.current.from, ends.current.to, {
      x: midX.get(),
      y: midY.get(),
    }),
  );

  return (
    <g>
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={7}
        opacity={0.45}
        fill="none"
        filter={`url(#${filterId})`}
      />
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      {!reduceMotion && (
        <motion.path
          d={d}
          stroke="white"
          strokeOpacity={0.75}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="1 14"
          fill="none"
          animate={{ strokeDashoffset: [0, -30] }}
          transition={{ duration: 1, ease: "linear", repeat: Infinity }}
        />
      )}
    </g>
  );
}

const WAVE = { samples: 40, amplitude: 6, wavelength: 26, speed: 2.2 };

function wave(from: Point, to: Point, phase: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const cycles = Math.max(1, length / WAVE.wavelength);
  let d = "";
  for (let i = 0; i <= WAVE.samples; i++) {
    const t = i / WAVE.samples;
    const envelope = Math.sin(Math.PI * t);
    const offset =
      WAVE.amplitude * envelope * Math.sin(2 * Math.PI * cycles * t - phase);
    const x = from.x + dx * t + nx * offset;
    const y = from.y + dy * t + ny * offset;
    d += `${i === 0 ? "M" : " L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function Spark({
  from,
  to,
  color,
  filterId,
  still,
}: {
  from: Point;
  to: Point;
  color: string;
  filterId: string;
  still: boolean;
}) {
  const [phase, setPhase] = useState(0);

  useAnimationFrame((_, delta) => {
    if (still) return;
    setPhase((p) => (p + (delta / 1000) * WAVE.speed) % (Math.PI * 2));
  });

  const d = wave(from, to, phase);
  return (
    <g>
      <path
        d={d}
        stroke={color}
        strokeWidth={5}
        opacity={0.5}
        fill="none"
        filter={`url(#${filterId})`}
      />
      <path
        d={d}
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle
        cx={to.x}
        cy={to.y}
        r={13}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        opacity={0.9}
      />
    </g>
  );
}

function BackgroundGlow({
  color,
  reduceMotion,
}: { color: string; reduceMotion: boolean }) {
  const glows = [
    { edge: "top-0", from: 24, to: 120 },
    { edge: "bottom-0", from: 24, to: 120 },
  ];
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.8, times: [0, 0.15, 0.65, 1], ease: "easeOut" }}
    >
      {glows.map((glow) => (
        <motion.div
          key={glow.edge}
          className={cn("absolute left-0 w-28", glow.edge)}
          initial={{ x: reduceMotion ? (glow.from + glow.to) / 2 : glow.from }}
          animate={{ x: reduceMotion ? (glow.from + glow.to) / 2 : glow.to }}
          transition={{ duration: 1.8, ease: EASE }}
        >
          <div
            className={cn(
              "absolute inset-x-0 h-14 rounded-full opacity-45 blur-2xl",
              glow.edge === "top-0" ? "-top-7" : "-bottom-7",
            )}
            style={{ backgroundColor: color }}
          />
          <div
            className={cn(
              "absolute inset-x-4 h-px",
              glow.edge === "top-0" ? "top-0" : "bottom-0",
            )}
            style={{
              backgroundImage: `linear-gradient(to right, transparent, ${color}, transparent)`,
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

function Meta({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="text-xs">
      <p className="truncate font-medium text-(--paper)/85">{primary}</p>
      <p className="mt-1 truncate text-(--paper)/50">{secondary}</p>
    </div>
  );
}

function Dot({
  color,
  ring,
  ringColor,
  invalid,
}: {
  color?: string;
  ring?: boolean;
  ringColor?: string;
  invalid?: boolean;
}) {
  return (
    <motion.span
      animate={{ scale: ring ? 1.25 : 1 }}
      whileHover={{ scale: 1.3 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "block size-3 rounded-full ring-[3px] ring-(--ink-2) transition-[box-shadow,background-color] duration-150",
        !color && "bg-(--paper)",
        invalid && "bg-red-400",
      )}
      style={{
        backgroundColor: invalid ? undefined : color,
        boxShadow: ring
          ? `0 0 0 3px var(--ink-2), 0 0 0 5px ${ringColor ?? color ?? "white"}`
          : color
            ? `0 0 0 3px var(--ink-2), 0 0 12px 1px ${color}`
            : undefined,
      }}
    />
  );
}

type MoveHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

const LIFT =
  "0 0 0 1px rgba(255,255,255,0.14), 0 28px 56px -16px rgba(0,0,0,0.85)";
const REST =
  "0 0 0 1px rgba(255,255,255,0.07), 0 12px 32px -12px rgba(0,0,0,0.7)";

function MoveHeader({
  title,
  icon: Icon,
  handlers,
  moving,
  className,
  children,
}: {
  title: string;
  icon: Icon;
  handlers: MoveHandlers;
  moving: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { onKeyDown, ...pointer } = handlers;
  return (
    <div
      {...pointer}
      className={cn(
        "flex h-11 touch-none items-center gap-2 px-3.5",
        moving ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
    >
      <Icon className="size-4 text-(--paper)/55" stroke={1.75} aria-hidden />
      <p className="text-sm font-medium text-(--paper)">{title}</p>
      {children}
      <button
        type="button"
        aria-label={`Move the ${title} card with the arrow keys`}
        onKeyDown={onKeyDown}
        className="-mr-1.5 ml-auto grid size-6 place-items-center rounded-md text-(--paper)/25 hover:text-(--paper)/60 focus-visible:outline-2 focus-visible:outline-(--paper)"
      >
        <IconGripVertical className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function NodeCard({
  title,
  icon,
  position,
  moving,
  handlers,
  dim = false,
  children,
}: {
  title: string;
  icon: Icon;
  position: Point;
  moving: boolean;
  handlers: MoveHandlers;
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      className="absolute rounded-2xl bg-[#171717]"
      style={{
        left: position.x,
        top: position.y,
        width: NODE_W,
        zIndex: moving ? 10 : undefined,
      }}
      initial={false}
      animate={{ boxShadow: moving ? LIFT : REST, opacity: dim ? 0.55 : 1 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <MoveHeader
        title={title}
        icon={icon}
        handlers={handlers}
        moving={moving}
      />
      {children}
    </motion.div>
  );
}

function TargetCard({
  ready,
  connected,
  pulse,
  reduceMotion,
  position,
  moving,
  handlers,
}: {
  ready: boolean;
  connected: Kind[];
  pulse: { kind: Kind; n: number } | null;
  reduceMotion: boolean;
  position: Point;
  moving: boolean;
  handlers: MoveHandlers;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    if (!pulse || reduceMotion || !scope.current) return;
    animate(
      scope.current,
      { scale: [1, 1.025, 0.995, 1], y: [0, -2, 1, 0] },
      { duration: 0.5, ease: EASE },
    );
  }, [pulse, reduceMotion, animate, scope]);

  return (
    <motion.div
      className="absolute rounded-2xl"
      style={{
        left: position.x,
        top: position.y,
        width: TARGET.w,
        zIndex: moving ? 10 : undefined,
      }}
      initial={false}
      animate={{
        boxShadow: ready
          ? "0 0 0 1px rgba(0,153,255,0.35), 0 20px 60px -20px rgba(0,153,255,0.45)"
          : moving
            ? LIFT
            : REST,
      }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <AnimatePresence>
        {ready && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
            className="pointer-events-none absolute inset-x-0 -top-px z-10 h-16 overflow-hidden rounded-t-2xl"
          >
            <div className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-(--brand) to-transparent" />
            <div className="absolute top-0 left-1/2 h-10 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--brand)/35 blur-2xl" />
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={scope} className="relative rounded-2xl bg-[#141414] p-1.5">
        <MoveHeader
          title="Agent"
          icon={IconRocket}
          handlers={handlers}
          moving={moving}
          className="h-[38px] px-2.5 pt-0"
        >
          <span className="ml-1 text-xs text-(--paper)/40">issue-triage</span>
        </MoveHeader>
        <div className="relative isolate overflow-hidden rounded-xl bg-[#0a0a0a] shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)]">
          {pulse && (
            <BackgroundGlow
              key={pulse.n}
              color={COLORS[pulse.kind]}
              reduceMotion={reduceMotion}
            />
          )}
          <ul className="py-3">
            {INPUTS.map((kind) => {
              const isConnected = connected.includes(kind);
              return (
                <li
                  key={kind}
                  className="flex items-center pr-[22px] pl-[18px] text-sm"
                  style={{ height: TARGET_ROW }}
                >
                  <span
                    className={
                      isConnected ? "text-(--paper)" : "text-(--paper)/55"
                    }
                  >
                    {INPUT_LABELS[kind]}
                  </span>
                  <AnimatePresence>
                    {isConnected && (
                      <motion.span
                        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 28,
                        }}
                        className="ml-auto"
                      >
                        <IconCheck
                          className="size-4"
                          stroke={2.5}
                          style={{ color: COLORS[kind] }}
                          aria-hidden
                        />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex h-12 items-center gap-2 px-2.5 text-xs">
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors duration-200",
              ready
                ? "bg-(--brand) shadow-[0_0_8px_var(--brand)]"
                : "bg-(--paper)/30",
            )}
          />
          <div className="relative h-4 flex-1 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={ready ? "ready" : "waiting"}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                transition={{ duration: 0.2, ease: EASE }}
                className={ready ? "text-(--paper)" : "text-(--paper)/50"}
              >
                {ready
                  ? "Ready to run"
                  : `Awaiting inputs · ${connected.length}/4`}
              </motion.p>
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {ready && (
              <motion.span
                initial={{ opacity: 0, x: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="rounded-full bg-(--paper) px-2.5 py-1 text-xs font-medium text-(--ink)"
              >
                Run
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
