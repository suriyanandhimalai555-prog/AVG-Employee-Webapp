/**
 * useAttendanceSocket
 *
 * Maintains a persistent Socket.io connection for the authenticated user.
 * When the worker finishes writing attendance to the DB, it publishes a
 * Redis pub/sub event → the API relays it via Socket.io to this user's room
 * → this hook invalidates the RTK Query cache so the UI updates automatically.
 *
 * Replaces the 3-second setTimeout polling hack in useCheckIn.
 */
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { apiSlice } from '../../../store/api/apiSlice';
import { selectCurrentToken } from '../../../store/slices/authSlice';

// Strip the '/api' suffix to reach the base server URL where Socket.io is mounted
const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');

export const useAttendanceSocket = () => {
  const dispatch = useDispatch();
  const token = useSelector(selectCurrentToken);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      // Send JWT in handshake so the server can authenticate before accepting the connection
      auth: { token },
      // Start with polling so the handshake works through Railway's reverse proxy;
      // Socket.io upgrades to WebSocket automatically once the connection is established.
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    // When the worker confirms attendance was persisted to the DB,
    // force RTK Query to refetch the relevant queries for this user.
    // 'Employees' is included so the branch admin panel reflects the new record.
    socket.on('attendance:confirmed', () => {
      dispatch(apiSlice.util.invalidateTags(['Summary', 'Attendance', 'Employees']));
    });

    // Teardown: disconnect when the component unmounts or the token changes
    return () => {
      socket.disconnect();
    };
  }, [token, dispatch]);
};
