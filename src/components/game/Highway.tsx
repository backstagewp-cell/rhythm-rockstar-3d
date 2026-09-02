import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { GameEngine, LANE_COLORS, LANE_X } from "@/lib/engine";

export const NOTE_SPEED = 11; // world units per second
const VISIBLE_AHEAD = 3.4; // seconds of chart visible
const POOL = 96;
const LANE_W = 0.9;

/* ------------------------------------------------------------------ */
/* Canvas textures (white/greyscale so they can be tinted by material) */
/* ------------------------------------------------------------------ */

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rock Band gem: bright horizontal bar, white rim, glossy top band. */
function makeGemTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 128);

  // outer dark casing
  ctx.fillStyle = "rgba(10,10,12,0.95)";
  rounded(ctx, 6, 22, 244, 84, 16);
  ctx.fill();

  // white rim
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 7;
  rounded(ctx, 12, 28, 232, 72, 14);
  ctx.stroke();

  // colored body (white here → tinted at runtime)
  const g = ctx.createLinearGradient(0, 28, 0, 100);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(235,235,235,1)");
  g.addColorStop(0.55, "rgba(150,150,150,1)");
  g.addColorStop(1, "rgba(215,215,215,1)");
  ctx.fillStyle = g;
  rounded(ctx, 18, 34, 220, 60, 11);
  ctx.fill();

  // specular streak
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  rounded(ctx, 26, 38, 204, 14, 7);
  ctx.fill();

  return tex(c);
}

/** Soft radial glow used under gems and frets. */
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return tex(c);
}

/** Fret pad at the strike line: rounded plate with bright rim. */
function makePadTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 160);
  ctx.fillStyle = "rgba(6,6,8,0.92)";
  rounded(ctx, 6, 10, 244, 140, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 8;
  rounded(ctx, 14, 18, 228, 124, 20);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, 18, 0, 142);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.5, "rgba(120,120,120,0.35)");
  g.addColorStop(1, "rgba(20,20,20,0.25)");
  ctx.fillStyle = g;
  rounded(ctx, 20, 24, 216, 112, 18);
  ctx.fill();
  return tex(c);
}

/** Dark carbon board texture with faint vertical streaks. */
function makeBoardTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#07070a";
  ctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 200; i++) {
    ctx.globalAlpha = 0.02 + Math.random() * 0.05;
    ctx.fillStyle = Math.random() > 0.5 ? "#3a3f4d" : "#000000";
    ctx.fillRect(Math.random() * 256, 0, 1 + Math.random() * 3, 1024);
  }
  ctx.globalAlpha = 1;
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 8);
  return t;
}

/* ------------------------------------------------------------------ */
/* Strike zone                                                         */
/* ------------------------------------------------------------------ */

