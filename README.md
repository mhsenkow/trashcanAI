# Parametric Receptacle Generator

A browser-based utility that generates production-ready, custom-dimensioned
containers with **algorithmic surface finishes** baked directly into the mesh —
turning layer-line-prone FDM prints into parts with a deliberate industrial
aesthetic straight off the build plate.

The exterior walls carry the finish; the interior stays perfectly smooth for
easy cleaning; the output is **guaranteed watertight** for reliable slicing.

## Live demo

[https://mhsenkow.github.io/trashcanAI/](https://mhsenkow.github.io/trashcanAI/)

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000  (webpack)
```

`pnpm dev` / `pnpm build` automatically copy the manifold WASM assets into
`public/` (see `scripts/copy-manifold.mjs`). Both pin the **webpack** bundler.

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm serve` (dev on a fixed port
3011 for the preview tooling).

## Features

- **Dimensional controls** — length, width, height, corner radius, wall thickness.
- **Three surfacing archetypes:**
  - **Aero-Ribbing** — vertical or horizontal structural ridges.
  - **Micro-Knurling** — a fine diamond grid that masks layer lines and adds grip.
  - **Procedural Noise** — 3D simplex displacement baked in as a consistent "fuzzy skin".
- **Mounting flange** — optional outward rim at the top so the body hangs in a
  cutout (drop-in bin) instead of falling through; width/thickness controls, and
  the minimum cutout size is reported live.
- **Friction-fit lid** — auto-generated plate (covers the flange) + plug ring sized to the cavity.
- **Binary STL export** for body and lid (millimetres, watertight).
- Live stats: watertight check, outer bounds, drop-in cutout, triangle count, generation time.

## Architecture

```
src/
  app/                     Next.js App Router shell (dark, full-bleed)
  components/
    Studio.tsx             70/30 layout, status overlays, wires the hook
    Viewport.tsx           R3F canvas — studio lighting, grid, exploded lid (ssr:false)
    Sidebar.tsx            Radix controls, live stats, export buttons
    ui/Slider, ui/Segmented  Radix primitives, Tailwind-styled
  lib/
    store.ts               Zustand parameter store (per-field selection)
    useGeometry.ts         worker lifecycle, debounce, latest-wins, main-thread fallback
    exportStl.ts           BufferGeometry build + STLExporter (three-stdlib)
    geometry/
      profile.ts           rounded-rect polygon, arc-length & outward-normal math
      surfacing.ts         displacement fields (rib / knurl / simplex), z-taper
      engine.ts            manifold pipeline (extrude → warp → subtract → lid)
      manifoldModule.ts    lazy WASM loader (runtime import from /public)
      geometry.worker.ts   dedicated module worker running the engine
```

### How the geometry works

1. **Outer hull** — the rounded-rectangle cross-section is extruded to a
   high-density box.
2. **Surfacing** — `manifold.warpBatch` pushes every side-wall vertex *outward
   only* along its exterior normal by the chosen finish. Because displacement is
   non-negative and never touches Z, the specified wall thickness remains the
   **minimum** wall, and the top rim / base stay flat (a smoothstep taper zeroes
   the finish near both caps). Amplitude is auto-clamped to `0.45 × pitch` so
   adjacent features can never fold the surface onto itself.
3. **Hollowing** — a smooth, un-warped inner cavity is `subtract`ed, leaving
   surfaced exterior walls, a smooth interior, and a flat floor.
4. **Lid** — a plate matching the footprint unions with a downward plug ring
   sized to the cavity minus a press-fit clearance.

manifold3d guarantees watertight output at every boolean step, so the exported
STL is solid by construction.

### Why a worker + runtime WASM load

Generation runs in a **dedicated module worker** (latest-wins coalescing) so
slider drags never block the UI. The manifold Emscripten module is imported at
**runtime from `/public`** (`webpackIgnore`/`turbopackIgnore`), which sidesteps
bundler handling of its dual node/browser shims and the `.wasm` fetch entirely.
If the worker can't be created, the hook transparently falls back to
main-thread generation.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Radix UI · Zustand ·
React Three Fiber + drei · three / three-stdlib · **manifold-3d** (WASM) ·
simplex-noise.

## Notes

- Units are millimetres throughout.
- STL is used because slicers universally accept it; the exported triangle soup
  is watertight (manifold's STL caveat is about lossy *re-import*, not the
  geometry written). 3MF would be a natural future addition.
