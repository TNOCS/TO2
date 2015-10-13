module App {
    import IFeature = csComp.Services.IFeature;
    import IActionOption = csComp.Services.IActionOption;

    export class DominoModel implements csComp.Services.IActionService {
        public id: string = 'dominomodel';
        private layerService: csComp.Services.LayerService;

        stop() { }
        addFeature(feature: IFeature) { }
        removeFeature(feature: IFeature) { }
        selectFeature(feature: IFeature) {
            console.log('domino:feature selected');
        }

        getFeatureActions(feature: IFeature): IActionOption[] {
            var setFailedOption = <IActionOption>{
                title: "Set status to 'failed'"
            };
            setFailedOption.callback = this.setFailedAction;
            var setOperationalOption = <IActionOption>{
                title: "Set status to 'operational'"
            };
            setOperationalOption.callback = this.setOperationalAction;
            return [setFailedOption, setOperationalOption];
            return [];
        }
        getFeatureHoverActions(feature: IFeature): IActionOption[] { return []; };
        deselectFeature(feature: IFeature) { }
        updateFeature(feuture: IFeature) { }

        public setFailedAction(feature: IFeature, layerService: csComp.Services.LayerService) {
            console.log('domino:setFailedAction');
            if (!feature) return;
            var fType = layerService.getFeatureType(feature);
            if (fType && fType.hasOwnProperty('contourProperty') && feature.properties.hasOwnProperty(fType['contourProperty'])) {
                var geoContour = JSON.parse(feature.properties[fType.contourProperty]);
                var contourFeature = <IFeature>{};
                contourFeature.geometry = { "type": "Polygon", "coordinates": geoContour.coordinates };
                contourFeature.properties = { "Name": "Affected area", "FeatureTypeId": "AffectedArea" };
                contourFeature.id = feature.id + "-contour";
                contourFeature.type = "Feature";
                layerService.initFeature(contourFeature, feature.layer);
                feature.layer.data.features.push(contourFeature);
                layerService.activeMapRenderer.addFeature(contourFeature);

                var area = L.geoJson(geoContour);
                var bounds = area.getBounds();
                var count = 0;
                layerService.project.features.forEach((f) => {
                    // Two-step check if features are within the contour area: first check if inside bounding square, then check if inside the exact polygon
                    if (f.geometry.type === "Point" && bounds.contains(L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]))) {
                        if (csComp.Helpers.GeoExtensions.pointInsidePolygon(f.geometry.coordinates, geoContour.coordinates)) {
                            if (f.id !== feature.id) count = count + 1;
                        }
                    }
                });
                console.log('Bounding square contains ' + count + ' features.');
            }
        }

        public setOperationalAction(feature: IFeature, layerService: csComp.Services.LayerService) {
            console.log('domino:setOperationalAction');
            if (!feature) return;
            var contourId = feature.id +'-contour';
            var contourFeature = layerService.findFeature(feature.layer, contourId);
            if (contourFeature) {
                layerService.removeFeature(contourFeature);
            }
        }

        public init(layerService: csComp.Services.LayerService) {
            console.log('init DominoActionService');
            this.layerService = layerService;
        }
    }
}
