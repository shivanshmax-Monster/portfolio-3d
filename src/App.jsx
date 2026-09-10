import { useRef, useLayoutEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Stars, Float, shaderMaterial } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { extend } from '@react-three/fiber'

// --- Custom GLSL Shader Material for the Grid ---
const SynthGridMaterial = shaderMaterial(
  {
    time: 0,
    camZ: 0, // Used to offset grid UVs seamlessly
    color: new THREE.Color("#00ffff"),
    glowColor: new THREE.Color("#ff00ff")
  },
  `
    varying vec2 vUv;
    varying vec3 vPos;
    uniform float time;
    
    void main() {
      vUv = uv;
      vec3 pos = position;
      // Add a subtle wave effect (undulating floor)
      pos.z += sin(pos.x * 0.02 + time) * 2.0;
      vPos = pos;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  `
    uniform float time;
    uniform float camZ;
    uniform vec3 color;
    uniform vec3 glowColor;
    varying vec2 vUv;
    varying vec3 vPos;
    
    void main() {
      // Create grid lines and offset them based on camera Z to simulate infinite movement
      vec2 grid = abs(fract(vUv * 200.0 - vec2(0.0, time * 0.5 - camZ * 0.035)) - 0.5) / fwidth(vUv * 200.0);
      float line = min(grid.x, grid.y);
      float alpha = 1.0 - min(line, 1.0);
      
      // Highlight the center path with magenta
      float centerDist = abs(vPos.x);
      vec3 finalColor = mix(glowColor, color, smoothstep(0.0, 50.0, centerDist));
      
      // Fade into distance
      float fade = smoothstep(400.0, 0.0, length(vPos));
      
      gl_FragColor = vec4(finalColor, alpha * fade * 0.8);
    }
  `
)
extend({ SynthGridMaterial })

// --- RETRO SUN SHADER ---
const RetroSunMaterial = shaderMaterial(
  { colorTop: new THREE.Color('#ff00ff'), colorBottom: new THREE.Color('#ffcc00') },
  `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  `
    varying vec2 vUv;
    uniform vec3 colorTop;
    uniform vec3 colorBottom;
    void main() {
      // Base gradient
      vec3 col = mix(colorBottom, colorTop, vUv.y);
      
      // Sliced effect on the bottom half
      if (vUv.y < 0.5) {
        float f = fract(vUv.y * 20.0);
        // Thickness of solid lines increases as y goes up
        float thickness = smoothstep(0.0, 0.5, vUv.y) * 0.8; 
        if (f > thickness) discard;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `
)
extend({ RetroSunMaterial })

