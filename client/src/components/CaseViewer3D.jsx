import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, RoundedBox, useTexture } from "@react-three/drei";
import { getPartImage } from "../utils/partMedia";

const toUnits = (mm, fallback) => {
  const value = Number(mm);
  const safe = Number.isFinite(value) && value > 0 ? value : fallback;
  return safe / 100;
};

function CaseModel({ casePart, gpuPart, motherboardPart, cpuPart, ramPart, psuPart, coolerPart }) {
  const width = toUnits(casePart?.specs?.widthMm, 230);
  const height = toUnits(casePart?.specs?.heightMm, 470);
  const depth = toUnits(casePart?.specs?.depthMm, 470);
  
  // Use a default texture or part image if available
  let imageTexture = null;
  try {
    imageTexture = useTexture(getPartImage(casePart));
  } catch (e) {
    // Fallback if texture fails to load
  }

  const gpuLength = toUnits(gpuPart?.specs?.lengthMm, 300);
  const gpuFits = !gpuPart || gpuLength <= toUnits(casePart?.specs?.gpuMaxLengthMm, 350);

  const boardFormFactor = motherboardPart?.specs?.formFactor || "";
  const boardScale = boardFormFactor === "ATX" ? 1 : boardFormFactor === "Micro ATX" ? 0.85 : boardFormFactor === "Mini ITX" ? 0.7 : 1;

  const bodyColor = "#1a1a1a";
  const frameColor = "#2d2d2d";
  const glassColor = "#a0c4ff";
  const gpuColor = gpuFits ? "#4a90e2" : "#e74c3c";
  const mbColor = "#2c3e50";
  const cpuColor = "#95a5a6";
  const ramColor = "#34495e";
  const psuColor = "#2c3e50";
  const coolerColor = "#bdc3c7";

  return (
    <group position={[0, 0, 0]}>
      {/* Main Case Body */}
      <RoundedBox args={[width, height, depth]} radius={0.02} smoothness={4}>
        <meshStandardMaterial color={bodyColor} metalness={0.5} roughness={0.2} />
      </RoundedBox>

      {/* Glass Side Panel */}
      <RoundedBox
        args={[width * 0.98, height * 0.92, 0.01]}
        radius={0.01}
        smoothness={4}
        position={[0, 0, depth / 2 + 0.005]}
      >
        <meshPhysicalMaterial
          color={glassColor}
          transmission={0.9}
          transparent
          opacity={0.3}
          metalness={0.1}
          roughness={0}
        />
      </RoundedBox>

      {/* Motherboard Tray / Back Panel */}
      <RoundedBox
        args={[width * 0.8 * boardScale, height * 0.6 * boardScale, 0.02]}
        radius={0.01}
        smoothness={4}
        position={[0, height * 0.1, -depth * 0.35]}
      >
        <meshStandardMaterial color={mbColor} metalness={0.2} roughness={0.8} />
      </RoundedBox>

      {/* CPU */}
      {cpuPart && (
        <RoundedBox
          args={[width * 0.15 * boardScale, width * 0.15 * boardScale, 0.02]}
          radius={0.005}
          smoothness={4}
          position={[0, height * 0.25, -depth * 0.33]}
        >
          <meshStandardMaterial color={cpuColor} metalness={0.8} roughness={0.2} />
        </RoundedBox>
      )}

      {/* RAM Slots */}
      {ramPart && (
        <group position={[width * 0.15 * boardScale, height * 0.25, -depth * 0.33]}>
          {[0, 0.04, 0.08, 0.12].map((x, i) => (
            <RoundedBox
              key={i}
              args={[0.015, height * 0.2 * boardScale, 0.04]}
              radius={0.002}
              smoothness={2}
              position={[x, 0, 0]}
            >
              <meshStandardMaterial color={ramColor} metalness={0.5} roughness={0.5} />
            </RoundedBox>
          ))}
        </group>
      )}

      {/* GPU */}
      {gpuPart && (
        <RoundedBox
          args={[Math.min(gpuLength, width * 0.9), height * 0.15, depth * 0.1]}
          radius={0.01}
          smoothness={4}
          position={[0, height * 0.05, -depth * 0.1]}
        >
          <meshStandardMaterial color={gpuColor} metalness={0.6} roughness={0.3} />
        </RoundedBox>
      )}

      {/* PSU */}
      {psuPart && (
        <RoundedBox
          args={[width * 0.8, height * 0.2, depth * 0.4]}
          radius={0.01}
          smoothness={4}
          position={[0, -height * 0.35, -depth * 0.2]}
        >
          <meshStandardMaterial color={psuColor} metalness={0.4} roughness={0.6} />
        </RoundedBox>
      )}

      {/* CPU Cooler (Simple Air Cooler) */}
      {coolerPart && (
        <RoundedBox
          args={[width * 0.3 * boardScale, width * 0.3 * boardScale, depth * 0.2]}
          radius={0.01}
          smoothness={4}
          position={[0, height * 0.25, -depth * 0.2]}
        >
          <meshStandardMaterial color={coolerColor} metalness={0.7} roughness={0.3} transparent opacity={0.8} />
        </RoundedBox>
      )}
    </group>
  );
}

export default function CaseViewer3D({ casePart, gpuPart, motherboardPart, cpuPart, ramPart, psuPart, coolerPart }) {
  if (!casePart) {
    return (
      <div className="case-viewer-empty">
        Select a case to open the 3D preview.
      </div>
    );
  }

  const maxGpuLength = Number(casePart?.specs?.gpuMaxLengthMm || 0);
  const selectedGpuLength = Number(gpuPart?.specs?.lengthMm || 0);
  const gpuFits = !gpuPart || !maxGpuLength || selectedGpuLength <= maxGpuLength;

  return (
    <div className="case-viewer">
      <div className="case-viewer-canvas-container">
        <Canvas shadows camera={{ position: [3, 2, 5], fov: 45 }}>
          <color attach="background" args={["#111827"]} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} castShadow />
          <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
          <Suspense fallback={null}>
            <CaseModel 
              casePart={casePart} 
              gpuPart={gpuPart} 
              motherboardPart={motherboardPart} 
              cpuPart={cpuPart}
              ramPart={ramPart}
              psuPart={psuPart}
              coolerPart={coolerPart}
            />
          </Suspense>
          <ContactShadows position={[0, -2, 0]} opacity={0.4} blur={2} scale={10} far={10} />
          <Environment preset="night" />
          <OrbitControls enablePan={false} minDistance={3} maxDistance={10} />
        </Canvas>
      </div>
      <div className="case-viewer-meta">
        <div className="case-info">
          <h3>{casePart.name}</h3>
          <p className="brand-tag">{casePart.brand}</p>
        </div>
        <div className="clearance-info">
          <p>
            <strong>GPU Clearance:</strong> {maxGpuLength || "N/A"} mm
            {gpuPart && <span className="selected-val"> (Selected: {selectedGpuLength} mm)</span>}
          </p>
          <p className={`fit-status ${gpuFits ? "ok" : "error"}`}>
            {gpuFits ? "Γ£ô GPU fits correctly" : "ΓÜá GPU exceeds case length limit"}
          </p>
        </div>
      </div>
    </div>
  );
}
