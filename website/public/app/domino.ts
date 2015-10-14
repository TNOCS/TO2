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
            var initResetOption = <IActionOption>{
                title: "Init/reset states"
            };
            initResetOption.callback = App.DominoModel.initResetAction;
            var setFailedOption = <IActionOption>{
                title: "Set status to 'failed'"
            };
            setFailedOption.callback = App.DominoModel.setFailedAction;
            var setOperationalOption = <IActionOption>{
                title: "Set status to 'operational'"
            };
            setOperationalOption.callback = App.DominoModel.setOperationalAction;
            return [initResetOption, setFailedOption, setOperationalOption];
            return [];
        }
        getFeatureHoverActions(feature: IFeature): IActionOption[] { return []; };
        deselectFeature(feature: IFeature) { }
        updateFeature(feuture: IFeature) { }

        public static setFailedAction(feature: IFeature, layerService: csComp.Services.LayerService) {
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
                if (!layerService.findFeature(feature.layer, contourFeature.id)) {
                    layerService.initFeature(contourFeature, feature.layer);
                    feature.layer.data.features.push(contourFeature);
                    layerService.activeMapRenderer.addFeature(contourFeature);
                }
                var area = L.geoJson(geoContour);
                var bounds = area.getBounds();
                var count = 0;
                layerService.project.features.forEach((f) => {
                    // Two-step check if features are within the contour area: first check if inside bounding square, then check if inside the exact polygon
                    if (f.geometry.type === "Point" && bounds.contains(L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]))) {
                        if (csComp.Helpers.GeoExtensions.pointInsidePolygon(f.geometry.coordinates, geoContour.coordinates)) {
                            f.properties['State'] = 'failed';
                            f.effectiveStyle.strokeColor = "#ff0000";
                            f.effectiveStyle.strokeWidth = 5;
                            layerService.updateFeature(f);
                            if (f.id !== feature.id) {
                                count = count + 1;
                            }
                        }
                    }
                });
                layerService.project.features.forEach((f) => {
                    // check dependencies
                    if (f.properties.hasOwnProperty('dependencies') && f.properties.hasOwnProperty('State') && f.properties['State'] !== 'failed') {
                        var deps = f.properties['dependencies'];
                        var nrFailedDeps = 0;
                        deps.forEach((d) => {
                            layerService.project.features.some((pf) => {
                                if (pf.properties.hasOwnProperty('Name') && pf.properties['Name'] === d) {
                                    if (pf.properties.hasOwnProperty('State') && pf.properties['State'] === 'failed') {
                                        nrFailedDeps += 1;
                                        return true;
                                    }
                                }
                                return false;
                            });
                        });
                        if (nrFailedDeps > 0 && nrFailedDeps >= deps.length) {
                            App.DominoModel.setFailedAction(f, layerService);
                        }
                    }
                });
                console.log('Bounding square contains ' + count + ' features.');
            } else {
                feature.properties['State'] = 'failed';
                feature.effectiveStyle.strokeColor = "#ff0000";
                feature.effectiveStyle.strokeWidth = 5;
                layerService.updateFeature(feature);
            }
        }

        public static setOperationalAction(feature: IFeature, layerService: csComp.Services.LayerService) {
            console.log('domino:setOperationalAction');
            if (!feature) return;
            var contourId = feature.id + '-contour';
            var bounds: L.LatLngBounds;
            var contourFeature = layerService.findFeature(feature.layer, contourId);
            if (contourFeature) {
                bounds = new L.GeoJSON(contourFeature).getBounds();
                layerService.removeFeature(contourFeature);
                layerService.project.features.forEach((f) => {
                    // Two-step check if features are within the contour area: first check if inside bounding square, then check if inside the exact polygon
                    if (f.geometry.type === "Point" && bounds.contains(L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]))) {
                        if (csComp.Helpers.GeoExtensions.pointInsidePolygon(f.geometry.coordinates, contourFeature.geometry.coordinates)) {
                            f.properties['State'] = 'operational';
                            f.effectiveStyle.strokeColor = "#00ff00";
                            f.effectiveStyle.strokeWidth = 5;
                            layerService.updateFeature(f);
                        }
                    }
                });
            } else {
                if (feature.geometry.type.toLowerCase() !== 'linestring') {
                    feature.properties['State'] = 'operational';
                    feature.effectiveStyle.strokeColor = "#00ff00";
                    feature.effectiveStyle.strokeWidth = 5;
                    layerService.updateFeature(feature);
                }
            }
        }

        public static initResetAction(feature: IFeature, layerService: csComp.Services.LayerService) {
            // Add property "State" to featureType if it does not exist yet
            for (var ft in layerService._featureTypes) {
                if (ft.propertyTypeKeys) {
                    if (ft.propertyTypeKeys.split(";").some((key) => { return key.toLowerCase() === "state" })) {
                        continue;
                    } else {
                        ft.propertyTypeKeys = "State;" + ft.propertyTypeKeys;
                        if (!ft.hasOwnProperty('propertyTypeData')) ft['propertyTypeData'] = [];
                        ft.propertyTypeData.push({ "label": "State", "title": "State", "type": "text", "visibleInCallout": true, "canEdit": true });
                    }
                }
            }
            // Set all states to "operational"
            layerService.project.features.forEach((f) => {
                App.DominoModel.setOperationalAction(f, layerService);
            });
        }

        public init(layerService: csComp.Services.LayerService) {
            console.log('init DominoActionService');
            this.layerService = layerService;
        }
    }
}