// --- SKY GRADIENT SHADER ---
const SkyMaterial = shaderMaterial(
  { colorTop: new THREE.Color('#000000'), colorBottom: new THREE.Color('#050014') },
  `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  `
    varying vec2 vUv;
    uniform vec3 colorTop;
    uniform vec3 colorBottom;
    void main() {
      gl_FragColor = vec4(mix(colorBottom, colorTop, vUv.y), 1.0);
    }
  `
)
extend({ SkyMaterial })

// --- COMPONENTS ---

function ShaderGrid() {
  const matRef = useRef()
  const meshRef = useRef()
  
  useFrame((state) => {
    if (matRef.current) {
      matRef.current.time = state.clock.elapsedTime
      matRef.current.camZ = state.camera.position.z
    }
    if (meshRef.current) {
      // Keep grid mesh strictly underneath the camera
      meshRef.current.position.z = state.camera.position.z - 150
    }
  })
  
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, -150]}>
      <planeGeometry args={[800, 800, 100, 100]} />
      <synthGridMaterial ref={matRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

function RetroSun() {
  const ref = useRef()
  useFrame((state) => {
    ref.current.position.z = state.camera.position.z - 350
  })
  return (
    <mesh ref={ref} position={[0, 40, -350]}>
      <circleGeometry args={[80, 64]} />
      <retroSunMaterial transparent depthWrite={false} fog={false} />
    </mesh>
  )
}

function BackgroundSky() {
  const ref = useRef()
  useFrame((state) => {
    ref.current.position.z = state.camera.position.z - 400
  })
  return (
    <mesh ref={ref} position={[0, 80, -400]}>
      <planeGeometry args={[1000, 400]} />
      <skyMaterial depthWrite={false} fog={false} />
    </mesh>
  )
}

// --- InstancedMesh for the Background City ---
function BackgroundCity() {
  const count = 200
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  
  const buildings = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      x: (Math.random() - 0.5) * 600,
      z: -Math.random() * 800,
      y: Math.random() * 20 + 10,
      scaleX: 3 + Math.random() * 4,
      scaleZ: 3 + Math.random() * 4,
      color: new THREE.Color(Math.random() > 0.5 ? '#00ffff' : '#ff00ff')
    }))
  }, [count])

  useLayoutEffect(() => {
    if (meshRef.current) {
      for (let i = 0; i < count; i++) {
        meshRef.current.setColorAt(i, buildings[i].color)
      }
      meshRef.current.instanceColor.needsUpdate = true
    }
  }, [buildings])

  useFrame((state) => {
    if (!meshRef.current) return
    const camZ = state.camera.position.z
    
    for (let i = 0; i < count; i++) {
      let b = buildings[i]
      
      if (b.z > camZ + 50) {
        b.z = camZ - 600 - Math.random() * 200
        b.x = (Math.random() - 0.5) * 600
      } else if (b.z < camZ - 800) {
        // Handle camera jumping back to the start (warp transition)
        b.z = camZ - Math.random() * 600
        b.x = (Math.random() - 0.5) * 600
      }

      if (Math.abs(b.x) < 40) {
         b.x = b.x < 0 ? b.x - 40 : b.x + 40
      }

      dummy.position.set(b.x, b.y / 2 - 2, b.z)
      dummy.scale.set(b.scaleX, b.y, b.scaleZ)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial wireframe transparent opacity={0.3} color="#ffffff" />
    </instancedMesh>
  )
}

// --- Geometries & Materials ---
const towerMaterial = new THREE.MeshBasicMaterial({ color: "#050014" })
const mastGeo = new THREE.CylinderGeometry(0.5, 3, 20, 6)
const ringGeo1 = new THREE.TorusGeometry(2, 0.1, 8, 24)
const ringGeo2 = new THREE.TorusGeometry(1.5, 0.1, 8, 24)
const dishGeo = new THREE.ConeGeometry(3, 2, 16, 1, true)
const coreGeo = new THREE.SphereGeometry(0.5, 8, 8)
const coreMat = new THREE.MeshBasicMaterial({ color: "#ff00ff" })

function CellTower({ position, scale = 1, color = "#00ffff" }) {
  const meshRef = useRef()
  const wireMat = useMemo(() => new THREE.LineBasicMaterial({ color }), [color])
  const wireMatDish = useMemo(() => new THREE.MeshBasicMaterial({ color, wireframe: true }), [color])

  useLayoutEffect(() => {
    if (meshRef.current && meshRef.current.children.length === 0) {
      const edges = new THREE.EdgesGeometry(mastGeo)
      const line = new THREE.LineSegments(edges, wireMat)
      meshRef.current.add(line)
    } else if (meshRef.current) {
      meshRef.current.children[0].material = wireMat
    }
  }, [wireMat])

  return (
    <group position={position} scale={scale}>
      <mesh ref={meshRef} position={[0, 10, 0]} geometry={mastGeo} material={towerMaterial} />
      <mesh position={[0, 18, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={ringGeo1} material={wireMatDish} />
      <mesh position={[0, 19, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={ringGeo2} material={wireMatDish} />
      <mesh position={[1.5, 15, 0]} rotation={[0, 0, Math.PI / 4]} geometry={dishGeo} material={wireMatDish} />
      <mesh position={[2, 15, 0]} geometry={coreGeo} material={coreMat} />
    </group>
  )
}

// --- Floating Dust Motes ---
function DustMotes() {
  const count = 500
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const speeds = useMemo(() => new Float32Array(count).fill(0).map(() => 0.05 + Math.random() * 0.1), [])

  useLayoutEffect(() => {
    for (let i = 0; i < count; i++) {
      dummy.position.set((Math.random() - 0.5) * 100, Math.random() * 40, (Math.random() - 0.5) * 200)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    if (meshRef.current) meshRef.current.instanceMatrix.needsUpdate = true
  }, [dummy, count])

  useFrame((state) => {
    if (!meshRef.current) return
    const camZ = state.camera.position.z
    
    for (let i = 0; i < count; i++) {
      meshRef.current.getMatrixAt(i, dummy.matrix)
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale)
      
      dummy.position.z += speeds[i]
      dummy.position.y += Math.sin(Date.now() * 0.001 + i) * 0.01
      
      // Wrap dust particles around camera
      if (dummy.position.z > camZ + 50) {
        dummy.position.z -= 250
      } else if (dummy.position.z < camZ - 200) {
        dummy.position.z += 250
      }
      
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshBasicMaterial color="#00ffff" transparent opacity={0.6} />
    </instancedMesh>
  )
}

// --- CYBER ANIMALS ---

function CyberGiraffe({ towerPosition }) {
  const orbitRef = useRef()
  const neckRef = useRef()
  const leg1 = useRef()
  const leg2 = useRef()
  const leg3 = useRef()
  const leg4 = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    
    // Walk around the tower in a massive circle
    if (orbitRef.current) {
      orbitRef.current.rotation.y = t * 0.4
    }

    // Walking animation (legs swinging)
    const swing = Math.sin(t * 4) * 0.5
    if (leg1.current) leg1.current.rotation.x = swing
    if (leg2.current) leg2.current.rotation.x = -swing
    if (leg3.current) leg3.current.rotation.x = -swing
    if (leg4.current) leg4.current.rotation.x = swing

    // Neck bends down to eat data, then up to chew
    if (neckRef.current) {
      neckRef.current.rotation.x = -0.2 + Math.sin(t * 2) * 0.6
    }
  })

  const bodyMat = <meshBasicMaterial color="#ffcc00" wireframe />
  const solidMat = <meshBasicMaterial color="#ff00ff" />
  const eyeMat = <meshBasicMaterial color="#00ffff" />

  return (
    <group position={towerPosition}>
      <group ref={orbitRef}>
        {/* Offset from the tower, facing forward along the orbit (negative Z) */}
        <group position={[12, 3, 0]} scale={0.5}>
          {/* Body */}
          <mesh position={[0, 0, 0]}><boxGeometry args={[2, 2, 4]} />{bodyMat}</mesh>

          {/* Neck and Head */}
          <group position={[0, 1, -1.5]} ref={neckRef}>
            <mesh position={[0, 3, 0]}><boxGeometry args={[0.8, 6, 0.8]} />{bodyMat}</mesh>
            <mesh position={[0, 6.5, -1]}><boxGeometry args={[1.2, 1.2, 2.5]} />{bodyMat}</mesh>
            <mesh position={[-0.4, 7.5, -0.5]}><boxGeometry args={[0.1, 1.5, 0.1]}/>{eyeMat}</mesh>
            <mesh position={[0.4, 7.5, -0.5]}><boxGeometry args={[0.1, 1.5, 0.1]}/>{eyeMat}</mesh>
            <mesh position={[-0.6, 6.5, -1.8]}><sphereGeometry args={[0.2]}/>{solidMat}</mesh>
            <mesh position={[0.6, 6.5, -1.8]}><sphereGeometry args={[0.2]}/>{solidMat}</mesh>
            <mesh position={[0, 6, -2.5]}><boxGeometry args={[0.5, 0.5, 0.5]}/><meshBasicMaterial color="#00ffff" transparent opacity={0.8} /></mesh>
          </group>

          {/* Swinging Legs */}
          <group position={[-0.8, -1, -1.5]} ref={leg1}><mesh position={[0, -2, 0]}><boxGeometry args={[0.4, 4, 0.4]} />{bodyMat}</mesh></group>
          <group position={[0.8, -1, -1.5]} ref={leg2}><mesh position={[0, -2, 0]}><boxGeometry args={[0.4, 4, 0.4]} />{bodyMat}</mesh></group>
          <group position={[-0.8, -1, 1.5]} ref={leg3}><mesh position={[0, -2, 0]}><boxGeometry args={[0.4, 4, 0.4]} />{bodyMat}</mesh></group>
          <group position={[0.8, -1, 1.5]} ref={leg4}><mesh position={[0, -2, 0]}><boxGeometry args={[0.4, 4, 0.4]} />{bodyMat}</mesh></group>
          
          <mesh position={[0, 0, 2]} rotation={[0.5, 0, 0]}><boxGeometry args={[0.2, 2, 0.2]} />{eyeMat}</mesh>
        </group>
      </group>
    </group>
  )
}

function CyberBird({ towerPosition }) {
  const birdRef = useRef()
  const wing1 = useRef()
  const wing2 = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Orbit high above tower
    if (birdRef.current) {
      birdRef.current.rotation.y = -t * 1.5
      birdRef.current.position.y = 25 + Math.sin(t * 2) * 3
    }
    // Flapping
    const flap = Math.sin(t * 15) * 0.8
    if (wing1.current) wing1.current.rotation.z = flap
    if (wing2.current) wing2.current.rotation.z = -flap
  })

  return (
    <group position={towerPosition}>
      <group ref={birdRef}>
        {/* Facing forward along the orbit */}
        <group position={[15, 0, 0]} scale={0.5} rotation={[0, -Math.PI / 2, 0]}>
          <mesh><coneGeometry args={[0.5, 3, 4]} rotation={[Math.PI/2, 0, 0]} /><meshBasicMaterial color="#00ffff" wireframe /></mesh>
          <group position={[0.5, 0, 0]} ref={wing1}>
             <mesh position={[1.5, 0, 0]}><planeGeometry args={[3, 1]} rotation={[-Math.PI/2, 0, 0]}/><meshBasicMaterial color="#ff00ff" transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>
          </group>
          <group position={[-0.5, 0, 0]} ref={wing2}>
             <mesh position={[-1.5, 0, 0]}><planeGeometry args={[3, 1]} rotation={[-Math.PI/2, 0, 0]}/><meshBasicMaterial color="#ff00ff" transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

function CyberDog({ towerPosition }) {
  const groupRef = useRef()
  const legs = [useRef(), useRef(), useRef(), useRef()]
  
  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Pace back and forth along X axis near the tower
    const moveX = Math.sin(t * 1.5) * 15
    if (groupRef.current) {
      groupRef.current.position.x = moveX
      // Face the direction of movement (snap rotation)
      groupRef.current.rotation.y = Math.cos(t * 1.5) > 0 ? Math.PI / 2 : -Math.PI / 2
    }
    
    // Running legs
    const speed = 15
    const swing = Math.sin(t * speed) * 0.6
    if (legs[0].current) legs[0].current.rotation.x = swing
    if (legs[1].current) legs[1].current.rotation.x = -swing
    if (legs[2].current) legs[2].current.rotation.x = -swing
    if (legs[3].current) legs[3].current.rotation.x = swing
  })

  const mat = <meshBasicMaterial color="#00ffcc" wireframe />
  
  return (
    <group position={towerPosition}>
      <group position={[0, 1.5, -12]} ref={groupRef} scale={0.6}>
        <mesh position={[0, 1, 0]}><boxGeometry args={[1, 1, 3]} />{mat}</mesh>
        <mesh position={[0, 2, 1.5]}><boxGeometry args={[1, 1, 1.5]} />{mat}</mesh>
        
        {/* Tail */}
        <mesh position={[0, 1.5, -1.5]} rotation={[-Math.PI/4, 0, 0]}><boxGeometry args={[0.2, 1.5, 0.2]}/><meshBasicMaterial color="#ff00ff"/></mesh>

        <group position={[-0.4, 1, 1]} ref={legs[0]}><mesh position={[0,-1,0]}><boxGeometry args={[0.3, 2, 0.3]}/>{mat}</mesh></group>
        <group position={[0.4, 1, 1]} ref={legs[1]}><mesh position={[0,-1,0]}><boxGeometry args={[0.3, 2, 0.3]}/>{mat}</mesh></group>
        <group position={[-0.4, 1, -1]} ref={legs[2]}><mesh position={[0,-1,0]}><boxGeometry args={[0.3, 2, 0.3]}/>{mat}</mesh></group>
        <group position={[0.4, 1, -1]} ref={legs[3]}><mesh position={[0,-1,0]}><boxGeometry args={[0.3, 2, 0.3]}/>{mat}</mesh></group>
      </group>
    </group>
  )
}

function ProjectBillboard({ project, setWarpActive }) {
  const billboardPos = [0, 26, 0] // relative to group
  const groupRef = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (!groupRef.current) return
    const targetScale = hovered ? 1.05 : 1.0
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1)
  })

  const handleClick = (e) => {
    e.preventDefault()
    setWarpActive(true)
    gameState.warp = true
    setTimeout(() => {
      window.location.href = project.url
      setWarpActive(false)
      gameState.warp = false
    }, 1500)
  }

  return (
    <group ref={groupRef}>
      <CellTower position={[0,0,0]} scale={1.5} color={hovered ? "#ff00ff" : "#00ffff"} />
      <CyberGiraffe towerPosition={[0, 0, 0]} />
      <CyberBird towerPosition={[0, 0, 0]} />
      <CyberDog towerPosition={[0, 0, 0]} />
      
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.5} position={billboardPos}>
        <Html transform distanceFactor={15} center zIndexRange={[100, 0]}>
          <div 
            onPointerOver={() => { setHovered(true); gameState.reading = true }} 
            onPointerOut={() => { setHovered(false); gameState.reading = false }}
            className={`w-[500px] p-8 font-sans bg-[#02000a]/95 backdrop-blur-md border-2 rounded-xl flex flex-col items-center transition-colors duration-300 ${hovered ? 'border-synth-magenta shadow-[0_0_60px_rgba(255,0,255,0.5)]' : 'border-synth-cyan shadow-[0_0_40px_rgba(0,255,255,0.3)]'}`}
            style={{ cursor: 'none' }}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-synth-cyan to-synth-magenta"></div>
            <h2 className="text-4xl font-bold text-synth-magenta mb-4 text-glow tracking-wider text-center uppercase">{project.title}</h2>
            <p className="text-white/90 text-center mb-8 text-lg leading-relaxed">{project.description}</p>
            <button onClick={handleClick} className="inline-block px-8 py-3 border-2 border-synth-cyan text-synth-cyan hover:bg-synth-cyan hover:text-black transition-all rounded text-glow font-bold tracking-widest cursor-none">
              ACCESS DATA
            </button>
          </div>
        </Html>
      </Float>
    </group>
  )
}

