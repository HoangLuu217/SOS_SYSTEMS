# SOS_SYSTEMS
# SOS_SYSTEMS
ĐẶC TẢ DATABASE & CHỨC NĂNG HỆ THỐNG
Công nghệ
Node.js
Express.js
MongoDB
Mongoose
TypeScript

1. Kiến trúc Database
MongoDB gồm 13 collections:
users
authority_organizations
administrative_areas
rescue_teams
vehicles
sos_requests
sos_assignments
sos_status_history
safe_locations
alerts
notifications
files
audit_logs
Không tạo riêng
citizen_profiles
rescuer_profiles
authority_profiles
team_members
Thông tin của Citizen / Rescuer / Local Authority được embedded trực tiếp trong users.

2. Users
Model
users
Schema
users
├── _id
├── phone
├── email
├── passwordHash
│
├── fullName
├── dateOfBirth
├── gender
├── address
├── avatarUrl
│
├── roles[]
├── status
├── isVerified
│
├── citizen
│   └── emergencyContact
│       ├── name
│       ├── phone
│       └── relation
│
├── rescuer
│   ├── idNumber
│   ├── skills[]
│   ├── experience
│   ├── vehicleType
│   ├── areaId
│   ├── verificationStatus
│   └── availabilityStatus
│
├── authority
│   ├── organizationId
│   ├── areaId
│   ├── position
│   └── department
│
├── lastLoginAt
├── createdAt
└── updatedAt
Thông tin chung User
Các trường sau thuộc trực tiếp users và dùng chung cho User:
fullName
dateOfBirth
gender
address
avatarUrl
gender:
MALE
FEMALE
OTHER

roles
roles là array.
Cho phép:
CITIZEN
RESCUER
LOCAL_AUTHORITY
ADMIN
Một User có thể có nhiều role.

status
ACTIVE
INACTIVE
SUSPENDED
PENDING

citizen
Chỉ chứa thông tin đặc thù của Citizen.
citizen:
└── emergencyContact:
    ├── name
    ├── phone
    └── relation
Emergency Contact
name
phone
relation


rescuer
rescuer:
├── idNumber
├── skills[]
├── experience
├── vehicleType
├── areaId
├── verificationStatus
└── availabilityStatus
verificationStatus
PENDING
VERIFIED
REJECTED
availabilityStatus
OFFLINE
AVAILABLE
BUSY
ON_MISSION
SUSPENDED
vehicleType
BOAT
AMBULANCE
TRUCK
MOTORBIKE
OTHER
References
rescuer.areaId → administrative_areas

authority
authority:
├── organizationId
├── areaId
├── position
└── department
References
organizationId → authority_organizations
areaId         → administrative_areas

3. Authority Organizations
Model
authority_local_organizations
Schema
_id
name
type
code
areaId
address
phone
email
status
createdAt
updatedAt
type
PROVINCE
DISTRICT
WARD
RESCUE_CENTER
OTHER
Reference
areaId → administrative_areas

4. Administrative Areas
Model
areas
Schema
_id
name
code
type
parentId
boundary
status
createdAt
updatedAt
type
COUNTRY
PROVINCE
DISTRICT
WARD
parentId
Reference tới chính collection:
parentId → administrative_areas
Dùng để tạo cây:
Vietnam
└── Da Nang
    ├── Phuong X
    ├── Phuong Y
    └── Phuong Z
boundary
Sử dụng GeoJSON Polygon:
{
  "type": "Polygon",
  "coordinates": []
}
Có thể tạo:
2dsphere index
cho boundary.

5. Rescue Teams
Model
rescue_teams
Schema
_id
name
type
leaderId
authorityId
areaId
members[]
description
status
createdAt
updatedAt
members
Embedded array:
members: [
  {
    rescuerId
    role
    joinedAt
  }
]
References
rescuerId → users
leaderId → users
authorityId → authority_organizations
areaId → administrative_areas
role
LEADER
MEMBER
type
FLOOD_RESCUE
FIRE_RESCUE
MEDICAL_RESCUE
SEARCH_RESCUE
GENERAL_RESCUE
OTHER
status
ACTIVE
INACTIVE
SUSPENDED
Không tạo team_members.

6. Vehicles
Model
vehicles
Schema
_id
teamId
type
plateNumber
capacity
status
description
createdAt
updatedAt
Reference
teamId → rescue_teams
type
BOAT
AMBULANCE
TRUCK
MOTORBIKE
OTHER
status
AVAILABLE
IN_USE
MAINTENANCE
INACTIVE

7. SOS Requests
Model
sos_requests
Schema
_id
sosCode
citizenId
location
areaId
address 
emergencyType
priority
people
description
status
createdAt
updatedAt
resolvedAt
citizenId
citizenId → users
citizenId chính là _id của User có role CITIZEN.

