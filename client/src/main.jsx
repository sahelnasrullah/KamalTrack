import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AreaView from './pages/AreaView.jsx';
import TrackerView from './pages/TrackerView.jsx';
import Habits from './pages/Habits.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="area/:areaId" element={<AreaView />} />
          <Route path="tracker/:trackerId" element={<TrackerView />} />
          <Route path="habits" element={<Habits />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
