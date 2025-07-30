import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AgentLogin from './pages/AgentLogin';
import ReviewDashboard from './pages/ReviewDashboard';

const AgentApp: React.FC = () => {
  return (
    <div className="agent-app">
      <Routes>
        <Route path="/login" element={<AgentLogin />} />
        <Route path="/review/:clientId" element={<ReviewDashboard />} />
        <Route path="/dashboard" element={<Navigate to="/admin" replace />} />
        <Route path="/" element={<Navigate to="/agent/login" replace />} />
      </Routes>
    </div>
  );
};

export default AgentApp;