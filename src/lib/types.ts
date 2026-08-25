// 백엔드 API 타입 정의 (API 문서 기준)

export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Exhibition {
  id: string;
  slug: string;
  defaultDomain: string | null;
  customDomain: string | null;
  name: string;
  description: string | null;
  logoMediaId: string | null;
  bannerEnabled: boolean;
  bannerMediaId: string | null;
  popupEnabled: boolean;
  popupImageMediaId: string | null;
  popupUrl: string | null;
  introTitle: string | null;
  introDescription: string | null;
  introVideoMediaId: string | null;
}

export interface Category {
  id: string;
  exhibitionId: string;
  slug: string;
  name: string;
}

export interface Item {
  id: string;
  exhibitionId: string;
  categoryId: string;
  eventPeriodId: string | null;
  title: string;
  description: string | null;
  participantNames: string | null;
  participantEmails: string | null;
  advisorNames: string | null;
  thumbnailMediaId: string | null;
  posterMediaId: string | null;
  presentationVideoMediaId: string | null;
  awarded: boolean;
  likes: number;
  isLike: boolean;
}

export interface EventPeriod {
  id: string;
  exhibitionId: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface BoardPost {
  id: string;
  exhibitionId: string;
  title: string;
  content: string;
  attachmentMediaIds: string[];
  attachmentMedias: { id: string; fileName: string }[];
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Me {
  name: string;
  role: string;
  email: string;
  department: string | null;
  phoneNumber: string | null;
  studentNumber: string | null;
  registrationCompleted: boolean;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  registrationRequired: boolean;
}

export interface BulkUploadResult {
  createdItems: number;
  createdMediaAssets: number;
  createdClassificationMappings: number;
}

