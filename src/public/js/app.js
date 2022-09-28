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
    videoIcon.classList.remove("fa-video");
    videoIcon.classList.add("fa-video-slash");
    cameraOff = false;
  } else {
    videoIcon.classList.remove("fa-video-slash");
    videoIcon.classList.add("fa-video");
    cameraOff = true;
  }
}

async function handleCameraChange() {
  // 카메라를 변경하면 새로운 디바이스로 업데이트 된 video track을 받는다.
  const id = camerasSelect.options[camerasSelect.selectedIndex].id;
  await getMedia(camerasSelect.value, id);

  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];

    // Sender :  media stream track을 컨트롤 하게 해주는 역할
    myPeerConnection
      .getSenders()
      .forEach((sender) => console.log(sender.track));

    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.tack.kind === "video");

    // 변경된 비디오 트랙으로 변경
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
  // 방에 입장하면 실행되는 함수
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
  // Peer A에서 실행됨 (누군가 들어왔다고 알림을 받는 브라우저)
  // 누군가 들어오면 실행된다.
  // 이 곳에서 하는 일 : Create offer, setLocalDescription, Send offer to Peer B

  // 다양한 데이터를 주고 받을 수 있는 dataChannel 추가
  // offer 전에 생성한다.
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
  // Peer B에서 실행됨 : offer를 받는 쪽
  myPeerConnection.addEventListener("datachannel", (event) => {
    // peer A에서 보낸 새로운 dataChannel이 있을 때 이벤트를 추가함
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
  // 각 브라우저가 candidate들을 서로 주고 받음
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

  // 양쪽 브라우저에서 카메라와 마이크의 데이터 스트림을 받아서 그것들을 연결 안에 넣음
  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}
