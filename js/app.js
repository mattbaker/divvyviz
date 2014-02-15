$(function () {
    function processTrip(trip) {
        trip.starttime = new Date(trip.starttime);
        trip.stoptime = new Date(trip.stoptime);
        trip.tripduration = trip.stoptime - trip.starttime; // Easier if they match
        trip.birthyear = trip.birthyear ? new Date(trip.birthyear) : false;
        return trip;
    }

    function processStation(station) {
        station.dpcapacity = parseInt(station.dpcapacity);
        return station;
    }

    var tripRequest = $.Deferred();
    var trips = [];
    tripRequest.done(function (parsedTrips) {
        trips = parsedTrips.map(processTrip);
        console.log("Trips Loaded.");
    });

    console.log("Loading Trips...");
    d3.csv("data/Divvy_Trips_2013.small.csv", function (parsedTrips) { tripRequest.resolve(parsedTrips) });


    var stationRequest = $.Deferred();
    var stations = [];
    var stationLookup = {};
    stationRequest.done(function (parsedStations) {
        stations = parsedStations.map(processStation);
        for(var i=0; i<stations.length; i++) {
            var station = stations[i];
            stationLookup[station.name] = station;
        }
        console.log("Stations Loaded.");
    });

    console.log("Loading Stations...");
    d3.csv("data/Divvy_Stations_2013.csv", function (parsedStations) { stationRequest.resolve(parsedStations) });

    $.when(tripRequest, stationRequest).done(init);

    function init() {
        /* Stats shit */
        var stats = new Stats();
        stats.setMode(0); // 0: fps, 1: ms
        stats.domElement.style.position = 'absolute';
        stats.domElement.style.left = '0px';
        stats.domElement.style.top = '0px';
        document.body.appendChild( stats.domElement );

        var renderer = new THREE.WebGLRenderer({antialias:false});
        var camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 10000);
        camera.position.z = 3500;
        var controls = new THREE.OrbitControls(camera);

        var scene = new THREE.Scene();
        var light = new THREE.AmbientLight( 0x404040 ); // soft white light
        scene.add( light );

        // directional lighting
        var directionalLight = new THREE.DirectionalLight(0xffffff);
        directionalLight.position.set(0, 0, 100).normalize();
        scene.add(directionalLight);

        var particleGeometry = new THREE.Geometry();
        var particleMaterial = new THREE.ParticleBasicMaterial({size:10, color:0x63ddff});
        var ps = new THREE.ParticleSystem(particleGeometry, particleMaterial);
        ps.dynamic = true;


        var onResize = function () {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener('resize', onResize, false);


        var stationSphereMaterial = new THREE.MeshLambertMaterial({color:0x333333})
        var sideLength = Math.ceil(Math.sqrt(stations.length));
        var margin = 100;
        var centeringOffset = new THREE.Vector3(-(sideLength/2)*margin, -(sideLength/2)*margin, 0);

        var stationSpheres = [];
        for(var i=0; i<stations.length; i++) {
            var sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 10, 10), stationSphereMaterial);
            sphere.overdraw = true;
            sphere.stationData = stations[i];
            sphere.position.set((i%sideLength)*margin, Math.floor(i/sideLength)*margin, 0);
            sphere.position.add(centeringOffset)

            stations[i].sphereGeometry = sphere;
            stationSpheres.push(stationSpheres);

            scene.add(sphere);
        }

        for(var i=0; i<trips.length; i++) {
            var startStationPos = stationLookup[trips[i].from_station_name].sphereGeometry.position;
            var endStationPos = stationLookup[trips[i].to_station_name].sphereGeometry.position;
            var randomOffset = pointWithinBounds(-margin/2, margin/2, -margin/2, margin/2, 0, 0);

            var start = startStationPos.clone().add(randomOffset).setZ(margin);
            var end = endStationPos.clone().add(randomOffset).setZ(margin);
            var vertex = new THREE.Vector3(0,0,-1000)
            vertex.start = start;
            vertex.trip = trips[i];
            vertex.direction = end.clone().sub(start);
            particleGeometry.vertices.push(vertex);
        }
        scene.add(ps);

        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        var currentTime = new Date("6/27/2013 12:00");
        var endTime = new Date("7/13/2013");
        function animate() {
            stats.begin();
            if (currentTime < endTime) {
                currentTime.setMilliseconds(currentTime.getMilliseconds()+(1000*60*5));
                for(var i=0; i<particleGeometry.vertices.length; i++) {
                    var vertex = particleGeometry.vertices[i];
                    if (currentTime >= vertex.trip.starttime && currentTime <= vertex.trip.stoptime) {
                        var timespent = currentTime - vertex.trip.starttime;
                        var pct = timespent / vertex.trip.tripduration;
                        vertex.copy(vertex.start.clone().add(vertex.direction.clone().multiplyScalar(pct)));
                    }
                }
                particleGeometry.verticesNeedUpdate = true;
            }
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
            controls.update();
            stats.end();
        }
        animate();
    }

    function randomWithinBound(bm, bM) {
        return bm + (Math.random() * (bM - bm));
    }
    function pointWithinBounds(xm, xM, ym, yM, zm, zM) {
        return new THREE.Vector3(
            randomWithinBound(xm, xM),
            randomWithinBound(ym, yM),
            randomWithinBound(zm, zM)
        )
    }
})
