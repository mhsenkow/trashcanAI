"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { buildSdfState } from "@/lib/sdf/state";
import { sdfFragmentShader, sdfVertexShader } from "@/lib/sdf/shaders/raymarch";
import { applyUniforms, stateToUniforms } from "@/lib/sdf/uniforms";
import { useGenerationParams } from "@/lib/store";
import { cameraForPreset } from "@/lib/viewPresets";
import { useViewStore } from "@/lib/viewStore";
import type { ReceptacleParams } from "@/lib/types";

const invProjection = new THREE.Matrix4();
const invView = new THREE.Matrix4();

function RaymarchPass({ params }: { params: ReceptacleParams }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera, size } = useThree();
  const st = useMemo(() => buildSdfState(params), [params]);

  const uniforms = useMemo(() => {
    const u = stateToUniforms(st);
    return {
      ...u,
      uCamPos: { value: new THREE.Vector3() },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uHalfLWH: { value: new THREE.Vector3(st.halfL, st.halfW, st.H) },
      uInvProjection: { value: new THREE.Matrix4() },
      uInvView: { value: new THREE.Matrix4() },
    };
  }, [st, size.width, size.height]);

  useFrame(() => {
    const mat = materialRef.current;
    if (!mat) return;

    mat.uniforms.uCamPos.value.copy(camera.position);
    mat.uniforms.uResolution.value.set(size.width, size.height);

    invProjection.copy(camera.projectionMatrix).invert();
    invView.copy(camera.matrixWorld);
    mat.uniforms.uInvProjection.value.copy(invProjection);
    mat.uniforms.uInvView.value.copy(invView);

    applyUniforms(mat, st);
  });

  return (
    <mesh frustumCulled={false} renderOrder={10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={sdfVertexShader}
        fragmentShader={sdfFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function CameraRig({ maxDim, bodyHeight }: { maxDim: number; bodyHeight: number }) {
  const frameNonce = useViewStore((s) => s.frameNonce);
  const viewNonce = useViewStore((s) => s.viewNonce);
  const activePreset = useViewStore((s) => s.activePreset);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  } | null;

  useEffect(() => {
    const preset = activePreset ?? "iso";
    const { position, target } = cameraForPreset(preset, maxDim, bodyHeight);
    camera.position.set(...position);
    camera.near = 1;
    camera.far = maxDim * 40;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...target);
      controls.update();
    }
  }, [frameNonce, viewNonce, activePreset, camera, controls, maxDim, bodyHeight]);

  return null;
}

function SdfScene() {
  const params = useGenerationParams();
  const maxDim = Math.max(params.length, params.width, params.height) * 1.2;
  const bodyHeight = params.height;
  const camDist = maxDim * 1.7 + 30;
  const clearActivePreset = useViewStore((s) => s.clearActivePreset);

  return (
    <>
      <color attach="background" args={["#0a0b0d"]} />
      <fog attach="fog" args={[0x0a0b0d, camDist * 1.7, camDist * 4.2]} />
      <hemisphereLight intensity={0.2} groundColor="#0a0b0d" color="#cdd6e3" />

      <RaymarchPass params={params} />

      <ContactShadows
        position={[0, 0, 0]}
        scale={maxDim * 3}
        far={maxDim}
        blur={2.5}
        opacity={0.45}
        resolution={512}
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
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, bodyHeight * 0.42, 0]}
        minDistance={maxDim * 0.35}
        maxDistance={maxDim * 9}
        onStart={() => clearActivePreset()}
      />
      <CameraRig maxDim={maxDim} bodyHeight={bodyHeight} />
    </>
  );
}

export default function SdfViewport() {
  const params = useGenerationParams();
  const maxDim = Math.max(params.length, params.width, params.height);
  const camDist = maxDim * 1.7 + 30;

  return (
    <Canvas
      flat
      dpr={[1, 1.5]}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      camera={{ position: [camDist, camDist * 0.78, camDist], fov: 40, near: 1, far: maxDim * 40 }}
    >
      <SdfScene />
    </Canvas>
  );
}
