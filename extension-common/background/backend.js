var WS_CONNECTING = 0;
var WS_OPEN = 1;
var WS_CLOSING = 2;
var WS_CLOSED = 3;

// WEB SOCKETS BASED BACKEND -----------------------------------------------------------------------

DepthJS.wsBackend = {};

DepthJS.wsBackend.eventWs = null;
DepthJS.wsBackend.imageWs = null;
DepthJS.wsBackend.depthWs = null;
DepthJS.wsBackend.host = "localhost";
DepthJS.wsBackend.port = 8000;
DepthJS.wsBackend.connecting = false;
DepthJS.wsBackend.connected = false;

DepthJS.wsBackend.connect = function() {
  DepthJS.wsBackend.connecting = true;
  DepthJS.browser.sendMessageToPopup("connecting");
  var connected = 0;
  function check() {
    connected++;
    if (connected == 3) {
      if (DepthJS.verbose) console.log("All 3 connected");
      DepthJS.browser.sendMessageToPopup("connected");
      DepthJS.wsBackend.connecting = false;
      DepthJS.wsBackend.connected = true;
    }
  }

  // If we do not connect within a timeout period,
  // effectively cancel it and let the popup know.
  setTimeout(function() {
    if (connected != 3) {
      DepthJS.wsBackend.disconnect();
    }
  }, 3000);

  return _.all(_.map(["event", "image", "depth"], function(stream) {
    var path = "ws://" + DepthJS.wsBackend.host + ":" + DepthJS.wsBackend.port + "/" + stream;
    if (DepthJS.verbose) console.log("Connecting to " + stream + " stream on " + path);

    // Clear out any old sockets
    var oldSocket = DepthJS.wsBackend[stream+"Ws"];
    if (oldSocket != null) {
      oldSocket.onmessage = null;
      oldSocket.onclose = null;
      oldSocket.onopen = null;

      if (oldSocket.readyState == WS_OPEN ||
          oldSocket.readyState == WS_CONNECTING) {
        oldSocket.close();
      }
    }

    var socket = new WebSocket(path);
    DepthJS.wsBackend[stream+"Ws"] = socket;

    socket.onmessage = function(data){
      DepthJS.wsBackend.onMessage(stream, data);
    };

    socket.onclose = function() {
      DepthJS.wsBackend.onDisconnect(stream);
    };

    socket.onopen = function() {
      DepthJS.wsBackend.onConnect(stream);
      check();
    };

    return true;
  }));
};

DepthJS.wsBackend.onMessage = function (stream, data) {
  if (stream == "event") {
    if (data === undefined || data.data == null) {
      return;
    }
    var msg = JSON.parse(data.data);
    if (!$.isPlainObject(msg)) {
      if (DepthJS.verbose) console.log('Unknown message: ' + data);
      return;
    }
    DepthJS.logSortaVerbose(msg.type, msg);
    var handler = DepthJS.eventHandlers["on"+msg.type];
    if (handler != null) {
      handler(msg.data);
    }

    msg.jsonRep = data.data;
    // Don't send to all--send to only the current tab.
    DepthJS.browser.sendMessageToActiveTab(msg);
  } else if (stream == "image") {
    /*DepthJS.eventHandlers.onImageMsg(data);*/
  } else if (stream == "depth") {
    /*DepthJS.eventHandlers.onDepthMsg(data);*/
  }
};

DepthJS.wsBackend.disconnect = function() {
  DepthJS.wsBackend.connected = false;
  if (DepthJS.verbose) console.log("Disconnecting");
  DepthJS.browser.sendMessageToPopup("disconnected");
  return _.map(["event", "image", "depth"], function(stream) {
    var oldSocket = DepthJS.wsBackend[stream+"Ws"];
    if (oldSocket != null) {
      oldSocket.onmessage = null;
      oldSocket.onclose = null;
      oldSocket.onopen = null;

      if (oldSocket.readyState == WS_OPEN ||
          oldSocket.readyState == WS_CONNECTING) {
        oldSocket.close();
      }
    }
    DepthJS.wsBackend[stream+"Ws"] = null;
  });
};

DepthJS.wsBackend.onDisconnect = function (stream) {
  if (DepthJS.verbose) console.log("Disconnected on " + stream + " stream");
  // If one is closed, close them all.
  DepthJS.wsBackend.disconnect();
};

DepthJS.wsBackend.onConnect = function (stream) {
  if (DepthJS.verbose) console.log("Connect on " + stream + " stream");
};


// NPAPI PLUGIN BASED BACKEND ----------------------------------------------------------------------

DepthJS.npBackend = {};
DepthJS.npBackend.connected = false;
DepthJS.npBackend.connect = function() {
  if (DepthJS.npBackend.connected) {
    console.log("Already connectted... disconnecting and reconnecting");
    DepthJS.npBackend.disconnect();
  }
  DepthJS.browser.sendMessageToPopup("connecting");

  var success = DepthJS.pluginObj.InitDepthJS();
  if (success) {
    console.log("Successfully acquired Kinect event monitor from plugin!");
    DepthJS.npBackend.connected = true;
  } else {
    console.log("ERROR: Could not acquire Kinect event monitor from plugin");
  }
  return success;
};

DepthJS.npBackend.receiveEvent = function (msg) {
  if (msg == null || msg.type == null) {
    return;
  }
  DepthJS.logSortaVerbose(msg.type, msg);
  var handler = DepthJS.eventHandlers["on"+msg.type];
  if (handler != null) {
    handler(msg.data);
  }

  msg.jsonRep = JSON.stringify(msg);
  // Don't send to all--send to only the current tab.
  DepthJS.browser.sendMessageToActiveTab(msg);
};

DepthJS.npBackend.disconnect = function() {
  DepthJS.npBackend.connected = false;
  if (DepthJS.verbose) console.log("Disconnecting");
  DepthJS.browser.sendMessageToPopup("disconnected");
  DepthJS.pluginObj.ShutdownDepthJS();
};

// Native library chooses; default websocket

DepthJS.backend = {
  connect: DepthJS.wsBackend.connect,
  disconnect: DepthJS.wsBackend.disconnect
}
