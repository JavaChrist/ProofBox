import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SRC = resolve("public/logo.svg");
const OUT = resolve("public");

const sizesPng = [16, 32, 48, 64, 96, 128, 192, 256, 384, 512];

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function gen() {
  const svg = await readFile(SRC);
  await ensureDir(OUT);
  for (const s of sizesPng) {
    const buf = await sharp(svg)
      .resize(s, s, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, `icon-${s}.png`), buf);
  }
  // Apple touch icon (1024, iOS will downscale)
  const apple = await sharp(svg)
    .resize(1024, 1024, { fit: "contain", background: "#0A0C10" })
    .png()
    .toBuffer();
  await writeFile(resolve(OUT, "apple-touch-icon.png"), apple);
  // PWA icons json hint (optional): print list
  console.log(
    "Generated PNG icons:",
    sizesPng.map((s) => `icon-${s}.png`).join(", ")
  );
}

gen().catch((err) => {
  console.error(err);
  process.exit(1);
});
