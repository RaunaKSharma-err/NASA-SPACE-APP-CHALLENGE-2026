import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useMissionStore } from "@/store/mission-store";
import { TARGETS } from "@/data/mars-data";
import type { TargetLocation, RouteResult } from "@/types";
import { loadTerrain, createTerrainMesh, type TerrainData, surfaceRadiusAt, greatCircleInterpolate, latLonToVector3 } from "@/lib/mars-terrain";

const MARS_RADIUS = 2;
import marsTextureUrl from "@/public/textures/8k_mars.jpg";

const hazardColors: Record<TargetLocation["hazardLevel"], number> = {
  low: 0x34d399,
  moderate: 0xfbbf24,
  high: 0xf97316,
  extreme: 0xff6b72,
};

const routeHazardColors: Record<RouteResult["hazardLevel"], number> = {
  low: 0x34d399,
  moderate: 0xfbbf24,
  high: 0xff6b72,
};

interface MarkerHandle {
  mesh: THREE.Mesh;
  pulse: THREE.Mesh;
  label: THREE.Sprite;
}

function createLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(16, 23, 32, 0.9)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "rgba(53, 217, 242, 0.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 62);
  ctx.font = "20px JetBrains Mono, monospace";
  ctx.fillStyle = "#F1F5F9";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.8, 0.2, 1);
  return sprite;
}

