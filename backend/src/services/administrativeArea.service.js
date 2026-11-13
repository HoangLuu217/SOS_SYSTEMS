const mongoose = require('mongoose');
const { AdministrativeArea } = require('../models');
const ApiError = require('../utils/apiError');

class AdministrativeAreaService {
  constructor() {
    this.boundaryMemoryCache = new Map();
  }
  /**
   * Kiểm tra tính hợp lệ của phân cấp hành chính (Hierarchy Validation)
   * COUNTRY: parentId = null
   * PROVINCE: parentId -> COUNTRY
   * DISTRICT: parentId -> PROVINCE
   * WARD: parentId -> DISTRICT
   */
  async validateHierarchy(type, parentId, currentId = null) {
    if (type === 'COUNTRY') {
      if (parentId) {
        throw new ApiError(400, 'Khu vực cấp COUNTRY không được có parentId (parentId phải là null)');
      }
      return;
    }

    if (!parentId) {
      throw new ApiError(400, `Khu vực cấp ${type} bắt buộc phải có parentId hợp lệ`);
    }

    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      throw new ApiError(400, 'parentId không phải là ObjectId hợp lệ');
    }

    if (currentId && String(parentId) === String(currentId)) {
      throw new ApiError(400, 'Khu vực không thể tự nhận chính mình làm parent');
    }

    const parent = await AdministrativeArea.findById(parentId);
    if (!parent) {
      throw new ApiError(404, 'Không tìm thấy khu vực cấp cha (parent area)');
    }

    if (type === 'PROVINCE' && parent.type !== 'COUNTRY') {
      throw new ApiError(
        400,
        `Phân cấp không hợp lệ: PROVINCE phải trực thuộc COUNTRY, hiện tại cha là ${parent.type}`
      );
    }

    if (type === 'DISTRICT' && parent.type !== 'PROVINCE') {
      throw new ApiError(
        400,
        `Phân cấp không hợp lệ: DISTRICT phải trực thuộc PROVINCE, hiện tại cha là ${parent.type}`
      );
    }

    if (type === 'WARD' && parent.type !== 'DISTRICT') {
      throw new ApiError(
        400,
        `Phân cấp không hợp lệ: WARD phải trực thuộc DISTRICT, hiện tại cha là ${parent.type}`
      );
    }
  }

  /**
   * Kiểm tra định dạng GeoJSON Polygon của boundary
   */
  validateBoundary(boundary) {
    if (!boundary) return;

    if (boundary.type !== 'Polygon') {
      throw new ApiError(400, "GeoJSON boundary phải có type là 'Polygon'");
    }

    if (!Array.isArray(boundary.coordinates) || boundary.coordinates.length === 0) {
      throw new ApiError(400, 'GeoJSON Polygon coordinates phải là mảng các linear ring');
    }

    for (const ring of boundary.coordinates) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new ApiError(
          400,
          'Mỗi linear ring trong GeoJSON Polygon phải có ít nhất 4 điểm tọa độ'
        );
      }

      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new ApiError(
          400,
          'Linear ring phải khép kín (điểm đầu và điểm cuối phải trùng nhau)'
        );
      }

      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length !== 2) {
          throw new ApiError(400, 'Tọa độ điểm phải là cặp [longitude, latitude]');
        }
        const [lng, lat] = pt;
        if (
          typeof lng !== 'number' ||
          typeof lat !== 'number' ||
          lng < -180 ||
          lng > 180 ||
          lat < -90 ||
          lat > 90
        ) {
          throw new ApiError(
            400,
            `Tọa độ [${lng}, ${lat}] không hợp lệ. Longitude [-180, 180], Latitude [-90, 90]`
          );
        }
      }
    }
  }

  /**
   * POST /administrative-areas
   */
  async createArea(data) {
    const { name, code, type, parentId, boundary } = data;

    if (!name || !String(name).trim()) {
      throw new ApiError(400, 'Tên khu vực (name) là bắt buộc');
    }
    if (!code || !String(code).trim()) {
      throw new ApiError(400, 'Mã khu vực (code) là bắt buộc');
    }

    const validTypes = ['COUNTRY', 'PROVINCE', 'DISTRICT', 'WARD'];
    if (!type || !validTypes.includes(type)) {
      throw new ApiError(400, `Loại khu vực (type) phải là một trong: ${validTypes.join(', ')}`);
    }

    // Kiểm tra trùng code
    const existingCode = await AdministrativeArea.findOne({
      code: String(code).trim().toUpperCase(),
    });
    if (existingCode) {
      throw new ApiError(409, `Mã khu vực '${code}' đã tồn tại trong hệ thống`);
    }

    // Validate phân cấp
    await this.validateHierarchy(type, parentId || null);

    // Validate boundary nếu có
    if (boundary) {
      this.validateBoundary(boundary);
    }

    const area = await AdministrativeArea.create({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      type,
      parentId: type === 'COUNTRY' ? null : parentId,
      boundary: boundary || undefined,
    });

    return area;
  }

  /**
   * GET /administrative-areas
   */
  async getAreas(query = {}) {
    const filter = {};

    if (query.type) {
      filter.type = query.type;
    }

    if (query.parentId !== undefined) {
      if (query.parentId === 'null' || query.parentId === null) {
        filter.parentId = null;
      } else if (mongoose.Types.ObjectId.isValid(query.parentId)) {
        filter.parentId = query.parentId;
      }
    }

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
      ];
    }

    const areas = await AdministrativeArea.find(filter)
      .populate('parentId', 'name code type')
      .sort({ createdAt: -1 });

    return areas;
  }

  /**
   * GET /administrative-areas/:id
   */
  async getAreaById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID khu vực không phải là ObjectId hợp lệ');
    }

    const area = await AdministrativeArea.findById(id).populate('parentId', 'name code type');
    if (!area) {
      throw new ApiError(404, 'Không tìm thấy khu vực hành chính');
    }

    return area;
  }

  /**
   * PATCH /administrative-areas/:id
   */
  async updateArea(id, data) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'ID khu vực không phải là ObjectId hợp lệ');
    }

    const area = await AdministrativeArea.findById(id);
    if (!area) {
      throw new ApiError(404, 'Không tìm thấy khu vực hành chính để cập nhật');
    }

    const updateFields = {};

    if (data.name !== undefined) {
      if (!String(data.name).trim()) {
        throw new ApiError(400, 'Tên khu vực không được để trống');
      }
      updateFields.name = String(data.name).trim();
    }

    if (data.code !== undefined) {
      const newCode = String(data.code).trim().toUpperCase();
      if (!newCode) {
        throw new ApiError(400, 'Mã khu vực không được để trống');
      }
      if (newCode !== area.code) {
        const existingCode = await AdministrativeArea.findOne({ code: newCode, _id: { $ne: id } });
        if (existingCode) {
          throw new ApiError(409, `Mã khu vực '${newCode}' đã tồn tại trong hệ thống`);
        }
      }
      updateFields.code = newCode;
    }

    const nextType = data.type !== undefined ? data.type : area.type;
    const nextParentId = data.parentId !== undefined ? data.parentId : area.parentId;

    if (data.type !== undefined) {
      const validTypes = ['COUNTRY', 'PROVINCE', 'DISTRICT', 'WARD'];
      if (!validTypes.includes(data.type)) {
        throw new ApiError(400, `Loại khu vực (type) phải là một trong: ${validTypes.join(', ')}`);
      }
      updateFields.type = data.type;
    }

    if (data.parentId !== undefined) {
      updateFields.parentId = nextType === 'COUNTRY' ? null : data.parentId;
    }

    // Nếu có sự thay đổi về type hoặc parentId thì validate lại hierarchy
    if (data.type !== undefined || data.parentId !== undefined) {
      await this.validateHierarchy(nextType, nextParentId, id);
    }

    if (data.boundary !== undefined) {
      if (data.boundary === null) {
        updateFields.boundary = null;
      } else {
        this.validateBoundary(data.boundary);
        updateFields.boundary = data.boundary;
      }
    }

    const updatedArea = await AdministrativeArea.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { returnDocument: 'after', runValidators: true }
    ).populate('parentId', 'name code type');

    return updatedArea;
  }

  /**
   * Đồng bộ tự động các đơn vị hành chính lấy trực tiếp từ API vào CSDL MongoDB
   * Tuyệt đối không cần chạy script seed thủ công
   */
  async syncAreasFromApi(data) {
    const { provinceName, provinceCode, units } = data;
    if (!provinceName || !Array.isArray(units) || units.length === 0) {
      return { success: false, message: 'Dữ liệu không đủ để đồng bộ' };
    }

    // 1. Tìm hoặc tạo Province
    let provinceDoc = await AdministrativeArea.findOne({
      $or: [
        { code: `VN-${provinceCode}` },
        { name: provinceName },
        { code: String(provinceCode || '') }
      ]
    });

    if (!provinceDoc) {
      provinceDoc = await AdministrativeArea.create({
        name: provinceName,
        code: `VN-${provinceCode || Date.now()}`,
        type: 'PROVINCE',
        status: 'ACTIVE'
      });
    }

    // 2. Map lưu trữ ObjectId các District
    const districtMap = new Map();

    // 3. Upsert các District
    const districts = units.filter(u => u.type === 'DISTRICT');
    for (const d of districts) {
      const cleanCode = (d.code || `VN-${provinceCode}-D-${d.name}`).toUpperCase();
      const doc = await AdministrativeArea.findOneAndUpdate(
        { code: cleanCode },
        {
          $set: {
            name: d.name,
            code: cleanCode,
            type: 'DISTRICT',
            parentId: provinceDoc._id,
            status: 'ACTIVE'
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      districtMap.set(d.name, doc._id);
      districtMap.set(cleanCode, doc._id);
    }

    // 4. Upsert các Ward
    const wards = units.filter(u => u.type !== 'DISTRICT');
    for (const w of wards) {
      const cleanCode = (w.code || `VN-${provinceCode}-W-${w.name}`).toUpperCase();
      const parentId = (w.parentName && districtMap.get(w.parentName)) || provinceDoc._id;
      await AdministrativeArea.findOneAndUpdate(
        { code: cleanCode },
        {
          $set: {
            name: w.name,
            code: cleanCode,
            type: 'WARD',
            parentId,
            status: 'ACTIVE'
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    }

    return {
      success: true,
      syncedCount: units.length,
      province: provinceDoc.name
    };
  }

  /**
   * Lấy danh sách cán bộ / đơn vị địa phương đang quản lý từng địa bàn
   */
  async getAreaManagers() {
    const { User, AuthorityOrganization } = require('../models');

    // 1. Tìm tất cả cán bộ có vai trò LOCAL_AUTHORITY
    const users = await User.find({ roles: 'LOCAL_AUTHORITY' })
      .select('fullName phone email roles authority status')
      .populate('authority.organizationId', 'name code');

    // 2. Tìm tất cả cơ quan địa phương
    const orgs = await AuthorityOrganization.find({ status: 'ACTIVE' })
      .select('name code phone email administrativeAreaId areaId');

    // 3. Map theo tên địa bàn và ID
    const managerMap = {};

    users.forEach((u) => {
      const auth = u.authority || {};
      const areaName = auth.areaName;
      const areaId = auth.areaId ? String(auth.areaId) : null;

      const managerInfo = {
        hasManager: true,
        managerName: u.fullName,
        phone: u.phone,
        email: u.email,
        position: auth.position || 'Cán bộ trực ban tác chiến',
        department: auth.department || (auth.organizationId ? auth.organizationId.name : 'Ban Chỉ Huy PCTT Địa Phương'),
        organizationName: auth.organizationId ? auth.organizationId.name : null,
        areaName: areaName,
        areaId: areaId,
      };

      if (areaName) {
        managerMap[areaName.toLowerCase().trim()] = managerInfo;
        // Chuẩn hóa tên bỏ 'quận', 'huyện', 'phường', 'xã'
        const shortName = areaName.toLowerCase().replace(/^(quận|huyện|thị xã|thành phố|phường|xã)\s+/i, '').trim();
        managerMap[shortName] = managerInfo;
      }
      if (areaId) {
        managerMap[areaId] = managerInfo;
      }
    });

    return managerMap;
  }


  isProvinceLevelBoundary(coords) {
    try {
      let minX = 999, maxX = -999, minY = 999, maxY = -999;
      const extract = (arr) => {
        if (!Array.isArray(arr)) return;
        if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
          const [x, y] = arr;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        } else {
          for (const item of arr) extract(item);
        }
      };
      extract(coords);
      return (maxX - minX) > 0.20 && (maxY - minY) > 0.20;
    } catch {
      return false;
    }
  }

  createLocalizedBoundary(centerLng, centerLat, radiusKm = 1.6) {
    const points = [];
    const numSides = 16;
    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * Math.cos(centerLat * (Math.PI / 180)));
    for (let i = 0; i <= numSides; i++) {
      const angle = (i * 2 * Math.PI) / numSides;
      const jitter = 0.94 + 0.12 * Math.sin(angle * 3);
      const ptLng = +(centerLng + Math.cos(angle) * lngDelta * jitter).toFixed(6);
      const ptLat = +(centerLat + Math.sin(angle) * latDelta * jitter).toFixed(6);
      points.push([ptLng, ptLat]);
    }
    return {
      type: 'Polygon',
      coordinates: [points],
    };
  }

  getOuterRing(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    // MultiPolygon: coords[0][0][0] là [lng, lat] (Array); Polygon: coords[0][0] là [lng, lat]
    if (Array.isArray(coords[0]?.[0]?.[0])) {
      return coords[0][0];
    }
    return coords[0];
  }

  isCoordsMatchingProvince(coords, provinceName) {
    if (!provinceName || !coords) return true;
    const p = provinceName.toLowerCase();
    const ring = this.getOuterRing(coords);
    const sample = Array.isArray(ring) ? ring[0] : null;
    if (!sample || !Array.isArray(sample) || sample.length < 2) return true;
    const [lng, lat] = sample;
    if (typeof lng !== 'number' || typeof lat !== 'number') return true;

    if (p.includes('đà nẵng') || p.includes('da nang')) {
      return lat >= 14.8 && lat <= 16.6 && lng >= 107.0 && lng <= 109.5;
    }
    if (p.includes('hồ chí minh') || p.includes('ho chi minh') || p.includes('sài gòn') || p.includes('tphcm')) {
      return lat >= 10.0 && lat <= 11.5 && lng >= 106.0 && lng <= 107.3;
    }
    if (p.includes('hà nội') || p.includes('ha noi')) {
      return lat >= 20.3 && lat <= 21.7 && lng >= 105.1 && lng <= 106.3;
    }
    return true;
  }

  /**
   * Lấy hoặc truy vấn online ranh giới GeoJSON polygon của một khu vực hành chính (phường/xã/quận/huyện)
   * Tự động lưu cache vào CSDL MongoDB để các lần sau không cần gọi API ngoài
   */
  async getBoundaryForArea({ areaId, name, province, district, level }) {
    const cacheKey = `${String(level || '').toUpperCase()}|${String(province || '').toLowerCase()}|${String(district || '').toLowerCase()}|${String(areaId || name || '').toLowerCase()}`;
    if (this.boundaryMemoryCache.has(cacheKey)) {
      return this.boundaryMemoryCache.get(cacheKey);
    }

    let areaDoc = null;
    if (areaId && mongoose.Types.ObjectId.isValid(areaId)) {
      areaDoc = await AdministrativeArea.findById(areaId);
    }
    if (!areaDoc && name) {
      const normalizedLevel = String(level || '').toUpperCase();
      if (normalizedLevel === 'PROVINCE') {
        const cleanProvName = name.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
        areaDoc = await AdministrativeArea.findOne({
          type: 'PROVINCE',
          name: new RegExp(cleanProvName, 'i'),
        });
      }
      if (!areaDoc) {
        const cleanName = name
          .replace(/^(phường|xã|thị trấn|quận|huyện|thị xã|thành phố|tỉnh)\s+/i, '')
          .trim();
        areaDoc = await AdministrativeArea.findOne({
          name: new RegExp(cleanName, 'i'),
        });
      }
    }

    const isProvinceScope =
      String(level || '').toUpperCase() === 'PROVINCE' ||
      areaDoc?.type === 'PROVINCE';

    let cleanProvince = (province || '');
    if (cleanProvince.includes('(') && cleanProvince.includes(')')) {
      cleanProvince = cleanProvince.replace(/.*?\((.*?)\).*/, '$1');
    }
    cleanProvince = cleanProvince.replace(/^Thành phố\s+|^Tỉnh\s+/i, '').trim();
    const cleanDistrict = (district || '').replace(/^(Quận|Huyện|Thị xã)\s+/i, '').trim();

    const isTinyBoundary = (coords) => {
      try {
        const ring = this.getOuterRing(coords);
        if (!Array.isArray(ring) || ring.length < 3) return true;
        let minX = 999, maxX = -999, minY = 999, maxY = -999;
        for (const pt of ring) {
          const [x, y] = Array.isArray(pt) ? pt : [0, 0];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        return (maxX - minX) < 0.005 && (maxY - minY) < 0.005;
      } catch {
        return false;
      }
    };

    // 1. Nếu đã có boundary trong CSDL và tọa độ khớp với tỉnh/thành được yêu cầu và không phải vết nhỏ của tòa nhà/bệnh viện
    if (
      areaDoc &&
      areaDoc.boundary &&
      Array.isArray(areaDoc.boundary.coordinates) &&
      areaDoc.boundary.coordinates.length > 0 &&
      !isTinyBoundary(areaDoc.boundary.coordinates) &&
      (isProvinceScope || !this.isProvinceLevelBoundary(areaDoc.boundary.coordinates)) &&
      this.isCoordsMatchingProvince(areaDoc.boundary.coordinates, cleanProvince)
    ) {
      const dbResult = {
        areaId: areaDoc._id,
        name: areaDoc.name,
        code: areaDoc.code,
        boundary: areaDoc.boundary,
        source: 'DATABASE_CACHE',
      };
      this.boundaryMemoryCache.set(cacheKey, dbResult);
      return dbResult;
    }

    // 2. Chuẩn bị truy vấn online qua Nominatim / Geoapify
    const targetName = name || (areaDoc ? areaDoc.name : '');
    if (!targetName) {
      return null;
    }

    const cleanTargetName = targetName.trim();

    // Các biến thể từ khóa tìm kiếm tăng dần độ rộng
    const searchQueries = [];
    if (cleanDistrict && cleanProvince) {
      searchQueries.push(`${cleanTargetName}, ${cleanDistrict}, ${cleanProvince}`);
    }
    if (cleanProvince) {
      searchQueries.push(`${cleanTargetName}, ${cleanProvince}`);
      const strippedName = cleanTargetName.replace(/^(phường|xã|thị trấn|quận|huyện|thị xã)\s+/i, '').trim();
      if (strippedName && strippedName.toLowerCase() !== cleanTargetName.toLowerCase()) {
        searchQueries.push(`${strippedName}, ${cleanProvince}`);
      }
    }
    if (cleanTargetName.toLowerCase().includes('hòa cường') && (cleanProvince.toLowerCase().includes('đà nẵng') || !cleanProvince)) {
      searchQueries.push(`Chợ Hòa Cường, Hải Châu, Đà Nẵng`);
    }
    // Chỉ fallback tìm tên trần nếu không cung cấp tỉnh thành cụ thể
    if (!cleanProvince) {
      searchQueries.push(cleanTargetName);
    }

    let foundFeature = null;

    // 1B. Nếu tìm boundary cấp Tỉnh / Thành phố: ưu tiên truy vấn Geoapify danh mục tỉnh/thành Việt Nam
    if (isProvinceScope) {
      try {
        const vnProvUrl =
          'https://api.geoapify.com/v1/boundaries/consists-of?id=510116f9f5c3fd5a40595fa637ed73da2f40f00101f901fbc2000000000000c0020b92030a5669e1bb8774204e616d&boundary=administrative&sublevel=1&geometry=geometry_1000&lang=vi&apiKey=3383e3ba2267489985bbe6d9bf7aa05d';
        const provRes = await fetch(vnProvUrl);
        if (provRes.ok) {
          const provData = await provRes.json();
          const strippedTarget = cleanTargetName
            .toLowerCase()
            .replace(/^(thành phố|tỉnh|tp\.?)\s+/i, '')
            .trim();
          const matchedProvFeature = (provData.features || []).find((f) => {
            if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
              return false;
            }
            const fName = String(f.properties?.name || f.properties?.name_vi || '').toLowerCase();
            return (
              fName === cleanTargetName.toLowerCase() ||
              fName.includes(strippedTarget) ||
              strippedTarget.includes(fName)
            );
          });
          if (matchedProvFeature) {
            foundFeature = matchedProvFeature;
          }
        }
      } catch (err) {
        console.warn(`Geoapify province boundary fetch failed for "${cleanTargetName}":`, err.message);
      }
    }

    // Thử lần lượt qua Nominatim
    for (const q of searchQueries) {
      if (foundFeature) break;
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=vn&format=geojson&polygon_geojson=1&limit=5`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'SOS_Vietnam_Emergency_System/1.0 (contact@sos-system.vn)',
          },
        });
        if (res.ok) {
          const data = await res.json();
          const polyFeature = data.features?.find(
            (f) =>
              f.geometry &&
              (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
              this.isCoordsMatchingProvince(f.geometry.coordinates, cleanProvince)
          );
          if (polyFeature) {
            foundFeature = polyFeature;
            break;
          }
        }
      } catch (err) {
        console.warn(`Nominatim search failed for query "${q}":`, err.message);
      }
    }

    // Fallback: Geoapify Geocode + Boundary
    let chosenFeature = null;
    if (!foundFeature) {
      for (const q of searchQueries) {
        try {
          const geoUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q + ', Vietnam')}&format=geojson&apiKey=3383e3ba2267489985bbe6d9bf7aa05d`;
          const geoRes = await fetch(geoUrl);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const rawTarget = cleanTargetName
              .toLowerCase()
              .replace(/^(phường|xã|thị trấn|quận|huyện|thị xã|thành phố|tp\.)\s+/i, '')
              .trim();

            const matchingFeatures = (geoData.features || []).filter((f) => {
              const fName = (f.properties?.name || f.properties?.formatted || '').toLowerCase();
              return fName.includes(rawTarget);
            });

            // Thử lần lượt các kết quả khớp tên để lấy polygon boundary thật cấp phường/xã/quận
            const candidateFeatures = [
              ...matchingFeatures,
              ...(geoData.features || []).filter((f) => !matchingFeatures.includes(f)),
            ];

            if (!chosenFeature && candidateFeatures.length > 0) {
              chosenFeature = candidateFeatures[0];
            }

            for (const cand of candidateFeatures) {
              const placeId = cand?.properties?.place_id;
              if (!placeId) continue;

              // Bước 1: Kiểm tra trực tiếp place-details của candidate (Geoapify v2 trả về polygon chính xác của đơn vị hành chính)
              try {
                const pdUrl = `https://api.geoapify.com/v2/place-details?id=${placeId}&apiKey=3383e3ba2267489985bbe6d9bf7aa05d`;
                const pdRes = await fetch(pdUrl);
                if (pdRes.ok) {
                  const pdData = await pdRes.json();
                  const pdFeature = pdData.features?.[0];
                  if (
                    pdFeature &&
                    pdFeature.geometry &&
                    (pdFeature.geometry.type === 'Polygon' || pdFeature.geometry.type === 'MultiPolygon') &&
                    (isProvinceScope || !this.isProvinceLevelBoundary(pdFeature.geometry.coordinates)) &&
                    this.isCoordsMatchingProvince(pdFeature.geometry.coordinates, cleanProvince)
                  ) {
                    const fName = (pdFeature.properties?.name || cand.properties?.name || '').toLowerCase();
                    if (fName.includes(rawTarget) || rawTarget.includes(fName) || matchingFeatures.includes(cand)) {
                      foundFeature = pdFeature;
                      chosenFeature = cand;
                      break;
                    }
                  }
                }
              } catch (e) {
                // Tiếp tục thử part-of
              }

              // Bước 2: Nếu candidate là điểm/poi nằm trong đơn vị hành chính, tìm polygon trong part-of
              const boundUrl = `https://api.geoapify.com/v1/boundaries/part-of?id=${placeId}&geometry=geometry_1000&apiKey=3383e3ba2267489985bbe6d9bf7aa05d`;
              const boundRes = await fetch(boundUrl);
              if (!boundRes.ok) continue;

              const boundData = await boundRes.json();
              if (Array.isArray(boundData.features) && boundData.features.length > 0) {
                // Ưu tiên polygon cấp quận/huyện/phường có tên khớp với khu vực cần tìm
                const matchingByName = boundData.features.find((f) => {
                  if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) return false;
                  const fName = (f.properties?.name || '').toLowerCase();
                  const isWholeCity = fName === 'trung tâm hà nội' || fName.includes('thành phố') || f.properties?.result_type === 'city';
                  if (isWholeCity && fName !== rawTarget) return false;
                  if (this.isProvinceLevelBoundary(f.geometry.coordinates)) return false;
                  const nameMatches = fName.includes(rawTarget) || rawTarget.includes(fName);
                  return nameMatches && this.isCoordsMatchingProvince(f.geometry.coordinates, cleanProvince);
                });

                if (matchingByName) {
                  foundFeature = matchingByName;
                  chosenFeature = cand;
                  break;
                }
              }
            }

            if (foundFeature) break;
          }
        } catch (err) {
          console.warn(`Geoapify fallback failed for query "${q}":`, err.message);
        }
      }
    }

    // Nếu chưa có polygon nhưng đã định vị được tâm điểm của phường/xã từ Geoapify:
    if (!foundFeature && chosenFeature && chosenFeature.geometry?.coordinates) {
      const [cLng, cLat] = chosenFeature.geometry.coordinates;
      if (typeof cLng === 'number' && typeof cLat === 'number') {
        foundFeature = {
          geometry: this.createLocalizedBoundary(cLng, cLat, 1.8),
          properties: { name: cleanTargetName }
        };
      }
    }

    if (!foundFeature || !foundFeature.geometry) {
      return null;
    }

    const boundary = {
      type: foundFeature.geometry.type,
      coordinates: foundFeature.geometry.coordinates,
    };

    // 3. Tự động lưu cache boundary vào MongoDB
    if (areaDoc) {
      areaDoc.boundary = boundary;
      await areaDoc.save();
    } else {
      try {
        areaDoc = await AdministrativeArea.create({
          name: cleanTargetName,
          code: `AUTO-${Date.now()}`,
          type: isProvinceScope ? 'PROVINCE' : 'WARD',
          boundary,
          status: 'ACTIVE',
        });
      } catch (e) {
        // ignore unique code conflict
      }
    }

    const liveResult = {
      areaId: areaDoc ? areaDoc._id : null,
      name: areaDoc ? areaDoc.name : cleanTargetName,
      code: areaDoc ? areaDoc.code : null,
      boundary,
      source: 'LIVE_FETCH_AND_CACHED',
    };
    this.boundaryMemoryCache.set(cacheKey, liveResult);
    return liveResult;
  }
}

module.exports = new AdministrativeAreaService();
