"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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
import * as THREE from "three";
import { partToBufferGeometry } from "@/lib/exportStl";
import { cameraForPreset } from "@/lib/viewPresets";
import { useViewStore } from "@/lib/viewStore";
import { useUiStore } from "@/lib/uiStore";
import { useParamStore } from "@/lib/store";
import { usePrinterStore } from "@/lib/printStore";
import { MATERIALS, type MaterialId } from "@/lib/printProfiles";
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
  ghost = false,
  overhangHeatmap = false,
  wallHeatmap = false,
  wallT = 1,
  halfL = 100,
  halfW = 70,
  layerStepMm = 0,
  clipPlane = null as THREE.Plane | null,
  materialColor = "#bac0c8",
  materialRoughness = 0.42,
  materialPreview = true,
}: {
  part: GeneratedPart;
  zOffset?: number;
  accent?: boolean;
  ghost?: boolean;
  overhangHeatmap?: boolean;
  wallHeatmap?: boolean;
  wallT?: number;
  halfL?: number;
  halfW?: number;
  layerStepMm?: number;
  clipPlane?: THREE.Plane | null;
  materialColor?: string;
  materialRoughness?: number;
  materialPreview?: boolean;
}) {
  const geometry = useMemo(
    () =>
      partToBufferGeometry(part, {
        overhangHeatmap,
        wallHeatmap,
        wallT,
        halfL,
        halfW,
        layerStepMm,
      }),
    [part, overhangHeatmap, wallHeatmap, wallT, halfL, halfW, layerStepMm],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const vertexColors =
    (overhangHeatmap || wallHeatmap) && !!geometry.getAttribute("color");
  const useFilament = materialPreview && !vertexColors;

  return (
    <mesh geometry={geometry} position={[0, 0, zOffset]} castShadow receiveShadow>
      <meshPhysicalMaterial
        vertexColors={vertexColors}
        color={vertexColors ? "#ffffff" : useFilament ? materialColor : accent ? "#8d949d" : "#bac0c8"}
        metalness={useFilament ? 0.08 : vertexColors ? 0.15 : 0.68}
        roughness={useFilament ? materialRoughness : vertexColors ? 0.55 : 0.42}
        clearcoat={ghost ? 0.15 : useFilament ? 0.12 : 0.4}
        clearcoatRoughness={0.32}
        envMapIntensity={useFilament ? 0.45 : vertexColors ? 0.35 : 1.1}
        transparent={ghost}
        opacity={ghost ? 0.42 : 1}
        depthWrite={!ghost}
        clipShadows={false}
        {...(clipPlane ? { clippingPlanes: [clipPlane] } : {})}
      />
    </mesh>
  );
}

function StudioEnvironment() {
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

type MinimalControls = {
  target: { set: (x: number, y: number, z: number) => void };
  update: () => void;
} | null;

function CameraRig({ maxDim, bodyHeight }: { maxDim: number; bodyHeight: number }) {
  const frameNonce = useViewStore((s) => s.frameNonce);
  const viewNonce = useViewStore((s) => s.viewNonce);
  const activePreset = useViewStore((s) => s.activePreset);
  const autoOrbit = useUiStore((s) => s.autoOrbit);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as MinimalControls;
  const dims = useRef({ maxDim, bodyHeight });
  const t0 = useRef(0);

  useEffect(() => {
    dims.current = { maxDim, bodyHeight };
  }, [maxDim, bodyHeight]);

  useEffect(() => {
    const { maxDim: d, bodyHeight: h } = dims.current;
    const preset = activePreset ?? "iso";
    const { position, target } = cameraForPreset(preset, d, h);
    camera.position.set(...position);
    camera.near = 1;
    camera.far = d * 40;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...target);
      controls.update();
    }
  }, [frameNonce, viewNonce, activePreset, camera, controls]);

  useFrame((state) => {
    if (!autoOrbit) return;
    t0.current += state.clock.getDelta();
    const d = dims.current.maxDim * 1.9 + 30;
    const a = t0.current * 0.22;
    camera.position.x = Math.cos(a) * d;
    camera.position.z = Math.sin(a) * d;
    camera.lookAt(0, dims.current.bodyHeight * 0.42, 0);
  });

  return null;
}

function LidAnimator({
  baseZ,
  animate,
  children,
}: {
  baseZ: number;
  animate: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.z = animate
      ? baseZ + Math.sin(state.clock.elapsedTime * 1.2) * 8 + 4
      : baseZ;
  });
  return <group ref={ref}>{children}</group>;
}