export function MarsGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeRef = useRef<THREE.Mesh | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const markersRef = useRef<Map<string, MarkerHandle>>(new Map());
  const routeLineRef = useRef<THREE.Line | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const cameraTargetRef = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
    progress: number;
    active: boolean;
  } | null>(null);

  // Drag state
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const zoomRef = useRef(5);

  // Texture loading state
  const [textureLoaded, setTextureLoaded] = useState(false);
  const [textureError, setTextureError] = useState(false);
  const [terrainData, setTerrainData] = useState<TerrainData | null>(null);

  const selectedRegion = useMissionStore((s) => s.selectedRegion);
  const selectTarget = useMissionStore((s) => s.selectTarget);
  const selectedTarget = useMissionStore((s) => s.selectedTarget);
  const cameraTarget = useMissionStore((s) => s.cameraTarget);
  const setCameraReady = useMissionStore((s) => s.setCameraReady);
  const routes = useMissionStore((s) => s.routes);
  const selectedRouteId = useMissionStore((s) => s.selectedRouteId);
  const layers = useMissionStore((s) => s.layers);

  // Init Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b10);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    // Configure color management
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Stars background
    const starGeo = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 80 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3),
    );
    const starMat = new THREE.PointsMaterial({
      color: 0x444444,
      size: 0.5,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    // Mars globe — start with a fallback color, texture loads asynchronously
    const globeGeo = new THREE.SphereGeometry(MARS_RADIUS, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 2,
      specular: 0x222222,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // Load the provided Mars texture asynchronously
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      marsTextureUrl,
      (texture) => {
        // Texture loaded successfully — apply to globe
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        // Equirectangular mapping on a sphere: no flip needed for standard Mars maps
        globeMat.map = texture;
        globeMat.needsUpdate = true;
        setTextureLoaded(true);

        // Load MOLA terrain displacement for Gale Crater
        loadTerrain("/terrain/gale-crater.asc")
          .then((terrain) => {
            if (!sceneRef.current) return; // unmounted
            setTerrainData(terrain);
            const terrainMesh = createTerrainMesh(terrain, texture, {
              verticalExaggeration: 40,
              baseRadius: MARS_RADIUS,
              edgeFalloff: 0.12,
            });
            globe.add(terrainMesh);
            terrainMeshRef.current = terrainMesh;
          })
          .catch((err) => {
            console.warn("Failed to load MOLA terrain:", err);
          });
      },
      undefined,
      (error) => {
        console.warn("Failed to load Mars texture:", error);
        setTextureError(true);
        // Keep the fallback solid color material
      },
    );

    // Atmospheric glow
    const glowGeo = new THREE.SphereGeometry(MARS_RADIUS * 1.04, 64, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xc97b4a,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(glowGeo, glowMat));

    // Lighting
    // Soft neutral illumination across the globe
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    // Main sunlight
    const sunLight = new THREE.DirectionalLight(0xffe4c4, 1.8);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    globeRef.current = globe;

    setCameraReady(true);

    // Animation loop
    let frameId = 0;
    let pulseTime = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      pulseTime += 0.03;

      // Globe autorotate slowly
      if (!dragRef.current.active && !cameraTargetRef.current?.active) {
        rotationRef.current.y += 0.0005;
      }

      // Camera target animation
      if (cameraTargetRef.current?.active) {
        const ct = cameraTargetRef.current;
        ct.progress = Math.min(1, ct.progress + 0.02);
        const t = 1 - Math.pow(1 - ct.progress, 3);
        camera.position.lerpVectors(camera.position, ct.pos, t * 0.1);
        camera.lookAt(ct.lookAt);
        if (ct.progress >= 1) {
          cameraTargetRef.current.active = false;
        }
      } else {
        // Apply rotation from drag
        globe.rotation.y = rotationRef.current.y;
        globe.rotation.x = rotationRef.current.x;
      }

      // Pulse markers
      markersRef.current.forEach((handle) => {
        const scale = 1 + Math.sin(pulseTime) * 0.15;
        handle.pulse.scale.set(scale * 1.5, scale * 1.5, scale * 1.5);
        (handle.pulse.material as THREE.MeshBasicMaterial).opacity =
          0.3 + Math.sin(pulseTime) * 0.2;
      });

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler using ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Also keep window resize as fallback
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Mouse interaction
    const canvas = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      dragRef.current.active = true;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      cameraTargetRef.current = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      rotationRef.current.y += dx * 0.005;
      rotationRef.current.x = Math.max(
        -1.4,
        Math.min(1.4, rotationRef.current.x + dy * 0.005),
      );
    };

    const onPointerUp = () => {
      dragRef.current.active = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(
        2.5,
        Math.min(15, zoomRef.current + e.deltaY * 0.005),
      );
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(zoomRef.current));
    };

    const onClick = (e: MouseEvent) => {
      if (dragRef.current.active) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const meshes: THREE.Object3D[] = [];
      markersRef.current.forEach((h) => meshes.push(h.mesh));
      const intersects = raycasterRef.current.intersectObjects(meshes);
      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh;
        markersRef.current.forEach((h, id) => {
          if (h.mesh === clickedMesh) {
            selectTarget(id);
          }
        });
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel);
    canvas.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      renderer.dispose();
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      // Dispose of the loaded texture to prevent memory leaks
      globeMat.dispose();
      // Dispose terrain mesh
      if (terrainMeshRef.current) {
        const terrainMesh = terrainMeshRef.current;
        terrainMesh.geometry.dispose();
        if (terrainMesh.material instanceof THREE.Material) {
          terrainMesh.material.dispose();
        }
        if (terrainMesh.parent) {
          terrainMesh.parent.remove(terrainMesh);
        }
        terrainMeshRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when region changes
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    // Remove old markers
    markersRef.current.forEach((handle) => {
      globe.remove(handle.mesh);
      globe.remove(handle.pulse);
      globe.remove(handle.label);
    });
    markersRef.current.clear();

    const targets = TARGETS.filter((t) => t.regionId === selectedRegion?.id);
    const terrainOptions = {
      baseRadius: MARS_RADIUS,
      verticalExaggeration: 40,
      edgeFalloff: 0.12,
    };
    targets.forEach((target) => {
      const surface = surfaceRadiusAt(terrainData, target.lat, target.lon, terrainOptions);
      const radius = surface.valid ? surface.radius + 0.02 : MARS_RADIUS * 1.02;
      const color = hazardColors[target.hazardLevel];
      const pos = latLonToVector3(target.lat, target.lon, radius);

      // Marker dot
      const dotGeo = new THREE.SphereGeometry(0.03, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      globe.add(dot);

      // Pulse ring
      const pulseGeo = new THREE.SphereGeometry(0.04, 12, 12);
      const pulseMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
      });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.position.copy(pos);
      globe.add(pulse);

      // Label
      const label = createLabelSprite(target.name);
      label.position.copy(pos.clone().multiplyScalar(1.12));
      globe.add(label);

      markersRef.current.set(target.id, { mesh: dot, pulse, label });
    });
  }, [selectedRegion, terrainData]);

  // Highlight selected target
  useEffect(() => {
    markersRef.current.forEach((handle, id) => {
      const isSelected = id === selectedTarget?.id;
      const scale = isSelected ? 1.8 : 1;
      handle.mesh.scale.set(scale, scale, scale);
      (handle.label.material as THREE.SpriteMaterial).opacity = isSelected
        ? 1
        : 0.7;
    });
  }, [selectedTarget]);

  // Fly to camera target
  useEffect(() => {
    const camera = cameraRef.current;
    const globe = globeRef.current;
    if (!camera || !globe || !cameraTarget) return;

    const targetPos = latLonToVector3(
      cameraTarget.lat,
      cameraTarget.lon,
      MARS_RADIUS,
    );
    const cameraPos = targetPos.clone().multiplyScalar(3.5);

    cameraTargetRef.current = {
      pos: cameraPos,
      lookAt: targetPos,
      progress: 0,
      active: true,
    };

    // Also rotate globe so target faces camera
    const targetRotationY = -((cameraTarget.lon + 180) * Math.PI) / 180;
    const targetRotationX = ((cameraTarget.lat * Math.PI) / 180) * 0.5;
    rotationRef.current.y = targetRotationY;
    rotationRef.current.x = targetRotationX;
  }, [cameraTarget]);

  // Draw route line
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (routeLineRef.current) {
      globe.remove(routeLineRef.current);
      routeLineRef.current = null;
    }

    const selectedRoute = routes.find((r) => r.id === selectedRouteId);
    if (!selectedRoute) return;

    const waypoints = selectedRoute.waypoints;
    if (waypoints.length < 2) return;

    const terrainOptions = {
      baseRadius: MARS_RADIUS,
      verticalExaggeration: 40,
      edgeFalloff: 0.12,
    };
    const subdivisions = 12;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];

      for (let s = 0; s <= subdivisions; s++) {
        if (i > 0 && s === 0) continue; // skip duplicate of previous segment endpoint
        const t = s / subdivisions;
        const { lat, lon } = greatCircleInterpolate(a.lat, a.lon, b.lat, b.lon, t);
        const surface = surfaceRadiusAt(terrainData, lat, lon, terrainOptions);
        const radius = surface.valid ? surface.radius : MARS_RADIUS;
        points.push(latLonToVector3(lat, lon, radius + 0.03));
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const color = routeHazardColors[selectedRoute.hazardLevel];
    const material = new THREE.LineBasicMaterial({ color, linewidth: 3 });
    const line = new THREE.Line(geometry, material);
    globe.add(line);
    routeLineRef.current = line;
  }, [routes, selectedRouteId, terrainData]);

  // Toggle lighting based on elevation layer
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const visibleLayers = layers.filter((l) => l.visible && l.available);

    const hasElevation = visibleLayers.some((l) => l.type === "elevation");

    scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight) {
        obj.intensity = hasElevation ? 1.8 : 1.8;
      }
    });
  }, [layers]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Texture loading overlay */}
      {!textureLoaded && !textureError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <div className="w-12 h-12 border-4 border-accent-400/30 border-t-accent-400 rounded-full animate-spin" />
          <p className="text-xs text-[#8D9CAF] mt-3 font-mono">
            Loading Mars texture...
          </p>
        </div>
      )}

      <div className="absolute top-3 left-3 glass-panel px-3 py-2 pointer-events-none">
        <p className="text-xs text-[#B8C4D3] font-mono">
          <span className="text-accent-400">MARS</span> / Visual Globe
        </p>
        <p className="text-[10px] text-[#8D9CAF] mt-0.5">
          {textureError
            ? "Texture load failed — using fallback color"
            : textureLoaded
              ? "Surface texture + MOLA terrain (Gale Crater)"
              : "Loading surface texture..."}
        </p>
      </div>

      <div className="absolute bottom-3 right-3 glass-panel px-3 py-2 pointer-events-none">
        <div className="flex items-center gap-2 text-[10px] text-[#8D9CAF] font-mono">
          <span className="mission-dot bg-mission-nominal" />
          <span>3D Globe Active</span>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 glass-panel px-3 py-2 pointer-events-none">
        <div className="flex items-center gap-3 text-[10px] text-[#8D9CAF] font-mono">
          <span>Drag to rotate</span>
          <span>Scroll to zoom</span>
          <span>Click markers</span>
        </div>
      </div>
    </div>
  );
}