location
Bắt buộc sử dụng GeoJSON Point:
{
  "type": "Point",
  "coordinates": [longitude, latitude]
}
Tạo:
2dsphere index
cho location.
areaId
areaId → administrative_areas
emergencyType
FLOOD
FIRE
LANDSLIDE
STORM
ACCIDENT
MEDICAL
MISSING_PERSON
OTHER
priority
LOW
MEDIUM
HIGH
CRITICAL
status
PENDING
VERIFIED
ASSIGNED
ACCEPTED
ON_THE_WAY
ARRIVED
RESCUING
COMPLETED
CANCELLED
REJECTED
createdAt, updatedAt sử dụng:
timestamps: true

8. SOS Assignments
Model
sos_assignments
Schema
_id
sosId
teamId
rescuerId
vehicleId
assignedBy
route
status
assignedAt
acceptedAt
arrivedAt
completedAt
note
createdAt
updatedAt
References
sosId       → sos_requests
teamId      → rescue_teams
rescuerId   → users
vehicleId   → vehicles
assignedBy  → users
route
Embedded:
route:
├── distance
├── duration
└── geometry
distance: mét
duration: giây
geometry
GeoJSON LineString:
{
  "type": "LineString",
  "coordinates": []
}
status
ASSIGNED
ACCEPTED
ON_THE_WAY
ARRIVED
RESCUING
COMPLETED
CANCELLED

9. SOS Status History
Model
sos_status_history
Schema
_id
sosId
oldStatus
newStatus
changedBy
note
createdAt
References
sosId → sos_requests
changedBy → users
Không có updatedAt.
Đây là immutable audit history:
CREATE → được phép
UPDATE → không được phép
DELETE → không được phép
Chỉ tạo record mới khi trạng thái SOS thay đổi.

10. Safe Locations
Model
safe_locations
Schema
_id
name
type
location
areaId
address
capacity
currentOccupancy
status
createdBy
createdAt
updatedAt
References
areaId → administrative_areas
createdBy → users
location
GeoJSON Point:
{
  "type": "Point",
  "coordinates": [longitude, latitude]
}
Tạo 2dsphere index.
type
EVACUATION_CENTER
HOSPITAL
RESCUE_STATION
SHELTER
MEETING_POINT
status
ACTIVE
INACTIVE
FULL
MAINTENANCE

11. Alerts
Model
alerts
Schema
_id
createdBy
areaId
title
content
type
severity
targetArea
startTime
endTime
isActive
createdAt
updatedAt
References
createdBy → users
areaId → administrative_areas
type
FLOOD
LANDSLIDE
STORM
FIRE
DANGEROUS_AREA
OTHER
severity
LOW
MEDIUM
HIGH
CRITICAL
targetArea nên sử dụng reference tới administrative_areas để tránh duplicate dữ liệu.

12. Notifications
Model
notifications
Schema
_id
userId
sosId
type
title
content
data
isRead
createdAt
References
userId → users
sosId → sos_requests
sosId có thể null nếu notification không liên quan đến SOS.
data
Sử dụng:
Schema.Types.Mixed
Ví dụ:
{
  "assignmentId": "...",
  "teamId": "...",
  "status": "ACCEPTED"
}

13. Files
Model
files
Schema
_id
sosId
uploadedBy
type
url
fileName
fileSize
createdAt
References
sosId → sos_requests
uploadedBy → users
type
IMAGE
VIDEO
DOCUMENT
OTHER
File thực tế không lưu trong MongoDB.
MongoDB chỉ lưu:
url
fileName
fileSize
Storage có thể sử dụng:
Cloudinary
hoặc
S3

14. Audit Logs
Model
audit_logs
Schema
_id
actorId
actorRole
action
entityType
entityId
metadata
createdAt
Reference
actorId → users
metadata
Sử dụng:
Schema.Types.Mixed
Ví dụ:
{
  "oldStatus": "PENDING",
  "newStatus": "VERIFIED",
  "reason": "Valid emergency"
}
Không cần updatedAt.

15. Quan hệ chính giữa các Collection
users
 │
 ├── citizen
 │
 ├── rescuer
 │
 └── authority
       │
       ├──────────────→ authority_organizations
       │
       └──────────────→ administrative_areas
users
 │
 ├──→ sos_requests
 │         │
 │         ├──→ sos_assignments
 │         │        ├──→ rescue_teams
 │         │        ├──→ vehicles
 │         │        └──→ users
 │         │
 │         ├──→ sos_status_history
 │         └──→ files
 │
 ├──→ rescue_teams
 ├──→ safe_locations
 ├──→ alerts
 ├──→ notifications
 └──→ audit_logs