// --- INFINITE PROJECT LOOP ---
function InfiniteProject({ projectData, index, setWarpActive, totalProjects }) {
  const groupRef = useRef()
  const { camera } = useThree()
  const spacing = 120 // Increased spacing so obstacles have room!
  
  useLayoutEffect(() => {
    // Offset X based on original data, but strictly manage Z
    groupRef.current.position.set(
      projectData.position[0],
      projectData.position[1],
      -index * spacing - 20
    )
  }, [index, projectData])

  useFrame(() => {
    if (!groupRef.current) return
    const camZ = camera.position.z
    const loopDistance = totalProjects * spacing

    // If project goes behind camera, wrap it to the far end
    if (groupRef.current.position.z > camZ + 30) {
      groupRef.current.position.z -= loopDistance
    }
    // If scrolled backwards past the front, wrap it behind the camera
    if (groupRef.current.position.z < camZ - loopDistance + 30) {
      groupRef.current.position.z += loopDistance
    }
  })

  return (
    <group ref={groupRef}>
       <ProjectBillboard project={projectData} setWarpActive={setWarpActive} />
    </group>
  )
}

// --- GAME STATE ---
const globalCarPos = new THREE.Vector3()
const gameState = {
  speed: 0,
  crashed: false,
  reading: false,
  warp: false,
  score: 0
}

