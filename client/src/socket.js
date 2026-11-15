import { io } from 'socket.io-client';

// 💡 현재 로컬(내 컴퓨터)에서 테스트 중이므로 백엔드 로컬 주소(3000번 포트)를 적어줍니다.
// 나중에 Render에 배포된 서버와 연결할 때는 이 부분을 Render URL로 바꾸면 됩니다.
const SERVER_URL = 'http://localhost:3000'; 

// 반드시 'export const socket' 형태로 내보내야 App.jsx에서 import { socket }으로 받을 수 있습니다.
export const socket = io(SERVER_URL);