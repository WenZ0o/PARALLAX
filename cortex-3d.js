import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.167.1/build/three.module.js';

const canvas=document.getElementById('cortex3dCanvas');
const hero=document.querySelector('.cinematic-hero');
const fallbackNote=document.getElementById('cortex3dFallbackNote');

if (!canvas || !hero) {
  // Nothing to initialize on pages without the hero.
} else {
  try {
    const renderer=new THREE.WebGLRenderer({
      canvas,
      alpha:true,
      antialias:true,
      powerPreference:'high-performance'
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.55));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.12;
    renderer.setClearColor(0x000000,0);

    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(0x02080b,0.052);

    const camera=new THREE.PerspectiveCamera(38,1,0.1,80);
    camera.position.set(0,0.15,10.7);

    const world=new THREE.Group();
    scene.add(world);

    const cortex=new THREE.Group();
    world.add(cortex);

    const glowTexture=makeGlowTexture();

    // ── Materials ──────────────────────────────────────────────────────────
    const neuralPointsMat=new THREE.PointsMaterial({
      map:glowTexture,
      color:0x6fffea,
      size:0.07,
      transparent:true,
      opacity:0.94,
      alphaTest:0.02,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
      sizeAttenuation:true
    });

    const neuralPointsDimMat=new THREE.PointsMaterial({
      map:glowTexture,
      color:0x43cfc6,
      size:0.045,
      transparent:true,
      opacity:0.42,
      alphaTest:0.02,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
      sizeAttenuation:true
    });

    const neuralLineMat=new THREE.LineBasicMaterial({
      color:0x55d9d0,
      transparent:true,
      opacity:0.15,
      blending:THREE.AdditiveBlending,
      depthWrite:false
    });

    const neuralLineHotMat=new THREE.LineBasicMaterial({
      color:0x8effec,
      transparent:true,
      opacity:0.28,
      blending:THREE.AdditiveBlending,
      depthWrite:false
    });

    // ── Neural head volume ─────────────────────────────────────────────────
    const headCore=new THREE.Group();
    cortex.add(headCore);

    const surface=[];
    const inner=[];

    sampleEllipsoidShell(surface,0,0.22,0,2.15,2.08,1.48,1650,0.72);
    sampleEllipsoidShell(surface,-1.12,-0.35,0.12,1.05,1.05,1.05,390,0.66);
    sampleEllipsoidShell(surface, 1.12,-0.35,0.12,1.05,1.05,1.05,390,0.66);
    sampleEllipsoidShell(surface,0,-1.12,0.18,1.20,0.80,0.92,340,0.72);

    // Rounded upper lobes give a cat-like silhouette without horn-like spikes.
    sampleEllipsoidShell(surface,-1.18,1.45,-0.10,0.88,0.90,0.88,360,0.64);
    sampleEllipsoidShell(surface, 1.18,1.45,-0.10,0.88,0.90,0.88,360,0.64);

    // Inner cortex mass gives real depth while the head rotates.
    sampleEllipsoidVolume(inner,0,0.18,-0.10,1.95,1.86,1.30,1200);

    const surfaceGeo=geometryFromPoints(surface);
    const innerGeo=geometryFromPoints(inner);
    const surfacePoints=new THREE.Points(surfaceGeo,neuralPointsMat);
    const innerPoints=new THREE.Points(innerGeo,neuralPointsDimMat);
    headCore.add(surfacePoints,innerPoints);

    // Neural connections are real line segments distributed through the volume.
    const lineGeo=makeConnectionGeometry(surface,460,24);
    const hotLineGeo=makeConnectionGeometry(surface,135,10);
    const neuralLines=new THREE.LineSegments(lineGeo,neuralLineMat);
    const hotLines=new THREE.LineSegments(hotLineGeo,neuralLineHotMat);
    headCore.add(neuralLines,hotLines);

    // Additional deep nodes make rotation reveal parallax inside the skull.
    const deepNodes=[];
    sampleEllipsoidVolume(deepNodes,0,0.20,-0.35,1.72,1.62,1.18,520);
    const deepNodePoints=new THREE.Points(
      geometryFromPoints(deepNodes),
      new THREE.PointsMaterial({
        map:glowTexture,
        color:0x31a8b0,
        size:0.038,
        transparent:true,
        opacity:0.32,
        depthWrite:false,
        blending:THREE.AdditiveBlending
      })
    );
    headCore.add(deepNodePoints);

    // ── Eyes ───────────────────────────────────────────────────────────────
    const leftEye=makeEye(-0.92);
    const rightEye=makeEye(0.92);
    cortex.add(leftEye.group,rightEye.group);

    // ── Nose / center core ────────────────────────────────────────────────
    const noseGlow=new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12,0),
      new THREE.MeshStandardMaterial({
        color:0xb8fff4,
        emissive:0x41e0c9,
        emissiveIntensity:2.4,
        roughness:0.28,
        metalness:0.18
      })
    );
    noseGlow.position.set(0,-0.62,1.38);
    noseGlow.rotation.z=Math.PI/4;
    cortex.add(noseGlow);

    const coreRing=new THREE.Mesh(
      new THREE.TorusGeometry(0.28,0.014,8,70),
      new THREE.MeshBasicMaterial({
        color:0x5ff6df,
        transparent:true,
        opacity:0.42,
        blending:THREE.AdditiveBlending
      })
    );
    coreRing.position.set(0,-0.65,1.23);
    cortex.add(coreRing);

    // ── Whiskers in true 3D ───────────────────────────────────────────────
    const whiskers=new THREE.Group();
    cortex.add(whiskers);
    [-0.22,0,0.22].forEach((offset,index)=>{
      whiskers.add(makeWhisker(-1,offset,index));
      whiskers.add(makeWhisker( 1,offset,index));
    });

    // ── Floating neural satellites ────────────────────────────────────────
    const satellites=new THREE.Group();
    world.add(satellites);
    for (let i=0;i<30;i++) {
      const node=new THREE.Sprite(new THREE.SpriteMaterial({
        map:glowTexture,
        color:i%3===0?0x7ffff0:0x44c9cf,
        transparent:true,
        opacity:0.36+Math.random()*0.35,
        blending:THREE.AdditiveBlending,
        depthWrite:false
      }));
      const angle=Math.random()*Math.PI*2;
      const radius=3.0+Math.random()*2.8;
      node.position.set(
        Math.cos(angle)*radius,
        (Math.random()-.5)*5.0,
        -1.5+Math.random()*4.2
      );
      const s=0.035+Math.random()*0.08;
      node.scale.setScalar(s);
      node.userData.phase=Math.random()*Math.PI*2;
      node.userData.speed=0.12+Math.random()*0.28;
      satellites.add(node);
    }

    // ── Real 3D orbital rings ─────────────────────────────────────────────
    const orbits=new THREE.Group();
    world.add(orbits);
    const orbitA=makeOrbit(2.95,0x58e5d1,0.14);
    const orbitB=makeOrbit(3.45,0x42b8df,0.10);
    const orbitC=makeOrbit(2.55,0xa1fff0,0.09);
    orbitA.rotation.set(Math.PI*.64,0.1,0.22);
    orbitB.rotation.set(Math.PI*.53,-0.35,-0.36);
    orbitC.rotation.set(Math.PI*.72,0.42,0.62);
    orbits.add(orbitA,orbitB,orbitC);

    // ── Floor halo ────────────────────────────────────────────────────────
    const floorHalo=new THREE.Mesh(
      new THREE.RingGeometry(1.15,3.9,96),
      new THREE.MeshBasicMaterial({
        color:0x39cdb8,
        transparent:true,
        opacity:0.055,
        side:THREE.DoubleSide,
        blending:THREE.AdditiveBlending,
        depthWrite:false
      })
    );
    floorHalo.rotation.x=-Math.PI/2;
    floorHalo.position.set(0,-2.45,-0.35);
    world.add(floorHalo);

    // ── Lighting ─────────────────────────────────────────────────────────
    const ambient=new THREE.AmbientLight(0x6debdc,0.62);
    scene.add(ambient);

    const keyLight=new THREE.PointLight(0x56ffe2,34,16,2);
    keyLight.position.set(2.8,2.0,5.2);
    scene.add(keyLight);

    const fillLight=new THREE.PointLight(0x38a9ff,19,18,2);
    fillLight.position.set(-4.4,-0.5,2.2);
    scene.add(fillLight);

    const stageLight=new THREE.PointLight(0xffbd78,0,14,2);
    stageLight.position.set(0,-0.4,4.8);
    scene.add(stageLight);

    // ── Background depth field ────────────────────────────────────────────
    const starGeo=new THREE.BufferGeometry();
    const starCount=900;
    const starArray=new Float32Array(starCount*3);
    for (let i=0;i<starCount;i++) {
      starArray[i*3]=(Math.random()-.5)*25;
      starArray[i*3+1]=(Math.random()-.5)*14;
      starArray[i*3+2]=-3-Math.random()*14;
    }
    starGeo.setAttribute('position',new THREE.BufferAttribute(starArray,3));
    const stars=new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        map:glowTexture,
        color:0x5de5dd,
        size:0.055,
        transparent:true,
        opacity:0.45,
        depthWrite:false,
        blending:THREE.AdditiveBlending
      })
    );
    scene.add(stars);

    // ── Runtime state ────────────────────────────────────────────────────
    const pointer={x:0,y:0};
    const smooth={x:0,y:0};
    let stage='idle';
    let blinkPhase=0;
    let blinking=false;
    let nextBlink=2.6+Math.random()*3.5;
    let elapsedForBlink=0;
    let running=true;

    const stageConfig={
      idle:{key:24,fill:14,accent:0,head:0x6fffea,hot:0x8effec},
      waking:{key:30,fill:18,accent:0,head:0x79fff0,hot:0xaafff3},
      watch:{key:38,fill:24,accent:0,head:0x79fff0,hot:0xc1fff7},
      notice:{key:42,fill:27,accent:0,head:0x8efff2,hot:0xd0fff9},
      propose:{key:46,fill:24,accent:3,head:0x8ef0ff,hot:0xc9f8ff},
      kill:{key:25,fill:15,accent:38,head:0xffd188,hot:0xffe3ae},
      blocked:{key:16,fill:11,accent:52,head:0xff7189,hot:0xffa0b0},
      hold:{key:21,fill:13,accent:8,head:0x8fb5ad,hot:0xb5d6cf},
      queue:{key:55,fill:31,accent:0,head:0x5effca,hot:0xd0fff3},
      complete:{key:28,fill:18,accent:0,head:0x6fffea,hot:0xa9fff1},
      error:{key:12,fill:8,accent:55,head:0xff667f,hot:0xff9aad}
    };

    function applyStage(nextStage='idle') {
      stage=stageConfig[nextStage]?nextStage:'idle';
      const cfg=stageConfig[stage];

      neuralPointsMat.color.setHex(cfg.head);
      neuralLineHotMat.color.setHex(cfg.hot);
      keyLight.intensity=cfg.key;
      fillLight.intensity=cfg.fill;
      stageLight.intensity=cfg.accent;
      stageLight.color.setHex(stage==='kill'?0xffbd78:0xff5877);

      document.documentElement.dataset.cortex3dStage=stage;
    }

    window.setCortexStage=applyStage;
    applyStage('idle');

    const onPointerMove=(event)=>{
      const rect=hero.getBoundingClientRect();
      pointer.x=THREE.MathUtils.clamp(((event.clientX-rect.left)/rect.width-.5)*2,-1,1);
      pointer.y=THREE.MathUtils.clamp(((event.clientY-rect.top)/rect.height-.5)*2,-1,1);
    };
    const resetPointer=()=>{pointer.x=0;pointer.y=0;};
    hero.addEventListener('pointermove',onPointerMove);
    hero.addEventListener('pointerleave',resetPointer);

    function updateBlink(dt) {
      elapsedForBlink+=dt;
      if (!blinking && elapsedForBlink>=nextBlink) {
        blinking=true;
        blinkPhase=0;
      }

      if (!blinking) return;

      blinkPhase+=dt*10.5;
      const normalized=Math.min(blinkPhase/Math.PI,1);
      const close=Math.sin(normalized*Math.PI);
      const eyeScale=Math.max(0.055,1-close*.945);

      leftEye.group.scale.y=eyeScale;
      rightEye.group.scale.y=eyeScale;

      if (normalized>=1) {
        blinking=false;
        blinkPhase=0;
        elapsedForBlink=0;
        nextBlink=2.8+Math.random()*4.8;
        leftEye.group.scale.y=1;
        rightEye.group.scale.y=1;
      }
    }

    function resize() {
      const rect=hero.getBoundingClientRect();
      const width=Math.max(1,Math.floor(rect.width));
      const height=Math.max(1,Math.floor(rect.height));
      renderer.setSize(width,height,false);
      camera.aspect=width/height;
      camera.updateProjectionMatrix();

      // Shift the actual 3D object rather than faking it in CSS.
      if (width<760) {
        world.position.set(0.62,0.15,0);
        world.scale.setScalar(0.84);
      } else if (width<1120) {
        world.position.set(1.65,0.05,0);
        world.scale.setScalar(0.91);
      } else {
        world.position.set(2.45,0.05,0);
        world.scale.setScalar(1);
      }
    }

    const resizeObserver=new ResizeObserver(resize);
    resizeObserver.observe(hero);
    resize();

    const clock=new THREE.Clock();

    function render() {
      if (!running) return;
      const dt=Math.min(clock.getDelta(),0.05);
      const t=clock.elapsedTime;

      smooth.x+=(pointer.x-smooth.x)*0.055;
      smooth.y+=(pointer.y-smooth.y)*0.055;

      // This is genuine camera-facing 3D rotation of the full neural volume.
      cortex.rotation.y=smooth.x*0.33+Math.sin(t*.42)*0.055;
      cortex.rotation.x=-smooth.y*0.17+Math.sin(t*.55)*0.028;
      cortex.rotation.z=Math.sin(t*.31)*0.018;
      cortex.position.y=Math.sin(t*.74)*0.075;
      cortex.position.z=Math.cos(t*.48)*0.055;

      // Eyes rotate independently, producing real gaze rather than a flat overlay.
      const gazeX=smooth.x*.15;
      const gazeY=-smooth.y*.10;
      leftEye.pupil.position.x=gazeX;
      leftEye.pupil.position.y=gazeY;
      rightEye.pupil.position.x=gazeX;
      rightEye.pupil.position.y=gazeY;

      leftEye.glow.scale.setScalar(1+Math.sin(t*2.15)*.035);
      rightEye.glow.scale.setScalar(1+Math.sin(t*2.15+.18)*.035);

      // Orbit rings actually rotate around the model in 3D space.
      orbitA.rotation.z+=dt*.10;
      orbitB.rotation.z-=dt*.074;
      orbitC.rotation.z+=dt*.13;

      satellites.children.forEach((node,index)=>{
        const p=node.userData.phase+t*node.userData.speed;
        node.position.y+=Math.sin(p+index)*0.0007;
      });

      stars.rotation.y+=dt*.005;
      hotLines.rotation.z=Math.sin(t*.21)*.018;
      coreRing.rotation.z+=dt*(stage==='queue'?2.2:.34);
      noseGlow.rotation.y+=dt*.45;

      // Stage behavior changes real materials/lights/geometry.
      if (stage==='watch' || stage==='notice') {
        hotLines.material.opacity=.42+.15*Math.sin(t*5.0);
        headCore.scale.setScalar(1+.012*Math.sin(t*2.4));
      } else if (stage==='propose') {
        hotLines.material.opacity=.48+.17*Math.sin(t*4.2);
        headCore.rotation.y+=dt*.018;
      } else if (stage==='kill') {
        hotLines.material.opacity=.36;
        stageLight.position.x=Math.sin(t*1.8)*1.2;
      } else if (stage==='blocked' || stage==='error') {
        hotLines.material.opacity=.52;
        cortex.position.x=Math.sin(t*18)*.015;
      } else if (stage==='queue') {
        hotLines.material.opacity=.66+.18*Math.sin(t*8);
        cortex.scale.setScalar(1.02+.018*Math.sin(t*7));
      } else {
        hotLines.material.opacity=.28;
        cortex.scale.lerp(new THREE.Vector3(1,1,1),.08);
      }

      updateBlink(dt);
      renderer.render(scene,camera);
      requestAnimationFrame(render);
    }

    document.addEventListener('visibilitychange',()=>{
      if (document.hidden) {
        running=false;
      } else if (!running) {
        running=true;
        clock.getDelta();
        requestAnimationFrame(render);
      }
    });

    document.documentElement.classList.add('cortex-webgl-ready');
    fallbackNote?.setAttribute('hidden','');
    requestAnimationFrame(render);

    function makeEye(x) {
      const group=new THREE.Group();
      group.position.set(x,0.12,1.48);

      const shell=new THREE.Mesh(
        new THREE.SphereGeometry(.49,32,22),
        new THREE.MeshPhysicalMaterial({
          color:0x061a1b,
          roughness:.28,
          metalness:.12,
          transmission:.10,
          transparent:true,
          opacity:.92,
          emissive:0x0c5753,
          emissiveIntensity:.48
        })
      );

      const ring=new THREE.Mesh(
        new THREE.TorusGeometry(.50,.055,16,80),
        new THREE.MeshBasicMaterial({
          color:0x8dfff0,
          transparent:true,
          opacity:.98,
          blending:THREE.AdditiveBlending
        })
      );

      const innerRing=new THREE.Mesh(
        new THREE.TorusGeometry(.36,.016,10,72),
        new THREE.MeshBasicMaterial({
          color:0x49dacc,
          transparent:true,
          opacity:.55,
          blending:THREE.AdditiveBlending
        })
      );

      const pupil=new THREE.Mesh(
        new THREE.CapsuleGeometry(.042,.34,6,16),
        new THREE.MeshBasicMaterial({
          color:0xcafff7,
          transparent:true,
          opacity:.98
        })
      );
      pupil.scale.set(.72,1.35,.72);
      pupil.position.z=.49;

      const glow=new THREE.Sprite(new THREE.SpriteMaterial({
        map:glowTexture,
        color:0x78ffec,
        transparent:true,
        opacity:.42,
        depthWrite:false,
        blending:THREE.AdditiveBlending
      }));
      glow.scale.set(1.46,1.46,1);
      glow.position.z=.12;

      group.add(glow,shell,ring,innerRing,pupil);
      return {group,pupil,glow};
    }

    function makeWhisker(side,yOffset,index) {
      const start=new THREE.Vector3(side*.26,-.62+yOffset,1.17);
      const control=new THREE.Vector3(side*(1.12+index*.10),-.58+yOffset*.65,1.38+index*.06);
      const end=new THREE.Vector3(side*(2.95+index*.20),-.44+yOffset*.38,.62-index*.12);
      const curve=new THREE.QuadraticBezierCurve3(start,control,end);
      const geometry=new THREE.TubeGeometry(curve,42,.009,6,false);
      return new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color:index===1?0x9ffff2:0x5dded5,
          transparent:true,
          opacity:.55-index*.05,
          blending:THREE.AdditiveBlending,
          depthWrite:false
        })
      );
    }

    function makeOrbit(radius,color,opacity) {
      return new THREE.Mesh(
        new THREE.TorusGeometry(radius,.012,8,128),
        new THREE.MeshBasicMaterial({
          color,
          transparent:true,
          opacity,
          blending:THREE.AdditiveBlending,
          depthWrite:false
        })
      );
    }

    function sampleEllipsoidShell(out,cx,cy,cz,rx,ry,rz,count,noise=.65) {
      for (let i=0;i<count;i++) {
        const u=Math.random()*2-1;
        const phi=Math.random()*Math.PI*2;
        const s=Math.sqrt(1-u*u);
        const jitter=1+(Math.random()-.5)*.08*noise;
        out.push(new THREE.Vector3(
          cx+rx*s*Math.cos(phi)*jitter,
          cy+ry*u*jitter,
          cz+rz*s*Math.sin(phi)*jitter
        ));
      }
    }

    function sampleEllipsoidVolume(out,cx,cy,cz,rx,ry,rz,count) {
      for (let i=0;i<count;i++) {
        const u=Math.random()*2-1;
        const phi=Math.random()*Math.PI*2;
        const s=Math.sqrt(1-u*u);
        const r=Math.cbrt(Math.random());
        out.push(new THREE.Vector3(
          cx+rx*s*Math.cos(phi)*r,
          cy+ry*u*r,
          cz+rz*s*Math.sin(phi)*r
        ));
      }
    }

    function geometryFromPoints(points) {
      const array=new Float32Array(points.length*3);
      points.forEach((p,i)=>{
        array[i*3]=p.x;
        array[i*3+1]=p.y;
        array[i*3+2]=p.z;
      });
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(array,3));
      return geometry;
    }

    function makeConnectionGeometry(points,segmentCount,maxStride) {
      const positions=[];
      const n=points.length;
      for (let i=0;i<segmentCount;i++) {
        const aIndex=Math.floor(Math.random()*n);
        const stride=1+Math.floor(Math.random()*maxStride);
        const bIndex=(aIndex+(Math.random()>.5?stride:-stride)+n)%n;
        const a=points[aIndex];
        const b=points[bIndex];

        // Keep only reasonably local links, which reads as a neural mesh in 3D.
        if (a.distanceTo(b)>1.15) {
          i--;
          continue;
        }
        positions.push(a.x,a.y,a.z,b.x,b.y,b.z);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      return geometry;
    }

    function makeGlowTexture() {
      const c=document.createElement('canvas');
      c.width=64;
      c.height=64;
      const ctx=c.getContext('2d');
      const g=ctx.createRadialGradient(32,32,0,32,32,32);
      g.addColorStop(0,'rgba(255,255,255,1)');
      g.addColorStop(.18,'rgba(210,255,248,.95)');
      g.addColorStop(.45,'rgba(100,255,232,.52)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;
      ctx.fillRect(0,0,64,64);
      const texture=new THREE.CanvasTexture(c);
      texture.colorSpace=THREE.SRGBColorSpace;
      return texture;
    }
  } catch (error) {
    console.warn('PARALLAX CORTEX WebGL unavailable; using CSS fallback.',error);
    fallbackNote?.removeAttribute('hidden');
    document.documentElement.classList.add('cortex-webgl-fallback');
  }
}
