var fs = require('fs');
var path = require('path');
var Winston = require('winston');
var chokidar = require('chokidar');
var request = require('request');
var csWebServer = 'http://localhost:3002';
var resourceTypeUrl = csWebServer + '/api/resources/droneResourceTypes';
var layerUrl = csWebServer + '/api/layers';
var dataFolder = './data';
var minTimeBetweenSamples = 1000;
Winston.remove(Winston.transports.Console);
Winston.add(Winston.transports.Console, {
    colorize: true,
    prettyPrint: true
});
var existingSensorData = [];
function start() {
    addResourceType();
    watchFolder(dataFolder);
}
start();
function addResourceType() {
    fs.readFile('./droneResourceTypes.json', function (error, data) {
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
        }, function (err, res, body) {
            if (err) {
                Winston.error('Error: ' + err);
            }
            else {
                Winston.info('URL: ' + body);
            }
        });
    });
}
function watchFolder(folder) {
    Winston.info('Watching folder: ' + folder);
    setTimeout(function () {
        var watcher = chokidar.watch(folder, { ignoreInitial: false, ignored: /[\/\\]\./, persistent: true });
        watcher.on('all', (function (action, path) {
            if (action == "add") {
                addSensorSet(path);
            }
            if (action == "unlink") {
            }
            if (action == "change") {
                addSensorSet(path);
            }
            Winston.info(action + " - " + path);
        }));
    }, 1000);
}
function addSensorSet(file) {
    var ext = path.extname(file);
    if (ext !== '.txt') {
        Winston.error("Cannot read " + file + ": Only .txt files are supported.");
        return;
    }
    var title = path.basename(file, ext);
    var layerId = title.replace(/ /g, '');
    var layerDef = {
        id: layerId,
        title: title,
        storage: "file",
        useLog: false,
        features: [],
        updated: 0,
        tags: ['drone', 'temperatuur', 'luchtvochtigheid', 'luchtdruk'],
        isDynamic: true,
        type: "dynamicgeojson",
        description: "Sensor data",
        defaultFeatureType: "droneData",
        defaultLegendProperty: "hoogte",
        typeUrl: "api/resources/droneResourceTypes"
    };
    var req = request.post(layerUrl, { json: true, body: layerDef }, function (err, res, body) {
        if (err) {
            Winston.error('Error creating new layer: ' + err);
        }
        else {
            Winston.info('New layer created: ' + layerId);
        }
    });
    processFile(layerId, file);
}
function processFile(layerId, file) {
    fs.readFile(file, function (err, data) {
        if (err) {
            Winston.error("Error reading file (" + file + "): " + err + ".");
            return;
        }
        var msg = data.toString();
        var lines = msg.split('\n');
        var newFeatures = [];
        var id = Date.now().toString();
        var counter = 0;
        for (var i = 0; i < lines.length;) {
            var gpsga = lines[i++];
            var data1 = lines[i++];
            var data2 = lines[i++];
            if (!gpsga || existingSensorData.indexOf(gpsga) >= 0)
                continue;
            existingSensorData.push(gpsga);
            var feature = convertGpsga2feature(id + "-" + counter++, gpsga);
            appendData1(feature, data1);
            appendData2(feature, data2);
            newFeatures.push(feature);
        }
        var url = (layerUrl + "/" + layerId + "/feature").toLowerCase();
        sendFeatures(url, newFeatures);
    });
}
function sendFeatures(url, features) {
    var feature = features.shift();
    request.post(url, { json: true, body: feature }, function (err, res, body) {
        if (err) {
            Winston.error('Error sending feature: ' + err);
        }
    });
    if (features.length === 0)
        return;
    setTimeout(function () { return sendFeatures(url, features); }, minTimeBetweenSamples);
}
function appendData1(feature, data) {
    var fields = data.split(',');
    feature.properties["sensor1"] = +fields[1];
    feature.properties["sensor2"] = +fields[2];
    feature.properties["sensor3"] = +fields[3];
    feature.properties["sensor4"] = +fields[4];
}
function appendData2(feature, data) {
    var fields = data.split(',');
    feature.properties["temperatuur"] = +fields[1];
    feature.properties["luchtdruk"] = +fields[2];
    feature.properties["luchtvochtigheid"] = +fields[3];
    feature.properties["hoogte"] = +fields[4];
}
function convertGpsga2feature(id, data) {
    var fields = data.split(',');
    var timeField = fields[1];
    var hour = timeField.substr(0, 2);
    var minutes = timeField.substr(2, 2);
    var seconds = timeField.substr(4, 2);
    var time = new Date();
    time.setHours(+hour);
    time.setMinutes(+minutes);
    time.setSeconds(+seconds);
    var lat = string2lat(fields[2], fields[3]);
    var lon = string2lon(fields[4], fields[5]);
    var fixQuality;
    switch (fields[6]) {
        case '0':
            fixQuality = 'Invalid';
            break;
        case '1':
            fixQuality = 'GPS fix';
            break;
        case '2':
            fixQuality = 'DGPS fix';
            break;
    }
    var nrSatellites = +fields[7];
    var hdop = +fields[8];
    var altitude = +fields[9];
    var altWgs84 = +fields[11];
    var feature = {
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
    };
    return feature;
}
function string2lat(s, dir) {
    if (dir !== 'N')
        throw new Error('Only North is implemented!');
    var deg = +s.substr(0, 2);
    var min = +s.substr(2);
    return deg + min / 60;
}
function string2lon(s, dir) {
    if (dir !== 'E')
        throw new Error('Only East is implemented!');
    var deg = +s.substr(0, 3);
    var min = +s.substr(3);
    return deg + min / 60;
}
