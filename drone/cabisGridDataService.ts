import fs = require('fs');
import path = require('path');
import Winston = require('winston');
import chokidar = require('chokidar');
import _ = require('underscore');

/**
 * Configuration:
 */

// folder which contains the sensor data
var dataFolder = './cabis';
// gridSize of the data
var gridSize = 100;
var Nx = 101;
var Ny = 51;
var Nz = 11;
var noDataValue = '-1';
var seconds = [0, 20, 40, 60, 120, 240, 480, 900, 1800, 3600, 7200, 9000, 18000, 36000, 72000];

Winston.remove(Winston.transports.Console);
Winston.add(Winston.transports.Console, {
    colorize: true,
    prettyPrint: true
});

/**
 * End Configuration
 */

interface ICTObject {
    c: number,
    t: number
}

/**
 * Initialisation
 */
function start() {
    // Watch folder and start processing the data
    watchFolder(dataFolder);
}
start();


function getGridHeader(): string {
    var s = ['NCOLS ' + Nx.toString(),
        'NROWS ' + Ny.toString(),
        'XLLCORNER 4.466772',
        'YLLCORNER 51.905530',
        'CELLSIZE 0.00145',
        'NODATA_VALUE -1'];
    return s.join('\n');
}

function watchFolder(folder: string) {
    Winston.info('Watching folder: ' + folder);
    setTimeout(() => {
        var watcher = chokidar.watch(folder, { ignoreInitial: false, ignored: /[\/\\]\./, persistent: true });
        watcher.on('all', ((action, path) => {
            if (action == "add") {
                convertData(path);
            }
            if (action == "unlink") {
                //removeLayer(path);
            }
            if (action == "change") {
                convertData(path);
            }
            Winston.info(action + " - " + path);
        }));
    }, 1000);
}

function convertData(file: string) {
    var ext = path.extname(file);
    if (ext !== '.txt') {
        Winston.error(`Cannot read ${file}: Only .txt files are supported.`);
        return;
    }
    // The files that we're interested in contain 'XLS_' in the filename.
    if (file.indexOf('XLS_') < 0) {
        Winston.error(`Will not read ${file}: Only files containing XLS_ are supported.`);
        return;
    }

    // Upload the data
    processFile(file);
}

/**
 * Process a file, and return a grid object.
 * A grid object is a 3D array (x,y,z) of C-t objects
 */
function processFile(file: string) {
    fs.readFile(file, (err, data) => {
        if (err) {
            Winston.error(`Error reading file (${file}): ${err}.`);
            return;
        }

        var msg = data.toString();
        var lines = msg.split('\n');
        var grid: ICTObject[][][] = [];
        for (let k = 0; k < Nz; k++) {
            var yline = [];
            for (let j = 0; j < Ny; j++) {
                var xline = [];
                for (let i = 0; i < Nx; i++) {
                    xline.push({});
                }
                yline.push(xline);
            }
            grid.push(yline);
        }

        var id = Date.now().toString();
        var counter = 0;

        var headers = lines[0].split('\t');

        for (let i = 1; i < lines.length;) {
            var lineObject = {};
            let line = lines[i++].split('\t');
            line.forEach((col, index) => {
                lineObject[headers[index]] = col;
            });

            if (!lineObject.hasOwnProperty('TimeSeries')) continue;
            var timeseries = lineObject['TimeSeries'].toString().split(' ').map(Number);
            var concentrationseries = lineObject['ConcentrationSeries'].split(' ').map(Number);

            grid[+lineObject['iz']][+lineObject['iy']][+lineObject['ix']] = { t: timeseries, c: concentrationseries };
        }
        // Winston.info(grid[5][5]);

        for (let k = 0; k < Nz; k++) {
            var folder = path.join(dataFolder, '..', path.parse(file).name);
            if (!fs.existsSync(folder)) fs.mkdirSync(folder);
            folder = path.join(folder, (k * 100).toString());
            if (!fs.existsSync(folder)) fs.mkdirSync(folder);
            seconds.forEach((s) => {
                var fileContent = getGridHeader() + '\n';
                for (let j = 0; j < Ny; j++) {
                    for (let i = 0; i < Nx; i++) {
                        let g = grid[k][j][i];
                        if (!g || Object.keys(g).length === 0) {
                            fileContent += noDataValue + ' ';
                        } else {
                            let val = searchTime(s, g.c, g.t);
                            if (val > 0) {
                                fileContent += searchTime(s, g.c, g.t).toString() + ' ';
                            } else {
                                fileContent += noDataValue + ' ';
                            }
                        }
                    }
                    fileContent += '\n';
                }
                fs.writeFile(path.join(folder, s.toString() + '.asc'), fileContent);
            });
        }
    })
}

function searchTime(t, cvalues, tvalues): number {
    if (cvalues.length < 0) return;
    if (_.min(tvalues) >= t) return cvalues[0];
    if (_.max(tvalues) < t && cvalues.length > 0) return cvalues[cvalues.length - 1];
    var foundIndex;
    tvalues.some((tv, index) => {
        if (tv < t) return false;
        foundIndex = index;
        return true;
    });
    var value = interpolation(t, tvalues[foundIndex - 1], tvalues[foundIndex], cvalues[foundIndex - 1], cvalues[foundIndex]);
    return value;
}

function interpolation(t, t0, t1, y0, y1): number {
    var y;
    if (t < t0) {
        y = y0;
    }
    else if (t > t1) {
        y = y1;
    }
    else {
        y = y0 + ((y1 - y0) * (t - t0) / (t1 - t0));
    }
    return y;
}
