/**
 * Upload Queue Manager - Enterprise-Grade Upload System
 *
 * Features:
 * - Concurrency Control: Max 2 simultaneous uploads
 * - Automatic Retry: Up to 3 retries with exponential backoff
 * - Progress Tracking: Real-time progress for all files
 * - Error Recovery: Manual retry for failed uploads
 * - Queue Management: Pause/Resume functionality
 */

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'retrying';

export interface QueuedFile {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  retryCount: number;
  error?: string;
  errorCode?: string;
  uploadedAt?: Date;
  startedAt?: Date;
}

export interface UploadQueueCallbacks {
  onFileStatusChange: (fileId: string, status: UploadStatus, progress?: number, error?: string) => void;
  onUploadComplete: (fileId: string, response: any) => void;
  onUploadError: (fileId: string, error: string, errorCode?: string) => void;
  onQueueComplete: () => void;
}

export interface UploadQueueConfig {
  maxConcurrent?: number;
  maxRetries?: number;
  timeoutMs?: number;
  baseRetryDelayMs?: number;
}

export class UploadQueueManager {
  private queue: QueuedFile[] = [];
  private activeUploads = 0;
  private isPaused = false;
  private callbacks: UploadQueueCallbacks;
  private uploadUrl: string;
  private authToken?: string;

  // Configuration
  private readonly MAX_CONCURRENT: number;
  private readonly MAX_RETRIES: number;
  private readonly TIMEOUT_MS: number;
  private readonly BASE_RETRY_DELAY_MS: number;

  constructor(
    uploadUrl: string,
    callbacks: UploadQueueCallbacks,
    config: UploadQueueConfig = {}
  ) {
    this.uploadUrl = uploadUrl;
    this.callbacks = callbacks;
    this.MAX_CONCURRENT = config.maxConcurrent ?? 2;
    this.MAX_RETRIES = config.maxRetries ?? 3;
    this.TIMEOUT_MS = config.timeoutMs ?? 300000; // 5 minutes
    this.BASE_RETRY_DELAY_MS = config.baseRetryDelayMs ?? 2000;
  }

  /**
   * Set authentication token for uploads
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Add files to the upload queue
   */
  addToQueue(files: File[]): QueuedFile[] {
    const newFiles: QueuedFile[] = files.map(file => ({
      id: this.generateId(),
      file,
      status: 'pending' as UploadStatus,
      progress: 0,
      retryCount: 0
    }));

    this.queue.push(...newFiles);

    // Start processing if not paused
    if (!this.isPaused) {
      this.processQueue();
    }

    return newFiles;
  }

  /**
   * Get current queue state
   */
  getQueue(): QueuedFile[] {
    return [...this.queue];
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    uploading: number;
    completed: number;
    failed: number;
    retrying: number;
  } {
    const stats = {
      total: this.queue.length,
      pending: 0,
      uploading: 0,
      completed: 0,
      failed: 0,
      retrying: 0
    };

    for (const file of this.queue) {
      stats[file.status]++;
    }

    return stats;
  }

  /**
   * Pause the queue (current uploads will continue)
   */
  pause(): void {
    this.isPaused = true;
    console.log('[UploadQueue] Queue paused');
  }

  /**
   * Resume the queue
   */
  resume(): void {
    this.isPaused = false;
    console.log('[UploadQueue] Queue resumed');
    this.processQueue();
  }

  /**
   * Check if queue is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Retry a specific failed file
   */
  retryFile(fileId: string): boolean {
    const file = this.queue.find(f => f.id === fileId);
    if (file && file.status === 'failed') {
      file.status = 'pending';
      file.progress = 0;
      file.retryCount = 0;
      file.error = undefined;
      file.errorCode = undefined;
      this.callbacks.onFileStatusChange(fileId, 'pending');

      if (!this.isPaused) {
        this.processQueue();
      }
      return true;
    }
    return false;
  }

  /**
   * Retry all failed files
   */
  retryAllFailed(): number {
    let count = 0;
    for (const file of this.queue) {
      if (file.status === 'failed') {
        file.status = 'pending';
        file.progress = 0;
        file.retryCount = 0;
        file.error = undefined;
        file.errorCode = undefined;
        this.callbacks.onFileStatusChange(file.id, 'pending');
        count++;
      }
    }

    if (count > 0 && !this.isPaused) {
      this.processQueue();
    }

    return count;
  }

