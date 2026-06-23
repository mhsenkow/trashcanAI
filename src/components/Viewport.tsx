"use client";

// The interactive 3D viewport. Renders the generated body (and exploded lid)
// with a studio-lit, lightly anodized material and a filmic post chain so the
// algorithmic surfacing reads photographically — ambient occlusion in the
// grooves and cavity does most of the realism work. Z-up geometry is rotated
// into the scene's Y-up world so the part rests on the "build plate" grid.

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import {
  Bloom,
  EffectComposer,
  N8AO,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { partToBufferGeometry } from "@/lib/exportStl";
import type { GeneratedGeometry, GeneratedPart } from "@/lib/types";

function minZ(positions: Float32Array): number {
  let m = Infinity;
  for (let i = 2; i < positions.length; i += 3) if (positions[i] < m) m = positions[i];
  return m === Infinity ? 0 : m;
}

function PartMesh({
  part,
  zOffset = 0,
  accent = false,
}: {
  part: GeneratedPart;
  zOffset?: number;
  accent?: boolean;
}) {
  const geometry = useMemo(() => partToBufferGeometry(part), [part]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, 0, zOffset]} castShadow receiveShadow>
      <meshPhysicalMaterial
        color={accent ? "#8d949d" : "#bac0c8"}
        metalness={0.68}
        roughness={0.42}
        clearcoat={0.4}
        clearcoatRoughness={0.32}
        envMapIntensity={1.1}
      />
    </mesh>
  );
}

function StudioEnvironment() {
  // A self-contained environment (no network fetch) for crisp metal reflections:
  // a key softbox, an overhead strip, warm/cool rims, and a circular catch-light.
  return (
    <Environment resolution={512} frames={1}>
      <color attach="background" args={["#0b0d11"]} />
      <Lightformer form="rect" intensity={3.2} position={[2, 5, 6]} rotation={[-0.6, 0, 0]} scale={[12, 8, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={2.4} position={[0, 9, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 4, 1]} color="#eaf1ff" />
      <Lightformer form="rect" intensity={1.6} position={[8, 2, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[8, 6, 1]} color="#ffd6a0" />
      <Lightformer form="rect" intensity={1.4} position={[-8, 3, -3]} rotation={[0, Math.PI / 2.4, 0]} scale={[8, 6, 1]} color="#a9c7ff" />
      <Lightformer form="ring" intensity={2} position={[-4, 6, 5]} scale={2.5} color="#ffffff" />
    </Environment>
  );
}

export default function Viewport({
  geometry,
}: {
  geometry: GeneratedGeometry | null;
}) {
  const bodyHeight = geometry?.stats.outerDims[2] ?? 60;
  const maxDim = geometry
    ? Math.max(geometry.stats.outerDims[0], geometry.stats.outerDims[1], geometry.stats.outerDims[2])
    : 100;
  const camDist = maxDim * 1.7 + 30;
  const visibleGap = Math.max(10, bodyHeight * 0.2);
  const lidZOffset = geometry?.lid
    ? bodyHeight + visibleGap - minZ(geometry.lid.positions)
    : 0;

  return (
    <Canvas
      flat
      shadows
      dpr={[1, 2]}
      gl={{ antialias: false, preserveDrawingBuffer: false }}
      camera={{ position: [camDist, camDist * 0.75, camDist], fov: 40, near: 1, far: maxDim * 40 }}
    >
      <color attach="background" args={["#0a0b0d"]} />
      <fog attach="fog" args={["#0a0b0d", camDist * 1.7, camDist * 4.2]} />

      <hemisphereLight intensity={0.25} groundColor="#0a0b0d" color="#cdd6e3" />
      <directionalLight position={[40, 80, 30]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-50, 30, -40]} intensity={0.35} color="#8fb4ff" />

      <StudioEnvironment />

      <group rotation={[-Math.PI / 2, 0, 0]}>
        {geometry && <PartMesh part={geometry.body} />}
        {geometry?.lid && <PartMesh part={geometry.lid} zOffset={lidZOffset} accent />}
      </group>

      <ContactShadows
        position={[0, 0, 0]}
        scale={maxDim * 3}
        far={maxDim}
        blur={2.8}
        opacity={0.55}
        resolution={1024}
        color="#000000"
      />
      <Grid
        position={[0, -0.02, 0]}
        args={[10, 10]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#161b21"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#252d36"
        fadeDistance={camDist * 3.5}
        fadeStrength={1.4}
        infiniteGrid
        followCamera={false}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, bodyHeight * 0.42, 0]}
        minDistance={maxDim * 0.6}
        maxDistance={maxDim * 8}
        maxPolarAngle={Math.PI / 1.9}
      />

      <EffectComposer multisampling={4} enableNormalPass>
        <N8AO aoRadius={5} distanceFalloff={1} intensity={2.6} quality="medium" color="black" />
        <Bloom intensity={0.22} luminanceThreshold={1.0} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette offset={0.32} darkness={0.5} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
