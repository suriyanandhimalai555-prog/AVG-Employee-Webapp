import { Queue } from 'bullmq';
// Import the configured Redis client for queue communication
import redis from '../../config/redis';

// Define a TypeScript interface to enforce the data structure for attendance jobs in the queue
export interface AttendanceJobData {
  // Store the unique ID of the user whose attendance is being processed
  userId: string;
  // Store the unique ID of the branch the user is tied to
  branchId: string;
  // Specify the date in YYYY-MM-DD format for attendance record creation
  date: string;
  // Specify the mode of attendance as either 'office' or 'field'
  mode: 'office' | 'field';
  // Define the resulting attendance status for the user
  status: 'present' | 'half_day' | 'absent';
  // Use a string ISO timestamp for the specific check-in time
  checkInTime: string;
  // Optional latitude for location verification in office mode
  checkInLat?: number;
  // Optional longitude for location verification in office mode
  checkInLng?: number;
  // Optional reference to a photo key in AWS S3 for field verification
  photoKey?: string;
  // Optional note explaining details for field attendance
  fieldNote?: string;
  // Store the ID of the user who performed the marking action
  markedBy: string;
  // A boolean flag to indicate whether the action was performed by an administrator
  markedByAdmin: boolean;
  // Optional target user ID if the submission was made on behalf of another user
  targetUserId?: string;
}

// Initialize a new BullMQ Queue named 'attendance' for background processing tasks
export const attendanceQueue = new Queue<AttendanceJobData>('attendance', {
  // Use the shared Redis client configuration to manage the queue connection
  connection: redis,
  // Define default job behavior including retries and backoff strategies
  defaultJobOptions: {
    // Retry the attendance processing job up to 3 times on failure
    attempts: 3,
    // Use an exponential backoff pattern to wait 2 seconds between retry attempts
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    // Keep a maximum of 100 successful job records in the queue log
    removeOnComplete: 100,
    // Keep a maximum of 500 failed job records for auditing and debugging
    removeOnFail: 500,
  },
});

// Define an asynchronous function to add a new attendance job to the queue
export const addAttendanceJob = async (data: AttendanceJobData): Promise<void> => {
  // Push the attendance data into the queue with a specific job name 'mark-attendance'
  await attendanceQueue.add('mark-attendance', data);
  // Log the action to the console for tracking and monitoring purposes
  console.log(`✅ Job queued for user: ${data.userId}`);
};

// Define an asynchronous function to capture and return real-time metrics of the queue
export const getQueueStatus = async (): Promise<object> => {
  // Fetch current totals for waiting, active, completed, and failed jobs
  return await attendanceQueue.getJobCounts();
};

// Export the queue instance as the default export for use in the background worker service
export default attendanceQueue;