  /**
   * Remove a file from the queue
   */
  removeFile(fileId: string): boolean {
    const index = this.queue.findIndex(f => f.id === fileId);
    if (index !== -1) {
      // Don't remove if currently uploading
      if (this.queue[index].status === 'uploading') {
        return false;
      }
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear completed files from queue
   */
  clearCompleted(): number {
    const before = this.queue.length;
    this.queue = this.queue.filter(f => f.status !== 'completed');
    return before - this.queue.length;
  }

  /**
   * Clear entire queue (except currently uploading)
   */
  clearQueue(): void {
    this.queue = this.queue.filter(f => f.status === 'uploading');
  }

  /**
   * Process the upload queue
   */
  private processQueue(): void {
    if (this.isPaused) {
      return;
    }

    // Start uploads up to the concurrency limit
    while (
      this.activeUploads < this.MAX_CONCURRENT &&
      this.queue.some(f => f.status === 'pending')
    ) {
      const nextFile = this.queue.find(f => f.status === 'pending');
      if (nextFile) {
        this.uploadFile(nextFile);
      }
    }

    // Check if queue is complete
    const stats = this.getStats();
    if (stats.pending === 0 && stats.uploading === 0 && stats.retrying === 0) {
      this.callbacks.onQueueComplete();
    }
  }

  /**
   * Upload a single file with retry logic
   */
  private async uploadFile(queuedFile: QueuedFile): Promise<void> {
    this.activeUploads++;
    queuedFile.status = 'uploading';
    queuedFile.startedAt = new Date();
    this.callbacks.onFileStatusChange(queuedFile.id, 'uploading', 0);

    try {
      await this.uploadWithRetry(queuedFile);
    } catch (error) {
      // Final failure after all retries
      queuedFile.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : 'Upload fehlgeschlagen';
      const errorCode = (error as any)?.code || 'UPLOAD_ERROR';
      queuedFile.error = errorMessage;
      queuedFile.errorCode = errorCode;
      this.callbacks.onFileStatusChange(queuedFile.id, 'failed', queuedFile.progress, errorMessage);
      this.callbacks.onUploadError(queuedFile.id, errorMessage, errorCode);
    }

    this.activeUploads--;
    this.processQueue();
  }

  /**
   * Upload with automatic retry on retryable errors
   */
  private async uploadWithRetry(queuedFile: QueuedFile): Promise<void> {
    try {
      const response = await this.performUpload(queuedFile);
      queuedFile.status = 'completed';
      queuedFile.progress = 100;
      queuedFile.uploadedAt = new Date();
      this.callbacks.onFileStatusChange(queuedFile.id, 'completed', 100);
      this.callbacks.onUploadComplete(queuedFile.id, response);
    } catch (error) {
      if (
        queuedFile.retryCount < this.MAX_RETRIES &&
        this.isRetryableError(error)
      ) {
        queuedFile.retryCount++;
        queuedFile.status = 'retrying';
        this.callbacks.onFileStatusChange(
          queuedFile.id,
          'retrying',
          queuedFile.progress,
          `Wiederholung ${queuedFile.retryCount}/${this.MAX_RETRIES}...`
        );

        // Exponential backoff
        const delay = Math.min(
          this.BASE_RETRY_DELAY_MS * Math.pow(2, queuedFile.retryCount - 1),
          10000
        );

        console.log(`[UploadQueue] Retrying ${queuedFile.file.name} in ${delay}ms (attempt ${queuedFile.retryCount}/${this.MAX_RETRIES})`);

        await this.sleep(delay);
        return this.uploadWithRetry(queuedFile);
      }
      throw error;
    }
  }

  /**
   * Perform the actual upload
   */
  private performUpload(queuedFile: QueuedFile): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('documents', queuedFile.file);

      // Set timeout
      xhr.timeout = this.TIMEOUT_MS;

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          queuedFile.progress = progress;
          this.callbacks.onFileStatusChange(queuedFile.id, 'uploading', progress);
        }
      });

      // Handle success
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            resolve({ success: true });
          }
        } else {
          // Parse error response
          let errorMessage = `Upload fehlgeschlagen (HTTP ${xhr.status})`;
          let errorCode = `HTTP_${xhr.status}`;

          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorMessage;
            errorCode = errorResponse.code || errorCode;
          } catch (e) {
            // Use default message
          }

          const error = new Error(errorMessage);
          (error as any).code = errorCode;
          (error as any).status = xhr.status;
          reject(error);
        }
      });

      // Handle network error
      xhr.addEventListener('error', () => {
        const error = new Error('Netzwerkfehler - Verbindung fehlgeschlagen');
        (error as any).code = 'NETWORK_ERROR';
        reject(error);
      });

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        const error = new Error('Upload Timeout - Die Anfrage dauerte zu lange');
        (error as any).code = 'TIMEOUT';
        reject(error);
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        const error = new Error('Upload abgebrochen');
        (error as any).code = 'ABORTED';
        reject(error);
      });

      // Open and send
      xhr.open('POST', this.uploadUrl);

      // Add auth token if available
      if (this.authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.authToken}`);
      }

      xhr.send(formData);
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Retry on network errors
    if (error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT') {
      return true;
    }

    // Retry on server errors (5xx)
    if (error?.status >= 500 && error?.status < 600) {
      return true;
    }

    // Retry on specific error codes
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'REQUEST_TIMEOUT'];
    if (retryableCodes.includes(error?.code)) {
      return true;
    }

    return false;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default UploadQueueManager;
