require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, RescueTeam, Vehicle, AuthorityOrganization, AdministrativeArea } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sos_systems';

const seedTeams = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Kết nối MongoDB thành công');

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // Lấy Org và Areas hợp lệ
    let org = await AuthorityOrganization.findOne({ status: 'ACTIVE' });
    if (!org) {
      org = await AuthorityOrganization.findOne({});
    }

    let defaultArea = await AdministrativeArea.findOne({ code: 'DAD-W-12' }) || // Phường Hải Châu
                      await AdministrativeArea.findOne({ code: 'DAD-W-16' }) || // Phường Hòa Cường
                      await AdministrativeArea.findOne({});

    const teamsData = [
      {
        teamName: 'Đội Ca-nô Cứu Nạn Thủy Bộ Hải Châu',
        type: 'FLOOD_RESCUE',
        areaQuery: { $or: [{ name: /Hải Châu/i }, { code: 'DAD-W-12' }] },
        description: 'Chuyên trách tác chiến cano cao tốc vượt lũ, cứu hộ người già và trẻ nhỏ vùng ngập sâu ven sông Hàn.',
        leader: {
          fullName: 'Nguyễn Văn Anh',
          phone: '0905123456',
          email: 'nguyenvananh.leader@sos.vn',
          skills: ['Chỉ huy cứu hộ', 'Lái Ca-nô vượt lũ', 'Điều phối thủy bộ'],
          experience: '8 năm kinh nghiệm cứu hộ bão lũ miền Trung',
        },
        members: [
          {
            fullName: 'Trần Văn Bình',
            phone: '0905234567',
            email: 'tranvanbinh.doctor@sos.vn',
            skills: ['Bác Sĩ Cấp Cứu', 'Hồi sức tim phổi dã chiến', 'Xử lý gãy xương vùng ngập'],
            experience: '6 năm công tác cấp cứu 115',
          },
          {
            fullName: 'Lê Văn Cường',
            phone: '0905345678',
            email: 'levancuong.cano@sos.vn',
            skills: ['Lái Ca-nô Cao Tốc', 'Bơi lội ngược dòng xoáy', 'Định vị GPS đường thủy'],
            experience: '5 năm vận hành xuồng máy',
          },
          {
            fullName: 'Phạm Minh Dũng',
            phone: '0905456789',
            email: 'phamminhdung.diver@sos.vn',
            skills: ['Cứu Hộ Viên Đặc Nhiệm', 'Lặn cứu nạn nước sâu', 'Cắt khóa cửa dưới nước'],
            experience: '4 năm thợ lặn cứu hộ',
          },
        ],
        vehicles: [
          {
            type: 'BOAT',
            plateNumber: 'ĐN-CANO-01',
            capacity: 8,
            status: 'AVAILABLE',
            description: 'Ca-nô vượt lũ cao tốc vỏ nhôm gắn máy 150HP, trang bị phao cứu sinh tự thổi và đèn pha tìm kiếm.',
          },
          {
            type: 'BOAT',
            plateNumber: 'ĐN-XUONG-02',
            capacity: 10,
            status: 'AVAILABLE',
            description: 'Xuồng cao su động cơ chuyên dụng đưa đón người dân mắc kẹt trong hẻm sâu.',
          },
        ],
      },
      {
        teamName: 'Đội Phản Ứng Nhanh PCCC & CNCH Hải Châu',
        type: 'FIRE_RESCUE',
        areaQuery: { $or: [{ name: /Hải Châu/i }, { code: 'DAD-W-12' }] },
        description: 'Lực lượng chuyên trách cứu sập, xử lý cây ngã đổ, chập điện hạ thế và cứu nạn vùng sạt trượt đất đá.',
        leader: {
          fullName: 'Hoàng Quốc Tuấn',
          phone: '0913445566',
          email: 'hoangquoctuan.pccc@sos.vn',
          skills: ['Chỉ huy Đội PCCC', 'Phá dỡ kết cấu sập', 'Chỉ huy sơ tán khẩn cấp'],
          experience: '10 năm công tác cứu hộ chuyên nghiệp',
        },
        members: [
          {
            fullName: 'Võ Văn Kiệt',
            phone: '0913556677',
            email: 'vovankiet.pccc@sos.vn',
            skills: ['Chiến Sĩ Cứu Hộ', 'Leo trèo nhà cao tầng', 'Sơ cấp cứu ngạt khí'],
            experience: '4 năm chiến sĩ nghĩa vụ',
          },
          {
            fullName: 'Đặng Thanh Tùng',
            phone: '0913667788',
            email: 'dangthanhtung.mech@sos.vn',
            skills: ['Kỹ Thuật Viên Phá Dỡ', 'Sử dụng máy cắt thủy lực', 'Kích nâng bê tông'],
            experience: '5 năm kỹ thuật cơ giới',
          },
        ],
        vehicles: [
          {
            type: 'TRUCK',
            plateNumber: '43A-999.88',
            capacity: 6,
            status: 'AVAILABLE',
            description: 'Xe tác chiến lội nước 4x4 chuyên dụng chở thiết bị cứu sập, máy phát điện và cưa máy.',
          },
          {
            type: 'AMBULANCE',
            plateNumber: '43B-115.01',
            capacity: 4,
            status: 'AVAILABLE',
            description: 'Xe cứu thương dã chiến 115 trang bị máy thở oxy và bình oxy áp lực cao.',
          },
        ],
      },
      {
        teamName: 'Đội Phản Ứng Nhanh Cứu Hộ Phường Hòa Cường',
        type: 'GENERAL_RESCUE',
        areaQuery: { $or: [{ name: /Hòa Cường/i }, { code: 'DAD-W-16' }] },
        description: 'Đội cứu hộ xung kích cơ sở địa phương tại Hòa Cường, phụ trách sơ tán người dân vùng thấp trũng.',
        leader: {
          fullName: 'Trần Văn Cường',
          phone: '0905114116',
          email: 'tranvancuong.hc@sos.vn',
          skills: ['Đội Trưởng Cơ Sở', 'Nắm vững địa bàn ngập', 'Tổ chức lực lượng dân quân'],
          experience: '6 năm Đội phó dân quân cơ động',
        },
        members: [
          {
            fullName: 'Nguyễn Văn Hòa',
            phone: '0905114226',
            email: 'nguyenvanhoa.hc@sos.vn',
            skills: ['Lái Ca-nô Vượt Lũ', 'Hoa tiêu rạch ngập', 'Sửa chữa máy nổ'],
            experience: '4 năm đội cano xung kích',
          },
          {
            fullName: 'Lê Hoàng Nam',
            phone: '0905114336',
            email: 'lehoangnam.hc@sos.vn',
            skills: ['Y Tá Cứu Thương', 'Tiếp tế thuốc men', 'Chăm sóc người già & phụ nữ có thai'],
            experience: '3 năm tình nguyện y tế',
          },
          {
            fullName: 'Đỗ Văn Thành',
            phone: '0905114446',
            email: 'dovanthanh.hc@sos.vn',
            skills: ['Cứu Hộ Viên', 'Khuân vác đồ đạc sơ tán', 'Phao cứu sinh cơ động'],
            experience: '3 năm xung kích thanh niên',
          },
        ],
        vehicles: [
          {
            type: 'TRUCK',
            plateNumber: '43C-688.22',
            capacity: 5,
            status: 'AVAILABLE',
            description: 'Xe bán tải 2 cầu gầm cao chuyên chở nhu yếu phẩm và máy bơm chìm dã chiến.',
          },
          {
            type: 'BOAT',
            plateNumber: 'ĐN-HC-03',
            capacity: 6,
            status: 'AVAILABLE',
            description: 'Xuồng composite gắn động cơ đuôi tôm chuyên luồn lách ngõ hẻm ngập.',
          },
        ],
      },
      {
        teamName: 'Đội Ca-nô Vượt Lũ Hòa Xuân - Cẩm Lệ',
        type: 'FLOOD_RESCUE',
        areaQuery: { $or: [{ name: /Hòa Xuân/i }, { name: /Cẩm Lệ/i }] },
        description: 'Tác chiến cơ động cứu nạn vùng rốn lũ ngã ba sông Cẩm Lệ, tiếp tế khẩn cấp đồ ăn và nước ngọt.',
        leader: {
          fullName: 'Lê Văn Nam',
          phone: '0905777881',
          email: 'levannam.hx@sos.vn',
          skills: ['Đội Trưởng', 'Lái Ca-nô dòng chảy mạnh', 'Quan sát luồng lạch'],
          experience: '7 năm lái cano đường sông',
        },
        members: [
          {
            fullName: 'Phan Văn Hậu',
            phone: '0905777882',
            email: 'phanvanhau.hx@sos.vn',
            skills: ['Cứu Hộ Đường Sông', 'Bơi cứu sinh', 'Bắn dây tiếp tế'],
            experience: '4 năm đội cứu trợ bão lũ',
          },
          {
            fullName: 'Bùi Minh Trí',
            phone: '0905777883',
            email: 'buiminhtri.hx@sos.vn',
            skills: ['Kỹ Thuật Động Cơ', 'Vận hành máy bơm', 'Sơ cứu chấn thương'],
            experience: '4 năm thợ máy tàu thủy',
          },
        ],
        vehicles: [
          {
            type: 'BOAT',
            plateNumber: 'ĐN-HX-05',
            capacity: 8,
            status: 'AVAILABLE',
            description: 'Ca-nô vượt lũ thân nhôm cao cấp chịu va đập, động cơ phản lực nước an toàn.',
          },
        ],
      },
      {
        teamName: 'Đội Cứu Nạn Vùng Biển & Vùng Sạt Lở Sơn Trà',
        type: 'SEARCH_RESCUE',
        areaQuery: { $or: [{ name: /Sơn Trà/i }, { name: /Thọ Quang/i }] },
        description: 'Chuyên trách tìm kiếm cứu nạn vách đá, sạt trượt đất taluy bán đảo Sơn Trà và cứu nạn tàu bè ven biển.',
        leader: {
          fullName: 'Ngô Văn Hải',
          phone: '0905333222',
          email: 'ngovanhai.st@sos.vn',
          skills: ['Chỉ huy tìm kiếm', 'Cứu hộ vách đá dây đu', 'Hoa tiêu ven biển'],
          experience: '9 năm hải quân xuất ngũ',
        },
        members: [
          {
            fullName: 'Đặng Văn Long',
            phone: '0905333223',
            email: 'dangvanlong.st@sos.vn',
            skills: ['Thợ Lặn Chuyên Nghiệp', 'Lặn sâu 30m', 'Khảo sát đáy luồng'],
            experience: '6 năm thợ lặn trục vớt',
          },
          {
            fullName: 'Huỳnh Tấn Đạt',
            phone: '0905333224',
            email: 'huynhtandat.st@sos.vn',
            skills: ['Cứu Nạn Leo Núi', 'Sơ cấp cứu chấn thương gãy xương', 'Kéo tời cứu hộ'],
            experience: '5 năm câu lạc bộ cứu hộ mạo hiểm',
          },
        ],
        vehicles: [
          {
            type: 'BOAT',
            plateNumber: 'ĐN-ST-09',
            capacity: 12,
            status: 'AVAILABLE',
            description: 'Tàu cứu hộ chuyên dụng vượt sóng gió cấp 6, cabin kín trang bị radar tìm kiếm cứu nạn.',
          },
          {
            type: 'TRUCK',
            plateNumber: '43A-333.11',
            capacity: 6,
            status: 'AVAILABLE',
            description: 'Xe bán tải gắn tời điện 5 tấn kéo xe sạt trượt và chở cáng cứu hộ đường đèo dốc.',
          },
        ],
      },
      {
        teamName: 'Đội Y Tế Cứu Thương Dã Chiến Liên Chiểu',
        type: 'MEDICAL_RESCUE',
        areaQuery: { $or: [{ name: /Liên Chiểu/i }, { name: /Hòa Khánh/i }] },
        description: 'Tiểu đội y tế lưu động tiếp cận các khu công nghiệp và xóm trọ ngập nước, xử lý cấp cứu tại chỗ.',
        leader: {
          fullName: 'Bác sĩ Nguyễn Trọng Nghĩa',
          phone: '0905555666',
          email: 'nguyentrongnghia.med@sos.vn',
          skills: ['Bác sĩ Trưởng Đội', 'Hồi sức cấp cứu ngạt nước', 'Tiểu phẫu dã chiến'],
          experience: '11 năm công tác BV Đa Khoa',
        },
        members: [
          {
            fullName: 'Dược sĩ Lê Thu Trang',
            phone: '0905555667',
            email: 'lethutrang.med@sos.vn',
            skills: ['Dược Sĩ Dã Chiến', 'Bảo quản huyết thanh & vắc-xin', 'Khử trùng nước sinh hoạt'],
            experience: '5 năm dược lâm sàng',
          },
          {
            fullName: 'Điều dưỡng Trịnh Quốc Toàn',
            phone: '0905555668',
            email: 'trinhquoctoan.med@sos.vn',
            skills: ['Điều Dưỡng Cấp Cứu', 'Cố định cột sống trên cáng nổi', 'Tiêm truyền ven'],
            experience: '4 năm khoa hồi sức',
          },
        ],
        vehicles: [
          {
            type: 'AMBULANCE',
            plateNumber: '43B-115.88',
            capacity: 4,
            status: 'AVAILABLE',
            description: 'Xe cứu thương 2 cầu gầm cao trang bị monitor theo dõi sinh tồn, máy sốc tim tự động AED.',
          },
        ],
      },
    ];

    for (const item of teamsData) {
      // 1. Tìm hoặc lấy Area
      let targetArea = await AdministrativeArea.findOne(item.areaQuery);
      if (!targetArea) {
        targetArea = defaultArea;
      }

      // 2. Tạo Leader User
      let leaderUser = await User.findOne({ phone: item.leader.phone });
      if (!leaderUser) {
        leaderUser = await User.create({
          fullName: item.leader.fullName,
          phone: item.leader.phone,
          email: item.leader.email,
          passwordHash: defaultPasswordHash,
          roles: ['RESCUER'],
          status: 'ACTIVE',
          isVerified: true,
          rescuer: {
            skills: item.leader.skills,
            experience: item.leader.experience,
            vehicleType: item.vehicles[0]?.type || 'BOAT',
            verificationStatus: 'VERIFIED',
            availabilityStatus: 'AVAILABLE',
          },
        });
        console.log(`  👤 Đã tạo Đội trưởng: ${leaderUser.fullName}`);
      } else {
        leaderUser.rescuer = {
          skills: item.leader.skills,
          experience: item.leader.experience,
          vehicleType: item.vehicles[0]?.type || 'BOAT',
          verificationStatus: 'VERIFIED',
          availabilityStatus: 'AVAILABLE',
        };
        await leaderUser.save();
      }

      // 3. Tạo Member Users
      const memberList = [
        {
          rescuerId: leaderUser._id,
          role: 'LEADER',
          joinedAt: new Date(),
        },
      ];

      for (const m of item.members) {
        let mUser = await User.findOne({ phone: m.phone });
        if (!mUser) {
          mUser = await User.create({
            fullName: m.fullName,
            phone: m.phone,
            email: m.email,
            passwordHash: defaultPasswordHash,
            roles: ['RESCUER'],
            status: 'ACTIVE',
            isVerified: true,
            rescuer: {
              skills: m.skills,
              experience: m.experience,
              vehicleType: item.vehicles[0]?.type || 'BOAT',
              verificationStatus: 'VERIFIED',
              availabilityStatus: 'AVAILABLE',
            },
          });
          console.log(`    👤 Đã tạo Đội viên: ${mUser.fullName}`);
        } else {
          mUser.rescuer = {
            skills: m.skills,
            experience: m.experience,
            vehicleType: item.vehicles[0]?.type || 'BOAT',
            verificationStatus: 'VERIFIED',
            availabilityStatus: 'AVAILABLE',
          };
          await mUser.save();
        }

        memberList.push({
          rescuerId: mUser._id,
          role: 'MEMBER',
          joinedAt: new Date(),
        });
      }

      // 4. Tạo hoặc Cập nhật RescueTeam
      let team = await RescueTeam.findOne({ name: item.teamName });
      if (!team) {
        team = await RescueTeam.create({
          name: item.teamName,
          type: item.type,
          leaderId: leaderUser._id,
          authorityId: org ? org._id : undefined,
          areaId: targetArea._id,
          members: memberList,
          description: item.description,
          status: 'ACTIVE',
        });
        console.log(`🛡️ ĐÃ TẠO ĐỘI CỨU HỘ: ${team.name}`);
      } else {
        team.leaderId = leaderUser._id;
        team.members = memberList;
        team.description = item.description;
        team.status = 'ACTIVE';
        if (targetArea) team.areaId = targetArea._id;
        if (org) team.authorityId = org._id;
        await team.save();
        console.log(`🔄 Đã cập nhật Đội cứu hộ: ${team.name}`);
      }

      // 5. Tạo Vehicles trực thuộc Team (đội cứu hộ tự quản lý)
      for (const vData of item.vehicles) {
        let vehicle = await Vehicle.findOne({ plateNumber: vData.plateNumber });
        if (!vehicle) {
          vehicle = await Vehicle.create({
            teamId: team._id,
            type: vData.type,
            plateNumber: vData.plateNumber,
            capacity: vData.capacity,
            status: vData.status,
            description: vData.description,
          });
          console.log(`  🚗 Đã tạo Phương tiện: ${vehicle.plateNumber} (trực thuộc: ${team.name})`);
        } else {
          vehicle.teamId = team._id;
          vehicle.capacity = vData.capacity;
          vehicle.status = vData.status;
          vehicle.description = vData.description;
          await vehicle.save();
          console.log(`  🚗 Đã liên kết Phương tiện ${vehicle.plateNumber} vào Đội: ${team.name}`);
        }
      }
    }

    console.log('\n🎉 HOÀN THÀNH KHỞI TẠO TẤT CẢ CÁC ĐỘI CỨU HỘ & PHƯƠNG TIỆN TRỰC THUỘC!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi seed Rescue Teams & Vehicles:', error);
    process.exit(1);
  }
};

seedTeams();
