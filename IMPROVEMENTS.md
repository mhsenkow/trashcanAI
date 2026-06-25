# Receptacle Generator — Improvement Tracker

50 improvements across print-correctness, fit/material, edge-feature refinement,
container function, viewport, parameter UX, and workflow. Implemented in waves;
the app stays compiling + watertight between waves.

**Legend:** ✅ done & verified · 🟡 in progress / partial · ⬜ not started

---

## A. Print correctness & slicer integration
- ✅ 1. Wall thickness in line-width multiples — perimeter count + "snap" button under Wall slider
- ✅ 2. Floor/top thickness shown in layers (× layer height)
- ⬜ 3. Overhang heatmap overlay (faces > 45°, support estimate)
- ⬜ 4. Brim-underside support relief (auto-draft/chamfer the flange underside)
- 🟡 5. Elephant-foot relief — guidance note added (base chamfer relieves it); auto first-layer XY compensation still TODO
- ⬜ 6. Layer-height-aware preview (stair-stepping simulation)
- ✅ 7. Min-feature guard — warns when surfacing depth < line width
- ✅ 8. Print metrics — filament length, mass, rough time from printed volume
- ⬜ 9. Export 3MF + STEP alongside STL
- ⬜ 10. Plate layout (arrange body+lid) + print-settings note card

## B. Fit, tolerance & material
- ✅ 11. Material profile selector (PLA/PETG/ABS/ASA/Nylon/TPU) + per-material note
- ✅ 12. Shrinkage compensation — optional uniform up-scale on export, per material
- ✅ 13. Lid-fit presets (press/snug/slip) — drives material-aware clearance
- ⬜ 14. Lid engagement visualization (seat animation, interference check)
- ⬜ 15. Gasket groove option in the lid/rim
- ⬜ 16. Tolerance test-strip generator
- ⬜ 17. Heat-set insert / screw bosses
- ✅ 18. Warp-risk readout for large flat footprints (shrink-prone materials)

## C. Refining the edge features
- ⬜ 19. Independent vertical-corner vs foot control (sharp sides + round foot)
- ⬜ 20. Per-edge selection (round/chamfer only chosen edges)
- ⬜ 21. Variable / asymmetric base edge
- ⬜ 22. Adjustable chamfer angle (not just 45°)
- ⬜ 23. Rolled / beaded top rim option
- ⬜ 24. 2D cross-section profile preview of the active edge
- ✅ 25. Interior floor-wall fillet — independent control (rounds inside bottom even with a sharp foot)
- ⬜ 26. Cove "fits under brim" live feedback
- ✅ 27. Recessed foot ring (perimeter-only bed contact)

## D. Functional container features
- ⬜ 28. Gridfinity-compatible base + magnet/screw holes
- ⬜ 29. Internal dividers / N×M compartments
- ⬜ 30. Stacking & nesting (nesting taper + stacking lip)
- ⬜ 31. Finger scoop / front access cutout
- ⬜ 32. Handles (side grips / cutout / bail)
- ⬜ 33. Recessed label area / label slot
- ✅ 34. Drainage / weep holes (auto grid through the floor, adjustable diameter)
- ⬜ 35. Ventilation slots / perforated wall zones
- ⬜ 36. Wall-mount features (French cleat / keyholes / magnet pockets)
- ⬜ 37. Split-for-bed (segment oversized bins into keyed tiles)

## E. Viewport & inspection
- ⬜ 38. Section / clip-plane view
- ⬜ 39. Wall-thickness heatmap
- ⬜ 40. In-viewport measure tool + persistent bbox dimensions
- ⬜ 41. Lid ghost/overlay in place (not just exploded)
- ⬜ 42. Auto-orbit / turntable + smarter framing
- ⬜ 43. Real material/finish preview (filament color + matte/satin)

## F. Parameter UX & controls
- ⬜ 44. Undo/redo with history + keyboard shortcuts
- ⬜ 45. Scrubbable number fields + arrow-key nudge
- ⬜ 46. Units toggle (mm ⇄ in)
- ✅ 47. Validation/status panel — manifold, min-wall, material, metrics, warp/feature warnings (overhang heatmap tracked in #3)
- ⬜ 48. Diagram tooltips per parameter

## G. Presets, sharing & workflow
- ⬜ 49. Shareable config URLs + thumbnail preset gallery
- ⬜ 50. "Design-intent" starting points (goal-based bundles)

---

## Progress log
_(newest first)_

### Wave 2 — Base & Floor ✅ (#25, 27, 34) · 🟡 (#5)
- New params: `footRing`, `drainHoles`, `drainHoleDiameter`, `interiorFillet`.
- Engine: drainage holes punched as an auto grid of cylinders (capped 8×8, inset from walls); recessed foot ring subtracted from the underside; independent interior wall→floor fillet in the cavity warp. All removed in single booleans → stays watertight.
- New **Base & Floor** sidebar section (underside flat/foot-ring, interior fillet, drainage on/off + diameter) with an elephant-foot guidance note.
- Verified watertight at 38k tris with all three active; typecheck clean.

### Wave 1 — Print Readiness ✅ (#1, 2, 7, 8, 11, 12, 13, 18, 47)
- New `printProfiles.ts` (material data + helpers) and `printStore.ts` (nozzle, layer height).
- Added params: `material`, `lidFit`, `compensateShrink`; engine now reports printed `bodyVolume`/`lidVolume` and applies optional shrink up-scale.
- New **Print Setup** sidebar section (material, nozzle, layer height, shrink toggle).
- Wall slider shows perimeter count + "snap to multiple"; flags sub-min-wall. Floor shows solid-layer count.
- Lid gained material-aware **Fit** presets (press/snug/slip).
- Output panel now shows filament length, mass, rough time, min-wall status, and warp / too-fine-feature warnings.
- Verified watertight; typecheck clean.
