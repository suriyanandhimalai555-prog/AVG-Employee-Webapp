// frontend/src/store/slices/authSlice.js
import { createSlice } from '@reduxjs/toolkit';
import { apiSlice } from '../api/apiSlice';

// Hydrate from localStorage on app start
const storedToken = localStorage.getItem('token');
const storedUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
})();

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser,
    token: storedToken,
  },
  reducers: {
    // Called after a successful login mutation
    setCredentials: (state, action) => {
      const { user, token } = action.payload;
      state.user = user;
      state.token = token;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    // Clear everything on logout
    clearCredentials: (state) => {
      state.user = null;
      state.token = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
  extraReducers: (builder) => {
    // When getMe succeeds, update the user profile (keeps it fresh)
    builder.addMatcher(
      apiSlice.endpoints.getMe.matchFulfilled,
      (state, action) => {
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      }
    );
    // If getMe fails (401), clear credentials
    builder.addMatcher(
      apiSlice.endpoints.getMe.matchRejected,
      (state) => {
        state.user = null;
        state.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    );
  },
});

export const { setCredentials, clearCredentials } = authSlice.actions;

export const selectCurrentUser = (state) => state.auth.user;
export const selectCurrentToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) => !!state.auth.token;

export default authSlice.reducer;
