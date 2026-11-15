const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');

const globalCache = global.__sosMongooseCache || { conn: null, promise: null };
global.__sosMongooseCache = globalCache;

/**
 * Connects to MongoDB cleanly and caches the active connection across requests/invocations.
 */
async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const isHostedCloud = Boolean(
    process.env.VERCEL || process.env.RENDER || process.env.AWS_LAMBDA_FUNCTION_NAME
  );
  const mongoUri =
    process.env.MONGODB_URI || (!isHostedCloud ? 'mongodb://localhost:27017/sos_systems' : '');

  if (!mongoUri) {
    throw new ApiError(503, 'Máy chủ chưa cấu hình biến môi trường MONGODB_URI.');
  }

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (!globalCache.promise) {
    globalCache.promise = mongoose
      .connect(mongoUri, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        maxPoolSize: isServerless ? 2 : 15,
        minPoolSize: isServerless ? 0 : 2,
        maxIdleTimeMS: isServerless ? 10000 : 120000,
      })
      .then((mongooseInstance) => {
        globalCache.conn = mongooseInstance.connection;
        return globalCache.conn;
      })
      .catch((error) => {
        globalCache.promise = null;
        globalCache.conn = null;
        throw error;
      });
  }

  return globalCache.promise;
}

module.exports = {
  connectDatabase,
};