// --- CYBER OBSTACLES (ENEMIES) ---
function CyberObstacles() {
  const count = 40
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  
  const positions = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      x: (Math.random() - 0.5) * 26, // Span the drivable lane
      y: 1,
      z: -(Math.random() * 2000) - 200
    }))
  }, [count])

  useFrame((state) => {
    if (!meshRef.current) return
    const camZ = state.camera.position.z
    let isColliding = false

    for (let i = 0; i < count; i++) {
      let pos = positions[i]
      
      // Wrap obstacles infinitely like a treadmill
      if (pos.z > camZ + 50) {
        pos.z -= 2000
        pos.x = (Math.random() - 0.5) * 26
      }

      dummy.position.set(pos.x, pos.y, pos.z)
      dummy.rotation.x += 0.05
      dummy.rotation.y += 0.05
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)

      // Collision detection (Distance between Car and Obstacle)
      const dist = Math.sqrt(Math.pow(globalCarPos.x - pos.x, 2) + Math.pow(globalCarPos.z - pos.z, 2))
      if (dist < 3.0) {
        isColliding = true
        gameState.score -= 50 // Penalty for hitting obstacles
        if (gameState.score < 0) gameState.score = 0
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true
    
    // Update global crash state
    gameState.crashed = isColliding
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <octahedronGeometry args={[2]} />
      <meshBasicMaterial color="#ff0000" wireframe />
    </instancedMesh>
  )
}

// --- SKY ADDITIONS ---
function ShootingStars4K() {
  const count = 4000 // 4K Shooting Stars!
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i*3] = (Math.random() - 0.5) * 1000 // X
      pos[i*3+1] = Math.random() * 400 // Y
      pos[i*3+2] = -50 - Math.random() * 800 // Z
    }
    return pos
  }, [count])

  const speeds = useMemo(() => {
    const spd = new Float32Array(count)
    for(let i=0; i<count; i++) spd[i] = 2.0 + Math.random() * 5.0
    return spd
  }, [count])

  const materialRef = useRef()
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      materialRef.current.uniforms.camZ.value = state.camera.position.z
    }
  })

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSpeed" count={count} array={speeds} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, camZ: { value: 0 } }}
        vertexShader={`
          uniform float uTime;
          uniform float camZ;
          attribute float aSpeed;
          varying float vAlpha;
          void main() {
            vec3 pos = position;
            
            // Move diagonally at extreme speeds
            pos.x -= uTime * aSpeed * 50.0;
            pos.y -= uTime * aSpeed * 25.0;
            
            // Wrap around logic natively in GPU
            pos.x = mod(pos.x + 500.0, 1000.0) - 500.0;
            pos.y = mod(pos.y, 400.0);
            
            // Lock to camera Z so they don't get left behind
            pos.z += camZ;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // Size scales with distance and speed for a streak-like optical illusion
            gl_PointSize = (150.0 / -mvPosition.z) * aSpeed;
            vAlpha = 0.2 + (aSpeed * 0.1);
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          void main() {
            // Soft glowing circle
            float d = distance(gl_PointCoord, vec2(0.5));
            if(d > 0.5) discard;
            gl_FragColor = vec4(0.5, 1.0, 1.0, vAlpha * (1.0 - (d * 2.0)));
          }
        `}
      />
    </points>
  )
}

