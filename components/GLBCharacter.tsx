"use client"

import { useEffect, useRef } from "react"

export default function GLBCharacter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    let animationId: number
    let scene: any
    let camera: any
    let renderer: any
    let model: any
    let controls: any
    let mixer: any

    const initThree = async () => {
      const THREE = await import("three")
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")

      const canvas = canvasRef.current
      if (!canvas) return

      scene = new THREE.Scene()
      
      // 📸 Cámara - MUCHO MÁS CERCA
      camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 2000)
      camera.position.set(0, 1.5, 3.5)  // ✅ Acercada para ver el personaje completo

      renderer = new THREE.WebGLRenderer({ 
        canvas, 
        alpha: true, 
        antialias: true,
        premultipliedAlpha: false  // ✅ Importante para transparencias
      })
      renderer.setSize(canvas.clientWidth, canvas.clientHeight)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.shadowMap.enabled = true
      renderer.outputColorSpace = THREE.SRGBColorSpace  // ✅ Mejor manejo de colores

      controls = new OrbitControls(camera, canvas)
      controls.target.set(0, 0, 0)  // ✅ Apuntar al centro del personaje
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.minDistance = 1.5    // ✅ Permitir acercarse más
      controls.maxDistance = 8      // ✅ No alejarse tanto
      controls.maxPolarAngle = Math.PI / 1.5
      controls.update()

      // 💡 Iluminación - Ajustada para escala más pequeña
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.9)
      scene.add(ambientLight)

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
      directionalLight.position.set(5, 8, 5)  // ✅ Más cerca del modelo
      directionalLight.castShadow = true
      scene.add(directionalLight)

      const pointLight1 = new THREE.PointLight(0xffb6c1, 0.6)
      pointLight1.position.set(-3, 3, -3)  // ✅ Más cerca
      scene.add(pointLight1)

      const pointLight2 = new THREE.PointLight(0xffd700, 0.5)
      pointLight2.position.set(3, 2, -2)  // ✅ Más cerca
      scene.add(pointLight2)

      // 🎭 Cargar GLB (modelo + animación)
      try {
        console.log("⏳ Loading GLB (model + animation)...")

        const gltfLoader = new GLTFLoader()
        
        // 👇 COLOCA tu archivo dance.glb en /public/animations/
        const gltf = await gltfLoader.loadAsync("/animations/GALATEA-RIG-ANIMADO.glb")

        if (gltf.scene) {
          model = gltf.scene
          scene.add(model)
          
          console.log("✅ GLB model loaded successfully!")

          // 🎨 HABILITAR TRANSPARENCIA EN MATERIALES
          model.traverse((child: any) => {
            if (child.isMesh) {
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              
              materials.forEach((material: any) => {
                if (material) {
                  // ✅ Activar transparencia
                  material.transparent = true
                  material.alphaTest = 0.4  // Eliminar píxeles casi transparentes
                  material.side = THREE.DoubleSide  // Renderizar ambos lados
                  material.depthWrite = true  // Mejor ordenamiento de profundidad
                  
                  // Si el material tiene un mapa de color con alpha
                  if (material.map) {
                    material.map.colorSpace = THREE.SRGBColorSpace
                  }
                  
                  // Si tiene un mapa de transparencia dedicado
                  if (material.alphaMap) {
                    material.alphaMap.colorSpace = THREE.SRGBColorSpace
                  }
                  
                  material.needsUpdate = true
                  
                  console.log(`🎨 Transparency enabled for material: ${material.name || 'unnamed'}`)
                }
              })
            }
          })

          // 🎬 Si el GLB incluye animaciones, reproducirlas
          if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model)
            
            console.log(`📦 Found ${gltf.animations.length} animation(s)`)
            
            // Reproducir TODAS las animaciones del GLB
            gltf.animations.forEach((clip: any, index: number) => {
              const action = mixer.clipAction(clip)
              
              // 🔄 Loop infinito
              action.setLoop(THREE.LoopRepeat, Infinity)
              
              // ⚡ Velocidad (1.0 = normal)
              action.timeScale = 1.0
              
              action.play()
              
              console.log(`✅ Playing animation ${index + 1}: ${clip.name} (${clip.duration.toFixed(2)}s)`)
            })
          } else {
            console.log("ℹ️ No animations found in GLB (static model)")
          }

          // 🔍 Auto-ajustar el tamaño del modelo a la cámara
          const box = new THREE.Box3().setFromObject(model)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          
          console.log(`📏 Model size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`)
          
          // Centrar el modelo
          model.position.x = -center.x
          model.position.y = -center.y
          model.position.z = -center.z
          
          // ✅ ESCALAR para que se vea GRANDE en pantalla
          const maxSize = Math.max(size.x, size.y, size.z)
          // Queremos que el modelo ocupe aprox. 2 unidades de altura
          const targetSize = 2.0
          const scale = targetSize / maxSize
          model.scale.set(scale, scale, scale)
          console.log(`🔧 Auto-scaled model by ${scale.toFixed(2)} (from ${maxSize.toFixed(2)} to ${targetSize})`)
        }
      } catch (error) {
        console.error("❌ Error loading GLB:", error)
        console.log("💡 Make sure the file is in /public/animations/dance.glb")
        console.log("💡 Convert your FBX to GLB using: https://products.aspose.app/3d/conversion/fbx-to-glb")
      }

      const clock = new THREE.Clock()
      const animate = () => {
        animationId = requestAnimationFrame(animate)

        const deltaTime = clock.getDelta()

        // Actualizar animación
        if (mixer) {
          mixer.update(deltaTime)
        }

        controls.update()
        
        // ✅ Ordenar objetos transparentes correctamente
        if (model) {
          model.traverse((child: any) => {
            if (child.isMesh && child.material.transparent) {
              child.renderOrder = 999  // Renderizar al final
            }
          })
        }
        
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
      if (model) {
        scene.remove(model)
        model.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat: any) => mat.dispose())
            } else {
              child.material.dispose()
            }
          }
        })
      }
    }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}