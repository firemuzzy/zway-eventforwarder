function EventForwarder(id, controller) {
    // Call superconstructor first (AutomationModule)
    EventForwarder.super_.call(this, id, controller);
}

inherits(EventForwarder, AutomationModule);

_module = EventForwarder;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

EventForwarder.prototype.init = function (config) {
    EventForwarder.super_.prototype.init.call(this, config);

    var self = this;

    if(this.config.submit_host == null) { throw "EventForwarder - submit_host is undefined" }
    if(this.config.submit_uri == null) { throw "EventForwarder - submit_uri is undefined" }

    self.submit_url = this.config.submit_host + this.config.submit_uri

    self.devices = {};

    this.handleDevUpdates = function (vDev) {
        self.updateState(vDev);
    };

    this.handleDevCreation = function(vDev) {
        self.createDevice(vDev);
    };

    this.handleDevDeletion = function(vDev) {
        self.deleteDevice(vDev);
    };

    // Determine current configured devices
    self.controller.devices.each(self.handleDevCreation);

    // self.controller.devices.onAny(function (value, value2, value3) {
    //   console.log("Device event:", this.event, "obj:", JSON.stringify(value), "v2:", value2, "v3:", value3)
    // })
    //
    // self.controller.onAny(function (value, value2) {
    //   console.log("Controller event:", this.event, value, value2)
    // })

    // Setup event listeners
    self.controller.devices.on('change:metrics:level', self.handleDevUpdates);
    self.controller.devices.on('created', self.handleDevCreation);
    self.controller.devices.on('removed', self.handleDevDeletion);

    // var callback = function(type,arg) {
    //   console.log('### here I am ###', arguments.length, "type:", type, "arg:", arg)
    // };
    //
    // zway.data.bind(callback);
    //
    // for (var dv in zway.devices) {
    //   var dv = zway.devices[dv];
    //   console.log("STUFF: ", JSON.stringify(dv))
    //   dv.data.bind(callback, null, true);
    // }
};

EventForwarder.prototype.stop = function () {
    var self = this;

    // Remove event listeners
    self.controller.devices.off('change:metrics:level', self.handleDevUpdates);
    self.controller.devices.off('created', self.handleDevCreation);

    EventForwarder.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

EventForwarder.prototype.updateState = function(vDev) {
    var fields,
        meterType,
        self = this;

    // debugPrint('EventForwarder: Device update ' + JSON.stringify(vDev));

    if(!self.devices[vDev.id]) {
        debugPrint('EventForwarder: update: Unknown device ' + vDev.id);
        return;
    }

    console.log("EventForwarder update:", JSON.stringify(vDev), vDev.get('metrics:level'))

    // A bug in zway is causing multiple update events to be triggered for each update
    // if(self.devices[vDev.id].level !== vDev.get('metrics:level')) {
    //     self.devices[vDev.id].level = vDev.get('metrics:level');

    fields = vDev.id.replace(/ZWayVDev_zway_/, '').split('-');
    console.log("Fields:", JSON.stringify(fields))
    if(fields.length) {

        if(parseInt(fields[2], 10) === 0x32) {
            meterType = global.zway.devices[fields[0]].instances[fields[1]].commandClasses[fields[2]].data[fields[3]].sensorType.value;
        }

        var status = self.getDeviceStatus(fields[0])
        var httpObj = {
            method: 'POST',
            async: true,
            url: self.submit_url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                type: "update",
                status: status ? 'offline' : 'online',
                nodeId: parseInt(fields[0], 10),
                instanceId: parseInt(fields[1], 10),
                cmdClass: parseInt(fields[2], 10),
                meterType: meterType,
                sensorType: fields[3] ? parseInt(fields[3], 10) : undefined,
                vDevId: vDev.id,
                value: vDev.get('metrics:level'),
                timestamp: vDev.get('updateTime')
            })
        }
        console.log("EventForwarder: sending update event")
        http.request(httpObj)
        debugPrint('EventForwarder sending update event: ' + JSON.stringify(httpObj));
    }
    // }
};

