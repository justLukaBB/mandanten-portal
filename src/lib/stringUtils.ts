export const truncateFilename = (
  filename: string,
  maxLength: number = 10
): string => {
  if (!filename) return '';
  if (filename.length <= maxLength) return filename;

  const parts = filename.split('.');
  if (parts.length > 1) {
    const ext = parts.pop();
    if (ext) {
      const name = parts.join('.');
      
      const available = maxLength - ext.length - 4;
      if (available > 1 && name.length > available) {
        const half = Math.floor(available / 2);
        return `${name.slice(0, half)}...${name.slice(-half)}.${ext}`;
      }
    }
  }

  return filename.slice(0, maxLength - 3) + '...';
};
