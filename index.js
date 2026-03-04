const express = require("express")
const satellite = require("satellite.js")
const axios = require("axios")

const app = express()
const PORT = Math.floor(1000 + Math.random()*8000)

const GS = { lat:38.7225, lon:35.4875, height:1 } // Kayseri

let sats=[]

// TLE yükle
async function load(){
    const url="https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
    const r=await axios.get(url)
    const L=r.data.split("\n")
    for(let i=0;i<L.length;i+=3){
        if(!L[i+2]) continue
        sats.push({
            name:L[i].trim(),
            satrec:satellite.twoline2satrec(L[i+1],L[i+2])
        })
    }
    console.log("Satellites:",sats.length)
}

// Uydu verisi
function compute(){
    const now=new Date()
    const gmst=satellite.gstime(now)
    const obs={
        longitude:satellite.degreesToRadians(GS.lon),
        latitude:satellite.degreesToRadians(GS.lat),
        height:GS.height
    }

    return sats.slice(0,100).map(s=>{
        const pv=satellite.propagate(s.satrec,now)
        if(!pv.position) return null

        const gd=satellite.eciToGeodetic(pv.position,gmst)
        const lat=satellite.degreesLat(gd.latitude)
        const lon=satellite.degreesLong(gd.longitude)

        const ecf=satellite.eciToEcf(pv.position,gmst)
        const look=satellite.ecfToLookAngles(obs,ecf)

        return {
            name:s.name,
            lat,lon,
            alt:gd.height,
            el:satellite.degreesLat(look.elevation)
        }
    }).filter(Boolean)
}

app.get("/api",(req,res)=>res.json(compute()))

app.get("/",(req,res)=>{
res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Satellite Pro</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
<style>
body{margin:0;background:black;color:white}
#map{height:90vh}
#top{padding:5px}
button{padding:5px}
</style>
</head>
<body>
<div id="map"></div>
<div id="top">
<button onclick="trackISS()">ISS Track</button>
<span id="info"></span>
</div>
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script>
const map=L.map('map').setView([20,0],2)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

let markers=[]
let iss=null

function terminator(){
    const now=new Date()
    const lng=(now.getUTCHours()/24)*360-180
    return [[-90,lng],[90,lng]]
}

L.polyline(terminator(),{color:'yellow'}).addTo(map)

function update(){
fetch('/api').then(r=>r.json()).then(data=>{
markers.forEach(m=>map.removeLayer(m))
markers=[]

let visible=[]

data.forEach(s=>{
const m=L.circleMarker([s.lat,s.lon],{
radius:4,
color:s.el>0?'lime':'red'
}).addTo(map)

m.bindPopup(s.name+"<br>Alt:"+s.alt.toFixed(1)+"km<br>El:"+s.el.toFixed(1))

if(s.name.includes("ISS")) iss=m
if(s.el>0) visible.push(s.name)

markers.push(m)
})

document.getElementById("info").innerHTML=
"Visible (Kayseri): "+visible.slice(0,5).join(", ")
})
}

function trackISS(){
if(iss) map.setView(iss.getLatLng(),4)
}

setInterval(update,2000)
update()
</script>
</body>
</html>
`)
})

load().then(()=>{
app.listen(PORT,()=>console.log("Running on http://localhost:"+PORT))
})