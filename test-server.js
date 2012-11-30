var arDrone = require('ar-drone'),
    fs = require('fs'),
    http = require('http'),
    gamepad = require('./lib/gamepad.js'),

    drone = arDrone.createClient(),
    srv = http.createServer(),
    io = require('socket.io').listen(srv);

srv.listen(process.env.NODE_PORT || 3000);

srv.on('request', function(req, res) {
    fs.createReadStream(__dirname + '/public/gamepad-test.html').pipe(res);
});

gamepad.listen(srv);

io.sockets.on('connection', function(socket) {
    var channel = socket.of('/nodecopter-gamepad');

    gamepad.init(drone, channel);

    channel.on('control', function(ev) { console.log('[control]', JSON.stringify(ev)); })
});