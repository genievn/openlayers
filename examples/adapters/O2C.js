if (typeof OpenLayers !== 'undefined') {

	OpenLayers.Layer.prototype.getLonLatFromViewPortPx = function(px){
		return this.map.getLonLatFromPixel(px);
	} 

    OpenLayers.Control.Navigation.prototype.activate = function(){
        console.log("navigation activation overriden");
        this.map.scene.getCamera().getControllers().addSpindle();
        this.map.scene.getCamera().getControllers().addFreeLook();
        this.map.scene.getCamera().getControllers().get(0).mouseConstrainedZAxis = true;
        return OpenLayers.Control.prototype.activate.apply(this,arguments);
    }
    
    OpenLayers.Control.Navigation.prototype.deactivate = function(){
        this.map.scene.getCamera().getControllers().removeAll();
        return OpenLayers.Control.prototype.deactivate.apply(this,arguments);
    }
    
    OpenLayers.Globe = OpenLayers.Class(OpenLayers.Map, {
        canvas: null,
        ellipsoid: null,
        scene: null,
        primitives: null,
        cb: null,
        initialize: function (div, options) {
            this.div = OpenLayers.Util.getElement(div);
            this.canvas = document.getElementById("glCanvas");
            if(!this.canvas) {
                this.canvas = document.createElement("canvas");
                this.canvas.id = "glCanvas";
                this.canvas.style.position = "relative";
                this.canvas.style.top = -this.div.offsetHeight+"px";
                this.canvas.height = this.div.offsetHeight;
                this.canvas.width = this.div.offsetWidth;
                document.body.appendChild(this.canvas);
            }
            this.ellipsoid = Cesium.Ellipsoid.getWgs84();
            this.scene = new Cesium.Scene(this.canvas);
            this.primitives = this.scene.getPrimitives();
            this.cb = new Cesium.CentralBody(this.scene.getCamera(), this.ellipsoid);
            //cb.nightImageSource = "Images/land_ocean_ice_lights_2048.jpg";
            this.cb.specularMapSource = "Images/earthspec1k.jpg";
            if (this.scene.getContext().getMaximumTextureSize() > 2048) {
                this.cb.cloudsMapSource = "Images/earthcloudmaptrans.jpg";
                this.cb.bumpMapSource = "Images/earthbump1k.jpg";
            }
            this.cb.showSkyAtmosphere = true;
            this.cb.showGroundAtmosphere = true;
            this.primitives.setCentralBody(this.cb);
        
            this.scene.getCamera().frustum.near = 1.0;
            
            var that = this;
            this.scene.setAnimation(function() {
                    var camera = that.scene.getCamera();
                    var cameraPosition = new Cesium.Cartesian4(camera.position.x, camera.position.y, camera.position.z, 1.0);
                    var v = camera.transform.multiplyWithVector(cameraPosition).getXYZ();
                    that.scene.setSunPosition(v);
        
                    //  In case of canvas resize
                    //this.canvas.width = window.innerWidth;
                    //this.canvas.height = window.innerHeight;
                    that.scene.getContext().setViewport({
                        x : 0,
                        y : 0,
                        width : that.canvas.width,
                        height : that.canvas.height
                    });
        
                    that.scene.getCamera().frustum.aspectRatio = that.canvas.clientWidth / that.canvas.clientHeight;
        
                // Add code here to update primitives based on changes to animation time, camera parameters, etc.
            });

            (function tick() {
                try {
                    that.scene.render();
                } catch (e) {
                    // Live editing can create invalid states, e.g., a conic sensor with inner half-angle
                    // greater than outer half-angle, which cause exceptions.  We swallow the exceptions
                    // to avoid losing the animation frame.
                    console.log(e.message);
                }
    
                Cesium.requestAnimationFrame(tick);
            }());
        
            ///////////////////////////////////////////////////////////////////////////
            // Example keyboard and Mouse handlers
        
            var handler = new Cesium.EventHandler(this.canvas);
        
            handler.setKeyAction(function() {
                /* ... */
                // Handler for key press
            }, "1");
        
            handler.setMouseAction(function(movement) {
                /* ... */
                // Use movement.startX, movement.startY, movement.endX, movement.endY
            }, Cesium.MouseEventType.MOVE);
        
            document.oncontextmenu = function() {
                return false;
            };
            
            OpenLayers.Map.prototype.initialize.apply(this, arguments);
            this.events = new OpenLayers.Events(this, this.canvas, this.EVENT_TYPES, this.fallThrough, {includeXY: true});
        },
        
        addLayer: function(layer){
            //TODO actually implement this correctly
            if (layer instanceof OpenLayers.Layer.Vector){
                this.baseLayer = layer; // TODO don't do this
                layer.renderer = new OpenLayers.GlobeRenderer();
                OpenLayers.Map.prototype.addLayer.apply(this, arguments);
            } else if (layer instanceof OpenLayers.Layer.WMS){
                // Bing Maps
                var bing = new Cesium.BingMapsTileProvider({
                    server : "dev.virtualearth.net",
                    mapStyle : Cesium.BingMapsStyle.AERIAL
                });
                this.cb.dayTileProvider = bing; 
            }
            console.log("addLayer Override");
        },
        
        getLonLatFromPixel: function (pos) {
            var p = this.scene.getCamera().pickEllipsoid(this.ellipsoid, new Cesium.Cartesian2(pos.x, pos.y));
            if (p) {
                var d = Cesium.Math.cartographic2ToDegrees(this.ellipsoid.toCartographic2(p));
                return new OpenLayers.LonLat(d.longitude, d.latitude);
            }
            return  new OpenLayers.LonLat(-1000, -1000); // avoid null pointers TODO find what openlayers returned   
        },
        
        getMaxExtent: function(){
            return new OpenLayers.Bounds(-180, -90, 180, 90);    
        },
        
        moveByPx: function(dx, dy) {},
        
        pan: function(dx, dy, options) {
            var movement = {};
            movement.startPosition = new Cesium.Cartesian2(0,0);
            movement.endPosition = new Cesium.Cartesian2(dx,dy);
            movement.motion = new Cesium.Cartesian2(0,0);
            this.scene.getCamera().getControllers().get(0)._spin(movement);  
        },
        
        zoomIn: function() {
            this.scene.getCamera().getControllers().get(0).zoomIn(1000000);
        },
    
        zoomOut: function() {
            this.scene.getCamera().getControllers().get(0).zoomOut(1000000);
        },
        
        zoomToMaxExtent: function(options) {
            this.scene.getCamera().getControllers().addFlight({
                destination: this.ellipsoid.toCartesian(new Cesium.Cartographic3(-1.57,0.46,6382419)),
                duration: 0.1
            });
        },
        
        CLASS_NAME: "OpenLayers.Globe"
    });
    
    OpenLayers.GlobeRenderer = OpenLayers.Class(OpenLayers.Renderer,{
        
        pendingRedraw: false,
        
        features: {},
        
        primitivesHash: {},
        
        primitives: null,
        
        billboardHash: {},
        
        billboards: null,
        
        initialize: function(){
            OpenLayers.Renderer.prototype.initialize.apply(this, arguments);
            this.root = document.getElementById("glCanvas");
            this.primitives = new Cesium.CompositePrimitive();
            this.primitives.setCentralBody(map.cb);
            map.primitives.add(this.primitives);
            
            //setup to display points
            
            this.billboards = new Cesium.BillboardCollection();            
            var canvas = document.createElement("canvas");
            canvas.width = 16;
            canvas.height = 16;
            var context2D = canvas.getContext("2d");
            context2D.beginPath();
            context2D.arc(8, 8, 8, 0, Cesium.Math.TWO_PI, true);
            context2D.closePath();
            context2D.fillStyle = "rgb(255, 255, 255)";
            context2D.fill();
            this.billboards.setTextureAtlas(map.scene.getContext().createTextureAtlas([canvas]));
            this.primitives.add(this.billboards);
        },
    
        supported: function() {
            return true;
        },
        
        drawFeature: function(feature, style) {
            //console.log("globerender::drawFeature()");
            var rendered;
            if (feature.geometry) {
                style = this.applyDefaultSymbolizer(style || feature.style);
                // don't render if display none or feature outside extent
                var bounds = feature.geometry.getBounds();
                rendered = (style.display !== "none") && !!bounds && 
                    bounds.intersectsBounds(this.map.maxExtent); // TODO change this back to this.extent when map::moveTo() is implemented
                if (rendered) {
                    // keep track of what we have rendered for redraw
                    this.features[feature.id] = [feature, style];
                }
                else {
                    // remove from features tracked for redraw
                    delete(this.features[feature.id]);
                }
                this.pendingRedraw = true;
            }
            if (this.pendingRedraw && !this.locked) {
                this.redraw();
                this.pendingRedraw = false;
            }
            return rendered;
        },
        
        eraseFeatures: function(features) {
            console.log("globerenderer::eraseFeature()");
            if(!(OpenLayers.Util.isArray(features))) {
                features = [features];
            }
            for(var i=0; i<features.length; ++i) {
                var feature = features[i];
                delete this.features[feature.id];
                delete this.primitivesHash[feature.id];
                this.primitives.remove(this.primitivesHash[feature.id]);
                this.billboards.remove(this.billboardHash[feature.id]);
            }
        },
    
        drawGeometry: function(geometry, style, featureId) {
            //console.log("drawGeometry() "+geometry);
            if (!geometry){
                return; // not sure who is giving me null geometries
            }
            var className = geometry.CLASS_NAME;
            if ((className == "OpenLayers.Geometry.Collection") ||
                (className == "OpenLayers.Geometry.MultiPoint") ||
                (className == "OpenLayers.Geometry.MultiLineString") ||
                (className == "OpenLayers.Geometry.MultiPolygon")) {
                for (var i = 0; i < geometry.components.length; i++) {
                    this.drawGeometry(geometry.components[i], style, featureId);
                }
                return;
            }
            switch (geometry.CLASS_NAME) {
                case "OpenLayers.Geometry.Point":
                    this.drawPoint(geometry, style, featureId);
                    break;
                case "OpenLayers.Geometry.LineString":
                    this.drawLineString(geometry, style, featureId);
                    break;
                case "OpenLayers.Geometry.LinearRing":
                    //this.drawLinearRing(geometry, style, featureId);
                    break;
                case "OpenLayers.Geometry.Polygon":
                    this.drawPolygon(geometry, style, featureId);
                    break;
                default:
                    break;
            }
        },
        
        redraw: function() {
            //console.log("globerenderer::redraw()");
            if (!this.locked) {
                var labelMap = [];
                var feature, style;
                for (var id in this.features) {
                    if (!this.features.hasOwnProperty(id)) { continue; }
                    feature = this.features[id][0];
                    style = this.features[id][1];
                    this.drawGeometry(feature.geometry, style, feature.id);
                    if(style.label) {
                        labelMap.push([feature, style]);
                    }
                }
                var item;
                for (var i=0, len=labelMap.length; i<len; ++i) {
                    item = labelMap[i];
                    this.drawText(item[0].geometry.getCentroid(), item[1]);
                }
            }    
        },
            
        drawText: function(featureId, style, location) {
            //console.log("drawText()")
        },
        
        drawPoint: function(geometry, style, featureId) {
            //console.log("drawPoint()");
            var point = this.billboardHash[featureId];
            if (!point){
                var point = new Cesium.Billboard();
                var rgb = this.hexToRGB(style.fillColor);
                point = this.billboards.add(point);
                this.billboardHash[featureId] = point;
                point.setColor({
                    red: rgb[0],
                    green: rgb[1],
                    blue: rgb[2],
                    alpha: style.fillOpacity
                });
            }
            point.setPosition(this.map.ellipsoid.cartographicDegreesToCartesian(
                new Cesium.Cartographic3(geometry.x, geometry.y, 0)));
            
        },
        
        drawPolygon: function(geometry, style, featureId){
            for (var i in geometry.components) {
                var subgeom = geometry.components[i];
                var positions = [];
                var contains = function(p){
                    for (var i in positions){
                        if (p.equals(positions[i])){
                            return true;
                        }
                    }
                    return false;
                }
                for (var i in subgeom.components){
                    var point = subgeom.components[i];
                    var p = new Cesium.Cartographic2(point.x, point.y);
                    if (!contains(p)){ // cesium doesn't like polygons with duplicate points
                        positions.push(p);
                    }
                }
                if (positions.length<3){ // cesium doesn't like polygons with only two points
                    this.drawLineString(subgeom, style, featureId);
                } else {
                    var polygon = this.primitivesHash[featureId];
                    if (!polygon || polygon instanceof Cesium.Polyline){
                        if (polygon){
                            this.primitives.remove(polygon);
                        }
                        polygon = new Cesium.Polygon();
                        if (style){
                            var rgb = this.hexToRGB(style.fillColor);
                            polygon.material.color = {
                                red: rgb[0],
                                green: rgb[1],
                                blue: rgb[2],
                                alpha: style.fillOpacity
                            };
                        }
                        this.primitivesHash[featureId] = polygon;
                        this.primitives.add(polygon);
                    }
                    polygon.setPositions(this.map.ellipsoid.cartographicDegreesToCartesians(positions));
                }
            }       
        },
        
        drawLineString: function(geometry, style, featureId){
            var positions = [];
            for (var i in geometry.components){
                var point = geometry.components[i];
                positions.push(new Cesium.Cartographic2(point.x, point.y));
            }
            var polyline = this.primitivesHash[featureId];
            if (!polyline){
                var polyline = new Cesium.Polyline();
                if (style){
                    var rgb = this.hexToRGB(style.fillColor);
                    polyline.color = {
                        red: rgb[0],
                        green: rgb[1],
                        blue: rgb[2],
                        alpha: style.fillOpacity
                    };
                    polyline.width = 20;  // TODO doesn't seem to work.  Ask AGI why not.
                }
                this.primitivesHash[featureId] = polyline;
                this.primitives.add(polyline);
            }
            polyline.setPositions(this.map.ellipsoid.cartographicDegreesToCartesians(positions));
        },
        
        hexToRGB: function(h) {
            var cutHex = function(h){return (h.charAt(0)=="#") ? h.substring(1,7):h};
            var r = parseInt((cutHex(h)).substring(0,2),16)/255.0;
            var g = parseInt((cutHex(h)).substring(2,4),16)/255.0;
            var b = parseInt((cutHex(h)).substring(4,6),16)/255.0;
            return [r,g,b];
        },
    
        removeText: function(featureId) {console.log("removeText()")},
           
        clear: function() { 
            console.log("clear");
            for (var i in this.billboardHash){
                var billboard = this.billboardHash[i];
                this.billboards.remove(billboard);
            }
            for (var i in this.primitivesHash){
                var primitive = this.primitivesHash[i];
                if (!primitive.isDestroyed()){
                    this.primitives.remove(primitive);
                }
            }
            this.primitivesHash = {};
            this.billboardsHash = {};
            this.features = {};
        },
    
        getFeatureIdFromEvent: function(evt) {console.log("getFeatureIdFromEvent")},
        
        eraseGeometry: function(geometry, featureId) {console.log("eraseGeometry")},
        
        moveRoot: function(renderer) {console.log("moveRoot")},
    
        CLASS_NAME: "OpenLayers.GlobeRenderer"
    });
    
}