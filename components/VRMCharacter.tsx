"use client"

import { useEffect, useRef } from "react"
// 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
// import { useAnimation } from "@/contexts/AnimationContext"

export default function VRMCharacter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 🎭 ANIMACIONES DESACTIVADAS - Para activar, descomenta:
  // const { currentAnimation } = useAnimation()

  useEffect(() => {
    if (!canvasRef.current) return

    let animationId: number
    let scene: any
    let camera: any
    let renderer: any
    let vrm: any
    let controls: any

    const initThree = async () => {
      const THREE = await import("three")
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm")
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")

      const canvas = canvasRef.current
      if (!canvas) return

      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.1, 20)
      camera.position.set(0, 1.4, 3)

      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
      renderer.setSize(canvas.clientWidth, canvas.clientHeight)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.shadowMap.enabled = true

      controls = new OrbitControls(camera, canvas)
      controls.target.set(0, 1.2, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.minDistance = 1.5
      controls.maxDistance = 5
      controls.maxPolarAngle = Math.PI / 1.5
      controls.update()

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
      scene.add(ambientLight)

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(5, 5, 5)
      directionalLight.castShadow = true
      scene.add(directionalLight)

      const pointLight1 = new THREE.PointLight(0xffb6c1, 0.5)
      pointLight1.position.set(-5, 3, -5)
      scene.add(pointLight1)

      const pointLight2 = new THREE.PointLight(0xffd700, 0.4)
      pointLight2.position.set(5, 2, -3)
      scene.add(pointLight2)

      const loader = new GLTFLoader()
      loader.register((parser) => new VRMLoaderPlugin(parser))

      try {
        const gltf = await loader.loadAsync("/models/character.vrm")
        vrm = gltf.userData.vrm

        if (vrm) {
          VRMUtils.rotateVRM0(vrm)
          vrm.scene.rotation.y = Math.PI
          scene.add(vrm.scene)
          console.log("✅ VRM character loaded")
        }
      } catch (error) {
        console.error("❌ Error loading VRM:", error)
      }

      const clock = new THREE.Clock()
      const animate = () => {
        animationId = requestAnimationFrame(animate)

        const deltaTime = clock.getDelta()
        const elapsedTime = clock.getElapsedTime()

        if (vrm) {
          const breathe = Math.sin(elapsedTime * 2) * 0.01
          vrm.scene.position.y = breathe
          vrm.update(deltaTime)
        }

        controls.update()
        renderer.render(scene, camera)
      }

      animate()

      const handleResize = () => {
        if (!canvas) return
        camera.aspect = canvas.clientWidth / canvas.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(canvas.clientWidth, canvas.clientHeight)
      }

      window.addEventListener("resize", handleResize)

      return () => {
        window.removeEventListener("resize", handleResize)
      }
    }

    initThree()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (renderer) {
        renderer.dispose()
      }
      if (controls) {
        controls.dispose()
      }
      if (vrm) {
        const THREE_VRM = require("@pixiv/three-vrm")
        THREE_VRM.VRMUtils.deepDispose(vrm.scene)
      }
    }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}