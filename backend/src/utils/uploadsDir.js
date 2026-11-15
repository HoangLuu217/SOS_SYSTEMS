const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_UPLOADS_DIR = path.join(__dirname, '../../uploads');
const TMP_UPLOADS_DIR = path.join(os.tmpdir(), 'sos-systems-uploads');

const isReadOnlyRuntime = () =>
  Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * Resolves the uploads directory path without performing eager filesystem writes on serverless.
 */
function getLocalUploadsDir() {
  if (isReadOnlyRuntime()) {
    return TMP_UPLOADS_DIR;
  }
  return REPO_UPLOADS_DIR;
}

/**
 * Ensures a writable uploads directory exists, falling back to OS temp storage if repo disk is read-only.
 */
function ensureLocalUploadsDir() {
  const preferredDir = getLocalUploadsDir();
  try {
    if (!fs.existsSync(preferredDir)) {
      fs.mkdirSync(preferredDir, { recursive: true });
    }
    return preferredDir;
  } catch (err) {
    if (preferredDir !== TMP_UPLOADS_DIR) {
      if (!fs.existsSync(TMP_UPLOADS_DIR)) {
        fs.mkdirSync(TMP_UPLOADS_DIR, { recursive: true });
      }
      return TMP_UPLOADS_DIR;
    }
    throw err;
  }
}

module.exports = {
  getLocalUploadsDir,
  ensureLocalUploadsDir,
};

