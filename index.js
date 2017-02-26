'use strict';

var iceServer = {
  "iceServers": [{
    url: "stun:115.28.87.181:40167"
    }]
};
var socket = new WebSocket("ws://" + window.location.host); //socket
var localStream = null;
var peerconns = new Map();
var ipt_addevent = false;

socket.onopen = function () {
  socket.onmessage = function (msg) {
    new Promise(function (resolve, reject) {
      if (localStream) {
        resolve(localStream);
      } else {
        navigator.webkitGetUserMedia({
          "audio": true,
          "video": true
        }, function (stream) {
          localStream = stream;
          resolve(stream);
          document.getElementById('localVideo').src = URL.createObjectURL(stream);
        }, function (error) {
          reject(error);
        });
      }
    }).then(function (stream) {
      var json = JSON.parse(msg.data);
      var data = json.data;

      if (!ipt_addevent) {
        ipt_addevent = true;
        var ipt = document.getElementById("msg-ipt");
        ipt.addEventListener("keydown", function (e) {
          if (e.keyCode == 13) {
            socket.send(JSON.stringify({
              event: "msg",
              data: {
                msg: ipt.value,
                socketID: data.socketID
              }
            }));
            $(".message").append("<p><span class=\"name me\">" + data.socketID + ": </span><span class=\"msg\">" + ipt.value + "</span></p>");
            ipt.value = "";
          }
        }, true);
      }

      var createRTCPeerConnection = function (socketID, me) {
        var pc = new webkitRTCPeerConnection(iceServer);
        pc.addStream(stream);
        peerconns.set(socketID, pc);
        pc.onicecandidate = function (event) {
          if (event.candidate !== null) {
            socket.send(JSON.stringify({
              event: "_ice_candidate",
              data: {
                candidate: event.candidate,
                socketID: socketID,
                me: me
              }
            }));
          }
        };
        pc.onaddstream = function (event) {
          $(".box").append("<video id=\"" + socketID + "\" autoplay src='" + URL.createObjectURL(event.stream) + "'></video>")
        };
        return pc;
      }
      switch (json.event) {
      case "new_peer":
        console.log(data.me)
        createRTCPeerConnection(data.me, data.socketID);
        break;
      case 'peers':
        console.log(data.socketsID)
        for (var i in data.socketsID) {
          (function () {
            var otherSocketID = data.socketsID[i];
            console.log(otherSocketID)
            var pc = createRTCPeerConnection(otherSocketID, data.socketID);
            pc.createOffer(function (desc) {
              pc.setLocalDescription(desc);
              socket.send(JSON.stringify({
                event: "_offer",
                data: {
                  sdp: desc,
                  socketID: otherSocketID,
                  me: data.socketID
                }
              }));
            }, function (error) {
              console.log('Failure callback: ' + error);
            });
          })()
        }
        if (data.queue == 1) {}
        break;
      case '_ice_candidate':
        var pc = peerconns.get(data.socketID);
        pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        break;
      case '_offer':
        var pc = peerconns.get(data.socketID);
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        pc.createAnswer(function (desc) {
          pc.setLocalDescription(desc);
          socket.send(JSON.stringify({
            event: "_answer",
            data: {
              sdp: desc,
              socketID: data.me,
              me: data.socketID
            }
          }));
        }, function (error) {
          console.log('Failure callback: ' + error);
        });
        break;
      case '_answer':
        peerconns.get(data.me).setRemoteDescription(new RTCSessionDescription(data.sdp)); //receive answer
        break;
      case "close":
        peerconns.delete(data.socketID);
        $("#" + data.socketID).remove();
        break;
      case "msg":
        $(".message").append("<p><span class=\"name other\">" + data.socketID + ": </span><span class=\"msg\">" + data.msg + "</span></p>");
        break;
      }
    }).catch(function (err) {
      console.log(err);
    });
  }
}