function Fret({
  lane,
  engine,
  pad,
  glow,
}: {
  lane: number;
  engine: GameEngine;
  pad: THREE.Texture;
  glow: THREE.Texture;
}) {
  const plate = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);
  const color = LANE_COLORS[lane as 0];

  useFrame(() => {
    const f = engine.flash[lane as 0];
    const pressed = engine.held[lane as 0];
    if (plate.current) {
      const m = plate.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.75 + f * 0.25 + (pressed ? 0.15 : 0);
      plate.current.position.y = pressed ? 0.012 : 0.02;
    }
    if (halo.current) {
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.28 + f * 0.5 + (pressed ? 0.2 : 0);
    }
    if (burst.current) {
      const m = burst.current.material as THREE.MeshBasicMaterial;
      m.opacity = f * 0.9;
      burst.current.scale.setScalar(1 + (1 - f) * 1.6);
      burst.current.visible = f > 0.01;
    }
  });

  return (
    <group position={[LANE_X[lane as 0], 0, 0]}>
      {/* ambient halo under the pad */}
      <mesh ref={halo} rotation-x={-Math.PI / 2} position={[0, 0.016, 0]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial
          map={glow}
          color={color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* pad plate */}
      <mesh ref={plate} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <planeGeometry args={[LANE_W * 0.92, 0.62]} />
        <meshBasicMaterial map={pad} color={color} transparent depthWrite={false} />
      </mesh>
      {/* hit burst */}
      <mesh ref={burst} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} visible={false}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial
          map={glow}
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

function Notes({
  engine,
  getTime,
  gem,
  glow,
}: {
  engine: GameEngine;
  getTime: () => number;
  gem: THREE.Texture;
  glow: THREE.Texture;
}) {
  const gems = useRef<THREE.Mesh[]>([]);
  const halos = useRef<THREE.Mesh[]>([]);
  const tails = useRef<THREE.Mesh[]>([]);
  const cursor = useRef(0);

  useFrame(() => {
    const now = getTime();
    const notes = engine.notes;

    while (cursor.current > 0 && notes[cursor.current - 1]!.time > now - 0.5) cursor.current--;
    while (cursor.current < notes.length && notes[cursor.current]!.time < now - 0.5) cursor.current++;

    let slot = 0;
    for (let i = cursor.current; i < notes.length && slot < POOL; i++) {
      const n = notes[i]!;
      const dt = n.time - now;
      if (dt > VISIBLE_AHEAD) break;
      if (engine.states[i] !== 0 || dt < -0.06) continue;

      const g = gems.current[slot];
      const halo = halos.current[slot];
      const tail = tails.current[slot];
      if (!g || !halo || !tail) break;

      const z = -dt * NOTE_SPEED;
      const x = LANE_X[n.lane as 0];
      const col = engine.spActive || n.sp ? "#eaf6ff" : LANE_COLORS[n.lane as 0];

      g.visible = true;
      g.position.set(x, 0.055, z);
      (g.material as THREE.MeshBasicMaterial).color.set(col);

      halo.visible = true;
      halo.position.set(x, 0.035, z);
      (halo.material as THREE.MeshBasicMaterial).color.set(col);

      if (n.duration > 0) {
        const len = n.duration * NOTE_SPEED;
        tail.visible = true;
        tail.scale.set(1, len, 1);
        tail.position.set(x, 0.03, z - len / 2);
        (tail.material as THREE.MeshBasicMaterial).color.set(col);
      } else {
        tail.visible = false;
      }
      slot++;
    }
    for (let s = slot; s < POOL; s++) {
      if (gems.current[s]) gems.current[s]!.visible = false;
      if (halos.current[s]) halos.current[s]!.visible = false;
      if (tails.current[s]) tails.current[s]!.visible = false;
    }
  });

  const items = useMemo(() => Array.from({ length: POOL }, (_, i) => i), []);

  return (
    <group>
      {items.map((i) => (
        <group key={i}>
          {/* sustain tail */}
          <mesh
            ref={(m) => {
              if (m) tails.current[i] = m;
            }}
            visible={false}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[0.2, 1]} />
            <meshBasicMaterial
              transparent
              opacity={0.85}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* glow under gem */}
          <mesh
            ref={(m) => {
              if (m) halos.current[i] = m;
            }}
            visible={false}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[1.25, 1.25]} />
            <meshBasicMaterial
              map={glow}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* gem */}
          <mesh
            ref={(m) => {
              if (m) gems.current[i] = m;
            }}
            visible={false}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[LANE_W * 0.92, 0.44]} />
            <meshBasicMaterial map={gem} transparent depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function BeatLines({ getTime }: { getTime: () => number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const now = getTime();
    const spacing = 1.2;
    group.current?.children.forEach((c, i) => {
      const t = Math.ceil(now / spacing) * spacing + i * spacing;
      c.position.z = -(t - now) * NOTE_SPEED;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.011, 0]}>
          <planeGeometry args={[4.5, 0.03]} />
          <meshBasicMaterial color="#9fb4c8" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function HighwayScene({ engine, getTime }: { engine: GameEngine; getTime: () => number }) {
  const board = useMemo(() => makeBoardTexture(), []);
  const gem = useMemo(() => makeGemTexture(), []);
  const glow = useMemo(() => makeGlowTexture(), []);
  const pad = useMemo(() => makePadTexture(), []);

  const spot = useRef<THREE.PointLight>(null);
  useFrame((_, delta) => {
    engine.update(getTime(), Math.min(delta, 0.05));
    if (spot.current) {
      spot.current.intensity = engine.spActive ? 26 : 10 + engine.combo * 0.05;
      spot.current.color.set(engine.spActive ? "#8fd8ff" : "#ff3a3a");
    }
  });

  return (
    <>
      <fog attach="fog" args={["#050508", 26, 60]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 10, 8]} intensity={1.2} color="#ffe6e0" />
      <pointLight ref={spot} position={[0, 6, -14]} distance={60} color="#ff3a3a" intensity={12} />

      {/* board */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -20]} receiveShadow>
        <planeGeometry args={[4.6, 80]} />
        <meshStandardMaterial map={board} color="#1b1d24" roughness={0.35} metalness={0.6} />
      </mesh>

      {/* colored lane lasers running the full board */}
      {[0, 1, 2, 3, 4].map((l) => (
        <group key={l}>
          <mesh rotation-x={-Math.PI / 2} position={[LANE_X[l as 0], 0.008, -20]}>
            <planeGeometry args={[0.05, 80]} />
            <meshBasicMaterial
              color={LANE_COLORS[l as 0]}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[LANE_X[l as 0], 0.007, -20]}>
            <planeGeometry args={[0.3, 80]} />
            <meshBasicMaterial
              color={LANE_COLORS[l as 0]}
              transparent
              opacity={0.14}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      {/* lane separators */}
      {[-1.35, -0.45, 0.45, 1.35].map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.006, -20]}>
          <planeGeometry args={[0.015, 80]} />
          <meshBasicMaterial color="#8fa0b5" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      ))}

      {/* side rails */}
      {[-2.35, 2.35].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.05, -20]}>
            <boxGeometry args={[0.1, 0.1, 80]} />
            <meshStandardMaterial color="#20242c" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[x, 0.105, -20]}>
            <planeGeometry args={[0.05, 80]} />
            <meshBasicMaterial
              color="#9fd8ff"
              transparent
              opacity={0.35}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      <BeatLines getTime={getTime} />
      <Notes engine={engine} getTime={getTime} gem={gem} glow={glow} />

      {/* strike zone plate */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0]}>
        <planeGeometry args={[4.6, 1.15]} />
        <meshBasicMaterial color="#0b0d12" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      {/* strike line */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0.58]}>
        <planeGeometry args={[4.6, 0.05]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, -0.58]}>
        <planeGeometry args={[4.6, 0.03]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} />
      </mesh>

      {[0, 1, 2, 3, 4].map((l) => (
        <Fret key={l} lane={l} engine={engine} pad={pad} glow={glow} />
      ))}
    </>
  );
}