16. Socket.IO + Redis
Socket.IO không phải database.
Dùng để truyền dữ liệu realtime:
Rescuer App
     │
     │ GPS
     ▼
  Node.js
     │
     ├──→ Redis
     │      └── current GPS
     │
     └──→ Socket.IO
             │
             ├──→ Citizen
             │
             └──→ Authority
Redis dùng cho dữ liệu realtime/tạm thời như:
current GPS
online/offline
heartbeat
MongoDB lưu dữ liệu nghiệp vụ lâu dài.

17. Chức năng của Citizen
👤 Citizen
Chức năng
Collection / Service
Đăng ký/đăng nhập
users
Quản lý profile
users
Chỉnh sửa họ tên
users.fullName
Chỉnh sửa ngày sinh
users.dateOfBirth
Chỉnh sửa giới tính
users.gender
Chỉnh sửa địa chỉ
users.address
Chỉnh sửa avatar
users.avatarUrl
Quản lý người liên hệ khẩn cấp
users.citizen.emergencyContact
Gửi SOS
sos_requests
Gửi vị trí SOS
sos_requests
Upload ảnh/video
files
Theo dõi SOS
sos_requests
Xem trạng thái cứu hộ
sos_status_history
Xem cứu hộ được giao
sos_assignments
Xem route
sos_assignments
Xem vị trí rescuer realtime
Redis + Socket.IO
Gọi rescuer
App tel:
Gọi chính quyền
App tel:
Xem điểm sơ tán
safe_locations
Xem cảnh báo
alerts
Nhận thông báo
notifications
Xác nhận đã được cứu
sos_requests


18. Chức năng của Rescuer
🚑 Rescuer
Chức năng
Collection / Service
Đăng ký
users
Quản lý profile chung
users
Quản lý thông tin rescuer
users.rescuer
Khai báo kỹ năng
users.rescuer.skills
Khai báo kinh nghiệm
users.rescuer.experience
Khai báo phương tiện
users.rescuer.vehicleType
Khai báo khu vực
users.rescuer.areaId
Chờ xác minh
users.rescuer.verificationStatus
Online/Offline
Redis
Gửi heartbeat
Redis
Gửi GPS realtime
Redis + Socket.IO
Xem SOS
sos_requests
Xem nhiệm vụ
sos_assignments
Chấp nhận nhiệm vụ
sos_assignments
Xem route
sos_assignments
Điều hướng
Routing API
Cập nhật trạng thái
sos_requests + sos_status_history
Gọi người dân
App tel:
Gọi chính quyền
App tel:
Báo cáo kết quả
sos_assignments
Xem lịch sử nhiệm vụ
sos_assignments
Xem cảnh báo
alerts
Xem điểm an toàn
safe_locations


19. Chức năng của Local Authority
🏢 Local Authority
Đây là role điều phối chính.
Chức năng
Collection / Service
Đăng nhập
users
Quản lý profile
users
Quản lý thông tin authority
users.authority
Xem SOS trên bản đồ
sos_requests
Xem vị trí SOS
sos_requests
Xác minh SOS
sos_requests
Phân loại priority
sos_requests
Phân công rescuer
sos_assignments
Phân công team
sos_assignments
Chọn vehicle
vehicles
Xem rescuer realtime
Redis + Socket.IO
Theo dõi route
sos_assignments
Theo dõi tiến độ
sos_requests
Reassign nhiệm vụ
sos_assignments
Quản lý rescue team
rescue_teams
Thêm/xóa member
rescue_teams.members[]
Quản lý vehicle
vehicles
Quản lý điểm sơ tán
safe_locations
Tạo cảnh báo
alerts
Gửi thông báo
notifications
Gọi citizen
tel:
Gọi rescuer
tel:
Xem thống kê cứu hộ
MongoDB


20. Chức năng của Admin
Admin
Admin quản lý toàn platform, không trực tiếp xử lý từng SOS.
Chức năng
Collection
Quản lý users
users
Khóa/mở tài khoản
users
Quản lý thông tin Citizen
users.citizen
Quản lý thông tin Rescuer
users.rescuer
Xác minh Rescuer
users.rescuer.verificationStatus
Quản lý Rescuer
users.rescuer
Quản lý Authority
users.authority
Quản lý rescue team
rescue_teams
Quản lý team member
rescue_teams.members[]
Quản lý vehicle
vehicles
Xem toàn bộ SOS
sos_requests
Xem assignment
sos_assignments
Xem lịch sử trạng thái
sos_status_history
Quản lý safe location
safe_locations
Quản lý alert
alerts
Xem notification
notifications
Quản lý files
files
Xem audit logs
audit_logs
Thống kê hệ thống
MongoDB