function CyberSleigh() {
  const groupRef = useRef()
  const drones = [useRef(), useRef(), useRef(), useRef()]

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (!groupRef.current) return
    
    // Keep it far back in the sky
    groupRef.current.position.z = state.camera.position.z - 200
    
    // Looping majestic flight path from Right to Left
    // 500 units wide, traveling at 80 units per second
    groupRef.current.position.x = 250 - ((t * 80) % 500)
    groupRef.current.position.y = 80 + Math.sin(t * 3) * 5
    
    // Face left permanently
    groupRef.current.rotation.y = Math.PI
    // Gentle wobble in flight
    groupRef.current.rotation.z = Math.sin(t * 2) * 0.1

    // Animate the 4 cyber drones (reindeer) pulling the ship
    drones.forEach((d, i) => {
      if (d.current) {
        d.current.rotation.x = t * (2 + i)
        d.current.rotation.y = t
        d.current.position.y = Math.sin(t * 5 + i) * 1.5
      }
    })
  })

  return (
    <group position={[0, 60, -150]} ref={groupRef}>
      {/* High-Tech Sleigh Body - Solid Neon Cyan */}
      <mesh rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 3, 10, 4]} />
        <meshBasicMaterial color="#00ffff" />
      </mesh>
      
      {/* Cockpit canopy - Solid Neon Magenta */}
      <mesh position={[-1, 1.5, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[3, 1.5, 2]} />
        <meshBasicMaterial color="#ff00ff" />
      </mesh>

      {/* Massive Engine Thruster Glow */}
      <mesh position={[-5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.5, 2, 2, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <pointLight position={[-6, 0, 0]} color="#ffffff" intensity={15} distance={100} />
      
      {/* 4 Cyber Drones (Replacing the Reindeer) */}
      {[...Array(4)].map((_, i) => (
        <group key={i} position={[8 + (i%2)*6, 0, i < 2 ? 3 : -3]} ref={drones[i]}>
           {/* Solid neon magenta drones */}
           <mesh><tetrahedronGeometry args={[1.5]} /><meshBasicMaterial color="#ff00ff" /></mesh>
           {/* Cyan energy tethers pulling the sleigh */}
           <mesh position={[-2, 0, 0]}><boxGeometry args={[4, 0.2, 0.2]} /><meshBasicMaterial color="#00ffff" /></mesh>
        </group>
      ))}
    </group>
  )
}

const timelineData = [
  { 
    category: "INTRODUCTION",
    title: "HELLO, WORLD.", 
    description: "I am Shivansh Sahu, an AI Engineer. I specialize in bridging the gap between theoretical machine learning and highly scalable cloud infrastructure.", 
    skills: [],
    color: "#00ffff"
  },
  { 
    category: "EDUCATION",
    title: "CURRENT DIRECTIVE", 
    description: "Currently pursuing my B.Tech in Artificial Intelligence at MITS Gwalior. My academic focus heavily revolves around deep learning architectures and distributed computing.", 
    skills: [],
    color: "#ff00ff"
  },
  { 
    category: "SKILLS & TOOLS",
    title: "TECH ARSENAL", 
    description: "I construct digital neural networks and cloud-native backends using an array of modern frameworks and infrastructure tools.", 
    skills: ["amazonwebservices-plain-wordmark colored", "googlecloud-plain colored", "python-plain colored", "tensorflow-original colored", "docker-plain colored", "react-original colored", "pytorch-original colored"],
    color: "#00ffff"
  },
  { 
    category: "FEATURED PROJECT",
    title: "AWS SERVERLESS PIPELINE", 
    description: "Highly scalable serverless architecture processing streaming data using Lambda and DynamoDB with zero downtime.", 
    skills: ["amazonwebservices-plain-wordmark colored", "python-plain colored", "nodejs-plain colored"],
    color: "#FF9900",
    linkText: "VIEW SOURCE CODE"
  },
  { 
    category: "FEATURED PROJECT",
    title: "GEN-AI RAG CHATBOT", 
    description: "Enterprise-grade Retrieval-Augmented Generation chatbot built with Large Language Models and Vector Databases.", 
    skills: ["tensorflow-original colored", "python-plain colored", "react-original colored"],
    color: "#10a37f",
    linkText: "VIEW SOURCE CODE"
  },
  { 
    category: "FEATURED PROJECT",
    title: "COMPUTER VISION API", 
    description: "Real-time object detection API deployed on cloud instances with GPU acceleration for sub-millisecond inference.", 
    skills: ["pytorch-original colored", "opencv-plain colored", "docker-plain colored"],
    color: "#EE4C2C",
    linkText: "VIEW SOURCE CODE"
  },
  { 
    category: "FEATURED PROJECT",
    title: "CLOUD DATA LAKE", 
    description: "Automated ETL pipeline and distributed data lake architecture for massive-scale big data analytics.", 
    skills: ["googlecloud-plain colored", "apachekafka-original colored", "postgresql-plain colored"],
    color: "#0073BB",
    linkText: "VIEW SOURCE CODE"
  },
  { 
    category: "CONTACT",
    title: "TRANSMISSION END", 
    description: "Ready to build the future? Whether it's training massive models or architecting global cloud systems, check the top right links to connect with me.", 
    skills: ["github-original colored", "linkedin-plain colored"],
    color: "#ff00ff",
    isEnd: true
  }
]

// Global state for transition effect
window.isRewinding = false
const globalCamPos = new THREE.Vector3(0, 5, 0)

function CyberBuilding({ proj }) {
  return (
    <group>
      {/* Main Building Core */}
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[8, 16, 8]} />
        <meshStandardMaterial color="#030303" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Building Wireframe Cage */}
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[8.2, 16.2, 8.2]} />
        <meshBasicMaterial color={proj.color} wireframe transparent opacity={0.2} />
      </mesh>

      {/* Base Pedestal */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[12, 2, 12]} />
        <meshStandardMaterial color="#050505" metalness={1.0} roughness={0.5} />
      </mesh>

      {/* Glowing Neon Top Ring */}
      <mesh position={[0, 16, 0]}>
        <boxGeometry args={[9, 0.5, 9]} />
        <meshBasicMaterial color={proj.color} />
      </mesh>

      {/* Vertical Neon Strips (Left & Right edges) */}
      <mesh position={[-4, 8, 4.1]}>
        <boxGeometry args={[0.2, 16, 0.2]} />
        <meshBasicMaterial color={proj.color} />
      </mesh>
      <mesh position={[4, 8, 4.1]}>
        <boxGeometry args={[0.2, 16, 0.2]} />
        <meshBasicMaterial color={proj.color} />
      </mesh>

      {/* Roof Antenna */}
      <mesh position={[0, 20, 0]}>
        <cylinderGeometry args={[0.1, 0.2, 8]} />
        <meshStandardMaterial color="#111" metalness={1.0} />
      </mesh>
      {/* Antenna Tip Light */}
      <mesh position={[0, 24, 0]}>
        <sphereGeometry args={[0.3]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
    </group>
  )
}

