import React from "react";
import { Navigate } from "react-router-dom";

const NotFound: React.FC = () => {
  const token = localStorage.getItem("auth_token");
  const role = localStorage.getItem("active_role");

  if (token && role) {
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "agent") return <Navigate to="/agent/dashboard" replace />;
    if (role === "portal") return <Navigate to={`/`} replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-4xl font-bold text-red-600">404 - Page Not Found</h1>
    </div>
  );
};

export default NotFound;
