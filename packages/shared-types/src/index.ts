// shared-types/src/index.ts

// Define standard roles used across the entire workforce management platform
export type Role = 'md' | 'director' | 'gm' | 'super_admin' | 'hr_manager' | 'branch_admin' | 'employee' | 'client';

// Define the core user profile object used in session management and UI display
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchId: string;
  hasSmartphone: boolean;
}

// Define the mode of attendance check-in
export type AttendanceMode = 'office' | 'field';

// Define the possible statuses for an attendance record
export type AttendanceStatus = 'present' | 'half_day' | 'absent' | 'not_marked';

// Interface for a single attendance record, matching the database row structure
export interface AttendanceRecord {
  id: string;
  userId: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  mode: AttendanceMode;
  status: AttendanceStatus;
  checkInTime: string; // ISO string
  checkInLat?: number;
  checkInLng?: number;
  photoKey?: string;
  fieldNote?: string;
  markedBy: string;
  submittedAt: string; // ISO string
}

// Interface for aggregated attendance statistics (used in reporting/dashboard)
export interface AttendanceSummary {
  present: number;
  half_day: number;
  absent: number;
  field: number;
  office: number;
  notMarked: number;
  totalEmployees: number;
}
