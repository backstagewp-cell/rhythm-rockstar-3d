import type { HudSnapshot } from "@/lib/engine";
import { LANE_COLORS } from "@/lib/engine";

const KEY_LABELS = ["A", "S", "D", "F", "G"];

export function HUD({
  hud,
  songName,
  artist,
  progress,
  onLanePress,
  onLaneRelease,
}: {
  hud: HudSnapshot;
  songName: string;
  artist: string;
  progress: number;
  onLanePress: (lane: number) => void;
  onLaneRelease: (lane: number) => void;
}) {
  const accuracy = hud.notesHit > 0 ? Math.round((hud.notesHit / Math.max(1, hud.notesTotal)) * 100) : 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {/* top bar */}
      <div className="flex items-start justify-between p-4 md:p-6">
        <div className="rounded-xl border border-border/40 bg-background/50 px-4 py-2 backdrop-blur">
          <p className="font-display text-lg leading-tight tracking-wide text-foreground">{songName}</p>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{artist}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl leading-none text-accent drop-shadow-[0_0_18px_rgba(255,190,60,0.55)] md:text-5xl">
            {hud.score.toLocaleString()}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {accuracy}% · best x{hud.streakBest}
          </p>
        </div>
      </div>

      {/* star power meter */}
      <div className="absolute left-4 top-1/3 w-3 md:left-8">
        <div className="h-48 w-3 overflow-hidden rounded-full border border-border/50 bg-background/60">
          <div
            className="absolute bottom-0 w-3 rounded-full transition-[height] duration-150"
            style={{
              height: `${hud.starPower * 100}%`,
              background: hud.spActive
                ? "linear-gradient(180deg,#fff,#7fd8ff)"
                : "linear-gradient(180deg,#7fd8ff,#2f6fff)",
              boxShadow: "0 0 18px rgba(120,200,255,0.8)",
            }}
          />
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">SP</p>
      </div>

      {/* rock meter */}
      <div className="absolute right-4 top-1/3 md:right-8">
        <div className="relative h-48 w-3 overflow-hidden rounded-full border border-border/50 bg-background/60">
          <div
            className="absolute bottom-0 w-3 rounded-full"
            style={{
              height: `${hud.health * 100}%`,
              background:
                hud.health > 0.55
                  ? "linear-gradient(180deg,#4ade80,#16a34a)"
                  : hud.health > 0.28
                    ? "linear-gradient(180deg,#facc15,#f59e0b)"
                    : "linear-gradient(180deg,#f87171,#dc2626)",
            }}
          />
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">Rock</p>
      </div>

      {/* combo */}
      <div className="absolute left-1/2 top-24 -translate-x-1/2 text-center">
        {hud.combo > 3 && (
          <p className="font-display text-6xl text-foreground/90 drop-shadow-[0_0_24px_rgba(255,60,60,0.6)]">
            x{hud.multiplier}
          </p>
        )}
        {hud.combo > 3 && (
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{hud.combo} streak</p>
        )}
      </div>

      {/* progress */}
      <div className="absolute bottom-0 left-0 h-1 w-full bg-border/30">
        <div className="h-1 bg-primary" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* touch frets */}
      <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2 md:hidden">
        {LANE_COLORS.map((c, i) => (
          <button
            key={i}
            aria-label={`Fret ${KEY_LABELS[i]}`}
            onPointerDown={(e) => {
              e.preventDefault();
              onLanePress(i);
            }}
            onPointerUp={() => onLaneRelease(i)}
            onPointerLeave={() => onLaneRelease(i)}
            className="h-14 w-14 rounded-full border-2 active:scale-95"
            style={{ borderColor: c, background: `${c}33`, boxShadow: `0 0 20px ${c}66` }}
          />
        ))}
      </div>

      {/* key hints */}
      <div className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 gap-3 text-xs uppercase tracking-[0.25em] text-muted-foreground md:flex">
        {KEY_LABELS.map((k, i) => (
          <span key={k} style={{ color: LANE_COLORS[i] }}>
            {k}
          </span>
        ))}
        <span className="ml-4">Shift = Star Power</span>
      </div>
    </div>
  );
}
