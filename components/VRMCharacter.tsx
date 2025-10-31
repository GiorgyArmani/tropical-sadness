"use client"

import { useEffect, useRef } from "react"

export default function VRMCharacter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    let animationId: number
    let scene: any
    let camera: any
    let renderer: any
    let vrm: any
    let controls: any
    let mixer: any

    const initThree = async () => {
      const THREE = await import("three")
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
      const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js")
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm")
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")

      const canvas = canvasRef.current
      if (!canvas) return

      scene = new THREE.Scene()
      
      // 📸 Cámara ajustada para ver el modelo COMPLETO
      camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
      // 📏 Posición: más lejos para ver todo el cuerpo
      camera.position.set(0, 1.0, 4)

      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
      renderer.setSize(canvas.clientWidth, canvas.clientHeight)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.shadowMap.enabled = true

      controls = new OrbitControls(camera, canvas)
      controls.target.set(0, 0.9, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.minDistance = 2
      controls.maxDistance = 8
      controls.maxPolarAngle = Math.PI / 1.5
      controls.update()

      // 💡 Iluminación
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
      scene.add(ambientLight)

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
      directionalLight.position.set(5, 5, 5)
      directionalLight.castShadow = true
      scene.add(directionalLight)

      const pointLight1 = new THREE.PointLight(0xffb6c1, 0.6)
      pointLight1.position.set(-5, 3, -5)
      scene.add(pointLight1)

      const pointLight2 = new THREE.PointLight(0xffd700, 0.5)
      pointLight2.position.set(5, 2, -3)
      scene.add(pointLight2)

      // 🎬 Función para cargar y reproducir animación FBX
      // ✅ DECLARADA ANTES DE USARLA para evitar errores
      const loadAndPlayAnimation = async (animationFile: string) => {
        if (!vrm || !mixer) return

        try {
          const fbxLoader = new FBXLoader()
          const fbx = await fbxLoader.loadAsync(`/animations/${animationFile}`)

          if (fbx.animations && fbx.animations.length > 0) {
            const clip = fbx.animations[0]
            const action = mixer.clipAction(clip)
            
            // 🔄 Configurar loop infinito
            action.setLoop(THREE.LoopRepeat, Infinity)
            
            // ⚡ Ajustar velocidad (1.0 = normal, 0.5 = lento, 2.0 = rápido)
            action.timeScale = 1.0
            
            action.play()

            console.log(`🎬 Playing animation: ${animationFile}`)
          }
        } catch (error) {
          console.error(`❌ Error loading animation ${animationFile}:`, error)
          console.log("💡 Falling back to default breathing animation")
        }
      }

      // 🎭 Cargar VRM
      const loader = new GLTFLoader()
      loader.register((parser) => new VRMLoaderPlugin(parser))

      try {
        const gltf = await loader.loadAsync("/models/character.vrm")
        vrm = gltf.userData.vrm

        if (vrm) {
          VRMUtils.rotateVRM0(vrm)
          vrm.scene.rotation.y = Math.PI
          scene.add(vrm.scene)
          
          // 🎬 Crear AnimationMixer
          mixer = new THREE.AnimationMixer(vrm.scene)
          
          console.log("✅ VRM character loaded")

          // 🎭 CARGAR Y REPRODUCIR ANIMACIÓN AUTOMÁTICAMENTE
          // 👇 CAMBIA "idle.fbx" por el nombre de tu archivo FBX de baile
          loadAndPlayAnimation("dance.fbx")
        }
      } catch (error) {
        console.error("❌ Error loading VRM:", error)
      }

      const clock = new THREE.Clock()
      const animate = () => {
        animationId = requestAnimationFrame(animate)

        const deltaTime = clock.getDelta()

        if (vrm) {
          // Actualizar el mixer si hay animaciones
          if (mixer) {
            mixer.update(deltaTime)
          } else {
            // Animación de respiración por defecto si no hay mixer
            const elapsedTime = clock.getElapsedTime()
            const breathe = Math.sin(elapsedTime * 2) * 0.01
            vrm.scene.position.y = breathe
          }
          
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
      if (mixer) {
        mixer.stopAllAction()
      }
      if (vrm) {
        const THREE_VRM = require("@pixiv/three-vrm")
        THREE_VRM.VRMUtils.deepDispose(vrm.scene)
      }
    }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}