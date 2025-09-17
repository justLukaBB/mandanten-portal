import React, { useState, useRef } from 'react';
import { CloudArrowUpIcon, DocumentIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../config/api';

interface Client {
  id?: string;
  aktenzeichen?: string;
  _id?: string;
}

interface CreditorUploadComponentProps {
  client: Client | null;
  onUploadComplete: (documents: any[]) => void;
  showingCreditorConfirmation: boolean;
  documents: any[]
}

interface UploadedFile {
  file: File;
  id: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
}

const CreditorUploadComponent: React.FC<CreditorUploadComponentProps> = ({ client, onUploadComplete, showingCreditorConfirmation, documents }) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return `Datei "${file.name}" ist zu groß. Maximum: 10MB`;
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      return `Dateityp "${file.type}" wird nicht unterstützt. Erlaubte Formate: PDF, JPG, PNG, DOC, DOCX`;
    }

    // Check filename
    if (!/^[a-zA-Z0-9\s\-_\.\(\)]+$/i.test(file.name)) {
      return `Ungültiger Dateiname: "${file.name}". Nur Buchstaben, Zahlen und einfache Sonderzeichen erlaubt.`;
    }

    return null; // File is valid
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    // Validate each file
    Array.from(files).forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push(error);
      } else {
        validFiles.push(file);
      }
    });

    // Show validation errors
    if (errors.length > 0) {
      alert('Upload-Fehler:\n\n' + errors.join('\n'));
    }

    // Only upload valid files
    if (validFiles.length > 0) {
      const newFiles: UploadedFile[] = validFiles.map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        progress: 0,
        status: 'uploading' as const
      }));

      setUploadedFiles(prev => [...prev, ...newFiles]);

      // Upload files to server
      newFiles.forEach(uploadedFile => {
        uploadFile(uploadedFile);
      });
    }
  };

  const uploadFile = async (uploadedFile: UploadedFile) => {
    const formData = new FormData();
    formData.append('documents', uploadedFile.file);

    // Debug: Log client information
    console.log('Upload: Client Object:', client);
    console.log('Upload: Client ID:', client?.id);
    console.log('Upload: Client Aktenzeichen:', client?.aktenzeichen);
    console.log('Upload: Client _id:', client?._id);

    // Show debug info to user temporarily
    if (!client?.id && !client?.aktenzeichen && !client?._id) {
      alert('Debug: Kein Client-Objekt verfügbar! Client: ' + JSON.stringify(client));
    }

    try {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === uploadedFile.id
                ? { ...f, progress }
                : f
            )
          );
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === uploadedFile.id
                ? { ...f, progress: 100, status: 'completed' as const }
                : f
            )
          );
          // Call onUploadComplete with the response
          if (response.documents) {
            onUploadComplete(response.documents);
            setSuccessMessage(`${response.documents.length} Dokument(e) erfolgreich hochgeladen!`);
            setTimeout(() => setSuccessMessage(''), 3000);
          }
        } else {
          // Parse error response if possible
          let errorMessage = `Upload fehlgeschlagen (HTTP ${xhr.status})`;
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorMessage;
          } catch (e) {
            // Use default message if JSON parsing fails
          }

          console.error('Upload failed:', errorMessage);
          alert(`Upload Fehler: ${errorMessage}`);

          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === uploadedFile.id
                ? { ...f, status: 'error' as const }
                : f
            )
          );
        }
      });

      xhr.addEventListener('error', () => {
        setUploadedFiles(prev =>
          prev.map(f =>
            f.id === uploadedFile.id
              ? { ...f, status: 'error' as const }
              : f
          )
        );
      });

      // Use client ID, aktenzeichen, or _id as fallback
      const clientIdentifier = client?.id || client?.aktenzeichen || client?._id;

      if (!clientIdentifier) {
        throw new Error('Keine gültige Client-ID verfügbar. Bitte melden Sie sich erneut an.');
      }

      xhr.open('POST', `${API_BASE_URL}/api/clients/${clientIdentifier}/documents`);
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);

      // Show specific error message to user
      if (error instanceof Error && error.message.includes('Client-ID')) {
        alert('Fehler: ' + error.message);
      }

      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === uploadedFile.id
            ? { ...f, status: 'error' as const }
            : f
        )
      );
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Dokumente hochladen</h3>
      <p className="text-sm text-gray-600 mb-6">
        Laden Sie hier Ihre Gläubigerbriefe und anderen relevanten Dokumente hoch.
      </p>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg">
          <div className="flex items-center">
            <CheckCircleIcon className="w-5 h-5 mr-2" />
            {successMessage}
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CloudArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-sm text-gray-600 mb-2">
          Dateien hierher ziehen oder{' '}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-red-800 hover:text-blue-700 font-medium"
          >
            durchsuchen
          </button>
        </p>
        <p className="text-xs text-gray-500">
          Unterstützte Formate: PDF, JPG, PNG, DOC, DOCX (max. 10MB)
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={showingCreditorConfirmation}
          className="hidden"
        />
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Aktuell hochgeladene Dateien</h4>
          {uploadedFiles.map((uploadedFile) => (
            <div key={uploadedFile.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center flex-1 min-w-0">
                <DocumentIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {uploadedFile.file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(uploadedFile.file.size)}
                  </p>

                  {uploadedFile.status === 'uploading' && (
                    <div className="mt-1 w-full bg-gray-200 rounded-full h-1">
                      <div
                        className="bg-red-800 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${uploadedFile.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                {uploadedFile.status === 'completed' && (
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                )}
                {uploadedFile.status === 'uploading' && (
                  <div className="w-5 h-5">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  </div>
                )}
                {uploadedFile.status === 'error' && (
                  <div className="w-5 h-5 text-red-500">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <button
                  onClick={() => removeFile(uploadedFile.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Zuvor hochgeladene Dokumentes</h4>
          {documents
            .filter((doc) => !uploadedFiles.some((file) => file.file.name ===  doc.filename)) // skip current files
            .map((document) => (
              <div key={document.extracted_data?.document_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center flex-1 min-w-0">
                  <DocumentIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {document.extracted_data?.original_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default CreditorUploadComponent;