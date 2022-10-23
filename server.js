(async() => {

const fs = require('fs')
const path = require('path')
const https = require('https')
const express = require('express')
const fetch = require('cross-fetch/polyfill')
const abortcontroller = require('abortcontroller-polyfill')
const PocketBase = require('pocketbase/cjs')
global.EventSource = require('eventsource')
require('dotenv').config()

const app = express()
const options = {
    key: fs.readFileSync("server.key"),
    cert: fs.readFileSync("server.cert")
}
const server = https.createServer(options, app)
app.use(express.static(path.join(__dirname, 'public')))

const client = new PocketBase(process.env.PB)
const adminData = await client.admins.authViaEmail(process.env.EMAIL, process.env.PASS)

const areas = await client.records.getFullList('areas')

let currentTagID = 0

client.realtime.subscribe('orders', e => {
    if(e.record.status == 'pending'){

        Promise.all(e.record.cart.map(async item => {
            return (await client.records.getOne('products', item.id)).price * item.quantity
        }))

        .then(arr => {
            let totalPrice = 0 

            arr.forEach(item => {
                totalPrice += item
            })

            client.records.update('orders', e.record.id, {
                status: 'confirmed',
                tagid: currentTagID,
                total: totalPrice
            })
        })

        currentTagID ++
    }
})

client.realtime.subscribe('detect', e => {
    e.record.markers.forEach(marker => {
        markerMid = {"x": (marker.corners[0].x + marker.corners[2].x) / 2, "y": (marker.corners[0].y + marker.corners[2].y) / 2}

        areas.forEach(zone => {
            if(markerMid.x > zone.border[0].x && markerMid.x < zone.border[1].x && markerMid.y > zone.border[0].y && markerMid.y < zone.border[1].y){
                client.records.update('areas', zone.id, {
                    who: marker.id
                })

                client.records.getFullList('orders', 30, {
                    filter: `(tagid = ${marker.id} && (status = "confirmed" || status = "seated"))`
                }).then(orders => {
                    if(orders.length != 0){
                        client.records.update('orders', orders[orders.length - 1].id, {
                            status: 'seated',
                            position: zone.zone
                        })
                    }
                })
            }
        })
    })
})

server.listen(3001, () => {
    console.log('You Are Successful!!!')
})

})()