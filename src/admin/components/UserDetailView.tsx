import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface UserDetailProps {
  userId: string;
  onClose: () => void;
}

const UserDetailView: React.FC<UserDetailProps> = ({ userId, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            User Details: {userId}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            Detailed user view is being developed. This will show:
          </p>
          <ul className="list-disc pl-6 text-sm text-gray-600 space-y-1">
            <li>Complete user profile information</li>
            <li>All uploaded documents with processing status</li>
            <li>AI-extracted creditor data</li>
            <li>Status timeline and history</li>
            <li>Zendesk integration details</li>
            <li>Analytics and processing metrics</li>
          </ul>
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserDetailView;