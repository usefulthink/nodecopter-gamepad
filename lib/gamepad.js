var fs = require('fs'),
    path = require('path');


// IDEA: the transport used to get events from the browser to the server and into this module should not be our
//       concern and the module should basically be agnostic of the method used
//
//  * the client needs an EventEmitter-interface (`emit(eventName, data, ...)` for control-commands
//    and `on('navdata', fn)` to get notified of the current flying-state of the drone for a correct
//    mapping of the takeoff/land-commands). If the decision wether it is takeoff or land is moved
//    to the server, we would only need the emit-method.
//
//  * the server doesn't need to know how the data was sent to it. So the very same EventEmitter
//    can be used on the Server-Side. In this case the interface is only an emitter for a
//    `control`-event which is sent from the browser.
//
//  * with decreasing levels of complexity, shortcuts will be added to simplify the integration
//    (no need to provide a webserver, only a port is required; no need to have a eventEmitter
//    for events from the browser, we can provide socket.io)


// ## gamepad.init()
//
// initializes the server-part of the gamepad-module and sets up the socket to forward incoming control-events to the ardrone.
//
//     @param arDroneClient  a client instance to communicate with the ar-drone.
//     @param controlEventEmitter  an event-emitter that provides `control`-events sent by the client-libraries.
exports.init = function(arDroneClient, controlEventEmitter) {
    controlEventEmitter.on('control', function(ev) {
        var action = ev.action,
            actionClass = getActionClass(action);
            speed = ev.speed;

        if(actionClass == 'invalid') {
            console.error('invalid action ' + action);

            return;
        }

        if(actionClass == 'action' && action !== 'animate') {
            arDroneClient[action].call(arDroneClient);
        } else if(actionClass == 'movement') {
            if(speed > 1) {
                console.error('out of bound value ' + speed);
                speed = 1;
            }

            arDroneClient[action].call(arDroneClient, speed);
        } else {
            var animation = ev.animation,
                duration = ev.duration;

            // log an error for invalid animation-names
            if(animations.indexOf(animation) == -1) {
                console.error('invalid animation ' + animation);

                return;
            }

            arDroneClient.animate(animation, duration);
        }
    });
};

// ## gamepad.listen(server)
//
// attaches request-handlers to the webserver that will deliver the required client-libraries.
//
//     @param webserver {EventEmitter}  a webserver that can serve the client-libraries
//                                      to the frontend. Ideally, this is the server that
//                                      is used to serve the main pages as well.
exports.listen = function(server) {
    // wait until nextTick so that all listeners from the main-program should've been registered
    process.nextTick(function() {
        initResourceRequestHandlers(server);
    });
};

// initializes the request-handler for static assets. This will serve the
// static files from the public-directory.
function initResourceRequestHandlers(webserver) {
    // Since the webserver might have some kind of "catch-all" request-handler,
    // we first need to remove all existing listeners to have them out of our way.
    var origListeners = webserver.listeners('request').splice(0);

    // list of files our request-handler will serve
    var files = [
        'gamepad-client.js',
        'gamepad-calibration.js',
        'gamepad-test.html'
    ];

    // install a new request-handler that will respond to resource-requests
    // for the files in our public-directory.
    webserver.on('request', function(req, res) {
        for(var i=0, n=files.length; i<n; i++) {
            if(req.url === '/nodecopter-gamepad/' + files[i]) {
                var filename = path.join(__dirname, '../public', files[i]);

                fs.createReadStream(filename)
                    .pipe(res);

                return;
            }
        }

        // If the request could not be handled by the listener above, it is forwarded
        // to the original listeners
        origListeners.forEach(function(listener) {
            listener.call(webserver, req, res);
        });
    });
}


// # internals and utilities

// lists of valid movement- and action-commands and animation-names
var movements = [
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

// returns the actions-class for a specific action
function getActionClass(action) {
    if(actions.indexOf(action) !== -1) { return 'action'; }
    if(movements.indexOf(action) !== -1 ) { return 'movement'; }

    return 'invalid';
}
