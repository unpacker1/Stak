const express = require("express")
const satellite = require("satellite.js")
const axios = require("axios")

const app = express()
const PORT = Math.floor(2000 + Math.random() * 6000)

const GS = { lat: 38.7225, lon: 35.4875, height: 1 } // Kayseri
let sats = []
let timeOffset = 0

// TLE yükleme
async function loadTLE() {
    try {
        const r = await axios.get("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle")
        const lines = r.data.split("\n")
        sats = []
        for (let i = 0; i < lines.length; i += 3) {
            if (!lines[i + 2]) continue
            sats.push({ name: lines[i].trim(), satrec: satellite.twoline2satrec(lines[i + 1], lines[i + 2]) })
        }
        console.log("Satellites loaded:", sats.length)
    } catch (err) {
        console.error("TLE load error:", err)
    }
}

// Uydu hesaplama
function compute() {
    const now = new Date(Date.now() + timeOffset)
    const gmst = satellite.gstime(now)
    const observer = {
        latitude: satellite.degreesToRadians(GS.lat),
        longitude: satellite.degreesToRadians(GS.lon),
        height: GS.height
    }

    return sats.slice(0, 150).map(s => {
        const pv = satellite.propagate(s.satrec, now)
        if (!pv.position) return null
        const gd = satellite.eciToGeodetic(pv.position, gmst)
        const lat = satellite.degreesLat(gd.latitude)
        const lon = satellite.degreesLong(gd.longitude)
        const alt = gd.height
        const ecf = satellite.eciToEcf(pv.position, gmst)
        const look = satellite.ecfToLookAngles(observer, ecf)
        const el = satellite.degreesLat(look.elevation)
        return { name: s.name, lat, lon, alt, el }
    }).filter(Boolean)
}

// Orbit çizgisi
function orbitPath(satrec) {
    const pts = []
    for (let i = 0; i <= 90; i += 3) { // 90 dakika, 3dk adım
        const t = new Date(Date.now() + timeOffset + i * 60000)
        const gmst = satellite.gstime(t)
        const pv = satellite.propagate(satrec, t)
        if (!pv.position) continue
        const gd = satellite.eciToGeodetic(pv.position, gmst)
        pts.push([satellite.degreesLat(gd.latitude), satellite.degreesLong(gd.longitude)])
    }
    return pts
}

// API
app.get("/api", (req, res) => res.json(compute()))
app.get("/orbit/:name", (req, res) => {
    const s = sats.find(x => x.name === req.params.name)
    res.json(s ? orbitPath(s.satrec) : [])
})
app.get("/speed/:ms", (req, res) => { timeOffset += parseInt(req.params.ms); res.send("ok") })

// 3D HTML
app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>3D Satellite Tracker</title>
<style>body{margin:0;overflow:hidden}</style>
</head>
<body>
<div style="position:absolute;top:5px;left:5px;z-index:100;color:white">
<button onclick="speed(0)">Real</button>
<button onclick="speed(600000)">+10min</button>
<button onclick="speed(3600000)">+1h</button>
<button onclick="trackISS()">Track ISS</button>
<select id="sel" onchange="selectSat(this.value)"></select>
<span id="info"></span>
</div>

<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js"></script>

<script>
let scene=new THREE.Scene()
let camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,1000)
let renderer=new THREE.WebGLRenderer()
renderer.setSize(window.innerWidth,window.innerHeight)
document.body.appendChild(renderer.domElement)
let controls=new THREE.OrbitControls(camera,renderer.domElement)
camera.position.set(0,50,150)
controls.update()

// Light
let light=new THREE.DirectionalLight(0xffffff,1)
light.position.set(100,100,100)
scene.add(light)

// Earth
const earthGeo=new THREE.SphereGeometry(50,64,64)
const earthMat=new THREE.MeshPhongMaterial({color:0x2233ff})
const earth=new THREE.Mesh(earthGeo,earthMat)
scene.add(earth)

// Satellites
let satObjects=[], orbitLines=[], selectedSat=null

function latLonToXYZ(lat,lon,radius=50){
    const phi=(90-lat)*Math.PI/180
    const theta=(lon+180)*Math.PI/180
    const x=-radius*Math.sin(phi)*Math.cos(theta)
    const z=radius*Math.sin(phi)*Math.sin(theta)
    const y=radius*Math.cos(phi)
    return new THREE.Vector3(x,y,z)
}

function update(){
    fetch('/api').then(r=>r.json()).then(data=>{
        satObjects.forEach(s=>scene.remove(s))
        satObjects=[]
        orbitLines.forEach(l=>scene.remove(l))
        orbitLines=[]
        let sel=document.getElementById("sel")
        sel.innerHTML=""
        let visible=[]
        data.forEach(s=>{
            let sphere=new THREE.Mesh(new THREE.SphereGeometry(0.8,6,6),
                new THREE.MeshBasicMaterial({color:s.el>0?0x00ff00:0xff0000}))
            sphere.position.copy(latLonToXYZ(s.lat,s.lon,50+s.alt/1000))
            scene.add(sphere)
            satObjects.push(sphere)
            let opt=document.createElement("option")
            opt.text=s.name
            sel.add(opt)
            if(s.el>0) visible.push(s.name)
            if(s.name.includes("ISS")) selectedSat=sphere
        })
        document.getElementById("info").innerText="Visible (Kayseri): "+visible.slice(0,5).join(", ")
    })
}

function speed(ms){fetch('/speed/'+ms)}
function trackISS(){if(selectedSat) controls.target.copy(selectedSat.position)}
function selectSat(name){
    const idx=[...document.getElementById("sel").options].findIndex(o=>o.text===name)
    if(idx>=0) controls.target.copy(satObjects[idx].position)
}

function animate(){
    requestAnimationFrame(animate)
    controls.update()
    update()
    renderer.render(scene,camera)
}

animate()
</script>
</body>
</html>
`)
})

// Başlat
loadTLE().then(()=>app.listen(PORT,()=>console.log("3D Tracker running on http://localhost:"+PORT)))