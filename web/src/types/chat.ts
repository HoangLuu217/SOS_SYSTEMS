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
  role: 'ADMIN' | 'LOCAL_AUTHORITY' | 'ALL';
  areaName?: string;
  position?: string;
  unreadCount: number;
  latestMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
}

export type ChatSSEPayload =
  | { action: 'NEW_MESSAGE'; data: ChatMessageItem }
  | { action: 'MESSAGES_READ'; data: { channel: string; readerId: string } };