EventForwarder.prototype.deleteDevice = function(vDev) {
    var fields,
        self = this;

    // debugPrint('EventForwarder: Removed device ' + JSON.stringify(vDev));

    fields = vDev.id.replace(/ZWayVDev_zway_/, '').split('-');
    if(fields.length) {
        if(parseInt(fields[2], 10) === 0x32) {
            meterType = global.zway.devices[fields[0]].instances[fields[1]].commandClasses[fields[2]].data[fields[3]].sensorType.value;
        }

        var httpObj = {
            method: 'POST',
            async: true,
            url: self.submit_url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                type: "delete",
                nodeId: parseInt(fields[0], 10),
                instanceId: parseInt(fields[1], 10),
                cmdClass: parseInt(fields[2], 10),
                meterType: meterType,
                sensorType: fields[3] ? parseInt(fields[3], 10) : undefined
            })
        }
        console.log("EventForwarder: sending delete event")
        http.request(httpObj);

        debugPrint('EventForwarder sending removed event: ' + JSON.stringify(httpObj));

        delete self.devices[vDev.id];
    }
};


EventForwarder.prototype.createDevice = function(vDev) {
    var fields,
        meterType,
        self = this;

    // debugPrint('EventForwarder: Created new device ' + JSON.stringify(vDev));

    if(!self.devices[vDev.id]) {
        self.devices[vDev.id] = {};
        self.devices[vDev.id].level = vDev.get('metrics:level');
    }

    fields = vDev.id.replace(/ZWayVDev_zway_/, '').split('-');
    if(fields.length) {

        var field = fields[0]
        if(field && global.zway.devices[field] && global.zway.devices[field].data && global.zway.devices[field].data.isFailed) {
            self.devices[vDev.id].status = self.getDeviceStatus(fields[0]);
            global.zway.devices[fields[0]].data.isFailed.bind(self.updateStatus, self.submit_url, fields[0]);
        }

        var field1 = fields[1]
        if(parseInt(fields[2], 10) === 0x32 && global.zway.devices[field] && global.zway.devices[field].instances[fields[1]]) {
            meterType = global.zway.devices[fields[0]].instances[fields[1]].commandClasses[fields[2]].data[fields[3]].sensorType.value;
        }

        var httpObj = {
            method: 'POST',
            async: true,
            url: self.submit_url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                type: "create",
                status: self.getDeviceStatus(fields[0]) ? 'offline' : 'online',
                nodeId: parseInt(fields[0], 10),
                instanceId: parseInt(fields[1], 10),
                cmdClass: parseInt(fields[2], 10),
                meterType: meterType,
                sensorType: fields[3] ? parseInt(fields[3], 10) : undefined,
                vDevId: vDev.id,
                value: vDev.get('metrics:level'),
                timestamp: vDev.get('updateTime')
            })
        }
        console.log("EventForwarder: sending create event")
        http.request(httpObj)

        debugPrint('EventForwarder sending created event: ' + JSON.stringify(httpObj));
    }
};

EventForwarder.prototype.updateStatus = function(unknown, submit_url, nodeId) {
    var self = this;

    console.log("EventForwarder: update status:", JSON.stringify(self))

    // debugPrint('EventForwarder: Status update, node ' + nodeId + ' went ' + (this.value ? 'offline' : 'online'));

    var httpObj = {
        method: 'POST',
        async: true,
        url: submit_url,
        headers: {
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            type: "status_update",
            status: self.value ? 'offline' : 'online',
            nodeId: parseInt(nodeId, 10),
            timestamp: self.updateTime
        })
    }
    console.log("EventForwarder: sending status update event")

    debugPrint('EventForwarder sending status update: ' + JSON.stringify(httpObj));
    http.request(httpObj)
}

EventForwarder.prototype.getDeviceStatus = function(deviceId) {
  if(deviceId == null) return null

  var device = global.zway.devices[deviceId]
  if(device == null) return null

  var data = device.data
  if(data == null) return null

  var isFailed = data.isFailed
  if(isFailed == null) return null

  return isFailed.value
}
