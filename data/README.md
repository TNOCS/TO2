# Converted data

The converted data can be found in the ESRI Shape file folder, with a sub folder per dataset.

## KML
The KML file was converted (with errors) using:
ogr2ogr -f "ESRI Shapefile" -append -skipfailures electricity.shp Standaardnetkaart-van-de-Benelux.kml

I've tried an alternative method using http://www.zonums.com/online/kml2shp.php, which grouped all points, lines and polygons into three separate shape files.

## GeoJSON
The geojson was converted using QGIS: drop the geojson on the map area, select the layer in the layer widget, right-click and save layer as ESRI shapefile.
