// Generates the synthetic demo photos used by the "샘플 사진" buttons.
//
// They are illustrations, not photographs of real places: no people, no
// readable text, no plates. Run with `node scripts/make-sample-images.mjs`.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "samples");

const scenes = {
  "sidewalk.jpg": `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#cfd8dd"/><stop offset="1" stop-color="#e7ebec"/>
        </linearGradient>
        <linearGradient id="walk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b6b3ac"/><stop offset="1" stop-color="#8e8b84"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#sky)"/>
      <rect x="0" y="300" width="1200" height="600" fill="url(#walk)"/>
      <g stroke="#6f6c66" stroke-width="4" opacity="0.55">
        <line x1="0" y1="420" x2="1200" y2="405"/>
        <line x1="0" y1="560" x2="1200" y2="548"/>
        <line x1="300" y1="300" x2="250" y2="900"/>
        <line x1="760" y1="300" x2="820" y2="900"/>
      </g>
      <path d="M120 560 L360 540 L430 610 L250 650 L120 610 Z" fill="#d8c9a3" opacity="0.85"/>
      <path d="M300 470 L340 500 L310 540 L360 585 L330 640 L300 600 L270 640 L250 590 L285 545 L258 505 Z"
            fill="#5a564f" opacity="0.9"/>
      <path d="M395 545 L520 520 L610 560 L560 610 L430 620 L370 595 Z" fill="#7c7973" opacity="0.85"/>
      <rect x="880" y="430" width="26" height="70" rx="8" fill="#c07a2c"/>
      <rect x="862" y="492" width="62" height="18" rx="6" fill="#e0952f"/>
      <circle cx="230" cy="250" r="52" fill="#eef2f4" opacity="0.55"/>
      <circle cx="980" cy="210" r="38" fill="#eef2f4" opacity="0.4"/>
      <rect x="0" y="0" width="1200" height="26" fill="#3b4249" opacity="0.06"/>
    </svg>`,
  "streetlight.jpg": `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
      <defs>
        <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1d2b3a"/><stop offset="0.6" stop-color="#3a4a55"/>
          <stop offset="1" stop-color="#6b6a5f"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#ffe3a3" stop-opacity="0.9"/>
          <stop offset="1" stop-color="#ffe3a3" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#dusk)"/>
      <rect x="0" y="700" width="1200" height="200" fill="#2c3336"/>
      <g fill="#20262b">
        <rect x="60" y="420" width="180" height="300"/>
        <rect x="300" y="360" width="220" height="360"/>
        <rect x="900" y="400" width="240" height="320"/>
        <rect x="760" y="330" width="120" height="390"/>
      </g>
      <g fill="#f4e5b0" opacity="0.85">
        <rect x="110" y="470" width="40" height="46"/><rect x="170" y="470" width="40" height="46"/>
        <rect x="350" y="410" width="46" height="52"/><rect x="420" y="410" width="46" height="52"/>
        <rect x="950" y="455" width="46" height="50"/><rect x="1020" y="455" width="46" height="50"/>
      </g>
      <rect x="620" y="330" width="22" height="390" fill="#151a1e"/>
      <path d="M631 330 C631 300 700 292 780 300" stroke="#151a1e" stroke-width="18" fill="none"/>
      <ellipse cx="800" cy="296" rx="62" ry="20" fill="#2b3034"/>
      <circle cx="800" cy="296" r="120" fill="url(#glow)" opacity="0.12"/>
      <path d="M0 700 Q300 660 600 704 T1200 692" stroke="#3c4448" stroke-width="10" fill="none"/>
    </svg>`,
  "waste.jpg": `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
      <defs>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9ea39f"/><stop offset="1" stop-color="#7c807b"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#ground)"/>
      <rect x="0" y="560" width="1200" height="340" fill="#6d6f69"/>
      <rect x="60" y="520" width="900" height="14" fill="#8b8f89"/>
      <rect x="760" y="300" width="240" height="300" rx="10" fill="#2f6a4d"/>
      <rect x="760" y="330" width="240" height="40" fill="#275741"/>
      <rect x="820" y="380" width="120" height="90" rx="8" fill="#1f4634"/>
      <g fill="#d8d3c6">
        <path d="M300 640 q-40 -90 20 -150 q60 -40 90 20 q30 70 -5 130 Z"/>
        <path d="M420 660 q-35 -70 15 -120 q55 -25 80 25 q20 60 -10 95 Z" opacity="0.92"/>
      </g>
      <g fill="#5b6f7d">
        <path d="M540 660 q-30 -60 12 -100 q45 -20 68 22 q16 48 -8 78 Z" opacity="0.9"/>
        <path d="M620 690 q-20 -45 8 -78 q38 -14 54 18 q12 40 -6 60 Z" opacity="0.85"/>
      </g>
      <g fill="#7a5b3e">
        <rect x="180" y="640" width="90" height="70" rx="10" transform="rotate(-8 225 675)"/>
        <rect x="700" y="650" width="80" height="60" rx="8" transform="rotate(10 740 680)"/>
      </g>
      <rect x="0" y="0" width="1200" height="900" fill="#000" opacity="0.03"/>
    </svg>`,
};

await fs.mkdir(OUT, { recursive: true });
for (const [file, svg] of Object.entries(scenes)) {
  const jpeg = await sharp(Buffer.from(svg))
    .resize(1200, 900, { fit: "cover" })
    .jpeg({ quality: 82 })
    .toBuffer();
  await fs.writeFile(path.join(OUT, file), jpeg);
  console.log(`wrote public/samples/${file} (${jpeg.byteLength} bytes)`);
}
