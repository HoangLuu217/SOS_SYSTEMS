const { File } = require('../models');
const ApiError = require('../utils/apiError');

const uploadFile = async (uploadedBy, fileData) => {
  const { sosId, type, url, fileName, fileSize } = fileData;
  const newFile = await File.create({
    sosId: sosId || null,
    uploadedBy,
    type,
    url,
    fileName,
    fileSize
  });
  return newFile;
};

const getFileById = async (id) => {
  const file = await File.findById(id).populate('uploadedBy', 'fullName');
  if (!file) throw new ApiError(404, 'Không tìm thấy file');
  return file;
};

const getFilesBySosId = async (sosId) => {
  return await File.find({ sosId }).sort({ createdAt: -1 });
};

const deleteFile = async (id, userId, userRoles) => {
  const file = await getFileById(id);
  
  // Chỉ người upload hoặc ADMIN mới được xóa file
  if (file.uploadedBy._id.toString() !== userId.toString() && !userRoles.includes('ADMIN')) {
    throw new ApiError(403, 'Bạn không có quyền xóa file này');
  }

  await file.deleteOne();
  return file;
};

module.exports = {
  uploadFile,
  getFileById,
  getFilesBySosId,
  deleteFile
};
