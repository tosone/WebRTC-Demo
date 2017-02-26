'use strict'

const http = require("http");
const uuid = require("uuid");
const util = require("util");
const fs = require("fs");
const url = require('url');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000; //端口
const dist = "./"; //根目录
const mine = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".js": "text/javascript",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".swf": "application/x-shockwave-flash",
  ".tiff": "image/tiff",
  ".txt": "text/plain",
  ".wav": "audio/x-wav",
  ".wma": "audio/x-ms-wma",
  ".wmv": "video/x-ms-wmv",
  ".xml": "text/xml",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".exe": "application/octet-stream",
  ".md": "text/x-markdown"
};
const default_visit_list = ["index.html", "index.htm", "default.html", "default.htm"];

let default_visit = (request, response, default_visit_file_list, i) => {
  fs.exists(path.join(__dirname, dist, url.parse(request.url).pathname, default_visit_file_list[i]), function (exists) {
    if (exists) { //若index.html存在
      fs.readFile(path.join(__dirname, dist, url.parse(request.url).pathname, default_visit_file_list[i]), "binary", function (err, file) {
        response.writeHead(200, {
          'Content-Type': mine[".html"] || "text/plain"
        });
        response.write(file, "binary");
        response.end();
      });
    } else { //若index.html不存在
      if (default_visit_file_list.length - 1 == i) {
        console.log("\x1B[31mERROR\x1B[39m: " + default_visit_file_list[0] + " is not exists.");
        file_not_found
          (response, request);
      } else {
        default_visit(request, response, default_visit_list, i + 1);
      }
    }
  });
}

let file_not_found = (response, request) => {
  response.writeHead(404, {
    'Content-Type': 'text/plain'
  });
  response.write("This request URL " + url.parse(request.url).pathname + " was not found on this server.");
  response.end();
}

let server = http.createServer((request, response) => {
  let realPath = path.join(__dirname, dist, url.parse(request.url).pathname);
  if (url.parse(request.url).pathname == "/" || url.parse(request.url).pathname.split("/")[url.parse(request.url).pathname.split("/").length - 1].indexOf(".") == -1) { //访问目录为 "/"
    default_visit(request, response, default_visit_list, 0);
  } else { //指定路径
    let ext = path.extname(realPath);
    fs.exists(realPath, exists => {
      if (!exists) { //指定路径的文件不存在
        console.log("\x1B[31mERROR\x1B[39m: " + realPath + " is not exists.");
        file_not_found(response, request);
      } else { //指定路径的文件存在
        fs.readFile(realPath, "binary", (err, file) => {
          response.writeHead(200, {
            'Content-Type': mine[ext] || "text/plain"
          });
          response.write(file, "binary");
          response.end();
        });
      }
    });
  }
});

server.listen(PORT);

server.on('listening', () => {
  console.log("Server runing at http://127.0.0.1:" + server.address().port + ".");
});

server.on('error', () => {
  console.log("Server Listen on " + PORT + " error.");
});

let sockets = new Map();
let socketsID = new Set();

let wss = new WebSocket.Server({ server: server });

wss.on('connection', socket => {
  socket.id = uuid.v4().split("-").join('');
  console.log('connection ' + sockets.size);
  socket.send(JSON.stringify({
    event: "peers",
    data: {
      queue: sockets.size + 1,
      socketID: socket.id,
      socketsID: Array.from(socketsID)
    }
  }));
  for (let item of sockets.entries()) {
    item[1].send(JSON.stringify({
      event: "new_peer",
      data: {
        socketID: socket.id,
        me: item[1].id
      }
    }));
  }

  sockets.set(socket.id, socket);
  socketsID.add(socket.id);
  socket.on('message', msg => {
    console.log(JSON.parse(msg).event + ": " + socket.id + " ---> " + sockets.get(JSON.parse(msg).data.socketID).id);
    if (JSON.parse(msg).event === "msg") {
      for (let item of sockets.entries()) {
        if (item[0] == JSON.parse(msg).data.socketID) continue;
        item[1].send(msg);
      }
    } else {
      sockets.get(JSON.parse(msg).data.socketID).send(msg);
    }
  });
  socket.on("close", () => {
    console.log("delete " + socket.id);
    sockets.delete(socket.id);
    socketsID.delete(socket.id);
    for (let item of sockets.entries()) {
      item[1].send(JSON.stringify({
        event: "close",
        data: {
          socketID: socket.id
        }
      }));
    }
  })
});