export default function Viewport({
  geometry,
  generation = 0,
}: {
  geometry: GeneratedGeometry | null;
  generation?: number;
}) {
  const bodyHeight = geometry?.stats.outerDims[2] ?? 60;
  const maxDim = geometry
    ? Math.max(geometry.stats.outerDims[0], geometry.stats.outerDims[1], geometry.stats.outerDims[2])
    : 100;
  const camDist = maxDim * 1.7 + 30;
  const visibleGap = Math.max(10, bodyHeight * 0.2);
  const clearActivePreset = useViewStore((s) => s.clearActivePreset);
  const overhangHeatmap = useViewStore((s) => s.overhangHeatmap);
  const lidInPlace = useViewStore((s) => s.lidInPlace);
  const layerStepPreview = useUiStore((s) => s.layerStepPreview);
  const clipEnabled = useUiStore((s) => s.clipEnabled);
  const clipHeight = useUiStore((s) => s.clipHeight);
  const wallHeatmap = useUiStore((s) => s.wallHeatmap);
  const materialPreview = useUiStore((s) => s.materialPreview);
  const lidAnimate = useUiStore((s) => s.lidAnimate);
  const material = useParamStore((s) => s.material);
  const wallT = useParamStore((s) => s.wallThickness);
  const length = geometry?.stats.nominalDims[0] ?? useParamStore.getState().length;
  const width = geometry?.stats.nominalDims[1] ?? useParamStore.getState().width;
  const height = geometry?.stats.nominalDims[2] ?? useParamStore.getState().height;
  const layerHeight = usePrinterStore((s) => s.layerHeight);
  const mat = MATERIALS[material as MaterialId] ?? MATERIALS.pla;

  const lidSeatZ = geometry?.lid ? bodyHeight - minZ(geometry.lid.positions) : 0;
  const lidZOffset = geometry?.lid
    ? lidInPlace
      ? lidSeatZ
      : lidSeatZ + visibleGap
    : 0;

  const clipPlane = useMemo(() => {
    if (!clipEnabled) return null;
    const z = clipHeight * bodyHeight;
    return new THREE.Plane(new THREE.Vector3(0, 0, -1), z);
  }, [clipEnabled, clipHeight, bodyHeight]);

  const halfL = length / 2;
  const halfW = width / 2;

  return (
    <Canvas
      flat
      shadows
      dpr={[1, 2]}
      gl={{ antialias: false, preserveDrawingBuffer: false, localClippingEnabled: clipEnabled }}
      camera={{ position: [camDist, camDist * 0.78, camDist], fov: 40, near: 1, far: maxDim * 40 }}
    >
      <color attach="background" args={["#0a0b0d"]} />
      <fog attach="fog" args={[0x0a0b0d, camDist * 1.7, camDist * 4.2]} />

      <hemisphereLight intensity={0.25} groundColor="#0a0b0d" color="#cdd6e3" />
      <directionalLight position={[40, 80, 30]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-50, 30, -40]} intensity={0.35} color="#8fb4ff" />

      <StudioEnvironment />

      <group key={generation} rotation={[-Math.PI / 2, 0, 0]}>
        {geometry && (
          <PartMesh
            part={geometry.body}
            overhangHeatmap={overhangHeatmap}
            wallHeatmap={wallHeatmap}
            wallT={wallT}
            halfL={halfL}
            halfW={halfW}
            layerStepMm={layerStepPreview ? layerHeight : 0}
            clipPlane={clipPlane}
            materialColor={mat.previewColor}
            materialRoughness={mat.previewRoughness}
            materialPreview={materialPreview}
          />
        )}
        {geometry?.lid && (
          <LidAnimator baseZ={lidZOffset} animate={lidAnimate && lidInPlace}>
            <PartMesh
              part={geometry.lid}
              accent
              ghost={lidInPlace}
              overhangHeatmap={overhangHeatmap}
              clipPlane={clipPlane}
              materialColor={mat.previewColor}
              materialRoughness={mat.previewRoughness}
              materialPreview={materialPreview}
            />
          </LidAnimator>
        )}
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
        minDistance={maxDim * 0.35}
        maxDistance={maxDim * 9}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
        onStart={() => clearActivePreset()}
      />
      <CameraRig maxDim={maxDim} bodyHeight={bodyHeight} />

      {geometry && (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={5} distanceFalloff={1} intensity={2.6} quality="medium" color="black" />
          <Bloom intensity={0.22} luminanceThreshold={1.0} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette offset={0.32} darkness={0.5} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
