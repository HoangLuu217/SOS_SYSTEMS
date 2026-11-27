import React from 'react';
import { Shield } from 'lucide-react';

export const RbacMatrixView: React.FC = () => {
  return (
    <div className="sos-views-container">
      <div className="sos-view-card">
        <div className="sos-view-card-title" style={{ marginBottom: 16 }}>
          <Shield size={18} color="#ef4444" />
          <span>Ma Trận Phân Quyền Vai Trò Tác Chiến Hệ Thống (RBAC Chuẩn SaaS)</span>
        </div>
        <div className="sos-table-wrapper">
          <table className="sos-table">
            <thead>
              <tr>
                <th>Vai trò (Role)</th>
                <th>Nền tảng</th>
                <th>Quyền tiếp nhận SOS</th>
                <th>Quyền điều phối lực lượng</th>
                <th>Quản lý điểm nguy hiểm</th>
                <th>Quản trị người dùng</th>
                <th>Quản trị hệ thống</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="ch-tbl-primary">CITIZEN (Người dân)</span></td>
                <td>Mobile App</td>
                <td>❌ Chỉ gửi SOS của mình</td>
                <td>❌ Không</td>
                <td>⚠️ Gửi đóng góp (Chờ duyệt)</td>
                <td>❌ Không</td>
                <td>❌ Không</td>
              </tr>
              <tr>
                <td><span className="ch-tbl-primary">RESCUER (Cứu hộ viên)</span></td>
                <td>Mobile App</td>
                <td>✅ Nhận nhiệm vụ được giao</td>
                <td>❌ Không</td>
                <td>⚠️ Báo cáo hiểm họa (Chờ duyệt)</td>
                <td>❌ Không</td>
                <td>❌ Không</td>
              </tr>
              <tr>
                <td><span className="ch-tbl-primary">LOCAL_AUTHORITY (Địa phương)</span></td>
                <td>Web Dashboard</td>
                <td>✅ Toàn địa bàn</td>
                <td>✅ Toàn quyền điều phối</td>
                <td><span style={{ color: 'var(--dm-green-text)', fontWeight: 500 }}>✅ Toàn quyền tạo &amp; duyệt địa bàn</span></td>
                <td>❌ Giới hạn đội cứu hộ</td>
                <td>❌ Không</td>
              </tr>
              <tr>
                <td><span className="ch-tbl-primary">ADMIN (Quản trị viên)</span></td>
                <td>Web Dashboard</td>
                <td>✅ Toàn hệ thống</td>
                <td>✅ Giám sát toàn bộ</td>
                <td><span style={{ color: 'var(--dm-green-text)', fontWeight: 500 }}>✅ Toàn quyền tạo &amp; duyệt toàn TP</span></td>
                <td>✅ Toàn quyền quản trị</td>
                <td>✅ Toàn quyền hệ thống</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
