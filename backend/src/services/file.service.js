const { File, SosRequest } = require('../models');
const ApiError = require('../utils/apiError');

const uploadFile = async (uploadedBy, fileData) => {
  const { sosId, type, url, fileName, fileSize, purpose } = fileData;
  const newFile = await File.create({
    sosId: sosId || null,
    uploadedBy,
    type,
    url,
    fileName,
    fileSize
  });

  if (sosId && url && SosRequest) {
    try {
      if (purpose === 'PROOF') {
        // Ảnh do đội cứu hộ chụp nghiệm thu / bàn giao -> lưu vào proofImages, không thêm vào images người dân
        await SosRequest.findByIdAndUpdate(sosId, {
          $addToSet: { proofImages: url },
          $pull: { images: url },
        });
      } else {
        await SosRequest.findByIdAndUpdate(sosId, {
          $addToSet: { images: url }
        });
      }
    } catch (err) {
      console.warn('Lỗi cập nhật ảnh vào SosRequest:', err);
    }
  }

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
