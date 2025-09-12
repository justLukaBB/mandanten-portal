import React from "react";

export const Card = ({ children, className = "" }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`bg-white rounded-lg shadow border ${className}`}>{children}</div>
);

export const CardHeader = ({ children, className = "" }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-4 border-b ${className}`}>{children}</div>
);

export const CardTitle = ({ children, className = "" }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>
);

export const CardDescription = ({ children, className = "" }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-gray-500 ${className}`}>{children}</p>
);

export const CardContent = ({ children, className = "" }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-4 ${className}`}>{children}</div>
);
