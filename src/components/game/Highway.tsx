import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { GameEngine, LANE_COLORS, LANE_X } from "@/lib/engine";

export const NOTE_SPEED = 11; // world units per second
const VISIBLE_AHEAD = 3.4; // seconds of chart visible
const POOL = 96;

function makeWoodTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#241a12";
  ctx.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    ctx.fillStyle = Math.random() > 0.5 ? "#4a3423" : "#120c08";
    const x = Math.random() * 256;
    ctx.fillRect(x, 0, 1 + Math.random() * 5, 1024);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Fret({ lane, engine }: { lane: number; engine: GameEngine }) {
  const ring = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const f = engine.flash[lane as 0];
    const pressed = engine.held[lane as 0];
    if (glow.current) {
      const m = glow.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.12 + f * 0.85 + (pressed ? 0.25 : 0);
      const s = 1 + f * 0.5;
      glow.current.scale.setScalar(s);
    }
    if (ring.current) {
      ring.current.position.y = pressed ? -0.05 : 0;
    }
  });

  return (
    <group position={[LANE_X[lane as 0], 0.02, 0]}>
      <mesh ref={glow} rotation-x={-Math.PI / 2} position-y={0.03}>
        <circleGeometry args={[0.42, 32]} />
        <meshBasicMaterial
          color={LANE_COLORS[lane as 0]}
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.34, 0.46, 32]} />
        <meshStandardMaterial
          color="#d8dde6"
          emissive={LANE_COLORS[lane as 0]}
          emissiveIntensity={0.35}
          metalness={0.9}
          roughness={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function Notes({ engine, getTime }: { engine: GameEngine; getTime: () => number }) {
  const gems = useRef<THREE.Mesh[]>([]);
  const caps = useRef<THREE.Mesh[]>([]);
  const tails = useRef<THREE.Mesh[]>([]);
  const cursor = useRef(0);

  useFrame(() => {
    const now = getTime();
    const notes = engine.notes;

    // rewind cursor if the song was restarted / seeked back
    while (cursor.current > 0 && notes[cursor.current - 1]!.time > now - 0.5) cursor.current--;
    while (cursor.current < notes.length && notes[cursor.current]!.time < now - 0.5)
      cursor.current++;

    let slot = 0;
    for (let i = cursor.current; i < notes.length && slot < POOL; i++) {
      const n = notes[i]!;
      const dt = n.time - now;
      if (dt > VISIBLE_AHEAD) break;
      if (engine.states[i] !== 0 || dt < -0.06) continue;

      const gem = gems.current[slot];
      const cap = caps.current[slot];
      const tail = tails.current[slot];
      if (!gem || !tail || !cap) break;

      const z = -dt * NOTE_SPEED;
      const x = LANE_X[n.lane as 0];
      const col = engine.spActive ? "#e8f6ff" : LANE_COLORS[n.lane as 0];

      gem.visible = true;
      gem.position.set(x, 0.09, z);
      const mat = gem.material as THREE.MeshStandardMaterial;
      mat.color.set(col);
      mat.emissive.set(col);
      mat.emissiveIntensity = n.sp ? 1.4 : 0.9;

      cap.visible = true;
      cap.position.set(x, 0.165, z);
      (cap.material as THREE.MeshBasicMaterial).color.set(n.sp ? "#dff2ff" : "#ffffff");

      if (n.duration > 0) {
        const len = n.duration * NOTE_SPEED;
        tail.visible = true;
        tail.scale.set(1, 1, len);
        tail.position.set(x, 0.05, z - len / 2);
        (tail.material as THREE.MeshBasicMaterial).color.set(col);
      } else {
        tail.visible = false;
      }
      slot++;
    }
    for (let s = slot; s < POOL; s++) {
      if (gems.current[s]) gems.current[s]!.visible = false;
      if (caps.current[s]) caps.current[s]!.visible = false;
      if (tails.current[s]) tails.current[s]!.visible = false;
    }
  });

  const items = useMemo(() => Array.from({ length: POOL }, (_, i) => i), []);

  return (
    <group>
      {items.map((i) => (
        <group key={i}>
          <mesh
            ref={(m) => {
              if (m) tails.current[i] = m;
            }}
            visible={false}
          >
            <boxGeometry args={[0.16, 0.03, 1]} />
            <meshBasicMaterial transparent opacity={0.75} blending={THREE.AdditiveBlending} />
          </mesh>
          {/* flat Rock Band style bar */}
          <mesh
            ref={(m) => {
              if (m) gems.current[i] = m;
            }}
            visible={false}
            castShadow
          >
            <boxGeometry args={[0.74, 0.14, 0.3]} />
            <meshStandardMaterial metalness={0.2} roughness={0.3} />
          </mesh>
          {/* bright top highlight strip */}
          <mesh
            ref={(m) => {
              if (m) caps.current[i] = m;
            }}
            visible={false}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[0.66, 0.2]} />
            <meshBasicMaterial transparent opacity={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}


function BeatLines({ getTime }: { getTime: () => number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const now = getTime();
    const spacing = 1.2; // seconds-ish grid
    group.current?.children.forEach((c, i) => {
      const t = Math.ceil(now / spacing) * spacing + i * spacing;
      c.position.z = -(t - now) * NOTE_SPEED;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
          <planeGeometry args={[4.7, 0.05]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.18} />
        </mesh>
      ))}
    </group>
  );
}

export function HighwayScene({
  engine,
  getTime,
}: {
  engine: GameEngine;
  getTime: () => number;
}) {
  const wood = useMemo(() => makeWoodTexture(), []);

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
      <fog attach="fog" args={["#000000", 40, 78]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[3, 10, 8]} intensity={2.2} color="#ffe6e0" />
      <spotLight position={[0, 12, 4]} angle={0.7} penumbra={0.6} intensity={90} distance={40} color="#fff2ea" />
      <pointLight ref={spot} position={[0, 6, -14]} distance={60} color="#ff3a3a" intensity={12} />

      {/* stage backdrop */}
      <mesh position={[0, 7.5, -42]}>
        <planeGeometry args={[78, 44]} />
        <meshBasicMaterial color="#000000" fog={false} />
      </mesh>

      {/* highway */}
      <group rotation-x={-Math.PI / 2}>
        <mesh receiveShadow>
          <planeGeometry args={[4.7, 80]} />
          <meshStandardMaterial map={wood} roughness={0.65} metalness={0.15} color="#3a2a20" />
        </mesh>
      </group>
      {/* colored lane laser lines */}
      {[0, 1, 2, 3, 4].map((l) => (
        <mesh key={l} rotation-x={-Math.PI / 2} position={[LANE_X[l as 0], 0.013, -20]}>
          <planeGeometry args={[0.045, 80]} />
          <meshBasicMaterial
            color={LANE_COLORS[l as 0]}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      {/* lane dividers */}
      {[-1.35, -0.45, 0.45, 1.35].map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.014, -20]}>
          <planeGeometry args={[0.02, 80]} />

          <meshBasicMaterial color="#e8e8e8" transparent opacity={0.25} />
        </mesh>
      ))}
      {/* rails */}
      {[-2.42, 2.42].map((x) => (
        <mesh key={x} position={[x, 0.08, -20]}>
          <boxGeometry args={[0.14, 0.16, 80]} />
          <meshStandardMaterial color="#cfd6e0" metalness={0.95} roughness={0.2} />
        </mesh>
      ))}

      <BeatLines getTime={getTime} />
      <Notes engine={engine} getTime={getTime} />
      {[0, 1, 2, 3, 4].map((l) => (
        <Fret key={l} lane={l} engine={engine} />
      ))}

      {/* hit line */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.016, 0]}>
        <planeGeometry args={[4.7, 0.06]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
    </>
  );
}
