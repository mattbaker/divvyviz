$(function () {
	var showMap = false;

    function createShaderMaterial(vshaderId, fshaderId, uniforms, attributes) {
        var vShader = $(vshaderId);
        var fShader = $(fshaderId);
        return new THREE.ShaderMaterial({
            vertexShader:   vShader.text(),
            fragmentShader: fShader.text(),
            uniforms: uniforms || {},
            attributes: attributes || []
          });
    }

    function processTrip(trip) {
        trip.starttime = +(new Date(trip.starttime));
        trip.stoptime = +(new Date(trip.stoptime));
        trip.tripduration = trip.stoptime - trip.starttime; // Easier if they match
        //trip.birthyear = trip.birthyear ? new Date(trip.birthyear) : false;
        return trip;
    }
	
	//hard-coded for now: State St & Harrison St,41.87395806,-87.62773949
	var originLatitude = 41.87395806;
	var originLongitude = -87.62773949;

    function processStation(station) {
		// scalingFactor will eventually be dynamic, but for now: 1 degree latitude ~= 69 miles, 1 longitude varies  but around Chicago ~= 53 miles
		// at most we're probably looking at around a quarter degree max difference in either direction (and probably much smaller than that)
		var scalingFactor = 10000;
		
        station.dpcapacity = parseInt(station.dpcapacity);
		station.latitude = parseFloat(station.latitude);
		station.longitude = parseFloat(station.longitude);
		station.x = (station.longitude - originLongitude) * scalingFactor;
		station.y = (station.latitude - originLatitude) * scalingFactor;
		
        return station;
    }

    var tripRequest = $.Deferred();
    var trips = [];
    tripRequest.done(function (parsedTrips) {
        console.time("Trips Processed")
        trips = parsedTrips.map(processTrip);
        console.timeEnd("Trips Processed");
    });

    console.log("Loading Trips...");
    d3.csv("data/Divvy_Trips_2013.csv", function (parsedTrips) { tripRequest.resolve(parsedTrips) });


    var stationRequest = $.Deferred();
    var stations = [];
    var stationLookup = {};
    stationRequest.done(function (parsedStations) {
        console.time("Stations Processed")
        stations = parsedStations.map(processStation);
        for(var i=0; i<stations.length; i++) {
            var station = stations[i];
            stationLookup[station.name] = station;
        }
        console.timeEnd("Stations Processed")
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


        /* image test */
		if(showMap){
			var img = new THREE.MeshBasicMaterial({ //CHANGED to MeshBasicMaterial
				map:THREE.ImageUtils.loadTexture('textures/chicago.png')
			});
			img.map.needsUpdate = true;
			// plane1200 × 1524
			var plane = new THREE.Mesh(new THREE.PlaneGeometry(2010, 2552),img);
			plane.overdraw = true;
			scene.add(plane);
		}
        /* end image test */

        var particleGeometry = new THREE.Geometry();
        //var particleMaterial = new THREE.ParticleBasicMaterial({size:10, color:0x63ddff});
        var particleUniforms = {
            current_time: {type:'f', value:0}
        };
        var particleAttributes = {
            direction: {type:'v4', value:[]},
            start_time: {type:'f', value:[]},
            duration: {type:'f', value:[]}
        };
        var particleMaterial = createShaderMaterial("#vertex-shader", "#fragment-shader",
            particleUniforms, particleAttributes);
        var ps = new THREE.ParticleSystem(particleGeometry, particleMaterial);
        // ps.dynamic = true;


        var onResize = function () {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener('resize', onResize, false);


        var stationSphereMaterial = new THREE.MeshLambertMaterial({color:0xff0000})
        var sideLength = Math.ceil(Math.sqrt(stations.length));
        var tripsZ = 100;

        var stationSpheres = [];
        for(var i=0; i<stations.length; i++) {
            var sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 10, 10), stationSphereMaterial);
            sphere.overdraw = true;
            sphere.stationData = stations[i];
            sphere.position.set(stations[i].x, stations[i].y, 0);

            stations[i].sphereGeometry = sphere;
            stationSpheres.push(stationSpheres);

            scene.add(sphere);
        }

        for(var i=0; i<trips.length; i++) {
            var startStationPos = stationLookup[trips[i].from_station_name].sphereGeometry.position;
            var endStationPos = stationLookup[trips[i].to_station_name].sphereGeometry.position;
            var randomOffset = pointWithinBounds(0, 10, 0, 10, 0, 0);

            var start = startStationPos.clone().add(randomOffset).setZ(tripsZ);
            var end = endStationPos.clone().add(randomOffset).setZ(tripsZ);
            var vertex = start;//clone if vertex gets mutated later!
            var direction = (new THREE.Vector4()).copy(end.sub(start));
            particleGeometry.vertices.push(vertex);
            particleAttributes.direction.value.push(direction);
            particleAttributes.start_time.value.push(trips[i].starttime);
            particleAttributes.duration.value.push(trips[i].tripduration)
        }
        scene.add(ps);

        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        var currentTime = 1372352400000;//+(new Date("6/27/2013 12:00"));
        var endTime = 1388551740000; //+(new Date("12/31/2013 22:49"));
        var currentDate = new Date(1372352400000);
        function animate() {
            stats.begin();
            if (currentTime < endTime) {
                currentTime+=1000*60*10;
                particleUniforms.current_time.value = currentTime;
            }
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
            controls.update();
            stats.end();
        }
        animate();
        setInterval(function () {
            // currentDate.setMilliseconds(currentTime); //recycle a single date object
            $('#date-display').text(new Date(currentTime));
        }, 1000)
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
