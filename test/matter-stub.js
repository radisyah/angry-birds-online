/* Pengganti matter-js KHUSUS TES (sandbox tanpa internet): cukup agar game bisa memuat soal & blok; tidak ada fisika. */
(() => {
  const body = (x, y, o) => Object.assign({ position: { x, y }, velocity: { x: 0, y: 0 }, angle: 0, angularVelocity: 0, speed: 0, mass: 1 }, o || {});
  window.Matter = {
    Engine: { create: () => ({ world: { bodies: [] }, gravity: { x: 0, y: 1, scale: .001 }, positionIterations: 6, velocityIterations: 4 }), update() { } },
    Bodies: { rectangle: (x, y, w, h, o) => body(x, y, o), circle: (x, y, r, o) => body(x, y, o) },
    Composite: { add() { }, remove() { }, clear() { } },
    Body: { scale() { }, set() { }, setAngle() { }, setAngularVelocity() { }, setDensity() { }, setPosition(b, p) { b.position = { x: p.x, y: p.y }; }, setVelocity(b, v) { b.velocity = v; } },
    Events: { on() { } },
    Vector: { magnitude: v => Math.hypot(v.x, v.y), sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }) }
  };
})();
