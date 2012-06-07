if (typeof OpenLayers !== 'undefined') {

    OpenLayers.Layer.prototype.getLonLatFromViewPortPx = function(px){
        return this.map.getLonLatFromPixel(px);
    }

    OpenLayers.Control.Navigation.prototype.activate = function(){
        console.log("navigation activation overriden");
        if(this.map.activateNavigation){
            this.map.activateNavigation();
        }
        return OpenLayers.Control.prototype.activate.apply(this,arguments);
    }

    OpenLayers.Control.Navigation.prototype.deactivate = function(){
        if(this.map.deactivateNavigation){
            this.map.deactivateNavigation();
            return OpenLayers.Control.prototype.deactivate.apply(this,arguments);
        }
    }

    OpenLayers.Layer.Vector.prototype.display = function(display) {
        OpenLayers.Layer.prototype.display.apply(this, arguments);
        console.log("display override: "+display);
        if (display){
            for (var i in this.features){
                var feature = this.features[i];
                this.drawFeature(feature);
            }
        } else {
            this.renderer.eraseFeatures(this.features);
        }
    }
    
    OpenLayers.Layer.prototype.getExtent = function() {
        return this.map.getExtent();
    }

    OpenLayers.Globe = OpenLayers.Class(OpenLayers.Map, {
        canvas: null,
        ellipsoid: null,
        scene: null,
        primitives: null,
        cb: null,
        initialize: function (div, options) {
            this.div = OpenLayers.Util.getElement(div);
            var canvasId = "glCanvas";
            var is2d = false;
            if(options){
                if(options.canvasId){
                    canvasId = options.canvasId;
                }
                if(options.is2d){
                    is2d = options.is2d;
                }
            }
            this.canvas = document.getElementById(canvasId);
            if(!this.canvas) {
                this.canvas = document.createElement("canvas");
                this.canvas.id = canvasId;
                this.canvas.style.position = "absolute";
                this.canvas.style.top = this.div.offsetTop +"px";
                this.canvas.style.left = this.div.offsetLeft + "px";
                this.canvas.height = this.div.offsetHeight;
                this.canvas.width = this.div.offsetWidth;
                this.canvas.style.zIndex = this.Z_INDEX_BASE["BaseLayer"];
                this.div.appendChild(this.canvas);
            }
            this.ellipsoid = Cesium.Ellipsoid.WGS84;
            this.scene = new Cesium.Scene(this.canvas);
            this.primitives = this.scene.getPrimitives();
            this.cb = new Cesium.CentralBody(this.scene.getCamera(), this.ellipsoid);
            var bing = new Cesium.BingMapsTileProvider({
                server : "dev.virtualearth.net",
                mapStyle : Cesium.BingMapsStyle.AERIAL
            });
            this.cb.dayTileProvider = bing; // had to add this back in due to minTileDistance is not a function errors
            //this.cb.nightImageSource = "Images/land_ocean_ice_lights_2048.jpg";
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

            if(is2d){
                var transitioner = new Cesium.SceneTransitioner(this.scene);
                transitioner.to2D();
            }

            this.scene.setAnimation(function() {
                    var camera = that.scene.getCamera();
                    var cameraPosition = new Cesium.Cartesian4(camera.position.x, camera.position.y, camera.position.z, 1.0);
                    var v = camera.transform.multiplyWithVector(cameraPosition).getXYZ();
                    that.scene.setSunPosition(v);

                    //  In case of canvas resize
                    that.canvas.width = that.div.offsetWidth;
                    that.canvas.height = that.div.offsetHeight;
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
            this.layerContainerDiv.style.display = "none"; // layercontainerdiv is useless now and was blocking mouse events
            this.maxExtent = this.getMaxExtent();
        },
        
        addLayer: function(layer){
            //TODO actually implement this correctly
            if (layer instanceof OpenLayers.Layer.Vector){
                this.baseLayer = layer; // gets rid of null pointers TODO don't do this
                layer.renderer = new OpenLayers.Renderer.GlobeRenderer(this);
                OpenLayers.Map.prototype.addLayer.apply(this, arguments);
            }else if (layer instanceof OpenLayers.Layer.WMS){
                var url = layer.url;
                var wmsLayer = layer.params.LAYERS;
                var wms = new Cesium.WebMapServiceTileProvider({
                    url : url, //'http://www2.demis.nl/wms/wms.asp',
                    proxy : new Cesium.DefaultProxy('/proxy/'),
                    layer : wmsLayer //'Countries'
                });
                this.cb.dayTileProvider = wms;
            }else if (layer instanceof OpenLayers.Layer.ArcGIS93Rest){
                //NOTE: this code ends up requesting invalid tiles from
                //our geoapp server but works for servers like
                //server.arcgisonline.com
                var startIndex = 0;
                if(layer.url.indexOf("http://")!=-1){
                    startIndex = 7;
                }else if(layer.url.indexOf("https://")!=-1){
                    startIndex = 8;
                }
                //remove the http:// part
                var url = layer.url.substring(startIndex, layer.url.length);

                var tokens = url.split("/");
                var hostName = tokens[0];
                var service = tokens[4];
                var arcgis = new Cesium.ArcGISTileProvider({
                    host: hostName, //"server.arcgisonline.com",
                    root: "ArcGIS/rest",
                    service: service, //"World_Street_Map",
                    proxy: new Cesium.DefaultProxy("/proxy"),
                    olLayer: layer
                });
                this.cb.dayTileProvider = arcgis;
                this.cb.dayTileProvider.olLayer = layer;
            }
            else{
                // Bing Maps
                var bing = new Cesium.BingMapsTileProvider({
                    server : "dev.virtualearth.net",
                    mapStyle : Cesium.BingMapsStyle.AERIAL
                });
                this.cb.dayTileProvider = bing;
            }
            console.log("addLayer Override");
        },

        getOLBaseLayer: function(){
            return this.cb.dayTileProvider.olLayer.clone();
        },

        getLonLatFromPixel: function (pos) {
            if (pos){
                var p = this.scene.getCamera().pickEllipsoid(this.ellipsoid, new Cesium.Cartesian2(pos.x, pos.y));
                if (p) {
                    var d = Cesium.Math.cartographic2ToDegrees(this.ellipsoid.toCartographic2(p));
                    return new OpenLayers.LonLat(d.longitude, d.latitude);
                }
            } else {
                console.log("position is null");
            }
            return  new OpenLayers.LonLat(-1000, -1000); // avoid null pointers   
        },
        
        getMaxExtent: function(){
            return new OpenLayers.Bounds(-45, -45, 45, 45); // TODO this will be wider if viewing in 2D    
        },
        
        getExtent: function () {
            var center = this.getLonLatFromPixel({x:this.canvas.width/2,y:this.canvas.height/2});
            var topCenter = this.getLonLatFromPixel({x:this.canvas.width/2,y:0});
            var rightCenter = this.getLonLatFromPixel({x:this.canvas.width,y:this.canvas.height/2});
            var bottomCenter = this.getLonLatFromPixel({x:this.canvas.width/2,y:this.canvas.height});
            var leftCenter = this.getLonLatFromPixel({x:0,y:this.canvas.height/2});
            if (leftCenter.lon == -1000){ // left and right are bad
                leftCenter = {lat:center.lat, lon:center.lon-45};
                rightCenter = {lat:center.lat, lon:center.lon+45};
            }
            if (topCenter.lat == -1000){ // top and bottom are bad
                topCenter = {lat:center.lat+45, lon:center.lon};
                bottomCenter = {lat:center.lat-45, lon:center.lon};
            }
            return new OpenLayers.Bounds(leftCenter.lon,bottomCenter.lat,rightCenter.lon,topCenter.lat);
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
            this.scene.getCamera().getControllers().get(0)._zoomWheel._eventHandler._mouseEvents["WHEEL"](720); // scroll mouse wheel twice
        },
    
        zoomOut: function() {
            this.scene.getCamera().getControllers().get(0)._zoomWheel._eventHandler._mouseEvents["WHEEL"](-720); // scroll mouse wheel twice
        },
        
        zoomToMaxExtent: function(options) {
            this.zoomToExtent(this.maxExtent);
//            this.scene.getCamera().getControllers().addFlight({
//                destination: this.ellipsoid.toCartesian(new Cesium.Cartographic3(-1.57,0.46,6382419)),
//                duration: 0.1
//            });
        },
        
        zoomToExtent: function(bounds, closest) {
            if (!(bounds instanceof OpenLayers.Bounds)) {
                bounds = new OpenLayers.Bounds(bounds);
            }
            var west = Cesium.Math.toRadians(bounds.left),
                south = Cesium.Math.toRadians(bounds.bottom),
                east = Cesium.Math.toRadians(bounds.right),
                north = Cesium.Math.toRadians(bounds.top);

            this.scene.getCamera().viewExtent(this.ellipsoid, west, south, east, north);
        },

        moveTo: function(lonlat, zoom, options) {
            var alt = 4000000;
            if (zoom>0){
                alt/=zoom;
            } else {
                alt = 6000000;
            }
            this.scene.getCamera().getControllers().addFlight({
                destination: this.ellipsoid.cartographicDegreesToCartesian(new Cesium.Cartographic3(lonlat.lon, lonlat.lat, alt)),
                duration: 0.1
            });
            console.log("moveTo override");
        },

        activateNavigation: function(){
            this.scene.getCamera().getControllers().addSpindle();
            this.scene.getCamera().getControllers().addFreeLook();
            this.scene.getCamera().getControllers().get(0).mouseConstrainedZAxis = true;
        },

        deactivateNavigation: function(){
            this.scene.getCamera().getControllers().removeAll();
        },

        CLASS_NAME: "OpenLayers.Globe"
    });

    OpenLayers.Renderer.GlobeRenderer = OpenLayers.Class(OpenLayers.Renderer,{

        pendingRedraw: false,

        features: null,

        primitivesHash: null,

        primitives: null,

        billboardHash: null,

        billboards: null,

        labelHash: null,

        labels: null,

        images: null,

        initialize: function(map){
            if (!map){
                console.log("GlobeRender constructor requires map as parameter");
                return;
            }
            this.map = map;
            this.labelHash = {};
            this.billboardHash = {};
            this.primitivesHash = {};
            this.features = {};
            this.images = new Array();
            OpenLayers.Renderer.prototype.initialize.apply(this, arguments);
            this.root = OpenLayers.Renderer.GlobeRenderer.DUMMYROOT;
            this.primitives = new Cesium.CompositePrimitive();
            this.primitives.setCentralBody(this.map.cb);
            this.map.primitives.add(this.primitives);

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
            this.images.push(canvas);
            this.billboards.setTextureAtlas(map.scene.getContext().createTextureAtlas([canvas]));
            this.labels = new Cesium.LabelCollection();
            this.primitives.add(this.labels);
            this.primitives.add(this.billboards);
        },

        supported: function() {
            return true;
        },

        drawFeature: function(feature, style) {
            this.features = {};
            //console.log("globerender::drawFeature()");
            var rendered;
            if (feature.geometry) {
                style = this.applyDefaultSymbolizer(style || feature.style);
                // don't render if display none or feature outside extent
                var bounds = feature.geometry.getBounds();
                rendered = (style.display !== "none");
                if (rendered) {
                    // keep track of what we have rendered for redraw
                    this.features[feature.id] = [feature, style];
                }
                else {
                    // remove from features tracked for redraw
                    this.eraseFeatures(feature);
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
            //console.log("globerenderer::eraseFeature()");
            if(!(OpenLayers.Util.isArray(features))) {
                features = [features];
            }
            for(var i=0; i<features.length; ++i) {
                var feature = features[i];
                this.primitives.remove(this.primitivesHash[feature.id]);
                this.billboards.remove(this.billboardHash[feature.id]);
                this.labels.remove(this.labelHash[feature.id]);
                delete this.features[feature.id];
                delete this.primitivesHash[feature.id];
                delete this.billboardHash[feature.id];
                delete this.labelHash[feature.id];
            }
        },

        drawGeometry: function(geometry, style, featureId) {
            //console.log("drawGeometry() "+geometry);
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
                    console.log("linearRing");
                    this.drawLineString(geometry, style, featureId);
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
                try {
                    var labelMap = [];
                    var feature, style;
                    for (var id in this.features) {
                        if (!this.features.hasOwnProperty(id)) { continue; }
                        feature = this.features[id][0];
                        style = this.features[id][1];
                        this.drawGeometry(feature.geometry, style, feature.id);
                        style.label = style.label || feature.data.name; // seeing cases where label is not set when there should be one
                        if(style.label) {
                            labelMap.push([feature, style]);
                        }
                    }
                    var item;
                    for (var i=0, len=labelMap.length; i<len; ++i) {
                        item = labelMap[i];
                        this.drawText(item[0].geometry.getCentroid(), item[1], feature.id);
                    }
                } catch (e){
                    console.log(e);
                }
            }
        },

        drawText: function(location, style, featureId) {
            //console.log("drawText() "+style.label);
            if (!location){
                return;
            }
            var text = this.labelHash[featureId];
            if (!text){
                text = new Cesium.Label(null, this.labels);
                text = this.labels.add(text);
                this.labelHash[featureId] = text;
            }
            text.setPosition(this.map.ellipsoid.cartographicDegreesToCartesian(
                new Cesium.Cartographic3(location.x, location.y, 0)));

            if(style.fontColor){
                //console.log("color: "+style.fontColor);
                var rgb = this.hexToRGB(style.fontColor);
                text.setFillColor({
                    red: rgb[0],
                    green: rgb[1],
                    blue: rgb[2],
                    alpha: style.fontOpacity || 1
                });
            }
            if (style.labelOutlineColor) {
                //console.log("outline: "+style.fontStrokeColor);
                var rgb;
                if (style.labelOutlineColor.indexOf('#')>-1){
                    rgb = this.hexToRGB(style.fontStrokeColor);
                } else if (style.labelOutlineColor=="white"){
                    rgb = [1,1,1];
                }
                if (rgb){
                    text.setOutlineColor({
                        red: rgb[0],
                        green: rgb[1],
                        blue: rgb[2],
                        alpha: style.fontOpacity
                    });
                }
            }
            if (style.fontFamily && style.fontSize) {
                //console.log("family: "+style.fontFamily);
                //console.log("size: "+style.fontSize);
                text.setFont(style.fontSize+" "+style.fontFamily);
            }
            if (style.fontWeight) {
                //console.log("weight: "+style.fontWeight);
            }
            if (style.fontStyle) {
                //console.log("style: "+style.fontStyle);
            }
            text.setStyle(Cesium.LabelStyle.FILL_AND_OUTLINE);
            text.setText(style.label);
            var halign = OpenLayers.Renderer.GlobeRenderer.LABEL_ALIGN_H[style.labelAlign[0]]; // uncomment after Cesium Issue #49 is resolved
            var valign = OpenLayers.Renderer.GlobeRenderer.LABEL_ALIGN_V[style.labelAlign[1]];
            text.setHorizontalOrigin(halign);
            text.setVerticalOrigin(valign);
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
            if (style.backgroundGraphic){
                console.log("img: "+style.backgroundGraphic);
                var image = new Image();
                image.src = style.backgroundGraphic;
                var width = style.graphicWidth || style.graphicHeight;
                var index = -1;
                for (var i in this.images){
                    var source = this.images[i].src;
                    if (source == image.src){
                        index = i;
                        break;
                    }
                }
                if (index==-1){
                    this.images.push(image);
                    var that = this;
                    image.onload = function() {
                        that.billboards.setTextureAtlas(that.map.scene.getContext().createTextureAtlas(that.images));
                        point.setImageIndex(that.images.length-1);
                    };
                } else {
                    image = this.images[index];
                    var origIndex = point.getImageIndex();
                    if (image.width!=0){ // image isn't loaded yet
                        console.log("reusing image "+this.images[index].src);
                        point.setImageIndex(index);
                        point.setScale(width/image.width);
                    } else {
                        point.setImageIndex(0);
                    }
                }
            } else {
                point.setScale(0.75);
            }
            point.setPosition(this.map.ellipsoid.cartographicDegreesToCartesian(
                new Cesium.Cartographic3(geometry.x, geometry.y, 0)));

        },

        drawPolygon: function(geometry, style, featureId){
            //console.log("drawpolygon()");
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
                        this.primitives.sendToBack(polygon); // keep polygons behind labels
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
            if (!polyline || polyline instanceof Cesium.Polygon){
                if (polyline){
                    this.primitives.remove(polyline);
                }
                var polyline = new Cesium.Polyline();
                if (style){
                    var rgb = this.hexToRGB(style.fillColor);
                    polyline.color = {
                        red: rgb[0],
                        green: rgb[1],
                        blue: rgb[2],
                        alpha: style.fillOpacity
                    };
                    polyline.width = 5;  // width is only 1px when ANGLE is enabled
                }
                this.primitivesHash[featureId] = polyline;
                this.primitives.add(polyline);
                this.primitives.sendToBack(polyline); // keep polylines behind labels
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

        removeText: function(featureId) {console.log("removeText() not implemented")},

        clear: function() {
            //console.log("clear");
            for (var i in this.billboardHash){
                var billboard = this.billboardHash[i];
                this.billboards.remove(billboard);
            }
            for (var i in this.labelHash){
                var l = this.labelHash[i];
                this.labels.remove(l);
            }
            for (var i in this.primitivesHash){
                var primitive = this.primitivesHash[i];
                if (!primitive.isDestroyed()){
                    this.primitives.remove(primitive);
                }
            }
            this.primitivesHash = {};
            this.billboardHash = {};
            this.features = {};
            this.labelHash = {};
        },

        getFeatureIdFromEvent: function(evt) {console.log("getFeatureIdFromEvent not implemented")},

        eraseGeometry: function(geometry, featureId) {console.log("eraseGeometry not implemented")},

        moveRoot: function(renderer) {console.log("moveRoot not implemented")},

        CLASS_NAME: "OpenLayers.GlobeRenderer"
    });

    OpenLayers.Renderer.GlobeRenderer.LABEL_ALIGN_H = {
        "l": Cesium.HorizontalOrigin.LEFT,
        "r": Cesium.HorizontalOrigin.RIGHT,
        "c": Cesium.HorizontalOrigin.CENTER
    };

    OpenLayers.Renderer.GlobeRenderer.LABEL_ALIGN_V = {
        "m": Cesium.VerticalOrigin.CENTER,
        "t": Cesium.VerticalOrigin.TOP,
        "b": Cesium.VerticalOrigin.BOTTOM
    };

    OpenLayers.Renderer.GlobeRenderer.DUMMYROOT = document.createElement("div");

}