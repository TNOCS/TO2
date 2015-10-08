import fs = require('fs');
import path = require('path');

interface IFeature {
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

fs.readFile('./sample.txt', (err, data) => {
    if (err) return;

    var geojson: IGeoJSON = {
        type: "FeatureCollection",
        features: []
    }

    var msg = data.toString();
    console.log(msg);

    var lines = msg.split('\n');
    var gpsga = lines[0];
    var data1 = lines[1];
    var data2 = lines[2];

    var feature = convertGpsga2feature(gpsga);
    appendData1(feature, data1);
    appendData2(feature, data2);

    //console.log(JSON.stringify(feature, null, 2));

    geojson.features.push(feature);

    fs.writeFileSync('output.geojson', JSON.stringify(geojson, null, 2));

    console.log(JSON.stringify(geojson, null, 2));
})

function appendData1(feature: IFeature, data: string) {
    var fields = data.split(',');
    feature.properties["sensor1"] = +fields[1];
    feature.properties["sensor2"] = +fields[2];
    feature.properties["sensor3"] = +fields[3];
    feature.properties["sensor4"] = +fields[4];
}

function appendData2(feature: IFeature, data: string) {
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
 * @param  {string}             data [http://aprs.gids.nl/nmea/#gga]
 * @return {[type]}                  [description]
 */
function convertGpsga2feature(data: string) {
    var fields = data.split(',');
    var timeField = fields[1];
    var hour = timeField.substr(0, 2);
    var minutes = timeField.substr(2, 2);
    var seconds = timeField.substr(4, 2);
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
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [lon, lat, altWgs84]
        },
        properties: {
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
