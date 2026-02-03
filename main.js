import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { LoopSubdivision } from 'three-subdivide';

// ============================================
// Volumetric Cloud Shader
// ============================================

const cloudVertexShader = `
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const cloudFragmentShader = `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vWorldPosition;

// Simplex noise functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < 5; i++) {
    value += amplitude * snoise(p * frequency);
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
}

void main() {
  vec3 pos = vWorldPosition * 0.002;
  pos.x += uTime * 0.05;

  float noise = fbm(pos);
  noise = smoothstep(-0.2, 0.6, noise);

  // Soft edges based on UV
  float edgeFade = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
  edgeFade *= smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

  float alpha = noise * edgeFade * uOpacity;

  // Subtle color variation
  vec3 color = uColor + vec3(noise * 0.1);

  gl_FragColor = vec4(color, alpha);
}
`;

let cloudMeshes = [];

// ============================================
// CHROMATIC REALMS - Actual World Environments
// ============================================

const WORLDS = [
  {
    name: 'Cloud Kingdom',
    sky: new THREE.Color(0x0a1628),
    ground: new THREE.Color(0x0a1520),
    chair: new THREE.Color(0xf0e8dd),
    ambient: 0.15,
    lightColor: 0x6688bb,
    lightIntensity: 2.5,
    fog: { color: 0x0a1628, near: 3000, far: 8000 },
    particles: { color: 0xffffff, count: 80, size: 2, type: 'stars' }
  },
  {
    name: 'Enchanted Forest',
    sky: new THREE.Color(0x0d1a0d),
    ground: new THREE.Color(0x1a2f1a),
    chair: new THREE.Color(0xd4c4a0),
    ambient: 0.15,
    lightColor: 0x88ff88,
    lightIntensity: 2.5,
    fog: { color: 0x0d1a0d, near: 1500, far: 4000 },
    particles: { color: 0x88ff66, count: 40, size: 4, type: 'fireflies' }
  },
  {
    name: 'Desert Dusk',
    sky: new THREE.Color(0x2a1810),
    ground: new THREE.Color(0x8b6914),
    chair: new THREE.Color(0xfff8f0),
    ambient: 0.2,
    lightColor: 0xff8844,
    lightIntensity: 3,
    fog: { color: 0x4a2820, near: 800, far: 4000 },
    particles: { color: 0xddaa66, count: 60, size: 2, type: 'dust' }
  },
  {
    name: 'Deep Ocean',
    sky: new THREE.Color(0x001828),
    ground: new THREE.Color(0x002244),
    chair: new THREE.Color(0xe8f4ff),
    ambient: 0.1,
    lightColor: 0x44aaff,
    lightIntensity: 2,
    fog: { color: 0x001828, near: 400, far: 2500 },
    particles: { color: 0x66ccff, count: 80, size: 5, type: 'bubbles' }
  },
  {
    name: 'Lunar Surface',
    sky: new THREE.Color(0x0a0a12),
    ground: new THREE.Color(0x1a1a22),
    chair: new THREE.Color(0xf0f0f5),
    ambient: 0.3,
    lightColor: 0x8899bb,
    lightIntensity: 3,
    fog: { color: 0x0a0a12, near: 2500, far: 6000 },
    particles: { color: 0xffffff, count: 200, size: 2, type: 'stars' }
  }
];

let currentWorld = 0;
let targetWorld = 0;
let chairMaterial, groundMesh, groundMaterial;
let keyLight, ambientLight;
let particles = [];
let particleGroup;
let environmentObjects = [];

// ============================================
// Scene Setup
// ============================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1628);
scene.fog = new THREE.Fog(0x0a1628, 3000, 8000);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Set initial camera position
camera.position.set(1400, 500, 1400);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 800;
controls.maxDistance = 3000;
controls.maxPolarAngle = Math.PI / 2.1;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;
controls.target.set(0, 300, 0);
controls.update();

// ============================================
// Lighting
// ============================================

keyLight = new THREE.DirectionalLight(0xffffff, 4);
keyLight.position.set(400, 600, 400);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 4096;
keyLight.shadow.mapSize.height = 4096;
keyLight.shadow.camera.near = 100;
keyLight.shadow.camera.far = 3000;
keyLight.shadow.camera.left = -1500;
keyLight.shadow.camera.right = 1500;
keyLight.shadow.camera.top = 1500;
keyLight.shadow.camera.bottom = -1500;
keyLight.shadow.bias = -0.001;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
fillLight.position.set(-400, 200, -200);
scene.add(fillLight);

ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// ============================================
// Ground - Large environment floor
// ============================================

const groundGeo = new THREE.CircleGeometry(3000, 64);
groundMaterial = new THREE.MeshStandardMaterial({
  color: WORLDS[0].ground,
  roughness: 0.9,
  metalness: 0.1
});
groundMesh = new THREE.Mesh(groundGeo, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -10;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// ============================================
// Environment Objects (trees, rocks, etc.)
// ============================================

function createEnvironmentObjects() {
  // Clear existing
  environmentObjects.forEach(obj => scene.remove(obj));
  environmentObjects = [];

  const world = WORLDS[targetWorld];

  if (world.name === 'Enchanted Forest') {
    // Create simple tree silhouettes
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const dist = 1200 + Math.random() * 800;
      const height = 400 + Math.random() * 300;

      const trunkGeo = new THREE.CylinderGeometry(15, 25, height * 0.4, 8);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);

      const foliageGeo = new THREE.ConeGeometry(80 + Math.random() * 40, height * 0.7, 8);
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1a3a1a });
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.y = height * 0.4;

      const tree = new THREE.Group();
      tree.add(trunk);
      tree.add(foliage);
      tree.position.set(Math.cos(angle) * dist, height * 0.2, Math.sin(angle) * dist);
      tree.castShadow = true;

      scene.add(tree);
      environmentObjects.push(tree);
    }
  } else if (world.name === 'Lunar Surface') {
    // Create moon craters/rocks
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 400 + Math.random() * 1500;
      const size = 20 + Math.random() * 60;

      const rockGeo = new THREE.DodecahedronGeometry(size, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x333340,
        roughness: 1,
        flatShading: true
      });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(Math.cos(angle) * dist, size * 0.3, Math.sin(angle) * dist);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;

      scene.add(rock);
      environmentObjects.push(rock);
    }
  } else if (world.name === 'Desert Dusk') {
    // Sand dunes (simple curved shapes)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 1000 + Math.random() * 500;

      const duneGeo = new THREE.SphereGeometry(300 + Math.random() * 200, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const duneMat = new THREE.MeshStandardMaterial({
        color: 0xc4a060,
        roughness: 1
      });
      const dune = new THREE.Mesh(duneGeo, duneMat);
      dune.position.set(Math.cos(angle) * dist, -50, Math.sin(angle) * dist);
      dune.scale.y = 0.3;

      scene.add(dune);
      environmentObjects.push(dune);
    }
  } else if (world.name === 'Deep Ocean') {
    // Seaweed / coral
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 500 + Math.random() * 1000;

      const coralGeo = new THREE.ConeGeometry(30, 150 + Math.random() * 100, 5);
      const coralMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.5 + Math.random() * 0.2, 0.6, 0.3)
      });
      const coral = new THREE.Mesh(coralGeo, coralMat);
      coral.position.set(Math.cos(angle) * dist, 50, Math.sin(angle) * dist);

      scene.add(coral);
      environmentObjects.push(coral);
    }
  } else if (world.name === 'Cloud Kingdom') {
    // Distant, dispersed cloud clusters
    cloudMeshes = [];

    // Create distant cloud clusters
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 2500 + Math.random() * 1500;
      const baseY = 800 + Math.random() * 600;

      const cloudGroup = new THREE.Group();

      // Each cloud is a cluster of soft spheres
      const numPuffs = 5 + Math.floor(Math.random() * 4);
      for (let j = 0; j < numPuffs; j++) {
        const puffSize = 100 + Math.random() * 150;
        const puffGeo = new THREE.SphereGeometry(puffSize, 12, 12);
        const puffMat = new THREE.MeshStandardMaterial({
          color: 0xddeeff,
          emissive: 0x334455,
          emissiveIntensity: 0.15,
          roughness: 1,
          metalness: 0,
          transparent: true,
          opacity: 0.6
        });

        const puff = new THREE.Mesh(puffGeo, puffMat);
        puff.position.set(
          (Math.random() - 0.5) * 400,
          (Math.random() - 0.5) * 60,
          (Math.random() - 0.5) * 250
        );
        puff.scale.y = 0.5; // Flatten for cloud shape

        cloudGroup.add(puff);
      }

      cloudGroup.position.set(
        Math.cos(angle) * dist,
        baseY,
        Math.sin(angle) * dist
      );

      scene.add(cloudGroup);
      environmentObjects.push(cloudGroup);
    }

    // Cloud flowers - stem with tiny cloud on top
    flowerMeshes = [];
    const flowerColors = [
      0x888899, // Grey blue
      0x909090, // Medium grey
      0x7a7a8a, // Darker grey
      0x9a9aaa  // Soft grey
    ];

    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 150 + Math.random() * 1500;

      const flower = new THREE.Group();
      const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      const stemHeight = 30 + Math.random() * 50;

      // Store for animation
      flower.userData = {
        swaySpeed: 0.5 + Math.random() * 0.5,
        swayOffset: Math.random() * Math.PI * 2,
        swayAmount: 0.05 + Math.random() * 0.05
      };
      flowerMeshes.push(flower);

      // Stem
      const stemGeo = new THREE.CylinderGeometry(1.5, 2.5, stemHeight, 6);
      const stemMat = new THREE.MeshStandardMaterial({
        color: 0x2a5a2a,
        roughness: 0.9
      });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = stemHeight / 2;
      flower.add(stem);

      // Tiny cloud bloom on top
      const cloudBloom = new THREE.Group();
      const numPuffs = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < numPuffs; j++) {
        const puffSize = 6 + Math.random() * 8;
        const puffGeo = new THREE.SphereGeometry(puffSize, 8, 8);
        const puffMat = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 0.15,
          roughness: 1,
          metalness: 0
        });

        const puff = new THREE.Mesh(puffGeo, puffMat);
        puff.position.set(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 12
        );
        puff.scale.y = 0.6;

        cloudBloom.add(puff);
      }
      cloudBloom.position.y = stemHeight;
      flower.add(cloudBloom);

      // Small leaves on stem
      for (let k = 0; k < 2; k++) {
        const leafGeo = new THREE.SphereGeometry(5, 4, 4);
        const leafMat = new THREE.MeshStandardMaterial({
          color: 0x3a7a3a,
          roughness: 0.8
        });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(
          (Math.random() - 0.5) * 8,
          stemHeight * (0.3 + k * 0.3),
          (Math.random() - 0.5) * 8
        );
        leaf.scale.set(1, 0.3, 0.6);
        flower.add(leaf);
      }

      flower.position.set(
        Math.cos(angle) * dist,
        0,
        Math.sin(angle) * dist
      );

      // Slight random tilt
      flower.rotation.x = (Math.random() - 0.5) * 0.2;
      flower.rotation.z = (Math.random() - 0.5) * 0.2;

      scene.add(flower);
      environmentObjects.push(flower);
    }

    // === REALISTIC MOON ===
    const moonPos = new THREE.Vector3(-2500, 1000, -3500);

    // Moon core - bright center
    const moonCoreGeo = new THREE.SphereGeometry(180, 64, 64);
    const moonCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfffff8
    });
    const moonCore = new THREE.Mesh(moonCoreGeo, moonCoreMat);
    moonCore.position.copy(moonPos);
    scene.add(moonCore);
    environmentObjects.push(moonCore);

    // Moon surface with subtle variation
    const moonSurfaceGeo = new THREE.SphereGeometry(182, 64, 64);
    const moonSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0xeeeee8,
      emissive: 0xffffee,
      emissiveIntensity: 0.8,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.6
    });
    const moonSurface = new THREE.Mesh(moonSurfaceGeo, moonSurfaceMat);
    moonSurface.position.copy(moonPos);
    scene.add(moonSurface);
    environmentObjects.push(moonSurface);

    // Inner glow
    const moonGlow1Geo = new THREE.SphereGeometry(220, 32, 32);
    const moonGlow1Mat = new THREE.MeshBasicMaterial({
      color: 0xffffee,
      transparent: true,
      opacity: 0.4
    });
    const moonGlow1 = new THREE.Mesh(moonGlow1Geo, moonGlow1Mat);
    moonGlow1.position.copy(moonPos);
    scene.add(moonGlow1);
    environmentObjects.push(moonGlow1);

    // Mid glow
    const moonGlow2Geo = new THREE.SphereGeometry(300, 32, 32);
    const moonGlow2Mat = new THREE.MeshBasicMaterial({
      color: 0xddeeff,
      transparent: true,
      opacity: 0.15
    });
    const moonGlow2 = new THREE.Mesh(moonGlow2Geo, moonGlow2Mat);
    moonGlow2.position.copy(moonPos);
    scene.add(moonGlow2);
    environmentObjects.push(moonGlow2);

    // Outer glow - large atmospheric haze
    const moonGlow3Geo = new THREE.SphereGeometry(500, 32, 32);
    const moonGlow3Mat = new THREE.MeshBasicMaterial({
      color: 0x8899bb,
      transparent: true,
      opacity: 0.06
    });
    const moonGlow3 = new THREE.Mesh(moonGlow3Geo, moonGlow3Mat);
    moonGlow3.position.copy(moonPos);
    scene.add(moonGlow3);
    environmentObjects.push(moonGlow3);

    // Moon light - casts light into scene
    const moonLight = new THREE.DirectionalLight(0xaabbdd, 0.5);
    moonLight.position.copy(moonPos);
    moonLight.target.position.set(0, 0, 0);
    scene.add(moonLight);
    scene.add(moonLight.target);
    environmentObjects.push(moonLight);

    // === FLOATING MAGIC PARTICLES ===
    magicParticles = [];
    for (let i = 0; i < 100; i++) {
      const particleGeo = new THREE.SphereGeometry(2 + Math.random() * 3, 6, 6);
      const particleMat = new THREE.MeshBasicMaterial({
        color: 0xaaccff,
        transparent: true,
        opacity: 0.4 + Math.random() * 0.4
      });
      const magicParticle = new THREE.Mesh(particleGeo, particleMat);
      magicParticle.position.set(
        (Math.random() - 0.5) * 2000,
        50 + Math.random() * 500,
        (Math.random() - 0.5) * 2000
      );
      magicParticle.userData = {
        floatSpeed: 0.2 + Math.random() * 0.3,
        floatOffset: Math.random() * Math.PI * 2,
        baseY: magicParticle.position.y,
        driftX: (Math.random() - 0.5) * 0.5,
        driftZ: (Math.random() - 0.5) * 0.5
      };
      scene.add(magicParticle);
      environmentObjects.push(magicParticle);
      magicParticles.push(magicParticle);
    }

    // === CHAIR SPOTLIGHT ===
    const spotLight = new THREE.SpotLight(0x6688cc, 3);
    spotLight.position.set(0, 1500, 0);
    spotLight.target.position.set(0, 0, 0);
    spotLight.angle = Math.PI / 8;
    spotLight.penumbra = 0.8;
    spotLight.decay = 1;
    spotLight.distance = 2500;
    scene.add(spotLight);
    scene.add(spotLight.target);
    environmentObjects.push(spotLight);

    // === GROUND GLOW RING around chair ===
    const glowRingGeo = new THREE.RingGeometry(300, 600, 64);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0x4466aa,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 2;
    scene.add(glowRing);
    environmentObjects.push(glowRing);
  }
}

// Track magic particles for animation
let magicParticles = [];
let flowerMeshes = [];
let petals = [];
let fireflies = [];

// ============================================
// Particles System
// ============================================

function createParticles() {
  if (particleGroup) {
    scene.remove(particleGroup);
    particles = [];
  }

  particleGroup = new THREE.Group();
  scene.add(particleGroup);

  const world = WORLDS[targetWorld];
  const config = world.particles;

  for (let i = 0; i < config.count; i++) {
    const geo = config.type === 'clouds'
      ? new THREE.SphereGeometry(config.size, 8, 8)
      : new THREE.SphereGeometry(config.size, 6, 6);

    const mat = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: config.type === 'stars' ? 1 : 0.7
    });

    const particle = new THREE.Mesh(geo, mat);

    if (config.type === 'stars') {
      // Stars spread across sky dome
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.4;
      const r = 2500;
      particle.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) + 500,
        r * Math.sin(phi) * Math.sin(theta)
      );
    } else {
      particle.position.set(
        (Math.random() - 0.5) * 2000,
        Math.random() * 800 + 50,
        (Math.random() - 0.5) * 2000
      );
    }

    particle.userData = {
      type: config.type,
      speed: Math.random() * 0.5 + 0.2,
      offset: Math.random() * Math.PI * 2,
      baseY: particle.position.y
    };

    particles.push(particle);
    particleGroup.add(particle);
  }
}

function updateParticles(time) {
  particles.forEach(p => {
    const { type, speed, offset, baseY } = p.userData;

    if (type === 'fireflies') {
      p.position.y = baseY + Math.sin(time * speed * 2 + offset) * 50;
      p.position.x += Math.sin(time * speed + offset) * 0.5;
      p.material.opacity = 0.3 + Math.sin(time * 3 + offset) * 0.4;
    } else if (type === 'bubbles') {
      p.position.y += speed * 2;
      p.position.x += Math.sin(time + offset) * 0.3;
      if (p.position.y > 1000) {
        p.position.y = 0;
        p.position.x = (Math.random() - 0.5) * 2000;
        p.position.z = (Math.random() - 0.5) * 2000;
      }
    } else if (type === 'dust') {
      p.position.x += Math.sin(time * 0.5 + offset) * 0.8;
      p.position.z += Math.cos(time * 0.3 + offset) * 0.5;
      p.position.y += 0.1;
      if (p.position.y > 600) p.position.y = 50;
    } else if (type === 'clouds') {
      p.position.x += Math.sin(time * 0.1 + offset) * 0.2;
    } else if (type === 'stars') {
      p.material.opacity = 0.5 + Math.sin(time * 2 + offset) * 0.5;
    }
  });
}

// ============================================
// Chair Setup
// ============================================

const textureLoader = new THREE.TextureLoader();
const modelPath = 'Inger Swivel Chair  Cream/';

const diffuseMap = textureLoader.load(modelPath + 'maps/Inger_Swivel_Chair_Cream_chair_diff.jpg');
diffuseMap.colorSpace = THREE.SRGBColorSpace;
diffuseMap.wrapS = THREE.RepeatWrapping;
diffuseMap.wrapT = THREE.RepeatWrapping;

const normalMap = textureLoader.load(modelPath + 'maps/Inger_Swivel_Chair_Cream_chair_normal.jpg');
normalMap.wrapS = THREE.RepeatWrapping;
normalMap.wrapT = THREE.RepeatWrapping;

const displacementMap = textureLoader.load(modelPath + 'maps/Inger_Swivel_Chair_Cream_chair_disp.jpg');
displacementMap.wrapS = THREE.RepeatWrapping;
displacementMap.wrapT = THREE.RepeatWrapping;

chairMaterial = new THREE.MeshPhysicalMaterial({
  map: diffuseMap,
  color: WORLDS[0].chair.clone(),
  normalMap: normalMap,
  normalScale: new THREE.Vector2(2.5, 2.5),
  displacementMap: displacementMap,
  displacementScale: 15,
  displacementBias: -5,
  roughness: 0.85,
  metalness: 0.0,
  sheen: 0.3,
  sheenColor: new THREE.Color(0xffffff),
  sheenRoughness: 0.7,
  envMapIntensity: 0.5,
  side: THREE.DoubleSide
});

// Load model
const fbxLoader = new FBXLoader();
const loadingDiv = document.getElementById('loading');

fbxLoader.load(
  modelPath + 'Inger_Swivel_Chair_Cream_.fbx',
  (fbx) => {
    fbx.traverse((child) => {
      if (child.isMesh) {
        // Subdivide for puffy look
        try {
          const subdivided = LoopSubdivision.modify(child.geometry, 2);
          child.geometry = subdivided;
        } catch(e) {
          console.log('Subdivision failed:', e);
        }
        child.geometry.computeVertexNormals();

        // Apply textured material
        child.material = chairMaterial;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(fbx);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Center the object at origin
    fbx.position.sub(center);
    // Lift it so bottom is at y=0
    fbx.position.y += size.y / 2;

    scene.add(fbx);

    // Ground below chair
    groundMesh.position.y = -10;

    // Camera
    camera.position.set(1800, 600, 1800);
    controls.target.set(0, size.y / 2, 0);
    controls.update();

    loadingDiv.classList.add('hidden');
    document.getElementById('slider-container').classList.add('visible');

    // Initialize first world
    createEnvironmentObjects();
    createParticles();

    console.log('Chair loaded! Size:', size, 'Position:', fbx.position);
  }
);

// ============================================
// World Transition
// ============================================

function lerpColor(color, target, alpha) {
  color.r += (target.r - color.r) * alpha;
  color.g += (target.g - color.g) * alpha;
  color.b += (target.b - color.b) * alpha;
}

function transitionToWorld(index) {
  if (index === targetWorld) return;
  targetWorld = index;
  createEnvironmentObjects();
  createParticles();
}

function updateWorldTransition() {
  const speed = 0.05;
  const world = WORLDS[targetWorld];

  // Sky
  lerpColor(scene.background, world.sky, speed);

  // Fog
  lerpColor(scene.fog.color, new THREE.Color(world.fog.color), speed);
  scene.fog.near += (world.fog.near - scene.fog.near) * speed;
  scene.fog.far += (world.fog.far - scene.fog.far) * speed;

  // Ground
  lerpColor(groundMaterial.color, world.ground, speed);

  // Chair
  lerpColor(chairMaterial.color, world.chair, speed);

  // Lighting
  lerpColor(keyLight.color, new THREE.Color(world.lightColor), speed);
  keyLight.intensity += (world.lightIntensity - keyLight.intensity) * speed;
  ambientLight.intensity += (world.ambient - ambientLight.intensity) * speed;
}

// ============================================
// Slider UI
// ============================================

function createSliderUI() {
  const container = document.createElement('div');
  container.id = 'slider-container';
  container.innerHTML = `
    <div class="slider-track">
      ${WORLDS.map((w, i) => `
        <button class="slider-btn ${i === 0 ? 'active' : ''}" data-index="${i}">
          ${w.name}
        </button>
      `).join('')}
    </div>
  `;
  document.body.appendChild(container);

  container.querySelectorAll('.slider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      transitionToWorld(index);

      container.querySelectorAll('.slider-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

createSliderUI();

// ============================================
// Animation Loop
// ============================================

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  controls.update();
  updateWorldTransition();
  updateParticles(time);

  // Update cloud shader time
  cloudMeshes.forEach(cloud => {
    if (cloud.material.uniforms) {
      cloud.material.uniforms.uTime.value = time;
    }
  });

  // Animate magic particles - float upward and drift
  magicParticles.forEach(p => {
    const { floatSpeed, floatOffset, baseY, driftX, driftZ } = p.userData;
    p.position.y = baseY + Math.sin(time * floatSpeed + floatOffset) * 30;
    p.position.y += time * 2 % 600; // Slow rise
    p.position.x += driftX;
    p.position.z += driftZ;

    // Reset when too high
    if (p.position.y > 600) {
      p.position.y = 50;
      p.position.x = (Math.random() - 0.5) * 2000;
      p.position.z = (Math.random() - 0.5) * 2000;
      p.userData.baseY = p.position.y;
    }

    // Pulse opacity
    p.material.opacity = 0.3 + Math.sin(time * 2 + floatOffset) * 0.3;
  });

  renderer.render(scene, camera);
}

animate();

// ============================================
// Resize
// ============================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
