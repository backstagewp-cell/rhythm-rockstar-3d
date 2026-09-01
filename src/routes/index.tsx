import { createFileRoute } from "@tanstack/react-router";
import { GuitarGame } from "@/components/game/GuitarGame";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "GUITAR TOUR" },
      {
        name: "description",
        content:
          "Play Fade to Black on a full 3D note highway. Real Clone Hero chart and multitrack stems, five frets, sustains, star power and a rock meter.",
      },
      { property: "og:title", content: "Stage Tour — 3D Guitar Rhythm Game" },
      {
        property: "og:description",
        content:
          "A browser guitar rhythm game with a 3D wooden highway, expert chart parsing and live multitrack audio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "resumo curto_large_image" },
    ],
  }),
  component: GuitarGame,
});
