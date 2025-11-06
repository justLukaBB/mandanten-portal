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
  documents: any[];
  previewFile: {
    loading?: boolean;
    url?: string;
    name?: string;
    type?: string;
  } | null;
  setPreviewFile: React.Dispatch<
    React.SetStateAction<{
      loading?: boolean;
      url?: string;
      name?: string;
      type?: string;
    } | null>
  >;
}

interface UploadedFile {
  file: File;
  id: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
}

const CreditorUploadComponent: React.FC<CreditorUploadComponentProps> = ({
  client,
  onUploadComplete,
  showingCreditorConfirmation,
  documents,
  previewFile,
  setPreviewFile,
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

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
            setTimeout(() => setSuccessMessage(''), 6000);
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

  const handlePreview = async (fileOrDocument: any) => {
  try {
    setPreviewFile({ loading: true });

    // 🧩 Case 1: Local uploaded file (not yet saved on backend)
    if (fileOrDocument.file instanceof File) {
      const file = fileOrDocument.file;
      const objectUrl = URL.createObjectURL(file);

      setPreviewFile({
        loading: false,
        url: objectUrl,
        name: file.name,
        type: file.type,
      });
      return;
    }

    // 🧩 Case 2: Existing document from backend
    if (!client?.id || !fileOrDocument.id) throw new Error("Invalid document reference");

    const token = localStorage.getItem("token");
    const fileUrl = `${API_BASE_URL}/api/agent-review/${client.id}/document/${fileOrDocument.id}/file`;

    const res = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to load file");

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const contentType = res.headers.get("Content-Type") || blob.type || "application/pdf";
    const contentDisposition = res.headers.get("Content-Disposition");
    const nameMatch = contentDisposition?.match(/filename="(.+)"/);
    const fileName = nameMatch ? nameMatch[1] : `document-${fileOrDocument.id}`;

    setPreviewFile({
      loading: false,
      url: objectUrl,
      name: fileName,
      type: contentType,
    });
  } catch (err) {
    console.error("❌ Preview failed:", err);
    alert("Unable to load preview. Please try again.");
    setPreviewFile(null);
  }
};


  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Dokumente hochladen</h3>
      <p className="text-sm text-gray-600 mb-6">
        Laden Sie hier Ihre Gläubigerbriefe und anderen relevanten Dokumente hoch.
      </p>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 flex justify-center">
          <div className="max-w-md w-full p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mr-4">
                <CheckCircleIcon className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-green-900 mb-1">
                  Erfolgreich hochgeladen
                </h4>
                <p className="text-sm text-green-700">
                  Ihre Dokumente wurden erfolgreich verarbeitet und gespeichert.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${showingCreditorConfirmation ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          } ${isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        onDragOver={showingCreditorConfirmation ? undefined : handleDragOver}
        onDragLeave={showingCreditorConfirmation ? undefined : handleDragLeave}
        onDrop={showingCreditorConfirmation ? undefined : handleDrop}
        onClick={() => !showingCreditorConfirmation && fileInputRef.current?.click()}
      >
        <CloudArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-sm text-gray-600 mb-2">
          Dateien hierher ziehen oder{' '}
          <span className="text-red-800 font-medium">
            hier klicken zum Durchsuchen
          </span>
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
            <div
              key={uploadedFile.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer
              hover:bg-gray-100 transition-colors duration-200 border border-transparent hover:border-gray-200"
              onClick={() => handlePreview(uploadedFile)}
            >
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
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(uploadedFile.id);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showingCreditorConfirmation && documents.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Bereits erfolgreich hochgeladene Dokumente:</h4>
          {documents
            .filter((doc) => !uploadedFiles.some((file) => file.file.name === doc.filename)) // skip current files
            .map((document) => (
              <div 
                key={document.extracted_data?.document_id} 
                onClick={() => handlePreview(document)} 
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer
                hover:bg-gray-100 transition-colors duration-200 border border-transparent hover:border-gray-200"
              >
                <div className="flex items-center flex-1 min-w-0">
                  <DocumentIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {document.extracted_data?.original_name || document.name}
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

      {/* Success Banner at Bottom */}
      {!showingCreditorConfirmation && documents.length > 0 && (
        <div className="mt-8 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="w-6 h-6 text-green-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Ihre Dokumente wurden erfolgreich hochgeladen
              </p>
              <p className="text-xs text-green-700 mt-1">
                {documents.length} {documents.length === 1 ? 'Dokument' : 'Dokumente'} gespeichert und werden verarbeitet
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-xl w-11/12 md:w-3/4 lg:w-1/2 p-4 relative">
            <button
              onClick={() => setPreviewFile(null)}
              className="absolute top-3 right-3 text-gray-600 hover:text-black"
            >
              ✕
            </button>

            {/* Show loader while previewFile.loading is true */}
            {previewFile.loading ? (
              <div className="flex flex-col items-center justify-center p-10">
                <div className="w-10 h-10 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="mt-4 text-sm text-gray-600">Loading preview...</p>
              </div>
            ) : previewFile.url ? (
              <>
                {previewFile.type?.includes("image") ? (
                  <img
                    src={previewFile.url}
                    alt="Preview"
                    className="max-h-[70vh] w-full object-contain"
                  />
                ) : previewFile.type === "application/pdf" ? (
                  <iframe
                    src={previewFile.url}
                    className="w-full h-[80vh] rounded-lg"
                    title="PDF Preview"
                  />
                ) : (
                  <p className="text-center text-gray-600 p-6">
                    Preview not supported for this file type.
                    <br />
                    <a
                      href={previewFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      Download file
                    </a>
                  </p>
                )}
              </>
            ) : (
              <p className="text-center text-gray-600 p-6">No preview available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditorUploadComponent;