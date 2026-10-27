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
    // Doi cuu ho so huu vat tu nay (null neu o Kho tong du tru)
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RescueTeam",
      default: null,
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
          "LIFE_SAVING",    // Tuong thich cu (Cuu sinh)
          "MEDICAL_KIT",    // Tui y te
          "MEDICAL_DEVICE", // Thiet bi y te (May soc tim, ...)
          "COMMUNICATION",  // Bo dam, thiet bi lien lac
          "LIGHTING",       // Den pin, den chieu sang
          "ROPE_TOOL",      // Day thua, dung cu leo tree
          "TOOL",           // Dung cu cuu ho (may cua, ...)
          "VEHICLE_ACCESSORY", // Phu kien phuong tien (mai cheo, bom...)
          "SHELTER",        // Leu trai, bat
          "PPE",            // Bao ho ca nhan (mu, gang, kinh)
          "FOOD_WATER",     // Luong kho, nuoc uong
          "WATER_PURIFICATION", // Vien loc nuoc, hoa chat khu khuan
          "MEDICAL_SUPPLY", // Bong bang, thuoc men tieu hao
          "FUEL",           // Xang, dau chay may
          "HYGIENE",        // Nhu yeu pham, ve sinh
          "OTHER",
        ],
        message: "Danh muc vat tu {VALUE} khong hop le",
      },
    },

    // Loai vat tu: DURABLE (Trang thiet bi / Khi tai tai su dung) hoac CONSUMABLE (Vat tu tieu hao / Cuu tro)
    supplyType: {
      type: String,
      enum: ["DURABLE", "CONSUMABLE"],
      default: "DURABLE",
    },

    // Nguong canh bao ton kho toi thieu (khi quantity <= minThreshold thi canh bao)
    minThreshold: {
      type: Number,
      default: 20,
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
          "BORROWED",     // Dang xuat kho cho doi
          "MAINTENANCE",  // Dang bao tri / sua chua
          "DAMAGED",      // Hu hong, khong dung duoc
          "LOST",         // Mat mat
          "EXPIRED",      // Het han su dung
        ],
        message: "Trang thai vat tu {VALUE} khong hop le",
      },
      default: "AVAILABLE",
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
equipmentSchema.index({ supplyType: 1 });
equipmentSchema.index({ status: 1 });
// sparse: true vi vat tu tieu hao khong co serialNumber
equipmentSchema.index({ serialNumber: 1 }, { sparse: true });

module.exports = mongoose.model("Equipment", equipmentSchema);
