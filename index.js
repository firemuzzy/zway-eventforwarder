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

    this.submit_url = this.config.submit_host + this.config.submit_uri

    this.devices = {};

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

    self.controller.devices.onAny(function (value) {
      console.log("Device event:", this.event, value)
    })

    self.controller.onAny(function (value) {
      console.log("Controller event:", this.event, value)
    })

    // Setup event listeners
    self.controller.devices.on('change:metrics:level', self.handleDevUpdates);
    self.controller.devices.on('created', self.handleDevCreation);
    self.controller.devices.on('removed', self.handleDevDeletion);
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

    debugPrint('EventForwarder: Device update ' + JSON.stringify(vDev));

    if(!self.devices[vDev.id]) {
        debugPrint('EventForwarder: updateStatus: Unknown device ' + vDev.id);
        return;
    }

    // A bug in zway is causing multiple update events to be triggered for each update
    if(self.devices[vDev.id].level !== vDev.get('metrics:level')) {
        self.devices[vDev.id].level = vDev.get('metrics:level');

        fields = vDev.id.replace(/ZWayVDev_zway_/, '').split('-');
        if(fields.length) {

            if(parseInt(fields[2], 10) === 0x32) {
                meterType = global.zway.devices[fields[0]].instances[fields[1]].commandClasses[fields[2]].data[fields[3]].sensorType.value;
            }

            // http.request(
            var status = this.getDeviceStatus(fields[0])
            var httpObj = {
                method: 'POST',
                async: true,
                url: this.submit_url,
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
            debugPrint('EventForwarder sending update event: ' + JSON.stringify(httpObj));
          //);
        }
    }
};

EventForwarder.prototype.deleteDevice = function(vDev) {
    var fields,
        self = this;

    debugPrint('EventForwarder: Removed device ' + JSON.stringify(vDev));

    fields = vDev.id.replace(/ZWayVDev_zway_/, '').split('-');
    if(fields.length) {
        if(parseInt(fields[2], 10) === 0x32) {
            meterType = global.zway.devices[fields[0]].instances[fields[1]].commandClasses[fields[2]].data[fields[3]].sensorType.value;
        }

        // http.request(
        var httpObj = {
            method: 'POST',
            async: true,
            url: this.submit_url,
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
      // );

        debugPrint('EventForwarder sending removed event: ' + JSON.stringify(httpObj));

        delete self.devices[vDev.id];
    }
};


EventForwarder.prototype.createDevice = function(vDev) {
    var fields,
        meterType,
        self = this;

    debugPrint('EventForwarder: Created new device ' + JSON.stringify(vDev));

    if(!self.devices[vDev.id]) {
        self.devices[vDev.id] = {};
        self.devices[vDev.id].level = vDev.get('metrics:level');
    }

    fields = vDev.id.replace(/ZWayVDev_zway_/, '').split('-');
    if(fields.length) {

        var field = fields[0]
        if(field && global.zway.devices[field] && global.zway.devices[field].data && global.zway.devices[field].data.isFailed) {
            self.devices[vDev.id].status = this.getDeviceStatus(fields[0]);
            global.zway.devices[fields[0]].data.isFailed.bind(self.updateStatus, fields[0]);
        }

        var field1 = fields[1]
        if(parseInt(fields[2], 10) === 0x32 && global.zway.devices[field] && global.zway.devices[field].instances[fields[1]]) {
            meterType = global.zway.devices[fields[0]].instances[fields[1]].commandClasses[fields[2]].data[fields[3]].sensorType.value;
        }

        // http.request(
        var httpObj = {
            method: 'POST',
            async: true,
            url: this.submit_url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                type: "create",
                status: this.getDeviceStatus(fields[0]) ? 'offline' : 'online',
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

        debugPrint('EventForwarder sending created event: ' + JSON.stringify(httpObj));
      // );
    }
};

EventForwarder.prototype.updateStatus = function(unknown, nodeId) {

    debugPrint('EventForwarder: Status update, node ' + nodeId + ' went ' + (this.value ? 'offline' : 'online'));

    // http.request(
    var httpObj = {
        method: 'POST',
        async: true,
        url: this.submit_url,
        headers: {
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            type: "status_update",
            status: this.value ? 'offline' : 'online',
            nodeId: parseInt(nodeId, 10),
            timestamp: this.updateTime
        })
    }

    debugPrint('EventForwarder sending status update: ' + JSON.stringify(httpObj));

  // );
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
