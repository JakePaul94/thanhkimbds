/**
 * Tạo nội dung file SRT từ các segment có thời gian.
 */
export function buildSrt(segments: Array<{ startSec: number; endSec: number; text: string }>): string {
  return segments
    .map((s, i) => {
      const start = formatSrtTime(s.startSec);
      const end = formatSrtTime(s.endSec);
      return `${i + 1}\n${start} --> ${end}\n${s.text.trim()}\n`;
    })
    .join("\n");
}

/**
 * Tạo file ASS với style đẹp, căn giữa. Dùng cho ffmpeg ass filter.
 */
function wrapText(text: string, charsPerLine: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (current && (current + " " + w).length > charsPerLine) {
      lines.push(current);
      current = w;
    } else {
      current = current ? current + " " + w : w;
    }
  }
  if (current) lines.push(current);
  return lines.join("\\N");
}

export type AssStyleOverrides = {
  fontSize?: number;
  charsPerLine?: number;
  videoWidth?: number;
  videoHeight?: number;
};

export function buildAss(
  segments: Array<{ startSec: number; endSec: number; text: string }>,
  styleOverrides: AssStyleOverrides = {}
): string {
  const fs = styleOverrides.fontSize ?? 24;
  const charsPerLine = styleOverrides.charsPerLine ?? 18;
  const w = styleOverrides.videoWidth ?? 1920;
  const h = styleOverrides.videoHeight ?? 1080;
  const header = `[Script Info]
Title=
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${w}
PlayResY: ${h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fs},&H00FFFFFF,&H000000FF,&H00000000,&H40000000,-1,0,0,0,100,100,0,0,1,2,2,5,20,20,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = segments.map((s) => {
    const start = formatAssTime(s.startSec);
    const end = formatAssTime(s.endSec);
    const text = wrapText(s.text.trim(), charsPerLine);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });
  return header + lines.join("\n");
}

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function formatAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}
