import * as fs from "fs";
import * as path from "path";
import { VOICE_ICONS, type VoiceIconShape } from "../src/ui/icons";

const SRC = path.resolve(__dirname, "../src");

/** Absolute end points of a path (enough to bound simple icon artwork). */
function absolutePoints(d: string): [number, number][] {
  const points: [number, number][] = [];
  let x = 0;
  let y = 0;
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  let cmd = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === "z" || cmd === "Z") {
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toLowerCase()) {
      case "m":
      case "l": {
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        break;
      }
      case "h": {
        const nx = num();
        x = rel ? x + nx : nx;
        break;
      }
      case "v": {
        const ny = num();
        y = rel ? y + ny : ny;
        break;
      }
      case "a": {
        i += 5;
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        break;
      }
      default:
        throw new Error(`Unsupported path command "${cmd}" in ${d}`);
    }
    points.push([x, y]);
  }
  return points;
}

describe("Voice icons Unit", () => {
  const entries = Object.entries(VOICE_ICONS) as [string, VoiceIconShape[]][];

  it("defines at least one shape per icon", () => {
    for (const [name, shapes] of entries) {
      expect({ name, count: shapes.length > 0 }).toEqual({
        name,
        count: true,
      });
    }
  });

  it("keeps every shape inside the 24×24 artboard", () => {
    for (const [name, shapes] of entries) {
      for (const shape of shapes) {
        expect(shape.d).toMatch(/^[Mm]/);
        for (const [x, y] of absolutePoints(shape.d)) {
          const inside = x >= 0 && x <= 24 && y >= 0 && y <= 24;
          expect({ name, x, y, inside }).toEqual({ name, x, y, inside: true });
        }
      }
    }
  });

  it("draws the player and mobile bar with Voice icons, not Obsidian's", () => {
    for (const file of ["ui/VoicePlayerView.ts", "utils/MobileControlBar.ts"]) {
      const source = fs.readFileSync(path.join(SRC, file), "utf8");
      expect({ file, usesSetIcon: /\bsetIcon\(/.test(source) }).toEqual({
        file,
        usesSetIcon: false,
      });
    }
  });
});
