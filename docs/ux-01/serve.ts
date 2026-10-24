// UX-01 only: fixed local artifact allowlist; never serves the repository or native IPC.
const files = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/preview.css", "preview.css"],
  ["/preview.js", "preview.js"],
  ["/README.md", "README.md"],
]);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4174,
  fetch(request) {
    const path = files.get(new URL(request.url).pathname);
    if (request.method !== "GET" || !path) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(new URL(path, import.meta.url)), {
      headers: {
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
});
console.log(`UX-01 synthetic design preview: ${server.url}`);
