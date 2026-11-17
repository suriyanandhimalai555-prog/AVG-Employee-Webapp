// frontend/src/store/api/apiSlice.js
//
// Barrel for the RTK Query layer. Components keep importing every hook from here:
//   import { useGetGoldMembersQuery } from '../../store/api/apiSlice';
//
// The API instance lives in ./baseApi.js; endpoints live in ./endpoints/<domain>Api.js
// and are injected into that one instance. Importing this file loads every domain, so
// the store, authSlice matchers and apiSlice.util all see the full endpoint set.
//
// Adding an endpoint: put it in the matching ./endpoints file and add its hook to that
// file's export list. New domain: create ./endpoints/<name>Api.js and add a line below.
export { apiSlice } from './baseApi';

export * from './endpoints/authApi';
export * from './endpoints/attendanceApi';
export * from './endpoints/adminApi';
export * from './endpoints/branchesApi';
export * from './endpoints/moneyApi';
export * from './endpoints/goldApi';
export * from './endpoints/incentivesApi';
export * from './endpoints/tradingAcademyApi';
export * from './endpoints/goldCoinApi';
export * from './endpoints/lssApi';
export * from './endpoints/schemesApi';
export * from './endpoints/customersApi';
export * from './endpoints/salariesApi';
export * from './endpoints/usersApi';
export * from './endpoints/chitApi';
export * from './endpoints/buildersApi';
export * from './endpoints/landApi';
export * from './endpoints/settingsApi';
export * from './endpoints/reconciliationApi';
export * from './endpoints/pendingEnrollmentsApi';
