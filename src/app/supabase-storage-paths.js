export function sanitizeFileName(fileName) {
  return String(fileName || 'file')
    .replaceAll(/[\\/]/g, '')
    .replaceAll(/^\.+/g, '')
    .replaceAll(/[^\p{L}\p{N}._-]+/gu, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/_+\./g, '.')
    .replaceAll(/^_+|_+$/g, '') || 'file';
}

export function createTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(/[-:TZ.]/g, '').slice(0, 14);
}

export function createRfpFilePath({ noticeId, fileName, timestamp = createTimestamp() }) {
  return `notices/${noticeId}/${timestamp}-${sanitizeFileName(fileName)}`;
}

export function createProposalFilePath({ noticeId, supplierId, fileName, timestamp = createTimestamp() }) {
  return `notices/${noticeId}/suppliers/${supplierId}/${timestamp}-${sanitizeFileName(fileName)}`;
}
