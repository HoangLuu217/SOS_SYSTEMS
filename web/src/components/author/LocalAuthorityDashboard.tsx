import React from 'react';
import { AuthorPortal } from './AuthorPortal';
import { Sidebar as CommandSidebar } from '../Sidebar';
import { IncidentFeed as FloatingIncidentQueue } from '../dispatch/IncidentFeed';
import { TacticalMap as MapboxOperationsCanvas } from '../dispatch/TacticalMap';
import { DispatchWorkflow as ContextualDispatchPanel } from '../dispatch/DispatchWorkflow';
import type { User } from '../../types/auth';

export {
  CommandSidebar,
  FloatingIncidentQueue,
  MapboxOperationsCanvas,
  ContextualDispatchPanel,
};

interface LocalAuthorityDashboardProps {
  user?: User | null;
  onLogout?: () => void;
  embedded?: boolean;
}

/**
 * LocalAuthorityDashboard
 * Primary Operations Cockpit for RescueSOS:
 * Local Authority Command Center (Ban Chỉ Huy Phòng Chống Thiên Tai & Tìm Kiếm Cứu Nạn Cấp Cơ Sở - Phường Hòa Cường, Đà Nẵng).
 * 
 * Modular architecture:
 * - Panel A: CommandSidebar (Fixed dark slate navigation)
 * - Panel B: Central MapboxOperationsCanvas (Google Maps leafleth/tactical canvas) & FloatingIncidentQueue
 * - Panel C: ContextualDispatchPanel (Incident inspection, AI Decision Box, Team Ranking, Explicit Modal Confirmation)
 */
export const LocalAuthorityDashboard: React.FC<LocalAuthorityDashboardProps> = (props) => {
  return <AuthorPortal {...props} />;
};

export default LocalAuthorityDashboard;
