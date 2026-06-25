/** Short diagram hints for parameter tooltips (#48). */

export const PARAM_TOOLTIPS: Record<string, string> = {
  length: "Outer X footprint on the build plate.",
  width: "Outer Y footprint — width faces front/back in the viewport.",
  height: "Outer Z from bed to rim (excludes flange thickness).",
  cornerRadius: "Vertical corner round — independent when “sharp vertical corners” is on.",
  wallThickness: "Single-wall thickness — snap to whole perimeters for clean slicer fills.",
  floorThickness: "Solid floor slab — shown as layer count for your layer height.",
  wallDraft: "Taper from floor footprint — positive = wider at the top.",
  baseEdgeType: "How the side wall meets the floor on the outside.",
  chamferAngle: "Wall–floor chamfer angle from horizontal (45° is standard).",
  decoupleVerticalCorners: "Keep vertical corners at the corner radius even with a large foot edge.",
  flangeWidth: "Outward mounting brim at the top — also sets lid plate size.",
  gasketGroove: "Rectangular groove at the rim for foam gasket cord.",
  dividerCols: "Internal partition count along length (0 = off).",
  stackLip: "Inner lip so another bin can nest/stack on top.",
  gridfinityBase: "Standard 42 mm underside clip recesses for grid bins.",
  splitForBed: "On export, split the body STL into bed-sized tiles if needed.",
};
