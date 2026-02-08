// Warning-related types and interfaces

export interface Warning {
  id: string;
  userId: string;
  title: string;
  message: string;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userFullName?: string;
  userEmail?: string | null;
}

export interface PaginatedWarningsResponse {
  items: Warning[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
