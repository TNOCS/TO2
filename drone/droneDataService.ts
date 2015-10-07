import fs = require('fs');
import path = require('path');
import http = require('http');
import Winston = require('winston');
import chokidar = require('chokidar');
import request = require('request');

/**
 * Configuration:
 */

// web server (where we post the sensor data too)
var csWebServer = 'http://localhost:3002';
// url for posting resource types (style)
var resourceTypeUrl = csWebServer + '/api/resources/droneResourceTypes';
// url for creating a new map layer, or for posting data (features).
var layerUrl = csWebServer + '/api/layers';
// folder which contains the sensor data
var dataFolder = './data';
// Minimum time in msec between posting sensor data messages to the web service (it allows you to simulate a moving drone)
var minTimeBetweenSamples = 1000;

Winston.remove(Winston.transports.Console);
Winston.add(Winston.transports.Console, {
    colorize: true,
    prettyPrint: true
});

/**
 * End Configuration
 */

interface IFeature {
    id: string,
    type: string,
    geometry: {
        type: string,
        coordinates: number[] | number[][] | number[][][]
    },
    properties: {
        [key: string]: any
    }
}

interface IGeoJSON {
    type: string;
    features: IFeature[]
}

/** Placeholder for existing sensor data, so we don't add measurements twice */
var existingSensorData: string[] = [];

/**
 * Initialisation
 */
function start() {
    // Add resource type (style description) to web server
    addResourceType();
    // Watch folder and start processing the data
    watchFolder(dataFolder);
}
start();

function addResourceType() {
    fs.readFile('./droneResourceTypes.json', (error, data) => {
        if (error) {
            Winston.error('Error reading resource file: ' + error);
            return;
        }
        request({
            url: resourceTypeUrl,
            method: "POST",
            json: true,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.parse(data.toString())
        }, (err, res, body) => {
            if (err) {
                Winston.error('Error: ' + err);
            } else {
                Winston.info('URL: ' + body);
            }
        });
    });
    // var form = req.form();
    // form.append('file', fs.createReadStream('./droneResourceTypes.json'));
}

function watchFolder(folder: string) {
    Winston.info('Watching folder: ' + folder);
    setTimeout(() => {
        var watcher = chokidar.watch(folder, { ignoreInitial: false, ignored: /[\/\\]\./, persistent: true });
        watcher.on('all', ((action, path) => {
            if (action == "add") {
                addSensorSet(path);
            }
            if (action == "unlink") {
                //removeLayer(path);
            }
            if (action == "change") {
                addSensorSet(path);
            }
            Winston.info(action + " - " + path);
        }));
    }, 1000);
}

function addSensorSet(file: string) {
    var ext = path.extname(file);
    if (ext !== '.txt') {
        Winston.error(`Cannot read ${file}: Only .txt files are supported.`);
        return;
    }
    // Create new layer for sensor data at web server
    var title = path.basename(file, ext);
    var layerId = title.replace(/ /g, '');
    var layerDef = {
        id: layerId,
        title: title,
        storage: "file",
        useLog: false,
        features: [], // no initial data
        updated: 0,
        tags: ['drone', 'temperatuur', 'luchtvochtigheid', 'luchtdruk'],
        dynamic: true,
        type: "FeatureCollection",
        description: "Sensor data",
        defaultFeatureType: "droneData",
        typeUrl: "api/resources/droneResourceTypes"
    };
    var req = request.post(layerUrl, { json: true, body: layerDef }, (err, res, body) => {
        if (err) {
            Winston.error('Error creating new layer: ' + err);
        } else {
            Winston.info('New layer created: ' + layerId);
        }
    });
    // Upload the data
    processFile(layerId, file);
    // Create new layer for the drone position at web server

}

/**
 * Process a file, and post each new measerement to the web server
 */
