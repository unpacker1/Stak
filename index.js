const satellite = require("satellite.js")

// Örnek ISS TLE (güncel değilse değiştirilebilir)
const tleLine1 = "1 25544U 98067A   24064.54791667  .00016717  00000+0  10270-3 0  9993"
const tleLine2 = "2 25544  51.6418  30.9483 0003654  59.8391  54.8702 15.50012300443210"

// Uydu objesi oluştur
const satrec = satellite.twoline2satrec(tleLine1, tleLine2)

// Dünya zamanı
function getPosition() {
    const now = new Date()

    const positionAndVelocity = satellite.propagate(satrec, now)
    const positionEci = positionAndVelocity.position

    if (!positionEci) {
        console.log("Konum hesaplanamadı.")
        return
    }

    const gmst = satellite.gstime(now)
    const positionGd = satellite.eciToGeodetic(positionEci, gmst)

    const latitude = satellite.degreesLat(positionGd.latitude)
    const longitude = satellite.degreesLong(positionGd.longitude)
    const height = positionGd.height

    console.clear()
    console.log("===== SATELLITE TRACKER =====")
    console.log("Zaman:", now.toUTCString())
    console.log("-----------------------------")
    console.log("Latitude  :", latitude.toFixed(4), "°")
    console.log("Longitude :", longitude.toFixed(4), "°")
    console.log("Altitude  :", height.toFixed(2), "km")
}

// Her 1 saniyede güncelle
setInterval(getPosition, 1000)