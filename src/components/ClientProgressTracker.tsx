import React from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';

interface Phase {
  name: string;
  description: string;
}

interface ClientProgressTrackerProps {
  currentPhase: number;
  phases: Phase[];
}

const ClientProgressTracker: React.FC<ClientProgressTrackerProps> = ({ currentPhase, phases }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Fortschritt Ihres Falls</h3>
      
      <div className="space-y-4">
        {phases.map((phase, index) => {
          const isCompleted = index < currentPhase;
          const isCurrent = index === currentPhase;
          const isUpcoming = index > currentPhase;
          
          return (
            <div key={index} className="flex items-start">
              <div className="flex-shrink-0 mr-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isCurrent
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isCompleted ? (
                    <CheckIcon className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <h4
                  className={`text-sm font-medium ${
                    isCompleted || isCurrent ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {phase.name}
                </h4>
                <p
                  className={`text-xs mt-1 ${
                    isCompleted || isCurrent ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {phase.description}
                </p>
              </div>
              
              {isCurrent && (
                <div className="flex-shrink-0 ml-2">
                  <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClientProgressTracker;