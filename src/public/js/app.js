const socket = io();

const header = document.querySelector("header");
const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");

const call = document.getElementById("call");
const subject = document.getElementById("subject-title");
const prevBtn = document.getElementById("prev-btn");
const voiceIcon = document.getElementsByClassName("fa-microphone")[0];
const videoIcon = document.getElementsByClassName("fa-video")[0];

call.hidden = true;

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection;
let myDataChannel;

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];

    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label == camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

async function getScreens() {
  const screen = await navigator.mediaDevices.getUserMedia({
    video: { mediaSource: "screen" },
  });
  const screenId = screen.id;
  const option = document.createElement("option");
  option.value = screenId;
  option.id = "screen";
  option.innerText = "Screen Share";

  camerasSelect.appendChild(option);
}

async function getMedia(deviceId, id) {
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" },
  };

  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };

  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId && id === "camera" ? cameraConstraints : initialConstrains
    );

    if (id === "screen") {
      myStream = await navigator.mediaDevices.getDisplayMedia({
        cursur: true,
        audio: true,
        video: true,
      });
    }

    myFace.srcObject = myStream;

    if (!deviceId) {
      await getCameras();
      await getScreens();
    }
  } catch (e) {
    console.log(e);
  }
}

function handleMuteClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));

  if (!muted) {
    voiceIcon.classList.remove("fa-microphone");
    voiceIcon.classList.add("fa-microphone-slash");
    muted = true;
  } else {
    voiceIcon.classList.remove("fa-microphone-slash");
    voiceIcon.classList.add("fa-microphone");
    muted = false;
  }
}

function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));

  if (cameraOff) {
    videoIcon.classList.remove("fa-video-slash");
    videoIcon.classList.add("fa-video");
    cameraOff = false;
  } else {
    videoIcon.classList.remove("fa-video");
    videoIcon.classList.add("fa-video-slash");
    cameraOff = true;
  }
}

async function handleCameraChange() {
  // ???????????? ???????????? ????????? ??????????????? ???????????? ??? video track??? ?????????.
  const id = camerasSelect.options[camerasSelect.selectedIndex].id;
  await getMedia(camerasSelect.value, id);

  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];

    // Sender :  media stream track??? ????????? ?????? ????????? ??????
    myPeerConnection
      .getSenders()
      .forEach((sender) => console.log(sender.track));

    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.tack.kind === "video");

    // ????????? ????????? ???????????? ??????
    videoSender.replaceTrack(videoTrack);
  }
}

function goHome() {
  location.replace("/");
}

mute.addEventListener("click", handleMuteClick);
camera.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);
prevBtn.addEventListener("click", goHome);

// Welcome Form (join a room)
const welcome = document.getElementById("welcome");
const welcomeForm = welcome.querySelector("form");

async function initCall(roomName) {
  // ?????? ???????????? ???????????? ??????
  welcome.hidden = true;
  call.hidden = false;
  header.hidden = true;
  subject.innerText = roomName;

  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();

  const input = welcomeForm.querySelector("input");
  await initCall(input.value);
  socket.emit("join_room", input.value);
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

// Socket Code
socket.on("welcome", async () => {
  // Peer A?????? ????????? (????????? ??????????????? ????????? ?????? ????????????)
  // ????????? ???????????? ????????????.
  // ??? ????????? ?????? ??? : Create offer, setLocalDescription, Send offer to Peer B

  // ????????? ???????????? ?????? ?????? ??? ?????? dataChannel ??????
  // offer ?????? ????????????.
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => console.log(event.data));
  console.log("made data channel");

  // create Offer
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  console.log("sent the offer");
  socket.emit("offer", offer, roomName);
});

socket.on("offer", async (offer) => {
  // Peer B?????? ????????? : offer??? ?????? ???
  myPeerConnection.addEventListener("datachannel", (event) => {
    // peer A?????? ?????? ????????? dataChannel??? ?????? ??? ???????????? ?????????
    myDataChannel = event.channel;
    myDataChannel.addEventListener("message", (event) =>
      console.log(event.data)
    );
  });

  console.log("recieved the offer");
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName);
  console.log("send the answer");
});

socket.on("answer", (answer) => {
  console.log("recived the answer");
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

// RTC Code
function handleIce(data) {
  // ??? ??????????????? candidate?????? ?????? ?????? ??????
  console.log("sent candidate");
  socket.emit("ice", data.candidate, roomName);
}

function handleAddStream(data) {
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = data.stream;
}

function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  }); // Create peerConnection
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);

  // ?????? ?????????????????? ???????????? ???????????? ????????? ???????????? ????????? ???????????? ?????? ?????? ??????
  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}
