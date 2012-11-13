var sinon = require('sinon'),
    gamepad = require('../lib/gamepad.js'),
    http = require('http'),
    fs = require('fs'),
    EventEmitter = require('events').EventEmitter;


describe('gamepad server', function() {
    describe('webserver', function() {
        it('should deliver static assets', function(done) {
            var server = http.createServer();

            server.listen(23456);
            gamepad.listen(server);

            var requestsComplete = 0, files = [
                'gamepad-client.js',
                'gamepad-calibration.js'
            ];

            files.forEach(function(filename, idx) {
                http.get('http://localhost:23456/nodecopter-gamepad/' + filename, function(res) {
                    var expectedContent = fs.readFileSync(__dirname + '/../public/' + filename, 'utf8'),
                        content = '';

                    expect(res.statusCode).toBe(200);

                    res.on('data', function(buf) { content += buf.toString(); });
                    res.on('end', function() {
                        expect(content).toBe(expectedContent);

                        // close down the server and complete the test when all assets where loaded
                        if(++requestsComplete == files.length) { finish(); }
                    });
                });
            });

            function finish() {
                expect(requestsComplete).toBe(files.length);

                server.close();
                done();
            }
        });

        it('should coexist with other request-handlers', function(done) {
            var server = http.createServer(),
                firstRequestComplete = false,
                secondRequestComplete = false;

            server.listen(23456);
            gamepad.listen(server);

            server.on('request', function(req,res) { res.end('hello world'); });

            http.get('http://localhost:23456/nodecopter-gamepad/gamepad-client.js', function(res) {
                var expectedContent = fs.readFileSync(__dirname + '/../public/gamepad-client.js', 'utf8'),
                    content = '';

                res.on('data', function(buf) { content += buf.toString(); });
                res.on('end', function() {
                    expect(content).toBe(expectedContent);

                    firstRequestComplete = true;
                    if(secondRequestComplete) { finish(); }
                });
            });

            http.get('http://localhost:23456/something-else', function(res) {
                var content='';

                res.on('data', function(buf) { content += buf.toString(); });
                res.on('end', function() {
                    expect(content).toBe('hello world');

                    secondRequestComplete = true;
                    if(firstRequestComplete) { finish(); }
                });
            });

            function finish() {
                server.close();
                done();
            }
        });
    });

    describe('control dispatcher', function() {
        var droneClient, eventSource,
            movements = [
                'left', 'right', 'front', 'back',
                'up', 'down', 'clockwise', 'counterClockwise'
            ],
            actions = [
                'stop', 'takeoff', 'land', 'animate',
                'takeoffOrLand', 'disableEmergency'
            ],
            animations = [
                'phiM30Deg', 'phi30Deg', 'thetaM30Deg', 'theta30Deg', 'theta20degYaw200deg',
                'theta20degYawM200deg', 'turnaround', 'turnaroundGodown', 'yawShake',
                'yawDance', 'phiDance', 'thetaDance', 'vzDance', 'wave', 'phiThetaMixed',
                'doublePhiThetaMixed', 'flipAhead', 'flipBehind', 'flipLeft', 'flipRight'
            ];

        beforeEach(function() {
            // create a mock-client with spies attached
            var spies = jasmine.createSpyObj('droneClient', movements.concat(actions));

            droneClient = new EventEmitter();
            for(var method in spies) {
                if(!spies.hasOwnProperty(method)) { continue; }

                droneClient[method] = spies[method];
            }

            eventSource = new EventEmitter();

            gamepad.init(droneClient, eventSource);
            droneClient.emit('navdata', { droneState: { flying: true }});
        });

        describe('movements, actions and animations', function() {
            it('should handle all movement-commands', function() {
                movements.forEach(function(movement, idx) {
                    eventSource.emit('control', { action: movement, speed: 1/(idx+2) });

                    expect(droneClient[movement]).toHaveBeenCalledWith(1/(idx+2) );
                });
            });
            it('should handle all actions', function() {
                actions.forEach(function(action, idx) {
                    if(action == 'animate') { return; }
                    if(action == 'takeoffOrLand') { return; }

                    eventSource.emit('control', { action: action });

                    expect(droneClient[action]).toHaveBeenCalledWith();
                });
            });
            it('should handle all animations', function() {
                animations.forEach(function(animation, idx) {
                    eventSource.emit('control', { action: 'animate', animation: animation, duration: idx });

                    expect(droneClient.animate).toHaveBeenCalledWith(animation, idx);
                });
            });
            it('should handle movements without speed values as if a value of 1 was sent', function() {
                movements.forEach(function(movement, idx) {
                    eventSource.emit('control', { action: movement });
                    expect(droneClient[movement]).toHaveBeenCalledWith(1);
                });
            });
            it('should log an error for invalid commands', function() {
                spyOn(console, 'error');

                eventSource.emit('control', { action: 'foo' });

                expect(console.error).toHaveBeenCalledWith('invalid action foo');
            });
            it('should log an error for invalid animations', function() {
                spyOn(console, 'error');

                eventSource.emit('control', { action: 'animate', animation: 'fnordfoo' });

                expect(console.error).toHaveBeenCalledWith('invalid animation fnordfoo');
                expect(droneClient.animate).not.toHaveBeenCalled();
            });
            it('should log an error for out-of-bound values and limit values to [0-1]', function() {
                spyOn(console, 'error');

                eventSource.emit('control', { action: 'left', speed: 500 });

                expect(console.error).toHaveBeenCalledWith('out of bound value 500');
                expect(droneClient.left).toHaveBeenCalledWith(1);
            });
        });

        describe('takeoffOrLand control-event', function() {
            it('should takeoff if drone is not flying', function() {
                droneClient.emit('navdata', { droneState: { flying : false }});
                eventSource.emit('control', { action: 'takeoffOrLand' });

                expect(droneClient.takeoff).toHaveBeenCalled();
            });
            it('should land if drone is flying', function() {
                droneClient.emit('navdata', { droneState: { flying : true }});
                eventSource.emit('control', { action: 'takeoffOrLand' });

                expect(droneClient.land).toHaveBeenCalled();
            });
        });

        describe('navdata-dependency', function() {
            it('should log an error when flying-state is undefined', function() {
                spyOn(console, 'error');

                // flying-state is undefined (kinda reverts the initialization from beforeEach)
                droneClient.emit('navdata', { droneState: {}});
                eventSource.emit('control', { action: 'left', speed: 0.5 });

                expect(console.error).toHaveBeenCalledWith('undefined flying-state, not sending command');
            });
        });

    });
});