function ScrollPortfolio() {
  const { camera } = useThree()
  const scrollRef = useRef(0)

  useLayoutEffect(() => {
    // Enable native scrolling (extra height for the 10% buffer)
    document.body.style.overflow = 'auto'
    document.body.style.height = '900vh'

    const onScroll = () => {
       const maxScroll = document.body.scrollHeight - window.innerHeight
       if (maxScroll <= 0) return
       
       const offset = window.scrollY / maxScroll
       scrollRef.current = offset
       
       // Trigger smooth rewind when pushing into the absolute final 1% of the buffer
       if (offset >= 0.99 && !window.isRewinding) {
           window.isRewinding = true
           
           // Native smooth scroll to top
           window.scrollTo({ top: 0, behavior: 'smooth' })
           
           // Release the lock once we're safely back near the top
           const checkScroll = () => {
              if (window.scrollY <= 50) {
                 window.isRewinding = false
              } else {
                 requestAnimationFrame(checkScroll)
              }
           }
           requestAnimationFrame(checkScroll)
       }
    }
    
    window.addEventListener('scroll', onScroll)
    return () => {
       window.removeEventListener('scroll', onScroll)
       document.body.style.overflow = 'hidden'
       document.body.style.height = '100vh'
    }
  }, [camera])

  useFrame(() => {
    // Camera arrives at the final banner at 90% scroll, leaving the last 10% as a reading buffer
    const progress = Math.min(scrollRef.current / 0.9, 1.0)
    
    // Move from z = 60 to z = -360 based on progress
    const targetZ = 60 - (progress * 420)
    
    // Smooth camera interpolation for forward movement
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.05)
    
    // Zig-zag weave MUST be based on the already-smoothed camera.position.z
    const weavePhase = (camera.position.z / 60) * Math.PI
    const targetX = -Math.cos(weavePhase) * 8 // Gentle sweep between -8 and 8
    
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 10, 0.05)
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.05)
    
    // Look straight ahead at the center path to keep everything in view
    camera.lookAt(0, 10, camera.position.z - 40)
    globalCamPos.copy(camera.position)
  })

  return (
    <group>
      {timelineData.map((item, idx) => {
        // Place buildings along the Z axis, 60 units apart
        const zPos = -(idx * 60)
        // Bring buildings back into view
        const xPos = idx % 2 === 0 ? -16 : 16
        
        return (
          <group key={idx} position={[xPos, 0, zPos]}>
            <CyberBuilding proj={item} />

            {/* The HTML Billboard */}
            <Html 
              position={[idx % 2 === 0 ? 8 : -8, 15, 6]} 
              transform 
              center 
              scale={2.5}
              rotation-y={idx % 2 === 0 ? Math.PI / 8 : -Math.PI / 8}
            >
              <div 
                className="w-[450px] p-10 bg-black/80 backdrop-blur-xl rounded-xl pointer-events-auto transition-transform hover:scale-105"
                style={{ 
                  border: `2px solid ${item.color}`, 
                  boxShadow: `0 0 50px ${item.color}60`,
                  borderLeft: `8px solid ${item.color}`
                }}
              >
                {item.category && (
                  <div className="text-sm font-bold tracking-[0.3em] mb-4 opacity-80" style={{ color: item.color }}>// {item.category}</div>
                )}
                <h2 className="text-4xl font-black mb-4 tracking-widest uppercase" style={{ color: item.color }}>{item.title}</h2>
                <p className="text-white/95 text-xl mb-8 leading-relaxed font-mono drop-shadow-md">{item.description}</p>
                {item.skills && item.skills.length > 0 && (
                  <div className="flex gap-6 mt-4 mb-6 flex-wrap">
                    {item.skills.map((icon, i) => (
                      <div 
                        key={i} 
                        className="animate-pulse-glow"
                        style={{ 
                          '--glow-color': item.color,
                          animationDelay: `${i * 0.2}s`
                        }}
                      >
                        <i className={`devicon-${icon} text-6xl`}></i>
                      </div>
                    ))}
                  </div>
                )}
                {item.linkText && (
                  <button 
                    onClick={() => {
                       window.open('https://github.com/shivanshmax-Monster', '_blank')
                    }}
                    className="mt-4 px-6 py-2 border-2 text-sm font-bold tracking-widest uppercase hover:bg-white/10 transition-colors cursor-none"
                    style={{ borderColor: item.color, color: item.color }}
                  >
                    {item.linkText}
                  </button>
                )}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

// --- CUSTOM POST-PROCESSING MANAGER ---
function GameEffects() {
  const bloomRef = useRef()
  const chromRef = useRef()
  
  useFrame(() => {
    if (chromRef.current && bloomRef.current) {
      chromRef.current.offset.lerp(new THREE.Vector2(0.0002, 0.0002), 0.1)
      bloomRef.current.intensity = THREE.MathUtils.lerp(bloomRef.current.intensity, 2.0, 0.1)
    }
  })

  return (
    <EffectComposer multisampling={0}>
      <Bloom 
        ref={bloomRef}
        intensity={2.0} 
        luminanceThreshold={0.1} 
        luminanceSmoothing={0.9} 
        mipmapBlur 
      />
      <ChromaticAberration 
        ref={chromRef}
        blendFunction={BlendFunction.NORMAL} 
        offset={[0.0002, 0.0002]} 
        radialModulation={false}
      />
    </EffectComposer>
  )
}

// --- CUSTOM CURSOR ---
function DomCursor() {
  const cursorRef = useRef(null)
  
  useLayoutEffect(() => {
    const onMouseMove = (e) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${e.clientX - 12}px, ${e.clientY - 12}px, 0)`
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  return (
    <div 
      ref={cursorRef} 
      className="fixed top-0 left-0 w-6 h-6 border-2 border-synth-cyan rounded-full pointer-events-none mix-blend-screen z-[9999] shadow-[0_0_15px_#00FFFF] flex items-center justify-center transition-transform duration-75 ease-out"
      style={{ transform: 'translate3d(-100px, -100px, 0)' }}
    >
      <div className="w-1 h-1 bg-synth-magenta rounded-full shadow-[0_0_10px_#ff00ff]" />
    </div>
  )
}

function WelcomeScreen({ onEnter }) {
  const [fading, setFading] = useState(false)
  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-1000 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <div className="text-center">
        <h1 className="text-7xl font-black text-synth-cyan tracking-[0.3em] mb-4 text-glow animate-pulse drop-shadow-lg uppercase">System Offline</h1>
        <p className="text-synth-magenta font-mono tracking-widest mb-12 text-lg">AWAITING NEURAL LINK CONNECTION...</p>
        <button 
          onClick={() => {
            setFading(true)
            setTimeout(onEnter, 1000)
          }}
          className="px-12 py-4 border-2 border-synth-cyan text-synth-cyan text-xl font-bold tracking-widest hover:bg-synth-cyan hover:text-black hover:shadow-[0_0_30px_#00ffff] transition-all duration-300 rounded cursor-none"
        >
          INITIALIZE LINK
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [started, setStarted] = useState(false)

  return (
    <>
      {/* Intro Screen Overlay */}
      {!started && <WelcomeScreen onEnter={() => setStarted(true)} />}

      {/* Main App Content - Fades in after intro */}
      <div className={`transition-opacity duration-1000 ${started ? 'opacity-100' : 'opacity-0 pointer-events-none'} h-full w-full`}>
        <div className="fixed inset-0 z-0 bg-[#050014] cursor-none">
          <Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: "high-performance" }}>
            <fog attach="fog" args={['#050014', 20, 150]} />
            <ambientLight intensity={0.2} />
            
            <ScrollPortfolio />
            
            <ShaderGrid />
            <RetroSun />
            <BackgroundSky />
            <BackgroundCity />
            
            <Stars radius={200} depth={50} count={5000} factor={4} saturation={1} fade speed={1} />
            <ShootingStars4K />
            <CyberSleigh />
            
            <GameEffects />
          </Canvas>
        </div>

        {/* Portfolio HUD */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between z-10">
          <header className="w-full p-8 flex justify-between items-start pointer-events-none">
            <div>
              <h1 className="text-4xl font-bold text-synth-cyan text-glow tracking-widest leading-none">SHIVANSH SAHU</h1>
              <h2 className="text-lg font-bold text-white/80 tracking-widest mt-2 uppercase">B.TECH AI STUDENT @ MITS GWALIOR</h2>
            </div>
            <div className="text-synth-magenta text-xl font-bold tracking-widest text-glow blink border border-synth-magenta px-4 py-2 rounded bg-black/50">
              SCROLL TO EXPLORE
            </div>
            <nav className="flex gap-6 pointer-events-auto cursor-none">
              <a href="https://github.com/shivanshmax-Monster" target="_blank" className="text-synth-magenta hover:text-synth-cyan text-glow text-xl transition-colors"><i className="devicon-github-original"></i></a>
              <a href="https://www.linkedin.com/in/shivansh-sahu-ai" target="_blank" className="text-synth-magenta hover:text-synth-cyan text-glow text-xl transition-colors"><i className="devicon-linkedin-plain"></i></a>
              <a href="mailto:shivanshmax@gmail.com" className="text-synth-magenta hover:text-synth-cyan text-glow text-xl transition-colors"><i className="devicon-google-plain"></i></a>
            </nav>
          </header>
        </div>
      </div>

      <DomCursor />
    </>
  )
}
