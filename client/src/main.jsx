import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// index.html의 id가 'root'인 요소에 App 컴포넌트를 렌더링합니다.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);