// A lightweight 3D character stage built on Three.js. The two characters are
// modelled from simple 3D primitives (spheres/ellipsoids) with soft lighting
// and real shadows, then posed each frame using the SAME action logic as the
// 2D engine (computePose). It renders to its own transparent canvas, which the
// caller composites over a painted 2D background + captions.
//
// This is "cute 3D" (toy / claymation feel), not photoreal — see README notes.

import { computePose } from './characters'

// Build one character as a group of meshes; returns handles we animate.
function buildCharacter(THREE, cfg) {
  const group = new THREE.Group()
  const mat = (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.72, metalness: 0 })
  const fur = mat(cfg.fur)
  const sphere = (r, segs = 24) => new THREE.SphereGeometry(r, segs, segs)

  // Body
  const body = new THREE.Mesh(sphere(0.72), fur)
  body.scale.set(1, 1.12, 0.92); body.position.y = 0.82
  body.castShadow = true; group.add(body)

  // Tummy patch
  const tummy = new THREE.Mesh(sphere(0.5), mat(cfg.shade))
  tummy.scale.set(0.8, 1.0, 0.6); tummy.position.set(0, 0.78, 0.42); group.add(tummy)

  // Head
  const head = new THREE.Group(); head.position.y = 1.88; group.add(head)
  const skull = new THREE.Mesh(sphere(0.64), fur); skull.castShadow = true; head.add(skull)

  // Ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(sphere(0.24), mat(cfg.ear))
    ear.position.set(sx * 0.46, 0.5, 0); ear.castShadow = true; head.add(ear)
    const inner = new THREE.Mesh(sphere(0.13), mat(cfg.cheek))
    inner.position.set(sx * 0.46, 0.5, 0.12); head.add(inner)
  }

  // Muzzle
  const muzzle = new THREE.Mesh(sphere(0.26), mat(cfg.shade))
  muzzle.scale.set(1.1, 0.8, 0.7); muzzle.position.set(0, -0.06, 0.52); head.add(muzzle)

  // Eyes
  const eyeMat = mat(cfg.accent)
  const eyes = []
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(sphere(0.085, 16), eyeMat)
    eye.position.set(sx * 0.22, 0.06, 0.56); head.add(eye); eyes.push(eye)
    const spark = new THREE.Mesh(sphere(0.03, 10), mat('#ffffff'))
    spark.position.set(sx * 0.22 + 0.03, 0.1, 0.62); head.add(spark)
  }

  // Nose
  const nose = new THREE.Mesh(sphere(0.06, 12), eyeMat)
  nose.position.set(0, -0.02, 0.74); head.add(nose)

  // Cheeks
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(sphere(0.14, 16), mat(cfg.cheek))
    cheek.scale.set(1, 0.7, 0.5); cheek.position.set(sx * 0.38, -0.12, 0.5); head.add(cheek)
  }

  // Mouth (scales with speech)
  const mouth = new THREE.Mesh(sphere(0.1, 12), mat('#5b2a32'))
  mouth.scale.set(1, 0.4, 0.4); mouth.position.set(0, -0.2, 0.66); head.add(mouth)

  // Arms (each in a pivot group at the shoulder)
  const arms = {}
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.64, 1.32, 0.1)
    const arm = new THREE.Mesh(sphere(0.2), fur)
    arm.scale.set(0.8, 1.3, 0.8); arm.position.set(0, -0.36, 0); arm.castShadow = true
    pivot.add(arm); group.add(pivot); arms[side] = pivot
  }

  // Feet
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(sphere(0.24), mat(cfg.shade))
    foot.scale.set(1, 0.6, 1.2); foot.position.set(sx * 0.32, 0.12, 0.2); foot.castShadow = true
    group.add(foot)
  }

  return { group, head, skull, eyes, mouth, arms, baseY: 0 }
}

export async function createScene3D(W, H, mainCfg, partnerCfg) {
  const THREE = await import('three')

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(W, H, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100)
  camera.position.set(0, 1.7, 7); camera.lookAt(0, 1.35, 0)

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9988aa, 1.0))
  const key = new THREE.DirectionalLight(0xffffff, 1.15)
  key.position.set(3.5, 7, 5); key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  const cam = key.shadow.camera
  cam.left = -7; cam.right = 7; cam.top = 7; cam.bottom = -7; cam.near = 0.5; cam.far = 30
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffe6f0, 0.35); fill.position.set(-4, 3, 4); scene.add(fill)

  // Shadow-only ground (transparent except for the soft shadows).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)

  const main = buildCharacter(THREE, mainCfg); main.group.position.set(-1.7, 0, 0)
  const partner = buildCharacter(THREE, partnerCfg); partner.group.position.set(1.7, 0, 0)
  scene.add(main.group); scene.add(partner.group)

  const baseX = { main: -1.7, partner: 1.7 }

  const applyPose = (ch, who, pose, t, mouth, facing) => {
    const g = ch.group
    g.position.x = baseX[who] + pose.dx * 0.014
    g.position.y = -pose.dy * 0.02 + Math.sin(t * 2) * 0.04
    g.rotation.z = -pose.lean
    // Face the partner a little; turn away when sulking.
    ch.head.rotation.y = pose.turnAway ? facing * 0.7 : facing * 0.18
    ch.head.rotation.x = Math.sin(t * 2) * 0.03
    ch.arms.L.rotation.z = pose.armL
    ch.arms.R.rotation.z = pose.armR
    // Mouth + blink.
    ch.mouth.scale.set(1 + mouth * 0.6, 0.3 + mouth * 1.8, 0.4)
    const blink = (t % 3.2) < 0.14
    const ey = blink ? 0.1 : 1
    ch.eyes.forEach((e) => (e.scale.y = ey))
  }

  const frame = ({ t, lt, action, emotion, mainMouth, partnerMouth, mainRole, partnerRole }) => {
    const mp = computePose(action, mainRole, lt, t, mainMouth, emotion, 1)
    const pp = computePose(action, partnerRole, lt, t, partnerMouth, emotion, -1)
    applyPose(main, 'main', mp, t, mainMouth, 1)
    applyPose(partner, 'partner', pp, t + 1.3, partnerMouth, -1)
    // Subtle cinematic camera drift.
    camera.position.x = Math.sin(t * 0.25) * 0.5
    camera.position.y = 1.7 + Math.sin(t * 0.2) * 0.12
    camera.lookAt(0, 1.35, 0)
    renderer.render(scene, camera)
  }

  const dispose = () => { try { renderer.dispose() } catch {} }

  return { canvas, frame, dispose }
}
