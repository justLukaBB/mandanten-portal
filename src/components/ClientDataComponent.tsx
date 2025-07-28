import React from 'react';
import { UserIcon, EnvelopeIcon, PhoneIcon, MapPinIcon } from '@heroicons/react/24/outline';

interface Client {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  formData?: any;
}

interface ClientDataComponentProps {
  client: Client | null;
}

const ClientDataComponent: React.FC<ClientDataComponentProps> = ({ client }) => {
  if (!client) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Ihre Daten</h3>
        <p className="text-gray-500">Keine Kundendaten verfügbar.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Ihre Daten</h3>
      
      <div className="space-y-4">
        {(client.firstName || client.lastName) && (
          <div className="flex items-center">
            <UserIcon className="w-5 h-5 text-gray-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {client.firstName} {client.lastName}
              </p>
              <p className="text-xs text-gray-500">Name</p>
            </div>
          </div>
        )}
        
        {client.email && (
          <div className="flex items-center">
            <EnvelopeIcon className="w-5 h-5 text-gray-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-900">{client.email}</p>
              <p className="text-xs text-gray-500">E-Mail</p>
            </div>
          </div>
        )}
        
        {client.phone && (
          <div className="flex items-center">
            <PhoneIcon className="w-5 h-5 text-gray-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-900">{client.phone}</p>
              <p className="text-xs text-gray-500">Telefon</p>
            </div>
          </div>
        )}
        
        {client.address && (
          <div className="flex items-center">
            <MapPinIcon className="w-5 h-5 text-gray-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-900">{client.address}</p>
              <p className="text-xs text-gray-500">Adresse</p>
            </div>
          </div>
        )}
        
        {client.formData && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Zusätzliche Informationen</h4>
            <div className="text-sm text-gray-600">
              <pre className="whitespace-pre-wrap">{JSON.stringify(client.formData, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientDataComponent;