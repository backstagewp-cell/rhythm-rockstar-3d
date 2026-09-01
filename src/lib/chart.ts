import { Midi } from "@tonejs/midi";

export interface ChartNote {
  time: number;
  lane: number; // 0..4 green..orange
  duration: number;
  sp: boolean;
}

export interface Chart {
  notes: ChartNote[];
  duration: number;
  spPhrases: number;
}

const DIFFICULTY_BASE = 96; // Expert: 96..100

/** Parses a Clone Hero style notes.mid into the Expert guitar chart. */
export async function loadChart(url: string): Promise<Chart> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load chart (${res.status})`);
  const midi = new Midi(await res.arrayBuffer());

  const track =
    midi.tracks.find((t) => t.name === "PART GUITAR") ??
    midi.tracks.find((t) => (t.name ?? "").includes("GUITAR")) ??
    midi.tracks[0];
  if (!track) throw new Error("No guitar track found in notes.mid");

  const spRanges = track.notes
    .filter((n) => n.midi === 116)
    .map((n) => [n.time, n.time + n.duration] as const);

  const notes: ChartNote[] = track.notes
    .filter((n) => n.midi >= DIFFICULTY_BASE && n.midi <= DIFFICULTY_BASE + 4)
    .map((n) => ({
      time: n.time,
      lane: n.midi - DIFFICULTY_BASE,
      duration: n.duration > 0.18 ? n.duration : 0,
      sp: spRanges.some(([a, b]) => n.time >= a - 0.001 && n.time < b),
    }))
    .sort((a, b) => a.time - b.time || a.lane - b.lane);

  return { notes, duration: midi.duration, spPhrases: spRanges.length };
}
