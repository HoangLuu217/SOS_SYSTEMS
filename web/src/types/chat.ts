export interface ChatAttachment {
  url: string;
  fileType: string;
  fileName: string;
}

export interface ChatSender {
  _id: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  citizen?: {
    emergencyContact?: {
      name?: string;
      phone?: string;
      relation?: string;
    };
    emergencyContacts?: Array<{
      name?: string;
      phone?: string;
      relation?: string;
    }>;
    areaName?: string;
  };
  roles?: string[];
  avatarUrl?: string;
  authority?: {
    organizationName?: string;
    areaName?: string;
    position?: string;
    department?: string;
  };
}

export interface ChatMessageItem {
  _id: string;
  senderId: ChatSender | string;
  senderName: string;
  senderRole: string;
  recipientId?: ChatSender | string | null;
  channel: string;
  content: string;
  attachments?: ChatAttachment[];
  sosRequestId?: any;
  sosData?: any;
  readBy?: string[];
  createdAt: string;
}

export interface ChatConversationItem {
  type: 'CHANNEL' | 'DIRECT';
  channel: string;
  partnerId?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  avatarUrl?: string;
  role: 'ADMIN' | 'LOCAL_AUTHORITY' | 'CITIZEN' | 'ALL';
  areaName?: string;
  position?: string;
  unreadCount: number;
  partnerUser?: any;
  latestMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
}

export interface CitizenProfileInfo {
  _id: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  avatarUrl?: string;
  roles?: string[];
  gender?: string;
  dateOfBirth?: string;
  createdAt?: string;
  totalSosCount?: number;
  emergencyContact?: {
    name?: string;
    phone?: string;
    relation?: string;
    address?: string;
  } | null;
  emergencyContacts?: Array<{
    name?: string;
    phone?: string;
    relation?: string;
    address?: string;
  }>;
  latestSos?: {
    _id: string;
    sosCode: string;
    status: string;
    emergencyType: string;
    emergencyTypes?: string[];
    priority?: string;
    people: number;
    address: string;
    location?: {
      coordinates: [number, number];
    };
    contactPhone?: string;
    secondaryPhone?: string;
    description?: string;
    images?: string[];
    createdAt?: string;
  } | null;
}

export type ChatSSEPayload =
  | { action: 'NEW_MESSAGE'; data: ChatMessageItem }
  | { action: 'MESSAGES_READ'; data: { channel: string; readerId: string } };