function processFile(layerId: string, file: string) {
    fs.readFile(file, (err, data) => {
        if (err) {
            Winston.error(`Error reading file (${file}): ${err}.`);
            return;
        }

        var msg = data.toString();
        var lines = msg.split('\n');

        var newFeatures: IFeature[] = [];
        var id = Date.now().toString();
        var counter = 0;
        for (let i = 0; i < lines.length;) {
            let gpsga = lines[i++];
            let data1 = lines[i++];
            let data2 = lines[i++];

            if (!gpsga || existingSensorData.indexOf(gpsga) >= 0) continue;
            existingSensorData.push(gpsga);

            let feature = convertGpsga2feature(`${id}-${counter++}`, gpsga);
            appendData1(feature, data1);
            appendData2(feature, data2);

            newFeatures.push(feature);
        }

        var url = `${layerUrl}/${layerId}/feature`.toLowerCase();
        sendFeatures(url, newFeatures);
    })
}

function sendFeatures(url: string, features: IFeature[]) {
    var feature = features.shift();
    request.post(url, { json: true, body: feature }, (err, res, body) => {
        if (err) {
            Winston.error('Error sending feature: ' + err);
        }
    });
    if (features.length === 0) return;
    setTimeout(() => sendFeatures(url, features), minTimeBetweenSamples);
}

function appendData1(feature: IFeature, data: string) {
    var fields = data.split(',');
    feature.properties["sensor1"] = +fields[1];
    feature.properties["sensor2"] = +fields[2];
    feature.properties["sensor3"] = +fields[3];
    feature.properties["sensor4"] = +fields[4];
}

function appendData2(feature: IFeature, data: string) {
    // onder luchtdruk staat de hoogte, en luchtvochtigheid de luchtdruk
    var fields = data.split(',');
    feature.properties["temperatuur"] = +fields[1];
    feature.properties["luchtdruk"] = +fields[2];
    feature.properties["luchtvochtigheid"] = +fields[3];
    feature.properties["hoogte"] = +fields[4];
}

/**
 * Convert GPSGA to feature.
 * See also: http://aprs.gids.nl/nmea/#gga
 * @method convertGpsga2feature
 * @param  {string}             id [ID of the feature]
 * @param  {string}             data [http://aprs.gids.nl/nmea/#gga]
 * @return {[type]}                  [description]
 */
function convertGpsga2feature(id: string, data: string) {
    var fields = data.split(',');
    var timeField = fields[1];
    var hour = timeField.substr(0, 2);
    var minutes = timeField.substr(2, 2);
    var seconds = timeField.substr(4, 2);
    var time = new Date(); time.setHours(+hour); time.setMinutes(+minutes); time.setSeconds(+seconds);

    //console.log(`${timeField}: ${hour}:${minutes}:${seconds}`);

    var lat = string2lat(fields[2], fields[3]);
    //console.log(lat);
    var lon = string2lon(fields[4], fields[5]);
    //console.log(lon);
    var fixQuality: string;
    switch (fields[6]) {
        case '0': fixQuality = 'Invalid'; break;
        case '1': fixQuality = 'GPS fix'; break;
        case '2': fixQuality = 'DGPS fix'; break;
    }
    //console.log('Fix quality: ' + fixQuality);
    var nrSatellites: number = +fields[7];
    //console.log('# Satellites: ' + nrSatellites);
    var hdop = +fields[8];
    //console.log('HDOP: ' + hdop);
    var altitude = +fields[9];
    //console.log('Altitude: ' + altitude);
    var altWgs84 = +fields[11];
    //console.log('Altitude WGS84: ' + altWgs84);

    var feature: IFeature = {
        id: id,
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [lon, lat, altWgs84]
        },
        properties: {
            "time": time.valueOf(),
            "fixQuality": fixQuality,
            "hdop": hdop,
            "altitude": altitude,
            "nrSatellites": nrSatellites
        }
    }
    return feature;
}

function string2lat(s: string, dir: string) {
    if (dir !== 'N') throw new Error('Only North is implemented!');
    var deg = +s.substr(0, 2);
    // console.log(deg);
    var min = +s.substr(2);
    // console.log(min/60);
    return deg + min / 60;
}

function string2lon(s: string, dir: string) {
    if (dir !== 'E') throw new Error('Only East is implemented!');
    var deg = +s.substr(0, 3);
    // console.log(deg);
    var min = +s.substr(3);
    // console.log(min/60);
    return deg + min / 60;
}
