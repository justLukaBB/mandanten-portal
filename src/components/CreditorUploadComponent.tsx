import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CloudArrowUpIcon, DocumentIcon, XMarkIcon, CheckCircleIcon, DocumentTextIcon, MagnifyingGlassPlusIcon, ArrowsPointingOutIcon, MagnifyingGlassMinusIcon, ArrowPathIcon, PauseIcon, PlayIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../config/api';
import { UploadQueueManager, QueuedFile, UploadStatus } from '../utils/uploadQueue';

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

interface DisplayFile {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  retryCount?: number;
}

const CreditorUploadComponent: React.FC<CreditorUploadComponentProps> = ({
  client,
  onUploadComplete,
  showingCreditorConfirmation,
  documents,
  previewFile,
  setPreviewFile,
}) => {
  const [displayFiles, setDisplayFiles] = useState<DisplayFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isPaused, setIsPaused] = useState(false);
  const [queueStats, setQueueStats] = useState({ total: 0, completed: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueManagerRef = useRef<UploadQueueManager | null>(null);
  const [zoom, setZoom] = useState(1);

  // Initialize queue manager
  useEffect(() => {
    const clientIdentifier = client?.id || client?.aktenzeichen || client?._id;
    if (!clientIdentifier) {
      return;
    }

    const uploadUrl = `${API_BASE_URL}/api/clients/${clientIdentifier}/documents`;

    queueManagerRef.current = new UploadQueueManager(uploadUrl, {
      onFileStatusChange: (fileId, status, progress, error) => {
        setDisplayFiles(prev =>
          prev.map(f =>
            f.id === fileId
              ? { ...f, status, progress: progress ?? f.progress, error }
              : f
          )
        );
        updateStats();
      },
      onUploadComplete: (fileId, response) => {
        console.log(`[Upload] File ${fileId} completed:`, response);
        updateStats();
      },
      onUploadError: (fileId, error, errorCode) => {
        console.error(`[Upload] File ${fileId} failed:`, error, errorCode);
        updateStats();
      },
      onQueueComplete: () => {
        const stats = queueManagerRef.current?.getStats();
        if (stats && stats.completed > 0) {
          setSuccessMessage(`${stats.completed} Dokument(e) erfolgreich hochgeladen!`);
          setTimeout(() => setSuccessMessage(''), 6000);
        }
      }
    }, {
      maxConcurrent: 2,
      maxRetries: 3,
      timeoutMs: 300000, // 5 minutes
      baseRetryDelayMs: 2000
    });

    return () => {
      queueManagerRef.current = null;
    };
  }, [client?.id, client?.aktenzeichen, client?._id]);

  const updateStats = useCallback(() => {
    if (queueManagerRef.current) {
      const stats = queueManagerRef.current.getStats();
      setQueueStats({
        total: stats.total,
        completed: stats.completed,
        failed: stats.failed
      });
    }
  }, []);

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
    if (!/^[a-zA-Z0-9\s\-_.()]+$/i.test(file.name)) {
      return `Ungültiger Dateiname: "${file.name}". Nur Buchstaben, Zahlen und einfache Sonderzeichen erlaubt.`;
    }

    return null;
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || !queueManagerRef.current) {
      return;
    }

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

    // Add valid files to queue
    if (validFiles.length > 0) {
      const queuedFiles = queueManagerRef.current.addToQueue(validFiles);

      // Add to display files
      const newDisplayFiles: DisplayFile[] = queuedFiles.map(qf => ({
        id: qf.id,
        file: qf.file,
        progress: 0,
        status: 'pending' as UploadStatus,
        retryCount: 0
      }));

      setDisplayFiles(prev => [...prev, ...newDisplayFiles]);
      updateStats();
    }
  };

  const handlePauseResume = () => {
    if (!queueManagerRef.current) {
      return;
    }

    if (isPaused) {
      queueManagerRef.current.resume();
      setIsPaused(false);
    } else {
      queueManagerRef.current.pause();
      setIsPaused(true);
    }
  };

  const handleRetryFile = (fileId: string) => {
    if (queueManagerRef.current?.retryFile(fileId)) {
      setDisplayFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'pending', progress: 0, error: undefined }
            : f
        )
      );
    }
  };

  const handleRetryAllFailed = () => {
    if (queueManagerRef.current) {
      const count = queueManagerRef.current.retryAllFailed();
      if (count > 0) {
        setDisplayFiles(prev =>
          prev.map(f =>
            f.status === 'failed'
              ? { ...f, status: 'pending', progress: 0, error: undefined }
              : f
          )
        );
      }
    }
  };

  const removeFile = (fileId: string) => {
    if (queueManagerRef.current?.removeFile(fileId)) {
      setDisplayFiles(prev => prev.filter(f => f.id !== fileId));
      updateStats();
    }
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
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'uploading':
        return (
          <div className="w-5 h-5">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        );
      case 'retrying':
        return (
          <div className="w-5 h-5">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500"></div>
          </div>
        );
      case 'failed':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
      case 'pending':
      default:
        return (
          <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
        );
    }
  };

  const getStatusColor = (status: UploadStatus): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'uploading':
        return 'bg-blue-500';
      case 'retrying':
        return 'bg-yellow-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  const handlePreview = async (fileOrDocument: any) => {
    try {
      setPreviewFile({ loading: true });

      // Case 1: Local uploaded file (not yet saved on backend)
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

      // Case 2: Existing document from backend
      if (!client?.id || !fileOrDocument.id) {
        throw new Error("Invalid document reference");
      }

      const token = localStorage.getItem("token");
      const fileUrl = `${API_BASE_URL}/api/agent-review/${client.id}/document/${fileOrDocument.id}/file`;

      const res = await fetch(fileUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to load file");
      }

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
      console.error("Preview failed:", err);
      alert("Unable to load preview. Please try again.");
      setPreviewFile(null);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  // Calculate active uploads count
  const activeUploads = displayFiles.filter(f =>
    f.status === 'uploading' || f.status === 'retrying' || f.status === 'pending'
  ).length;
  const failedUploads = displayFiles.filter(f => f.status === 'failed').length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Dokumente hochladen</h3>
      <p className="text-sm text-gray-600 mb-6">
        Laden Sie hier Ihre Glaubigerbriefe und anderen relevanten Dokumente hoch.
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
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
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
          className="hidden"
        />
      </div>

      {/* Queue Controls */}
      {displayFiles.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{queueStats.completed}</span> von{' '}
            <span className="font-medium">{displayFiles.length}</span> hochgeladen
            {failedUploads > 0 && (
              <span className="text-red-600 ml-2">
                ({failedUploads} fehlgeschlagen)
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {failedUploads > 0 && (
              <button
                onClick={handleRetryAllFailed}
                className="flex items-center px-3 py-1.5 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4 mr-1" />
                Alle wiederholen
              </button>
            )}
            {activeUploads > 0 && (
              <button
                onClick={handlePauseResume}
                className={`flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isPaused
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {isPaused ? (
                  <>
                    <PlayIcon className="w-4 h-4 mr-1" />
                    Fortsetzen
                  </>
                ) : (
                  <>
                    <PauseIcon className="w-4 h-4 mr-1" />
                    Pause
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Uploaded Files List */}
      {displayFiles.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Aktuell hochgeladene Dateien</h4>
          {displayFiles.map((uploadedFile) => (
            <div
              key={uploadedFile.id}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors duration-200 border ${
                uploadedFile.status === 'failed'
                  ? 'bg-red-50 border-red-200 hover:bg-red-100'
                  : 'bg-gray-50 border-transparent hover:bg-gray-100 hover:border-gray-200'
              }`}
              onClick={() => handlePreview(uploadedFile)}
            >
              <div className="flex items-center flex-1 min-w-0">
                <DocumentIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {uploadedFile.file.name}
                  </p>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs text-gray-500">
                      {formatFileSize(uploadedFile.file.size)}
                    </p>
                    {uploadedFile.error && (
                      <p className="text-xs text-red-600 truncate">
                        {uploadedFile.error}
                      </p>
                    )}
                  </div>

                  {(uploadedFile.status === 'uploading' || uploadedFile.status === 'retrying') && (
                    <div className="mt-1 w-full bg-gray-200 rounded-full h-1">
                      <div
                        className={`h-1 rounded-full transition-all duration-300 ${getStatusColor(uploadedFile.status)}`}
                        style={{ width: `${uploadedFile.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                {uploadedFile.status === 'uploading' && (
                  <span className="text-xs text-gray-500">{uploadedFile.progress}%</span>
                )}
                {getStatusIcon(uploadedFile.status)}
                {uploadedFile.status === 'failed' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetryFile(uploadedFile.id);
                    }}
                    className="p-1 text-yellow-600 hover:text-yellow-700 transition-colors"
                    title="Erneut versuchen"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                )}
                {uploadedFile.status !== 'uploading' && uploadedFile.status !== 'retrying' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(uploadedFile.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Bereits erfolgreich hochgeladene Dokumente:</h4>
          {documents
            .filter((doc) => !displayFiles.some((file) => file.file.name === doc.filename))
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col w-10/12 md:w-2/3 lg:w-1/2
 h-[90vh] relative">
            {/* Close button */}
            <button
              onClick={() => {
                setPreviewFile(null)
                setZoom(1)
              }}
              className="absolute top-1 right-2 text-gray-600 hover:text-black z-10"
            >
              X
            </button>

            {/* Header with controls */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <DocumentTextIcon className="h-6 w-6 text-gray-300 mx-auto mb-4" />
                <div>
                  <h3 className="text-sm font-medium text-gray-900">
                    {previewFile.name || "Preview Document"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {previewFile.type || "Unknown type"}
                  </p>
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center space-x-1 mt-1">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Zoom Out"
                >
                  <MagnifyingGlassMinusIcon className="h-4 w-4 text-gray-600" />
                </button>

                <span className="text-xs text-gray-600 text-center">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Zoom In"
                >
                  <MagnifyingGlassPlusIcon className="h-4 w-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Document content */}
            <div className="flex-1 overflow-auto p-4 flex justify-center items-center bg-gray-50">
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
                      className="max-h-[80vh] object-contain border rounded shadow-sm"
                      style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                    />
                  ) : previewFile.type === "application/pdf" ? (
                    <iframe
                      src={previewFile.url}
                      className="w-full h-full min-h-[80vh] border rounded"
                      style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                      title="PDF Preview"
                    />
                  ) : (
                    <p className="text-center text-gray-600 p-6">
                      Preview not supported for this file type.{" "}
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
        </div>
      )}

    </div>
  );
};

export default CreditorUploadComponent;
