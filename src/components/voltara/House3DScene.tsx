import { useEffect, useRef, useState } from "react";
import { HOUSE_ROOMS, type HouseRoomId } from "@/lib/voltara/rooms";
import { money } from "@/lib/voltara/format";

type DeviceMarker={id:string;room:HouseRoomId;name:string};
interface SceneControls {
  updateDevices:(items:DeviceMarker[])=>void;
  orbit: (delta: number) => void;
  zoom: (delta: number) => void;
  update: (selected: HouseRoomId | null, totals: Partial<Record<HouseRoomId, number>>) => void;
}

/**
 * Cena Three.js real com WebGL, não uma imagem estática.
 * Planta ilustrativa até que sejam enviados vídeos, fotos e medidas da casa.
 * Cozinha americana e copa não possuem parede entre si.
 */
export function House3DScene({
  selected, totals, onSelect, markers=[], onDeviceSelect,
}: {
  selected: HouseRoomId | null;
  totals: Partial<Record<HouseRoomId, number>>;
  onSelect: (room: HouseRoomId) => void;
  markers?: DeviceMarker[];
  onDeviceSelect?: (id:string,room:HouseRoomId)=>void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<SceneControls | null>(null);
  const onSelectRef = useRef(onSelect);
  const deviceSelectRef=useRef(onDeviceSelect);
  const markersRef=useRef(markers);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(()=>{deviceSelectRef.current=onDeviceSelect},[onDeviceSelect]);
  useEffect(()=>{markersRef.current=markers;controlsRef.current?.updateDevices(markers)},[markers]);
  useEffect(() => { controlsRef.current?.update(selected, totals); }, [selected, totals]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    async function setup() {
      const container = mountRef.current;
      if (cancelled || !container) return;
      try {
        const THREE = await import("three");
        if (cancelled) return;
        const compact = window.innerWidth < 640;
        const renderer = new THREE.WebGLRenderer({ antialias: !compact, alpha: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.7));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x10111e);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "none";
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#11121e");
        scene.fog = new THREE.Fog("#11121e", 23, 45);
        const camera = new THREE.PerspectiveCamera(compact ? 61 : 43, 1, 0.1, 65);
        const target = new THREE.Vector3(-0.8, 0, 0);
        let azimuth = -0.45;
        let elevation = 0.95;
        let radius = 22;
        function positionCamera() {
          camera.position.set(
            target.x + radius * Math.cos(elevation) * Math.sin(azimuth),
            radius * Math.sin(elevation),
            radius * Math.cos(elevation) * Math.cos(azimuth),
          );
          camera.lookAt(target);
        }
        positionCamera();

        scene.add(new THREE.AmbientLight(0xffffff, 2));
        const key = new THREE.DirectionalLight(0xc7bbff, 3.2);
        key.position.set(-7, 13, 6);
        scene.add(key);
        const fill = new THREE.PointLight(0x62ccd2, 65, 22, 2);
        fill.position.set(4, 5, -3);
        scene.add(fill);

        const made: THREE.Object3D[] = [];
        const floors: THREE.Mesh[] = [];
        const floorMaterials = new Map<HouseRoomId, THREE.MeshStandardMaterial>();
        const labels = new Map<HouseRoomId, THREE.Sprite>();
        const material = (color: string, roughness = 0.8) =>
          new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 });
        const walnut = material("#786358");
        const pale = material("#d8c6ae");
        const pillow = material("#eee3d9");
        const chrome = material("#bbc8d7", 0.35);
        const dark = material("#252a39");
        const indigo = material("#514274");

        function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          mesh.position.set(x, y, z);
          scene.add(mesh);
          made.push(mesh);
          return mesh;
        }
        function cylinder(radius: number, h: number, x: number, y: number, z: number, mat: THREE.Material) {
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 18), mat);
          mesh.position.set(x, y, z);
          scene.add(mesh);
          made.push(mesh);
        }

        // Chão/base com uma borda sutil.
        box(14.4, 0.15, 9.2, -0.9, -0.17, 0, material("#222433"));
        for (const room of HOUSE_ROOMS) {
          const floorMat = material(room.color);
          floorMat.color.multiplyScalar(0.36);
          floorMat.emissive = new THREE.Color(room.color);
          floorMat.emissiveIntensity = 0.10;
          const floor = box(room.width - 0.08, 0.10, room.depth - 0.08,
            room.x, -0.04, room.z, floorMat);
          floor.userData.room = room.id;
          floors.push(floor);
          floorMaterials.set(room.id, floorMat);
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(room.width - 0.07, 0.11, room.depth - 0.07)),
            new THREE.LineBasicMaterial({ color: room.color, transparent: true, opacity: 0.50 }),
          );
          outline.position.set(room.x, -0.04, room.z);
          scene.add(outline);
          made.push(outline);
        }

        // As paredes são demonstrativas e baixas para não bloquear a visão do interior.
        const wallMat = new THREE.MeshStandardMaterial({
          color: "#9b9ab5", transparent: true, opacity: 0.52, roughness: 0.95,
          depthWrite: false, side: THREE.DoubleSide,
        });
        const wallHeight = 0.82;
        const wall = (x: number, z: number, w: number, d: number) =>
          box(w, wallHeight, d, x, wallHeight / 2 + 0.02, z, wallMat);

        // Contorno externo e divisórias com entradas abertas (vãos ilustrativos).
        wall(-0.9, -4.4, 13.8, 0.12);
        wall(-7.8, 0, 0.12, 8.8);
        wall(6, 0, 0.12, 8.8);
        wall(-0.9, 4.4, 13.8, 0.12);

        // Sala | copa; SEM parede entre copa e cozinha americana | banheiro.
        wall(-3, -3.4, 0.12, 2.0);
        wall(-3, -0.55, 0.12, 1.1);
        wall(3.5, -3.3, 0.12, 2.2);
        wall(3.5, -0.45, 0.12, 0.9);

        // Divisórias dos quartos e escritório.
        wall(-3, 0.7, 0.12, 1.4);
        wall(-3, 3.45, 0.12, 1.9);
        wall(1, 0.7, 0.12, 1.4);
        wall(1, 3.45, 0.12, 1.9);

        // Corredor / entradas da zona íntima. Lacunas representam portas.
        for (const [x, w] of [[-6.6, 2.4], [-3.8, 1.1], [-1.9, 1.0], [0.3, 1.4], [2.3, 1.3], [4.9, 1.3]] as const) {
          wall(x, 0, w, 0.12);
        }

        // Objetos simples e tridimensionais dão uma leitura espacial inicial.
        // Sala: sofá e mesa de centro.
        box(2.3, 0.42, 0.76, -5.9, 0.28, -2.95, indigo);
        box(2.3, 0.7, 0.20, -5.9, 0.51, -3.4, indigo);
        box(1.05, 0.16, 0.75, -5.75, 0.25, -1.7, walnut);
        // Copa: mesa e cadeiras no MESMO piso visual da cozinha americana.
        box(1.45, 0.13, 1.0, -1.55, 0.69, -2.15, walnut);
        for (const [x, z] of [[-2.45, -2.1], [-0.65, -2.1], [-1.55, -2.92], [-1.55, -1.35]] as const) {
          cylinder(0.25, 0.36, x, 0.19, z, pale);
        }
        // Cozinha americana: bancada da parede e ilha baixa (não é divisória).
        box(2.9, 0.86, 0.58, 1.65, 0.48, -3.75, walnut);
        box(2.3, 0.80, 0.64, 1.28, 0.45, -1.08, pale);
        box(0.62, 1.24, 0.58, 2.97, 0.68, -3.73, chrome);
        // Banheiro: banheira/box e bancada.
        box(1.27, 0.42, 1.3, 4.85, 0.25, -3.1, chrome);
        box(0.82, 0.57, 0.60, 4.45, 0.32, -1.22, pale);
        // Quarto 1: cama, travesseiro.
        box(1.75, 0.40, 2.35, -5.3, 0.26, 2.15, indigo);
        box(1.48, 0.10, 0.46, -5.3, 0.51, 1.45, pillow);
        box(0.72, 1.32, 1.85, -7.12, 0.72, 2.9, walnut);
        // Escritório: escrivaninha e monitor.
        box(2, 0.13, 0.72, -1, 0.72, 1.15, walnut);
        box(0.85, 0.55, 0.10, -1, 1.07, 1.0, dark);
        box(0.5, 0.42, 0.55, -1, 0.24, 2.5, indigo);
        // Quarto 2: cama e armário.
        box(1.85, 0.40, 2.32, 3.35, 0.26, 2.35, material("#587e92"));
        box(1.55, 0.10, 0.43, 3.35, 0.51, 1.61, pillow);
        box(0.76, 1.36, 1.83, 5.3, 0.72, 2.8, walnut);

        function makeLabel(room: (typeof HOUSE_ROOMS)[number], total: number, isSelected: boolean) {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 152;
          const ctx = canvas.getContext("2d");
          if (!ctx) return new THREE.CanvasTexture(canvas);
          ctx.fillStyle = isSelected ? "rgba(129,75,238,.97)" : "rgba(16,18,31,.93)";
          ctx.beginPath();
          ctx.roundRect(7, 7, 498, 138, 26);
          ctx.fill();
          ctx.lineWidth = isSelected ? 5 : 2;
          ctx.strokeStyle = isSelected ? "#ecdbff" : room.color;
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = "600 39px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(room.short, 256, 61);
          ctx.fillStyle = "#f6dcff";
          ctx.font = "bold 43px sans-serif";
          ctx.fillText(money(total), 256, 114);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          return texture;
        }

        for (const room of HOUSE_ROOMS) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: makeLabel(room, 0, false), transparent: true, depthTest: false,
          }));
          sprite.position.set(room.x, 1.65, room.z);
          sprite.scale.set(room.width >= 4 ? 2.55 : 2.05, room.width >= 4 ? 0.76 : 0.65, 1);
          sprite.renderOrder = 100;
          scene.add(sprite);
          labels.set(room.id, sprite);
          made.push(sprite);
        }

        function update(selectedRoom: HouseRoomId | null, expenses: Partial<Record<HouseRoomId, number>>) {
          for (const room of HOUSE_ROOMS) {
            const mat = floorMaterials.get(room.id);
            if (mat) {
              mat.emissiveIntensity = selectedRoom === room.id ? 0.58 : 0.10;
              mat.color.set(room.color).multiplyScalar(selectedRoom === room.id ? 0.53 : 0.36);
            }
            const sprite = labels.get(room.id);
            if (!sprite) continue;
            const spriteMat = sprite.material as THREE.SpriteMaterial;
            spriteMat.map?.dispose();
            spriteMat.map = makeLabel(room, expenses[room.id] ?? 0, selectedRoom === room.id);
            spriteMat.needsUpdate = true;
          }
        }

        const devices: THREE.Sprite[]=[];
        function clearDevices(){
          for(const sprite of devices){scene.remove(sprite);sprite.material.map?.dispose();sprite.material.dispose();}
          devices.length=0;
        }
        function updateDevices(items:DeviceMarker[]){
          clearDevices();
          for(const room of HOUSE_ROOMS){
            const assigned=items.filter(a=>a.room===room.id).slice(0,12);
            assigned.forEach((item,i)=>{
              const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;
              const ctx=canvas.getContext("2d");if(!ctx)return;
              ctx.fillStyle="#301d59";ctx.beginPath();ctx.arc(64,64,57,0,Math.PI*2);ctx.fill();
              ctx.strokeStyle="#cdb4ff";ctx.lineWidth=7;ctx.stroke();ctx.fillStyle="#ffffff";
              ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 58px sans-serif";ctx.fillText(String(i+1),64,66);
              const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
              const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
              sprite.position.set(room.x-room.width*.32+(i%4)*room.width*.20,2.25,room.z+.6+Math.floor(i/4)*.62);
              sprite.scale.set(.48,.48,1);sprite.renderOrder=101;sprite.userData={deviceId:item.id,room:item.room};
              devices.push(sprite);scene.add(sprite);
            });
          }
        }

        const raycaster = new THREE.Raycaster();
        const cursor = new THREE.Vector2();
        const pointers = new Map<number, { x: number; y: number }>();
        let moved = false;
        let pinch = 0;
        function pick(x: number, y: number) {
          const rect = renderer.domElement.getBoundingClientRect();
          cursor.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
          raycaster.setFromCamera(cursor, camera);
          const hit=raycaster.intersectObjects(devices)[0];
          if(hit&&deviceSelectRef.current){deviceSelectRef.current(hit.object.userData.deviceId,hit.object.userData.room);return;}
          const hits = raycaster.intersectObjects(floors);
          const room = hits[0]?.object.userData.room as HouseRoomId | undefined;
          if (room) onSelectRef.current(room);
        }
        function down(event: PointerEvent) {
          renderer.domElement.setPointerCapture(event.pointerId);
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          moved = false;
          if (pointers.size === 2) {
            const points = [...pointers.values()];
            pinch = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
          }
        }
        function move(event: PointerEvent) {
          const previous = pointers.get(event.pointerId);
          if (!previous) return;
          const dx = event.clientX - previous.x;
          const dy = event.clientY - previous.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.size === 2) {
            const points = [...pointers.values()];
            const distance = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
            if (pinch) radius = THREE.MathUtils.clamp(radius + (pinch - distance) * 0.025, 11, 34);
            pinch = distance;
          } else {
            azimuth -= dx * 0.006;
            elevation = THREE.MathUtils.clamp(elevation + dy * 0.005, 0.48, 1.42);
          }
          positionCamera();
        }
        function up(event: PointerEvent) {
          if (pointers.has(event.pointerId) && !moved && pointers.size === 1) pick(event.clientX, event.clientY);
          pointers.delete(event.pointerId);
          if (pointers.size < 2) pinch = 0;
        }
        function wheel(event: WheelEvent) {
          event.preventDefault();
          radius = THREE.MathUtils.clamp(radius + event.deltaY * 0.016, 11, 34);
          positionCamera();
        }
        const canvas = renderer.domElement;
        canvas.addEventListener("pointerdown", down);
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", up);
        canvas.addEventListener("wheel", wheel, { passive: false });

        function resize() {
          const width = Math.max(container!.clientWidth, 1);
          const height = Math.max(container!.clientHeight, 1);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 640 ? 1.25 : 1.7));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.fov = width < 420 ? 64 : width < 640 ? 56 : 43;
          camera.updateProjectionMatrix();
        }
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();

        let frame = 0;
        let running = true;
        let isVisible = true;
        let lastFrameTime = 0;
        const visibility = new IntersectionObserver(([entry]) => {
          isVisible = Boolean(entry?.isIntersecting);
        }, { threshold: 0.05 });
        visibility.observe(container);
        function render(timestamp: number) {
          if (!running) return;
          frame = requestAnimationFrame(render);
          const mobile = container!.clientWidth < 640;
          if (!isVisible || document.hidden) return;
          if (mobile && timestamp - lastFrameTime < 32) return;
          lastFrameTime = timestamp;
          renderer.render(scene, camera);
        }
        frame = requestAnimationFrame(render);
        update(selected, totals);
        updateDevices(markersRef.current);
        controlsRef.current = {
          orbit: (delta) => { azimuth += delta; positionCamera(); },
          zoom: (delta) => { radius = THREE.MathUtils.clamp(radius + delta, 11, 34); positionCamera(); },
          update,
          updateDevices,
        };
        if (!cancelled) setReady(true);

        cleanup = () => {
          running = false;
          cancelAnimationFrame(frame);
          observer.disconnect();
          visibility.disconnect();
          canvas.removeEventListener("pointerdown", down);
          canvas.removeEventListener("pointermove", move);
          canvas.removeEventListener("pointerup", up);
          canvas.removeEventListener("pointercancel", up);
          canvas.removeEventListener("wheel", wheel);
          clearDevices();
          for (const item of made) {
            if (item instanceof THREE.Sprite) (item.material as THREE.SpriteMaterial).map?.dispose();
            if (item instanceof THREE.Mesh) item.geometry.dispose();
            if (item instanceof THREE.LineSegments) item.geometry.dispose();
            const materials = (item as THREE.Mesh).material;
            if (Array.isArray(materials)) materials.forEach((m) => m.dispose());
            else materials?.dispose();
          }
          [walnut, pale, pillow, chrome, dark, indigo, wallMat].forEach((m) => m.dispose());
          renderer.dispose();
          canvas.remove();
          controlsRef.current = null;
        };
      } catch {
        if (!cancelled) setFallback(true);
      }
    }
    void setup();
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-[#11121e]">
      <div ref={mountRef} className="h-[min(58svh,400px)] min-h-[310px] w-full sm:h-[440px] lg:h-[560px]" aria-label="Maquete interativa tridimensional da casa" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
          {fallback ? "Visualização 3D não disponível neste aparelho. Selecione um cômodo na lista abaixo." : "Montando a Casa 3D..."}
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1 rounded-xl border border-white/10 bg-black/75 p-1 text-white backdrop-blur sm:bottom-3 sm:right-3">
        <button type="button" onClick={() => controlsRef.current?.orbit(-0.28)} aria-label="Girar casa à esquerda" title="Girar à esquerda" className="flex size-11 items-center justify-center rounded-md text-lg hover:bg-white/15">↶</button>
        <button type="button" onClick={() => controlsRef.current?.orbit(0.28)} aria-label="Girar casa à direita" title="Girar à direita" className="flex size-11 items-center justify-center rounded-md text-lg hover:bg-white/15">↷</button>
        <button type="button" onClick={() => controlsRef.current?.zoom(-2)} aria-label="Aproximar" title="Aproximar" className="flex size-11 items-center justify-center rounded-md text-lg hover:bg-white/15">+</button>
        <button type="button" onClick={() => controlsRef.current?.zoom(2)} aria-label="Afastar" title="Afastar" className="flex size-11 items-center justify-center rounded-md text-lg hover:bg-white/15">−</button>
      </div>
      <p className="pointer-events-none absolute left-2 top-2 hidden max-w-[calc(100%-1rem)] rounded-lg bg-black/70 px-3 py-2 text-[11px] text-slate-200 sm:block">
        Arraste para girar • toque num cômodo • use dois dedos para zoom
      </p>
    </div>
  );
}
