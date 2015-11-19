# Converted data

The KML file was converted (with errors) using:
ogr2ogr -f "ESRI Shapefile" -append -skipfailures electricity.shp Standaardnetkaart-van-de-Benelux.kml

The geojson was converted using QGIS: drop the geojson on the map area, select the layer in the layer widget, right-click and save layer as ESRI shapefile.
