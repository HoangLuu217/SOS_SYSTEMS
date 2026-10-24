const mongoose = require("mongoose");

/**
 * Model: Equipment (Vat tu / Trang thiet bi doi cuu ho)
 *
 * Vat tu duoc cap phat tu Co quan chu quan (AuthorityOrganization)
 * cho Doi cuu ho (RescueTeam). Khong giao ca nhan - dung chung ca doi
 * khi thi hanh nhiem vu.
 *
 * Luu y:
 *   - Vat tu tai su dung: co serialNumber, theo doi tung cai
 *   - Vat tu tieu hao:    khong co serialNumber, quan ly theo quantity
 */
const equipmentSchema = new mongoose.Schema(
  {
    // Doi cuu ho so huu vat tu nay
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RescueTeam",
      required: [true, "Doi cuu ho (teamId) la bat buoc"],
    },

    // Co quan cap phat vat tu
    providedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthorityOrganization",
      default: null,
    },

    // Ngay doi nhan vat tu tu co quan
    receivedAt: {
      type: Date,
      default: null,
    },

    // Ten vat tu
    name: {
      type: String,
      required: [true, "Ten vat tu la bat buoc"],
      trim: true,
      maxlength: [150, "Ten vat tu khong qua 150 ky tu"],
    },

    // Phan loai vat tu
    category: {
      type: String,
      required: [true, "Danh muc vat tu la bat buoc"],
      enum: {
        values: [
          "LIFE_VEST",      // Ao phao
          "MEDICAL_KIT",    // Tui y te
          "COMMUNICATION",  // Bo dam, thiet bi lien lac
          "LIGHTING",       // Den pin, den chieu sang
          "ROPE_TOOL",      // Day thua, dung cu leo tree
          "SHELTER",        // Leu trai, bat
          "PPE",            // Bao ho ca nhan (mu, gang, kinh)
          "FOOD_WATER",     // Luong kho, binh nuoc
          "OTHER",
        ],
        message: "Danh muc vat tu {VALUE} khong hop le",
      },
    },

    // Vat tu tai su dung: co serialNumber
    // Vat tu tieu hao (bang, thuoc, luong kho): de null
    serialNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    // So luong hien con trong kho doi
    quantity: {
      type: Number,
      required: [true, "So luong la bat buoc"],
      min: [0, "So luong khong duoc am"],
      default: 1,
    },

    // Don vi tinh
    unit: {
      type: String,
      trim: true,
      default: "cai",
    },

    // Trang thai cua vat tu
    status: {
      type: String,
      enum: {
        values: [
          "AVAILABLE",    // Co san, dung duoc
          "IN_USE",       // Dang duoc doi dung trong nhiem vu
          "MAINTENANCE",  // Dang bao tri / sua chua
          "DAMAGED",      // Hu hong, khong dung duoc
          "LOST",         // Mat mat
          "EXPIRED",      // Het han su dung
        ],
        message: "Trang thai vat tu {VALUE} khong hop le",
      },
      default: "AVAILABLE",
    },

    // Ngay het han su dung (ao phao, thuoc, binh chua chay)
    expiryDate: {
      type: Date,
      default: null,
    },

    // Ghi chu (nguon goc, tinh trang chi tiet, li do hong/mat)
    note: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "equipments",
  }
);

// Indexes
equipmentSchema.index({ teamId: 1 });
equipmentSchema.index({ providedBy: 1 });
equipmentSchema.index({ category: 1 });
equipmentSchema.index({ status: 1 });
// sparse: true vi vat tu tieu hao khong co serialNumber
equipmentSchema.index({ serialNumber: 1 }, { sparse: true });

module.exports = mongoose.model("Equipment", equipmentSchema);
