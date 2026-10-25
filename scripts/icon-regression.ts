import { fileURLToPath } from "node:url";

import { file } from "bun";

// Static asset checks only; native shell rendering and contrast require owner acceptance.
export async function runIconRegression(): Promise<number> {
  let assertions = 0;
  function assert(condition: unknown, message: string): asserts condition {
    assertions += 1;
    if (!condition) throw new Error(message);
  }
  const root = new URL("../", import.meta.url);
  const installed: {
    destination: string;
    sha256: string;
    source?: string;
    source_sha256?: string;
  }[] = await file(new URL("docs/assets/icon-01/installed-assets.json", root)).json();
  for (const asset of installed) {
    const bytes = Buffer.from(await file(new URL(asset.destination, root)).arrayBuffer());
    assert(
      new Bun.CryptoHasher("sha256").update(bytes).digest("hex") === asset.sha256,
      `${asset.destination}: approved asset integrity`,
    );
    if (asset.source_sha256) {
      assert(typeof asset.source === "string", "derived asset identifies its source mask");
      const source = await file(new URL(asset.source, root)).arrayBuffer();
      assert(
        new Bun.CryptoHasher("sha256").update(source).digest("hex") === asset.source_sha256,
        `${asset.destination}: unchanged approved derivation source`,
      );
    }
    if (asset.destination.endsWith(".png") && !asset.destination.startsWith("docs/")) {
      assert(bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "PNG signature");
      assert(bytes.readUInt32BE(16) === bytes.readUInt32BE(20), "square production PNG");
      assert(bytes[24] === 8 && bytes[25] === 6, "8-bit RGBA production PNG");
      const traySize = /tray\/fern-(?:dark|light|neutral)-(\d+)\.png$/.exec(asset.destination)?.[1];
      if (traySize)
        assert(bytes.readUInt32BE(16) === Number(traySize), "exact tray PNG dimensions");
    }
    if (asset.destination.endsWith(".ico")) {
      assert(bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1, "ICO header");
      const count = bytes.readUInt16LE(4);
      assert(count > 0 && 6 + count * 16 <= bytes.length, "ICO directory");
      for (let i = 0; i < count; i += 1) {
        const entry = 6 + i * 16;
        const length = bytes.readUInt32LE(entry + 8);
        const offset = bytes.readUInt32LE(entry + 12);
        assert(offset >= 6 + count * 16 && offset + length <= bytes.length, "ICO entry bounds");
      }
    }
    if (asset.destination.endsWith(".icns")) {
      assert(bytes.toString("ascii", 0, 4) === "icns", "ICNS signature");
      assert(bytes.readUInt32BE(4) === bytes.length, "ICNS declared length");
      let offset = 8;
      while (offset < bytes.length) {
        assert(offset + 8 <= bytes.length, "ICNS chunk header");
        const length = bytes.readUInt32BE(offset + 4);
        assert(length >= 8 && offset + length <= bytes.length, "ICNS chunk bounds");
        offset += length;
      }
      assert(offset === bytes.length, "ICNS complete container");
    }
  }
  const config = await file(new URL("src-tauri/tauri.conf.json", root)).json();
  for (const icon of config.bundle.icon as string[]) {
    assert(await file(new URL(`src-tauri/${icon}`, root)).exists(), `bundle icon exists: ${icon}`);
  }
  const html = await file(new URL("index.html", root)).text();
  const links = [...html.matchAll(/<link\s+[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)];
  assert(links.length === 4, "four explicit browser icon links");
  for (const [link] of links) {
    const href = /href="([^"]+)"/.exec(link)?.[1];
    assert(href?.startsWith("/") && !href.startsWith("//"), "local browser icon reference");
    assert(await file(new URL(`public${href}`, root)).exists(), `Vite public icon exists: ${href}`);
  }
  const rust = await file(new URL("src-tauri/src/lib.rs", root)).text();
  assert(
    /#\[cfg\(target_os = "macos"\)\]\s+const TRAY_ICON_BYTES: &\[u8\] = include_bytes!\("\.\.\/icons\/tray\/fern-dark-32\.png"\);/.test(
      rust,
    ),
    "macOS selects the original monochrome mask",
  );
  assert(
    /#\[cfg\(not\(target_os = "macos"\)\)\]\s+const TRAY_ICON_BYTES: &\[u8\] = include_bytes!\("\.\.\/icons\/tray\/fern-neutral-32\.png"\);/.test(
      rust,
    ),
    "Windows/Linux select the static neutral fallback",
  );
  assert(!rust.includes('include_bytes!("../icons/32x32.png")'), "tray never embeds the app tile");
  assert(rust.includes('.icon_as_template(cfg!(target_os = "macos"))'), "macOS template rendering");
  const inventory = await file(new URL("docs/assets/icon-01/source-inventory.json", root)).json();
  assert(inventory.asset_root === "<owner-local-extracted-assets>", "portable provenance root");
  for await (const path of new Bun.Glob("**/*.{md,json,txt,py}").scan(
    fileURLToPath(new URL("docs/assets/icon-01/", root)),
  )) {
    const text = await file(
      new URL(`docs/assets/icon-01/${path.replaceAll("\\", "/")}`, root),
    ).text();
    assert(!/\b[a-z]:[\\/]|\/(?:Users|home)\//i.test(text), `portable documentation: ${path}`);
  }
  return assertions;
}
